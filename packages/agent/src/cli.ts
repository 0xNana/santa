import { readFileSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseArgs, parseEnv } from "node:util";
import { createWalletClient, getAddress, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { assertChain, createRobinhoodClient, readTokenInfo } from "@santa/core/src/chain.js";
import { robinhood } from "@santa/core/src/network.js";
import { recoverPendingGift, sendGift, SendGiftError, type PendingGift } from "@santa/core/src/client/send.js";
import { readListedTokens } from "@santa/core/src/vault.js";
import { canonicalOrigin } from "@santa/core/src/origin.js";
import { saveNewLink } from "./linkfile.js";

const USAGE = 'Usage: npm run santa -- status | gift <TICKER> <TEST_TOKENS> [--note text] [--days 7|30|90] [--yes]';
const SETTINGS = ["SANTA_AGENT_PRIVATE_KEY", "SANTA_VAULT_ADDRESS", "SANTA_PUBLIC_ORIGIN", "ROBINHOOD_RPC_URL"] as const;

function settings() {
  let file: Record<string, string | undefined> = {};
  try { file = parseEnv(readFileSync(fileURLToPath(new URL("../../../.env", import.meta.url)), "utf8")); }
  catch (err) { if (!(err instanceof Error && "code" in err && err.code === "ENOENT")) throw new Error("Could not read .env."); }
  return Object.fromEntries(SETTINGS.map((key) => [key, process.env[key] ?? file[key]]));
}

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { note: { type: "string" }, days: { type: "string" }, yes: { type: "boolean" } } });
  const [command, ticker, quantity, ...extra] = positionals;
  if (extra.length || (command !== "status" && command !== "gift") || (command === "status" && ticker !== undefined) || (command === "gift" && (!ticker || !quantity))) throw new Error(USAGE);
  const env = settings();
  if (!/^0x[0-9a-fA-F]{64}$/.test(env.SANTA_AGENT_PRIVATE_KEY ?? "")) throw new Error("Set SANTA_AGENT_PRIVATE_KEY to a test wallet key.");
  if (!env.SANTA_VAULT_ADDRESS || !env.SANTA_PUBLIC_ORIGIN) throw new Error("Set SANTA_VAULT_ADDRESS and SANTA_PUBLIC_ORIGIN.");
  const vault = getAddress(env.SANTA_VAULT_ADDRESS);
  const origin = canonicalOrigin(env.SANTA_PUBLIC_ORIGIN);
  const account = privateKeyToAccount(env.SANTA_AGENT_PRIVATE_KEY as Hex);
  const client = createRobinhoodClient(env.ROBINHOOD_RPC_URL);
  await assertChain(client);
  const wallet = createWalletClient({ account, chain: robinhood, transport: http(env.ROBINHOOD_RPC_URL ?? robinhood.rpcUrls.default.http[0], { retryCount: 0 }) });
  const dir = path.resolve(process.env.INIT_CWD ?? process.cwd(), "gifts", String(robinhood.id), vault);
  await mkdir(dir, { recursive: true, mode: 0o700 });

  if (command === "status") {
    // Recover any send whose final receipt was lost. Pending files are kept until a gift is found.
    for (const name of (await readdir(dir)).filter((name) => /^pending-[0-9a-f]{40}\.json$/.test(name))) {
      const file = path.join(dir, name);
      const pending = JSON.parse(await readFile(file, "utf8")) as PendingGift;
      const found = await recoverPendingGift({ publicClient: client, vault, origin }, pending);
      if (found) { await saveNewLink(dir, found.giftId, `${found.link}\n`); await rm(file); console.log(`Recovered gift ${found.giftId}. Its link is saved locally.`); }
    }
    console.log(`Santa · Robinhood Chain Testnet · wallet ${account.address} · ${await client.getBalance({ address: account.address })} wei test ETH`);
    return;
  }

  const tokens = await readListedTokens(client, vault);
  const infos = await Promise.all(tokens.map(async (address) => ({ address, ...await readTokenInfo(address, client) })));
  const token = infos.find((info) => info.symbol.toLowerCase() === ticker!.toLowerCase());
  if (!token) throw new Error("That ticker is not listed in the testnet vault.");
  const days = values.days === undefined ? 30 : Number(values.days);
  if (![7, 30, 90].includes(days)) throw new Error("Choose --days 7, 30 or 90.");
  if (!values.yes) {
    const prompt = createInterface({ input: stdin, output: stdout });
    try {
      const answer = await prompt.question(`Gift ${quantity} ${token.symbol} stock units on Robinhood Chain Testnet? [y/N] `);
      if (!/^(y|yes)$/i.test(answer.trim())) return;
    } finally { prompt.close(); }
  }
  const signer = {
    address: account.address,
    sendTransaction: (tx: { to: `0x${string}`; data: Hex; value: bigint }) => wallet.sendTransaction(tx),
    signMessage: (message: string) => account.signMessage({ message }),
  };
  let pendingFile: string | null = null;
  for await (const step of sendGift({ publicClient: client, vault, signer, fetch, origin }, { stock: token.address, usdAmount: quantity!, note: values.note ?? "", expiryDays: days })) {
    if (step.kind === "key-pending") {
      const keyAddress = privateKeyToAccount(step.pending.claimKey).address.slice(2).toLowerCase();
      pendingFile = path.join(dir, `pending-${keyAddress}.json`);
      await writeFile(pendingFile, JSON.stringify(step.pending), { mode: 0o600, flag: "wx" });
    } else if (step.kind === "link-ready") {
      const file = await saveNewLink(dir, step.giftId, `${step.link}\n`);
      if (pendingFile) await rm(pendingFile);
      console.log(`Gift ${step.giftId} is ready. Its private link is saved in ${file}.`);
    } else if (step.kind !== "done") console.log(`Santa: ${step.kind}.`);
  }
}

try { await main(); }
catch (err) {
  // RPC errors can include a signed transaction or provider credentials. Print only our own messages.
  console.error(err instanceof SendGiftError ? err.message : err instanceof Error && (err.message.startsWith("Usage:") || /^(Set |That ticker|Choose |Could not read)/.test(err.message)) ? err.message : "Santa stopped. Check the testnet connection and configuration; any pending gift key is kept locally.");
  process.exitCode = 1;
}
