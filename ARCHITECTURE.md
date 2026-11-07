# Santa architecture

Santa is a TypeScript workspace with a Next.js web app, a framework-independent API/core, a CLI and Solidity contracts. Its active network is Robinhood Chain Testnet, chain 46630, with test ETH for gas.

| Package | Responsibility |
| --- | --- |
| `packages/web` | Landing page, sending, claim links, judge handouts, docs and share images |
| `packages/core` | Token reads, held-token quotes, encrypted links, claim signatures, HTTP handlers, shared store and relayer |
| `packages/agent` | Dedicated test-wallet CLI; private pending-key and link files |
| `packages/contracts` | SantaVault escrow and deployment scripts |

## Network and deployment

`packages/core/src/network.ts` is the shared viem chain definition. Core readers verify `eth_chainId` before reading money state. Wallets switch to 46630 before signing. Browser RPC access uses the public testnet endpoint permitted by the CSP; server RPC credentials remain server-only.

The server requires `SANTA_VAULT_ADDRESS`. The browser requires `NEXT_PUBLIC_SANTA_VAULT_ADDRESS` at build time. There is no previous-network fallback. The server verifies its relayer matches the deployed vault and rejects a mismatched public vault setting when supplied.

## Send

The UI selects tokens from the vault’s `listedTokens()` result, with names and decimals read from each ERC-20. Testnet token quantities have no dollar valuation. `/api/quote` validates shape, place, allowlist, precision and balance, and simulates an exact approval. The browser validates the reply and builds its own approval, registration proof and create transaction.

Before creation, a pending record stores the random claim key locally. After mining, the client verifies actual transaction calldata, receipt and stored gift fields. Only then does it construct and save the link, then remove the pending record. Recovery searches for the same key and sender if receipt confirmation was interrupted.

## Claim

The gift fragment is removed from the address bar before sign-in is loaded. Privy creates a wallet via email or Google sign-in. Claim signatures use EIP-712 name `Santa`, version `1`, chain 46630 and the deployed vault. The recipient signs proof of wallet ownership. The server checks the gift and submits through the relayer; the browser verifies the receipt before showing success.

Delivery is sponsored for all testnet gifts. There is no paid wrap gate. SQLite on a persistent Fly volume coordinates locks, limits and retries on one Machine. Upstash supports deployments across hosts. In-memory records require an explicit local-development flag.

## Contracts

SantaVault is a standalone escrow for ordinary ERC-20s. It retains exact deposit accounting, claim key registration, one-use claim keys, expiry, refunds to the original sender, pause controls and two-step ownership. Tokens enforce their own transfer restrictions.


The deployed vault and its five testnet stock tokens are recorded in [docs/deployment-testnet.json](docs/deployment-testnet.json).
