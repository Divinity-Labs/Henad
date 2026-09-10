import Link from 'next/link'
import { TierPill } from '@/components/ui/TierPill'
import { CORRIDORS } from '@/lib/corridors'

const PEACH =
  'radial-gradient(ellipse 90% 70% at 20% 0%, #FFAE45 0%, transparent 60%), radial-gradient(ellipse 80% 70% at 100% 100%, #FF8EE4 0%, transparent 65%)'

/** The date the claims below were read on-chain. A claim about missing infrastructure
 *  is only ever true as of a date, and this page is read weeks after it is written. */
export const VERIFIED_ON = '10 Sep 2026'

/**
 * What has to exist before the corridor can settle. Four steps, not three: the relay
 * is the one no third party can perform, so leaving it out made the list look like a
 * to-do the team could work through itself.
 */
const NEEDS = [
  {
    title: 'A Chainlink NGN/USD aggregator deployed on Monad.',
    body: 'Chainlink already runs this feed on Celo; deploying it here is Chainlink’s decision, and Mento cannot make it for them.',
  },
  {
    title: 'NGNm on Monad.',
    body: 'Mento’s bridge config names five tokens and no naira, and there is no naira spoke to deploy from.',
  },
  {
    title: 'A relayer carrying that feed into Mento’s oracle, with breakers set.',
    body: 'The factory’s deployRelayer is restricted to Mento’s multisig, so no third party can add one.',
  },
  {
    title: 'An NGNm/USDm pool funded with reserve-backed liquidity.',
    body: 'Priced from the relayed feed rather than a curve. This is the step the Canadian dollar never got.',
  },
]

/** Every row is checkable in one call. Read on-chain on the date in the last row. */
const ROWS: readonly (readonly [string, string])[] = [
  ['Reference rate', 'none'],
  ['Chainlink · Monad', 'no NGN feed; five fiat feeds, none African'],
  ['Pyth · any chain', 'no NGN feed'],
  ['Pyth · Monad', 'rand only, last published 2 Sep 2025'],
  ['Chainlink · Celo', 'NGN/USD live, relayed by Mento · 0xc17c…4c11'],
  ['Mento · Monad', 'no NGNm, no relayer, no pool'],
  ['Settlement asset', 'none on Monad'],
  ['Read on-chain', VERIFIED_ON],
]

const HEADLINE = 'Five currencies have a live price on Monad. None of them is African.'

/** This panel is about the naira specifically. The rand is also unpriced, for a
 *  different reason, and gets its own row in the rates table rather than this card. */
const pairs =
  CORRIDORS.filter((c) => c.target === 'NGN')
    .map((c) => `${c.source} → ${c.target}`)
    .join(' · ') || 'USD → NGN'

function NgnCard({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`relative flex flex-col rounded-[12px] border border-ink/8 bg-surface font-mono shadow-[0_30px_60px_-30px_rgba(14,9,28,.35)] ${
        compact ? 'gap-2 px-4 py-4 text-[11px]' : 'gap-[10px] px-[22px] py-5 text-[12px]'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{pairs}</span>
        <TierPill tier="unpriced" />
      </div>
      <div className="border-t border-dashed border-border" />
      <dl className={`m-0 flex flex-col ${compact ? 'gap-[7px]' : 'gap-[10px]'}`}>
        {ROWS.map(([k, v], i) => (
          <div key={k} className={`flex justify-between gap-4 ${i === ROWS.length - 1 ? 'text-[.9em] text-muted' : ''}`}>
            <dt className={`whitespace-nowrap ${i === ROWS.length - 1 ? '' : 'text-muted'}`}>{k}</dt>
            <dd className="m-0 text-right leading-[1.45]">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-dashed border-border" />
      <p className={`m-0 leading-[1.55] text-grey ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
        Registry entry kept open. Send offers this corridor, refuses to quote it, and gives this as the reason.
      </p>
    </div>
  )
}

function Body() {
  return (
    <>
      <p className="pretty m-0 text-[16px] leading-[1.6] text-grey lg:text-[17px]">
        Chainlink runs five fiat feeds here — euro, pound, Swiss franc, yen, Canadian dollar — and no African currency among
        them. Pyth publishes no naira feed on any chain, and the one African currency it does publish, the rand, sits in
        Monad’s Pyth contract with a publish time of 2 September 2025; every staleness-checked read of it reverts. Chainlink
        does produce NGN/USD: it runs on Celo, where Mento relays it into a naira market.
      </p>
      <p className="pretty m-0 text-[16px] leading-[1.6] text-grey lg:text-[17px]">
        Henad’s registry holds USD → NGN anyway, with a rate source of none: the app offers the corridor, refuses to quote
        it, and gives the reason instead of a number. Closing it takes two decisions from two parties. Chainlink would have
        to deploy NGN/USD on Monad, which Mento cannot do for it. Mento would have to add the naira to a bridge config that
        today names five tokens and no naira, deploy the spoke, get a relayer through a factory restricted to its own
        multisig, set the breakers, and fund a pool. Mento has left the slot open — its Monad config reads{' '}
        <code className="font-mono text-[.92em] text-ink">ngn: address(0)</code>, one line below a filled-in{' '}
        <code className="font-mono text-[.92em] text-ink">cad</code> — and the Canadian dollar, whose Chainlink feed is live
        on Monad, still has no Mento asset, no relayer and no pool.
      </p>
    </>
  )
}

function Needs() {
  return (
    <ol className="m-0 mt-[6px] flex list-none flex-col p-0 font-mono text-[12px]">
      {NEEDS.map((n, i) => (
        <li
          key={n.title}
          className={`grid grid-cols-[32px_1fr] gap-4 border-t border-hairline py-3 ${i === NEEDS.length - 1 ? 'border-b' : ''}`}
        >
          <span className="text-purple">0{i + 1}</span>
          <span className="flex flex-col gap-1">
            <span>{n.title}</span>
            <span className="text-[11px] leading-[1.55] text-muted">{n.body}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

/**
 * The unpriced corridor: the submission's argument rather than its demo.
 *
 * Every claim was read on-chain on the date in the card's last row and is checkable in
 * one call. The panel deliberately never says "just", "only" or "one feed away": there
 * are two gaps held by two different parties, and the Canadian dollar proves a feed
 * alone has not produced a market on Monad.
 *
 * Desktop splits into text and the peach grain panel from lg. Between md and lg the
 * column is too narrow for a 520px card beside prose, so it stacks.
 */
export function UnpricedModule() {
  return (
    <section className="hidden border-b border-hairline md:block lg:grid lg:grid-cols-[1fr_minmax(420px,520px)]" aria-labelledby="unpriced-heading">
      <div className="flex flex-col justify-center gap-[22px] border-hairline px-9 py-16 lg:border-r lg:py-24 lg:pr-14 lg:pl-9">
        <p className="label-md m-0 text-purple">The unpriced corridor</p>
        <h2
          id="unpriced-heading"
          className="balance m-0 font-display text-[38px] font-medium leading-[1.02] tracking-[-.035em] lg:text-[52px]"
        >
          {HEADLINE}
        </h2>
        <Body />
        <Needs />
        <Link href="/docs/mrc" className="label-lg text-ink underline-offset-4 hover:underline">
          Read the MRC: how a registry records a corridor it cannot price →
        </Link>
      </div>
      <div
        className="grain relative flex min-h-[560px] flex-col justify-end overflow-hidden bg-peach p-9"
        style={{ backgroundImage: PEACH }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-[-14px] top-3 select-none font-display text-[180px] font-semibold leading-none tracking-[-.06em] text-ink/8 lg:text-[250px]"
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
    <section
      className="grain relative mx-3 mt-6 flex flex-col gap-3 overflow-hidden rounded-[16px] bg-peach px-5 py-6 md:hidden"
      style={{ backgroundImage: PEACH }}
      aria-labelledby="unpriced-heading-m"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-10px] top-[-20px] select-none font-display text-[130px] font-semibold leading-none tracking-[-.06em] text-ink/8"
      >
        NGN
      </div>
      <p className="label relative m-0 text-ink">The unpriced corridor</p>
      <h2 id="unpriced-heading-m" className="balance relative m-0 font-display text-[26px] font-medium leading-[1.05] tracking-[-.03em]">
        {HEADLINE}
      </h2>
      <p className="relative m-0 text-[13px] leading-[1.55] text-grey-2">
        Chainlink runs five fiat feeds on Monad and none is African. Pyth publishes no naira feed on any chain. Henad keeps
        the corridor in its registry with a rate source of none, and says so.
      </p>
      <div className="relative mt-1">
        <NgnCard compact />
      </div>
      <Link href="/docs/mrc" className="label relative text-ink underline-offset-4 hover:underline">
        Read the MRC →
      </Link>
    </section>
  )
}
