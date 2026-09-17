#!/usr/bin/env bash
# A local Monad: fork mainnet, deploy Henad onto it, fund a payer, print the env.
#
# Why this exists as a script rather than a runbook: anvil stamps each new block with
# wall-clock time while the forked Mento price report stays frozen at the fork block, so
# a fork more than a few minutes old answers OracleStale and nothing can settle
# (docs/INTEGRATION-FACTS.md 14.7). Mento's pool reverts NoRecentRate() in gas estimation.
#
# Two things keep a session usable:
# - A clock keeper pins anvil's time to its latest block every 30 s, so a pending block is
#   never more than about 30 s past the fork's own time and the price reports stay recent.
#   Receipts written on the fork therefore carry fork time, a few minutes behind the clock.
# - The new contract addresses are written straight into web/.env.local, which is how the
#   addresses there used to end up pointing at yesterday's node.
#
#   scripts/local-fork.sh <payerAddress> [morePayers...]
#   LAN=1 scripts/local-fork.sh ...   also serve the node on this machine's LAN address, so a
#                                     phone on the same Wi-Fi can use it (see mobile/app.config.ts)
#
# Leaves anvil and the keeper running in the background. Stop both: scripts/local-fork.sh --stop
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

KEEPER_PID="${TMPDIR:-/tmp}/henad-clock-keeper.pid"

stop() {
  if [ -f "$KEEPER_PID" ]; then
    kill "$(cat "$KEEPER_PID")" >/dev/null 2>&1 || true
    rm -f "$KEEPER_PID"
  fi
  # taskkill on Windows, pkill elsewhere; either may legitimately find nothing.
  taskkill //IM anvil.exe //F >/dev/null 2>&1 || pkill -f "anvil.*--port $PORT" >/dev/null 2>&1 || true
}

if [ "${1:-}" = "--stop" ]; then
  stop
  echo "anvil stopped"
  exit 0
fi

PAYERS=("$@")
if [ ${#PAYERS[@]} -eq 0 ]; then
  echo "usage: scripts/local-fork.sh <payerAddress> [morePayers...]   (the addresses your passkeys derive)" >&2
  exit 2
fi
# anvil binds to loopback unless asked. LAN=1 exposes an unlocked, auto-impersonating node to
# the local network, which is fine for a fork of fake balances on a home network and nowhere else.
HOST_ARGS=()
[ "${LAN:-}" = "1" ] && HOST_ARGS=(--host 0.0.0.0)

# shellcheck disable=SC1091
set -a; . "$ROOT/.env"; set +a
: "${MONAD_MAINNET_RPC_URL:?MONAD_MAINNET_RPC_URL must be set in .env}"

echo "==> stopping any previous fork"
stop
sleep 1

echo "==> forking Monad mainnet at head"
nohup anvil -n monad --hardfork monad:MonadTen \
  --fork-url "$MONAD_MAINNET_RPC_URL" --chain-id 143 --port "$PORT" \
  --auto-impersonate "${HOST_ARGS[@]}" >"$LOG" 2>&1 &

for _ in $(seq 1 40); do
  cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break
  sleep 1
done
cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 || { echo "anvil did not come up; see $LOG" >&2; exit 1; }
BLOCK=$(cast block-number --rpc-url "$RPC")
echo "    chain 143 at block $BLOCK"

echo "==> pinning the fork clock"
# Exits on its own once anvil is gone.
RPC="$RPC" nohup bash -c '
  while cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; do
    ts=$(cast block latest -f timestamp --rpc-url "$RPC") &&
      cast rpc evm_setTime $((ts + 1)) --rpc-url "$RPC" >/dev/null 2>&1
    sleep 30
  done
' >/dev/null 2>&1 &
echo $! >"$KEEPER_PID"

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
for PAYER in "${PAYERS[@]}"; do
  cast send "$AUSD" "transfer(address,uint256)(bool)" "$PAYER" 5000000000 \
    --rpc-url "$RPC" --from "$AUSD_WHALE" --unlocked >/dev/null
  cast send "$PAYER" --value 1ether --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" >/dev/null
  BAL=$(cast call "$AUSD" "balanceOf(address)(uint256)" "$PAYER" --rpc-url "$RPC" | awk '{print $1}')
  echo "    payer   $PAYER  $((BAL / 1000000)) AUSD"
done
echo "    relayer $RELAYER  $(cast balance $RELAYER --rpc-url $RPC --ether | cut -c1-8) MON"

ENV_LOCAL="$ROOT/web/.env.local"
if [ -f "$ENV_LOCAL" ] && grep -q '^NEXT_PUBLIC_LOCAL_FORK=1' "$ENV_LOCAL"; then
  sed -i \
    -e "s/^NEXT_PUBLIC_CORRIDOR_ROUTER_ADDRESS=.*/NEXT_PUBLIC_CORRIDOR_ROUTER_ADDRESS=$ROUTER/" \
    -e "s/^NEXT_PUBLIC_RATE_ATTESTATION_ADDRESS=.*/NEXT_PUBLIC_RATE_ATTESTATION_ADDRESS=$ATTEST/" \
    -e "s/^NEXT_PUBLIC_DEPLOYED_AT_BLOCK=.*/NEXT_PUBLIC_DEPLOYED_AT_BLOCK=$AT_BLOCK/" \
    "$ENV_LOCAL"
  echo "==> web/.env.local updated with the new addresses. Restart \`pnpm dev:web\` (env is read at boot)."
  exit 0
fi

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

The clock keeper holds the fork near its own time, so it stays usable while it runs.
ENV
