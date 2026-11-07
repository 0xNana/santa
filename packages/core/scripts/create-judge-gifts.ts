// Dry run by default. SANTA_LIVE=1 sends test tokens already held by a dedicated sponsor wallet.
import { createWalletClient, getAddress, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { fileURLToPath } from "node:url";
import { assertChain, balanceOf, CHAIN_ID, createRobinhoodClient, readTokenInfo } from "../src/chain.js";
import { buildApproveVaultTx, buildCreateGiftTx, defaultExpiry, readGiftIdFromReceipt } from "../src/create.js";
import { deriveJudgeKey, MAX_JUDGE_INDEX, parseJudgePool } from "../src/judge.js";
import { sealNote, signKeyProof } from "../src/gift.js";
import { robinhood } from "../src/network.js";
import { heldAmount } from "../src/quote.js";
import { readListedTokens } from "../src/vault.js";

async function main() {
  try { process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url))); }
  catch (err) { if (!(err instanceof Error && "code" in err && err.code === "ENOENT")) throw new Error("Cannot read .env."); }
  const env = process.env;
  if (!env.SANTA_VAULT_ADDRESS || !env.SANTA_JUDGE_STOCK || !env.SANTA_AGENT_PRIVATE_KEY || !env.SANTA_JUDGE_SEED) throw new Error("Set SANTA_VAULT_ADDRESS, SANTA_JUDGE_STOCK, SANTA_AGENT_PRIVATE_KEY and SANTA_JUDGE_SEED.");
  const vault = getAddress(env.SANTA_VAULT_ADDRESS);
  const token = getAddress(env.SANTA_JUDGE_STOCK);
  const count = Number(env.SANTA_JUDGE_COUNT ?? "10");
  const start = Number(env.SANTA_JUDGE_START ?? "0");
  if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(start) || start < 0 || start + count > MAX_JUDGE_INDEX + 1) throw new Error("Invalid judge count or start index.");
  const account = privateKeyToAccount(env.SANTA_AGENT_PRIVATE_KEY as Hex);
  const client = createRobinhoodClient(env.ROBINHOOD_RPC_URL);
  await assertChain(client);
  if (!(await readListedTokens(client, vault)).includes(token)) throw new Error("Judge token is not listed.");
  const info = await readTokenInfo(token, client);
  const amount = heldAmount(env.SANTA_JUDGE_TOKENS_EACH ?? "1", info.decimals);
  if (amount === null || await balanceOf(token, account.address, client) < amount * BigInt(count)) throw new Error("Invalid quantity or insufficient test tokens.");
  // Validate the seed before signing anything.
  await deriveJudgeKey(env.SANTA_JUDGE_SEED as Hex, start);
  console.log(`Santa: ${count} stock gifts of ${env.SANTA_JUDGE_TOKENS_EACH ?? "1"} ${info.symbol} on chain ${CHAIN_ID}.`);
  if (env.SANTA_LIVE !== "1") { console.log("Dry run. Set SANTA_LIVE=1 to create the gifts."); return; }
  const wallet = createWalletClient({ account, chain: robinhood, transport: http(env.ROBINHOOD_RPC_URL, { retryCount: 0 }) });
  const pool: string[] = [];
  const send = async (tx: ReturnType<typeof buildApproveVaultTx>) => {
    await client.call({ account: account.address, ...tx });
    const hash = await wallet.sendTransaction(tx);
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 180_000 });
    if (receipt.status !== "success") throw new Error("Transaction failed.");
    return receipt;
  };
  for (let index = start; index < start + count; index += 1) {
    const key = await deriveJudgeKey(env.SANTA_JUDGE_SEED as Hex, index);
    const keyAddress = privateKeyToAccount(key).address;
    await send(buildApproveVaultTx({ token, amount, vault }));
    const nowSeconds = (await client.getBlock()).timestamp;
    const tx = buildCreateGiftTx({ vault, token, amount, claimKeyAddress: keyAddress, expiry: defaultExpiry(nowSeconds), sealedNote: await sealNote(key, "Your first stock gift from Santa. A little stock, a lot of love. On Robinhood Chain Testnet."), keyProof: await signKeyProof(key, vault, CHAIN_ID, account.address), nowSeconds });
    const giftId = readGiftIdFromReceipt(await send(tx), vault);
    pool.push(`${giftId}:${index}`);
    parseJudgePool(pool.join(","));
    // Print after each gift so an interrupted run retains the completed pool and next index.
    console.log(`SANTA_JUDGE_POOL=${pool.join(",")}`);
    console.log(`Next SANTA_JUDGE_START=${index + 1}`);
  }
}
try { await main(); }
catch { console.error("Santa could not prepare judge gifts. Check the testnet settings, balances and completed pool output before resuming."); process.exitCode = 1; }
