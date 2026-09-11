#!/usr/bin/env bash
# A local Monad: fork mainnet, deploy Henad onto it, fund a payer, print the env.
#
# Why this exists as a script rather than a runbook: anvil stamps each new block with
# wall-clock time while the forked Mento price report stays frozen at the fork block, so
# a fork more than a few minutes old answers OracleStale and nothing can settle
# (docs/INTEGRATION-FACTS.md 14.7). Every session therefore starts with a fresh fork, and
# a fresh fork means fresh contract addresses. Doing that by hand is how the addresses in
# .env.local end up pointing at yesterday's node.
#
#   scripts/local-fork.sh <payerAddress>
#
# Leaves anvil running in the background on :8545. Stop it with: scripts/local-fork.sh --stop
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT=8545
RPC="http://127.0.0.1:$PORT"
LOG="${TMPDIR:-/tmp}/henad-anvil.log"
export PATH="$HOME/.foundry/bin:$PATH"

# anvil account 0 deploys and owns; account 1 is the ERC-3009 relayer. Both keys are
# published in anvil's own banner, which is exactly why Deploy.s.sol treats them as proof
# of a local run and refuses to write the canonical deployment record.
DEPLOYER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
RELAYER_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
RELAYER=0x70997970C51812dc3A010C7d01b50e0d17dc79C8

AUSD=0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a
AUSD_WHALE=0x4255Cf38e51516766180b33122029A88Cb853806 # ReserveV2, ~686k AUSD

stop() {
  # taskkill on Windows, pkill elsewhere; either may legitimately find nothing.
  taskkill //IM anvil.exe //F >/dev/null 2>&1 || pkill -f "anvil.*--port $PORT" >/dev/null 2>&1 || true
}

if [ "${1:-}" = "--stop" ]; then
  stop
  echo "anvil stopped"
  exit 0
fi

PAYER="${1:-}"
if [ -z "$PAYER" ]; then
  echo "usage: scripts/local-fork.sh <payerAddress>   (the address your passkey derives)" >&2
  exit 2
fi

# shellcheck disable=SC1091
set -a; . "$ROOT/.env"; set +a
: "${MONAD_MAINNET_RPC_URL:?MONAD_MAINNET_RPC_URL must be set in .env}"

echo "==> stopping any previous fork"
stop
sleep 1

echo "==> forking Monad mainnet at head"
nohup anvil -n monad --hardfork monad:MonadTen \
  --fork-url "$MONAD_MAINNET_RPC_URL" --chain-id 143 --port "$PORT" \
  --auto-impersonate >"$LOG" 2>&1 &

for _ in $(seq 1 40); do
  cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break
  sleep 1
done
cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 || { echo "anvil did not come up; see $LOG" >&2; exit 1; }
BLOCK=$(cast block-number --rpc-url "$RPC")
echo "    chain 143 at block $BLOCK"

echo "==> deploying Henad onto the fork"
(
  cd "$ROOT/contracts"
  PRIVATE_KEY="$DEPLOYER_KEY" LOCAL_FORK=1 \
    forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast >"${TMPDIR:-/tmp}/henad-deploy.log" 2>&1
) || { echo "deploy failed; see ${TMPDIR:-/tmp}/henad-deploy.log" >&2; exit 1; }

# Read from inside the directory: this shell hands POSIX paths to a native Windows
# python, which cannot open them.
read -r ROUTER ATTEST AT_BLOCK <<<"$(cd "$ROOT/contracts/deployments" && python -c "
import json
d = json.load(open('143.local.json'))
print(d['corridorRouter'], d['rateAttestation'], d['deployedAtBlock'])
")"
echo "    router      $ROUTER"
echo "    attestation $ATTEST"

echo "==> funding"
# --auto-impersonate lets us send as the reserve without its key. A plain transfer is used
# rather than writing storage because AUSD packs {bool isFrozen; uint248 balance} into one
# slot, so forge-std deal() corrupts it.
# The reserve holds AUSD but no MON, so the impersonated sender needs gas money first.
cast rpc anvil_setBalance "$AUSD_WHALE" 0xde0b6b3a7640000 --rpc-url "$RPC" >/dev/null
cast send "$AUSD" "transfer(address,uint256)(bool)" "$PAYER" 5000000000 \
  --rpc-url "$RPC" --from "$AUSD_WHALE" --unlocked >/dev/null
cast send "$PAYER" --value 1ether --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" >/dev/null
BAL=$(cast call "$AUSD" "balanceOf(address)(uint256)" "$PAYER" --rpc-url "$RPC" | awk '{print $1}')
echo "    payer   $PAYER  $((BAL / 1000000)) AUSD"
echo "    relayer $RELAYER  $(cast balance $RELAYER --rpc-url $RPC --ether | cut -c1-8) MON"

cat <<ENV

==> put this in web/.env.local, then restart \`pnpm dev\` (env is read at boot)

NEXT_PUBLIC_MONAD_CHAIN_ID=143
NEXT_PUBLIC_LOCAL_FORK=1
NEXT_PUBLIC_MONAD_RPC_URL=$RPC
NEXT_PUBLIC_GAS_PATH=3009
NEXT_PUBLIC_MERA_RP_ID=localhost
NEXT_PUBLIC_MERA_RP_NAME=Henad
NEXT_PUBLIC_CORRIDOR_ROUTER_ADDRESS=$ROUTER
NEXT_PUBLIC_RATE_ATTESTATION_ADDRESS=$ATTEST
NEXT_PUBLIC_DEPLOYED_AT_BLOCK=$AT_BLOCK
RELAYER_PRIVATE_KEY=$RELAYER_KEY

Gas path is 3009 on purpose: Pimlico's bundler cannot reach a node on your laptop,
so the ERC-3009 relayer is the only rail that works here. The sponsored 7702 path is
covered by the contract fork tests instead.

The fork goes OracleStale within minutes. Re-run this script before each session.
ENV
