import Link from 'next/link'
import { LivePill } from '@/components/ui/TierPill'
import { LIVE_CORRIDOR } from '@henad/core'
import { money } from '@/lib/format'
import type { Receipt } from '@/lib/receipts'
import { capitalise, type Network } from './ledger'

/**
 * The purple bar above the nav. Names the latest settlement and links to its
 * receipt; before the first one it says so. It never invents a settlement.
 */
export function AnnouncementBar({ latest, network }: { latest: Receipt | null; network: Network }) {
  const c = latest?.corridor ?? LIVE_CORRIDOR
  const pair = `${c.source} → ${c.target}`
  let href = '/send'
  let long = `${capitalise(network)} settlement #1 is next · ${pair} · be the first →`
  let short = `Settlement #1 is next · ${pair} →`
  if (latest) {
    const first = latest.index === 1
    const sent = money(latest.sourceAmount, latest.sourceAsset.decimals, '$')
    const delivered = money(latest.deliveredAmount, latest.targetAsset.decimals, c.targetSymbol, c.currencyDp)
    const which = first ? `First ${network} settlement` : `${capitalise(network)} settlement${latest.index ? ` #${latest.index}` : ''}`
    href = `/receipt/${latest.intentId}`
    long = `${which} · ${pair} · ${sent} → ${delivered} · view the receipt →`
    short = `${first ? 'First' : 'Latest'} settlement · ${pair} →`
  }
  return (
    <Link
      href={href}
      className="flex h-8 md:h-10 items-center justify-center gap-[10px] md:gap-[14px] px-4 bg-purple text-white font-mono uppercase text-[9px] md:text-[11px] tracking-[.1em] text-center"
    >
      <LivePill />
      <span className="md:hidden">{short}</span>
      <span className="hidden md:inline">{long}</span>
    </Link>
  )
}
