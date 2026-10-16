import Link from 'next/link'
import { ReceiptSlip } from '@/components/ReceiptSlip'
import { Button } from '@/components/ui/Button'
import { LIVE_CORRIDOR, type Corridor, type Tier } from '@henad/core'
import { rateValue, spreadLine } from '@/lib/format'
import type { LiveRate } from '@/lib/rates'
import type { Receipt } from '@/lib/receipts'

const GLOW =
  'radial-gradient(ellipse 45% 55% at 18% 100%, rgba(255,142,228,.42), transparent 70%), radial-gradient(ellipse 50% 60% at 55% 110%, rgba(110,84,255,.34), transparent 70%), radial-gradient(ellipse 40% 50% at 88% 100%, rgba(255,174,69,.36), transparent 70%)'

/** How far each card's layer travels as the hero scrolls away, as a multiple of the slip's. */
const DEPTHS = [1.6, 0.8, 1.2, 2]

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
 * Four cards, one per rung of the ladder the product is about: a corridor that
 * settles, one priced with nowhere to deliver, one whose price exists but never
 * reaches this chain, and one with no price at all. The naira takes the last slot
 * deliberately — it is the argument, so it must never be crowded out by another
 * unpriced corridor sorting ahead of it.
 *
 * The live card carries the latest settlement's spread, or the live reference rate
 * before the first settlement. Decorative: every figure here also appears in the
 * stats and the corridor table, so the cards are hidden from assistive tech.
 */
function FloatingCards({ rates, latest }: { rates: LiveRate[]; latest: Receipt | null }) {
  const byKey = (k: string) => rates.find((r) => r.corridor.key === k)
  const live = rates.find((r) => r.corridor.tier === 'live')
  const quote = rates.find((r) => r.corridor.tier === 'quote')
  // Named, not found-by-tier: the naira is the point of the section this card previews.
  const naira = byKey('USD/NGN')
  const otherUnpriced = rates.find((r) => r.corridor.tier === 'unpriced' && r.corridor.target !== 'NGN')

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
  for (const r of [quote, otherUnpriced, naira]) {
    if (r) cards.push({ corridor: r.corridor, note: r.corridor.shortNote })
  }

  return (
    <>
      {cards.map((card, i) => {
        const slot = SLOTS[i]
        if (!slot) return null
        const c = card.corridor
        const isLive = c.tier === 'live'
        return (
          // The outer layer moves with the scroll at its own depth; the card inside floats and follows the pointer.
          <div key={c.key} aria-hidden="true" data-depth={DEPTHS[i]} style={{ left: slot.left, right: slot.right, top: slot.top }} className="absolute hidden xl:block">
            <div
              data-card
              style={{ transform: `rotate(${slot.rotate}deg)` }}
              className={`flex flex-col gap-1 px-[14px] py-3 rounded-[12px] font-mono text-[10px] uppercase tracking-[.1em] will-change-transform ${
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
    <section data-hero className="hero-pre relative overflow-hidden flex flex-col items-center gap-4 md:gap-6 pt-11 md:pt-[120px] px-5 md:px-9 md:min-h-[760px] text-center">
      <div aria-hidden="true" data-h="glow" className="absolute inset-x-0 bottom-0 h-[300px] md:h-[520px] pointer-events-none" style={{ background: GLOW }} />
      <FloatingCards rates={rates} latest={latest} />
      <div className="relative flex flex-col items-center gap-4 md:gap-6 max-w-[760px] w-full">
        <p data-h="eyebrow" className="m-0 font-mono uppercase text-[10px] md:text-[11px] tracking-[.12em] text-purple">
          <span className="md:hidden">
            {c.source} → {c.target} · settled on Monad
          </span>
          <span className="hidden md:inline">
            Cross-border payouts · {c.source} → {c.target} · settled on Monad
          </span>
        </p>
        <h1 data-h="title" className="m-0 font-display font-medium text-[36px] md:text-[clamp(52px,5.3vw,68px)] leading-[1.02] md:leading-none tracking-[-.035em] balance">
          Send money abroad. Keep proof of the rate.
        </h1>
        <p data-h="copy" className="m-0 text-[14px] md:text-[19px] leading-[1.55] text-grey max-w-[620px] pretty">
          <span className="md:hidden">Dollars to pounds through onchain FX. Reference rate, executed rate, and the exact spread on every payment.</span>
          <span className="hidden md:inline">
            Henad settles dollars to pounds through onchain FX and publishes the reference rate, the executed rate, and the exact spread on every
            payment.
          </span>
        </p>
        <div className="flex flex-col md:flex-row items-center gap-[14px] md:gap-7 w-full md:w-auto md:pt-[6px]">
          <span data-h="actions" className="w-full md:w-auto">
            <Button href="/send" size="xl" className="w-full md:w-auto" data-magnetic>
              Send a payout
            </Button>
          </span>
          <Link href="/rates" data-h="actions" className="font-mono uppercase text-[11px] md:text-[12px] tracking-[.06em] text-ink">
            See live rates →
          </Link>
        </div>
      </div>
      <div data-h="slip" className="md:hidden mt-[2px]">
        <ReceiptSlip receipt={slip} size="sm" compact className="w-[280px] -rotate-[1.5deg] text-left shadow-[0_30px_60px_-24px_rgba(14,9,28,.35)]" />
      </div>
      <div data-h="slip" className="hidden md:block mt-12 will-change-transform">
        <ReceiptSlip receipt={slip} size="lg" className="w-[400px] -rotate-[1.5deg] text-left shadow-[0_40px_80px_-30px_rgba(14,9,28,.35)]" />
      </div>
    </section>
  )
}
