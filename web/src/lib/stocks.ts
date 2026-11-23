import { keccak256, parseAbi, toBytes, type Address } from 'viem'
import { mainnet } from './chain'

/**
 * US stock prices on Monad mainnet: Chainlink for the four tradable xStocks, and Monday Trade's
 * StockOracle for the rest (it stalled on 19 Nov 2026; see CHAINLINK_XSTOCK_FEEDS). Originally
 * US stock prices as Monday Trade's StockOracle publishes them on Monad mainnet
 * (docs.monday.trade/rwa-trading-apis/market-data/stock-oracle). Read only: buying needs
 * Monday Trade to approve Henad-onboarded wallets first (docs/STOCKS.md), so nothing here
 * moves money.
 *
 * One proxy serves every ticker, keyed by keccak256 of the upper-case symbol. Every price
 * field has 8 decimals. The source quote runs about 15 minutes behind the market and is
 * republished on a 10-minute heartbeat, so the age shown is the source quote's age
 * (`feedUpdateTimestamp`), never the time it was written on chain.
 */

export const STOCK_ORACLE: Address = '0x037848af338c38e1e0ab722be80bf4c2e612a1f7'

/**
 * Chainlink's calculated feeds for the four wrapped xStocks we trade (reference-data-directory,
 * feeds-monad-mainnet-1, read 23 Nov 2026): USD per *wrapped* token, 24/5, 1 h heartbeat. Monday
 * Trade's oracle stopped updating at 13:09 UTC on 19 Nov 2026, so the tradable tickers take
 * their price from here; dividing by the vault's `convertToAssets(1e18)` gives USD per share.
 * Chainlink publishes no bid or ask, so those quotes carry none.
 */
export const CHAINLINK_XSTOCK_FEEDS: Record<string, { feed: Address; wrapped: Address }> = {
  NVDA: { feed: '0x03ffa4673c060339E6a8E5Ba1a12B3301c966bf0', wrapped: '0xa8ddb5Cd96b5222AFe198316E9A57CAA642850D5' },
  TSLA: { feed: '0xE42022cCe1913626AE4297B99291d3Ba24Cc9281', wrapped: '0xc3FdBe3A68EE5dE461D30415a8165cf9Aefe1171' },
  SPY: { feed: '0x2e2dA5717eDE960F8b77Af4cFcBDC4Ca3099006D', wrapped: '0xE7E553Cd128F0011777323A0b44a7b96EA1CB540' },
  QQQ: { feed: '0x7CA45B17D8D43059a222dEC5d991B613F61c02d9', wrapped: '0x4C1AE29c159838fC1b224636E28E086EB69101f7' },
}

/**
 * Tickers with a Monad pool but no price feed yet: priced from their own Uniswap v4 pool, read
 * through StateView. That is the price the order trades against, so Henad shows no spread for
 * these until a feed exists. ANTx listed on Monad on 19 Nov 2026; the pool is wANTx/USDC, 0.01%,
 * and one wANTx holds exactly one ANTx.
 */
const STATE_VIEW: Address = '0x77395f3b2e73ae90843717371294fa97cc419d64'
export const POOL_PRICED: Record<string, { poolId: `0x${string}`; usdcIsCurrency0: boolean }> = {
  ANT: { poolId: '0xbcd4d4703e14edcee1c832968bd05d7e1fbe56c00bdde1ac0ccd27ce3aeae257', usdcIsCurrency0: true },
}
const stateViewAbi = parseAbi(['function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)'])

const chainlinkAbi = parseAbi([
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() view returns (uint8)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
])

const oracleAbi = parseAbi([
  'struct PricePayload { int128 price; int128 bestBid; int128 bestAsk; uint64 feedUpdateTimestamp; uint64 publishedAt; uint80 roundId; uint8 session; }',
  'function latestPrices(bytes32[] priceIds) view returns (PricePayload[])',
])

/**
 * The tickers shown, each read live from the oracle on 5 Nov 2026 (NFLX is not registered).
 * `tile` is the brand colour behind the logo in /public/stocks; `ink` is the logo's own colour
 * on it. Funds have no logo of their own and get a lettered tile instead.
 */
export const STOCKS = [
  { symbol: 'ANT', name: 'Anthropic', kind: 'stock', tile: '#191919', ink: '#F0EEE6' },
  { symbol: 'AAPL', name: 'Apple', kind: 'stock', tile: '#000000', ink: '#ffffff' },
  { symbol: 'NVDA', name: 'NVIDIA', kind: 'stock', tile: '#76B900', ink: '#ffffff' },
  { symbol: 'TSLA', name: 'Tesla', kind: 'stock', tile: '#CC0000', ink: '#ffffff' },
  { symbol: 'MSFT', name: 'Microsoft', kind: 'stock', tile: '#0078D4', ink: '#ffffff' },
  { symbol: 'GOOGL', name: 'Alphabet', kind: 'stock', tile: '#4285F4', ink: '#ffffff' },
  { symbol: 'AMZN', name: 'Amazon', kind: 'stock', tile: '#232F3E', ink: '#FF9900' },
  { symbol: 'META', name: 'Meta', kind: 'stock', tile: '#0467DF', ink: '#ffffff' },
  { symbol: 'AMD', name: 'AMD', kind: 'stock', tile: '#000000', ink: '#ffffff' },
  { symbol: 'PLTR', name: 'Palantir', kind: 'stock', tile: '#101113', ink: '#ffffff' },
  { symbol: 'COIN', name: 'Coinbase', kind: 'stock', tile: '#0052FF', ink: '#ffffff' },
  { symbol: 'HOOD', name: 'Robinhood', kind: 'stock', tile: '#CCFF00', ink: '#000000' },
  { symbol: 'CRCL', name: 'Circle', kind: 'stock', tile: '#8669AE', ink: '#ffffff' },
  { symbol: 'MSTR', name: 'Strategy', kind: 'stock', tile: '#D9232E', ink: '#ffffff' },
  { symbol: 'SPY', name: 'S&P 500 ETF', kind: 'fund', tile: '#17171b', ink: '#ffffff' },
  { symbol: 'QQQ', name: 'Nasdaq-100 ETF', kind: 'fund', tile: '#23185e', ink: '#ffffff' },
] as const

/** The oracle's Session enum, in order. */
const SESSIONS = ['Unknown', 'Pre-market', 'Market open', 'After hours', 'Overnight', 'Closed'] as const
export type Session = (typeof SESSIONS)[number]

export type StockInfo = (typeof STOCKS)[number]

export type StockQuote = StockInfo & {
  /** USD, 8 decimals: the oracle's main price, the bid/ask midpoint */
  price: bigint
  bid: bigint
  ask: bigint
  /** (ask − bid) / mid, in basis points */
  spreadBps: number
  /** Unix seconds of the source quote */
  quotedAt: number
  session: Session
  /** Who priced it. Chainlink and pool quotes have no bid or ask (both 0, spread 0). */
  source: 'Chainlink' | 'Monday Trade' | 'Pool'
}

/** One read of every ticker, and the Unix second it was taken: ages are measured against that. */
export interface StockBoard {
  quotes: StockQuote[]
  readAt: number
}

/** Same in-process coalescing as liveRates(): one batch read per 12 s, a failure never cached. */
const TTL_MS = 12_000
let cache: { at: number; value: Promise<StockBoard> } | null = null

export async function stockQuotes(): Promise<StockBoard> {
  const now = Date.now()
  if (cache && now - cache.at < TTL_MS) return cache.value
  const value = readQuotes()
  cache = { at: now, value }
  value.catch(() => {
    if (cache?.value === value) cache = null
  })
  return value
}

async function readQuotes(): Promise<StockBoard> {
  // The oracle reverts or returns zeros for tickers it never registered, so pool-priced ones stay out of the call.
  const onOracle = STOCKS.filter((s) => !(s.symbol in POOL_PRICED))
  const [payloads, pooled] = await Promise.all([
    mainnet().readContract({ address: STOCK_ORACLE, abi: oracleAbi, functionName: 'latestPrices', args: [onOracle.map((s) => keccak256(toBytes(s.symbol)))] }),
    Promise.all(
      STOCKS.filter((s) => s.symbol in POOL_PRICED).map((s) =>
        readPoolPrice(s.symbol).then(
          (price) => ({ symbol: s.symbol, price }),
          () => null,
        ),
      ),
    ),
  ])
  const now = Math.floor(Date.now() / 1000)
  const oracleQuotes = payloads.map((p, i): StockQuote => {
    const mid = (p.bestBid + p.bestAsk) / 2n
    return {
      ...onOracle[i]!,
      price: p.price,
      bid: p.bestBid,
      ask: p.bestAsk,
      spreadBps: mid > 0n ? Number(((p.bestAsk - p.bestBid) * 1_000_000n) / mid) / 100 : 0,
      quotedAt: Number(p.feedUpdateTimestamp),
      session: SESSIONS[p.session] ?? 'Unknown',
      source: 'Monday Trade',
    }
  })
  const poolQuotes = pooled.flatMap((p): StockQuote[] => {
    const info = p && STOCKS.find((s) => s.symbol === p.symbol)
    return p && info ? [{ ...info, price: p.price, bid: 0n, ask: 0n, spreadBps: 0, quotedAt: now, session: 'Unknown', source: 'Pool' }] : []
  })
  const bySymbol = new Map([...oracleQuotes, ...poolQuotes].map((q) => [q.symbol, q]))
  const quotes = STOCKS.flatMap((s) => bySymbol.get(s.symbol) ?? [])
  const chainlink = await Promise.all(quotes.map((q) => (q.symbol in CHAINLINK_XSTOCK_FEEDS ? readChainlink(q.symbol).catch(() => null) : null)))
  const session = sessionAt(now)
  return {
    quotes: quotes.map((q, i) => {
      const c = chainlink[i]
      return c ? { ...q, price: c.price, bid: 0n, ask: 0n, spreadBps: 0, quotedAt: c.updatedAt, session, source: 'Chainlink' } : { ...q, session }
    }),
    readAt: now,
  }
}

/** USD per wrapped token from the pool's current price, 8 decimals. USDC has 6 decimals, the token 18. */
async function readPoolPrice(symbol: string): Promise<bigint> {
  const { poolId, usdcIsCurrency0 } = POOL_PRICED[symbol]!
  const [sqrtPriceX96] = await mainnet().readContract({ address: STATE_VIEW, abi: stateViewAbi, functionName: 'getSlot0', args: [poolId] })
  if (sqrtPriceX96 === 0n) throw new Error('pool: not initialised')
  const Q192 = 1n << 192n
  const sq = sqrtPriceX96 * sqrtPriceX96
  // sq / Q192 = raw currency1 per raw currency0. USD (8 dp) per token = raw USDC per raw token × 1e12 × 1e8.
  return usdcIsCurrency0 ? (Q192 * 10n ** 20n) / sq : (sq * 10n ** 20n) / Q192
}

/** USD per share, 8 decimals like the oracle: the wrapped token's price over the shares it holds. */
async function readChainlink(symbol: string): Promise<{ price: bigint; updatedAt: number }> {
  const { feed, wrapped } = CHAINLINK_XSTOCK_FEEDS[symbol]!
  const c = mainnet()
  const [round, decimals, assets] = await Promise.all([
    c.readContract({ address: feed, abi: chainlinkAbi, functionName: 'latestRoundData' }),
    c.readContract({ address: feed, abi: chainlinkAbi, functionName: 'decimals' }),
    c.readContract({ address: wrapped, abi: chainlinkAbi, functionName: 'convertToAssets', args: [10n ** 18n] }),
  ])
  const answer = round[1]
  if (answer <= 0n || assets <= 0n) throw new Error('chainlink: no price')
  // per wrapped (decimals) -> per share (8): answer * 1e18 / assets, rescaled to 8 decimals
  const price = (answer * 10n ** 18n * 10n ** 8n) / (assets * 10n ** BigInt(decimals))
  return { price, updatedAt: Number(round[3]) }
}

/**
 * The US session by the clock, in New York time, with NYSE holidays and early closes (from
 * Pyth's equity schedule). The oracle used to tell us this; it no longer updates.
 */
const CLOSED = new Set(['2026-11-26', '2026-12-25', '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06'])
const EARLY = new Set(['2026-11-27', '2026-12-24'])
export function sessionAt(unix: number): Session {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(unix * 1000)
      .map((p) => [p.type, p.value]),
  )
  const day = `${parts.year}-${parts.month}-${parts.day}`
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun' || CLOSED.has(day)) return 'Closed'
  const min = Number(parts.hour) * 60 + Number(parts.minute)
  const close = EARLY.has(day) ? 13 * 60 : 16 * 60
  if (min >= 4 * 60 && min < 9 * 60 + 30) return 'Pre-market'
  if (min >= 9 * 60 + 30 && min < close) return 'Market open'
  if (min >= close && min < 20 * 60) return 'After hours'
  return 'Overnight'
}
