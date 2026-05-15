import { BrowserDB } from "./db.ts";

const ITERATIONS = 1000000;
const BDB_PATH = "test_leak_bdb_deno";

async function cleanup() {
    try {
        await Deno.remove(BDB_PATH, { recursive: true });
    } catch (_) {}
}

function printMemory(step: string) {
    const mem = Deno.memoryUsage();
    console.log(`[${step}] RSS: ${(mem.rss / 1024 / 1024).toFixed(2)} MB`);
}

async function getHash(url: string) {
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
            let h = calculate_hash("https://test.com/hot");
            println!("{} {}", h & 0xFFFFFFFFFFFFFFFF, h >> 64);
        }
    `;
    await Deno.writeTextFile("get_hash_leak_deno.rs", rustCode);
    const compile = new Deno.Command("rustc", { args: ["get_hash_leak_deno.rs"] });
    await compile.output();
    const run = new Deno.Command("./get_hash_leak_deno");
    const { stdout } = await run.output();
    const out = new TextDecoder().decode(stdout).trim().split(" ");
    await Deno.remove("get_hash_leak_deno.rs");
    await Deno.remove("get_hash_leak_deno");
    return { low: BigInt(out[0]), high: BigInt(out[1]) };
}

async function runLeakTest() {
    await cleanup();
    printMemory("Initial");

    const bdb = new BrowserDB(BDB_PATH);
    const url = "https://test.com/hot";
    bdb.insertHistory(url, "Hot Title Content", 1);

    const hash = await getHash(url);

    console.log(`Starting 1,000,000 calls to getTitle in Deno...`);
    for (let i = 1; i <= ITERATIONS; i++) {
        const _t = bdb.getTitle(hash.low, hash.high);
        if (i % 100000 === 0) {
            printMemory(`Iter ${i}`);
        }
    }

    printMemory("Final before close");
    bdb.close();
    await cleanup();
}

runLeakTest().catch(console.error);
