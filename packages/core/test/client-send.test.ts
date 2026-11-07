import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, encodeFunctionData, erc20Abi, getAddress, keccak256, parseAbi, recoverAddress, toHex, TransactionReceiptNotFoundError, type Address, type Hex, type PublicClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { recoverPendingGift, sendGift, type PendingGift, SendGiftError, type SendGiftDeps, type SendStep } from "../src/client/send.js";
import type { WalletSigner } from "../src/client/signer.js";
import { santaVaultAbi } from "../src/generated/santaVaultAbi.js";
import { openNote, parseLink, registerDigest } from "../src/gift.js";
const ORIGIN = "https://santa.example";
const VAULT = getAddress("0x5fbdb2315678afecb367f032d93f642f64180aa3");
const STOCK = getAddress("0x0000000000000000000000000000000000000002");
const OTHER = getAddress("0x70997970c51812dc3a010c7d01b50e0d17dc79c8");
const E18 = 10n ** 18n;
const START_MS = 1_800_000_000_000;
const stringify = (value: unknown) => JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item);
const NOTE = "Happy birthday, from me";
const approveAbi = parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]);
const approveData = (spender: Address, amount: bigint) => encodeFunctionData({ abi: approveAbi, functionName: "approve", args: [spender, amount] });
type Log = { address: Address; topics: Hex[]; data: Hex };
type MinedTx = { from: Address; to: Address; input: Hex; status: "success" | "reverted"; blockNumber: bigint; logs: Log[] };
type Gift = { token: Address; sender: Address; claimKey: Address; expiry: bigint; state: number; amount: bigint; sealedNote: Hex };
function createChain(clock: { now: () => number }) {
  let block = 100n;
  let txCount = 0;
  let nextGiftId = 1n;
  const balances = new Map<string, [bigint, bigint][]>();
  const allowances = new Map<string, bigint>();
  const gifts = new Map<bigint, Gift>();
  const txs = new Map<Hex, MinedTx>();
  const key = (...parts: string[]) => parts.map((p) => p.toLowerCase()).join(":");
  const nowSeconds = () => BigInt(Math.floor(clock.now() / 1000));

  function balance(token: Address, owner: Address, at?: bigint): bigint {
    const seen = (balances.get(key(token, owner)) ?? []).filter(([b]) => at === undefined || b <= at);
    return seen.length === 0 ? 0n : seen[seen.length - 1]![1];
  }
  function setBalance(token: Address, owner: Address, value: bigint) {
    const history = balances.get(key(token, owner)) ?? [];
    history.push([block, value]);
    balances.set(key(token, owner), history);
  }
  const allowance = (token: Address, owner: Address, spender: Address) => allowances.get(key(token, owner, spender)) ?? 0n;
  function record(tx: MinedTx): Hex {
    txCount += 1;
    const hash = keccak256(toHex(`tx-${txCount}`));
    txs.set(hash, tx);
    return hash;
  }
  function transfer(token: Address, from: Address, to: Address, amount: bigint): Log {
    setBalance(token, from, balance(token, from) - amount);
    setBalance(token, to, balance(token, to) + amount);
    return {
      address: getAddress(token).toLowerCase() as Address,
      topics: encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: { from, to } }) as Hex[],
      data: encodeAbiParameters([{ type: "uint256" }], [amount]),
    };
  }

  async function mine(from: Address, tx: { to: Address; data: Hex }): Promise<Hex> {
    block += 1n;
    const logs: Log[] = [];
    let status: MinedTx["status"] = "success";
    const to = getAddress(tx.to);
    if (tx.data.startsWith("0x095ea7b3")) {
      const { args } = decodeFunctionData({ abi: approveAbi, data: tx.data });
      allowances.set(key(to, from, args[0]), args[1]);
    } else if (to === VAULT) {
      const decoded = decodeFunctionData({ abi: santaVaultAbi, data: tx.data });
      const [token, amount, claimKey, expiry, sealedNote, keyProof] = decoded.args as unknown as [Address, bigint, Address, bigint, Hex, Hex];
      const prover = await recoverAddress({ hash: registerDigest(VAULT, 46630, from), signature: keyProof });
      if (decoded.functionName !== "createGift" || prover !== getAddress(claimKey) || allowance(token, from, VAULT) < amount || balance(token, from) < amount) {
        status = "reverted";
      } else {
        allowances.set(key(token, from, VAULT), allowance(token, from, VAULT) - amount);
        transfer(token, from, VAULT, amount);
        const giftId = nextGiftId++;
        gifts.set(giftId, { token: getAddress(token), sender: from, claimKey: getAddress(claimKey), expiry, state: 1, amount, sealedNote });
        logs.push({
          address: VAULT.toLowerCase() as Address,
          topics: encodeEventTopics({ abi: santaVaultAbi, eventName: "GiftCreated", args: { giftId, token, sender: from } }) as Hex[],
          data: encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "uint64" }], [claimKey, amount, expiry]),
        });
      }
    }
    return record({ from, to, input: tx.data, status, blockNumber: block, logs });
  }

  // Every read's arguments, so a test can prove no claim key ever went to the node.
  const reads: unknown[] = [];
  const stats = { multicalls: 0 };
  const client = {
    getChainId: async () => 46630,
    getBlock: async () => ({ timestamp: nowSeconds(), number: block }),
    multicall: async ({ contracts, deployless }: { contracts: { address: Address; functionName: string; args?: readonly unknown[] }[]; deployless: boolean }) => {
      if (deployless !== true) throw new Error("testnet recovery requires deployless multicall");
      stats.multicalls += 1;
      return Promise.all(contracts.map((c) => client.readContract(c)));
    },
    readContract: async ({ address, functionName, args, blockNumber }: { address: Address; functionName: string; args?: readonly unknown[]; blockNumber?: bigint }) => {
      reads.push({ address, functionName, args });
      const at = getAddress(address);
      switch (functionName) {
        case "claimKeyUsed":
          return [...gifts.values()].some((g) => g.claimKey === getAddress(args![0] as Address));
        case "nextGiftId":
          return nextGiftId;
        case "listedTokens":
          return [STOCK];
        case "decimals":
          return 18;
        case "symbol":
          return at === STOCK ? "STOCK" : "USDT";
        case "uiMultiplier":
          if (at === STOCK) return E18;
          throw new Error("no uiMultiplier");
        case "balanceOf":
          return balance(at, args![0] as Address, blockNumber);
        case "allowance":
          return allowance(at, args![0] as Address, args![1] as Address);
        case "getGift": {
          const gift = gifts.get(args![0] as bigint);
          return gift ?? { token: VAULT, sender: VAULT, claimKey: VAULT, expiry: 0n, state: 0, amount: 0n, sealedNote: "0x" };
        }
        default:
          throw new Error(`unexpected read ${functionName}`);
      }
    },
    getTransactionReceipt: async ({ hash }: { hash: Hex }) => {
      const tx = txs.get(hash);
      if (tx === undefined) throw new TransactionReceiptNotFoundError({ hash });
      return { status: tx.status, transactionHash: hash, blockNumber: tx.blockNumber, logs: tx.logs, from: tx.from, to: tx.to };
    },
    waitForTransactionReceipt: async ({ hash }: { hash: Hex }) => client.getTransactionReceipt({ hash }),
    getTransaction: async ({ hash }: { hash: Hex }) => {
      const tx = txs.get(hash)!;
      return { hash, input: tx.input, from: tx.from, to: tx.to, value: 0n, chainId: 46630 };
    },
  };
  // Another sender's gift, numbered like the vault numbers them.
  const addGift = (gift: Gift) => gifts.set(nextGiftId++, gift);
  const chain = { gifts, txs, reads, stats, balance, setBalance, allowance, mine, record, transfer, addGift, client: client as unknown as PublicClient };
  return chain;
}

type QuoteAnswer = { status: number; body: unknown };
function createWorld(opts: { quote?: (wallet: Address) => QuoteAnswer | undefined } = {}) {
  const chain = createChain({ now: () => START_MS });
  const account = privateKeyToAccount(generatePrivateKey());
  chain.setBalance(STOCK, account.address, 10n * E18);
  const sent: { to: Address; data: Hex }[] = [];
  const requests: { url: string; body: string | null }[] = [];
  const timeline: string[] = [];
  const wallet = { tamper: null as null | ((tx: { to: Address; data: Hex }) => { to: Address; data: Hex }), reject: false as boolean | ((tx: { to: Address; data: Hex }) => boolean) };
  const signer: WalletSigner = {
    address: account.address,
    signMessage: (message) => account.signMessage({ message }),
    sendTransaction: async (tx) => {
      if (typeof wallet.reject === "function" ? wallet.reject(tx) : wallet.reject) throw Object.assign(new Error("Declined"), { code: 4001 });
      sent.push(tx); timeline.push(`send ${tx.data.slice(0,10)}`);
      return chain.mine(account.address, wallet.tamper ? wallet.tamper(tx) : tx);
    },
  };
  const fetchFake: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), body: typeof init?.body === "string" ? init.body : null });
    const answer = opts.quote?.(account.address) ?? { status: 200, body: { ok: true, step: "held", stock: STOCK, usdAmount: "5", amount: (5n * E18).toString() } };
    return Response.json(answer.body, { status: answer.status });
  };
  const deps: SendGiftDeps = { signer, publicClient: chain.client, vault: VAULT, fetch: fetchFake, origin: ORIGIN };
  return { deps, chain, account, sent, requests, wallet, timeline };
}
async function collect<T extends { kind: string }>(gen: AsyncGenerator<T, unknown, void>, timeline?: string[]) {
  const steps: T[] = [];
  let error: SendGiftError | null = null;
  let result: unknown;
  try {
    for (;;) {
      const next = await gen.next();
      if (next.done) {
        result = next.value;
        break;
      }
      steps.push(next.value);
      timeline?.push(`step ${next.value.kind}`);
    }
  } catch (err) {
    if (!(err instanceof SendGiftError)) throw err;
    error = err;
  }
  const kinds = steps.map((s) => s.kind);
  return { steps, kinds, error, result };
}

const gift = (input: Partial<{ stock: Address; usdAmount: string; note: string; expiryDays: number }> = {}) => ({ stock: STOCK, usdAmount: "5", note: NOTE, ...input });
describe("sendGift", () => {
  it("gifts held test tokens with exact approval and a private link, without a swap or wrap request", async () => {
    const w = createWorld({ quote: () => ({ status: 200, body: { ok: true, step: "held", stock: STOCK, usdAmount: "5", amount: (5n * E18).toString() } }) });
    w.chain.setBalance(STOCK, w.account.address, 10n * E18);
    const run = await collect(sendGift(w.deps, gift()));
    expect(run.error).toBeNull();
    expect(run.kinds).toEqual(["quote", "approve-vault", "key-pending", "create", "link-ready", "done"]);
    expect(w.sent).toHaveLength(2);
    expect(w.sent[0]).toEqual({ to: STOCK, data: approveData(VAULT, 5n * E18), value: 0n, chainId: 46630 });
    expect(w.chain.balance(STOCK, w.account.address)).toBe(5n * E18);
    expect(w.requests.every((r) => new URL(r.url).pathname === "/api/quote")).toBe(true);
    const done = run.steps.at(-1) as Extract<SendStep, { kind: "done" }>;
    const { claimKey, giftId } = parseLink(done.link);
    expect(await openNote(claimKey, w.chain.gifts.get(giftId)!.sealedNote)).toBe(NOTE);
    expect(JSON.stringify(w.requests)).not.toContain(claimKey.slice(2));
  });

  it("refuses a mismatched held-token quote before asking for any transaction", async () => {
    const w = createWorld({ quote: () => ({ status: 200, body: { ok: true, step: "held", stock: STOCK, usdAmount: "5", amount: (6n * E18).toString() } }) });
    w.chain.setBalance(STOCK, w.account.address, 10n * E18);
    const run = await collect(sendGift(w.deps, gift()));
    expect(run.error?.code).toBe("quote_refused");
    expect(w.sent).toHaveLength(0);
    expect(w.chain.gifts.size).toBe(0);
  });

  it("checks the chain’s transaction calldata before creating a gift", async () => {
    const w = createWorld();
    w.wallet.tamper = (tx) => ({ ...tx, data: approveData(VAULT, 6n * E18) });
    const run = await collect(sendGift(w.deps, gift()));
    expect(run.error?.code).toBe("tx_mismatch");
    expect(w.chain.gifts.size).toBe(0);
  });
  it("retains the sender’s tokens when the wallet declines", async () => {
    const w = createWorld(); w.wallet.reject = true;
    const run = await collect(sendGift(w.deps, gift()));
    expect(run.error?.code).toBe("declined");
    expect(w.chain.balance(STOCK, w.account.address)).toBe(10n * E18);
    expect(w.chain.gifts.size).toBe(0);
  });
  it("rejects an unlisted token and oversized note before any API or wallet request", async () => {
    for (const input of [gift({ stock: OTHER }), gift({ note: "a".repeat(1000) })]) {
      const w = createWorld(); const run = await collect(sendGift(w.deps, input));
      expect(run.error).not.toBeNull(); expect(w.sent).toHaveLength(0); expect(w.requests).toHaveLength(0);
    }
  });
});
describe("recoverPendingGift", () => {
  // Runs sendGift as a page would until the createGift transaction has been sent and mined, then
  // drops the flow as a closed tab would, before the link reaches the page.
  async function sendThenCloseTab(w: ReturnType<typeof createWorld>) {
    const flow = sendGift(w.deps, gift());
    let pending: PendingGift | null = null;
    for (;;) {
      const next = await flow.next();
      if (next.done) throw new Error("the flow ended early");
      if (next.value.kind === "key-pending") pending = next.value.pending;
      if (next.value.kind === "link-ready") break;
    }
    await flow.return(undefined);
    return pending!;
  }

  it("finds the gift a closed tab made and rebuilds its link, reading only the key's address", async () => {
    const w = createWorld();
    const pending = await sendThenCloseTab(w);
    const reads = w.chain.reads.length;
    const found = await recoverPendingGift({ publicClient: w.chain.client, vault: VAULT, origin: ORIGIN }, pending);
    expect(found?.giftId).toBe(1n);
    expect(parseLink(found!.link)).toEqual({ origin: ORIGIN, giftId: 1n, claimKey: pending.claimKey });
    expect(stringify(w.chain.reads.slice(reads)).toLowerCase()).not.toContain(pending.claimKey.slice(2));
  });

  it("returns null when the key has not made a gift", async () => {
    const w = createWorld();
    w.wallet.reject = (tx) => getAddress(tx.to) === VAULT;
    const run = await collect(sendGift(w.deps, gift()));
    expect(run.error).toMatchObject({ code: "declined" });
    expect(run.error!.stillHeld).toContain("Keep the saved gift key");
    const pending = (run.steps.find((s) => s.kind === "key-pending") as Extract<SendStep, { kind: "key-pending" }>).pending;
    expect(await recoverPendingGift({ publicClient: w.chain.client, vault: VAULT, origin: ORIGIN }, pending)).toBeNull();
  });

  it("scans only the newest 1,000 gifts, newest first, in batches, and keeps the record when the gift is older", async () => {
    const w = createWorld();
    const pending = await sendThenCloseTab(w);
    const someone = (n: number) => ({ token: STOCK, sender: OTHER, claimKey: privateKeyToAccount(keccak256(toHex(`other-${n}`))).address, expiry: 1n, state: 1, amount: 1n, sealedNote: "0x" as Hex });
    for (let n = 0; n < 999; n += 1) w.chain.addGift(someone(n));
    const deps = { publicClient: w.chain.client, vault: VAULT, origin: ORIGIN };
    const before = w.chain.stats.multicalls;
    expect((await recoverPendingGift(deps, pending))?.giftId).toBe(1n);
    expect(w.chain.stats.multicalls - before).toBe(10);
    w.chain.addGift(someone(999));
    await expect(recoverPendingGift(deps, pending)).rejects.toMatchObject({ code: "gift_not_found", stillHeld: expect.stringContaining("Keep the saved gift key") });
    await expect(recoverPendingGift(deps, { ...pending, claimKey: "0x12" })).rejects.toMatchObject({ code: "bad_input" });
  });
});
