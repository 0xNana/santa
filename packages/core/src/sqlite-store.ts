import { chmodSync, closeSync, mkdirSync, openSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { sharedStores } from "./store-registry.js";
import { StoreError, type KvStore } from "./store.js";

const MIN_INT = -(1n << 63n);
const MAX_INT = (1n << 63n) - 1n;
function ttl(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 315_360_000) throw new RangeError("Invalid store TTL.");
  return value;
}
function text(value: string): string {
  if (typeof value !== "string") throw new TypeError("Store values are strings.");
  return value;
}

/** Atomic persistent records for processes on one Machine sharing the same SQLite file. */
export function createSqliteStore(file: string, now: () => number = Date.now): KvStore & { close(): void } {
  if (!isAbsolute(file) || file.includes("\0")) throw new Error("SQLite needs an absolute database file path.");
  let db: DatabaseSync | undefined;
  try {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    closeSync(openSync(file, "a", 0o600));
    chmodSync(file, 0o600);
    db = new DatabaseSync(file);
    db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
    db.exec("CREATE TABLE IF NOT EXISTS santa_kv (k TEXT PRIMARY KEY, v TEXT NOT NULL, expires_at INTEGER); CREATE INDEX IF NOT EXISTS santa_expiry ON santa_kv(expires_at);");
  } catch {
    try { db?.close(); } catch { /* Preserve the fixed initialization error. */ }
    throw new StoreError("Could not open persistent SQLite storage.");
  }
  const read = db.prepare("SELECT v FROM santa_kv WHERE k=? AND (expires_at IS NULL OR expires_at>?)");
  const write = db.prepare("INSERT INTO santa_kv(k,v,expires_at) VALUES(?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, expires_at=excluded.expires_at");
  const writeNx = db.prepare("INSERT INTO santa_kv(k,v,expires_at) VALUES(?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, expires_at=excluded.expires_at WHERE santa_kv.expires_at<=?");
  const remove = db.prepare("DELETE FROM santa_kv WHERE k=?");
  const prune = db.prepare("DELETE FROM santa_kv WHERE expires_at<=?");
  let writes = 0;
  let closed = false;
  const guarded = <T>(fn: () => T): T => {
    try { if (closed) throw new Error(); return fn(); }
    catch (error) { if (error instanceof StoreError) throw error; throw new StoreError("Persistent storage operation failed."); }
  };
  const clean = (time: number) => { if (++writes % 100 === 0) prune.run(time); };
  const store: KvStore & { close(): void } = {
    async get(k) { return guarded(() => (read.get(k, now())?.v as string | undefined) ?? null); },
    async set(k, v, ttlSeconds) {
      const value = text(v); const time = now(); const expires = ttlSeconds === undefined ? null : time + ttl(ttlSeconds) * 1000;
      guarded(() => { write.run(k, value, expires); clean(time); });
    },
    async setNx(k, v, ttlSeconds) {
      const value = text(v); const time = now(); const expires = time + ttl(ttlSeconds) * 1000;
      return guarded(() => { const won = writeNx.run(k, value, expires, time).changes === 1; clean(time); return won; });
    },
    async incrBy(k, n, ttlSeconds) {
      if (typeof n !== "bigint" || n < MIN_INT || n > MAX_INT) throw new RangeError("Counter increment must fit a signed 64-bit integer.");
      const time = now(); const expires = time + ttl(ttlSeconds) * 1000;
      return guarded(() => {
        db.exec("BEGIN IMMEDIATE");
        try {
          const current = (read.get(k, time)?.v as string | undefined) ?? "0";
          if (!/^-?\d{1,19}$/.test(current)) throw new StoreError("Counter value is not an integer.");
          const total = BigInt(current) + n;
          if (total < MIN_INT || total > MAX_INT) throw new StoreError("Counter would overflow a signed 64-bit integer.");
          write.run(k, total.toString(), expires); clean(time); db.exec("COMMIT"); return total;
        } catch (error) { db.exec("ROLLBACK"); throw error; }
      });
    },
    async del(k) { guarded(() => { remove.run(k); }); },
    close() { if (!closed) { db.close(); closed = true; } },
  };
  sharedStores.add(store);
  return store;
}
