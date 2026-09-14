# Integration facts — verified 2026-09-10

Every line carries the source it was taken from. Labels: **VERIFIED** (fetched from an
official page, or confirmed by an `eth_call` against the public RPC), **PARTIAL**
(official page confirms part of the claim), **UNVERIFIED** (could not be confirmed —
do not build on it). Nothing here is from memory.

---

## 0. The decision this file forces

**There is no naira on Monad mainnet and no NGN/USD oracle on Monad.** The USD→NGN
corridor in the build prompt cannot be settled onchain on Monad today.

> ⚠ **§2 below is superseded by §14.1 wherever they disagree.** §2 was written from
> Mento's docs page, which lists only USDm and GBPm on Monad. §14.1 enumerated the
> pools on-chain: **all four FX corridors are live** — GBPm, EURm, CHFm and JPYm each
> have a USDm pool that quotes today, confirmed again on 2026-09-10 in Mento's own app
> at app.mento.org/swap/monad, which offers GBPm, USDm, AUSD, USDT0, EURm, JPYm and
> CHFm. The product treats all four as live corridors. Still true in both: no African
> currency on Monad.

| Claim in the build prompt | Finding |
| --- | --- |
| "Mento — already deployed on Monad, 15 currencies" | **Refuted as worded.** Mento supports 15 currencies on Celo, five of them African. On Monad it launched 2026-03-12; the docs page lists USDm and GBPm, but on-chain there are five stables (USDm, GBPm, EURm, CHFm, JPYm) and seven pools — see §14.1. No African currency on Monad. |
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

## Decisions log

| # | Decision | Chosen | Date |
| --- | --- | --- | --- |
| D1 | Corridor (§11) | **C** — ship AUSD/USDC → USDm → GBPm on mainnet; corridor and rate-source registry generic so NGN plugs in later; no fake naira | 2026-09-10 |
| D2 | Gas for zero-MON users (§12.3, §13) | **EIP-7702 + Pimlico paymaster primary; ERC-3009 + own relayer fallback.** Router exposes both entry points over one internal settle (§13.5) | 2026-09-10 |

---

## 11. Corridor options — DECIDED: C (see decisions log)

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

## 11.1 Naira, re-researched 14 Sep 2026 — see docs/NAIRA.md

Two corrections to what §11 assumed, both verified by reading chains rather than docs.

- **"Chainlink runs NGN/USD on Celo, where Mento relays it into a naira market" is half
  wrong.** The feed is real and live (`0xc17cBE2dB40e53F4984C46F608DA6DA1fF074c11`,
  ₦1,326.01/USD, 240 s heartbeat). The Mento naira market is **dead**: SortedOracles on
  Celo returns an empty oracle list for NGNm, `numRates` 0, `medianTimestamp` 0, no Mento
  NGN pool on any deployment, and no NGNm transfers in the last 5,000 blocks. Controls on
  the same contract read correctly. Mento's naira is dormant, not merely absent from Monad,
  so `ngn: address(0)` in their Monad config is a symptom rather than the disease.
- **No naira-denominated token exists on Monad at all.** `eth_getCode` returns zero bytes
  for every cNGN address the issuer publishes, including their own Monad testnet address.
  Their docs list Monad as "Not yet deployed". The entire on-chain naira market across all
  chains is about $400k of liquidity and under $5k a day, concentrated in one Celo pool.

Two findings that change what is buildable:

- **Chainlink CRE supports Monad.** The production KeystoneForwarder
  `0x76c9cf548b4179F8901cda1f8623568b58215E62` has 8,591 bytes of live code on chain 143.
  A workflow can publish an NGN rate into a consumer contract, moving USD→NGN from
  unpriced to quotable. It is **not** a Chainlink feed and must never be described as one.
- **Aurora Intents Deposits supports Tron USDT and BNB stablecoins as sources with Monad
  as a destination**, which is the funding gap for Nigerian users. None of its 189 assets
  is naira-denominated.

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

---

## 13. EIP-7702 gas sponsorship on Monad — researched for D2

### 13.1 Monad's 7702 rules — VERIFIED

- Type `0x04` delegation transactions are supported "with the same workflow as in Ethereum"; "after delegating with EIP-7702, any EOA may behave like an EIP-4337 smart account"; delegation persists until another `0x04` tx. https://docs.monad.xyz/developer-essentials/eip-7702.md
- Reserve rule, verbatim: "If an EOA is EIP-7702-delegated, transactions that would reduce its balance to below 10 MON will unconditionally revert." "'Dips below' means 'decrements **and** drops below'." "Transactions where the EOA's balance is unchanged or increases are fine." https://docs.monad.xyz/developer-essentials/reserve-balance.md
- **The decisive sentence:** "a delegated EOA *A* with a balance of 5 MON can still be called by a gas sponsor, and the transaction will succeed as long as *A* ends with 5 MON or more still." https://docs.monad.xyz/developer-essentials/eip-7702.md
- So a **zero-MON delegated EOA works for sponsored transactions**: in a paymaster-sponsored userOp the bundler is the tx sender, the paymaster prefunds gas, and the user's EOA balance goes 0 → 0. The docs never use the word "paymaster", so this is the rule text applied to the 4337 case, not a sentence about 4337 itself. What breaks: the EOA paying its own gas or sending MON `value` while under 10 MON. Our flow moves only ERC-20s, so the rule is a no-op as long as no call from the EOA carries MON value.
- Delegated EOAs cannot CREATE/CREATE2 in code context. Irrelevant to us. https://docs.monad.xyz/developer-essentials/differences
- EntryPoint v0.7 `0x0000000071727De22E5E9d8BAf0edAc6f37da032` and v0.8 `0x4337084d9e255ff0702461cf8895ce9e3b5ff108` both have code on 143 (RPC). https://docs.monad.xyz/developer-essentials/network-information
- 7702 is demonstrably live on mainnet: MetaMask's Monad gas-sponsorship program "uses smart accounts (EIP-7702)", but it is wallet-side and requires the user to hold 10 MON, so it is useless for our users. https://monad.xyz/blog/metamask-gasless-transactions
- Monad's AA provider list: mainnet ✅ Alchemy, Biconomy, Pimlico, Sequence, thirdweb, ZeroDev; testnet-only Gelato, Openfort. https://docs.monad.xyz/tooling-and-infra/wallet-infra/account-abstraction
- Monad's own sponsored-tx template is Privy + Pimlico + Kernel on EntryPoint v0.7, testnet. https://docs.monad.xyz/templates/react-native-privy-pimlico-sponsored-transactions

### 13.2 Providers — VERIFIED per row

| Provider | Monad 143 | 7702 on Monad | Mainnet sponsorship tier | Verdict |
| --- | --- | --- | --- | --- |
| **Pimlico** | ✅ listed, "EIP-7702 support: ✅", paymaster on EP v0.6/0.7/0.8. https://docs.pimlico.io/guides/supported-chains | ✅ | Pay-as-you-go, card required, gas cost + 10%. No free mainnet tier. https://www.pimlico.io/pricing | **Use this** |
| Alchemy | ✅ bundler + gas sponsorship. https://www.alchemy.com/docs/wallets/supported-chains | ⚠️ "EIP-7702 on Monad is currently allowlisted… contact support@alchemy.com". https://www.alchemy.com/docs/wallets/transactions/using-eip-7702 | Free tier: mainnet sponsorship N/A | Backup only |
| ZeroDev | ✅ 143 listed. https://docs.zerodev.app/sdk/faqs/chains | Kernel v3.3 has code on 143; Monad-specific 7702 not stated | $69/mo for mainnet sponsorship | Backup |
| Biconomy | MEE only on mainnet; 4337 bundler testnet-only. 7702 singleton has **no code** on 143 (RPC) | ❌ | — | No |
| thirdweb | Monad listed for bundler; 7702 chain list does not name Monad. https://blog.thirdweb.com/changelog/expanding-eip-7702-chain-support/ | UNVERIFIED | Mainnet needs billing | No |
| Coinbase CDP, Candide, Etherspot, Openfort, Gelato | Not on Monad mainnet | — | — | No |

Pimlico SDK: `permissionless` ≥0.2.24 + `viem` ≥2.28, `to7702SimpleSmartAccount` (delegate Simple7702Account `0xe6Cae83BdE06E4c305530e199D7217f42808555B`, EP v0.8, **has code on 143**, source unverified on monadscan) or `to7702KernelSmartAccount` (Kernel v3.3 `0xd6CEDDe84be40893d153Be9d467CD6aD37875b28`, **has code on 143**). The 7702 authorization is signed with Mera's viem `LocalAccount.signAuthorization` and embedded in the first userOp, so the user never pays for the delegation tx either. https://docs.pimlico.io/guides/eip7702/demo ; https://docs.pimlico.io/references/permissionless/reference/accounts/to7702SimpleSmartAccount ; https://github.com/zerodevapp/kernel/blob/release/v3.3/README.md

~~UNVERIFIED: Pimlico's paymaster contract address on 143 is not published; it is resolved by their API at runtime.~~ **Resolved 2026-09-11, see 13.6.**

Other delegates with code on 143: Alchemy MAv2-7702 `0x69007702764179f14F51cdce752f4f775d74E139` (allowlisted program only), MetaMask EIP7702StatelessDeleGator `0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B` (no paymaster of its own). https://www.alchemy.com/docs/wallets/smart-contracts/deployed-addresses ; https://github.com/MetaMask/delegation-framework/blob/main/documents/Deployments.md

### 13.3 ERC-3009 on AUSD and USDC — VERIFIED on-chain (the fallback)

- AUSD mainnet is a verified EIP-1967 proxy, implementation `0xc1e3C7D486d6A92fBE920232E439EeC2cEb112dA` ("AgoraDollar", solc 0.8.28, exact match) exposing `receiveWithAuthorization`, `transferWithAuthorization`, `cancelAuthorization`, `permit`, `eip712Domain`. https://monadscan.com/address/0xc1e3C7D486d6A92fBE920232E439EeC2cEb112dA
- RPC `eip712Domain()` → name **"Agora Dollar"**, version **"1"**, chainId 143. Canonical ERC-3009/2612 typehashes confirmed. AUSD has an asset-freezing mechanism; handle reverts. https://docs.agora.finance/developer/advanced-erc-features.md
- USDC mainnet is FiatTokenV2_2 (exact match), same ERC-3009 functions; EIP-712 domain name "USDC", version "2" (by FiatToken convention, separator not recomputed). https://monadscan.com/address/0x754704Bc059F8C67012fEd69BC8A327a5aafb603
- x402 and its Permit2 proxy on Monad are not relevant: AUSD has native ERC-3009 and x402 facilitators cannot atomically call our router. https://docs.monad.xyz/guides/x402.md

### 13.6 Pimlico plans and the mainnet gate — VERIFIED 2026-09-11 against the live API

| Plan | Price | Credits / month | Rate limit | Testnets | Mainnets |
| --- | --- | --- | --- | --- | --- |
| **Free** | $0, no card | 1,000,000 | 500 req/min | YES, all 25+ | **NO** |
| Pay-as-you-go | $0/mo, card required, then $1 per 100,000 credits | 10,000,000 | 5,000 req/min | YES | YES, all 25+ |

Credit costs: `pm_sponsorUserOperation` 500, `pm_getPaymasterData` 300, `eth_chainId` 1, so the free
million is roughly 2,000 sponsored testnet operations once the surrounding RPC calls are counted.
Mainnet gas is fronted by Pimlico and billed at cost plus 10%; testnets carry no surcharge; the
default billing threshold is $1,000 a month.
https://docs.pimlico.io/guides/pricing ; https://www.pimlico.io/pricing

Probed with our own free-plan key, one userOp, no `sponsorshipPolicyId`:

- `pm_getPaymasterData` on **10143** returns real signed `paymasterData` (`0x0100006aa34309…`) from
  paymaster `0x888888888888Ec68A58AB8094Cc1AD20Ba3D2402`. Testnet sponsorship works today, free,
  with no policy and no card.
- `pm_getPaymasterData` on **143** returns `-32603 "Insufficient Pimlico balance for sponsorship,
  please top up - Balance required: 0.000005 USD, Balance available: 0 USD"`.
- `eth_chainId` and `pm_getPaymasterStubData` succeed on **both** chains. The stub is a canned
  response that commits nothing, so it is not a probe of the gate; only `pm_getPaymasterData` is.

The mainnet gate is therefore an account balance checked when the paymaster signs, not a 4xx on the
key, and the error names the shortfall in USD. Nothing about the key or the code changes between
chains — only the funding.

The paymaster itself is now verified rather than inferred: `0x888888888888Ec68A58AB8094Cc1AD20Ba3D2402`
carries identical code on 143 and 10143 and holds a **2,587 MON deposit at EntryPoint v0.8** on
mainnet. It matches `PIMLICO_PAYMASTER_V08` in `.env`.

At the mainnet basefee measured the same day, 102 gwei, one payout sponsored at the 1,550,000
path-A gas guard costs **0.1581 MON** before Pimlico's 10%. Gas is billed on the limit, so that is
the real figure, not the 0.1501 MON the 1,471,301 measurement suggests.

### 13.7 Testnet AUSD faucet — VERIFIED by execution 2026-09-11

`0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C.requestFunds(address)` on Monad testnet sends **10,000
AUSD** (6 dp) of `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`. Executed from the deployer:
tx `0x17bd25db921c3432c29f855464a13b2ce68e2bb73fa0abbe4d62d79921ba64e9`, block 61464510, status 1,
130,600 gas. Faucet reserves were 700,000 AUSD before the claim and are 690,000 after, so about 69
claims remain and nobody is refilling it. The earlier note that execution was UNVERIFIED is closed.

### 13.4 Mera and sponsorship — UNVERIFIED

Mera's docs, repo and launch post contain no mention of 7702, gas, paymasters or smart accounts. The bounty sentence about "gas sponsorship, intents, recovery flows" is from the logged-in platform (docs/BOUNTIES.md) and is judged as bonus credit. There is no Monad Foundation paymaster program. https://mera.category.xyz/ ; https://www.monad.xyz/blog/introducing-mera

### 13.5 D2 outcome

**Primary: EIP-7702 + Pimlico paymaster.** The user's passkey EOA delegates to Simple7702Account (or Kernel v3.3) via an authorization signed by Mera's viem account, embedded in the first userOp. One sponsored userOp batches `approve(CorridorRouter)` + `settle(intent)`. The user holds zero MON throughout, which the reserve rule permits because their balance never decreases. This earns the Mera UX bounty's "stack composability" bonus and lets a scoped session key later cover prompt-free actions.

**Fallback: ERC-3009 `receiveWithAuthorization` + our relayer.** No delegation, no bundler, no reserve-rule exposure. The sender signs the authorization with the same passkey EOA; our relayer submits one tx. Verified on-chain for both AUSD and USDC.

Both paths share the same passkey EOA and the same router. `CorridorRouter` therefore exposes two entry points that call one internal settle:
- `settle(intentId)` — called by the payer (their delegated account, via a sponsored userOp) after an approve in the same batch;
- `settleWithAuthorization(intentId, validAfter, validBefore, nonce, sig)` — called by anyone; pulls funds via `receiveWithAuthorization`, which requires `msg.sender == to`, so the authorization can only be consumed by the router.

Cost to know: Pimlico mainnet sponsorship needs a card on file and charges gas plus 10%. One trivial mainnet payout costs well under a cent of MON, so this is a formality, not a budget line.

---

## 14. Week-2 contract research — VERIFIED on-chain and on forks, 2026-09-10

Thirteen agents, ~560 tool calls, everything below confirmed by `cast` against
mainnet, by Sourcify-verified source, or by Foundry fork tests. Scripts and sources
are under `scratch/` (git-ignored). Corrections to earlier sections are marked ⚠.

### 14.1 Mento V3 swap API (Router `0x4861840C2EfB2b98312B0aE34d86fD73E8f9B6f6`, Sourcify match, not a proxy)

- Source: github.com/mento-protocol/mento-core `develop`, `contracts/swap/router/Router.sol`, `contracts/swap/FPMM.sol`. FPMM implementation `0x8cB0518a0510Ab62450F79f3cD9EE0cbdDB77F30` (verified); pools are EIP-1967 proxies to it.
- `swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, Route[] routes, address to, uint256 deadline) returns (uint256[] amounts)` with `Route{address from; address to; address factory}`; `factory = address(0)` resolves to FPMMFactory. **Multi-hop AUSD → USDm → GBPm is one call with two routes.** The Router pulls `amountIn` from `msg.sender` via `transferFrom` straight into the first pool, so **approve the Router**. Intermediate USDm goes pool to pool; the Router never holds tokens. `amounts[last]` is what the recipient received.
- `getAmountsOut(uint256 amountIn, Route[] routes) view returns (uint256[] amounts)` is the same code path the swap uses: **execution equals quote to the wei within one block** (fork-verified for 1e6, 1e4 and 1 wei AUSD).
- Pricing: `getAmountOut = amountIn × num × 10^decOut × (10000 − lpFee − protocolFee) / (den × 10^decIn × 10000)`, (num, den) from the pool's OracleAdapter. **No price impact, no spread, no curve.** Fees on-chain: AUSD/USDm, USDC/USDm, USDT0/USDm 3 + 2 = **5 bps**; GBPm/USDm, EURm/USDm, JPYm/USDm, CHFm/USDm 10 + 5 = **15 bps**. Two hops AUSD→GBPm therefore cost 19.99 bps (integer 19). Fees are changeable by feeSetter `0x58099B74F4ACd642Da77b4B7966b4138ec5Ba458` up to 200 bps combined.
- Revert selectors: Router `Expired()` 0x203d82d8, `InsufficientOutputAmount()` 0x42301c23, `PoolDoesNotExist()` 0x9c8787c0; OracleAdapter `FXMarketClosed()` 0xa407143a, `TradingSuspended()` 0x4ac30c22, `NoRecentRate()` 0xeb0d3e81, `InvalidRate()` 0x6a43f8d1; FPMM `InsufficientLiquidity()` 0xbb55fd27, `InvalidToAddress()` 0x8aa3a72f (recipient must not be a pool token), `L0LimitExceeded()` 0x493e48f0, `L1LimitExceeded()` 0x91336c69, `InsufficientInputAmount()` 0x098fb561. The Router has no try/catch; pool and oracle errors bubble unchanged, and `getAmountsOut` reverts (does not return 0) when the oracle is invalid.
- Events: the Router emits nothing. Each pool emits `Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)` (topic0 `0xd78ad95f…9d822`) with `sender` = Router, plus `UpdateReserves` and five ERC-20 Transfers per two-hop swap. Index our own `PayoutSettled` and match by tx hash.
- Live at block 103611925: `getAmountsOut(1e6, [AUSD→USDm, USDm→GBPm]) = [1000000, 999350035020000000, 739017515380576786]` (0.739 GBPm per AUSD). Fork swap delivered exactly the same-block quote.
- ⚠ **All seven pools exist** (FPMMFactory.deployedFPMMAddresses): GBPm/USDm `0xD0E9c1a718D2a693d41eacd4B2696180403Ce081`, USDC/USDm `0x463c0d1F04bcd99A1efCF94AC2a75bc19Ea4A7E5`, AUSD/USDm `0xb0a0264Ce6847F101b76ba36A4a3083ba489F501`, **EURm/USDm `0x93e15A22fDa39FEfcCCe82D387A09cCF030EAD61`, JPYm/USDm `0x4DF3f08977743Ad95aB31b8dC203EAe885Ae9D32`, CHFm/USDm `0xDC81135fD82f02Cae736E261FB676B716663e8b8`, USDT0/USDm `0x0A59be741AD49c6C2E0a2d30a57eD8f5ffa5DEB8`**. All quote today. §2's "unverified" is resolved: EUR, CHF and JPY corridors are the same two-hop pattern. No direct AUSD/GBPm pool.
- Reserves at block 103611925: AUSD/USDm 966,558 AUSD / 1,096,103 USDm; GBPm/USDm 173,720 GBPm / 363,910 USDm. Trading limits (5-min / 1-day netflow): AUSD pool 2.5M / 5M; GBPm pool 77k / 385k GBPm, 100k / 500k USDm. A trivial payout cannot hit either.
- GBPm and USDm are TransparentUpgradeableProxies to StableTokenSpoke `0x6a8ff60a…` (verified): plain ERC20Permit + Ownable with minter/burner roles; no pause, blocklist, fee or hook. Delivered amount equals the recipient's balance delta.
- Do not import mento-core (BUSL-1.1, solc 0.8.24 pinned): compile a minimal local `IMentoRouter`/`IFPMM`/`IOracleAdapter`.

### 14.2 Oracle path and breakers

- Chainlink proxy → ChainlinkRelayerV1 (off-chain GCP scheduler fires every minute, ~75% of attempts skip as TimestampNotNew) → `SortedOracles.report` → `medianRate(rateFeedId)` returns (numerator, 1e24) → OracleAdapter divides to (numerator18, 1e18). Observed relay lag after a Chainlink round: 18 to 53 s. SortedOracles stores the relay block time, not Chainlink's `updatedAt`.
- `rateFeedId = address(uint160(uint256(keccak256("GBP/USD"))))` — no "relayed:" prefix on Monad. GBP/USD → `0xEA4103A6A122fbe2cDb07A80d4d293be07bb29Fa`, AUSD/USD → `0xf47172cE00522Cc7dB02109634A92CE866a15FCC`, USDC/USD → `0x81a313Ff894BFC6093d33b5514E34D7FAA41B7eF`.
- ⚠ **The pools do not share one OracleAdapter.** GBPm/USDm (and EUR/JPY/CHF) use the documented `0xa472fBBF…` whose MarketHoursBreaker `0x0A18B8e7…` is a pure, hard-coded UTC schedule. AUSD/USDm, USDC/USDm and USDT0/USDm use an undocumented adapter **`0xEB23E1339b2119c0f4a0097Cb294E990C1fA6423`** (same implementation, same SortedOracles and BreakerBox) whose breaker `0x411e0876750eE59d7D7C131e2d1F0b1a71d2ef44` is an unverified Ownable contract with `checksEnabled() = false`, so those pools are open 24/7 today. **Always read `pool.oracleAdapter()` and `pool.referenceRateFeedID()`; never hardcode.** The owner could flip `setChecksEnabled(true)` at any time.
- **Market hours (GBPm leg):** closed Friday ≥ 21:00 UTC through Sunday < 23:00 UTC, all of Dec 25 and Jan 1, and Dec 24 / Dec 31 from 22:00 UTC. Verified at a real Saturday block (102179138): `getAmountsOut` and the swap revert `FXMarketClosed()`; the AUSD/USDm pool still quoted and a real USDC/USDm swap landed. GBP/USD relays are also blocked while closed, so after Sunday 23:00 UTC the pool reverts `NoRecentRate()` until the first relay lands.
- Staleness (`SortedOracles.getTokenReportExpirySeconds`): GBP/USD and EUR/USD **360 s** (Chainlink heartbeat 240 s, so one missed relay reverts swaps); AUSD/USD and USDC/USD **3720 s**.
- Tradability pre-check without reverting: `IOracleAdapter(adapter).getRate(id)` → `RateInfo{numerator, denominator, tradingMode, isRecent, isFXMarketOpen}`; tradable iff `tradingMode == 0 && isRecent && isFXMarketOpen`. `MarketHoursBreaker.isFXMarketOpen(uint256 ts)` is pure, so the UI can predict the next open and close.
- BreakerBox: GBP/USD and EUR/USD have MedianDeltaBreaker (4% vs EMA, 900 s cooldown) + MarketHoursBreaker; AUSD/USD and USDC/USD have only ValueDeltaBreaker (±0.15% around 1.0). Any non-zero trading mode reverts `TradingSuspended()`.

### 14.3 Reference rate for the receipt — DECIDED

- **Reference = composition of the raw Chainlink proxies**, not Mento's relayed rate. Mento's SortedOracles/OracleAdapter are upgradeable proxies with unverified implementations, carry no round id, and are the venue's own pricing input, so spread against them would be tautologically equal to the fee. The Chainlink proxies and aggregators are Sourcify full matches (EACAggregatorProxy 0.6.6, AccessControlledOCR2Aggregator 0.8.19), `accessController() == 0`, and expose `roundId`/`updatedAt` so anyone can re-derive the receipt with `getRoundData`.
- AUSD→GBP reference (1e18, GBP per AUSD) `= floor(answerAUSD × 10^(18−8) × 1e18 / answerGBP)`. At block 103613028: `mulDiv(999849960000000000, 1e18, 1350240000000000000) = 740497955918947742`. USDC→GBP with the 8-dec USDC/USD proxy `0xf5F15f188AbCB0d165D1Edb7f37F7d6fA2fCebec` (the one Mento relays); the 18-dec `0x30cF74…` is an SVR DualAggregator capped at 1.05.
- Staleness thresholds for our contract: **GBP/USD max age 600 s**, **AUSD/USD max age 5400 s**; revert on `answer <= 0`, `updatedAt == 0`, `updatedAt > block.timestamp`. Feed descriptions on-chain: "GBP / USD", "AUSD / USD", "EUR / USD". Deviation thresholds: FX 0.15%, AUSD/USDC 0.05%.
- Weekends: the GBP/USD feed keeps posting every 240–270 s all weekend (700 rounds Fri 21:00Z to Sun 22:00Z, prices drifting < 0.1%), so no staleness relaxation is needed; Mento's market-hours breaker is what blocks weekend settlement.
- `rateSource` on the receipt = the address of our immutable `ChainlinkRateSource` (a write-once feed registry exposing `feeds(corridor)` → both proxies), plus a `bytes32 referenceObservation = (roundIdBase << 80) | roundIdQuote` so the receipt is replayable. `referenceObservation` is added to the attestation struct and event; mirror in the MRC draft.
- **The reference is never a min-out guard.** Verified at block 103622500: Chainlink had ticked down but Mento had not relayed yet (53 s lag), so a min-out derived from the reference reverts `InsufficientOutputAmount` while a min-out derived from the venue quote settles. `minAmountOut = quotedAmountOut × (10000 − toleranceBps) / 10000`, both user-signed. Expected AUSD→GBPm spread band: 19–21 bps in sync, up to ~30 bps for one un-relayed downward step, 15–19 for an upward step. If `maxSpreadBps` is kept it is a disclosure limit, default ≥ 50 bps; 20–25 bps would reject every payout for a minute after each downward round.

### 14.4 ERC-3009 and EIP-7702 on Monad

- AUSD executes `receiveWithAuthorization`/`transferWithAuthorization` **in the proxy** (`AgoraDollarErc1967Proxy`, solc 0.8.21, Sourcify match); the implementation only stubs them. Both `(…, uint8 v, bytes32 r, bytes32 s)` and `(…, bytes signature)` overloads exist on AUSD and USDC and both accept ERC-1271. Domain: AUSD `("Agora Dollar", "1", 143, proxy)`, `DOMAIN_SEPARATOR = 0x995063441ebf2219c94dce05014a545da4390d2362f99b3d7ad456046678cafe`; USDC `("USDC", "2", 143, proxy)`. Canonical ERC-3009 typehashes reproduced on-chain. AUSD upgrade/pause flags are all off today.
- Signature validation: AUSD uses Solady `SignatureCheckerLib` (ecrecover first, then ERC-1271); USDC uses Circle `SignatureChecker` (ERC-1271 if the signer has code). A 7702-delegated EOA has 23 bytes of code, so USDC routes it to the delegate's `isValidSignature`; Simple7702Account implements it as `ECDSA.recover(hash, sig) == address(this)`. **Path A works for a delegated payer on both tokens** (fork tests pass).
- Nonces are `bytes32`, single-use per (token, authorizer); `cancelAuthorization` exists on both. **`nonce = intentId` binds the intent to the authorization signature**; a tampered intent fails `InvalidSignature`. Nonce state is per token, so the router keeps its own `consumed[intentId]`. Use `receiveWithAuthorization` only (it enforces `to == msg.sender`); `transferWithAuthorization` could be submitted by anyone. Time checks are strict: `block.timestamp > validAfter && < validBefore`, so **validAfter = 0**. AUSD can revert `TransferPaused`, `SignatureVerificationPaused`, `AccountIsFrozen`, `ERC20InsufficientBalance`; USDC string reverts on pause/blacklist.
- **Path B proven end to end on a Monad fork with the real EntryPoint v0.8** (Sourcify perfect match): `vm.signDelegation` + `vm.attachDelegation`, real `handleOps` from a bundler, paymaster funded via `depositTo`, `executeBatch([AUSD.approve(router), router.settle])`, router saw `msg.sender == payer`, payer with 0 MON stayed at 0 MON, then the real Mento two-hop swap delivered the same-block quote. Same-tx first-use delegation with the `0x7702` initCode marker also passes; `EP.getUserOpHash` reverts "sender has no code" before delegation, so hash it off-chain with `initCodeHash = keccak256(abi.encodePacked(delegate))`. An inner-call failure is a **soft failure**: the tx succeeds, `UserOperationEvent.success = false`, the nonce is consumed and the paymaster is charged. The backend must parse our `PayoutSettled` event, never the tx status.
- Simple7702Account `0xe6Cae83B…` = eth-infinitism v0.8.0 bytecode; `execute(address,uint256,bytes)`, `executeBatch((address,uint256,bytes)[])` guarded by `msg.sender == self || entryPoint()`; entryPoint hardcoded to v0.8. It implements ERC-1271 and ERC-165.
- **Pimlico on 143:** `eth_supportedEntryPoints` returns v0.6/0.7/0.8/0.9; EP v0.8 bundler and paymaster ✅, "EIP-7702 support ✅". Paymaster **SingletonPaymasterV8 `0x888888888888Ec68A58AB8094Cc1AD20Ba3D2402`** (14,796 bytes, `entryPoint() == v0.8`, 2,588 MON deposited, bytecode identical to Base/Ethereum where Sourcify has an exact match). v0.7 paymaster `0x777777777777AeC03fd955926DbF81597e66834C`. Live probes with a real authorization from a 0-MON EOA passed all 7702 checks and failed only "AA21 didn't pay prefund" (no paymaster attached). Endpoint `https://api.pimlico.io/v2/143/rpc?apikey=…`. Sponsorship needs a **policy id**; policies have no calldata filter, so use the policy webhook to allow only `executeBatch` of `AUSD.approve(CorridorRouter)` + `CorridorRouter.settle`. `pm_sponsorUserOperation` simulates and refuses failing callData, and its validUntil is 10 minutes, so request sponsorship only when the corridor is tradable and set the swap deadline ≥ now + 10 min. alto pre-rejects a self-paying delegated sender under 10 MON ("Balance reserve error"); a 0-MON sender with the paymaster is fine.
- First-use authorization must be signed with `nonce == getTransactionCount(payer)` and chainId 143; never cache authorizations.

### 14.5 Toolchain, hardfork, gas — corrections

- ⚠ **Monad mainnet is on MONAD_TEN** (MIP-8 paged storage) since block 101352493, 2026-09-02 14:30 UTC. The network-information docs page saying MONAD_NINE is stale. Live opcode probes and `eth_estimateGas` match anvil MonadTen within 1% and MonadNine overstates gas by 23–30%. **Pin `hardfork = "monad:MonadTen"`** next to `network = "monad"`. Foundry 1.8.1 has no `--hardfork` flag for `forge test`; only the toml key. Ethereum hardfork names conflict with `network = "monad"`.
- `evm_version = "osaka"` is what 1.8.1 resolves for solc 0.8.31; PUSH0, MCOPY, TSTORE/TLOAD and CLZ all execute live on mainnet. Transient-storage reentrancy guards are safe. Solidity 0.8.31 + osaka compiled, fork-tested and simulated on mainnet; **no real broadcast of this toolchain has been made yet** (no funded key). Do the first mainnet deploy on a throwaway contract before the real one.
- MIP-8 storage costs under MonadTen: cold page SLOAD 8,100, same-page SLOAD 100, first new-slot SSTORE in an unloaded page 27,900 (19,900 if the page was read), each further new slot in the same page 17,100. **Keep hot settlement state in contiguous slots.**
- **Gas is billed on the limit**, and every mainnet receipt reports `gasUsed == gasLimit`, so explorers cannot tell you real usage; use `cast run --network monad` or anvil. Measured full-flow usage on an anvil MonadTen fork: **path A (relayer, receiveWithAuthorization + approve + 2-hop swap + 2 feed reads + 5-slot receipt) 1,254,338 gas**, live estimate 1,265,460 (+0.9%). Path B (handleOps + executeBatch) 1,373,265, with paymaster 1,383,282; `eth_estimateGas` over-estimates handleOps at ~1.80M because EntryPoint caps inner calls. Recommended: path A limit = `ceil(estimate × 1.10)` with a 1.40M floor and 1.6M cap; at the 100 gwei basefee that is ~0.14 MON per payout. A reverting tx still bills the full limit, so the relayer must `eth_call` the signed calldata first. The type-4 delegation tx costs 46,038 gas. Basefee on mainnet is 100 gwei; on a forge fork `block.basefee` reads 0 inside EntryPoint frames (fork artefact).
- Forking: `vm.createSelectFork(vm.rpcUrl("monad"), block)` works with the toml keys. rpc.monad.xyz serves state back ~1,000,000 blocks (~3.5 days), rpc3 ~1 day, rpc2 is archive-like but 429s. **Pinned blocks go stale in under 4 days**; refresh the pin or use rpc2. Cold fork ~30 s, warm ~9 s; cache `~/.foundry/cache/rpc/monad/<block>` in CI. **forge-std `deal()` fails on AUSD** (packed `{bool isFrozen; uint248 balance}` under ERC-7201 root `0x455730fed596673e69db1907be2e521374ba893f1a04cc5f5dd931616cd6b700`); write `vm.store(AUSD, keccak256(abi.encode(to, root)), bytes32((amount << 8) | isFrozen))`, or prank ReserveV2 `0x4255Cf38…` (686k AUSD). Never fund tests by transferring out of a Mento pool (breaks `FPMM.swap` with `InsufficientInputAmount`). `eth_getLogs` on rpc.monad.xyz is limited to 100-block ranges.
- ⚠ **Verification:** `api.monadscan.com/api` is a dead V1 endpoint. Monadscan is Etherscan V2: forge 1.8.1 derives `https://api.etherscan.io/v2/api?chainid=143` from `chain = 143` alone (env `ETHERSCAN_API_KEY`). MonadVision reads a **separate Sourcify server**, `https://sourcify-api-monad.blockvision.org` (not sourcify.dev). Verify twice: `forge verify-contract --chain 143 --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/ …` and `… --verifier etherscan --etherscan-api-key $ETHERSCAN_API_KEY …`. The `[etherscan]` block in `contracts/foundry.toml` and `.env.example` have been corrected.
- ⚠ Windows-native Foundry was 1.4.4 and could not compile 0.8.31 (checksum bug) or read `network = "monad"`; it has been upgraded to 1.8.1 (`foundryup -i 1.8.1`). Plain `foundryup` and the foundry-toolchain action's `stable` still install 1.5.1 — **CI must pin `version: v1.8.1`**.
- Sourcify match levels: Router and FPMM implementation are "match" (bytecode equal, metadata hash differs), not "exact match". USDC implementation and EntryPoint v0.8 are exact.

### 14.7 A local Monad on anvil — VERIFIED by running it, 2026-09-11

`anvil -n monad --hardfork monad:MonadTen --fork-url $MONAD_MAINNET_RPC_URL --chain-id 143`
serves a faithful copy of mainnet on `127.0.0.1:8545`: real Mento router code, real AUSD,
and the GBP/USD feed reading 1.3507. `forge script script/Deploy.s.sol:Deploy --broadcast`
against it deploys the whole stack and registers all five corridors, because the script's
chain guard sees chain id 143 and is satisfied.

Two things that follow, both learned the hard way.

**A local broadcast is a broadcast.** `isBroadcasting()` cannot tell anvil from Monad, so
the first local run wrote `deployments/143.json` — the canonical mainnet record — with
laptop addresses owned by anvil's account 0. `deploymentFile` now takes a third flag and
`isLocalFork` sets it, from `LOCAL_FORK=1` or from recognising anvil's ten published
default accounts, so a local run lands on `<chainId>.local.json` and carries
`"localFork": true`. `contracts/broadcast/` is git-ignored for the same reason: a local
run's artefacts sit at the same path as a real one and nothing in the path separates them.

**The fork goes oracle-stale in minutes.** anvil stamps each new block with wall-clock
time while the forked Mento price report stays frozen at the fork block, so the gap
between forking and transacting becomes staleness. Measured: `OracleAdapter.getRate` for
the GBPm feed returns `isRecent = true` at the fork block on real mainnet and
`isRecent = false` on the fork about five minutes later, which makes
`CorridorRouter.previewQuote` answer `OracleStale` and blocks every FX settlement. Fork
and transact inside the same few minutes, or re-fork. Forge's own fork tests are immune
because `vm.createSelectFork` pins `block.timestamp` to the forked block and no wall time
passes.

### 14.6 Still unverified after week-2 research

- No transaction has been broadcast on Monad mainnet with this toolchain (follow-up agent hit a usage limit). Plan: deploy a throwaway contract first.
- ~~Pimlico `pm_sponsorUserOperation` in verifying mode was not executed…~~ **Closed 2026-09-11 (13.6):** `pm_getPaymasterData` now returns a real signed commitment on testnet from a free-plan key with no policy id, and the paymaster address is read from the API and confirmed on both chains. What remains untested is a sponsored userOp that actually lands, which needs the mainnet balance.
- Mento's OracleAdapter, SortedOracles, ChainlinkRelayerFactory and relayer implementations are not source-verified on Sourcify; behaviour was matched by selector set and on-chain reads.
- Monad's 10 MON reserve rule is enforced in Pimlico's simulation ("reserve balance violation") but was not reproduced with a broadcast; Foundry forks do not emulate it. Our flow never decrements payer MON.
