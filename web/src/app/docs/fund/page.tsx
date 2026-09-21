import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Funding a payout',
  description: 'What a Henad payout spends, and how to get it onto Monad.',
}

export default function FundPage() {
  return (
    <>
      <p className="label-md m-0 text-purple">Docs · Funding</p>
      <h1 className="pretty m-0 font-display text-[28px] leading-[1.05] font-medium tracking-[-.03em] md:text-[36px]">Funding a payout.</h1>
      <p className="pretty m-0 max-w-[520px] text-[16px] leading-[1.6] text-grey">
        A payout spends AUSD or USDC on Monad. If your account holds MON and nothing else,{' '}
        <Link href="/top-up" className="text-purple">
          Top up
        </Link>{' '}
        swaps it for either through PancakeSwap&apos;s 0.05% pool, at whatever the market gives — a market swap, with no
        reference rate and no receipt. The spread Henad publishes is the one on the payout itself.
      </p>
      <p className="pretty m-0 max-w-[520px] text-[16px] leading-[1.6] text-grey">
        Bringing money from another chain means a bridge or an exchange withdrawal to your Monad address. Henad does not
        run one, and it does not pretend one is coming.
      </p>
    </>
  )
}
