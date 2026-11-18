# Stocks in Henad — what it would take

Researched 22 Sep 2026, revised the same day after reading Monday Trade's RWA trading
docs. Everything marked **verified** was read from Monad mainnet.

## Status, 25 Sep 2026: parked until after the hackathon

Monday Trade's team replied in their Discord ticket (#ticket-0656) that they will "hold on to
any discussion until after the hackathon". Without their approval of Henad-onboarded wallets
in the compliance registry, no Henad user can deposit, so nothing ships before 14 Oct. The
fork-verified integration below stays as the starting point; reopen the ticket after the
deadline. In the submission, say "integration verified on a mainnet fork, awaiting partner
approval" — not "live".

## Update, 18 Nov 2026: xStocks on Uniswap v4 open a path that needs no partner

Monad announced on 17 Nov that tokenized equities have liquidity on Uniswap v4. Read from
mainnet the same day (**verified**):

- There are 10 real markets. Each pairs USDC with a *wrapped* xStock (an ERC-4626 vault over
  the xStock, 18 decimals) at a 0.01% fee, tick spacing 1, and **no hook**. That means no
  permissioned-pool allowlist: any wallet can swap.
- A wrapped xStock and its underlying both transfer to a fresh random wallet in simulation. The
  only on-chain gate we found is xStocks' SanctionsList (0x615dd3b9445a94334c1579f68115042d77cc7c44).
- About 1,400 other "…x" pools showed up in the same scan with ~99% fees. Those are spam.
  Match pools by token address, never by symbol.

| Wrapped | Address | Underlying | USDC per token, buying $10 / $1k / $10k |
|---|---|---|---|
| wNVDAx | 0xa8ddb5Cd96b5222AFe198316E9A57CAA642850D5 | NVDAx 0xc845b2894dBddd03858fd2D643B4eF725fE0849d | 160.74 / 160.94 / 162.74 |
| wTSLAx | 0xc3FdBe3A68EE5dE461D30415a8165cf9Aefe1171 | TSLAx 0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0 | 383.73 / 384.14 / 387.89 |
| wSPYx | 0xE7E553Cd128F0011777323A0b44a7b96EA1CB540 | SPYx 0x90A2a4c76b5D8c0bc892A69EA28Aa775a8f2dD48 | 742.07 / 742.83 / 749.81 |
| wQQQx | 0x4C1AE29c159838fC1b224636E28E086EB69101f7 | QQQx 0xa753A7395cAe905Cd615Da0B82A53E0560f250af | 666.00 / 666.72 / 673.27 |
| wSMHx | 0x23c4BDDea5e7E284fB4027c6050bC5E6f7FaE23f | SMHx 0x8D512a03600981B8e86556fd5C0FbDd726Fe1821 | 472.31 / 472.88 / 478.00 |
| wMUx | 0xe2047ee3bdDb5C99ae428AB83df63f8730698e30 | MUx 0xf6a873BAe4Ba1B304e45dF52A4b7D176E1C6a8c4 | 733.06 / 734.05 / 743.01 |
| wSKHYx | 0x6215a58ed045d71F2561AaAbe54f4C885C522998 | SKHYx 0x58100046a4Afcd4eE4faDbD4244f3f895a341c56 | 126.94 / 127.10 / 128.57 |
| wSPCXx | 0x8e2eeD8b8B5E13Ea7BF38e50d7821d2C57309072 | SPCXx 0x68fa48B1C2FE52b3D776E1953e0E782b5044Ce28 | 142.28 / 142.43 / 143.75 |
| wEWYx | 0x021b40617982074748C81a19d22046CC2548C3bE | EWYx 0x299c95Eb52BFd5Bc98d924bCE17197b64864589B | 138.63 / 138.79 / 140.28 |
| wSGOVx | 0x4Ac39e0881e5967822cCE9d166D1b7Ac12402ba1 | SGOVx 0x2daFA4732c8c1b25701a33B05F10f437F9599326 | 102.21 / 102.31 / 103.23 |

Price impact is about 0.1% at $1k and about 1.2% at $10k. That's fine for retail amounts. The
wQQQx and wEWYx pools at a 0.0075% fee are too thin to use; take the 0.01% pool.

Uniswap v4 on Monad (from developers.uniswap.org): PoolManager 0x188d586ddcf52439676ca21a244753fa19f9ea8e,
V4Quoter 0xa222dd357a9076d1091ed6aa2e16c9742dd26891, StateView 0x77395f3b2e73ae90843717371294fa97cc419d64,
Universal Router 0x0d97dc33264bfc1c226207428a79b26757fb9dc3, Permit2 0x000000000022D473030F116dDEE9F6B43aC78BA3.

**Still open before building:**
- Eligibility. xStocks are not offered to US or UK persons, and probably not in other
  restricted places either. Read the xStocks terms and add a geo-gate plus an eligibility line
  before shipping. Nigeria is likely fine, but check it.
- Price display. The wrapped token's value is `convertToAssets(1e18)` times the stock price. Several
  vaults are already above 1:1 (wSPYx 1.0075, wSGOVx 1.017). The chart currently reads Monday
  Trade's oracle for *Anchored* aStocks, which are different tokens. Compare the pool's mid price
  against a reference before showing a spread on the receipt.
- Swap path: Universal Router v4 swap with a Permit2 approval of USDC.

## The short answer

**It is buildable, as a Stocks page next to Top up, in three to four days** — provided we
can call Monday Trade's StockRouter directly rather than through their API. It is not a
payout corridor: stock orders fill later, against the real US market, so the receipt
cannot be written in the same transaction the way an FX receipt is.

What makes it worth doing is the receipt. Monday Trade publishes an on-chain stock oracle
with bid and ask. Henad can show, for every purchase, the quoted price at the moment of
the order, the price actually paid, and the difference — which no stock app does.

---

## What exists on Monad

| | Status | Detail |
| --- | --- | --- |
| **Anchored aStocks** | **Verified** | 100+ tickers (aAAPL, aNVDA, aTSLA…), plain ERC-20, 18 decimals, same address on Ethereum, Arbitrum, Base and Monad. Freely transferable; the issuer can pause transfers. `aAAPL` = `0x17683e492d0C8910F7c0157D04af31Cb7A23Ad71`, 44.64 tokens on Monad. |
| **Monday Trade RWA trading** | Docs | Buys and sells aStocks against the real US market through broker partners. **No KYC** (their docs: "RWA Trading on Monday Trade does not require KYC"). Terms under Singapore law. |
| StockRouter | Docs | `0x4f090d817fd83753988a7b0c1d76f170f8461be8` — the only contract integrators call. Same address on Base, Monad, Ethereum. |
| Cashier / Stock / OneClickRouter | Docs | `0x8c1b182b…a9` (holds mUSD credit), `0x6d202d2f…ac` (orders and stock balances), `0x102c30ac…65` (optional gasless forwarding via their API). |
| **StockOracle** | **Verified live** | `0x037848af338c38e1e0ab722be80bf4c2e612a1f7`. `priceId = keccak256("AAPL")`. Read at 13:24 UTC today: **AAPL $340.155**, bid $340.11, ask $340.20, 8 decimals, published 5 minutes earlier. Source quote is about 15 minutes delayed, 10-minute heartbeat. |
| Cash token on Monad | Docs | **USDC only** (`0x7547…b603`). Not AUSD. |
| Minimum deposit | Docs | **90 USDC.** |
| Fees | Docs | Deposit 0. Buy 11 bps (10 third-party, 1 protocol). Sell 1 bps. Withdrawal of cash 21 bps. |
| Instant limits | Docs | A deposit is instant only up to 20% of the current credit buffer (capacity 20,000 mUSD, so roughly $4,000). Larger ones queue. |
| Chainlink equity feeds on Monad | **Verified: none** | 102 feeds; none are equities. Not needed — StockOracle covers it. |
| Gold | **Verified** | Chainlink XAU/USD live on Monad; XAUt0 on Monad (3,763 oz), but PancakeSwap pools hold dust. |

## How a purchase works

1. The user approves USDC to StockRouter.
2. One transaction deposits USDC (becoming mUSD, a non-transferable trading credit) and
   places a market buy by dollar amount (`orders/with-deposit`).
3. The order fills against the traditional market — possibly partially, possibly not at
   all outside US hours. Settlement is asynchronous; the docs warn not to treat a mined
   transaction as a filled order.
4. Bought stock is credited inside Monday Trade's Stock contract. Withdrawing it puts the
   aStock ERC-20 in the user's own wallet.

## What Henad would build

- **Stocks page, web and mobile**: a short list (Apple, NVIDIA, Tesla…), each price read
  from StockOracle on chain, with bid, ask and age.
- **Buy**: USDC in, market order by amount, $90 minimum. AUSD holders swap to USDC first
  (Henad already routes both).
- **Holdings**: read the user's balance in the Stock contract, plus aStocks in the wallet;
  a withdraw-to-wallet button.
- **The receipt, adapted honestly**: oracle bid, ask and publish time at the moment of the
  order, the fill price once settled, and the difference in bps. It is computed from chain
  data after the fill, not written in the order transaction, and it says the oracle quote
  can be fifteen minutes old — so part of any difference is the market moving, not a fee.

Estimate: **three to four days** if StockRouter's ABI is available.

## Verified on a mainnet fork, 22 Sep 2026

StockRouter's source is not verified anywhere (Monadscan shows only the proxy; Sourcify has
nothing on Monad, Ethereum or Base). Its interface was reconstructed from the bytecode's
selectors, the public signature database, and Monday Trade's own live transactions, then
exercised against a fork of Monad mainnet with a test wallet holding forked USDC.

| Selector | Function | How we know |
| --- | --- | --- |
| `0x3ae50b73` | `deposit(address token, uint96 rawAmount)` — USDC in 6-decimal units | Signature database; **succeeded on the fork**, 297,592 gas |
| `0x8c8c3c9d` | `withdraw(address token, uint96 mUsdAmount)` — 18-decimal credit | Signature database; live transactions |
| `0x27fd8b2b` | `depositStock(address stock, uint256 amount)` | Signature database |
| `0xc0c16b76` | market buy `(address stock, uint256 notionalUsd18, uint256 deadline)` | Live transactions; **succeeded on the fork**: a $100 aAAPL buy debited 100.11 credit (fee 11 bps), emitted an order event, returned an order id |
| `0x8c8bc974` | withdraw stock to wallet `(address stock, uint256 amount)` | Live transactions, one block after a fill |
| `0x20c1b4d6` | limit order `(stock, quantity, price, side, deadline)` | Live transactions matched to oracle prices |
| `0x0e5d1a7a` / `0x3ed60570` | market / limit sell, depositing the stock in the same call | Live transactions |

Only 50 transactions have touched StockRouter since its latest upgrade, and it has been
upgraded ten times since April; the contract Henad would call can change without notice.

## The one real blocker: every wallet must be approved by Monday Trade

The first deposit on the fork reverted with **`UserNotApproved`**. StockRouter calls
`requireCompliant(user)` on a compliance registry at
`0xF1aeD4E4816a91CebfCBd33378E38962abf73276` before every deposit and order, and wallets are
added to it only by Monday Trade's operator accounts, in batches (18 so far). Their FAQ says
RWA trading is not available in the US or China, so approval is presumably the region check
their own site runs when a wallet connects.

"No KYC" is true; "permissionless" is not. And Henad's passkey accounts cannot connect to
monday.trade's site to get themselves approved. **This is not solvable in code.** It needs
Monday Trade to approve wallets onboarded through Henad — a partner arrangement. Everything
else is verified and ready.

## Previously the blocker: calling StockRouter

Monday Trade's API builds the transaction data for StockRouter. Using that API needs an API
key bound to one wallet, HMAC-signed requests, and an **exact IP whitelist** — which Henad's
Vercel functions cannot provide without paid static IPs, and which does not fit an app with
many users each holding their own passkey account.

The way around it is to encode StockRouter calls ourselves. That needs its ABI: either its
source verified on Monadscan, or the ABI from Monday Trade. Until one of those exists, this
is not buildable safely; guessing calldata for a contract that moves people's money is how
funds get lost.

## Legal position

Monday Trade operates without KYC under Singapore law, and Henad would be a front end to
it, the same way Top up is a front end to PancakeSwap. The user signs from their own wallet;
Henad holds nothing. The common guardrail across these platforms is excluding US persons,
which is a line in the terms and a notice on the page. Tokenized stocks remain securities,
and Nigeria's Investments and Securities Act 2025 covers them; this is a risk to take
knowingly rather than one that disappears.

## Fit with the submission

A Stocks page sits beside payouts rather than inside them, so it does not blur the payments
pitch if it is framed as "the receipt, pointed at a second asset": the same promise that
the cost of a conversion is public, applied to buying Apple.

## Next step

Get StockRouter's ABI. Check `https://monadscan.com/address/0x4f090d817fd83753988a7b0c1d76f170f8461be8#code`;
if it is not verified, ask in Monday Trade's Discord, which their docs name as the place for
integration questions.

## Sources

- Monday Trade RWA API docs (via their GitBook MCP): https://docs.monday.trade/rwa-trading-apis/getting-started/product-and-contracts
- Environments and contracts: https://docs.monday.trade/rwa-trading-apis/reference/environments-and-chains
- Stock oracle: https://docs.monday.trade/rwa-trading-apis/market-data/stock-oracle
- Orders with deposit: https://docs.monday.trade/rwa-trading-apis/trading/place-and-cancel-orders
- API authentication and IP whitelist: https://docs.monday.trade/rwa-trading-apis/authentication/headers-and-permissions
- RWA fees and KYC: https://docs.monday.trade/rwa-trading/faqs-for-rwas
- Anchored tokens: https://docs.anchored.finance/getting-started/anchored-tokens
- Chainlink feeds on Monad: https://reference-data-directory.vercel.app/feeds-monad-mainnet.json
- Nigeria ISA 2025: https://cryptoslate.com/crypto-laws/nigeria-investments-securities-act-2025-virtual-digital-assets/
- Monad token list (XAUt0): https://raw.githubusercontent.com/monad-crypto/token-list/main/tokenlist-mainnet.json
