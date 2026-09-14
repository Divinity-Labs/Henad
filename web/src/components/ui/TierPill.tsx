import type { Tier } from '@henad/core'

const styles: Record<Tier, string> = {
  live: 'bg-purple text-white',
  quote: 'bg-lilac text-purple-deep',
  unpriced: 'bg-page text-grey border border-border',
}
const labels: Record<Tier, string> = { live: 'Live', quote: 'Quote', unpriced: 'Unpriced' }

export function TierPill({ tier, size = 'md' }: { tier: Tier; size?: 'sm' | 'md' }) {
  const pad = size === 'sm' ? 'px-[6px] py-[3px] text-[9px]' : 'px-2 py-1 text-[10px]'
  return (
    <span className={`label inline-block rounded-[3px] justify-self-start ${pad} ${styles[tier]}`}>{labels[tier]}</span>
  )
}

/** "Closed" amber pill for the market-hours banner. */
export function ClosedPill() {
  return <span className="label inline-block rounded-[3px] bg-amber px-2 py-[3px] text-ink">Closed</span>
}

/** White-on-purple "Live" pill for the announcement bar. */
export function LivePill() {
  return <span className="label inline-block rounded-[3px] bg-white px-2 py-[3px] text-purple">Live</span>
}
