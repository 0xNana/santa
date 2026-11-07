import { getAddress, type Address, type PublicClient } from "viem";
import { describe, expect, it } from "vitest";
import { clipText, createStocksCache, getGiftableStocks, handleStocks } from "../src/stocks.js";
const token = getAddress("0x0000000000000000000000000000000000000002");
const vault = getAddress("0x0000000000000000000000000000000000000003");
function world() {
  let reads = 0; let fail = false;
  const client = { getChainId: async () => 46630, readContract: async ({ functionName }: { functionName: string }) => {
    if (fail) throw new Error("RPC failed with credentials that must never be exposed");
    if (functionName === "listedTokens") { reads++; return [token]; }
    if (functionName === "name") return "Tesla Test Token";
    if (functionName === "symbol") return "TSLA";
    if (functionName === "decimals") return 18;
    throw new Error("plain ERC-20 has no multiplier");
  } } as unknown as PublicClient;
  return { deps: { client, vault }, reads: () => reads, fail: (value: boolean) => { fail = value; } };
}
describe("giftable testnet tokens", () => {
  it("reads the vault allowlist and on-chain metadata without assigning a monetary value", async () => {
    const w = world(); const stocks = await getGiftableStocks(w.deps);
    expect(stocks).toMatchObject([{ address: token, symbol: "TSLA", name: "Tesla Test Token", decimals: 18, uiMultiplier: "1000000000000000000", priceUsd: null, logoUrl: null, market: { open: true } }]);
  });
  it("coalesces concurrent reads and keeps successful results per vault", async () => {
    const w = world(); const cached = createStocksCache();
    const [a,b] = await Promise.all([cached(w.deps), cached(w.deps)]);
    expect(a).toBe(b); expect(w.reads()).toBe(1);
    expect(await cached(w.deps)).toBe(a);
    await cached({ ...w.deps, vault: getAddress("0x0000000000000000000000000000000000000004") as Address });
    expect(w.reads()).toBe(2);
  });
  it("does not cache failures or expose RPC errors", async () => {
    const w = world(); const cached = createStocksCache(); w.fail(true);
    expect(await handleStocks({ ...w.deps, getStocks: cached })).toEqual({ status: 502, body: { ok: false, error: "upstream_unavailable" } });
    w.fail(false); expect((await cached(w.deps))[0]?.symbol).toBe("TSLA");
  });
  it("limits untrusted text by code points without splitting emoji", () => {
    expect(clipText("😀".repeat(100))).toBe("😀".repeat(64)); expect(clipText({ html: "bad" })).toBeNull();
  });
});
