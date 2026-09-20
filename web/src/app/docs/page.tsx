import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Docs',
  description: 'What Henad publishes on every payout, the corridor tiers, and how to fund a payout.',
}

export default function DocsPage() {
  return (
    <>
      <p className="label-md m-0 text-purple">Docs</p>
      <h1 className="pretty m-0 font-display text-[28px] leading-[1.05] font-medium tracking-[-.03em] md:text-[36px]">What Henad publishes, and how to check it.</h1>
      <p className="pretty m-0 max-w-[520px] text-[16px] leading-[1.6] text-grey">
        Every payout settles through onchain FX on Monad and leaves a <span className="font-mono text-[13px] text-ink">PayoutSettled</span> receipt with the
        reference rate, the executed rate and the signed spread, readable by anyone at its permalink. These pages cover{' '}
        <Link href="/docs/mrc" className="text-purple">
          the three corridor tiers and the MRC draft
        </Link>{' '}
,{' '}
        <Link href="/docs/contracts" className="text-purple">
          the contracts themselves
        </Link>{' '}
        and{' '}
        <Link href="/docs/fund" className="text-purple">
          funding a payout from another chain
        </Link>
        .
      </p>
    </>
  )
}
