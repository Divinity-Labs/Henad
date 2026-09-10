import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Fund from another chain',
  description: 'How to fund a Henad payout today, and what arrives with Aurora Intents later.',
}

export default function FundPage() {
  return (
    <>
      <p className="label-md m-0 text-purple">Docs · Funding</p>
      <h1 className="pretty m-0 font-display text-[28px] leading-[1.05] font-medium tracking-[-.03em] md:text-[36px]">Fund from another chain.</h1>
      <p className="pretty m-0 max-w-[520px] text-[16px] leading-[1.6] text-grey">
        Funding from another chain arrives with Aurora Intents in a later release; for now bring AUSD or USDC on Monad.
      </p>
    </>
  )
}
