# Santa on Robinhood Chain Testnet

Santa uses chain 46630 and test ETH for gas. The project, packages, CLI, UI, signatures, local storage and shared records use the Santa name.

SantaVault is deployed at [`0xCBE6dF9722be9c40d18ed3d6263e42C74312C441`](https://explorer.testnet.chain.robinhood.com/address/0xCBE6dF9722be9c40d18ed3d6263e42C74312C441). [deployment-testnet.json](deployment-testnet.json) records its owner, relayer, five listed tokens, deployment and funding transactions. The relayer was funded with 0.002 test ETH. Both vault settings in the local `.env` point to this deployment.

The sender gifts stock tokens they already hold, in quantities from 1 to 100 units. Claims are sponsored within the relayer’s configured limits. The retired BSC trading, wallet pairing and paid wrapping modules, scripts, endpoints, contracts and historical reports have been removed. The escrow, signature, recovery and relayer protections remain tested.

Old gift links, encrypted notes and records belong to their original chain, vault and signing domain. They are not migrated by a source rename. Use the original revision and records to handle old gifts; do not import them into Santa’s namespace.

Use `.env.example` for the current settings. The CLI requires its own `SANTA_AGENT_PRIVATE_KEY`. A hosted app requires shared Upstash records, a public origin and a production build with the matching vault address and Privy app ID. The local configuration uses one-process memory storage.

Network values follow [Robinhood’s official guide](https://docs.robinhood.com/chain/connecting/).
