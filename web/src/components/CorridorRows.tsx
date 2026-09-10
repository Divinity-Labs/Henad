import Link from 'next/link'
import type { LiveRate } from '@/lib/rates'
import { rateLine, rateValue, utcTime } from '@/lib/format'
import { TierPill } from './ui/TierPill'

function rateText(r: LiveRate, withPrefix: boolean) {
  if (r.rate === null) return null
  const c = r.corridor
  return withPrefix ? rateLine(r.rate, c.targetSymbol, c.rateDp) : rateValue(r.rate, c.targetSymbol, c.rateDp)
}

function sendCell(r: LiveRate) {
  const c = r.corridor
  if (c.tier === 'live') {
    if (r.marketClosed) return <span className="text-muted">FX market closed</span>
    return (
      <Link href={`/send?to=${c.target}`} className="text-purple">
        Send a payout →
      </Link>
    )
  }
  if (c.tier === 'quote') return <span className="text-muted">{c.note}</span>
  return (
    <Link href="/docs/mrc" className="text-purple">
      Read the MRC →
    </Link>
  )
}

/** Desktop table of every corridor in the registry, three tiers, live feeds. */
export function CorridorTable({ rates }: { rates: LiveRate[] }) {
  const cols = 'grid grid-cols-[100px_120px_1fr_310px_120px_190px] gap-4 items-center px-9'
  return (
    <div className="flex flex-col font-mono text-[12px] tabular">
      <div className={`${cols} py-[10px] border-t border-b border-hairline label text-muted`}>
        <span>Status</span>
        <span>Corridor</span>
        <span>Reference rate</span>
        <span>Source · feed</span>
        <span>Updated</span>
        <span className="text-right">Send</span>
      </div>
      {rates.map((r, i) => {
        const c = r.corridor
        const live = c.tier === 'live'
        const last = i === rates.length - 1
        return (
          <div key={c.key} className={`${cols} py-4 ${last ? '' : 'border-b border-hairline-2'} ${live && i === 0 ? 'bg-tint' : ''}`}>
            <TierPill tier={c.tier} />
            <span className={live ? 'font-medium' : ''}>
              {c.source} → {c.target}
            </span>
            <span className={live ? 'font-medium' : r.rate === null ? 'text-muted' : ''}>
              {r.rate === null ? 'No rate on Monad' : rateText(r, true)}
              {r.stale && r.rate !== null ? <span className="text-amber"> · stale</span> : null}
            </span>
            <span className={r.rate === null ? 'text-muted' : ''}>
              {c.feed ? (
                <>
                  {c.note}
                  {c.feed.kind === 'chainlink' && (
                    <>
                      {' · '}
                      <a href={`https://monadscan.com/address/${c.feed.ref}`} target="_blank" rel="noreferrer" className="text-purple">
                        feed ↗
                      </a>
                    </>
                  )}
                </>
              ) : (
                c.note
              )}
            </span>
            <span className={r.updatedAt === null ? 'text-muted' : ''}>
              {r.updatedAt === null ? '—' : c.feed?.kind === 'pyth' ? 'on request' : utcTime(r.updatedAt)}
            </span>
            <span className="text-right">{sendCell(r)}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Mobile list of the same registry. */
export function CorridorList({ rates, hrefLive = '/send' }: { rates: LiveRate[]; hrefLive?: string }) {
  return (
    <div className="flex flex-col font-mono text-[11px] tabular">
      {rates.map((r, i) => {
        const c = r.corridor
        const live = c.tier === 'live'
        const inner = (
          <>
            <TierPill tier={c.tier} size="sm" />
            <span className="flex flex-col gap-[3px]">
              <span className={live ? 'font-medium' : ''}>
                {c.source} → {c.target}
              </span>
              <span className="text-muted text-[10px]">
                {live
                  ? r.marketClosed
                    ? 'FX market closed'
                    : `Mento · Chainlink${r.updatedAt ? ` · ${utcTime(r.updatedAt).replace(' UTC', '')}` : ''}${r.stale ? ' · stale' : ''}`
                  : c.tier === 'quote'
                    ? `${c.feed?.kind === 'pyth' ? 'Pyth pull' : 'Chainlink'} · ${c.note.replace('Priced · ', '')}`
                    : 'No NGN feed on Monad · MRC →'}
              </span>
            </span>
            <span className={live ? 'font-medium' : r.rate === null ? 'text-muted' : ''}>{r.rate === null ? '—' : rateText(r, false)}</span>
          </>
        )
        const cls = `grid grid-cols-[58px_1fr_auto] gap-[10px] items-center px-4 py-3 ${i === 0 ? 'border-t border-hairline' : 'border-t border-hairline-2'} ${i === rates.length - 1 ? 'border-b border-hairline' : ''} ${live && i === 0 ? 'bg-tint' : ''} text-ink`
        if (live && !r.marketClosed)
          return (
            <Link key={c.key} href={`${hrefLive}?to=${c.target}`} className={cls}>
              {inner}
            </Link>
          )
        if (c.tier === 'unpriced')
          return (
            <Link key={c.key} href="/docs/mrc" className={cls}>
              {inner}
            </Link>
          )
        return (
          <div key={c.key} className={cls}>
            {inner}
          </div>
        )
      })}
    </div>
  )
}
