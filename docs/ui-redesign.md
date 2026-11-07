# Santa interface

Santa is an RWA stock-gifting experience, currently on Robinhood Chain Testnet, for senders with an Ethereum wallet and recipients who can sign in with Google or email. The interface should make preparing, sharing, and opening a gift easy to understand.

## Design contract

- Warm ivory surfaces, oxblood actions, serif headlines, and restrained paper details build on Santa's envelope identity.
- Home prioritizes Send a gift, offers an explicitly illustrative gift preview, explains three steps without scroll pinning, and preserves the judge demo.
- The composer labels stock, quantity, private note, and expiry; keeps the editable form before its preview on mobile; and preserves recovery, wallet, and transaction state handling.
- Claim pages use the same surface and action palette. Certificates retain their own dark burgundy/gold palette for readability.
- Visible keyboard focus, native buttons, accessible names, reduced-motion support, and layouts from 320px upward are required.
- Lead with sending stocks to loved ones; describe the environment as testnet. Testnet stock tokens have no monetary value or equity ownership rights. No invented prices, balances, activity, or delivery guarantees.

## Scope and verification

Presentation lives in `packages/web/app` and `packages/web/components`. Existing React/TypeScript conventions apply: named components, semantic markup, and CSS tokens. No new dependencies, backend changes, or changes to gift keys and signing.

Implement in order: shared tokens/navigation and home; composer and preview; claim visual alignment. Verify with `npm run lint --workspace=@santa/web`, `npm run typecheck --workspace=@santa/web`, `npm test`, and `npm run build --workspace=@santa/web`. Use `npm run dev --workspace=@santa/web` for runtime review. Keep the existing in-progress repository work intact.

## Verification notes

- Existing agent/core suites: 319 tests passed.
- Web lint and TypeScript checks passed. Production build passed, with a warning from Privy's nested `ox` dependency about a dynamic dependency expression.
- Local HTTP checks returned 200 for `/`, `/send`, `/docs`, and `/g/1`. The four server-rendered routes have one primary heading and a skip-link target.
- Text, muted text, and primary-action token pairs meet 4.5:1 contrast.
- Browser preview host was unavailable. Interactive wallet/claim execution, viewport screenshots, and browser accessibility checks still need visual/runtime review in a browser.
