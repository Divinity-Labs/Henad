import type { Metadata } from 'next'
import { pageMeta } from '@/lib/site'
import { Nav } from '@/components/Nav'
import { NavAccount } from '@/components/NavAccount'
import { StocksView, type QuoteDto } from '@/components/stocks/StocksView'
import { stockQuotes } from '@/lib/stocks'

export const metadata: Metadata = pageMeta({
  title: 'US stock prices on Monad',
  description: 'Apple, NVIDIA, Tesla and the S&P 500, read live from an on-chain stock oracle on Monad, with the bid, the ask, the spread and a week of price history.',
  path: '/stocks',
})
// Read per request, for the same reason as /rates: a cached price is a price the chain no longer has.
export const dynamic = 'force-dynamic'

const usd = (v: bigint) => Number(v) / 1e8

/** /stocks — live US stock prices and their charts, full width. Buying is not open yet. */
export default async function StocksPage() {
  const board = await stockQuotes().catch(() => null)
  const quotes: QuoteDto[] | null = board ? board.quotes.map((q) => ({ ...q, price: usd(q.price), bid: usd(q.bid), ask: usd(q.ask) })) : null
  return (
    <div className="flex min-h-dvh flex-col">
      <Nav right={<NavAccount />} />
      <main className="dotgrid flex flex-1 flex-col">
        <StocksView quotes={quotes} readAt={board?.readAt ?? 0} />
      </main>
    </div>
  )
}
