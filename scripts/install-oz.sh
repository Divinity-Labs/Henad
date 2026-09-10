#!/usr/bin/env bash
# Vendors OpenZeppelin Contracts into contracts/lib at the newest v5.x tag.
# Run from WSL: bash scripts/install-oz.sh
set -euo pipefail
cd "$(dirname "$0")/../contracts"
FORGE=${FORGE:-/root/.foundry/bin/forge}
TAG=$(git ls-remote --tags --refs https://github.com/OpenZeppelin/openzeppelin-contracts.git 'v5.*' \
  | awk -F/ '{print $NF}' | grep -E '^v5\.[0-9]+\.[0-9]+$' | sort -V | tail -1)
echo "newest v5 tag: $TAG"
rm -rf lib/openzeppelin-contracts
"$FORGE" install "OpenZeppelin/openzeppelin-contracts@$TAG" --no-git 2>&1 | tail -2
rm -rf lib/openzeppelin-contracts/.git
ls lib/openzeppelin-contracts/contracts/utils/ReentrancyGuardTransient.sol lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol
echo "$TAG" > lib/openzeppelin-contracts.version
