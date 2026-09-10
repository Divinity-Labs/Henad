import type { Corridor } from '@/lib/corridors'
import { bps } from '@/lib/format'
import type { LedgerTotals } from '@/lib/receipts'
import { meanBps } from './ledger'

interface Route {
  corridor: Corridor
  count: number
  meanBps: number
}

/**
 * The W2 Routes column: one row per live corridor that has settled, with the
 * venue, the mean spread and the fill count. Every fill so far went through
 * the reference-rate venue, so it is always "n of n". With no fills the first
 * live corridor is listed with 0 fills; nothing is estimated.
 */
export function RoutesBlock({ corridors, totals, sample }: { corridors: Corridor[]; totals: LedgerTotals; sample: boolean }) {
  const live = corridors.filter((c) => c.tier === 'live' && c.venue)
  const filled = live.flatMap((corridor): Route[] => {
    const s = totals.byCurrency[corridor.target]
    return s && s.count > 0 ? [{ corridor, count: s.count, meanBps: meanBps(s.spreadBpsSum, s.count) }] : []
  })
  const rows = filled.length > 0 ? filled : live.slice(0, 1).map((corridor): Route => ({ corridor, count: 0, meanBps: 0 }))
  const caption = filled.length > 0 ? filled.map((r) => `${r.corridor.source} → ${r.corridor.target}`).join(' · ') : 'No fills yet'
  return (
    <section className="flex flex-col border-r border-hairline px-9 pt-6 pb-7">
      <div className="flex items-baseline justify-between pb-2">
        <h2 className="m-0 font-display text-[20px] font-medium tracking-[-.02em]">Routes</h2>
        <span className="font-mono text-[11px] tracking-[.08em] uppercase text-muted">{caption}</span>
      </div>
      {rows.map((r) => (
        <div key={r.corridor.key} className="tabular flex flex-col gap-[5px] border-t border-hairline py-4 font-mono text-[12px]">
          <div className="flex justify-between">
            <span className="font-medium">{r.corridor.venue?.label}</span>
            <span className={r.count > 0 ? 'font-medium' : 'text-muted'}>{r.count > 0 ? bps(r.meanBps) : '—'}</span>
          </div>
          <div className="flex justify-between text-[11px] text-muted">
            <span>reference-rate venue · {r.corridor.feed?.label}</span>
            <span>{r.count > 0 ? `${r.count} of ${r.count} fills${sample ? ' · sample' : ''}` : '0 fills'}</span>
          </div>
        </div>
      ))}
      <p className="m-0 border-t border-hairline pt-4 font-mono text-[11px] leading-[1.6] text-muted">
        Medians and distributions appear once there are enough settlements to mean something.
      </p>
    </section>
  )
}
