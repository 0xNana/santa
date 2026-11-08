<p align="center"><img src="packages/web/public/logo-square.png" alt="Santa" width="72"></p>

# Santa

**Send stocks to the people you love.**

Santa is an RWA (real-world assets) gifting app that makes sending tokenized stocks to loved ones as simple as sharing a link. For a birthday, a milestone, or a little “just because,” choose a stock, add a personal note, and give someone a gift they can make their own.

Pick a stock you already hold, choose how much to send, and wrap it in a private gift link. Your loved one opens the link, signs in with Google or email, and receives the stock in a wallet created for them. No wallet app or seed phrase needed; Santa pays the claim’s network fee.

**Currently on Robinhood Chain Testnet.** Gifts use testnet stock tokens with no monetary value or equity ownership rights. Santa is an independent project, not a Robinhood product.

## A little stock. A lot of love.

- **Choose a stock:** the current testnet vault supports TSLA, AMD, AMZN, NFLX, and PLTR.
- **Make it personal:** add an encrypted note for the person you’re gifting.
- **Send it anywhere you share a link:** copy the private gift link into a message to your loved one.
- **Give them a simple welcome:** they open their gift with Google or email; Santa creates their wallet and sponsors the claim fee.
- **Keep a way back:** if the gift expires unopened, you can reclaim the stock.

Santa gifts existing holdings. The current flow does not buy stocks or charge a wrapping fee.

## Network

| Setting | Value |
| --- | --- |
| Chain | Robinhood Chain Testnet |
| Chain ID | 46630 (`0xb626`) |
| Gas | Test ETH |
| Public RPC | https://rpc.testnet.chain.robinhood.com |
| Explorer | https://explorer.testnet.chain.robinhood.com |
| Faucet | https://faucet.testnet.chain.robinhood.com/ |

Source: [Robinhood network documentation](https://docs.robinhood.com/chain/connecting/).

## Run

Use Node 22 and npm.

```sh
npm ci
cp .env.example .env
npm run dev --workspace=@santa/web
```

Deploy the vault and fill in `.env` first:

```sh
cd packages/contracts
./install-deps.sh
./deploy.sh testnet
```

The script requires `DEPLOYER_PRIVATE_KEY` and `SANTA_RELAYER_ADDRESS`, and accepts `SANTA_OWNER_ADDRESS`. Fund the deployer and relayer with test ETH. If an owner address differs from the deployer, it must accept the two-step ownership handover.

The deployment requires `SANTA_STOCK_ADDRESSES`, a comma-separated list of existing testnet ERC-20s. The current vault lists TSLA, AMD, AMZN, NFLX and PLTR. Their addresses are in `.env.example` and [the deployment record](docs/deployment-testnet.json). Obtain stock tokens through the testnet faucet. Available stocks are discovered from the vault.

Set both `SANTA_VAULT_ADDRESS` (server) and `NEXT_PUBLIC_SANTA_VAULT_ADDRESS` (browser) to the new vault address. Rebuild after changing the public setting. No deployment address is bundled by default, and sending remains disabled until configured.

Also configure:

- `RELAYER_PRIVATE_KEY`: must match the vault’s relayer; keep it separate from the owner and sender.
- `NEXT_PUBLIC_PRIVY_APP_ID`: a Privy app with Robinhood Chain Testnet enabled.
- `SANTA_PUBLIC_ORIGIN`: the app origin, such as `http://localhost:3000` locally.
- `SANTA_SQLITE_PATH` on a persistent volume for one Fly Machine, both Upstash REST settings for multiple hosts, or `SANTA_ALLOW_MEMORY_STORE=1` for local development.
- `SANTA_DEV_COUNTRY=GH` for local requests. The existing conservative location/declaration checks remain enabled.

## Deploy to Fly.io

Use the root `fly.toml` and Dockerfile for a single Machine with persistent SQLite storage. See [the deployment guide](docs/fly-deployment.md) for app creation, runtime secrets, build arguments and server-side geolocation.

## Send from the CLI

Use a dedicated test wallet via `SANTA_AGENT_PRIVATE_KEY`:

```sh
npm run santa -- status
npm run santa -- gift TSLA 5 --note "For your next chapter. With love." --days 30
```

Quantities are stock token units, from 1 to 100, rather than dollar amounts. The CLI asks before sending; `--yes` bypasses its prompt. Private links are saved with mode 0600 under `gifts/46630/<vault>/`. Pending keys are saved before submission and can be recovered with `status`.

## How it works

1. The browser checks the available stocks, quantity and wallet balance. The server validates the held-token quote independently.
2. The sender approves exactly the selected quantity and creates the gift in SantaVault.
3. A random claim key and encrypted note stay local; the gift link carries the key in its URL fragment. The key is saved before submission.
4. The recipient’s wallet and claim key sign for the exact gift, vault and chain. The relayer submits the claim and pays test ETH.
5. After expiry, refunds return unclaimed stock tokens to their original sender. The owner cannot withdraw open gift liabilities.

The current testnet experience gifts stocks the sender already holds, with sponsored delivery. Retired trading and payment endpoints have been removed.

See [ARCHITECTURE.md](ARCHITECTURE.md), the app’s `/docs`, [migration notes](docs/robinhood-migration.md), and [PNG/SVG brand assets](docs/brand-assets.md).

## Verify

```sh
npm test
npm run typecheck --workspace=@santa/web
npm run lint --workspace=@santa/web
npm run build --workspace=@santa/web
cd packages/contracts
forge test
```

SantaVault is deployed at [`0xCBE6dF9722be9c40d18ed3d6263e42C74312C441`](https://explorer.testnet.chain.robinhood.com/address/0xCBE6dF9722be9c40d18ed3d6263e42C74312C441). See [the deployment record](docs/deployment-testnet.json) for owner, relayer, tokens and transaction hashes.
