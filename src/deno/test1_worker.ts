import { BrowserDB } from "./db.ts";

const BDB_PATH = "test_wal_recovery_deno";

const bdb = new BrowserDB(BDB_PATH);

async function run() {
    for (let i = 1; i <= 10000; i++) {
        bdb.insertHistory(`https://test.com/path/${i}`, `Title ${i}`, 1);
        if (i % 100 === 0) {
            await Deno.stdout.write(new TextEncoder().encode(`${i}\n`));
            await new Promise(r => setTimeout(r, 20));
        }
    }
    bdb.close();
}

run();
