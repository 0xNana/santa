# Deploy Santa on Fly.io

The root `fly.toml` runs Santa on one shared-CPU Machine with 1 GB RAM in London (`lhr`), HTTPS, an always-on server, a 1 GB `santa_data` volume at `/data`, and a readiness check against `/api/stocks`. SQLite stores claims, atomic locks, exact relayer counters and rate limits at `/data/santa.sqlite`. Redis is optional and is not used by this configuration.

## Create the app and deploy

Run commands from the repository root. The configured app name is `santa-robinhood-testnet`. If it is unavailable, change `app` and both `SANTA_PUBLIC_ORIGIN` values in `fly.toml` before proceeding.

```sh
fly auth login
fly apps create santa-robinhood-testnet
fly volumes create santa_data --app santa-robinhood-testnet --region lhr --size 1
fly config validate --strict
```

Set **only** the dedicated `RELAYER_PRIVATE_KEY` as a Fly runtime secret. Never import the entire local `.env`: it also contains the owner/deployer key. This command passes just the relayer key over stdin without printing it or placing it in command arguments:

```sh
node --input-type=module -e 'import {readFileSync} from "node:fs"; import {parseEnv} from "node:util"; const {RELAYER_PRIVATE_KEY:k}=parseEnv(readFileSync(".env","utf8")); if(!/^0x[0-9a-fA-F]{64}$/.test(k??"")) process.exit(1); process.stdout.write(`RELAYER_PRIVATE_KEY=${k}\n`);' | fly secrets import --app santa-robinhood-testnet
fly deploy --ha=false
fly scale count 1
fly checks list
```

The public vault and existing public Privy app ID are configured as build arguments and runtime settings. Add `https://santa-robinhood-testnet.fly.dev` to the Privy app's allowed origins and redirect settings. Rebuild after changing public build arguments. Optional judge-pool secrets must also be set through Fly secrets.

The Docker build uses an allowlist for its context. Local `.env` files, wallet keys, private gift files, contract broadcast/cache files and Git history are excluded. The image runs the standalone Next.js server as the `node` user; its entrypoint sets ownership of the mounted data directory before dropping privileges.

## Location checks

Fly requests use the proxy-provided `Fly-Client-IP` for client limits and a local `ip-location-api` database lookup for country and subdivision. Visitor IP addresses are not sent to a geolocation API. The code ignores client-supplied Vercel/Cloudflare country headers and does not treat `Fly-Region` as the visitor’s country. Unknown locations, lookup failures, restricted countries, and restricted Ukrainian subdivisions remain refused by the existing eligibility policy. Neither development geography override is enabled.

GeoLite2 data is initialized under `/data/geoip` on first boot and refreshed automatically by the library; the first readiness check can take several minutes. `/api/stocks` returns ready only after the database and server dependencies initialize. This product includes GeoLite2 data created by [MaxMind](https://www.maxmind.com/), available under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) and the [GeoLite2 EULA](https://www.maxmind.com/en/geolite2/eula). See the [lookup library documentation](https://github.com/sapics/ip-location-api) and [Fly request-header documentation](https://docs.fly.io/networking/request-headers).

## Persistence and operations

Keep **exactly one Machine** with this volume. SQLite coordinates concurrent requests and multiple local connections using WAL and immediate write transactions. Independent volumes on additional Machines would not share claim locks, nonce counters or relayer spend. Use a shared database or explicit replication before scaling across Machines.

Single-Machine deployments have brief downtime during updates and host failures. Fly volume snapshots are retained for 14 days; maintain a separate backup using SQLite's backup API or an offline copy after stopping the server. Do not copy only the main SQLite file while WAL writes are active. Restoring stale relayer records needs reconciliation with chain state before enabling claims.

The `/api/stocks` health check verifies server configuration, persistent store initialization, the on-chain relayer match, and RPC token reads. A chain outage can make this readiness check fail.

Sources: [Fly configuration](https://docs.fly.io/reference/configuration), [Next.js deployment](https://docs.fly.io/js/frameworks/nextjs), [request headers](https://docs.fly.io/networking/request-headers), [volumes](https://docs.fly.io/volumes/overview).
