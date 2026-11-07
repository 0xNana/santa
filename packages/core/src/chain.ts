import { createPublicClient, getAddress, http, parseAbi, type Address, type PublicClient } from "viem";
import { robinhood } from "./network.js";

export const CHAIN_ID = robinhood.id;
export const DEFAULT_ROBINHOOD_RPC_URL = robinhood.rpcUrls.default.http[0];
export const RPC_TIMEOUT_MS = 5_000;

// ERC-8056 multipliers are fixed point with 18 decimals: 1e18 means one token is one share.
export const UI_MULTIPLIER_ONE = 10n ** 18n;

const erc20Abi = parseAbi([
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function uiMultiplier() view returns (uint256)",
]);

export type TokenInfo = {
  decimals: number;
  symbol: string;
  uiMultiplier: bigint | null;
};

export function createRobinhoodClient(rpcUrl: string = DEFAULT_ROBINHOOD_RPC_URL): PublicClient {
  if (new URL(rpcUrl).protocol !== "https:") throw new Error("The Robinhood RPC URL must use https.");
  return createPublicClient({
    chain: robinhood,
    // One retry only: a slow node should surface as "try again", not as a long silent wait.
    transport: http(rpcUrl, { timeout: RPC_TIMEOUT_MS, retryCount: 1 }),
  }) as PublicClient;
}

let defaultClient: PublicClient | null = null;

/** Points the module-level client at the RPC from validated config. Call once after loadEnv(). */
export function useRpcUrl(rpcUrl: string): PublicClient {
  defaultClient = createRobinhoodClient(rpcUrl);
  return defaultClient;
}

export function publicClient(): PublicClient {
  defaultClient ??= createRobinhoodClient();
  return defaultClient;
}

/**
 * Reads decimals, symbol and the ERC-8056 uiMultiplier straight from the token contract.
 * uiMultiplier is null when the call reverts (a plain ERC-20 such as USDT has none).
 * Throws when decimals or symbol cannot be read, or the chain id is not 46630.
 */
export async function readTokenInfo(token: string, client: PublicClient = publicClient()): Promise<TokenInfo> {
  const address = getAddress(token);
  await assertChain(client);
  const [decimals, symbol] = await Promise.all([
    client.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
  ]);
  let uiMultiplier: bigint | null;
  try {
    uiMultiplier = await client.readContract({ address, abi: erc20Abi, functionName: "uiMultiplier" });
  } catch {
    uiMultiplier = null;
  }
  return { decimals, symbol, uiMultiplier };
}

export async function balanceOf(token: string, owner: string, client: PublicClient = publicClient()): Promise<bigint> {
  await assertChain(client);
  return client.readContract({
    address: getAddress(token),
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [getAddress(owner)],
  });
}

export async function allowance(
  token: string,
  owner: string,
  spender: string,
  client: PublicClient = publicClient(),
): Promise<bigint> {
  await assertChain(client);
  return client.readContract({
    address: getAddress(token),
    abi: erc20Abi,
    functionName: "allowance",
    args: [getAddress(owner), getAddress(spender)],
  });
}

/** Raw token units times the token's own multiplier. Integer math only; rounds down. */
export function rawToShares(raw: bigint, uiMultiplier: bigint | null): bigint {
  return (raw * (uiMultiplier ?? UI_MULTIPLIER_ONE)) / UI_MULTIPLIER_ONE;
}

const verifiedClients = new WeakSet<PublicClient>();

/**
 * Throws unless `client` reports chain 46630. Asked once per client object; a client that answered
 * 46630 is remembered, one that did not is asked again next time. Every reader of money state (gift
 * records, receipts, balances) goes through this so a node on another chain never feeds it.
 */
export async function assertChain(client: PublicClient): Promise<void> {
  if (verifiedClients.has(client)) return;
  const id = await client.getChainId();
  if (id !== CHAIN_ID) throw new Error(`RPC is on chain ${id}, expected ${CHAIN_ID}.`);
  verifiedClients.add(client);
}
