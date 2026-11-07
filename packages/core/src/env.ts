import { fileURLToPath } from "node:url";
import { getAddress, zeroAddress, type Address } from "viem";
import { z } from "zod";
import { JUDGE_CODE_TEXT } from "./judge.js";
import { canonicalOrigin } from "./origin.js";
import { DEFAULT_ROBINHOOD_RPC_URL } from "./chain.js";

const ROOT_ENV_FILE = fileURLToPath(new URL("../../../.env", import.meta.url));
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const privateKey = z.string().regex(/^0x[0-9a-fA-F]{64}$/).refine((key) => /^0x[0-9a-fA-F]{64}$/.test(key) && BigInt(key) > 0n && BigInt(key) < SECP256K1_N).transform((key) => key as `0x${string}`);
const address = z.string().refine((value) => { try { return getAddress(value) !== zeroAddress; } catch { return false; } }).transform((value) => getAddress(value) as Address);
const httpsUrl = z.string().refine((value) => { try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; } });
const origin = z.string().refine((value) => { try { canonicalOrigin(value); return true; } catch { return false; } }).transform(canonicalOrigin);
const redisOrigin = httpsUrl.refine((value) => { try { const url = new URL(value); return url.href === `${url.origin}/`; } catch { return false; } });
const wei = z.string().regex(/^[1-9][0-9]{0,30}$/).transform(BigInt);

const schema = z.object({
  RELAYER_PRIVATE_KEY: privateKey,
  ROBINHOOD_RPC_URL: httpsUrl.default(DEFAULT_ROBINHOOD_RPC_URL),
  SANTA_VAULT_ADDRESS: address,
  SANTA_RELAYER_MAX_GAS_PRICE_WEI: wei.default(3_000_000_000n),
  SANTA_RELAYER_DAILY_CAP_WEI: wei.default(2_000_000_000_000_000n),
  SANTA_PUBLIC_ORIGIN: origin,
  SANTA_SQLITE_PATH: z.string().max(512).regex(/^\/(?!$)[^\0]+$/).optional(),
  SANTA_JUDGE_CODE: z.string().regex(JUDGE_CODE_TEXT).optional(),
  UPSTASH_REDIS_REST_URL: redisOrigin.optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().regex(/^[\x21-\x7e]{8,1024}$/).optional(),
}).superRefine((env, ctx) => {
  if (env.SANTA_SQLITE_PATH !== undefined && (env.UPSTASH_REDIS_REST_URL !== undefined || env.UPSTASH_REDIS_REST_TOKEN !== undefined)) {
    ctx.addIssue({ code: "custom", path: ["SANTA_SQLITE_PATH"], message: "Choose SQLite or Redis, not both." });
  }
  if ((env.UPSTASH_REDIS_REST_URL === undefined) !== (env.UPSTASH_REDIS_REST_TOKEN === undefined)) {
    const missing = env.UPSTASH_REDIS_REST_URL === undefined ? "UPSTASH_REDIS_REST_URL" : "UPSTASH_REDIS_REST_TOKEN";
    ctx.addIssue({ code: "custom", path: [missing], message: "Set both Redis settings or neither." });
  }
});

export type ServerEnv = z.infer<typeof schema>;
export class EnvError extends Error {
  readonly variables: string[];
  constructor(variables: string[]) {
    super(`Missing or malformed environment variable(s): ${variables.join(", ")}. Check the repo-root .env against .env.example.`);
    this.name = "EnvError";
    this.variables = variables;
  }
}

/** Read only server settings; the deployer and CLI keys never enter the hosted configuration. */
export function parseServerEnv(source: Readonly<Record<string, string | undefined>>): ServerEnv {
  const picked = Object.fromEntries([
    "RELAYER_PRIVATE_KEY", "ROBINHOOD_RPC_URL", "SANTA_VAULT_ADDRESS", "SANTA_RELAYER_MAX_GAS_PRICE_WEI",
    "SANTA_RELAYER_DAILY_CAP_WEI", "SANTA_PUBLIC_ORIGIN", "SANTA_SQLITE_PATH", "SANTA_JUDGE_CODE", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN",
  ].map((key) => [key, source[key] === "" ? undefined : source[key]]));
  const result = schema.safeParse(picked);
  if (!result.success) throw new EnvError([...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? "unknown")))]);
  return result.data;
}

export function loadServerEnv(opts: { envFile?: string } = {}): ServerEnv {
  try { process.loadEnvFile(opts.envFile ?? ROOT_ENV_FILE); }
  catch (err) {
    if (!(err instanceof Error && "code" in err && err.code === "ENOENT")) throw new Error("The .env file exists but could not be read or parsed.");
  }
  return parseServerEnv(process.env);
}
