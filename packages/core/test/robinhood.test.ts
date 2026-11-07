import { describe, expect, it } from "vitest";
import { createRobinhoodClient } from "../src/chain.js";
import { robinhood } from "../src/network.js";
import { heldAmount, handleHeldQuote } from "../src/quote.js";
import { getAddress, type PublicClient } from "viem";

describe("Robinhood testnet", () => {
  it("uses chain 46630 and test ETH for default RPC reads", () => {
    expect(createRobinhoodClient().chain?.id).toBe(46630);
    expect(robinhood.nativeCurrency.symbol).toBe("ETH");
    expect(robinhood.rpcUrls.default.http[0]).toBe("https://rpc.testnet.chain.robinhood.com");
  });
  it("converts a held-token quantity without rounding or floating point", () => {
    expect(heldAmount("1.123456789012345678", 18)).toBe(1123456789012345678n);
    expect(heldAmount("1.1234567", 6)).toBeNull();
    for (const text of ["0", "0.9", "101", "1e2", "-1", "NaN"]) expect(heldAmount(text, 18)).toBeNull();
  });
  it("rejects a restricted place before reading the chain", async () => {
    const response = await handleHeldQuote({ client: {} as PublicClient, vault: "0x0000000000000000000000000000000000000001" }, {}, { country: "IR" });
    expect(response.status).toBe(403);
  });
  it("quotes only listed tokens already held by the sender and refuses insufficient balances", async () => {
    const stock = getAddress("0x0000000000000000000000000000000000000002");
    const wallet = getAddress("0x0000000000000000000000000000000000000003");
    const vault = getAddress("0x0000000000000000000000000000000000000004");
    let balance = 10n * 10n ** 18n;
    const client = {
      getChainId: async () => 46630,
      readContract: async ({ functionName }: { functionName: string }) => {
        if (functionName === "listedTokens") return [stock];
        if (functionName === "decimals") return 18;
        if (functionName === "symbol") return "tNVDA";
        if (functionName === "balanceOf") return balance;
        throw new Error("No multiplier on an ordinary demo ERC-20.");
      },
      call: async () => ({ data: "0x" }),
    } as unknown as PublicClient;
    const body = { stock, wallet, usdAmount: "5" };
    expect(await handleHeldQuote({ client, vault }, body, { country: "GH" })).toEqual({ status: 200, body: { ok: true, step: "held", stock, usdAmount: "5", amount: "5000000000000000000" } });
    balance = 0n;
    expect((await handleHeldQuote({ client, vault }, body, { country: "GH" })).body).toEqual({ ok: false, error: "insufficient_stock" });
    expect((await handleHeldQuote({ client, vault }, { ...body, stock: wallet }, { country: "GH" })).body).toEqual({ ok: false, error: "not_listed" });
  });
});
