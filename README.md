<p align="center">
  <img src="packages/web/public/logo-square.png" alt="Santa" width="96">
</p>

# Santa

**Send a thoughtful stock gift to someone you love.**

Santa is a Stock Token gifting app on Robinhood Chain Testnet. Choose a token you already hold, add a personal note, and share a private gift link. Your loved one opens the link, signs in with Google or email, and claims into an embedded wallet. Santa sponsors the claim's network fee.

Built for birthdays, milestones, and everyday generosity, Santa makes an onchain gift feel personal and approachable.

[Testnet demo](https://santa-robinhood-testnet.fly.dev) · [Architecture](ARCHITECTURE.md) · [Deployment guide](docs/fly-deployment.md)

> **Testnet only.** Gifts use testnet Stock Tokens with no monetary value or ownership rights in the referenced companies. Santa is independent and is not affiliated with or endorsed by Robinhood. The demo uses a Fly.io trial, which stops Machines after five minutes; availability is limited.

## Features

- **Private gift links:** wrap an existing token holding and share it with a loved one.
- **Personal notes:** include an encrypted message with each gift.
- **Simple claiming:** Google or email sign-in creates an embedded wallet through Privy.
- **Sponsored claims:** the relayer pays the recipient's claim fee in test ETH.
- **Expiry and refunds:** choose a 7-, 30-, or 90-day expiry; the original sender can request a refund after an unclaimed gift expires.
- **Web and CLI:** send from the browser or a dedicated CLI wallet.

The current vault supports **TSLA, AMD, AMZN, NFLX, and PLTR** testnet tokens. Gift quantities are **1–100 token units**, rather than dollar amounts. Santa transfers existing holdings; it does not purchase stocks or charge a wrapping fee. Senders pay test ETH for approval and gift creation.

## Stock Tokens and RWAs

Real-world assets (RWAs) are a broad category that includes onchain representations of financial assets such as stocks and bonds, as well as physical assets. See [Ethereum's RWA overview](https://ethereum.org/real-world-assets/).

Robinhood describes its live **Stock Tokens** as tokenised debt securities that provide economic exposure to underlying shares or ETFs, without granting legal or beneficial rights in those underlying securities. Its approved terminology is **Stock Tokens**. See the [Stock Token documentation](https://docs.robinhood.com/chain/stock-tokens/) and [terminology requirements](https://docs.robinhood.com/chain/terms-of-service/).

Santa currently demonstrates this gifting experience using testnet tokens. These test assets should not be presented as actual company shares or as having real-world backing or monetary value.

## How it works

1. **Choose a gift.** Connect a funded sender wallet, select an available token and quantity, and add a note and expiry.
2. **Wrap it.** Approve the exact token amount and deposit it into `SantaVault`. The browser saves the claim key before submission.
3. **Share the link.** The claim key is carried in the URL fragment. Share the complete link directly with the recipient.
4. **Claim it.** The recipient signs in and authorizes delivery to their wallet. The server validates the claim and the relayer submits the transaction.
5. **Recover expired gifts.** If a gift expires unclaimed, its original sender can submit a refund transaction. Refunds are not automatic.

Anyone holding the complete gift link can claim it. Treat it as a secret. The server cannot recover a lost claim key.

## Tech stack

| Layer | Technology |
| --- | --- |
| Web | Next.js, React, TypeScript, Tailwind CSS |
| Authentication and wallets | Privy, viem |
| Shared application logic | TypeScript, Zod |
| Contracts | Solidity, OpenZeppelin, Foundry |
| Persistence | SQLite for a single host, or Upstash Redis for multiple hosts |
| Hosting | Fly.io, Docker |

## Repository structure

```text
packages/
  web/         Next.js app, API routes, and user documentation
  core/        Shared validation, chain integration, and server services
  agent/       Command-line gifting client
  contracts/   SantaVault, deployment scripts, and Solidity tests
docs/          Deployment records, release checks, and project guides
ARCHITECTURE.md
```

## Getting started

### Prerequisites

- Node.js **22.x** and npm.
- A Privy app configured for Robinhood Chain Testnet and your local origin.
- Separate testnet deployer, relayer, and sender wallets, funded as needed with test ETH.
- Testnet Stock Tokens for the sender, available from the [faucet](https://faucet.testnet.chain.robinhood.com/).
- [Foundry](https://getfoundry.sh/) to deploy or test the contracts.

### Install

```sh
git clone https://github.com/0xNana/santa.git
cd santa
npm ci
cp .env.example .env
```

The web app, shared server code, and CLI load the repository-root `.env`. Use [`.env.example`](.env.example) as the complete configuration reference. Never commit `.env` or wallet keys.

### Configure and deploy a vault

For an independent installation, set `DEPLOYER_PRIVATE_KEY`, `SANTA_RELAYER_ADDRESS`, and `SANTA_STOCK_ADDRESSES` in `.env`. The example includes the five testnet token addresses. Fund the deployer and relayer with test ETH, then run:

```sh
./packages/contracts/install-deps.sh
./packages/contracts/deploy.sh testnet
```

Set both vault address variables below to the deployed address. `RELAYER_PRIVATE_KEY` must belong to that vault's configured relayer. The demo vault requires its existing relayer; a new installation should use its own vault and keys.

`SANTA_OWNER_ADDRESS` is optional. If it differs from the deployer, the designated owner must accept the two-step ownership handover.

### Configure the app

| Variable | Purpose |
| --- | --- |
| `ROBINHOOD_RPC_URL` | Testnet RPC; the example provides the public endpoint. |
| `SANTA_VAULT_ADDRESS` | Vault address used by the server and CLI. |
| `NEXT_PUBLIC_SANTA_VAULT_ADDRESS` | Same vault address, bundled into the browser at build time. |
| `RELAYER_PRIVATE_KEY` | Dedicated server wallet that sponsors claims; must match the vault's relayer. |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Public Privy app identifier; configure allowed origins and the testnet. |
| `SANTA_PUBLIC_ORIGIN` | App origin, such as `http://localhost:3000`. |
| `SANTA_SQLITE_PATH` | Absolute path to a persistent SQLite database for a single host. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Shared-store alternative to SQLite; configure both together. |
| `SANTA_ALLOW_MEMORY_STORE` | Set to `1` only for local development without a persistent store. |
| `SANTA_DEV_COUNTRY` | Local country override, such as `GH`; do not use on the hosted app. |

Choose one storage option: SQLite, Upstash, or local development memory. Memory contents disappear when the process stops. Public `NEXT_PUBLIC_` settings require a rebuild after changes. Server wallet keys must never use that prefix.

### Start locally

```sh
npm run dev --workspace=@santa/web
```

Open [localhost:3000](http://localhost:3000). User documentation is available at `/docs`. Sending and claiming require the configured vault, Privy app, relayer, and store. Location and eligibility checks apply to the gifting flow.

## CLI usage

Set `SANTA_AGENT_PRIVATE_KEY` to a dedicated sender test wallet in `.env`, separate from the deployer and relayer. Configure the same vault used by the app.

```sh
npm run santa -- status
npm run santa -- gift TSLA 5 --note "For your next chapter. With love." --days 30
```

The CLI asks for confirmation before sending; `--yes` skips that prompt. It saves private gift links with file mode `0600` under `gifts/46630/<vault>/`, and saves pending keys before submission. Use `status` to recover pending gifts. Keep these files private.

See the [CLI guide](packages/web/content/docs/agent.mdx) for details.

## Development and verification

Run these commands from the repository root:

```sh
npm test
npm run typecheck --workspace=@santa/core
npm run typecheck --workspace=@santa/agent
npm run typecheck --workspace=@santa/web
npm run lint --workspace=@santa/web
npm run build --workspace=@santa/web
forge test --root packages/contracts
```

Install the pinned contract dependencies with `./packages/contracts/install-deps.sh` before running Foundry tests. See [release checks](docs/release-checks.md) for recorded validation and remaining limitations.

## Network and deployment

| Setting | Value |
| --- | --- |
| Network | Robinhood Chain Testnet |
| Chain ID | `46630` (`0xb626`) |
| Gas token | Test ETH |
| RPC | <https://rpc.testnet.chain.robinhood.com> |
| Explorer | <https://explorer.testnet.chain.robinhood.com> |
| Faucet | <https://faucet.testnet.chain.robinhood.com/> |
| Demo vault | [`0xCBE6dF9722be9c40d18ed3d6263e42C74312C441`](https://explorer.testnet.chain.robinhood.com/address/0xCBE6dF9722be9c40d18ed3d6263e42C74312C441) |

See [Robinhood's network documentation](https://docs.robinhood.com/chain/connecting/) and the [deployment record](docs/deployment-testnet.json) for token addresses, roles, and transaction hashes.

The root `Dockerfile` and `fly.toml` configure a single Fly Machine with a persistent volume for SQLite and the local geolocation database. Follow the [Fly deployment guide](docs/fly-deployment.md) for runtime secrets, build arguments, initialization, backups, and trial limitations. Keep deployer keys local; upload only the runtime secrets required by the hosted app.

## Security and limitations

- Keep claim links, pending keys, judge credentials, and wallet keys private.
- Claim authorization is bound to the recipient wallet, gift, vault, and chain; a holder of the link can authorize their own wallet.
- Notes are encrypted, while token transfers and gift state are public onchain.
- Eligibility checks and relayer gas budgets can prevent a claim from proceeding.
- The contract owner cannot withdraw tokens reserved for open gifts.
- This repository targets Robinhood Chain Testnet. A live financial product would require separate asset, eligibility, and operational review.

Read the [security guide](packages/web/content/docs/security.mdx) and [contract documentation](packages/web/content/docs/contracts.mdx) before operating a deployment.

## Documentation

- [Architecture and trust boundaries](ARCHITECTURE.md)
- [User getting started guide](packages/web/content/docs/getting-started.mdx)
- [API reference](packages/web/content/docs/api.mdx)
- [Fly deployment](docs/fly-deployment.md)
- [Release checks](docs/release-checks.md)
- [Robinhood Chain migration notes](docs/robinhood-migration.md)
- [Brand assets](docs/brand-assets.md)
