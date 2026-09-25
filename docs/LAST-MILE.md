<!-- Researched 24–25 Sep 2026 by seven agents: five angles, a completeness critic that re-checked load-bearing claims against primary sources, and a synthesis. Untagged claims were read from a primary source or on chain. -->

# Who Mento was built for, and what your recipients do when they need cash

**How to read the tags.** A claim with no tag is VERIFIED: I read it from a primary source or on chain on 24–25 Sep 2026. **[REPORTED]** means it comes from a secondary source. **[UNKNOWN]** means it is not confirmed, so don't say it in public.

---

## 1. Who Mento was built for

**On Celo, Mento was built for people in emerging markets who use money through their phone.**
- Mento Labs names its target as emerging markets that need stable assets for "remittances, mobile payments, saving, lending, and borrowing in local currencies" (https://www.mento.org/blog/mento-labs-2023-year-in-review).
- The Kenyan shilling coin was proposed for diaspora remittances and microloans (https://forum.celo.org/t/final-launch-of-a-kenyan-shilling-stablecoin/7964).

**Mento never solved cash-out. The wallet did.**
- Mento reaches users mainly through Opera's MiniPay, which has 19M+ activated wallets (https://minipay.to/).
- MiniPay says "All exchanges between stablecoins and local currency are facilitated by third party providers" (https://minipay.to/). Its terms say its operator "does not facilitate or provide fiat to crypto exchange, crypto to fiat exchange" (https://minipay.to/terms-of-service).
- The partners built into the app are Ramp, Transak, Binance, Unlimit, Yellow Card, Partna, Banxa, Fonbnk and Cashramp, working "from $1 and up" (https://press.opera.com/2025/05/13/minipay-standalone-app-ios-android/). By Sep 2025 there were 17 fiat partners (https://www.prnewswire.com/news-releases/minipay-turns-two-with-10-million-wallets-and-270-million-transactions-pointing-to-stablecoins-leading-web3-302557620.html).
- The newer approach is to avoid cashing out at all:
  - "Pay with MiniPay" makes Nigerian bank transfers straight from a USDT balance, through Partna (https://minipay.to/blog/pay-with-usdt-minipay-is-live-in-nigeria).
  - A Visa debit card runs through Gnosis Pay (https://press.opera.com/2026/06/23/minipay-visa-debit-card/).

**Even those users mostly hold dollars, not local-currency coins.**
- MiniPay holds USDT, USDC and cUSD (now called USDm) and shows the balance in the user's local currency (https://minipay.to/ ; https://blogs.opera.com/africa/2023/09/minipay-frequently-asked-questions/).
- Supply on Celo on 24 Sep 2026: USDm 14.16M, NGNm ₦64.5M (about $48k) and KESm KES 10.3M (about $80k). Source: on-chain `totalSupply` via https://forno.celo.org, with addresses from https://docs.mento.org/mento-v3/build/deployments/addresses.md. The dollar figures are my own conversions.
- MGP-18 caps new minting of those local coins at 1.1× their current supply (https://forum.mento.org/t/mgp-18-mento-v2-deprecation/137).
- MGP-19 hands control of issuance to Celo governance so Mento Labs can focus on its FX exchange (https://forum.mento.org/t/mgp-19-bringing-stable-asset-issuance-home-to-celo-governance/139).

**On Monad, Mento serves businesses, apps and liquidity providers, not consumers.**
- Mento's pitch for Monad is "Cross-border payroll, invoicing, and treasury workflows", "Fintech apps that need stable, real-time currency conversions" and DeFi (https://www.mento.org/blog/mento-is-bringing-onchain-fx-to-the-monad-ecosystem).
- The launch post names traders, liquidity providers, developers and institutions. It names no cash-out partner (https://www.mento.org/blog/mento-launches-on-monad-bringing-fx-markets-to-a-high-performance-l1).
- Between 99.0% and 99.97% of the GBPm, EURm, CHFm and JPYm on Monad sits inside Mento's own pools. Only about 821 GBPm is held anywhere else. Source: on-chain `totalSupply`/`balanceOf` at block 107,657,152, with the pools listed by the factory at https://monadscan.com/address/0xa849b475FE5a4B5C9C3280152c7a1945b907613b.

**In short:** Mento does the currency conversion, and the app built on top of it has to handle the last step to cash. On Celo that app is MiniPay. On Monad there is no MiniPay. Henad is exactly the "fintech app" Mento describes for Monad, so cash-out is Henad's problem.

---

## 2. What a GBPm, EURm, CHFm or JPYm recipient can do today

**No off-ramp accepts GBPm, EURm, CHFm, JPYm or USDm on Monad.** I checked the live token lists of Ramp (https://api.ramp.network/api/host-api/v3/offramp/assets), MoonPay (https://api.moonpay.com/v3/currencies), Coinbase (https://api.exchange.coinbase.com/currencies), Bitget (https://api.bitget.com/api/v2/spot/public/coins), Binance (https://www.binance.com/bapi/capital/v1/public/capital/getNetworkCoinAll), Guardarian (https://api-payments.guardarian.com/v1/currencies/crypto), Mercuryo (https://api.mercuryo.io/v1.6/lib/currencies) and Transak (https://api.transak.com/cryptocoverage/api/v1/public/crypto-currencies).

So every exit starts with swapping back to a USD stablecoin on Mento. That has four consequences:

- **Cost.** GBPm → USDm → USDC pays 15 + 5 basis points in fees. Source: on-chain `lpFee`/`protocolFee`, and https://raw.githubusercontent.com/mento-protocol/mento-core/main/contracts/swap/FPMM.sol. Live quotes on Monad on 24 Sep 2026 (on-chain `getAmountOut`):
  - 100 GBPm → 132.13 USDm, against a Chainlink GBP/USD rate of 1.32327.
  - 100 USDm → 99.96 USDC.
  - That is about 0.19% in total.
- **Henad has to do this swap itself.** The LI.FI aggregator finds no route out of GBPm (https://li.quest/v1/quote, 24 Sep 2026).
- **Weekends are closed.** The currency pools cannot swap from Friday 21:00 to Sunday 23:00 UTC, or on 25 Dec and 1 Jan (https://docs.mento.org/mento-v3/dive-deeper/fpmm/oracles-and-circuit-breakers.md). A recipient paid on Friday night is stuck until Sunday night.
- **The receipt no longer matches what arrives.** The off-ramp converts USD back to GBP at its own rate and fee, so Henad's receipt rate is not what reaches the bank account.

Here are the routes, most practical first.

**1. Swap to USDC or AUSD, then sell through Ramp Network (UK, EU and US recipients).**
- Ramp sells MON, USDC, AUSD and USDT0 from Monad.
  - GBP payouts: £5.67 to £12,842 per sale.
  - EUR payouts: €6.59 to €14,923 per sale.
  - Source: https://api.ramp.network/api/host-api/v3/offramp/assets?currencyCode=GBP
- UK sellers are paid to a Visa or Mastercard card, not by Faster Payments (https://rampnetwork.com/blog/off-ramp-is-now-global).
- Fees (https://support.rampnetwork.com/en/articles/8957-what-are-the-fees-for-selling-crypto-at-ramp):
  - Card payout: 4.49%, minimum €1.99.
  - EU SEPA payout: 0.99%, minimum €1.99.
- EU sellers must use USDC, because AUSD and USDT0 are excluded in the EU (https://rampnetwork.com/blog/monad-live-on-ramp-network).
- Ramp runs the ID checks. The payout must go to an account or card in the seller's own name (https://support.ramp.network/en/articles/8992-what-payout-options-does-ramp-support-for-selling-crypto).
- Ramp does not serve residents of Nigeria, Kenya, Ghana, Uganda, Tanzania or Japan (https://support.rampnetwork.com/en/articles/433-which-countries-and-us-states-are-unsupported-for-buying-and-selling-crypto).
- **The catch:** Ramp's hosted flow needs a partner key, `hostApiKey` (https://docs.rampnetwork.com/web/quick-start-hosted). **[UNKNOWN]** whether a recipient can reach Ramp's Monad off-ramp without a partner app. In practice this route works once Henad integrates Ramp.
- **Rough UK cost.** The sender's swap costs 20 basis points, the recipient's swap back costs 20 basis points, and the Ramp card payout costs 4.49%. That comes to about 4.9% before Ramp's own GBP rate, which is **[UNKNOWN]**. This is my arithmetic. The cost is almost all Ramp's fee, not Mento's.

**2. Send USDC to an exchange, sell it, and withdraw.**
- **Coinbase.** USDC on Monad is online, with a minimum withdrawal of 0.01 (https://api.exchange.coinbase.com/currencies/USDC).
  - UK users can withdraw GBP by Faster Payments with no Coinbase withdrawal fee **[REPORTED]** (https://help.coinbase.com/en/exchange/funding/withdrawing-with-a-uk-bank-account). A trading fee still applies.
  - Coinbase has no NGN support **[REPORTED]** (https://investingintheweb.com/blog/coinbase-countries/).
- **Bybit.** It accepts USDC and USDT0 deposits on Monad (https://announcements.bybit.com/en/article/bybit-now-supports-usdt0-and-usdc-deposits-and-withdrawals-on-monad-blt15b2a0e2d7da329f/).
  - Its peer-to-peer naira market is live. There were 564 USDC/NGN and 1,243 USDT/NGN ads to sell into, at about ₦1,373–1,381 per dollar (Bybit P2P API, `POST https://api2.bybit.com/fiat/otc/item/online`, 25 Sep 2026).
  - ID checks are required **[REPORTED]** (https://www.bybit.com/en/p2p/sell/USDT/NGN), and the seller carries peer-to-peer counterparty risk.
- **Bitget.** USDC deposits on Monad are open, but withdrawals are disabled (https://api.bitget.com/api/v2/spot/public/coins?coin=USDC, 25 Sep 2026). Whether Bitget pays out GBP or NGN is **[UNKNOWN]**.
- **Friction:** an exchange account with ID checks, copying a deposit address, and choosing the Monad network correctly. The exchange holds the money during the sale.

**3. Spend by card after swapping to USDC.**
- **MetaMask Card.** It takes only USDC on Monad.
  - Available in the EU/EEA, Switzerland, Canada and parts of Latin America.
  - New sign-ups are paused in the UK and US, and Nigeria is not eligible.
  - Sources: https://support.metamask.io/trade/metamask-card/funding/ ; https://support.metamask.io/trade/metamask-card/what-is-metamask-card/
  - The card spends dollars, so every purchase pays a currency conversion again.
- **Avici.** Its wallet supports Monad, and the card swaps any token to USDC automatically through Relay.
  - Available in Ghana, Kenya, South Africa, Uganda, Zambia and others. Not the UK, EU or Nigeria.
  - Fees: no transaction fee, 0% Avici markup, 0.4–1% Visa cross-border fee, and $15 for the first card.
  - Sources: https://docs.avici.money/getting-started/secured-credit-cards/regions-and-prohibitions-for-avici-card ; https://docs.avici.money/getting-started/secured-credit-cards/fees-and-limits
- **Gnosis Pay.** It is the only card that spends GBP natively: UK accounts get GBPe (https://docs.gnosispay.com/api-reference/safe-management/set-safe-currency.md). But it lives on Gnosis Chain, not Monad. Live quotes (https://li.quest/v1/quote):
  - 100 USDC on Monad → 74.19 GBPe, about 1.8% all-in.
  - 100 EURm → 98.87 EURe, about 1.1%.

**4. African recipients: bridge USDm to Celo and use MiniPay.** This only applies if the recipient was paid in a USD stablecoin, not GBPm.
- Swap to USDm on Monad, then use app.mento.org/bridge, which takes about 20 minutes over Wormhole (https://raw.githubusercontent.com/mento-protocol/frontend-monorepo/main/apps/app.mento.org/app/components/bridge/bridge-config.ts).
- The bridge delivers the same token MiniPay holds as cUSD (0x765D…282a, symbol USDm). I checked `token()` on Celo bridge contract 0xa409…8bc on 25 Sep 2026.
- From there, MiniPay's partners pay out:
  - Nigerian bank transfer or airtime (https://blogs.opera.com/africa/2023/10/minipay-now-open-to-all-users-in-nigeria/).
  - M-Pesa (https://minipay.to/blog/paypal-to-mpesa).
- Fonbnk also pays Nigerian bank accounts and airtime directly. Its docs say Nigerian off-ramps currently need no ID check (https://docs.fonbnk.com/kyc.md).
- **Friction:** two chains, gas on both, and a bridge fee that is **[UNKNOWN]**. This is the route Mento's real users take, but it happens on Celo.

**5. EU businesses only: swap EURm to Newrails EURW and redeem.**
- 100 EURm → 99.39 EURW, about 0.6% (https://li.quest/v1/quote).
- Newrails redeems EURW 1:1 with no fee into a Newrails IBAN. It is for businesses only, and business checks take 3–10 working days (https://www.newrails.xyz/en/platform/eurw ; https://www.newrails.xyz/en/business/account).
- Whether individuals can use it is **[UNKNOWN]**.

**6. Hold and earn. This is not a cash-out.**
- Merkl pays about 23% a year to people who provide liquidity to the GBPm/USDm pool. You must put in both tokens, and rewards come in two-week batches paid in USDm (https://api.merkl.xyz/v4/opportunities?chainId=143&search=Mento).
- No lending market on Monad lists these tokens. Source: on-chain Aave `getReservesList()`, and https://api.morpho.org/graphql.
- GBPm cannot be redeemed on Monad, because Mento has no loan contract there (https://docs.mento.org/llms-full.txt).

**7. JPYm and CHFm have no verified way to reach a yen or franc bank account.**
- Ramp excludes Japan (link in route 1). Bridge prohibits Japan (https://apidocs.bridge.xyz/platform/customers/compliance/supported-countries-list).
- A Swiss recipient can use the MetaMask Card, which spends dollars.
- **Paying suppliers directly in GBPm or EURm is not possible either.** Stripe's stablecoin payments take only USDC, USDP and USDG, and it supports neither Monad nor UK businesses (https://docs.stripe.com/payments/stablecoin-payments).

**Bottom line:** a recipient who doesn't know crypto has no one-tap way to cash out today. The best UK path is three onchain steps followed by a card payout costing at least 4.49%, and it only works once Henad integrates Ramp.

---

## 3. Cash-out options Henad could add without holding money or doing ID checks itself

Every working example follows the same model: MiniPay, Valora's FiatConnect standard and Stellar's SEP-24 all work this way.
1. The wallet opens the licensed partner's own ID-check screen.
2. The wallet sends the funds to a deposit address the partner gives it.
3. The partner pays an account in the recipient's own name.

FiatConnect: "MUST also return a transferAddress" (https://raw.githubusercontent.com/fiatconnect/specification/main/fiatconnect-api.md). SEP-24: https://raw.githubusercontent.com/stellar/stellar-protocol/master/ecosystem/sep-0024.md

The options below are ordered from least to most effort.

| # | Option | Effort | Fits "routes between licensed ramps" | Works on Monad? |
|---|---|---|---|---|
| A | Deliver USDC instead of GBPm when the recipient wants cash | Very low | Neutral | Yes |
| B | Per-country "how to cash out" screen | Low | Weak | Yes, for the routes in section 2 |
| C | Ramp Network hosted cash-out | Medium | **Best** | **Yes, confirmed** |
| D | Switch API for naira and Africa | Medium | Good, if its licensing checks out | Yes for USDC/USDT0; licensing **[UNKNOWN]** |
| E | Onramp Money hosted cash-out | Medium | Good | **[UNKNOWN]** |
| F | Bridge (Stripe) deposit addresses that auto-convert to fiat | High | Strong | **[UNKNOWN]** |
| G | Coinbase hosted cash-out | Medium–high | OK | **[UNKNOWN]** |
| H | Agora AUSD redemption, for businesses | Medium | Niche | Yes, organisations only |

**A. Deliver USDC when the recipient plans to cash out.**
- The USDC/USDm pool already exists in Mento's factory list (on-chain `deployedFPMMAddresses()`).
- This skips the roughly 0.4% round trip. It also avoids the weekend closure, because the USDC/USDm pool is not closed on weekends (https://docs.mento.org/llms-full.txt).
- The trade-off: the currency conversion moves to the ramp, off chain, so the receipt no longer shows a GBP rate.
- Keep GBPm for recipients who want to hold it.

**C. Ramp Network hosted cash-out, using its "Send with your wallet" mode.**
- In this mode Henad's wallet signs the transfer to Ramp itself (https://docs.rampnetwork.com/configuration ; https://docs.rampnetwork.com/off-ramp-native-flow/general).
- The link can be pre-filled with `defaultFlow=OFFRAMP`, `inAsset`, `inAssetValue` and `outAsset` (https://docs.rampnetwork.com/search-params-migration).
- **Must confirm:**
  - Getting a `hostApiKey` means registering as a Ramp partner.
  - The asset code `MONAD_USDC` is my inference from Ramp's API, not from their docs. Test it on Ramp's demo environment first.
- Coverage: GBP by card, EUR by SEPA, USD by ACH. No NGN, KES, GHS or JPY.

**D. Switch (onswitch.xyz) for Nigeria and 20 other African countries.**
- It accepts USDC and USDT (the USDT0 contract) on Monad, but not AUSD (https://docs.onswitch.xyz/stablecoins.md).
- `POST /offramp/initiate` returns a deposit address, and the payout runs automatically once the funds arrive (https://docs.onswitch.xyz/guides/stablecoin-to-ngn.md). Henad's contract or the recipient's wallet can send straight to that address.
- **Must confirm, all [UNKNOWN]:**
  - Fees. The rates endpoint needs a key (https://api.onswitch.xyz/rates).
  - Whether Henad must pass business checks.
  - Which licensed company actually makes the payouts.
  - What ID checks recipients go through.
- The Monad docs say Switch pays out GBP and EUR, but Switch's own country list shows only African countries (https://docs.onswitch.xyz/countries.md).

**E. Onramp Money.**
- Its docs list cash-out to NGN, GBP, EUR, KES and GHS (https://docs.onramp.money/onramp/supported-assets-and-fiat/fiat-currencies).
- In Nigeria, selling needs the national ID number (NIN) plus a selfie. Limits are ₦2M per transaction and ₦3.75M a month (https://docs.onramp.money/onramp/kyc-tiers-for-users).
- **[UNKNOWN]** whether a sale of Monad USDC actually gets a quote. Its sell config lists Monad (network 10525), but there is no deposit setting for it (https://api.onramp.money/onramp/api/v2/sell/public/allConfig).
- If it does work, it is the only hosted cash-out found that covers both GBP and NGN.

**F. Bridge (Stripe).**
- Bridge offers permanent deposit addresses that convert automatically to fiat. It can pay the customer or a third party, and UK Faster Payments arrive in about 5 minutes (https://apidocs.bridge.xyz/get-started/guides/move-money/gbp_fps_integration_guide ; https://apidocs.bridge.xyz/platform/orchestration/liquidation_address/liquidation_address).
- This would let Henad's contract pay a UK bank account directly, with no wallet needed by the recipient.
- **Monad support is [UNKNOWN].** Bridge's docs route table lists Monad USDC (https://apidocs.bridge.xyz/get-started/introduction/what-we-support/payment-routes.md), but its live API spec has no "monad" (https://withbridge-image1-sv-usw2-monorail-openapi.s3.amazonaws.com/latest.json).
- It needs a platform agreement with Bridge, and every customer goes through Bridge's hosted ID check (https://apidocs.bridge.xyz/platform/customers/customers/kyclinks).

**G. Coinbase hosted cash-out.**
- A server creates a single-use session token that expires in 5 minutes. The user then has 30 minutes to send the crypto.
- Payouts are ACH (US), PayPal (selected countries) or a Coinbase balance (https://docs.cdp.coinbase.com/onramp/offramp/offramp-integration-guide).
- **[UNKNOWN]** whether this hosted flow accepts Monad as the source chain.

**H. Agora AUSD redemption, for business recipients.**
- Agora redeems AUSD to USD sent to a verified bank account, or to USDC. Monad is a supported chain, organisations only, and the bank account currency is "usd today" (https://docs.agora.finance/api/endpoints/routes/create.md ; https://docs.agora.finance/api/endpoints/accounts/overview.md).
- Agora says "No basis point fee on redemptions" (https://www.agora.finance/product/instant-liquidity).
- Whether non-US organisations can use it is **[UNKNOWN]**.

**What this means for positioning.** Every real route makes Henad a registered partner of a licensed provider: a Ramp partner key, a Switch service key, an Onramp Money app ID or a Bridge agreement. Henad can still hold no money and run no ID checks, because the partner does the checks. But "no business relationship with any regulated firm" is not realistic.
- MiniPay's terms (https://minipay.to/terms-of-service) are the wording to copy.
- UK: the FCA's rules on crypto promotions cover stablecoins, including firms based overseas that reach UK consumers **[REPORTED]** (https://www.fca.org.uk/publications/policy-statements/ps23-6-financial-promotion-rules-cryptoassets). Check any cash-out prompt shown to UK users against them.

**For docs/YOUR-LIST.md:**
- Register with Ramp for a `hostApiKey`, then test a `MONAD_USDC` cash-out on Ramp's demo environment.
- Open a Switch dashboard account and ask about business checks, the licensed payout company and NGN fees.
- Get an Onramp Money app ID and test quotes for Monad USDC to NGN and to GBP.
- Ask Bridge whether Monad is live in its API.
- Ask Agora whether non-US organisations can redeem AUSD.

---

## 4. The truth about the currency routes

**Almost every real recipient needs a cash-out.**
- Almost nobody holds GBPm on Monad: about 821 GBPm sits outside the pool (on-chain, section 1).
- For a UK recipient, GBPm on Monad is what shows on the receipt, not money they can spend.

**What each currency has on Monad today:**

- **GBP**
  - The pool holds 136,672 GBPm (on-chain `getReserves`).
  - The pool only refills when someone bridges GBPm in from Celo. Mento's reserve cannot create GBPm on Monad (on-chain `liquidityStrategy`/`isMinter`).
  - Between 1 and 23 Sep, 113,715 GBPm was bridged out and only 6,667 in (on-chain bridge mint and burn logs).
  - Swap caps are 77k GBPm per 5 minutes and 385k per day (on-chain `getTradingLimits` ; https://docs.mento.org/mento-v3/dive-deeper/fpmm/trading-limits.md).
  - Cash-out routes: Ramp card payout at 4.49%, Coinbase by hand, and Bridge **[UNKNOWN]**.
- **EUR**
  - The pool holds 286,282 EURm (on-chain).
  - Cash-out routes: Ramp SEPA at 0.99% (USDC only in the EU), EURW redemption for businesses, and the MetaMask Card.
- **CHF and JPY**
  - Each pool holds about $60k and has had no swaps since 8 Sep and 11 Sep respectively (on-chain `blockTimestampLast`).
  - No verified way to reach a franc or yen bank account.
- **NGN, KES and GHS**
  - No token on Monad, and no Chainlink price feed on Monad (https://reference-data-directory.vercel.app/feeds-monad-mainnet.json).
  - WrappedCBDC's regulated naira token, cNGN, exists on Monad testnet only. Its testnet address has no code on mainnet (https://raw.githubusercontent.com/wrappedcbdc/stablecoin-cngn/main/README.md ; on-chain `cast code`, chain 143).
  - **Naira payouts from Monad USDC are still possible:**
    - Switch (business API).
    - Bybit peer-to-peer.
    - Moving USDC to Base with Circle's CCTP (https://developers.circle.com/cctp/cctp-supported-blockchains.md), then selling through Paycrest, Fonbnk or Busha.

**Correct the line "NGN has no Chainlink feed": it should say "on Monad".** Celo has a live Chainlink NGN/USD feed, and Mento's NGNm uses it (https://reference-data-directory.vercel.app/feeds-celo-mainnet.json).

**Choose the naira reference rate carefully.**
- The stablecoin market pays about ₦1,373–1,381 per dollar (https://api.paycrest.io/v1/currencies ; Bybit peer-to-peer).
- Chainlink and Ramp use about ₦1,326.
- That is 3.5–4% more naira in the market. A receipt that uses the oracle rate as its reference would make the recipient look worse off when they actually got more naira. State on the receipt which rate it uses.

**What this means for the pitch.**
- The currencies where the onchain conversion is real are GBP and EUR. Those recipients already have good banks, and on Monad their only verified way out goes back through dollars.
- The currency where stablecoins matter most is NGN. It has no onchain conversion on Monad, but a USDC-to-naira payout through partners does exist.
- So Henad's honest value on Monad is not "the recipient holds GBPm". It is:
  1. A transparent onchain FX quote and receipt.
  2. One transaction.
  3. Handing the last step to a licensed partner.
- Pitch GBP and EUR as onchain FX with a receipt, paid out through a partner.
- Pitch Nigeria as a USDC-to-naira payout through a partner. Do not claim a naira token.

---

## 5. What to say to judges

"Mento does the currency conversion and leaves cash-out to the apps built on it. On Celo that app is MiniPay and its licensed ramps; on Monad it's Henad, which turns AUSD into GBPm in one transaction with the reference rate, executed rate and spread recorded on chain. For cash-out we hand off to licensed ramps that already take Monad stablecoins, starting with Ramp Network, which pays out GBP and EUR from Monad USDC, so Henad never holds money or runs ID checks."

Only say "integrated" once the Ramp partner key and the `MONAD_USDC` test have worked.