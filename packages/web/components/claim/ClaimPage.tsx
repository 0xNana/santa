"use client";

import "./zodNoEval";
import { useEffect, useState } from "react";
import Link from "next/link";
import { SantaPrivy } from "@/components/privy/SantaPrivy";
import { ClaimFlow } from "./ClaimFlow";
import { takeClaimKey, type ClaimKeyResult } from "./claimKey";
import "./claim.css";

export function ClaimPage({ giftId, nonce }: { giftId: string; nonce: string | undefined }) {
  const [boot, setBoot] = useState<ClaimKeyResult | null>(null);

  // The key leaves the address bar here, before Privy exists on the page. It waits one task so that
  // Next has finished hooking into history first: only then does the router learn the new address,
  // and a later router refresh cannot put the key back.
  useEffect(() => {
    const timer = window.setTimeout(() => setBoot(takeClaimKey(giftId)), 0);
    return () => window.clearTimeout(timer);
  }, [giftId]);

  if (boot === null) return (
    <div className="claim-page" data-boot="waiting" data-scene="none">
      <header className="claim-bar">
        <Link className="claim-brand" href="/" aria-label="Santa, home"><span className="claim-wordmark">santa</span></Link>
      </header>
      <main className="claim-panel" id="main-content" role="status" aria-busy="true">
        <p className="claim-meta">A LITTLE SOMETHING FOR YOU</p>
        <h1 className="claim-h">Finding your gift…</h1>
        <span className="claim-skel" aria-hidden="true" />
        <span className="claim-skel claim-skel-short" aria-hidden="true" />
      </main>
    </div>
  );
  return (
    <SantaPrivy nonce={nonce}>
      <ClaimFlow giftId={giftId} boot={boot} />
    </SantaPrivy>
  );
}
