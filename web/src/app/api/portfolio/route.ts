import { isAddress, type Address } from 'viem'
import { stockQuotes } from '@/lib/stocks'
import { stockTrades } from '@/lib/stock-trades'

/**
 * What the account page needs to value and explain a portfolio: with `prices`, the oracle's
 * price per share for every ticker; with `address`, its stock trades from `from` (a block) onwards. The browser
 * keeps what it has already read and asks only for what is new. Addresses and trades are public
 * on chain already; the response is still kept out of shared caches.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams
  // Prices alone answer in a second; the history can take much longer on a first read, so the
  // page asks for them separately and never waits on the slow one to show a value.
  if (params.has('prices')) {
    const board = await stockQuotes().catch(() => null)
    const prices = board ? Object.fromEntries(board.quotes.map((q) => [q.symbol, Number(q.price) / 1e8])) : null
    return Response.json({ prices }, { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' } })
  }
  const address = params.get('address')
  if (!address || !isAddress(address)) return Response.json({ error: 'address' }, { status: 400 })
  const from = Number(params.get('from')) || undefined
  const history = await stockTrades(address as Address, from).catch(() => null)
  return Response.json({ trades: history?.trades ?? null, scannedTo: history?.scannedTo ?? null }, { headers: { 'Cache-Control': 'private, no-store' } })
}
