import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EnvError, loadServerEnv, parseServerEnv } from "../src/env.js";

const good = { RELAYER_PRIVATE_KEY: `0x${"22".repeat(32)}`, SANTA_VAULT_ADDRESS: "0x5fbdb2315678afecb367f032d93f642f64180aa3", SANTA_PUBLIC_ORIGIN: "https://santa.example/" };
describe("testnet server configuration", () => {
  it("accepts a persistent SQLite file and refuses ambiguous or volatile storage", () => {
    expect(parseServerEnv({ ...good, SANTA_SQLITE_PATH: "/data/santa.sqlite" }).SANTA_SQLITE_PATH).toBe("/data/santa.sqlite");
    for (const value of [":memory:", "relative.sqlite", "/"]) expect(() => parseServerEnv({ ...good, SANTA_SQLITE_PATH: value })).toThrow(EnvError);
    expect(() => parseServerEnv({ ...good, SANTA_SQLITE_PATH: "/data/santa.sqlite", UPSTASH_REDIS_REST_URL: "https://redis.example", UPSTASH_REDIS_REST_TOKEN: "some-test-token" })).toThrow(EnvError);
  });
  it("uses the Robinhood RPC, normalises the origin and accepts no legacy credentials", () => {
    const env = parseServerEnv(good);
    expect(env.ROBINHOOD_RPC_URL).toBe("https://rpc.testnet.chain.robinhood.com");
    expect(env.SANTA_PUBLIC_ORIGIN).toBe("https://santa.example");
    expect(env.SANTA_RELAYER_DAILY_CAP_WEI).toBe(2_000_000_000_000_000n);
    expect(Object.keys(env)).not.toContain("OC_API_KEY");
  });
  it("never reads deployer or agent private keys", () => {
    const source = new Proxy(good, { get(target, name) { if (name === "DEPLOYER_PRIVATE_KEY" || name === "SANTA_AGENT_PRIVATE_KEY") throw new Error("Private key was accessed."); return Reflect.get(target, name); } });
    expect(parseServerEnv(source)).toMatchObject({ RELAYER_PRIVATE_KEY: good.RELAYER_PRIVATE_KEY });
  });
  it("requires the relayer, vault and origin without echoing secret values", () => {
    for (const key of Object.keys(good)) expect(() => parseServerEnv({ ...good, [key]: undefined })).toThrow(EnvError);
    for (const value of ["private-secret-value", `0x${"00".repeat(32)}`, `0x${"ff".repeat(32)}`]) {
      try { parseServerEnv({ ...good, RELAYER_PRIVATE_KEY: value }); throw new Error("accepted"); }
      catch (error) { expect(error).toBeInstanceOf(EnvError); expect((error as EnvError).variables).toEqual(["RELAYER_PRIVATE_KEY"]); expect((error as Error).message).not.toContain(value); }
    }
  });
  it("rejects invalid vaults, insecure RPCs, paths in the public origin and ambiguous Redis configuration", () => {
    for (const patch of [{ SANTA_VAULT_ADDRESS: "0x0000000000000000000000000000000000000000" }, { ROBINHOOD_RPC_URL: "http://rpc.example" }, { SANTA_PUBLIC_ORIGIN: "https://santa.example/path" }, { UPSTASH_REDIS_REST_URL: "https://redis.example" }, { SANTA_RELAYER_DAILY_CAP_WEI: "0" }, { SANTA_JUDGE_CODE: "SANTA-0000-1111" }]) expect(() => parseServerEnv({ ...good, ...patch })).toThrow(EnvError);
    expect(parseServerEnv({ ...good, SANTA_PUBLIC_ORIGIN: "http://localhost:3000", SANTA_JUDGE_CODE: "SANTA-7K4P-QX9M" }).SANTA_JUDGE_CODE).toBe("SANTA-7K4P-QX9M");
  });
  it("loads a server env file without needing a deployer key", () => {
    const dir = mkdtempSync(join(tmpdir(), "santa-env-")); const file = join(dir, ".env");
    const saved = Object.fromEntries(Object.keys(good).map((key) => [key, process.env[key]]));
    for (const key of Object.keys(good)) delete process.env[key];
    try { writeFileSync(file, Object.entries(good).map(([key,value]) => `${key}=${value}`).join("\n")); expect(loadServerEnv({ envFile: file }).SANTA_PUBLIC_ORIGIN).toBe("https://santa.example"); }
    finally { for (const [key,value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } rmSync(dir, { recursive: true }); }
  });
});
