import { erc20Abi, formatUnits, getAddress, isAddress, zeroAddress, type Address, type Hex, type PublicClient, type TransactionReceipt } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import { heldAmount } from "../quote.js";
import { assertChain, CHAIN_ID, readTokenInfo } from "../chain.js";
import { buildApproveVaultTx, buildCreateGiftTx, defaultExpiry, readGiftIdFromReceipt, type UnsignedTx } from "../create.js";
import { santaVaultAbi } from "../generated/santaVaultAbi.js";
import { buildLink, MAX_NOTE_PLAINTEXT_BYTES, newClaimKey, parseClaimKey, parseGiftId, sealNote, signKeyProof } from "../gift.js";

import { readGift, readListedTokens } from "../vault.js";
import { canonicalOrigin } from "../origin.js";
import type { WalletSigner } from "./signer.js";

/** What every browser flow needs to reach Santa's own API: the page's fetch and Santa's origin. */
export type SantaApi = { fetch: typeof fetch; origin: string };

/** One answer from Santa's API. `body` is parsed JSON, or null when it is not JSON or is over 64 KB. */
export type SantaReply = { status: number; body: unknown; retryAfter: string | null };

const MAX_REPLY_CHARS = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * One request to Santa's own API at `${origin}${path}`. `origin` goes through canonicalOrigin
 * (https, or http://localhost, nothing after the host), and `path` must be an /api/ path the caller
 * built from parsed values only. No redirect is followed (C13), no cookie is sent and nothing is
 * cached. `json` becomes the body with Content-Type application/json. Throws when the request
 * cannot complete (network failure, timeout) or the origin or path is refused.
 */
export async function callSanta(
  deps: SantaApi,
  method: "GET" | "POST",
  path: string,
  opts: { json?: unknown; headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<SantaReply> {
  const origin = canonicalOrigin(deps.origin);
  if (typeof path !== "string" || !/^\/api\/[a-z]+(\/[0-9]{1,78})?$/.test(path)) throw new TypeError("Not a Santa API path.");
  const res = await deps.fetch(`${origin}${path}`, {
    method,
    headers: { ...(opts.json === undefined ? {} : { "Content-Type": "application/json" }), ...(opts.headers ?? {}) },
    body: opts.json === undefined ? undefined : JSON.stringify(opts.json),
    redirect: "error",
    credentials: "omit",
    cache: "no-store",
    signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  const text = await res.text();
  let body: unknown = null;
  if (text.length <= MAX_REPLY_CHARS) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  return { status: res.status, body, retryAfter: res.headers.get("retry-after") };
}

/** The fixed error code Santa put in a reply body, or null. Never any other text from the reply. */
export function errorCodeOf(body: unknown): string | null {
  const error = (body as { error?: unknown } | null)?.error;
  return typeof error === "string" && /^[a-z_]{1,48}$/.test(error) ? error : null;
}

// The dispatcher's own answers (http.ts), which any route can give before its handler runs.
const ROUTE_TEXT: Record<string, string> = {
  not_found: "Santa's server does not know that address. Reload the page and try again.",
  method_not_allowed: "This page sent a request Santa's server does not take. Reload the page and try again.",
  body_too_large: "That request was too large for Santa's server.",
  bad_json: "Santa's server could not read the request. Reload the page and try again.",
  rate_limited: "Too many requests from your network just now. Wait a minute and try again.",
  store_unavailable: "Santa's server could not reach its records just now. Try again in a minute.",
  internal: "Santa's server hit an error. Try again in a minute.",
};

/**
 * The sentence a page shows for a Santa error code: from `table` first, then the dispatcher's own
 * codes, then a fixed fallback. Never echoes the code or any server text it does not know.
 */
export function santaErrorText(code: string | null, table: Readonly<Record<string, string>>): string {
  if (code !== null && Object.hasOwn(table, code)) return table[code]!;
  if (code !== null && Object.hasOwn(ROUTE_TEXT, code)) return ROUTE_TEXT[code]!;
  return "Santa's server refused the request. Try again in a minute.";
}

const QUOTE_TEXT: Record<string, string> = {
  bad_request: "Santa could not read that gift request. Check the stock and quantity.",
  bad_wallet: "Reconnect your wallet and try again.",
  bad_amount: "Choose between 1 and 100 stock units, within the token’s precision.",
  restricted_place: "Santa gifts are not available where you are connecting from.",
  unknown_place: "Santa could not determine where you are connecting from.",
  not_listed: "That stock is not listed in the Santa vault.",
  chain_unavailable: "Santa could not read the blockchain. Try again in a minute.",
};

export type SendGiftErrorCode =
  | "bad_input"
  | "not_listed"
  | "chain_unavailable"
  | "server_unreachable"
  | "quote_refused"
  | "declined"
  | "wallet_failed"
  | "tx_unconfirmed"
  | "tx_failed"
  | "tx_mismatch"
  | "gift_mismatch"
  | "gift_not_found"
  | "unexpected";

/**
 * Every way sending a gift stops. `message` says why in plain English, `stillHeld`
 * says what the sender holds at that moment, and `giftId` is set once the gift exists. Neither
 * text ever holds the claim key or the link (C12): the link was already handed over in the
 * link-ready step.
 */
export class SendGiftError extends Error {
  readonly code: SendGiftErrorCode;
  readonly stillHeld: string;
  readonly giftId: bigint | null;
  constructor(code: SendGiftErrorCode, message: string, stillHeld: string, giftId: bigint | null) {
    super(message);
    this.name = "SendGiftError";
    this.code = code;
    this.stillHeld = stillHeld;
    this.giftId = giftId;
  }
}

/**
 * A gift's claim key between its making and its link, in a form a page can keep in local storage
 * as JSON: the sender's address, the claim key, the sealed note, the chain time (Unix seconds)
 * the createGift call was built at, and landsBefore: the last chain time that createGift can still
 * be mined (the vault refuses it once less than its 1 hour MIN_LIFETIME is left before expiry).
 * Holding it is holding the gift: it is never sent anywhere.
 */
export type PendingGift = { senderAddress: Address; claimKey: Hex; sealedNote: Hex; createdAt: number; landsBefore: number };

// The vault's own MIN_LIFETIME: createGift reverts when expiry < block.timestamp + 1 hour.
const VAULT_MIN_LIFETIME_S = 3_600;

/**
 * The steps of sendGift, in order. A step that carries `tx` is yielded right before the wallet is
 * asked to send exactly that transaction. key-pending and link-ready carry the claim key: the
 * caller must store each locally before asking for the next step, and must never log or send it.
 * Once link-ready is stored, the pending record may be deleted.
 */
export type SendStep =
  | { kind: "quote" }
  | { kind: "approve-vault"; tx: UnsignedTx }
  | { kind: "key-pending"; pending: PendingGift }
  | { kind: "create"; tx: UnsignedTx }
  | { kind: "link-ready"; giftId: bigint; link: string }
  | { kind: "done"; giftId: bigint; link: string; txHash: Hex };

export type SendGiftDeps = SantaApi & {
  signer: WalletSigner;
  publicClient: PublicClient;
  vault: Address;
};

export type SendGiftInput = { stock: Address; usdAmount: string; note: string; expiryDays?: number };

// The server reads the allowlist, balance and approval simulation before it answers.
const QUOTE_TIMEOUT_MS = 45_000;
const RECEIPT_TIMEOUT_MS = 180_000;
const MAX_EXPIRY_DAYS = 90;
const DAY_SECONDS = 86_400n;
const TX_HASH_TEXT = /^0x[0-9a-fA-F]{64}$/;


type Stop = (code: SendGiftErrorCode, message: string) => SendGiftError;
type FlowState = { held: string; giftId: bigint | null; claimKey: Hex | null };

function usableAddress(value: unknown): Address {
  const address = getAddress(value as string);
  if (address === zeroAddress) throw new TypeError("zero address");
  return address;
}

// Token symbols come from the token contract, so they are cut to plain short text before a sentence holds them.
function shown(symbol: string): string {
  return symbol.replace(/[^\x20-\x7e]/g, "").slice(0, 16);
}

function isUserRejection(err: unknown): boolean {
  let node: unknown = err;
  for (let depth = 0; depth < 8 && typeof node === "object" && node !== null; depth += 1) {
    const { code, name } = node as { code?: unknown; name?: unknown };
    if (code === 4001 || name === "UserRejectedRequestError") return true;
    node = (node as { cause?: unknown }).cause;
  }
  return false;
}

// C12: whatever went wrong, an error that carries the claim key in any form is replaced, and
// anything that is not already a typed refusal becomes one with what the sender holds.
function typedError(err: unknown, state: FlowState): SendGiftError {
  const bare = state.claimKey?.slice(2).toLowerCase() ?? null;
  const unexpected = new SendGiftError("unexpected", "Something unexpected went wrong, so Santa stopped here.", state.held, state.giftId);
  if (!(err instanceof SendGiftError)) return unexpected;
  if (bare !== null && `${err.message}\n${err.stillHeld}\n${err.stack ?? ""}`.toLowerCase().includes(bare)) return unexpected;
  return err;
}

/**
 * Sends `tx` from the connected wallet and returns its receipt once mined and successful, and only
 * when the chain's own copy of the transaction carries exactly `tx.data`, from `wallet`, to
 * `tx.to`, with no value, on chain 46630 (C48): a receipt alone proves nothing about the calldata a
 * wallet signed.
 */
async function sendChecked(deps: { signer: WalletSigner; publicClient: PublicClient }, tx: UnsignedTx, wallet: Address, stop: Stop): Promise<TransactionReceipt> {
  let sent: unknown;
  try {
    sent = await deps.signer.sendTransaction({ to: tx.to, data: tx.data, value: 0n, chainId: CHAIN_ID });
  } catch (err) {
    throw isUserRejection(err)
      ? stop("declined", "You declined in your wallet, so Santa stopped here.")
      : stop("wallet_failed", "Your wallet could not send the transaction, so Santa stopped here.");
  }
  if (typeof sent !== "string" || !TX_HASH_TEXT.test(sent)) throw stop("wallet_failed", "Your wallet did not return a transaction hash, so Santa stopped here.");
  const hash = sent.toLowerCase() as Hex;
  let receipt: TransactionReceipt;
  try {
    receipt = await deps.publicClient.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS });
  } catch {
    throw stop("tx_unconfirmed", `Transaction ${hash} was sent but is not confirmed after 3 minutes. Look it up on explorer.testnet.chain.robinhood.com before trying again.`);
  }
  if (receipt.status !== "success") throw stop("tx_failed", `Transaction ${hash} failed on chain, so Santa stopped here.`);
  let mined: Awaited<ReturnType<PublicClient["getTransaction"]>>;
  try {
    mined = await deps.publicClient.getTransaction({ hash });
  } catch {
    throw stop("chain_unavailable", `Santa could not read transaction ${hash} back from the chain, so it stopped here.`);
  }
  const same =
    typeof mined.input === "string" &&
    mined.input.toLowerCase() === tx.data.toLowerCase() &&
    isAddress(mined.from) &&
    getAddress(mined.from) === wallet &&
    typeof mined.to === "string" &&
    getAddress(mined.to) === getAddress(tx.to) &&
    mined.value === 0n &&
    (mined.chainId === undefined || mined.chainId === CHAIN_ID);
  if (!same) throw stop("tx_mismatch", `Transaction ${hash} is not the one Santa asked your wallet to send, so Santa stopped here. Check your wallet.`);
  return receipt;
}

const addressText = z.custom<Address>((v) => typeof v === "string" && isAddress(v));
const uintText = z.string().regex(/^(0|[1-9][0-9]{0,77})$/);
const quoteReplySchema = z.strictObject({ ok: z.literal(true), step: z.literal("held"), stock: addressText, usdAmount: z.string().max(40), amount: uintText });
type QuoteReply = z.infer<typeof quoteReplySchema>;

async function requestQuote(deps: SendGiftDeps, body: { stock: Address; usdAmount: string; wallet: Address }, stop: Stop): Promise<QuoteReply> {
  let reply: SantaReply;
  try {
    reply = await callSanta(deps, "POST", "/api/quote", { json: body, timeoutMs: QUOTE_TIMEOUT_MS });
  } catch {
    throw stop("server_unreachable", "Santa's server could not be reached to check the token quantity. Try again in a minute.");
  }
  if (reply.status !== 200) {
    if (errorCodeOf(reply.body) === "insufficient_stock") throw stop("bad_input", "Your wallet does not hold enough of this stock. Get testnet stock tokens from the faucet first.");
    throw stop("quote_refused", santaErrorText(errorCodeOf(reply.body), QUOTE_TEXT));
  }
  const parsed = quoteReplySchema.safeParse(reply.body);
  if (!parsed.success) throw stop("quote_refused", "Santa's token check came back in an unexpected format, so nothing was signed.");
  return parsed.data;
}

async function balanceAt(client: PublicClient, token: Address, owner: Address, blockNumber?: bigint): Promise<bigint> {
  return client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner], ...(blockNumber === undefined ? {} : { blockNumber }) });
}

/** Approves and escrows held stock units, saving the claim key before asking the wallet to create a gift. */
export async function* sendGift(deps: SendGiftDeps, input: SendGiftInput): AsyncGenerator<SendStep, void, void> {
  const state: FlowState = { held: "Nothing was spent.", giftId: null, claimKey: null };
  try {
    yield* send(deps, input, state);
  } catch (err) {
    throw typedError(err, state);
  }
}

async function* send(deps: SendGiftDeps, input: SendGiftInput, state: FlowState): AsyncGenerator<SendStep, void, void> {
  const stop: Stop = (code, message) => new SendGiftError(code, message, state.held, state.giftId);
  const client = deps.publicClient;
  let vault: Address;
  let wallet: Address;
  let stock: Address;
  try {
    canonicalOrigin(deps.origin);
    vault = usableAddress(deps.vault);
    wallet = usableAddress(deps.signer?.address);
    stock = usableAddress(input?.stock);
  } catch {
    throw stop("bad_input", "This page is missing its Santa settings or a connected wallet, so nothing was sent.");
  }
  if (typeof input.note !== "string" || new TextEncoder().encode(input.note).length > MAX_NOTE_PLAINTEXT_BYTES) {
    throw stop("bad_input", `The note is too long. Keep it under ${MAX_NOTE_PLAINTEXT_BYTES} bytes.`);
  }
  const days = input.expiryDays;
  if (days !== undefined && (!Number.isSafeInteger(days) || days < 1 || days > MAX_EXPIRY_DAYS)) {
    throw stop("bad_input", `A gift must last a whole number of days from 1 to ${MAX_EXPIRY_DAYS}.`);
  }

  let received: bigint;
  let symbol: string;
  let stockDecimals: number;
  const info = await readTokenInfo(stock, client);
  symbol = shown(info.symbol);
  stockDecimals = info.decimals;
  const quantity = heldAmount(input.usdAmount, stockDecimals);
  if (quantity === null) throw stop("bad_input", "Choose between 1 and 100 stock units without exceeding the token precision.");
  const listed = await readListedTokens(client, vault);
  if (!listed.includes(stock)) throw stop("not_listed", "That stock is not listed in the Santa vault.");
  if (await balanceAt(client, stock, wallet) < quantity) throw stop("bad_input", "Your wallet does not hold enough of this stock. Get testnet stock tokens from the faucet first.");
  yield { kind: "quote" };
  const heldQuote = await requestQuote(deps, { stock, usdAmount: input.usdAmount, wallet }, stop);
  if (heldQuote.step !== "held" || getAddress(heldQuote.stock) !== stock || heldQuote.usdAmount !== input.usdAmount || BigInt(heldQuote.amount) !== quantity) {
    throw stop("quote_refused", "Santa’s token quantity did not match your gift, so nothing was signed.");
  }
  received = quantity;
  // The approval is built locally below; no server-provided destination or calldata is signed.
  const amountText = `${formatUnits(received, stockDecimals)} ${symbol}`;
  const approveVaultTx = buildApproveVaultTx({ token: stock, amount: received, vault });
  yield { kind: "approve-vault", tx: approveVaultTx };
  await sendChecked(deps, approveVaultTx, wallet, stop);
  state.held = `The ${amountText} you selected is in your wallet ${wallet}. The Santa vault may take exactly that amount, and no gift was made.`;

  const key = newClaimKey();
  state.claimKey = key.privateKey;
  const keyProof = await signKeyProof(key.privateKey, vault, CHAIN_ID, wallet);
  const sealedNote = await sealNote(key.privateKey, input.note);
  let nowSeconds: bigint;
  try {
    nowSeconds = (await client.getBlock({ blockTag: "latest" })).timestamp;
  } catch {
    throw stop("chain_unavailable", "Santa could not read the time from the chain, so it stopped before locking anything.");
  }
  const expiry = days === undefined ? defaultExpiry(nowSeconds) : nowSeconds + BigInt(days) * DAY_SECONDS;
  const createTx = buildCreateGiftTx({ vault, token: stock, amount: received, claimKeyAddress: key.address, expiry, sealedNote, keyProof, nowSeconds });
  // WHY: once createGift is in flight the key is the only way to the gift, and a closed tab would
  // lose it. The page stores this record first; recoverPendingGift turns it back into the link.
  const pending: PendingGift = { senderAddress: wallet, claimKey: key.privateKey, sealedNote, createdAt: Number(nowSeconds), landsBefore: Number(expiry) - VAULT_MIN_LIFETIME_S };
  yield { kind: "key-pending", pending };
  state.held = `${state.held} Keep the saved gift key until this finishes: if the gift is made, it is the only way to reach it.`;
  yield { kind: "create", tx: createTx };
  const createReceipt = await sendChecked(deps, createTx, wallet, stop);
  const until = new Date(Number(expiry) * 1000).toISOString().slice(0, 10);
  state.held = `Your ${amountText} is locked in the Santa vault as a gift. As its sender you can take it back after it expires on ${until}.`;
  let giftId: bigint;
  try {
    giftId = readGiftIdFromReceipt(createReceipt, vault);
  } catch {
    throw stop("gift_mismatch", "The gift was made, but Santa could not read its number from the receipt, so it made no link.");
  }
  state.giftId = giftId;
  state.held = `Gift ${giftId} holds your ${amountText} in the Santa vault. As its sender you can take it back after it expires on ${until}.`;

  // WHY (C48): the link is only worth sending if the vault really holds this stock under this key,
  // so the vault's own record is read back before any link exists.
  let stored: Awaited<ReturnType<typeof readGift>>;
  try {
    stored = await readGift(client, vault, giftId);
  } catch {
    throw stop("chain_unavailable", `Gift ${giftId} was made, but Santa could not read it back from the vault, so it made no link.`);
  }
  const asAsked = stored.state === "Open" && stored.claimKey === key.address && stored.token === stock && stored.sender === wallet && stored.amount === received;
  if (!asAsked) throw stop("gift_mismatch", `Gift ${giftId} was made, but the vault's record of it is not the gift Santa asked for, so Santa made no link.`);

  const link = buildLink(canonicalOrigin(deps.origin), giftId, key.privateKey);
  yield { kind: "link-ready", giftId, link };
  state.held = `Gift ${giftId} holds your ${amountText}, and its link is ready.`;
  yield { kind: "done", giftId, link, txHash: createReceipt.transactionHash };
}

// The vault numbers gifts from 1 in order, so the newest 1,000 are a contiguous range, read in
// multicall batches of 100: ten calls at most instead of a thousand.
const RECOVERY_SCAN = 1_000n;
const RECOVERY_BATCH = 100n;
const KEEP_KEY = "Keep the saved gift key: it is the only way to reach this gift.";

/**
 * Turns a PendingGift a page kept from a send that stopped (a closed tab, a lost connection) back
 * into its gift. Reads claimKeyUsed for the key's address on the vault, from a node that reports
 * chain 46630. When the key was never used, returns null: no gift was made with it yet. A signed
 * createGift can still be mined later, so the page deletes the record only when this returns null
 * and the latest block time is past pending.landsBefore. When it was used, scans the vault's
 * newest gifts (newest first, at most 1,000, by multicall) for the one stored under that claim key
 * from that sender and returns its id and link. Throws SendGiftError: bad_input for an unreadable record, chain_unavailable when the
 * vault cannot be read, and gift_not_found when the key is used but its gift is not among the
 * newest 1,000; in every error case the page must keep the record. The key goes into no request:
 * only its address is read (C12).
 */
export async function recoverPendingGift(
  deps: { publicClient: PublicClient; vault: Address; origin: string },
  pending: PendingGift,
): Promise<{ giftId: bigint; link: string } | null> {
  let key: Hex | null = null;
  try {
    let origin: string;
    let vault: Address;
    let sender: Address;
    let keyAddress: Address;
    try {
      origin = canonicalOrigin(deps.origin);
      vault = usableAddress(deps.vault);
      sender = usableAddress(pending?.senderAddress);
      key = parseClaimKey(pending?.claimKey);
      keyAddress = privateKeyToAccount(key).address;
    } catch {
      throw new SendGiftError("bad_input", "This saved gift key is not readable, so Santa cannot look for its gift.", KEEP_KEY, null);
    }
    const client = deps.publicClient;
    const unreadable = new SendGiftError("chain_unavailable", "Santa could not read the vault just now. Try again in a minute.", KEEP_KEY, null);
    let used: boolean;
    let next: bigint;
    try {
      await assertChain(client);
      [used, next] = await Promise.all([
        client.readContract({ address: vault, abi: santaVaultAbi, functionName: "claimKeyUsed", args: [keyAddress] }),
        client.readContract({ address: vault, abi: santaVaultAbi, functionName: "nextGiftId" }),
      ]);
    } catch {
      throw unreadable;
    }
    if (used !== true) return null;
    const newest = next - 1n;
    const oldest = newest - RECOVERY_SCAN + 1n > 1n ? newest - RECOVERY_SCAN + 1n : 1n;
    for (let high = newest; high >= oldest; high -= RECOVERY_BATCH) {
      const ids: bigint[] = [];
      for (let id = high; id >= oldest && id > high - RECOVERY_BATCH; id -= 1n) ids.push(id);
      let gifts: readonly { claimKey: string; sender: string }[];
      try {
        gifts = await client.multicall({
          contracts: ids.map((id) => ({ address: vault, abi: santaVaultAbi, functionName: "getGift", args: [id] }) as const),
          allowFailure: false,
          deployless: true,
        });
      } catch {
        throw unreadable;
      }
      const index = gifts.findIndex((g) => isAddress(g.claimKey) && getAddress(g.claimKey) === keyAddress && isAddress(g.sender) && getAddress(g.sender) === sender);
      if (index >= 0) {
        const giftId = ids[index]!;
        return { giftId, link: buildLink(origin, giftId, key) };
      }
    }
    throw new SendGiftError("gift_not_found", `This key made a gift, but it is not among the vault's newest ${RECOVERY_SCAN} gifts, so Santa made no link.`, KEEP_KEY, null);
  } catch (err) {
    throw typedError(err, { held: KEEP_KEY, giftId: null, claimKey: key });
  }
}
