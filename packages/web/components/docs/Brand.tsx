import { VMark } from "@/components/hero/VMark";

/** The docs nav title: the gold V mark and the wordmark, the same pair as the site's top bar. */
export function Brand() {
  return (
    <span className="docs-brand" aria-label="Santa, home" role="img">
      <VMark width={12} />
      <span className="docs-wordmark">Santa</span>
    </span>
  );
}
