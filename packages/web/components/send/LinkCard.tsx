"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";


const nothingToWatch = () => () => undefined;

const BULLETS = "•".repeat(8);

// The masked form shows where the link goes and hides the key: origin, /g/, the id, a #, eight bullets.
function maskedLink(link: string, giftId: string): string {
  try {
    return `${new URL(link).origin}/g/${giftId}#${BULLETS}`;
  } catch {
    return `/g/${giftId}#${BULLETS}`;
  }
}

/**
 * The finished gift: its link (hidden until the sender asks), copy and share buttons, and what the
 * gift flow is doing. The link is a prop only. It is never put in an address, a log or a request.
 */
export function LinkCard({
  link,
  giftId,
  onSendAnother,
}: {
  link: string;
  giftId: string;
  onSendAnother: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  // False on the server and during hydration, then true in browsers that have the share sheet.
  const canShare = useSyncExternalStore(
    nothingToWatch,
    () => typeof navigator.share === "function",
    () => false,
  );
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // The browser refused to copy, so the link is shown for the sender to copy by hand.
      setShown(true);
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: "A gift for you", url: link });
    } catch {
      // Closing the share sheet counts as an error here, and nothing needs to happen.
    }
  };

  return (
    <section className="send-card send-rise" aria-label="Your gift">
      <h2 className="send-card-title">Your gift is ready.</h2>
      <div className="send-field">
        <code className="send-field-text" data-shown={shown ? "true" : undefined}>
          {shown ? link : maskedLink(link, giftId)}
        </code>
        <button type="button" className="send-link send-link-small" onClick={() => setShown((value) => !value)} aria-pressed={shown}>
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      <div className="send-card-actions">
        <button type="button" className="send-primary" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy link"}
        </button>
        {canShare ? (
          <button type="button" className="send-secondary" onClick={() => void share()}>
            Share
          </button>
        ) : null}
      </div>
      <p className="send-warning">Anyone with this link can open the gift. Send it only to them.</p>
        <button type="button" className="send-link" onClick={onSendAnother}>
          Send another gift
        </button>
    </section>
  );
}
