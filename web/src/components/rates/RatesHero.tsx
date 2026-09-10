import { StatCell } from '@/components/ui/StatCell'
import { bps, money, spreadLine } from '@/lib/format'
import { pad2, type Headline } from './ledger'

/**
 * Hero with the ghost settlement number, the eyebrow, the headline and the
 * three stats: a white rounded card at md and up (W2), a hairline grid below
 * (S4). Every figure comes from the ledger totals; "—" when nothing has settled.
 */
export function RatesHero({ count, head, sample, chain }: { count: number; head: Headline | null; sample: boolean; chain: 'mainnet' | 'testnet' }) {
  const more = head && head.more > 0 ? `+ ${head.more} more` : null
  const sub = (extra: string | null) => [extra, sample ? 'sample' : null].filter(Boolean).join(' · ') || undefined
  const spread = head ? spreadLine(head.spreadCost, head.decimals, head.symbol, head.meanBps, { dp: head.dp }) : '—'
  const spreadBps = head ? bps(head.meanBps) : '—'
  const delivered = head ? money(head.delivered, head.decimals, head.symbol, head.dp) : '—'
  return (
    <>
      <section className="relative flex flex-col gap-2 overflow-hidden border-b border-hairline px-4 pt-6 pb-5 md:flex-row md:items-end md:justify-between md:gap-10 md:px-9 md:pt-16 md:pb-9">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-[14px] -right-[6px] font-display text-[96px] leading-none font-medium tracking-[-.06em] whitespace-nowrap text-ghost select-none md:-top-[34px] md:right-6 md:text-[220px]"
        >
          {pad2(count)}
        </div>
        <div className="relative flex flex-col gap-2 md:gap-3">
          <p className="m-0 font-mono text-[10px] tracking-[.12em] uppercase text-purple md:text-[11px]">
            <span className="md:hidden">Rates · Monad {chain}</span>
            <span className="hidden md:inline">Rates · every settlement on Monad {chain}</span>
          </p>
          <h1 className="m-0 font-display text-[28px] leading-[1.05] font-medium tracking-[-.03em] md:text-[48px]">What the spread actually was.</h1>
        </div>
        <div className="relative hidden grid-cols-[auto_auto_auto] overflow-hidden rounded-[12px] border border-hairline bg-surface md:grid">
          <StatCell label="Settlements" value={count} sub={sub(null)} className="border-r border-hairline" />
          <StatCell label="Spread paid" value={spread} sub={sub(more)} className="border-r border-hairline" />
          <StatCell label="Delivered" value={delivered} sub={sub(more)} />
        </div>
      </section>
      <div className="grid grid-cols-3 border-b border-hairline md:hidden">
        <StatCell size="sm" label="Settled" value={count} sub={sub(null)} className="border-r border-hairline" />
        <StatCell size="sm" label="Spread" value={spreadBps} sub={sub(more)} className="border-r border-hairline" />
        <StatCell size="sm" label="Delivered" value={delivered} sub={sub(more)} />
      </div>
    </>
  )
}
