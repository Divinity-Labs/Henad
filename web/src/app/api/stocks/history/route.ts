import { stockHistory } from '@/lib/stock-history'

/**
 * Up to a week of prices per ticker for the /stocks charts, from the StockOracle's update
 * events (lib/stock-history.ts). Points arrive about every ten minutes, so a CDN copy up to a
 * minute old loses nothing; the live price on the page comes from the oracle read, not from here.
 */
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const history = await stockHistory().catch(() => null)
  if (!history) return Response.json({ history: null }, { status: 503 })
  return Response.json({ history }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } })
}
