import type { Metadata } from "next";
import { headers } from "next/headers";
import { SantaPrivy } from "@/components/privy/SantaPrivy";
import { SendPage } from "@/components/send/SendPage";

// The script nonce is per request, so this page must be rendered for each one.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Send a gift",
  description: "Send stocks to someone you love. Pick a stock, add a personal note, and share a gift link. Currently on Robinhood Chain Testnet.",
};

export default async function Send() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <SantaPrivy nonce={nonce}>
      <SendPage />
    </SantaPrivy>
  );
}
