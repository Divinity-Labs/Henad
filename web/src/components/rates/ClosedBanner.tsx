import { ClosedPill } from '@/components/ui/TierPill'
import type { Corridor } from '@henad/core'
import { rateLine, utcDayTime } from '@/lib/format'
import { nextTransition } from '@henad/core'
import type { Receipt } from '@/lib/receipts'
import { noSept } from './ledger'

/**
 * Next instant the FX pools reopen, from render time: the coming transition
 * when closed, else the reopen after the coming close (the demo case).
 */
export function reopensAt(now = Math.floor(Date.now() / 1000)): number {
  const next = nextTransition(now)
  return next.opens ? next.at : nextTransition(next.at).at
}

/** The 40px dark strip above the page while Mento's market-hours breaker is closed. */
export function ClosedBanner({ corridor, lastSettled }: { corridor: Corridor; lastSettled: Receipt | null }) {
  // "Sun 13 Sep 23:00 UTC" as on the canvas: the helper's own " · " would read as another banner segment.
  const reopens = noSept(utcDayTime(reopensAt())).replace(' · ', ' ')
  const parts = ['FX market closed', `${corridor.venue?.label ?? corridor.key} reopens ${reopens}`]
  if (lastSettled) parts.push(`last settled ${rateLine(lastSettled.executedRate, corridor.targetSymbol, corridor.rateDp)}`)
  parts.push('receipts stay open')
  return (
    <div className="label-md flex min-h-10 flex-wrap items-center justify-center gap-x-[14px] gap-y-1 bg-dark px-4 py-2 text-center text-white md:px-9 md:py-0">
      <ClosedPill />
      <span>{parts.join(' · ')}</span>
    </div>
  )
}
