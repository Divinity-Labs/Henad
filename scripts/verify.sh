#!/usr/bin/env bash
# Verifies a deployed Henad contract on both Monad explorers (docs/INTEGRATION-FACTS.md §14.5).
#   bash scripts/verify.sh <address> <path:ContractName> [constructor-args-hex] [chain-id]
# MonadVision reads its own Sourcify server (not sourcify.dev); Monadscan is Etherscan V2
# and needs ETHERSCAN_API_KEY in the environment.
set -euo pipefail
ADDR=${1:?address}; NAME=${2:?path:ContractName}; ARGS=${3:-}; CHAIN=${4:-143}
FORGE=${FORGE:-$HOME/.foundry/bin/forge}
cd "$(dirname "$0")/../contracts"

ARGFLAG=()
if [[ -n "$ARGS" ]]; then ARGFLAG=(--constructor-args "$ARGS"); fi

echo "== Sourcify (MonadVision) =="
"$FORGE" verify-contract --chain "$CHAIN" --verifier sourcify \
  --verifier-url https://sourcify-api-monad.blockvision.org/ --watch "${ARGFLAG[@]}" "$ADDR" "$NAME"

echo "== Etherscan V2 (Monadscan) =="
: "${ETHERSCAN_API_KEY:?set ETHERSCAN_API_KEY}"
"$FORGE" verify-contract --chain "$CHAIN" --verifier etherscan \
  --etherscan-api-key "$ETHERSCAN_API_KEY" --watch "${ARGFLAG[@]}" "$ADDR" "$NAME"
