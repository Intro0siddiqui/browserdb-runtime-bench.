import { Database } from "bun:sqlite";
import { BrowserDB } from "./db";
import { rmSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const ITERATIONS = 10000;
const BDB_PATH = "test_bdb_data";
const SQLITE_PATH = "test_sqlite.db";

// Cleanup before start
function cleanup() {
    if (existsSync(BDB_PATH)) {
        rmSync(BDB_PATH, { recursive: true, force: true });
    }
    if (existsSync(SQLITE_PATH)) {
        rmSync(SQLITE_PATH, { force: true });
    }
    // Also cleanup SQLite WAL files
    const walFile = `${SQLITE_PATH}-wal`;
    const shmFile = `${SQLITE_PATH}-shm`;
    if (existsSync(walFile)) rmSync(walFile, { force: true });
    if (existsSync(shmFile)) rmSync(shmFile, { force: true });
}

async function runBenchmark() {
    cleanup();

    console.log(`Starting Benchmark: ${ITERATIONS} iterations\n`);

    // --- SQLite Setup ---
    const sqlite = new Database(SQLITE_PATH);
    sqlite.run("PRAGMA journal_mode = WAL;");
    sqlite.run("CREATE TABLE history (url TEXT PRIMARY KEY, title TEXT, timestamp INTEGER);");
    const sqliteInsert = sqlite.prepare("INSERT INTO history (url, title, timestamp) VALUES ($url, $title, $timestamp)");

    // --- BrowserDB Setup ---
    const bdb = new BrowserDB(BDB_PATH);

    // --- Test A: SQLite Individual Inserts ---
    console.log("Running Test A: SQLite Individual Inserts...");
    const startA = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
        sqliteInsert.run({
            $url: `https://test.com/path/${i}`,
            $title: `Title ${i}`,
            $timestamp: Date.now()
        });
    }
    const endA = performance.now();
    const durationA = endA - startA;
    console.log(`Test A Finished: ${durationA.toFixed(2)}ms\n`);

    // Reset SQLite for Test B (or just clear table)
    sqlite.run("DELETE FROM history;");

    // --- Test B: SQLite Transaction Inserts ---
    console.log("Running Test B: SQLite Transaction Inserts...");
    const startB = performance.now();
    const transaction = sqlite.transaction((data) => {
        for (const item of data) {
            sqliteInsert.run(item);
        }
    });

    const dataB = [];
    for (let i = 0; i < ITERATIONS; i++) {
        dataB.push({
            $url: `https://test.com/path/${i}`,
            $title: `Title ${i}`,
            $timestamp: Date.now()
        });
    }
    transaction(dataB);
    const endB = performance.now();
    const durationB = endB - startB;
    console.log(`Test B Finished: ${durationB.toFixed(2)}ms\n`);

    // --- Test C: BrowserDB Individual Inserts ---
    console.log("Running Test C: BrowserDB Individual Inserts...");
    const startC = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
        bdb.insertHistory(
            `https://test.com/path/${i}`,
            `Title ${i}`,
            1
        );
    }
    const endC = performance.now();
    const durationC = endC - startC;
    console.log(`Test C Finished: ${durationC.toFixed(2)}ms\n`);

    // --- Test 2: Large Blob FFI Insertion ---
    console.log("Running Test 2: Large Blob FFI Insertion (100KB)...");
    const largeBlob = "A".repeat(100 * 1024);
    const blobUrl = "https://test.com/large-blob";

    // SQLite Blob
    const startBlobSqlite = performance.now();
    sqliteInsert.run({
        $url: blobUrl,
        $title: largeBlob,
        $timestamp: Date.now()
    });
    const endBlobSqlite = performance.now();

    // BrowserDB Blob
    const startBlobBdb = performance.now();
    bdb.insertHistory(blobUrl, largeBlob, 1);
    const endBlobBdb = performance.now();

    console.log(`SQLite Large Blob: ${(endBlobSqlite - startBlobSqlite).toFixed(2)}ms`);
    console.log(`BrowserDB Large Blob: ${(endBlobBdb - startBlobBdb).toFixed(2)}ms\n`);

    // --- Results Summary ---
    console.log("--- Summary ---");
    console.log(`SQLite (Individual): ${durationA.toFixed(2)}ms`);
    console.log(`SQLite (Transaction): ${durationB.toFixed(2)}ms`);
    console.log(`BrowserDB (Individual): ${durationC.toFixed(2)}ms`);

    // Cleanup
    sqlite.close();
    bdb.close();
    cleanup();
}

runBenchmark().catch(console.error);
