import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'MRC draft',
  description: 'The three corridor tiers Henad proposes as the convention for onchain FX receipts on Monad.',
}

/** The MIPs category. The draft's own topic replaces this once it is opened. */
const FORUM_THREAD = 'https://forum.monad.xyz/c/mips/8'
const DRAFT = 'https://github.com/Divinity-Labs/Henad/blob/main/docs/MRC-DRAFT.md'

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
        deliver into, so Henad shows a reference rate and nothing else: CAD. It is <span className="text-ink">unpriced</span> when Monad has no usable feed at
        all, so no rate is shown and none is invented: naira, and the rand, whose only price on Monad was last published in 2025. The draft is discussed{' '}
        <a href={FORUM_THREAD} target="_blank" rel="noreferrer" className="text-purple">
          on the Monad forum ↗
        </a>{' '}
        before it is filed.
      </p>
      <p className="pretty m-0 max-w-[520px] text-[16px] leading-[1.6] text-grey">
        The draft itself proposes the receipt as a standard: a struct, an event, and a read interface, written in the same transaction as the conversion, so
        the reference rate, the executed rate and the spread in basis points are recorded in one shape across applications rather than one per application.{' '}
        <a href={DRAFT} target="_blank" rel="noreferrer" className="text-purple">
          Read the draft ↗
        </a>
      </p>
    </>
  )
}
