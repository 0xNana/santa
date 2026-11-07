#!/usr/bin/env bash
# Deploy Santa to Robinhood Chain Testnet, or rehearse against a local Anvil node.
set -euo pipefail
cd "$(dirname "$0")"
set +x
umask 077
if [ -f ../../.env ]; then
    set -a
    source ../../.env
    set +a
fi
case "${1:-}" in
    testnet) rpc="${ROBINHOOD_RPC_URL:-https://rpc.testnet.chain.robinhood.com}"; expected=46630 ;;
    local) rpc="${2:-http://127.0.0.1:8545}"; expected=31337
        [[ "$(cast client --rpc-url "$rpc")" == anvil/* ]] || { echo "Local target must be Anvil." >&2; exit 1; } ;;
    *) echo "usage: ./deploy.sh testnet | ./deploy.sh local [rpc-url]" >&2; exit 2 ;;
esac
[ "$(cast chain-id --rpc-url "$rpc")" = "$expected" ] || { echo "RPC is on the wrong chain." >&2; exit 1; }
: "${DEPLOYER_PRIVATE_KEY:?Set DEPLOYER_PRIVATE_KEY}"
: "${SANTA_RELAYER_ADDRESS:?Set SANTA_RELAYER_ADDRESS}"
: "${SANTA_STOCK_ADDRESSES:?Set SANTA_STOCK_ADDRESSES to existing ERC-20 addresses}"
forge script script/Deploy.s.sol:Deploy --rpc-url "$rpc" --broadcast --slow
