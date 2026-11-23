import { keccak256, parseAbi, toBytes, type Address, type Hex } from 'viem'
import { MONAD_MAINNET_ID } from '@henad/core'
import { mainnet } from './chain'
import { CHAINLINK_XSTOCK_FEEDS, POOL_PRICED, STOCK_ORACLE, STOCKS } from './stocks'

/**
 * Price history for the Stocks charts, from three kinds of on-chain event, matching where each
 * ticker's live price comes from (stocks.ts):
 * - Chainlink-priced tickers (NVDA, TSLA, SPY, QQQ): the aggregator's AnswerUpdated events,
 *   about one every 40 s, kept at most one per minute, divided by the vault's shares per token.
 * - Pool-priced tickers (ANT): Uniswap v4 Swap events on their pool, priced from sqrtPriceX96.
 * - The rest: the StockOracle's update events, as below. These tickers ignore the oracle's
 *   history for the first two groups, whose old oracle points would draw a false jump.
 *
 * StockOracle:
 *
 * The oracle stores only the latest payload per ticker, but every update emits an event whose
 * topic1 is the priceId and whose data is the payload: price, bid, ask, feedUpdateTimestamp,
 * publishedAt, roundId, session — one 32-byte word each. That is one point roughly every ten
 * minutes per ticker. Monad's public node caps eth_getLogs at a hundred blocks, so the history
 * comes from HyperSync (see hypersync.ts); without its token the charts are simply absent.
 *
 * A week of fifteen tickers is about nine thousand events and twelve seconds to fetch, so the
 * result is kept in process and topped up from where it stopped rather than refetched.
 */

/** keccak of the oracle's price-update event, read from its logs on 5 Nov 2026. */
const PRICE_UPDATED_TOPIC = '0x2e2fc593ffe55b85f00a028e4a1993370650ee81a0e86df35a306a346b85c07f' as const

/** How far back the charts reach, and how often the held history is topped up. */
const WINDOW_SEC = 7 * 86_400
const BLOCK_SEC = 0.4
const REFRESH_MS = 60_000

/** [Unix seconds of the source quote, price in USD] */
export type Point = [number, number]
export type History = Record<string, Point[]>

const ANSWER_UPDATED = '0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f' as const
const V4_SWAP = '0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f' as const
const POOL_MANAGER = '0x188d586ddcf52439676ca21a244753fa19f9ea8e'
const MIN_GAP_SEC = 60

const ids = new Map<string, string>(
  STOCKS.filter((s) => !(s.symbol in CHAINLINK_XSTOCK_FEEDS) && !(s.symbol in POOL_PRICED)).map((s) => [keccak256(toBytes(s.symbol)).toLowerCase(), s.symbol]),
)
const poolIds = new Map<string, string>(Object.entries(POOL_PRICED).map(([symbol, p]) => [p.poolId.toLowerCase(), symbol]))
const feedAbi = parseAbi(['function aggregator() view returns (address)', 'function convertToAssets(uint256 shares) view returns (uint256)'])

/** Aggregator address -> symbol and shares per wrapped token, read once per process. */
let feeds: Promise<Map<string, { symbol: string; ratio: number }>> | null = null
function chainlinkFeeds() {
  feeds ??= Promise.all(
    Object.entries(CHAINLINK_XSTOCK_FEEDS).map(async ([symbol, f]) => {
      const c = mainnet()
      const [agg, assets] = await Promise.all([
        c.readContract({ address: f.feed, abi: feedAbi, functionName: 'aggregator' }),
        c.readContract({ address: f.wrapped, abi: feedAbi, functionName: 'convertToAssets', args: [10n ** 18n] }),
      ])
      return [(agg as Address).toLowerCase(), { symbol, ratio: Number(assets) / 1e18 }] as const
    }),
  ).then((e) => new Map(e))
  feeds.catch(() => (feeds = null))
  return feeds
}

function push(series: Point[], at: number, price: number) {
  if (!(price > 0)) return
  const last = series[series.length - 1]
  if (last && at - last[0] < MIN_GAP_SEC) return
  series.push([at, price])
}

let held: { history: History; nextBlock: number; at: number } | null = null
let inflight: Promise<History | null> | null = null

export async function stockHistory(): Promise<History | null> {
  if (held && Date.now() - held.at < REFRESH_MS) return held.history
  inflight ??= topUp().finally(() => {
    inflight = null
  })
  return inflight
}

async function topUp(): Promise<History | null> {
  const token = process.env.ENVIO_API_TOKEN_HS?.trim()
  if (!token) return held?.history ?? null

  const history: History = held ? structuredClone(held.history) : Object.fromEntries(STOCKS.map((s) => [s.symbol, []]))
  let cursor = held?.nextBlock ?? Number(await mainnet().getBlockNumber()) - Math.round(WINDOW_SEC / BLOCK_SEC)
  const aggs = await chainlinkFeeds().catch(() => new Map<string, { symbol: string; ratio: number }>())

  for (let page = 0; page < 150; page++) {
    let answer: {
      data?: { logs?: { address?: Hex; block_number?: number; topic1?: Hex; data: Hex }[]; blocks?: { number?: number | string; timestamp?: number | string }[] }[]
      next_block?: number
      archive_height?: number
    }
    try {
      // HyperSync rate-limits bursts (429 around the fifteenth page of a first read); wait and retry
      // rather than stop, or the chart ends hours short of now.
      let res: Response | null = null
      for (let attempt = 0; attempt < 5; attempt++) {
        res = await fetch(`https://${MONAD_MAINNET_ID}.hypersync.xyz/query`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({
            from_block: cursor,
            logs: [
              { address: [STOCK_ORACLE], topics: [[PRICE_UPDATED_TOPIC], [...ids.keys()]] },
              ...(aggs.size ? [{ address: [...aggs.keys()], topics: [[ANSWER_UPDATED]] }] : []),
              ...(poolIds.size ? [{ address: [POOL_MANAGER], topics: [[V4_SWAP], [...poolIds.keys()]] }] : []),
            ],
            field_selection: { log: ['address', 'block_number', 'topic1', 'data'], block: ['number', 'timestamp'] },
          }),
          cache: 'no-store',
        })
        if (res.status !== 429) break
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
      }
      if (!res?.ok) break
      answer = await res.json()
    } catch {
      break
    }

    for (const batch of answer.data ?? []) {
      const times = new Map((batch.blocks ?? []).map((b) => [Number(b.number), Number(b.timestamp)]))
      for (const log of batch.logs ?? []) {
        const word = (i: number) => BigInt(`0x${log.data.slice(2 + 64 * i, 2 + 64 * (i + 1))}`)
        const addr = log.address?.toLowerCase()
        const feed = addr && aggs.get(addr)
        if (feed) {
          // AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt): 8 decimals per wrapped token
          if (log.topic1) push(history[feed.symbol]!, Number(word(0)), Number(BigInt(log.topic1)) / 1e8 / feed.ratio)
          continue
        }
        if (addr === POOL_MANAGER) {
          const symbol = log.topic1 && poolIds.get(log.topic1.toLowerCase())
          const at = times.get(Number(log.block_number))
          if (!symbol || !at) continue
          // Swap data: amount0, amount1, sqrtPriceX96, liquidity, tick, fee. USDC (6 dp) is currency0, the token (18 dp) currency1.
          const sq = Number(word(2)) / 2 ** 96
          const usd = POOL_PRICED[symbol]!.usdcIsCurrency0 ? 1e12 / (sq * sq) : sq * sq * 1e12
          push(history[symbol]!, at, usd)
          continue
        }
        const symbol = log.topic1 && ids.get(log.topic1.toLowerCase())
        if (!symbol) continue
        const at = Number(word(3))
        const series = history[symbol]!
        // A closed market republishes the last quote unchanged; one point per source quote is enough.
        if (series.length > 0 && series[series.length - 1]![0] >= at) continue
        series.push([at, Number(word(0)) / 1e8])
      }
    }

    const next = answer.next_block ?? 0
    if (!next || next <= cursor) break
    cursor = next
    if (next > (answer.archive_height ?? 0)) break
  }

  const since = Date.now() / 1000 - WINDOW_SEC
  for (const symbol of Object.keys(history)) history[symbol] = history[symbol]!.filter(([t]) => t >= since)
  held = { history, nextBlock: cursor, at: Date.now() }
  return history
}
