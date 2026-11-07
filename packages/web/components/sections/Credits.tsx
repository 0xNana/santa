"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Fraunces } from "next/font/google";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { Grain } from "@/components/hero/Grain";
import { VMark } from "@/components/hero/VMark";
import { VAULT, VAULT_CONFIGURED } from "@/lib/chain";
import { addressUrl, shortHex, sourceUrl } from "@/lib/proof";
import "./sections.css";

// The root layout loads Fraunces upright only, so the italic cut is loaded here, as the hero does.
const displayItalic = Fraunces({
  subsets: ["latin"],
  style: ["italic"],
  axes: ["opsz", "SOFT", "WONK"],
  display: "swap",
});


const RISE_PIXELS = 24;
const RISE_SECONDS = 0.6;
const RISE_STAGGER_SECONDS = 0.08;

type Credit = { role: string; name: ReactNode };

const vaultName = VAULT_CONFIGURED ? (
  <a className="draw-link" href={addressUrl(VAULT)} target="_blank" rel="noopener noreferrer">
    {`SantaVault, ${shortHex(VAULT)}`}
  </a>
) : "Testnet deployment pending";

const CREDITS: readonly Credit[] = [
  { role: "THE TOKENS", name: "Robinhood testnet stock tokens, no monetary value" },
  { role: "THE WALLET", name: "Your connected Ethereum wallet" },
  { role: "THE DELIVERY", name: "Sponsored by Santa" },
  { role: "THE SIGN-IN", name: "Privy" },
  { role: "THE VAULT", name: vaultName },
  { role: "THE CHAIN", name: "Robinhood Chain Testnet · 46630" },
];

export function Credits() {
  const list = useRef<HTMLDListElement>(null);

  useEffect(() => {
    const element = list.current;
    if (!element) return;
    gsap.registerPlugin(ScrollTrigger);
    const mediaMatcher = gsap.matchMedia();
    mediaMatcher.add("(prefers-reduced-motion: no-preference)", () => {
      const rows = Array.from(element.querySelectorAll<HTMLElement>(".credits-row"));
      gsap.set(rows, { opacity: 0, y: RISE_PIXELS });
      // The batch groups rows that enter together and plays each group in page order.
      ScrollTrigger.batch(rows, {
        start: "top 92%",
        once: true,
        onEnter: (batch) =>
          gsap.to(batch, { opacity: 1, y: 0, duration: RISE_SECONDS, ease: "power3.out", stagger: RISE_STAGGER_SECONDS, clearProps: "opacity,transform" }),
      });
    });
    return () => mediaMatcher.revert();
  }, []);

  return (
    <footer className="credits">
      <div className="credits-column">
        <div className="credits-mark">
          <VMark width={28} />
        </div>
        <p className="credits-santa">SANTA</p>
        <p className="credits-tagline" style={{ fontFamily: displayItalic.style.fontFamily }}>
          a gift in one link
        </p>
        <p className="credits-meaning">A thoughtful gift, delivered with a link.</p>

        <dl className="credits-list" ref={list}>
          {CREDITS.map((credit) => (
            <div className="credits-row" key={credit.role}>
              <dt className="credits-role">{credit.role}</dt>
              <dd className="credits-name">{credit.name}</dd>
            </div>
          ))}
        </dl>

        <div className="credits-rule" aria-hidden="true" />
        <nav className="credits-links" aria-label="Footer">
          <Link className="draw-link" href="/docs" prefetch={false}>
            Docs
          </Link>
          {VAULT_CONFIGURED ? <>
            <a className="draw-link" href={addressUrl(VAULT)} target="_blank" rel="noopener noreferrer">Testnet contract</a>
            <a className="draw-link" href={sourceUrl(VAULT)} target="_blank" rel="noopener noreferrer">Contract source</a>
          </> : null}
        </nav>
        <p className="credits-fine">
          Santa runs on Robinhood Chain Testnet. Testnet stock tokens have no monetary value or equity ownership rights.
        </p>
      </div>
      <Grain />
    </footer>
  );
}
