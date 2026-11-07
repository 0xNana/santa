"use client";

import type { RecoveryLine } from "./recovery";

/**
 * Shown at the top of the form when this browser holds a gift key from a send that did not finish.
 * "Find it" asks the chain whether that key made a gift, and the answer replaces the button's line.
 */
export function RecoveryBanner({
  lines,
  busy,
  onFind,
}: {
  lines: RecoveryLine[] | null;
  busy: boolean;
  onFind: () => void;
}) {
  const again = lines === null || lines.some((line) => line.kind === "in-flight" || line.kind === "error");
  return (
    <section className="send-banner send-rise" aria-label="A gift that did not finish">
      <p className="send-banner-text">You have a gift that didn&apos;t finish.</p>
      <div role="status" aria-live="polite">
        {(lines ?? []).map((line, index) => {
          if (line.kind === "found") {
            const id = line.giftId.toString();
            return <p className="send-banner-result" key={`${index}-${id}`}>Found gift {id}. Its link is in your gifts below. Delivery is sponsored.</p>;
          }
          if (line.kind === "in-flight") {
            return (
              <p className="send-banner-result" key={index}>
                Still in flight. Check again in a minute.
              </p>
            );
          }
          if (line.kind === "nothing") {
            return (
              <p className="send-banner-result" key={index}>
                No gift was made with that key, so nothing is waiting.
              </p>
            );
          }
          return (
            <p className="send-banner-result" key={index}>
              {line.message}
            </p>
          );
        })}
      </div>
      {again ? (
        <button type="button" className="send-secondary send-secondary-inline" onClick={onFind} disabled={busy}>
          Find it
        </button>
      ) : null}
    </section>
  );
}
