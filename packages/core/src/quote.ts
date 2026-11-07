import { getAddress, parseUnits, zeroAddress, type Address, type PublicClient } from "viem";
import { z } from "zod";
import { balanceOf, readTokenInfo } from "./chain.js";
import { buildApproveVaultTx, MAX_GIFT_USD, MIN_GIFT_USD } from "./create.js";
import { checkEligibility } from "./eligibility.js";
import { readListedTokens } from "./vault.js";

export type HeldQuote = { ok: true; step: "held"; stock: Address; usdAmount: string; amount: string };
const inputSchema = z.strictObject({ stock: z.string().max(42), wallet: z.string().max(42), usdAmount: z.string().regex(/^\d{1,3}(\.\d{1,18})?$/) });
const fail = (status: number, error: string) => ({ status, body: { ok: false as const, error } });

/** Testnet quantities are token units. No real price feed, swap or payment facilitator is used. */
export async function handleHeldQuote(deps: { client: PublicClient; vault: Address; devAllowUnknownCountry?: boolean }, body: unknown, ctx: { country?: string | null; region?: string | null }) {
  const place = checkEligibility({ ...ctx, devAllowUnknown: deps.devAllowUnknownCountry === true }, true);
  if (!place.ok) return fail(403, place.reason);
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return fail(400, "bad_request");
  let stock: Address;
  let wallet: Address;
  try { stock = getAddress(parsed.data.stock); wallet = getAddress(parsed.data.wallet); }
  catch { return fail(400, "bad_request"); }
  if (wallet === zeroAddress) return fail(400, "bad_wallet");
  try {
    const listed = await readListedTokens(deps.client, deps.vault);
    if (!listed.includes(stock)) return fail(400, "not_listed");
    const info = await readTokenInfo(stock, deps.client);
    const amount = heldAmount(parsed.data.usdAmount, info.decimals);
    if (amount === null) return fail(400, "bad_amount");
    if (await balanceOf(stock, wallet, deps.client) < amount) return fail(400, "insufficient_stock");
    const approve = buildApproveVaultTx({ token: stock, amount, vault: deps.vault });
    await deps.client.call({ account: wallet, to: approve.to, data: approve.data });
    return { status: 200, body: { ok: true, step: "held", stock, usdAmount: parsed.data.usdAmount, amount: amount.toString() } satisfies HeldQuote };
  } catch { return fail(502, "chain_unavailable"); }
}

export function heldAmount(text: string, decimals: number): bigint | null {
  if (!/^\d{1,3}(\.\d{1,18})?$/.test(text) || !Number.isInteger(decimals) || decimals < 0 || decimals > 77) return null;
  if ((text.split(".")[1]?.length ?? 0) > decimals) return null;
  const amount = parseUnits(text, decimals);
  return amount >= parseUnits(MIN_GIFT_USD, decimals) && amount <= parseUnits(MAX_GIFT_USD, decimals) ? amount : null;
}
