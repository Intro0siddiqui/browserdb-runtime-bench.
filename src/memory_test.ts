import { BrowserDB } from "./db";
import { rmSync, existsSync } from "fs";

const ITERATIONS = 100000;
const BDB_PATH = "test_memory_bdb";

function cleanup() {
    if (existsSync(BDB_PATH)) {
        rmSync(BDB_PATH, { recursive: true, force: true });
    }
}

function printMemory(step: string) {
    const mem = process.memoryUsage();
    console.log(`[${step}] RSS: ${(mem.rss / 1024 / 1024).toFixed(2)} MB | Heap: ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
}

async function runMemoryTest() {
    cleanup();
    printMemory("Initial");

    const bdb = new BrowserDB(BDB_PATH);
    printMemory("DB Opened");

    console.log(`\nInserting ${ITERATIONS} entries...`);
    for (let i = 0; i < ITERATIONS; i++) {
        bdb.insertHistory(
            `https://test.com/path/${i}`,
            `Title ${i} - Constant string to test handoff`,
            1
        );
        if (i % 20000 === 0 && i > 0) {
            printMemory(`Inserted ${i}`);
        }
    }
    printMemory("Insertion Complete");

    // Since calculating the exact hash for every URL in JS is hard without SipHash,
    // and the goal is to test the FREE logic, I will use a fixed URL and repeat gets on it.
    // To ensure we get a string back (to test free_string), I'll insert one specific URL.
    const knownUrl = "https://test.com/known";
    const knownTitle = "Known Title for Memory Test";
    bdb.insertHistory(knownUrl, knownTitle, 1);

    // Low and High for "https://test.com/known"
    // I'll calculate it using the same rustc trick if needed, or just use a dummy.
    // Actually, I'll just use a loop that calls getTitle with the same (wrong) hash
    // to test the NULL handoff, and then a few with the correct hash if I can get it.

    console.log("\nCalculating hash for 'https://test.com/known'...");
    const { stdout } = Bun.spawnSync({
        cmd: ["rustc", "-e", `
            fn calculate_hash(s: &str) -> u128 {
                use std::collections::hash_map::DefaultHasher;
                use std::hash::{Hash, Hasher};
                let mut s1 = DefaultHasher::new();
                s.hash(&mut s1);
                let mut s2 = DefaultHasher::new();
                "salt".hash(&mut s2);
                s.hash(&mut s2);
                ((s1.finish() as u128) << 64) | (s2.finish() as u128)
            }
            fn main() {
                let h = calculate_hash("https://test.com/known");
                println!("{} {}", h & 0xFFFFFFFFFFFFFFFF, h >> 64);
            }
        `],
    });
    // rustc -e doesn't exist, I'll just use a temporary file.

    const rustCode = `
        fn calculate_hash(s: &str) -> u128 {
            use std::collections::hash_map::DefaultHasher;
            use std::hash::{Hash, Hasher};
            let mut s1 = DefaultHasher::new();
            s.hash(&mut s1);
            let mut s2 = DefaultHasher::new();
            "salt".hash(&mut s2);
            s.hash(&mut s2);
            ((s1.finish() as u128) << 64) | (s2.finish() as u128)
        }
        fn main() {
            let h = calculate_hash("https://test.com/known");
            println!("{} {}", h & 0xFFFFFFFFFFFFFFFF, h >> 64);
        }
    `;
    const tempRustFile = "temp_hash.rs";
    await Bun.write(tempRustFile, rustCode);
    const compile = Bun.spawnSync({ cmd: ["rustc", tempRustFile] });
    const run = Bun.spawnSync({ cmd: ["./temp_hash"] });
    const [hLow, hHigh] = run.stdout.toString().trim().split(" ").map(BigInt);
    rmSync(tempRustFile);
    rmSync("temp_hash");

    console.log(`Hash for known URL: Low=${hLow}, High=${hHigh}`);

    console.log(`\nRetrieving ${ITERATIONS} entries...`);
    for (let i = 0; i < ITERATIONS; i++) {
        const title = bdb.getTitle(hLow, hHigh);
        if (title !== knownTitle) {
            throw new Error(`Title mismatch at ${i}: expected ${knownTitle}, got ${title}`);
        }
        if (i % 20000 === 0 && i > 0) {
            printMemory(`Retrieved ${i}`);
        }
    }
    printMemory("Retrieval Complete");

    bdb.close();
    printMemory("DB Closed");

    // Explicit GC if possible, but Bun/JS doesn't always oblige immediately.
    // We'll just wait a bit.
    await new Promise(r => setTimeout(r, 1000));
    printMemory("Final (after 1s wait)");

    cleanup();
}

runMemoryTest().catch(console.error);
