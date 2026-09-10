import Link from 'next/link'
import { ReceiptSlip } from '@/components/ReceiptSlip'
import { Button } from '@/components/ui/Button'
import { LIVE_CORRIDOR, type Corridor, type Tier } from '@/lib/corridors'
import { rateValue, spreadLine } from '@/lib/format'
import type { LiveRate } from '@/lib/rates'
import type { Receipt } from '@/lib/receipts'

const GLOW =
  'radial-gradient(ellipse 45% 55% at 18% 100%, rgba(255,142,228,.42), transparent 70%), radial-gradient(ellipse 50% 60% at 55% 110%, rgba(110,84,255,.34), transparent 70%), radial-gradient(ellipse 40% 50% at 88% 100%, rgba(255,174,69,.36), transparent 70%)'

const TIER_LABEL: Record<Tier, string> = { live: 'Live', quote: 'Quote', unpriced: 'Unpriced' }

/** Canvas positions inside the 1200px column; the cards only show at xl, where that column is exact. */
const SLOTS: { left?: number; right?: number; top: number; rotate: number }[] = [
  { left: 96, top: 168, rotate: -6 },
  { left: 150, top: 430, rotate: 5 },
  { right: 60, top: 118, rotate: 7 },
  { right: 140, top: 440, rotate: -5 },
]

interface Card {
  corridor: Corridor
  /** Display-face figure on the live card. */
  figure?: string
  /** Small mono note under the label. */
  note?: string
}

/**
 * Live / Quote / Quote / Unpriced, one per tier from the registry. The live
 * card carries the latest settlement's spread, or the live reference rate
 * before the first settlement. Decorative: the same figures sit in the stats
 * and the corridor table, so the cards are hidden from assistive tech.
 */
function FloatingCards({ rates, latest }: { rates: LiveRate[]; latest: Receipt | null }) {
  const live = rates.find((r) => r.corridor.tier === 'live')
  const quotes = rates.filter((r) => r.corridor.tier === 'quote').slice(0, 2)
  const unpriced = rates.find((r) => r.corridor.tier === 'unpriced')

  const cards: Card[] = []
  if (latest) {
    const c = latest.corridor
    cards.push({ corridor: c, figure: spreadLine(latest.spreadCost, latest.targetAsset.decimals, c.targetSymbol, latest.spreadBps, { dp: c.currencyDp }) })
  } else if (live) {
    const c = live.corridor
    cards.push({
      corridor: c,
      figure: live.rate === null ? '—' : rateValue(live.rate, c.targetSymbol, c.rateDp),
      note: `${c.feed?.label ?? 'Reference'}${live.stale ? ' · stale' : ''}`,
    })
  }
  for (const q of quotes) cards.push({ corridor: q.corridor, note: q.corridor.note })
  if (unpriced) cards.push({ corridor: unpriced.corridor, note: 'No rate source on Monad' })

  return (
    <>
      {cards.map((card, i) => {
        const slot = SLOTS[i]
        if (!slot) return null
        const c = card.corridor
        const isLive = c.tier === 'live'
        return (
          <div
            key={c.key}
            aria-hidden="true"
            style={{ left: slot.left, right: slot.right, top: slot.top, transform: `rotate(${slot.rotate}deg)` }}
            className={`absolute hidden xl:flex flex-col gap-1 px-[14px] py-3 rounded-[12px] font-mono text-[10px] uppercase tracking-[.1em] ${
              isLive
                ? 'bg-surface border border-hairline text-purple shadow-[0_12px_30px_-12px_rgba(14,9,28,.25)]'
                : 'bg-surface-2 border border-dashed border-border text-muted'
            }`}
          >
            <span>
              {c.source} → {c.target} · {TIER_LABEL[c.tier]}
            </span>
            {card.figure ? (
              <span className="font-display font-medium text-[20px] tracking-[-.03em] normal-case text-ink tabular">{card.figure}</span>
            ) : null}
            {card.note ? <span className="normal-case tracking-[.04em] text-grey">{card.note}</span> : null}
          </div>
        )
      })}
    </>
  )
}

/**
 * The landing hero: eyebrow, headline, copy, the two actions and the tilted
 * receipt. `slip` is the latest settlement or the fixture, which the slip
 * itself labels "Sample receipt".
 */
export function Hero({ slip, latest, rates }: { slip: Receipt; latest: Receipt | null; rates: LiveRate[] }) {
  const c = LIVE_CORRIDOR
  return (
    <section className="relative overflow-hidden flex flex-col items-center gap-4 md:gap-6 pt-11 md:pt-[120px] px-5 md:px-9 md:min-h-[760px] text-center">
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[300px] md:h-[520px] pointer-events-none" style={{ background: GLOW }} />
      <FloatingCards rates={rates} latest={latest} />
      <div className="relative flex flex-col items-center gap-4 md:gap-6 max-w-[760px] w-full">
        <p className="m-0 font-mono uppercase text-[10px] md:text-[11px] tracking-[.12em] text-purple">
          <span className="hidden md:inline">Cross-border payouts · </span>
          {c.source} → {c.target} · settled on Monad
        </p>
        <h1 className="m-0 font-display font-medium text-[36px] md:text-[clamp(52px,5.3vw,68px)] leading-[1.02] md:leading-none tracking-[-.035em] balance">
          Send money abroad. Keep proof of the rate.
        </h1>
        <p className="m-0 text-[14px] md:text-[19px] leading-[1.55] text-grey max-w-[620px] pretty">
          <span className="md:hidden">Dollars to pounds through onchain FX. Reference rate, executed rate, and the exact spread on every payment.</span>
          <span className="hidden md:inline">
            Henad settles dollars to pounds through onchain FX and publishes the reference rate, the executed rate, and the exact spread on every
            payment.
          </span>
        </p>
        <div className="flex flex-col md:flex-row items-center gap-[14px] md:gap-7 w-full md:w-auto md:pt-[6px]">
          <Button href="/send" size="xl" className="w-full md:w-auto">
            Send a payout
          </Button>
          <Link href="/rates" className="font-mono uppercase text-[11px] md:text-[12px] tracking-[.06em] text-ink">
            See live rates →
          </Link>
        </div>
      </div>
      <ReceiptSlip
        receipt={slip}
        size="sm"
        compact
        className="md:hidden w-[280px] mt-[2px] -rotate-[1.5deg] text-left shadow-[0_30px_60px_-24px_rgba(14,9,28,.35)]"
      />
      <ReceiptSlip receipt={slip} size="lg" className="hidden md:block w-[400px] mt-12 -rotate-[1.5deg] text-left shadow-[0_40px_80px_-30px_rgba(14,9,28,.35)]" />
    </section>
  )
}
