import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'MRC draft',
  description: 'The three corridor tiers Henad proposes as the convention for onchain FX receipts on Monad.',
}

/** Placeholder until the draft's discussion topic is opened: the MIPs category it will live in. */
const FORUM_THREAD = 'https://forum.monad.xyz/c/mips/8'

export default function MrcPage() {
  return (
    <>
      <p className="label-md m-0 text-purple">Docs · MRC draft</p>
      <h1 className="pretty m-0 font-display text-[28px] leading-[1.05] font-medium tracking-[-.03em] md:text-[36px]">
        A corridor is live, quoted, or unpriced. The chain decides which.
      </h1>
      <p className="pretty m-0 max-w-[520px] text-[16px] leading-[1.6] text-grey">
        Henad&apos;s corridor registry has three tiers, and the MRC draft proposes them as the convention for onchain FX receipts on Monad. A corridor is{' '}
        <span className="text-ink">live</span> when Monad holds both a reference feed and a venue for the pair, so a payout can settle and its receipt can be
        attested: USD to GBP, EUR, CHF and JPY today. It is <span className="text-ink">quote</span> when a feed exists on Monad but there is no asset to
        deliver into, so Henad shows a reference rate and nothing else: CAD and ZAR. It is <span className="text-ink">unpriced</span> when Monad has no feed at
        all, so no rate is shown and none is invented: naira. The draft is discussed{' '}
        <a href={FORUM_THREAD} target="_blank" rel="noreferrer" className="text-purple">
          on the Monad forum ↗
        </a>{' '}
        before it is filed.
      </p>
    </>
  )
}
