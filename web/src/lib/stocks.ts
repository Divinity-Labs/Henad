import { keccak256, parseAbi, toBytes, type Address } from 'viem'
import { mainnet } from './chain'

/**
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
  const payloads = await mainnet().readContract({
    address: STOCK_ORACLE,
    abi: oracleAbi,
    functionName: 'latestPrices',
    args: [STOCKS.map((s) => keccak256(toBytes(s.symbol)))],
  })
  const quotes = payloads.map((p, i): StockQuote => {
    const mid = (p.bestBid + p.bestAsk) / 2n
    return {
      ...STOCKS[i]!,
      price: p.price,
      bid: p.bestBid,
      ask: p.bestAsk,
      spreadBps: mid > 0n ? Number(((p.bestAsk - p.bestBid) * 1_000_000n) / mid) / 100 : 0,
      quotedAt: Number(p.feedUpdateTimestamp),
      session: SESSIONS[p.session] ?? 'Unknown',
    }
  })
  return { quotes, readAt: Math.floor(Date.now() / 1000) }
}
