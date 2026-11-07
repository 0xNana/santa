# Initial Santa testnet release

## Runtime

- One Fly Machine and a persistent `santa_data` volume serve the Next.js app and SQLite records.
- The deployed SantaVault remains unchanged. Ten TSLA judge gifts are escrowed on Robinhood Chain Testnet; their code, seed, and pool configuration remain outside Git.
- Fly supplies the client address. A server-local GeoLite2 lookup resolves country/subdivision; no visitor IP is sent to a geolocation API. Unknown or restricted locations remain refused.
- The database initializes before API readiness succeeds. The first boot can take several minutes; subsequent boots reuse the persistent data.

## Verification

The release checks include the agent/core suites, five geolocation boundary tests, all 95 contract tests (including fuzz and invariant checks), web lint, TypeScript, a source-secret scan, and a production Docker build on Node 22. Two initial JavaScript timeouts under concurrent contract testing passed on rerun with two workers; no test timeout thresholds were changed.

## Dependency review

Next.js is patched to 16.4.5, Privy to 3.51.3, Zod 4 to 4.6.6, DOMPurify to 3.4.17, follow-redirects to 1.16.2, and decode-uri-component to 0.5.1. The production audit has no critical findings. High-severity findings remain in the transitive Zod 3 tree used by Privy/wallet packages; Zod 3 has no compatible patched release for the oversized constrained-collection advisory. Do not force Zod 4 into those consumers because its API differs.

Santa's request layer caps bodies before parsing, and its own request schemas use patched Zod 4. Third-party Zod 3 usage remains a known dependency risk; a wallet/auth migration is outside this release. Audit the lockfile again before subsequent releases and adopt an upstream fix when available.

## Rollback and checks

Verify `/`, `/send`, `/docs`, and `/api/stocks` after deployment. Confirm the stock list succeeds, judge configuration is open, and region controls reject unknown/restricted locations. Privy must allow the Fly origin before Google/email sign-in can complete; wallet claims need an eligible test recipient.

For subsequent releases, retain the previous Fly image reference and redeploy it with `fly deploy --image <previous-image> --ha=false`. Retain the same volume and runtime secrets. Do not restore an old SQLite snapshot over current claim/relayer records without reconciling chain state. This initial release has no earlier Santa image to roll back to; stop the Machine to suspend delivery while investigating a first-release failure.
