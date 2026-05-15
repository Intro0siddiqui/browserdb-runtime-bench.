import { join, fromFileUrl, dirname } from "https://deno.land/std/path/mod.ts";

const currentDir = dirname(fromFileUrl(import.meta.url));
let suffix = "so";
if (Deno.build.os === "windows") suffix = "dll";
if (Deno.build.os === "darwin") suffix = "dylib";

const libPath = join(currentDir, "../../browser-db-core/bindings/target/release/libbrowserdb." + suffix);

const lib = Deno.dlopen(libPath, {
    browserdb_open: {
        parameters: ["buffer"],
        result: "pointer",
    },
    browserdb_close: {
        parameters: ["pointer"],
        result: "void",
    },
    browserdb_history_insert: {
        parameters: ["pointer", "buffer", "buffer", "u32"],
        result: "i32",
    },
    browserdb_history_get_title: {
        parameters: ["pointer", "u64", "u64"],
        result: "pointer",
    },
    browserdb_free_string: {
        parameters: ["pointer"],
        result: "void",
    }
});

const encoder = new TextEncoder();

export class BrowserDB {
    private ptr: Deno.PointerValue | null;

    constructor(path: string) {
        const pathPtr = encoder.encode(path + "\0");
        this.ptr = lib.symbols.browserdb_open(pathPtr);
        if (!this.ptr) {
            throw new Error(`Failed to open BrowserDB at ${path}`);
        }
    }

    close() {
        if (this.ptr) {
            lib.symbols.browserdb_close(this.ptr);
            this.ptr = null;
        }
    }

    insertHistory(url: string, title: string, visitCount: number): number {
        if (!this.ptr) throw new Error("DB is closed");

        const urlPtr = encoder.encode(url + "\0");
        const titlePtr = encoder.encode(title + "\0");

        return lib.symbols.browserdb_history_insert(this.ptr, urlPtr, titlePtr, visitCount);
    }

    getTitle(urlHashLow: bigint, urlHashHigh: bigint): string | null {
        if (!this.ptr) throw new Error("DB is closed");

        const strPtr = lib.symbols.browserdb_history_get_title(this.ptr, urlHashLow, urlHashHigh);
        if (!strPtr) return null;

        const result = new Deno.UnsafePointerView(strPtr).getCString();
        lib.symbols.browserdb_free_string(strPtr);
        return result;
    }
}
