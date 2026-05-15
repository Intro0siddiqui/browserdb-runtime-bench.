import { BrowserDB } from "./db.ts";
import { join, fromFileUrl, dirname } from "https://deno.land/std/path/mod.ts";

const BDB_PATH = "test_wal_recovery_deno";
const TARGET_ITERATION = 5000;

async function cleanup() {
    try {
        await Deno.remove(BDB_PATH, { recursive: true });
    } catch (_) {}
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
    await Deno.writeTextFile("get_hash_deno.rs", rustCode);
    const compile = new Deno.Command("rustc", { args: ["get_hash_deno.rs"] });
    await compile.output();
    const run = new Deno.Command("./get_hash_deno", { args: [url] });
    const { stdout } = await run.output();
    const out = new TextDecoder().decode(stdout).trim().split(" ");
    const hLow = BigInt(out[0]);
    const hHigh = BigInt(out[1]);
    await Deno.remove("get_hash_deno.rs");
    await Deno.remove("get_hash_deno");
    return { low: hLow, high: hHigh };
}

async function runTest() {
    await cleanup();
    console.log("Setting up Deno Test 1: Kill -9 Recovery...");

    await Deno.mkdir(BDB_PATH, { recursive: true });

    const command = new Deno.Command(Deno.execPath(), {
        args: ["run", "-A", "--unstable-ffi", "src/deno/test1_worker.ts"],
        stdout: "piped",
        stderr: "piped",
    });

    const child = command.spawn();

    let killed = false;
    let lastCount = 0;

    const reader = child.stdout.getReader();
    const decoder = new TextDecoder();

    (async () => {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const lines = decoder.decode(value).trim().split("\n");
            for (const line of lines) {
                const count = parseInt(line);
                if (!isNaN(count)) {
                    lastCount = count;
                    if (count >= TARGET_ITERATION && !killed) {
                        console.log(`Reached ${count} inserts. Sending SIGKILL...`);
                        child.kill("SIGKILL");
                        killed = true;
                    }
                }
            }
        }
    })();

    const { signal } = await child.status;
    console.log(`Worker killed with signal: ${signal} at count ${lastCount}`);

    await new Promise(r => setTimeout(r, 1000));

    console.log("\nRestarting BrowserDB for recovery audit...");

    const bdb = new BrowserDB(BDB_PATH);

    const hashLast = await getHash(`https://test.com/path/${lastCount}`);
    const titleLast = bdb.getTitle(hashLast.low, hashLast.high);

    console.log(`Last committed Key #${lastCount}: ${titleLast ? "FOUND (" + titleLast + ")" : "MISSING"}`);

    console.log(`\nRandom sampling 10 keys from first ${lastCount}...`);
    let successCount = 0;
    for (let i = 0; i < 10; i++) {
        const randIdx = Math.floor(Math.random() * lastCount) + 1;
        const hash = await getHash(`https://test.com/path/${randIdx}`);
        const title = bdb.getTitle(hash.low, hash.high);
        if (title === `Title ${randIdx}`) {
            successCount++;
        } else {
            console.error(`Sample failed for Key #${randIdx}: expected Title ${randIdx}, got ${title}`);
        }
    }
    console.log(`Sampling Success: ${successCount}/10`);

    bdb.close();

    if (successCount >= 9) {
        console.log("\nSUCCESS: Deno recovered entries correctly (consistency maintained).");
    } else {
        console.log("\nFAILURE: Deno WAL Recovery failed audit.");
    }

    await cleanup();
}

runTest().catch(console.error);
