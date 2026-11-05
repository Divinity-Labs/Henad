import { keccak256, toBytes, type Hex } from 'viem'
import { MONAD_MAINNET_ID } from '@henad/core'
import { mainnet } from './chain'
import { STOCK_ORACLE, STOCKS } from './stocks'

/**
 * Price history for the Stocks charts, from the StockOracle's own update events.
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

const ids = new Map<string, string>(STOCKS.map((s) => [keccak256(toBytes(s.symbol)).toLowerCase(), s.symbol]))

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

  for (let page = 0; page < 40; page++) {
    let answer: { data?: { logs?: { topic1?: Hex; data: Hex }[] }[]; next_block?: number; archive_height?: number }
    try {
      const res = await fetch(`https://${MONAD_MAINNET_ID}.hypersync.xyz/query`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          from_block: cursor,
          logs: [{ address: [STOCK_ORACLE], topics: [[PRICE_UPDATED_TOPIC], [...ids.keys()]] }],
          field_selection: { log: ['topic1', 'data'] },
        }),
        cache: 'no-store',
      })
      if (!res.ok) break
      answer = await res.json()
    } catch {
      break
    }

    for (const batch of answer.data ?? []) {
      for (const log of batch.logs ?? []) {
        const symbol = log.topic1 && ids.get(log.topic1.toLowerCase())
        if (!symbol) continue
        const word = (i: number) => BigInt(`0x${log.data.slice(2 + 64 * i, 2 + 64 * (i + 1))}`)
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
