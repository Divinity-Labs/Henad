import { stockHistory } from '@/lib/stock-history'

/**
 * Up to a week of prices per ticker for the /stocks charts, from Chainlink updates, pool swaps
 * and the StockOracle's events (lib/stock-history.ts), at most one point a minute. A CDN copy up
 * to a minute old loses little; the live price on the page comes from stocks.ts, not from here.
 * A cold first read takes 15–30 s, longer if HyperSync rate-limits it.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 90

export async function GET(): Promise<Response> {
  const history = await stockHistory().catch(() => null)
  if (!history) return Response.json({ history: null }, { status: 503 })
  return Response.json({ history }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } })
}
