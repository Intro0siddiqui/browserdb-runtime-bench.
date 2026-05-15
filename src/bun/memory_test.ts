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

    const knownUrl = "https://test.com/known";
    const knownTitle = "Known Title for Memory Test";
    bdb.insertHistory(knownUrl, knownTitle, 1);

    console.log("\nCalculating hash for 'https://test.com/known'...");
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
    const { writeFileSync, spawnSync } = require("child_process");
    const fs = require("fs");
    fs.writeFileSync(tempRustFile, rustCode);
    spawnSync("rustc", [tempRustFile]);
    const run = spawnSync("./temp_hash");
    const [hLow, hHigh] = run.stdout.toString().trim().split(" ").map(BigInt);
    fs.unlinkSync(tempRustFile);
    fs.unlinkSync("temp_hash");

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

    await new Promise(r => setTimeout(r, 1000));
    printMemory("Final (after 1s wait)");

    cleanup();
}

runMemoryTest().catch(console.error);
