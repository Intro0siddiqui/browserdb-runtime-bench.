# BrowserDB Integration & Industrial Stress Suite

This repository contains the TypeScript/JavaScript integration for the BrowserDB Rust storage engine, along with a comprehensive benchmarking and audit suite for both **Bun** and **Deno** runtimes.

## 🚀 Quick Start

### 1. Prerequisites
- **Bun** (v1.2.14+)
- **Deno** (v2.1.10+)
- **Rust/Cargo** (for compiling the core)

### 2. Compile the Native Library
Before running any scripts, you must compile the BrowserDB shared library:
```bash
cd browser-db-core/bindings
cargo build --release
cd ../..
```
The compiled library will be located in `browser-db-core/bindings/target/release/libbrowserdb.so` (on Linux).

---

## 📊 Benchmarking

### Bun Benchmark
Compare BrowserDB's FFI performance directly against Bun's native `bun:sqlite`.
```bash
bun run src/bun/benchmark.ts
```

### Deno Benchmark
Verify performance parity in the Deno environment.
```bash
deno run -A --unstable-ffi src/deno/benchmark.ts
```

---

## 🛡️ Audit Suite (Industrial Stress Tests)

### 1. Memory Stability (1-Million Call Leak Test)
Stresses the FFI bridge and `browserdb_free_string` logic by performing 1,000,000 `getTitle` operations.
- **Bun:** `bun run src/bun/memory_test.ts`
- **Deno:** `deno run -A --unstable-ffi src/deno/test2_leak.ts`

### 2. Crash Resilience (Kill -9 Recovery)
Spawns a worker, performs writes, and kills it with `SIGKILL` to verify WAL replay and database consistency.
- **Deno:** `deno run -A --unstable-ffi src/deno/test1_crash.ts`

### 3. Data Integrity (Bit-Flip Audit)
Manually sabotages SSTables on disk to verify that the 4KB Block Checksums prevent corrupted data from being returned.
- **Deno:** `deno run -A --unstable-ffi src/deno/test3_checksum.ts`

---

## 📝 Audit Findings Summary

| Metric | Findings |
| :--- | :--- |
| **Performance** | BrowserDB is **~50x faster** than SQLite individual inserts across both runtimes. |
| **Memory Stability** | **Flat RSS Graph.** No leaks detected over 1,000,000 FFI calls. |
| **Crash Recovery** | **Consistent.** WAL replayed correctly after hard `SIGKILL`. (Note: ~5ms sync window). |
| **Data Integrity** | **Fail-Fast.** The engine correctly aborts/halts upon detecting checksum mismatches. |

## 🛠️ Project Structure
- `src/bun/`: Bun-specific FFI wrappers and tests.
- `src/deno/`: Deno-specific FFI wrappers and tests.
- `browser-db-core/`: The core Rust engine (submodule/cloned).
