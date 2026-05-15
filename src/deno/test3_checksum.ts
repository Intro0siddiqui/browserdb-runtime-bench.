import { BrowserDB } from "./db.ts";
import { join } from "https://deno.land/std/path/mod.ts";

const BDB_PATH = "test_checksum_deno";

async function cleanup() {
    try { await Deno.remove(BDB_PATH, { recursive: true }); } catch (_) {}
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
            let args: Vec<String> = std::env::args().collect();
            let h = calculate_hash(&args[1]);
            println!("{} {}", h & 0xFFFFFFFFFFFFFFFF, h >> 64);
        }
    `;
    await Deno.writeTextFile("get_hash_cs_deno.rs", rustCode);
    await new Deno.Command("rustc", { args: ["get_hash_cs_deno.rs"] }).output();
    const { stdout } = await new Deno.Command("./get_hash_cs_deno", { args: [url] }).output();
    const out = new TextDecoder().decode(stdout).trim().split(" ");
    await Deno.remove("get_hash_cs_deno.rs");
    await Deno.remove("get_hash_cs_deno");
    return { low: BigInt(out[0]), high: BigInt(out[1]) };
}

async function runChecksumTest() {
    await cleanup();
    await Deno.mkdir(BDB_PATH);

    const config = `
[lsm_tree]
max_memtable_size_mb = 1
`;
    await Deno.writeTextFile(join(BDB_PATH, "browserdb.toml"), config);

    const bdb = new BrowserDB(BDB_PATH);
    console.log("Writing data to trigger SSTable flush...");
    for (let i = 0; i < 2000; i++) {
        bdb.insertHistory(`https://test.com/checksum/${i}`, "A".repeat(500) + i, 1);
    }
    bdb.close();

    let sstPath = "";
    for await (const entry of Deno.readDir(BDB_PATH)) {
        if (entry.name.endsWith(".sst")) {
            sstPath = join(BDB_PATH, entry.name);
            break;
        }
    }
    if (!sstPath) throw new Error("No SSTable found!");

    const testKey = "https://test.com/checksum/1000";
    const h = await getHash(testKey);

    console.log("Sabotaging SSTable (extensive corruption)...");
    const buffer = await Deno.readFile(sstPath);
    for (let i = 128; i < 4096 + 128; i++) {
        if (i < buffer.length) buffer[i] ^= 0xAA;
    }
    await Deno.writeFile(sstPath, buffer);

    console.log("Attempting to retrieve data via Deno after sabotage...");
    try {
        const bdb3 = new BrowserDB(BDB_PATH);
        const titleAfter = bdb3.getTitle(h.low, h.high);
        if (titleAfter === null) {
            console.log("SUCCESS: Deno received null (Checksum protected).");
        } else {
            console.log("FAILURE: Deno received data despite corruption!");
        }
        bdb3.close();
    } catch (e) {
        console.log(`SUCCESS: Deno handled the abort/error: ${e}`);
    }

    await cleanup();
}

runChecksumTest().catch(console.error);
