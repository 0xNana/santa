import { createWalletClient, getAddress, http, type Address, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhood } from "./network.js";
import { createRobinhoodClient, RPC_TIMEOUT_MS } from "./chain.js";
import { EnvError, loadServerEnv, type ServerEnv } from "./env.js";
import type { ServerDeps } from "./http.js";
import { deriveClientHashKey, deriveJudgeKey, parseJudgePool } from "./judge.js";
import { createRelayer } from "./relayer.js";
import { createStocksCache } from "./stocks.js";
import { createMemoryStore, createUpstashStore, type KvStore } from "./store.js";
import { readRelayer } from "./vault.js";
import { createSqliteStore } from "./sqlite-store.js";

// The same rule privy.ts applies to an app id, checked here so a bad value stops boot rather than
// failing every judge request.
const PRIVY_APP_ID_TEXT = /^[A-Za-z0-9]{1,64}$/;

/** The server cannot start safely. The message names what is wrong in plain words and never holds a key. */
export class BootError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BootError";
  }
}

const set = (value: string | undefined): string | undefined => (typeof value === "string" && value.trim() !== "" ? value : undefined);

type Judge = { judge: ServerDeps["judge"]; privyAppId: string | null };

// The seed is read only when a pool is set, so a server with judge gifts closed never holds it.
// `code` is SANTA_JUDGE_CODE as loadServerEnv already checked it.
async function readJudge(source: Readonly<Record<string, string | undefined>>, code: string | undefined, bad: string[]): Promise<Judge> {
  const appIdText = set(source.NEXT_PUBLIC_PRIVY_APP_ID);
  const privyAppId = appIdText !== undefined && PRIVY_APP_ID_TEXT.test(appIdText) ? appIdText : null;
  if (appIdText !== undefined && privyAppId === null) bad.push("NEXT_PUBLIC_PRIVY_APP_ID");
  const poolText = set(source.SANTA_JUDGE_POOL);
  if (poolText === undefined) return { judge: null, privyAppId };

  let pool: Map<bigint, number> | null = null;
  try {
    pool = parseJudgePool(poolText);
  } catch {
    bad.push("SANTA_JUDGE_POOL");
  }
  const seedText = set(source.SANTA_JUDGE_SEED);
  let seed: `0x${string}` | null = null;
  try {
    if (seedText !== undefined) {
      await deriveJudgeKey(seedText as `0x${string}`, 0);
      seed = seedText as `0x${string}`;
    }
  } catch {
    // deriveJudgeKey refuses a malformed or all-zero seed; its message is dropped like any value.
  }
  if (seed === null) bad.push("SANTA_JUDGE_SEED");
  // FA-9: a sign-in alone lets anyone with an account take a gift, so an open pool also needs the
  // code that only the submission form's judge instructions carry.
  if (code === undefined) bad.push("SANTA_JUDGE_CODE");
  if (appIdText === undefined) bad.push("NEXT_PUBLIC_PRIVY_APP_ID");
  return { judge: pool !== null && seed !== null && code !== undefined ? { seed, pool, code } : null, privyAppId };
}

/**
 * C43: the vault accepts claim() only from its own relayer (C31), so a server whose key is not that
 * address would sign, pay for and send claims that can only revert. Reads vault.relayer() once at
 * boot. Throws BootError naming both addresses on a mismatch, and a fixed message when the chain
 * cannot be read; the RPC's own error is dropped because it can carry the RPC address and its key.
 */
async function checkRelayerMatches(client: PublicClient, vault: Address, relayer: Address): Promise<void> {
  let onChain: Address;
  try {
    onChain = await readRelayer(client, vault);
  } catch {
    throw new BootError(`Could not read the relayer of vault ${vault} from the chain, so the server will not start. Check ROBINHOOD_RPC_URL and SANTA_VAULT_ADDRESS.`);
  }
  if (getAddress(onChain) !== getAddress(relayer)) {
    throw new BootError(
      `The vault ${vault} only accepts claims from relayer ${getAddress(onChain)}, but RELAYER_PRIVATE_KEY belongs to ${getAddress(relayer)}. Set the matching relayer key, or have the vault owner point the vault at this relayer.`,
    );
  }
}

/**
 * Builds everything the Santa endpoints need from server config, once per server process.
 * - `env` is loadServerEnv's result by default: never the deployer key (C40). The few settings
 *   outside that schema are read by name from `opts.source` (process.env by default):
 *   SANTA_ALLOW_MEMORY_STORE, SANTA_DEV_ALLOW_UNKNOWN_COUNTRY, SANTA_JUDGE_POOL, SANTA_JUDGE_SEED (only when
 *   a pool is set) and NEXT_PUBLIC_PRIVY_APP_ID. DEPLOYER_PRIVATE_KEY is never read.
 * - Store (C38): persistent SQLite at SANTA_SQLITE_PATH for one Machine, or shared Upstash when
 *   both Upstash variables are set. Without either the server refuses to start, unless SANTA_ALLOW_MEMORY_STORE is exactly "1", which gives a one-process
 *   memory store and prints a warning through `opts.warn` (console.warn by default).
 * - Judge gifts: an absent SANTA_JUDGE_POOL closes POST /api/judge. A set pool must pass
 *   parseJudgePool, and then SANTA_JUDGE_SEED (0x and 64 hex, not all zeros), SANTA_JUDGE_CODE (from
 *   `env`, already in its exact form) and NEXT_PUBLIC_PRIVY_APP_ID (1 to 64 letters and digits)
 *   are required. The code goes to the judge handler as `judge.code`.
 * - devAllowUnknownCountry is true only when SANTA_DEV_ALLOW_UNKNOWN_COUNTRY is exactly "1".
 * - C46: clientHashKey, the key every client address and user id is hashed under, is derived from
 *   RELAYER_PRIVATE_KEY by HKDF (judge.ts deriveClientHashKey), so every instance of the server
 *   hashes alike without a second secret to set, and nothing can be undone to the key.
 * - C43: the vault's relayer() read on chain must equal RELAYER_PRIVATE_KEY's address.
 * - Shared Robinhood Chain Testnet reads, locally validated held-token quotes, a token list
 *   cache and sponsored claims.
 * Throws EnvError naming only the variables that are missing or malformed, and BootError for C43.
 * No message carries a key, a seed, a token or an RPC address.
 */
export async function createServerDeps(
  env: ServerEnv = loadServerEnv(),
  opts: { source?: Readonly<Record<string, string | undefined>>; client?: PublicClient; warn?: (line: string) => void } = {},
): Promise<ServerDeps> {
  const source = opts.source ?? process.env;
  const warn = opts.warn ?? ((line: string) => console.warn(line));
  const bad: string[] = [];

  const upstashUrl = env.UPSTASH_REDIS_REST_URL;
  const upstashToken = env.UPSTASH_REDIS_REST_TOKEN;
  const allowMemory = source.SANTA_ALLOW_MEMORY_STORE === "1";
  if (env.SANTA_SQLITE_PATH === undefined && (upstashUrl === undefined || upstashToken === undefined) && !allowMemory) bad.push("UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN");
  const { judge, privyAppId } = await readJudge(source, env.SANTA_JUDGE_CODE, bad);
  if (bad.length > 0) throw new EnvError(bad);

  const client = opts.client ?? createRobinhoodClient(env.ROBINHOOD_RPC_URL);
  const vault = getAddress(env.SANTA_VAULT_ADDRESS);
  if (source.NEXT_PUBLIC_SANTA_VAULT_ADDRESS && getAddress(source.NEXT_PUBLIC_SANTA_VAULT_ADDRESS) !== vault) {
    throw new BootError("SANTA_VAULT_ADDRESS and NEXT_PUBLIC_SANTA_VAULT_ADDRESS must match.");
  }
  const account = privateKeyToAccount(env.RELAYER_PRIVATE_KEY);
  const clientHashKey = await deriveClientHashKey(env.RELAYER_PRIVATE_KEY);
  await checkRelayerMatches(client, vault, account.address);

  let store: KvStore;
  let storeKind: ServerDeps["storeKind"];
  if (env.SANTA_SQLITE_PATH !== undefined) {
    store = createSqliteStore(env.SANTA_SQLITE_PATH);
    storeKind = "sqlite";
  } else if (upstashUrl !== undefined && upstashToken !== undefined) {
    store = createUpstashStore({ url: upstashUrl, token: upstashToken });
    storeKind = "upstash";
  } else {
    store = createMemoryStore();
    storeKind = "memory";
    warn(
      "WARNING: SANTA_ALLOW_MEMORY_STORE=1, so claim records, locks, the relayer's spend and nonce counters and the rate limits live in this one process only. Local runs only; a hosted server must use persistent SQLite or Upstash (C38).",
    );
  }

  const relayer = createRelayer({
    account,
    client,
    // No retries on the wallet transport: a retried send is a second broadcast attempt the relayer
    // did not decide on.
    walletClient: createWalletClient({ account, chain: robinhood, transport: http(env.ROBINHOOD_RPC_URL, { timeout: RPC_TIMEOUT_MS, retryCount: 0 }) }),
    vault,
    store,
    maxGasPriceWei: env.SANTA_RELAYER_MAX_GAS_PRICE_WEI,
    dailyCapWei: env.SANTA_RELAYER_DAILY_CAP_WEI,
    allowMemoryStore: storeKind === "memory",
  });

  return {
    client,
    store,
    storeKind,
    relayer,
    vault,
    origin: env.SANTA_PUBLIC_ORIGIN,
    judge,
    privyAppId,
    clientHashKey,
    getStocks: createStocksCache(),
    devAllowUnknownCountry: source.SANTA_DEV_ALLOW_UNKNOWN_COUNTRY === "1",
  };
}
