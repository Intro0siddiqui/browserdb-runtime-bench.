import { dlopen, FFIType, suffix } from "bun:ffi";
import { join } from "path";

const libPath = join(import.meta.dir, "../../browser-db-core/bindings/target/release/libbrowserdb." + suffix);

const { symbols } = dlopen(libPath, {
    browserdb_open: {
        args: [FFIType.cstring],
        returns: FFIType.ptr,
    },
    browserdb_close: {
        args: [FFIType.ptr],
        returns: FFIType.void,
    },
    browserdb_history_insert: {
        args: [FFIType.ptr, FFIType.cstring, FFIType.cstring, FFIType.u32],
        returns: FFIType.i32,
    },
    browserdb_history_get_title: {
        args: [FFIType.ptr, FFIType.u64, FFIType.u64],
        returns: FFIType.ptr,
    },
    browserdb_free_string: {
        args: [FFIType.ptr],
        returns: FFIType.void,
    }
});

export class BrowserDB {
    private ptr: number | null;

    constructor(path: string) {
        const pathPtr = Buffer.from(path + "\0");
        this.ptr = symbols.browserdb_open(pathPtr);
        if (!this.ptr) {
            throw new Error(`Failed to open BrowserDB at ${path}`);
        }
    }

    close() {
        if (this.ptr) {
            symbols.browserdb_close(this.ptr);
            this.ptr = null;
        }
    }

    insertHistory(url: string, title: string, visitCount: number): number {
        if (!this.ptr) throw new Error("DB is closed");

        const urlPtr = Buffer.from(url + "\0");
        const titlePtr = Buffer.from(title + "\0");

        return symbols.browserdb_history_insert(this.ptr, urlPtr, titlePtr, visitCount);
    }

    getTitle(urlHashLow: bigint, urlHashHigh: bigint): string | null {
        if (!this.ptr) throw new Error("DB is closed");

        const strPtr = symbols.browserdb_history_get_title(this.ptr, urlHashLow, urlHashHigh);
        if (!strPtr) return null;

        const result = new Bun.FFI.CString(strPtr).toString();
        symbols.browserdb_free_string(strPtr);
        return result;
    }
}
