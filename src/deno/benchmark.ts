import { BrowserDB } from "./db.ts";
import { join } from "https://deno.land/std/path/mod.ts";

const ITERATIONS = 10000;
const BDB_PATH = "test_bdb_deno_bench";

async function cleanup() {
    try { await Deno.remove(BDB_PATH, { recursive: true }); } catch (_) {}
}

async function runBenchmark() {
    await cleanup();

    console.log(`Starting Deno Performance Parity Bench: ${ITERATIONS} iterations\n`);

    // --- BrowserDB Setup ---
    const bdb = new BrowserDB(BDB_PATH);

    // --- Test: BrowserDB Individual Inserts ---
    console.log("Running BrowserDB Individual Inserts in Deno...");
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
        bdb.insertHistory(
            `https://test.com/path/${i}`,
            `Title ${i}`,
            1
        );
    }
    const end = performance.now();
    const duration = end - start;
    console.log(`BrowserDB Finished: ${duration.toFixed(2)}ms\n`);

    // --- Test 2: Large Blob FFI Insertion ---
    console.log("Running Large Blob FFI Insertion (100KB) in Deno...");
    const largeBlob = "A".repeat(100 * 1024);
    const blobUrl = "https://test.com/large-blob";

    const startBlob = performance.now();
    bdb.insertHistory(blobUrl, largeBlob, 1);
    const endBlob = performance.now();

    console.log(`BrowserDB Large Blob: ${(endBlob - startBlob).toFixed(2)}ms\n`);

    bdb.close();
    await cleanup();

    console.log("--- Summary ---");
    console.log(`BrowserDB (Individual): ${duration.toFixed(2)}ms`);
}

runBenchmark().catch(console.error);
