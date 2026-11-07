"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Certificate } from "@/components/hero/Certificate";
import { useMediaQuery } from "@/components/hero/useMediaQuery";
import { displayItalic } from "./fonts";

const TWEEN_MS = 300;

/** A number that glides to its new value over 300 ms, and jumps when the visitor prefers less motion. */
function useTweened(target: number): number {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [value, setValue] = useState(target);
  const shown = useRef(target);

  useEffect(() => {
    if (reduced) return;
    const from = shown.current;
    if (from === target) return;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / TWEEN_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      shown.current = from + (target - from) * eased;
      setValue(shown.current);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, reduced]);

  return reduced ? target : value;
}

// The certificate's own pen is drawn by the hero's scroll progress; here it is simply fully drawn.
const DRAWN = { "--hand": 1 } as CSSProperties;

/** What the friend will see: the certificate with the stock quantity, and the note under it. */
export function Preview({ stockName, amount, note }: { stockName: string | null; amount: number; note: string }) {
  const figure = useTweened(amount);
  return (
    <div className="send-preview">
      <p className="send-label send-label-small">A LITTLE PREVIEW</p>
      <div className="send-cert" style={DRAWN}>
        <Certificate
          figure={Number(figure.toFixed(4)).toString()}
          holding={stockName === null ? "STOCK GIFT" : `STOCK · ${stockName.toUpperCase()}`}
          worth="ROBINHOOD CHAIN TESTNET"
        />
      </div>
      <p className="send-preview-note" style={{ fontFamily: displayItalic.style.fontFamily }}>
        {note.trim() === "" ? "Your words make it theirs. Add a little note to finish your gift." : `“${note}”`}
      </p>
      <div className="send-preview-details"><span aria-hidden="true">♡</span><p>One link. A lovely surprise.<br /><span>They can open it with Google or email.</span></p></div>
    </div>
  );
}
