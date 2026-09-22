# Stocks in Henad — what it would take

Researched 22 Sep 2026. Everything marked **verified** was read from Monad mainnet, not
from a press release.

## The short answer

It is technically possible on Monad today without redeploying anything, and it is the
wrong thing to build before 14 October. The engineering is a week if one partner
cooperates. The real obstacle is legal: a payout that delivers a stock is a securities
distribution, and Henad's whole posture — no fiat, no custody, no KYC, software rather
than an intermediary — does not survive it.

The part worth keeping is the observation underneath: the receipt is asset-agnostic. A
reference price, an executed price and the spread between them work for a share of Apple
exactly as they work for a pound. That belongs in the submission as the roadmap and in the
MRC as its generality, not in the app as a half-built corridor.

---

## What exists on Monad

| | Status | Detail |
| --- | --- | --- |
| **Anchored aStocks** | **Verified on chain** | 100+ tickers (aAAPL, aNVDA, aTSLA…), plain ERC-20, 18 decimals, same address on Ethereum, Arbitrum, Base and Monad. "Freely transferable", but administrators can pause transfers. `aAAPL` at `0x17683e492d0C8910F7c0157D04af31Cb7A23Ad71` reads back as "Apple aStock". |
| aAAPL supply on Monad | **Verified** | **44.64 tokens** — about $10k of Apple, in total, on the whole chain. |
| Where aStocks trade | Press release | Monday Trade (monday.trade): order book plus AMM, live since 16 Apr 2026, "24/5". No documented router or contract addresses for integrators. |
| aStocks on PancakeSwap | **Verified** | No pool against USDC or AUSD at any fee tier. |
| Ondo Global Markets, xStocks, Dinari | Not on Monad | Ethereum, Solana, BNB Chain, Arbitrum, Base, TON, Plume. |
| Chainlink equity feeds on Monad | **Verified: none** | 102 feeds on Monad mainnet: 91 crypto, 5 fiat, 3 tokenized-fund NAVs, 2 commodities. Zero equities. |
| Pyth equity feeds | Available, with limits | Pyth is deployed on Monad and has ~50 US equity feeds. Since 15 Jun 2026 Pyth Core carries the regular session only; pre-market, after-hours and overnight moved to Pyth Pro at $5,000/month. Pull oracle: someone must post the price update before it can be read. |
| **Gold: Chainlink XAU/USD** | **Verified** | Live on Monad, `0x61dD33A34E47a181EE02e42eE0546a3DA808f1B4`. Silver too. |
| **Gold: XAUt0** (Tether Gold) | **Verified** | `0x01bFF41798a0BcF287b996046Ca68b395DbC1071`, 6 decimals, 3,763 oz on Monad. |
| XAUt0 on PancakeSwap | **Verified: dust** | Pools exist against USDC and AUSD holding 0.000052 XAUt0 and $0.003. Not a venue. |

## What it would take to build

Henad's router was built for this kind of extension. A new asset is a new rate source, a
new venue adapter and one owner-key transaction — no router redeploy.

1. **A venue adapter for Monday Trade** implementing `IVenueAdapter` (`status`, `quote`,
   `swap`). **Blocker:** Monday Trade publishes no integrator contracts. This needs their
   team.
2. **A rate source backed by Pyth** implementing `IRateSource.getRate`. The relayer would
   post the Hermes price update in the same transaction as the settlement, because a pull
   oracle has no price until someone pays to write one. Regular session only, so stock
   payouts would settle **13:30–20:00 UTC on weekdays** (14:30–21:00 in Lagos), narrower
   than FX's 24/5.
3. **Register the corridor**: `registerCorridor(AUSD, aAAPL, corridorId("USD","AAPL"),
   pythSource, mondayAdapter)` from the deployer key.
4. **Corporate actions.** Anchored's docs do not say whether one aAAPL stays one Apple
   share through dividends and splits. If the ratio drifts, the Pyth share price stops
   being the token's reference and every receipt prints a false spread. **Blocker** until
   Anchored answers it in writing.
5. **Liquidity.** There are 44 Apple shares on Monad. A fifty-dollar payout would move the
   book, and the receipt would honestly show a large spread. Honest, and bad for the product.
6. **UI and copy**: a corridor tier for equities, market-hours language for the US session,
   and disclaimers.

Estimate: **four to six days** if Monday Trade provides integrable contracts and Anchored
answers the corporate-actions question. Unbounded if either does not.

## What it would take legally — the real obstacle

- **Tokenized stocks are securities.** Issuers exclude US persons as standard (xStocks by
  design, under Swiss law); Ondo also excludes the UK and most of the EEA. Anchored says
  "additional geographic restrictions may apply" without listing them.
- **Nigeria.** The Investments and Securities Act 2025 puts digital assets with investment
  characteristics under the SEC. In August 2026 Nigeria approved tokenized securities —
  through the NASD exchange's platform. An unlicensed app routing people into foreign stock
  tokens is precisely what the Act regulates.
- **Henad's own promises.** The landing page says Henad takes no fiat, holds no custody,
  does no KYC, and "routes between existing licensed on/off ramps; it is not one." A payout
  that delivers a security makes Henad an investment intermediary almost everywhere. That
  means geoblocking, KYC, and a lawyer — the opposite of the product.

## Fit with the submission

- Henad is entered in **Track 02, Consumer Products & Payments**, and chasing Agora's
  **cross-border payments** bounty. Stocks are Track 01 and trading-bounty territory; Agora
  runs a separate $10,000 *Best Mobile Trading App* bounty for that. Adding stocks to a
  payments submission blurs the one thing it does well.
- Judges reward depth and coherence over features that follow the week's narrative.

## The version that does fit, later

**"Send someone a share."** A cross-border payout that arrives as a stock, with a receipt
showing the reference price and the price actually paid. It uses the same receipt, the same
router and the same promise — that the cost of the conversion is public. Gold is the closer
first step: its reference feed is already Chainlink on Monad, the same oracle family as
every current corridor, and XAUt0 is on the chain. What gold lacks is a venue with depth.

## Recommendation

Do not build it before 14 October. Say it in the submission instead:

> The receipt is asset-agnostic. Anchored's tokenized stocks and Tether Gold are already on
> Monad; once there is liquidity to route through and a legal perimeter to operate in, a
> stock or gold payout is a new rate source and a new venue adapter away, with no change to
> the router or the receipt.

## Sources

- Anchored tokens: https://docs.anchored.finance/getting-started/anchored-tokens
- Anchored launch: https://www.businesswire.com/news/home/20260416940316/en/Anchored-Launches-US-Tokenized-Stocks-to-Expand-Global-Investor-Access
- Anchored and Alpaca: https://alpaca.markets/blog/anchored-finance-launches-us-tokenized-stocks-to-expand-global-investor-access/
- Monday Trade on Monad: https://www.prnewswire.com/news-releases/monday-trade-brings-top-nasdaq-stocks-on-chain-launching-first-tokenized-stock-trading-on-monad-network-powered-by-anchored-302744659.html
- Monday Trade docs: https://docs.monday.trade/
- Chainlink feeds on Monad: https://reference-data-directory.vercel.app/feeds-monad-mainnet.json
- Chainlink tokenized equity feeds: https://docs.chain.link/data-feeds/tokenized-equity-feeds
- Pyth extended-hours change: https://www.pyth.network/blog/extended-hours-us-equity-data-moves-to-pyth-pro
- Pyth market hours: https://docs.pyth.network/price-feeds/core/market-hours
- Ondo eligibility: https://docs.ondo.finance/ondo-global-markets/eligibility
- Ondo chains: https://thedefiant.io/converge/defi/ondo-finance-adds-173-tokenized-stocks-etfs-430-assets-three-chains
- xStocks restrictions: https://eco.com/support/en/articles/15254023-tokenized-equities-2026-backed-dinari-robinhood
- Nigeria ISA 2025: https://cryptoslate.com/crypto-laws/nigeria-investments-securities-act-2025-virtual-digital-assets/
- Nigeria tokenized assets approval: https://www.bloomberg.com/news/articles/2026-08-04/nigeria-approves-tokenized-assets-to-boost-capital-market-growth
- Monad token list (XAUt0): https://raw.githubusercontent.com/monad-crypto/token-list/main/tokenlist-mainnet.json
