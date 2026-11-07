import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { createSqliteStore } from "../src/sqlite-store.js";
import { isSharedStore, keys, StoreError } from "../src/store.js";

const dirs: string[] = [];
const stores: ReturnType<typeof createSqliteStore>[] = [];
const key = keys.claim("0x0000000000000000000000000000000000000001", 1n);
function open(file?: string, now?: () => number) {
  if (!file) { const dir = mkdtempSync(join(tmpdir(), "santa-sqlite-")); dirs.push(dir); file = join(dir, "store.sqlite"); }
  const store = createSqliteStore(file, now); stores.push(store); return { store, file };
}
afterEach(() => { for (const store of stores.splice(0)) store.close(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true }); });

describe("persistent SQLite store", () => {
  it("serializes counters across separate server processes", async () => {
    const { store, file } = open();
    const script = `import {createSqliteStore} from ${JSON.stringify(new URL("../src/sqlite-store.ts", import.meta.url).href)}; const store=createSqliteStore(process.argv[1]); for(let i=0;i<50;i++) await store.incrBy(process.argv[2],1n,60); store.close();`;
    const worker = () => new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script, file, key], { stdio: "ignore" });
      child.once("error", reject); child.once("exit", (code) => code === 0 ? resolve() : reject(new Error("SQLite worker failed.")));
    });
    await Promise.all([worker(), worker()]); expect(await store.get(key)).toBe("100");
  });
  it("preserves claim and nonce records when reopened, with private file permissions", async () => {
    const { store, file } = open(); await store.set(key, "saved claim"); store.close();
    expect(await open(file).store.get(key)).toBe("saved claim");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(isSharedStore(store)).toBe(true);
    expect(isSharedStore({ ...store })).toBe(false);
  });
  it("shares locks between connections and allows reacquisition only after expiry", async () => {
    let time = 1000; const { store, file } = open(undefined, () => time); const other = open(file, () => time).store;
    expect(await store.setNx(key, "first", 2)).toBe(true);
    expect(await other.setNx(key, "second", 2)).toBe(false);
    time += 2000; expect(await other.get(key)).toBeNull();
    expect(await other.setNx(key, "second", 2)).toBe(true);
    expect(await store.get(key)).toBe("second");
    await store.del(key); expect(await other.get(key)).toBeNull();
  });
  it("increments counters exactly across connections, resets TTLs and refuses overflow without changing the record", async () => {
    let time = 1000; const { store, file } = open(undefined, () => time); const other = open(file, () => time).store;
    expect(await store.incrBy(key, 9007199254740993n, 2)).toBe(9007199254740993n);
    expect(await other.incrBy(key, 1n, 2)).toBe(9007199254740994n);
    await store.set(key, ((1n << 63n) - 1n).toString());
    await expect(other.incrBy(key, 1n, 2)).rejects.toBeInstanceOf(StoreError);
    expect(await store.get(key)).toBe(((1n << 63n) - 1n).toString());
    await store.set(key, "not an integer"); await expect(other.incrBy(key, 1n, 2)).rejects.toBeInstanceOf(StoreError);
    await store.set(key, "5", 1); time += 1000; expect(await other.incrBy(key, -1n, 2)).toBe(-1n);
    time += 1000; expect(await store.incrBy(key, 2n, 2)).toBe(1n);
    time += 1500; expect(await other.get(key)).toBe("1"); time += 500; expect(await store.get(key)).toBeNull();
  });
  it("rejects invalid TTLs, counters and volatile database paths", async () => {
    const { store } = open();
    for (const ttl of [0, -1, 0.5, Infinity, 315360001]) await expect(store.setNx(key, "value", ttl)).rejects.toThrow(RangeError);
    await expect(store.incrBy(key, 1n << 63n, 2)).rejects.toThrow(RangeError);
    for (const file of [":memory:", "relative.sqlite", ""]) expect(() => createSqliteStore(file)).toThrow();
    store.close(); await expect(store.get(key)).rejects.toBeInstanceOf(StoreError);
  });
});
