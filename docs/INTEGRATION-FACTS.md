# Integration facts — verified 2026-09-10

Every line carries the source it was taken from. Labels: **VERIFIED** (fetched from an
official page, or confirmed by an `eth_call` against the public RPC), **PARTIAL**
(official page confirms part of the claim), **UNVERIFIED** (could not be confirmed —
do not build on it). Nothing here is from memory.

---

## 0. The decision this file forces

**There is no naira on Monad mainnet and no NGN/USD oracle on Monad.** The USD→NGN
corridor in the build prompt cannot be settled onchain on Monad today.

| Claim in the build prompt | Finding |
| --- | --- |
| "Mento — already deployed on Monad, 15 currencies" | **Refuted as worded.** Mento supports 15 currencies on Celo. On Monad it launched 2026-03-12 with **USDm and GBPm** only; EURm/CHFm/JPYm tokens exist on-chain but their pools are unverified. No African currency on Monad. |
| "cNGN (Mento's naira stablecoin)" | Mento's naira (NGNm, formerly cNGN) is **Celo-only**. The *other* cNGN (Africa Stablecoin Consortium / WrappedCBDC) is on **Monad testnet only**, no mainnet contract. |
| "Chainlink underpins Mento's rates — get the Monad feed addresses" | **Confirmed.** Chainlink Data Feeds are live on Monad mainnet with EUR, GBP, CHF, JPY, CAD vs USD. **No NGN feed** from Chainlink or Pyth on Monad (Pyth has no NGN feed on any chain). |

What is actually live end-to-end on Monad mainnet, with a Chainlink reference rate
and a Mento venue: **USD→GBP** (AUSD or USDC → USDm → GBPm). See §11 and §12.

---

## 1. Monad mainnet — VERIFIED

| Item | Value | Source |
| --- | --- | --- |
| Chain ID | **143** (`0x8f`, confirmed via `eth_chainId`) | https://docs.monad.xyz/developer-essentials/network-information |
| Testnet chain ID | **10143** (reset from genesis 2025-12-16, faucet https://faucet.monad.xyz) | https://docs.monad.xyz/developer-essentials/testnet |
| Native token | MON, 18 decimals | same |
| Block time / finality | 300 ms blocks, finalized after two blocks (600 ms) | https://docs.monad.xyz/developer-essentials/summary |
| Mainnet launch | 2025-11-24 | https://docs.monad.xyz/ |

Public mainnet RPCs (rate limit / batch size), all with `wss://` equivalents:

| URL | Provider | Limits | Source |
| --- | --- | --- | --- |
| `https://rpc.monad.xyz` | QuickNode | 25 rps, batch 100 | https://docs.monad.xyz/developer-essentials/network-information |
| `https://rpc1.monad.xyz` | Alchemy | 15 rps, batch 100, no debug_/trace_ | same |
| `https://rpc2.monad.xyz` | Goldsky | 300 per 10 s, batch 10, historical eth_call | same |
| `https://rpc3.monad.xyz` | Ankr | 300 per 10 s, batch 10 | same |
| `https://rpc-mainnet.monadinfra.com` | Monad Foundation | 20 rps, batch 1 | same |

Testnet RPCs: `https://testnet-rpc.monad.xyz` (QuickNode, 50 rps), `https://rpc.ankr.com/monad_testnet`, `https://rpc-testnet.monadinfra.com` — https://docs.monad.xyz/developer-essentials/testnet

Method-level limits (eth_getLogs block ranges, hardcoded eth_maxPriorityFeePerGas): https://docs.monad.xyz/reference/rpc-limits

Explorers — https://docs.monad.xyz/tooling-and-infra/block-explorers
- MonadVision `https://monadvision.com` (BlockVision; Sourcify verifier `https://sourcify-api-monad.blockvision.org`)
- Monadscan `https://monadscan.com` (Etherscan; API `https://api.monadscan.com/api`)
- Testnet: `https://testnet.monadvision.com`, `https://testnet.monadscan.com` (API `https://api-testnet.monadscan.com/api`)

Canonical contracts, mainnet — https://docs.monad.xyz/developer-essentials/network-information
- WMON `0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A` (testnet WMON differs: `0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541`)
- Multicall3 `0xcA11bde05977b3631167028862bE2a173976CA11` (same on testnet)
- Permit2 `0x000000000022d473030f116ddee9f6b43ac78ba3`
- CreateX `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed`; Foundry deterministic deployer `0x4e59b44847b379578588920ca78fbf26c0b4956c`
- ERC-4337 EntryPoint v0.7 `0x0000000071727De22E5E9d8BAf0edAc6f37da032`

Tokens, mainnet — https://docs.monad.xyz/developer-essentials/network-information/tokens-and-bridges and https://raw.githubusercontent.com/monad-crypto/token-list/main/tokenlist-mainnet.json (114 tokens, v2.48.0)
- **USDC `0x754704Bc059F8C67012fEd69BC8A327a5aafb603`** — native Circle USDC, 6 dec, CCTP V2, live since 2025-11-24 (`symbol()` → "USDC" confirmed). https://developers.circle.com/stablecoins/usdc-contract-addresses ; testnet USDC `0x534b2f3A21130d7a60830c2Df862319e593943A3`
- USDT0 `0xe7cd86e13AC4309349F30B3435a9d337750fC82D` (6 dec, LayerZero OFT; there is no plain "USDT")
- AUSD (Agora USD) `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a` — the Agora bounty sponsor's stablecoin
- WETH `0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242`; WBTC `0x0555E30da8f98308EdB960aa94C0Db47230d2B9c` (8 dec)
- **No NGN, NGNC, NGNT, cNGN, or any African-currency token in the official mainnet list.** Only non-USD fiat stables: GBPm, EURm, CHFm, JPYm (Mento).

Token-list submission process (for later, if we ever list a token): fork → `uv run python scripts/add_token.py 0xAddr` → add `mainnet/SYMBOL/logo.svg` → `uv run python scripts/validate_tokens.py` → PR. Requires deployed mainnet ERC-20, checksummed address, `chainId: 143`. https://raw.githubusercontent.com/monad-crypto/token-list/main/CONTRIBUTING.md

EVM differences that affect our contracts — https://docs.monad.xyz/developer-essentials/differences , https://docs.monad.xyz/developer-essentials/opcode-pricing
- Gas is charged on **gas limit, not gas used** — set tight limits in the frontend.
- Cold account access 10,100 gas; cold storage 8,100 per 128-slot page; SSTORE new slot 17,000. Pack the `Intent` struct.
- Contract size limit 128 KB. No EIP-4844 blobs. No global mempool.
- 7702-delegated EOAs cannot go below 10 MON balance and cannot CREATE.
- Hardhat template requires `evmVersion: "osaka"`, solc 0.8.31 — https://docs.monad.xyz/tooling-and-infra/toolkits/hardhat
- **Foundry v1.8.0+** has native Monad support: `network = "monad"` in foundry.toml, `anvil --network monad`. Local WSL has **1.5.1** — run `foundryup` before week 2. https://docs.monad.xyz/tooling-and-infra/toolkits/foundry

---

## 2. Mento on Monad — VERIFIED (V3 "FPMM", not V2 Broker)

Timeline
- 2026-02-04: Mento announces Monad deployment; issuance stays on Celo, Monad is a trading venue, pricing is Chainlink-based. https://www.mento.org/blog/mento-is-bringing-onchain-fx-to-the-monad-ecosystem
- 2026-03-04: Monad blog — "Mento, an onchain FX protocol supporting 15 currencies… has deployed on Monad"; "Chainlink powers the oracle feeds… underpinning Mento's FX rates". https://monad.xyz/blog/monad-home-high-frequency-finance
- 2026-03-12: Mento launches on Monad — "The GBPm / USDm pool is live"; "Additional FX pairs are expected to follow". https://www.mento.org/blog/mento-launches-on-monad-bringing-fx-markets-to-a-high-performance-l1

Architecture: Monad is a **Mento V3** deployment. Tokens are `StableTokenSpoke` bridged from Celo via Wormhole NTT; liquidity is in **FPMM pools** (fixed-price market makers keyed to a Chainlink feed) behind a **Router**. **There is no Broker or BiPoolManager on Monad** — those are V2, Celo-only. Sources: https://docs.mento.org/mento-v3/build/deployments/addresses ; https://raw.githubusercontent.com/mento-protocol/mento-stabletoken-ntt/main/README.md

Contracts, Monad mainnet (143) — https://docs.mento.org/mento-v3/build/deployments/addresses (RPC-verified where noted)

| Contract | Address |
| --- | --- |
| Router | `0x4861840C2EfB2b98312B0aE34d86fD73E8f9B6f6` |
| OracleAdapter | `0xa472fBBF4b890A54381977ac392BdF82EeC4383a` |
| SortedOracles | `0x6f92C745346057a61b259579256159458a0a6A92` (has code) |
| ChainlinkRelayerFactory | `0x71c2333928Af2dB247d9C0aa380DF1cCCa53899A` |
| FPMMFactory | `0xa849b475FE5a4B5C9C3280152c7a1945b907613b` |
| FactoryRegistry | `0x7b2f7d11eabD576782f77bF2CcA46a853410AdF6` |
| ReserveV2 | `0x4255Cf38e51516766180b33122029A88Cb853806` |
| BreakerBox | `0x9fc1E0d10fb38954Da385B8B25aB2BbaF3241722` |
| MarketHoursBreaker | `0x0A18B8e7338eF8d6025529257aA5CCd5A14e0DAF` |
| MedianDeltaBreaker | `0x3E4F2Bca4f7192Be4C3c5E5bD4840F2E90a8Ba84` |
| ValueDeltaBreaker | `0xca2e7563dfC30bc94687F3deAcF682E1dBAffA13` |
| StableTokenSpoke impl | `0x6A8ff60A89F3f359Fa16F45076d6DD1712B5e62e` |

Pools (RPC-verified `symbol()`):
- GBPm/USDm `0xD0E9c1a718D2a693d41eacd4B2696180403Ce081` → "FPMM-GBPm/USDm"
- USDC/USDm `0x463c0d1F04bcd99A1efCF94AC2a75bc19Ea4A7E5` → "FPMM-USDC/USDm"
- AUSD/USDm `0xb0a0264Ce6847F101b76ba36A4a3083ba489F501` → "FPMM-AUSD/USDm"

Tokens (RPC-verified `symbol()`):
- USDm `0xBC69212B8E4d445b2307C9D32dD68E2A4Df00115` (docs page)
- GBPm `0x39bb4E0a204412bB98e821d25e7d955e69d40Fd1` (docs page)
- EURm `0x4D502d735B4C574B487Ed641ae87cEaE884731C7` (token list only)
- CHFm `0xF64e91fFEf7ef43aA314F0Bc2AC39f770797990C` (token list only)
- JPYm `0x22f6A6752800eAB67b84748FeFc3cC658384aF72` (token list only)

**UNVERIFIED:** whether EURm/USDm, CHFm/USDm, JPYm/USDm, USDT0/USDm pools are deployed on mainnet. Mento's deployment config defines them, but no pool addresses were found on the docs page. Config: https://raw.githubusercontent.com/mento-protocol/deployments-v2/main/script/config/mento/MentoConfig_monad.sol — check `FPMMFactory`/`FactoryRegistry` on-chain in week 2.

**MarketHoursBreaker exists.** FX pools may halt outside FX market hours (weekends). This affects when a mainnet demo can execute — verify the breaker's schedule before the week-4 payout.

Rate source: "Today, Chainlink is the only oracle source used in Mento V3." https://docs.mento.org/mento-v3/build/integration/integrate-oracles. On Monad the config wires ChainlinkRelayers to the Chainlink proxies in §4 and an off-chain relayer (`relay-monad` job) pushes into SortedOracles. https://raw.githubusercontent.com/mento-protocol/oracle-relayer/main/README.md

Corrected claim for the README: *Mento (15 currencies on Celo) launched on Monad in March 2026 with USDm/GBPm and Chainlink-priced FX pools; no African currencies on Monad yet.*

---

## 3. Naira on Monad — VERIFIED: none on mainnet

- **Mento NGNm** (launched 2025-06-06 as "cNGN", renamed NGNm): Celo only, `0xE2702Bd97ee33c88c8f6f92DA3B733608aa76F71` on Celo. https://www.mento.org/blog/mento-expands-global-onchain-fx-access-with-three-new-decentralized-stablecoins ; https://docs.mento.org/mento-v3/build/deployments/addresses
- **ASC / WrappedCBDC cNGN** (cngn.co): mainnets on Bantu, AssetChain, Base `0x46C85152bFe9f96829aA94755D9f915F9B10EF5F`, BNB, Ethereum, Polygon, Lisk, Solana, Celo. **Monad appears only in the testnet table**: `0x82838136c74f20D42493d3401bF92c00cb37bFbC` on chain 10143 (RPC-verified `symbol()` → "cNGN" on testnet; **no code at that address on mainnet**). https://raw.githubusercontent.com/wrappedcbdc/stablecoin-cngn/main/README.md ; https://techcabal.com/2025/12/12/wrappedcbdc-is-building-a-rail-to-move-naira-faster/
- No other naira or African-currency asset in the Monad official mainnet token list (§1).

---

## 4. Oracles on Monad — VERIFIED (Chainlink, Pyth, Switchboard); PARTIAL (RedStone); UNVERIFIED (Chronicle, Supra mainnet)

Monad docs list Chainlink, Chronicle, Pyth, Redstone, Stork, Supra, Switchboard as mainnet-supported. https://docs.monad.xyz/tooling-and-infra/oracles

**Chainlink Data Feeds** — live on Monad mainnet since 2025-11-24, 102 feeds. https://dev.chain.link/changelog/data-feeds-expands-to-monad-mainnet ; address JSON https://reference-data-directory.vercel.app/feeds-monad-mainnet.json (backs https://docs.chain.link/data-feeds/price-feeds/addresses?network=monad)

| Feed | Decimals | Proxy address |
| --- | --- | --- |
| **GBP/USD** | 18 | `0x1ffC8B75a16FFfbd7879F042B580F7607Dcf5C30` |
| **EUR/USD** | 18 | `0x00D7E359c8CE46168eFDD4D65b708fFb16c4b99a` |
| CHF/USD | 18 | `0x6DBa7f3A7B5B7c1079337104caD14D19150F6B8d` |
| JPY/USD | 18 | `0xF64664Ea54cE47eCC7a1816C49d1Bc6deF828927` |
| CAD/USD | 18 | `0x3293eA5650E9f8c4091642b7EB1C46CFEe5197cA` |
| USDC/USD | 8 | `0xf5F15f188AbCB0d165D1Edb7f37F7d6fA2fCebec` |
| USDC/USD | 18 | `0x30cF74D15Ea22D872418ace3475f42066EDe7E50` |
| AUSD/USD | 8 | `0xE20751C7B5867bCBef815ffc1b284c3f412a9e13` |
| USDT/USD | 8 | `0x1a1Be4c184923a6BFF8c27cfDf6ac8bDE4DE00FC` |
| MON/USD | 8 | `0xBcD78f76005B7515837af6b50c7C52BCf73822fb` |
| ETH/USD | 8 | `0x1B1414782B859871781bA3E4B0979b9ca57A0A04` |
| BTC/USD | 8 | `0xc1d4C3331635184fA4C3c22fb92211B2Ac9E0546` |

FX feeds have a 240 s heartbeat. **No NGN, ZAR, KES, GHS, or XOF feed on Monad.** Chainlink Data Streams is also listed for Monad (stream IDs not checked). The Chainlink bounty is "Best workflow with CRE" (Chainlink Runtime Environment) — a CRE workflow, not just a feed read. UNVERIFIED what the bounty requires beyond the title.

**Pyth** — Monad mainnet contract `0x2880aB155794e7179c9eE2e38200202908C17B43` (current) and `0xB754BA51E3861Ac0Cb67f73CD046dE790A36508d` (upgraded; Pyth recommends new integrations use it after the 2026-08-26 DAO upgrade). Both have code. https://docs.pyth.network/price-feeds/core/contract-addresses/evm. Pyth FX feed IDs: EUR/USD `a995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b`, GBP/USD `84c2dde9633d93d1bcad84e7dc41c9d56578b7ec52fabedc1f335d673df0a7c1`, USD/ZAR `389d889017db82bf42141f23b61b8de938a4e2d156e36312175bebf797f493f1`. **No NGN feed** (Hermes `?query=NGN` returns empty). https://hermes.pyth.network/v2/price_feeds?asset_type=fx

**Switchboard** — Monad mainnet `0xB7F03eee7B9F56347e32cC71DaD65B303D5a0E67`, testnet `0x6724818814927e057a693f4e3A172b6cC1eA690C`. https://docs.switchboard.xyz/docs-by-chain/evm/monad. Warning: search summaries wrongly attribute this address to Chronicle and Supra.

**RedStone** — PARTIAL: live on Monad since 2025-11-27, 50+ feeds incl. MON; no addresses or FX feeds found. https://blog.redstone.finance/2025/11/27/redstone-on-monad-the-real-time-data-layer-for-high-speed-defi/

**Chronicle** — UNVERIFIED: docs could not be fetched (403/429).
**Supra** — UNVERIFIED on mainnet: networks page lists only Monad Testnet (Pull `0xF8522B7fcE37439b98A2be282d413A44269028bE`). https://docs.supra.com/oracles/data-feeds/pull-oracle/networks

---

## 5. Kuru — VERIFIED (with two caveats)

- Docs https://docs.kuru.io/ ; full index https://docs.kuru.io/llms.txt
- SDK `@kuru-labs/kuru-sdk` **v0.0.95** (2026-01-27), depends on **ethers 5.7.1**, no viem. https://registry.npmjs.org/@kuru-labs/kuru-sdk ; https://docs.kuru.io/sdk/quickstart-sdk ; https://github.com/Kuru-Labs/kuru-sdk
- Contract sources: https://github.com/Kuru-Labs/Kuru-contracts-dex-public , https://github.com/Kuru-Labs/Kuru-contracts-flow-public
- **Caveat A:** a v2 viem-first SDK is landing (`Kuru-Labs/ts-sdk`, published as `@toxicflow-labs/ts-sdk` v0.0.4 on 2026-09-09, UNLICENSED, pinned to "spot-contracts-v2", examples on testnet only). Whether v2 contracts are on mainnet is UNVERIFIED. **Build against v1 addresses and read on-chain via viem.**
- **Caveat B:** the quickstart page shows stale addresses that match neither network. Use the Contract Addresses page only.

Mainnet (143) — https://docs.kuru.io/contracts/Contract-addresses
- KuruFlowEntrypoint (aggregator) `0xb3e6778480b2E488385E8205eA05E20060B813cb`
- KuruFlowRouter `0x0d3a1BE29E9dEd63c7a5678b31e847D68F71FFa2`
- Router (market factory) `0xd651346d7c789536ebf06dc72aE3C8502cd695CC`
- MarginAccount `0x2A68ba1833cDf93fa9Da1EEbd7F46242aD8E90c5`
- KuruForwarder `0x974E61BBa9C4704E8Bcc1923fdC3527B41323FAA`
- Official markets: **MON-USDC `0x065C9d28E428A0db40191a54d33d5b7c71a9C394`**, MON-AUSD `0x131a2e70a5b31a517a74b8c567149bc294470da9`
- **No stablecoin-to-stablecoin or FX market is documented.** UNVERIFIED whether any GBPm or USDm market exists on Kuru. As a fallback venue for our corridor it is therefore **not useful today** unless a GBPm market is created — which is exactly the second Kuru bounty ("Bring New Assets and Markets to Kuru").

Testnet (10143): Router `0x7EFbE105Ca7415dE98F96622173458ac1c054630`, MarginAccount `0xd029C2D98ff85D8F64799017fE00a59B1159CE02`, MON-USDC market `0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9`, USDC `0x3bA3d39AFcf8bb994f7964B3e0171Ea2Ba361570`.

Kuru Flow API — https://docs.kuru.io/kuru-flow/flow-overview ; OpenAPI https://docs.kuru.io/kuru-flow/openapi.json
- Server `https://ws.kuru.io`; `POST /api/generate-token` (body `user_address`, returns JWT, 1 rps); `POST /api/quote` (required `userAddress, tokenIn, tokenOut, amount`; optional `slippageTolerance` bps, `referrerAddress`, `referrerFeeBps`; auth Bearer JWT or `X-API-Key`).
- Kuru's own wallet is a Privy embedded wallet on Monad. https://docs.kuru.io/product/wallet
- Indexer reference (Envio etc.): https://github.com/monad-developers/kuru-terminal

---

## 6. Privy — VERIFIED

- Monad docs list Privy as supporting Monad mainnet and testnet; Privy subsidizes testnet usage (monad@privy.io). https://docs.monad.xyz/tooling-and-infra/wallet-infra/embedded-wallets
- Monad is **not** in Privy's default-chains table; pass it explicitly via `supportedChains`/`defaultChain` (any viem chain). https://docs.privy.io/basics/react/advanced/configuring-evm-networks
- `@privy-io/chains` v0.6.0 exports `monadMainnet` (id 143); no `monadTestnet` export — use viem's. https://registry.npmjs.org/@privy-io/chains/-/chains-0.6.0.tgz
- viem: `monad` (143, RPC `https://rpc.monad.xyz`, explorer monadscan.com, blockTime 400 ms) and `monadTestnet` (10143). https://raw.githubusercontent.com/wevm/viem/main/src/chains/definitions/monad.ts ; https://raw.githubusercontent.com/wevm/viem/main/src/chains/definitions/monadTestnet.ts
- Packages: `wagmi @privy-io/react-auth @privy-io/wagmi @tanstack/react-query`; provider order PrivyProvider > QueryClientProvider > WagmiProvider. https://docs.privy.io/wallets/connectors/ethereum/integrations/wagmi
- Versions: `@privy-io/react-auth` 3.42.0 (2026-09-09, viem 2.56.0, React 18/19); `@privy-io/wagmi` 4.0.17 (2026-08-31). https://registry.npmjs.org/@privy-io/react-auth ; https://registry.npmjs.org/@privy-io/wagmi
- App Router: `'use client'` provider with `embeddedWallets.ethereum.createOnLogin: 'users-without-wallets'`. https://docs.privy.io/basics/react/setup.md
- Passkeys: WebAuthn, enable in Dashboard, chain-agnostic. https://docs.privy.io/authentication/user-authentication/login-methods/passkey
- Bounty "$5,000 Privy!" — criteria UNVERIFIED (behind hackathon login).

---

## 7. Aurora Intents — VERIFIED (API); PARTIAL (execute-on-arrival)

- Aurora Intents = cross-chain execution on NEAR Intents; products: Intents Connect, Intents Deposits, Swap Widget. https://docs.intents.aurora.dev/
- Monad is ✅ supported as source and destination for all three. https://docs.intents.aurora.dev/intents-deposits/supported-chains.md ; https://docs.intents.aurora.dev/intents-connect/supported-chains.md
- Live token list confirms Monad assets: MON, USDC (`0x754704…b603`), USDT0 (`0xe7cd86…c82d`). https://intents-connect-api.aurora.dev/api/v1/supported_tokens
- How funds arrive: user sends to a quote-specific `depositAddress` on the source chain; solvers settle; tokens delivered to `recipient` with `recipientType: "DESTINATION_CHAIN"` (a plain EOA on Monad). https://docs.intents.aurora.dev/intents-deposits/quickstart/api-integration.md
- Intents Deposits API base `https://intents-api.aurora.dev`, appKey from https://studio.aurora.dev/ (non-confidential; fee split 60/40, min 2 bps). https://docs.intents.aurora.dev/getting-started/api-keys-and-fees.md
- **Intents Connect (execute-on-arrival) is early-access only** (contact@aurora.dev). Scope to "USDC arrives in the Monad wallet", not "arrives and executes". https://docs.intents.aurora.dev/intents-connect/deep-dive/api-usage.md
- Widget `@aurora-is-near/intents-swap-widget` v7.22.0 (2026-09-08). https://registry.npmjs.org/@aurora-is-near/intents-swap-widget
- Alternative: NEAR 1Click API `https://1click.chaindefuser.com/v0/…`, SDK `@defuse-protocol/one-click-sdk-typescript`. https://docs.near-intents.org/integration/distribution-channels/1click-api/sdk.md

---

## 8. Envio and Nansen — VERIFIED

Envio
- Monad mainnet chain id 143, HyperSync `https://143.hypersync.xyz`, HyperRPC `https://143.rpc.hypersync.xyz`; testnet 10143 at `https://10143.hypersync.xyz`. https://docs.envio.dev/docs/HyperIndex/supported-networks ; https://envio.dev/chains/monad
- config.yaml `chains: - id: 143`; `envio` CLI 3.10.0 (2026-09-03). https://docs.envio.dev/docs/HyperIndex/configuration-file ; https://registry.npmjs.org/envio
- Bounty "$1,000 Best Use of Envio" plus free Cloud hosting for winners. Criteria UNVERIFIED.

Nansen
- Monad supported (`"monad"`) in Smart Money, Token God Mode, Profiler. https://docs.nansen.ai/reference/chains
- API `https://api.nansen.ai/api/v1/`, header `apikey`. Free: 100 trial credits + 10/day; Pro $49/mo. https://docs.nansen.ai/getting-started/credits
- Budget-limited: fine for a demo panel, not a polling backend. Bounty criteria UNVERIFIED.

---

## 9. Metropolis — PARTIAL (public page verified; rules and bounty criteria gated)

- Build window 1 Sep – 13 Oct 2026; submissions close **14 Oct 03:59 UTC**; judging 14–27 Oct; winners 3 Nov. https://www.monad.xyz/developers/hackathons/metropolis ; https://hackathon.monad.xyz/prizes
- Four tracks at $30,000 each, split $10k/$10k/$10k; Grand Champion $25,000. Track 02 "Consumer Products & Payments" (example: "A payments app that never mentions a blockchain to the person using it"). https://hackathon.monad.xyz/prizes
- "Choose one main track to qualify for any bounty. Main-track prizes are separate and stack with sponsor bounties."
- Submit: "A working product with a public project profile: a demo, a short write-up, and a link to the code." Open source encouraged not required. Solo builders welcome. Work must be built during the six weeks.
- Bounties verified by title on the public page: Agora **$10,000 Best Cross-Border Payments App on Monad** (and a separate $10,000 Best Mobile Trading App); Chainlink $3,000 Best workflow with CRE; Privy $5,000; Aurora Intents $5,000 Bring Any-Chain Liquidity to Monad; Envio $1,000; Nansen $5,000; Kuru $5,000 ×2 (Consumer Trading App; Bring New Assets and Markets). Also relevant: Monad Foundation $2,500 "Best Mera-Powered UX" and $2,500 "Mera: One Passkey, Many Keys"; Dynamic $5,000.
- Bounty requirement texts were pasted from the logged-in platform on 2026-09-10 — see **docs/BOUNTIES.md**. Standard deliverables per track: public repo, technical demo video, pitch video, live product link. Official rules, judging rubric for main tracks, team-size cap, and video length specs remain UNVERIFIED.
- **The Agora bounty text names AUSD as the asset and Mera passkeys as onboarding.** This moves the source asset from USDC to AUSD and the account layer from Privy to Mera. Mera and the Agora API are researched in §12.

---

## 10. MIP / MRC process — VERIFIED

- Repo https://github.com/monad-crypto/MIPs ; site https://mips.monad.xyz (13 MIPs, 2 MRCs). MIP-1 "MIP Purpose and Guidelines" is **Living** (since 2026-08-24). https://raw.githubusercontent.com/monad-crypto/MIPs/main/MIPs/MIP-1.md
- Types: Standards Track, Meta, Informational. Standards Track categories: Core, Networking, Interface, **MRC** — "application-level standards and conventions, including contract standards such as token standards, name registries, URI schemes… MRC stands for Monad Request for Comments."
- MRCs share the MIP number space and live in `MRCs/`. Precedents: MRC-13 Validator Metadata Registry (Final), MRC-14 Account Attestation Registry (Draft, submitted as PR #72 on 2026-07-31). https://raw.githubusercontent.com/monad-crypto/MIPs/main/MRCs/MRC-14.md
- Process: open a thread on the forum first (category https://forum.monad.xyz/c/mips/8) — `discussions-to` must be a forum topic, not a GitHub PR. Then PR with filename `MIP-draft_title_abbrev.md`; an editor assigns the number. Editors: @pdobacz, @qedk, @Baltoli, @kjcamann.
- Statuses: Idea → Draft → Review → Last Call (14 days) → Final; Stagnant after 3 months.
- Title ≤ 44 chars, description ≤ 140 chars, no "standard" in the title, no external links in the body. **Security Considerations is mandatory** or the submission is rejected. Close with `Copyright and related rights waived via [CC0](../LICENSE.md).`
- Template preamble: `title, description, author, discussions-to, status: Draft, type, category, created, requires`. Section headings verbatim:

```
## Abstract
## Motivation
## Specification
### Chain Specifics
## Rationale
## Backwards Compatibility
## Test Cases
## Reference Implementation
## Security Considerations
## Copyright
```
Source: https://raw.githubusercontent.com/monad-crypto/MIPs/main/mip-template.md

---

## 11. Corridor options — decision needed before week 2

**(A) Ship USD→GBP on mainnet. Recommended.**
USDC → USDm → GBPm through the Mento Router, Chainlink GBP/USD (18 dec) as the
reference rate, receipt attested onchain. Every piece is verified live today. The
product thesis — public receipt, reference vs executed vs spread — is identical for
any corridor. Loses the naira narrative, keeps every word of "the receipt is the
proof". Stretch: EUR, CHF, JPY corridors if their pools turn out to be deployed.
Eligible for Agora "Best Cross-Border Payments App on Monad" as-is.

**(B) NGN on testnet only, clearly labelled.**
cNGN exists on Monad testnet (10143). There is no NGN oracle anywhere on Monad, so
the reference rate would have to be relayed by us — which is "inventing the rate",
the thing §2 of the prompt forbids. Demo-only, cannot satisfy the week-4 mainnet gate.

**(C) A + a designed-in NGN slot.**
Ship (A). Make the corridor identifier and rate-source registry generic so a naira
corridor plugs in the day an asset and a feed exist on Monad. Mention cNGN-on-testnet
in the write-up as the roadmap, not as a feature. This costs nothing extra and keeps
the Nigeria story honest.

Recommendation: **(C)** — build A, design for NGN, do not ship a fake naira.

**Update after reading the Agora bounty text (docs/BOUNTIES.md):** the source asset
is AUSD and the corridor is **AUSD → USDm → GBPm**, with Chainlink AUSD/USD and
GBP/USD as the reference feeds. USDC stays as a secondary source. Option C otherwise
stands.

---

## 12. Mera and Agora — researched after the bounty texts arrived

### 12.1 Mera (`@category-labs/mera`) — VERIFIED, preview software

What it is
- "Accounts on any chain and platform, from a passkey." Derives 32 secret bytes from the passkey via the WebAuthn **PRF extension**; the app derives accounts from those bytes and signs through an in-memory signing session. No custody backend, no MPC, no smart-account contracts. https://raw.githubusercontent.com/category-labs/mera/main/README.md ; https://mera.category.xyz/getting-started/
- The result is a **plain secp256k1 EOA** (`getEvmAddress` returns an EIP-55 address). Not ERC-4337. The viem adapter can sign EIP-7702 authorizations if we choose to delegate. https://mera.category.xyz/reference/ ; https://mera.category.xyz/reference/to-viem-account/
- Package `@category-labs/mera` **0.2.0** (2026-08-12), MIT OR Apache-2.0, deps `@noble/curves`, `@noble/hashes`, `@scure/base`; optional peer `viem ^2.28.0`. App also installs `@scure/bip32 @scure/bip39` for derivation. https://registry.npmjs.org/@category-labs/mera ; https://raw.githubusercontent.com/category-labs/mera/main/library/package.json
- Status: "currently in preview, and the API may change before version 1.0. Category Labs has completed an internal security review." Last commit 2026-08-31. https://github.com/category-labs/mera

Onboarding and signing
- `createPasskeyWithPrfOutput({ rp, user })` → `{ credentialId, prfOutput, prfSalt, transports }` — one ceremony. `getPasskeyPrfOutput({ rpId, credential?, prfSalt? })` — one assertion ceremony for sign-in. Both show a single prompt. https://mera.category.xyz/reference/create-passkey-with-prf-output/ ; https://mera.category.xyz/reference/get-passkey-prf-output/
- Derivation is app code: `entropyToMnemonic(prfOutput)` → `mnemonicToSeedSync` → `HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0")`. https://mera.category.xyz/recipes/create-passkey-accounts/
- `createSecp256k1SigningSession({ privateKey })` → `signDigest`, `end()`. **No built-in TTL, scope, or spend limit** — session lifetime is entirely app-managed. https://mera.category.xyz/concepts/signing-sessions/
- `toViemAccount(session)` → viem `LocalAccount` implementing signTransaction, signMessage (EIP-191), **signTypedData (EIP-712)**, signAuthorization (EIP-7702). Works with `createWalletClient` on any viem chain; no wagmi connector exists. https://mera.category.xyz/reference/to-viem-account/
- Error codes include `PRF_UNAVAILABLE`, `SESSION_ENDED`. https://mera.category.xyz/reference/errors/

Stateless test
- "Each ceremony recomputes the same accounts on every device the passkey syncs to, with no secret stored anywhere." The recipe persists only `credentialId`/`transports` in localStorage; on a fresh device WebAuthn prompts to pick a discoverable passkey. Passes the judges' test by design. https://mera.category.xyz/concepts/passkey-accounts/
- Salts are namespaces: PRF output is fixed by (credential, rpId, salt); default salt `sha256("mera.prf.salt.v1")`, custom 32-byte salts allowed. This is the primitive for the "One Passkey, Many Keys" bounty. https://mera.category.xyz/concepts/passkeys-and-prf/
- Secret vaults: AES-256-GCM under a PRF-derived key (`createSecretVaultWithNewPasskey`, `decryptSecretVaultWithPasskey`). https://mera.category.xyz/concepts/secret-vaults/

Caveats
- **rpId lock-in:** accounts exist only under the domain the passkey was created for. A domain change strands funds. Pick the production domain before the first mainnet user. https://mera.category.xyz/concepts/security-model/
- **Passkey loss = account loss** unless we ship an export path. https://mera.category.xyz/concepts/passkey-accounts/
- **No gas sponsorship.** "Product flows such as funding remain under application control." A fresh Mera user holds AUSD and zero MON, so they cannot pay gas. See 12.3.
- **PRF support** (Category Labs matrix, 2026-06): iOS 18+ Safari/Chrome, Android Chrome with Google Password Manager, Chrome 132+ desktop with GPM signed in, Windows 11 25H2+, YubiKey 5.2+, 1Password. **Not** Chrome desktop local-profile passkeys, Bitwarden, Dashlane. Android with GPM is the target user and is covered. https://mera.category.xyz/authenticator-support/
- Next.js is not mentioned anywhere; the official demo is Vite + React 19. The library touches `navigator.credentials` only inside function bodies, so importing in a server bundle should not throw; ceremonies must run in a client component over HTTPS or localhost. UNVERIFIED by anyone else — expect to do this integration ourselves. https://raw.githubusercontent.com/category-labs/mera/main/library/src/webauthn.ts
- Monad: Mera docs mention no chain. The demo runs `anvil --network monad`. Any viem chain object works. https://raw.githubusercontent.com/category-labs/mera/main/demos/web/network/evm/server.mts

### 12.2 Agora / AUSD — VERIFIED (token); PARTIAL (API and "staging")

- AUSD: fully reserved USD stablecoin issued by Agora Bermuda Limited (Bermuda Monetary Authority licensed), monthly Grant Thornton attestations. https://www.agora.finance/ ; https://docs.agora.finance/developer/transparency.md
- Token standards: ERC-20, EIP-712, ERC-1271, **ERC-2612 permit**, **ERC-3009 transferWithAuthorization**; role-restricted mint/burn; asset freezing. https://docs.agora.finance/contract-overview ; https://docs.agora.finance/developer/security-and-compliance.md
- **Monad mainnet `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a`** confirmed by Agora and Monad Foundation; 6 decimals (via GeckoTerminal, on-chain check blocked by explorer rate limits — confirm with `decimals()` in week 2). Monad is AUSD's largest chain by supply (~185M). https://docs.agora.finance/developer/contract-deployments.md ; https://docs.monad.xyz/developer-essentials/network-information/tokens-and-bridges.md ; https://api.agora.finance/v0/metrics
- **Monad testnet AUSD `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`**, faucet contract `0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C` (`requestFunds(address)`; execution on Monad testnet UNVERIFIED). https://docs.agora.finance/developer/contract-deployments.md ; https://docs.agora.finance/instant-settlement/guides/getting-testnet-tokens.md
- **Chainlink AUSD/USD on Monad mainnet `0xE20751C7B5867bCBef815ffc1b284c3f412a9e13`** confirmed (8 dec, 3600 s heartbeat, 0.05% deviation). SVR variant `0x91D9c75fe73e25f22d9F5e0C6a2a5eC48B6bFBeB` (18 dec). **No AUSD feed on testnet.** https://reference-data-directory.vercel.app/feeds-monad-mainnet.json ; https://raw.githubusercontent.com/monad-crypto/protocols/main/mainnet/chainlink.jsonc
- Liquidity on Monad besides Mento: Uniswap v4 AUSD/USDC (~$3.9M), Curve AUSD/USDC/USDT0 (~$2.3M), others. The only non-USD FX route for AUSD is Mento's AUSD→USDm→GBPm. https://api.geckoterminal.com/api/v2/networks/monad/tokens/0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a/pools

The Agora API and "staging environment"
- The public API (`https://api.agora.finance`) is an **institutional mint/redeem API**: routes `usd→ausd`, `stablecoin→ausd`, `ausd→usd`, `ausd→usdc`; accounts are the org's bank accounts and wallets; "The API never auto-approves." Auth is an API key from the dashboard, which requires an organization. https://docs.agora.finance/api.md ; https://docs.agora.finance/api/endpoints/routes/overview.md ; https://docs.agora.finance/api/authentication.md
- Only `GET /v0/metrics*` is public. Everything else needs an org account via a contact form. https://docs.agora.finance/api/authentication.md ; https://www.agora.finance/contact
- **No staging or sandbox URL appears anywhere in Agora's docs or OpenAPI spec** (servers list production only). The bounty's "staging environment" is UNVERIFIED — credentials would have to come from Agora through the hackathon. https://docs.agora.finance/openapi.yaml
- Agora's **Instant Settlement Protocol** is an on-chain fixed-price AUSD/USDC pair on Monad mainnet (`0xf33286E3222D1c829dACeac48c0Ec651F6452470`), "available exclusively to verified platform users through a protected whitelist". Testnet has a CTK/AUSD pair `0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae`. Whitelist-only, so not usable by us without Agora's approval. https://docs.agora.finance/instant-settlement.md ; https://docs.agora.finance/instant-settlement/protocol-deployments.md
- Practical reading of the bounty: "instant settlement for the transfer itself" is satisfied by Monad's 600 ms finality on a plain AUSD transfer. The Agora API is for the fiat edge, which we do not operate. Ask the Agora mentor whether staging credentials exist for hackathon teams; do not block on it.

### 12.3 The gas problem, and the answer it suggests

A first-time Mera user has AUSD and no MON. Mera has no paymaster. Options:

1. **ERC-3009 `receiveWithAuthorization` + our relayer. Recommended.** The sender signs an EIP-712 authorization with their Mera account (supported by `toViemAccount.signTypedData`). Our relayer submits one transaction to `CorridorRouter`, which pulls AUSD via the authorization, routes through Mento, delivers GBPm, and emits the receipt. The user never holds MON, never sees gas, and the funds still move payer→recipient in a single transaction with no custody. AUSD's ERC-3009 support is documented (verify on-chain in week 2). This also matches Track 02's "a payments app that never mentions a blockchain".
2. EIP-7702 delegation plus a third-party paymaster on Monad. UNVERIFIED which bundlers support Monad; adds a smart-account dependency the prompt rules out.
3. Drip MON to new accounts from a faucet wallet. Works for a demo, leaks value, does not scale. Fallback only.

Consequence for the recipient side: GBPm arrives in the recipient's EOA with no gas needed to receive. To spend it they need MON or another relayed flow, which is out of scope.
