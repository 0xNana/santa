"use client";

import { useState } from "react";

const TOKENS = [
  { symbol: "TSLA", name: "Tesla", initial: "T" },
  { symbol: "AMZN", name: "Amazon", initial: "a" },
  { symbol: "NFLX", name: "Netflix", initial: "N" },
] as const;

/** An illustrative gift; these choices never submit a transaction. */
export function GiftLetter() {
  const [selected, setSelected] = useState(0);
  const token = TOKENS[selected] ?? TOKENS[0];

  return (
    <div className="gift-showcase">
      <span className="gift-spark gift-spark-one" aria-hidden="true">✳</span>
      <span className="gift-spark gift-spark-two" aria-hidden="true">✧</span>
      <div className="gift-envelope" aria-hidden="true" />
      <div className="gift-letter" aria-live="polite" aria-atomic="true">
        <div className="gift-letter-top"><span>SANTA</span><span>JUST FOR YOU</span></div>
        <span className="gift-token-mark" data-symbol={token.symbol} aria-hidden="true">{token.initial}</span>
        <p className="gift-letter-intro">A little something.<br /><em>A whole lot of thought.</em></p>
        <div className="gift-letter-amount"><strong>5</strong><span>{token.name} stock units</span></div>
        <p className="gift-letter-note">“Here’s to trying something new.”</p>
        <div className="gift-letter-bottom"><span>Sent with a little love</span><span aria-hidden="true">♡</span></div>
      </div>
      <div className="gift-envelope-front" aria-hidden="true"><span className="gift-seal">s</span></div>
      <div className="gift-preview-controls">
        <div className="gift-token-options" role="group" aria-label="Illustrative stock gift">
          {TOKENS.map((item, index) => (
            <button type="button" key={item.symbol} aria-pressed={selected === index} onClick={() => setSelected(index)}>{item.name}</button>
          ))}
        </div>
        <p>EXAMPLE STOCK GIFT · TESTNET</p>
      </div>
    </div>
  );
}
