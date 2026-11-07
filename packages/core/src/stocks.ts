import { erc20Abi, type Address, type PublicClient } from "viem";
import { readTokenInfo, UI_MULTIPLIER_ONE } from "./chain.js";
import { readListedTokens } from "./vault.js";

export type GiftStock = {
  address: Address; symbol: string; name: string; decimals: number; uiMultiplier: string;
  priceUsd: null;
  market: { open: true; reasonCode: "testnet"; reasonMsg: string; nextOpenTime: null };
  logoUrl: null;
};
export type StocksDeps = { client: PublicClient; vault: Address };
export type StocksResponse =
  | { status: 200; body: { stocks: GiftStock[]; asOf: number } }
  | { status: 502; body: { ok: false; error: "upstream_unavailable" } };

/** Keep untrusted token text short and plain; consumers render it as text, never HTML. */
export function clipText(value: unknown): string | null {
  return typeof value === "string" ? Array.from(value.slice(0, 256)).slice(0, 64).join("") : null;
}

export async function getGiftableStocks({ client, vault }: StocksDeps): Promise<GiftStock[]> {
  const listed = await readListedTokens(client, vault);
  return Promise.all(listed.map(async (address): Promise<GiftStock> => {
    const [info, name] = await Promise.all([readTokenInfo(address, client), client.readContract({ address, abi: erc20Abi, functionName: "name" })]);
    return { address, symbol: clipText(info.symbol) ?? "", name: clipText(name) ?? "", decimals: info.decimals,
      uiMultiplier: (info.uiMultiplier ?? UI_MULTIPLIER_ONE).toString(), priceUsd: null,
      market: { open: true, reasonCode: "testnet", reasonMsg: "Stocks on Robinhood Chain Testnet. Testnet stock tokens have no monetary value.", nextOpenTime: null }, logoUrl: null };
  }));
}

/** Cache by vault and share in-flight reads; failures are never cached. */
export function createStocksCache(ttlMs = 60_000) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 3_600_000) throw new Error("Invalid cache lifetime.");
  const cache = new Map<Address, { stocks: GiftStock[]; until: number }>();
  const pending = new Map<Address, Promise<GiftStock[]>>();
  return async (deps: StocksDeps): Promise<GiftStock[]> => {
    const hit = cache.get(deps.vault);
    if (hit && hit.until > Date.now()) return hit.stocks;
    const active = pending.get(deps.vault);
    if (active) return active;
    const request = getGiftableStocks(deps).then((stocks) => { cache.set(deps.vault, { stocks, until: Date.now() + ttlMs }); return stocks; });
    pending.set(deps.vault, request);
    try { return await request; } finally { pending.delete(deps.vault); }
  };
}

export async function handleStocks(deps: StocksDeps & { getStocks?: (deps: StocksDeps) => Promise<GiftStock[]>; now?: () => number }): Promise<StocksResponse> {
  try { return { status: 200, body: { stocks: await (deps.getStocks ?? getGiftableStocks)(deps), asOf: (deps.now ?? Date.now)() } }; }
  catch { return { status: 502, body: { ok: false, error: "upstream_unavailable" } }; }
}
