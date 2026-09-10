import Link from 'next/link'
import { TierPill } from '@/components/ui/TierPill'
import { CORRIDORS } from '@/lib/corridors'

const PEACH =
  'radial-gradient(ellipse 90% 70% at 20% 0%, #FFAE45 0%, transparent 60%), radial-gradient(ellipse 80% 70% at 100% 100%, #FF8EE4 0%, transparent 65%)'

const NEEDS = ['An NGN/USD reference feed on Monad', 'A naira settlement asset', 'A venue that prices from the feed, not from a curve']

const ROWS = [
  ['Reference rate', 'none'],
  ['Chainlink · Monad', 'no NGN feed'],
  ['Pyth · any chain', 'no NGN feed'],
  ['Chainlink · Celo', 'NGN/USD · relayed by Mento'],
  ['Settlement asset', 'none on Monad'],
] as const

const pairs = CORRIDORS.filter((c) => c.tier === 'unpriced')
  .map((c) => `${c.source} → ${c.target}`)
  .join(' · ')

function NgnCard() {
  return (
    <div className="relative flex flex-col gap-[10px] rounded-[12px] border border-ink/8 bg-surface px-[22px] py-5 font-mono text-[12px] shadow-[0_30px_60px_-30px_rgba(14,9,28,.35)]">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{pairs}</span>
        <TierPill tier="unpriced" />
      </div>
      <div className="border-t border-dashed border-border" />
      <dl className="m-0 flex flex-col gap-[10px]">
        {ROWS.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-muted">{k}</dt>
            <dd className="m-0 text-right">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-dashed border-border" />
      <p className="m-0 text-[11px] leading-[1.55] text-grey">Registry entry kept open. Send refuses this corridor with this reason.</p>
    </div>
  )
}

/** Naira: priced on Celo, unpriced on Monad. The argument, not the demo. Desktop layout. */
export function UnpricedModule() {
  return (
    <section className="hidden md:grid grid-cols-[1fr_520px] border-b border-hairline" aria-labelledby="unpriced-heading">
      <div className="flex flex-col justify-center gap-[22px] py-24 pl-9 pr-14 border-r border-hairline">
        <p className="m-0 font-mono uppercase text-[11px] tracking-[.12em] text-purple">The unpriced corridor</p>
        <h2 id="unpriced-heading" className="m-0 font-display font-medium text-[52px] tracking-[-.035em] leading-[1.02] balance">
          Naira has a price on Celo and none on Monad.
        </h2>
        <p className="m-0 text-[17px] leading-[1.6] text-grey pretty">
          Chainlink publishes NGN/USD on Celo, where Mento relays it. On Monad there is no NGN feed from Chainlink or Pyth and no naira asset. Five
          wealthy-country currencies have a number on this chain. No African currency except the rand has even that.
        </p>
        <p className="m-0 text-[17px] leading-[1.6] text-grey pretty">
          Henad’s registry holds the corridor anyway, with a rate source of none. The gap is on the record and visible in the product, not only in
          the pitch.
        </p>
        <ol className="m-0 mt-[6px] p-0 list-none flex flex-col font-mono text-[12px]">
          {NEEDS.map((n, i) => (
            <li key={n} className={`grid grid-cols-[36px_1fr] gap-4 py-3 border-t border-hairline ${i === NEEDS.length - 1 ? 'border-b' : ''}`}>
              <span className="text-purple">0{i + 1}</span>
              <span>{n}</span>
            </li>
          ))}
        </ol>
        <Link href="/docs/mrc" className="font-mono uppercase text-[12px] tracking-[.06em] text-ink">
          Read the MRC: a registry that holds a rate with no venue →
        </Link>
      </div>
      <div className="relative overflow-hidden grain flex flex-col justify-end min-h-[560px] bg-peach p-9" style={{ backgroundImage: PEACH }}>
        <div
          aria-hidden="true"
          className="absolute left-[-14px] top-3 font-display font-semibold text-[250px] leading-none tracking-[-.06em] text-ink/8 pointer-events-none select-none"
        >
          NGN
        </div>
        <NgnCard />
      </div>
    </section>
  )
}

/** The same argument as a rounded card, as the mobile canvas frames it. */
export function UnpricedCard() {
  return (
    <section className="flex md:hidden relative overflow-hidden grain mx-3 mt-6 rounded-[16px] bg-peach px-5 py-6 flex-col gap-3" style={{ backgroundImage: PEACH }}>
      <div
        aria-hidden="true"
        className="absolute right-[-10px] top-[-20px] font-display font-semibold text-[130px] leading-none tracking-[-.06em] text-ink/8 pointer-events-none select-none"
      >
        NGN
      </div>
      <p className="relative m-0 label text-ink">The unpriced corridor</p>
      <h2 className="relative m-0 font-display font-medium text-[26px] tracking-[-.03em] leading-[1.05] balance">Naira has a price on Celo and none on Monad.</h2>
      <p className="relative m-0 text-[13px] leading-[1.55] text-grey-2">
        No NGN feed from Chainlink or Pyth on Monad, and no naira asset. Henad keeps the corridor in its registry with a rate source of none, and
        says so.
      </p>
      <Link href="/docs/mrc" className="relative font-mono uppercase text-[10px] tracking-[.08em] text-ink">
        Read the MRC →
      </Link>
    </section>
  )
}
