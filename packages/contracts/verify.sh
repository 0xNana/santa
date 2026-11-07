#!/usr/bin/env bash
# Blockscout verification on Robinhood Chain Testnet.
set -euo pipefail
cd "$(dirname "$0")"
[ "$#" -eq 2 ] || { echo "usage: ./verify.sh <vault-address> <ABI-encoded-constructor-args>" >&2; exit 2; }
forge verify-contract "$1" src/SantaVault.sol:SantaVault --chain 46630 \
    --verifier blockscout --verifier-url https://explorer.testnet.chain.robinhood.com/api/ \
    --constructor-args "$2" --watch
