#!/usr/bin/env bash
# Reads the live Monad mainnet facts Henad depends on. Run from WSL:
#   bash scripts/mainnet-check.sh
# Every address here is documented with its source in docs/INTEGRATION-FACTS.md.
set -euo pipefail
CAST=${CAST:-/root/.foundry/bin/cast}
RPC=${MONAD_MAINNET_RPC_URL:-https://rpc.monad.xyz}

AUSD=0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a
USDC=0x754704Bc059F8C67012fEd69BC8A327a5aafb603
USDM=0xBC69212B8E4d445b2307C9D32dD68E2A4Df00115
GBPM=0x39bb4E0a204412bB98e821d25e7d955e69d40Fd1
MENTO_ROUTER=0x4861840C2EfB2b98312B0aE34d86fD73E8f9B6f6
POOL_AUSD_USDM=0xb0a0264Ce6847F101b76ba36A4a3083ba489F501
POOL_GBPM_USDM=0xD0E9c1a718D2a693d41eacd4B2696180403Ce081
FEED_GBP_USD=0x1ffC8B75a16FFfbd7879F042B580F7607Dcf5C30
FEED_AUSD_USD=0xE20751C7B5867bCBef815ffc1b284c3f412a9e13
FEED_USDC_USD_18=0x30cF74D15Ea22D872418ace3475f42066EDe7E50

call() { "$CAST" call "$1" "$2" --rpc-url "$RPC"; }

echo "chain-id: $("$CAST" chain-id --rpc-url "$RPC")   block: $("$CAST" block-number --rpc-url "$RPC")   now: $(date -u +%FT%TZ)"
for t in AUSD:$AUSD USDC:$USDC USDm:$USDM GBPm:$GBPM; do
  n=${t%%:*}; a=${t#*:}
  echo "$n  symbol=$(call "$a" 'symbol()(string)')  decimals=$(call "$a" 'decimals()(uint8)')"
done
for p in AUSD/USDm:$POOL_AUSD_USDM GBPm/USDm:$POOL_GBPM_USDM; do
  n=${p%%:*}; a=${p#*:}
  echo "pool $n  symbol=$(call "$a" 'symbol()(string)')"
done
echo "router code bytes: $(( ($("$CAST" code "$MENTO_ROUTER" --rpc-url "$RPC" | wc -c) - 3) / 2 ))"
for f in GBP/USD:$FEED_GBP_USD AUSD/USD:$FEED_AUSD_USD USDC/USD-18:$FEED_USDC_USD_18; do
  n=${f%%:*}; a=${f#*:}
  echo "feed $n  decimals=$(call "$a" 'decimals()(uint8)')  latestRoundData=$(call "$a" 'latestRoundData()(uint80,int256,uint256,uint256,uint80)' | tr '\n' ' ')"
done
