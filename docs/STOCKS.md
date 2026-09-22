# Stocks in Henad — what it would take

Researched 22 Sep 2026, revised the same day after reading Monday Trade's RWA trading
docs. Everything marked **verified** was read from Monad mainnet.

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

## The one real blocker: calling StockRouter

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
