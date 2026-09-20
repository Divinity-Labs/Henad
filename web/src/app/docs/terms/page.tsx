import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms',
  description: 'What Henad is, what it is not, and what you take on by using it.',
}

const UPDATED = '20 September 2026'

/** /docs/terms — the honest version: software, no custody, no guarantees, irreversible. */
export default function TermsPage() {
  return (
    <>
      <p className="label-md m-0 text-purple">Docs · Terms</p>
      <h1 className="pretty m-0 font-display text-[28px] leading-[1.05] font-medium tracking-[-.03em] md:text-[36px]">
        Henad is software. It never holds your money.
      </h1>
      <p className="m-0 font-mono text-[12px] text-muted">Last updated {UPDATED}</p>

      <p className="pretty m-0 max-w-[560px] text-[16px] leading-[1.6] text-grey">
        Using this site or the app means accepting what follows. If any of it is unacceptable to you, do not use it.
      </p>

      <h2 className="m-0 mt-4 font-display text-[20px] font-medium tracking-[-.02em]">What this is</h2>
      <p className="pretty m-0 max-w-[560px] text-[16px] leading-[1.6] text-grey">
        An interface to contracts published on Monad. You sign; the contracts move your funds directly from your account to the
        recipient&apos;s in one transaction. Henad takes no custody at any point, charges no fee today, and is not a bank, a money
        transmitter, an exchange or a licensed payment service anywhere.
      </p>

      <h2 className="m-0 mt-4 font-display text-[20px] font-medium tracking-[-.02em]">What it is not</h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[16px] leading-[1.6] text-grey">
        <li className="pretty max-w-[560px]">
          <span className="text-ink">Not fiat.</span> A payout delivers a currency-pegged token on Monad, not pounds, euros, francs or
          yen in a bank account. Converting that token to money in a bank is somebody else&apos;s regulated business, not ours.
        </li>
        <li className="pretty max-w-[560px]">
          <span className="text-ink">Not advice.</span> Nothing here is financial, tax or legal advice.
        </li>
        <li className="pretty max-w-[560px]">
          <span className="text-ink">Not reversible.</span> A settled payout cannot be cancelled, refunded or clawed back, by you or by
          us. A wrong recipient address means the funds are gone.
        </li>
      </ul>

      <h2 className="m-0 mt-4 font-display text-[20px] font-medium tracking-[-.02em]">Your passkey is your account</h2>
      <p className="pretty m-0 max-w-[560px] text-[16px] leading-[1.6] text-grey">
        Keeping it is your responsibility. We cannot reset it, recover it, or move funds on your behalf, and no support process
        exists that could. Anyone who can use your passkey can spend your balance.
      </p>

      <h2 className="m-0 mt-4 font-display text-[20px] font-medium tracking-[-.02em]">What we control, and what we do not</h2>
      <p className="pretty m-0 max-w-[560px] text-[16px] leading-[1.6] text-grey">
        The contracts have no upgrade path, no pause and no way for us to touch your funds or edit a receipt. The owner key can
        register a corridor and repoint one&apos;s rate feed or venue; nothing else. Henad depends on parties we do not control,
        including Monad itself, Chainlink&apos;s price feeds, Mento&apos;s pools and the issuers of the tokens involved. If any of them
        fails, pauses or changes, payouts can stop or revert. A{' '}
        <Link href="/top-up" className="text-purple">
          top-up swap
        </Link>{' '}
        is a trade on a third-party pool at whatever price that pool offers, with no reference rate and no receipt.
      </p>

      <h2 className="m-0 mt-4 font-display text-[20px] font-medium tracking-[-.02em]">No warranty</h2>
      <p className="pretty m-0 max-w-[560px] text-[16px] leading-[1.6] text-grey">
        This is a hackathon project, provided as is, with no warranty of any kind and no guarantee of availability, correctness or
        fitness for any purpose. To the fullest extent the law allows, we are not liable for any loss arising from your use of it,
        including loss of funds. The contracts are public and verified: read them before trusting them with anything you cannot
        afford to lose.
      </p>

      <h2 className="m-0 mt-4 font-display text-[20px] font-medium tracking-[-.02em]">Your responsibilities</h2>
      <p className="pretty m-0 max-w-[560px] text-[16px] leading-[1.6] text-grey">
        Obeying the laws that apply to you, including sanctions and tax, is yours alone. Henad performs no identity checks and
        screens no one. Do not use it where doing so would break the law that governs you.
      </p>

      <p className="pretty m-0 mt-4 max-w-[560px] text-[14px] leading-[1.6] text-muted">
        These terms may change; the date above says when they last did.
      </p>
    </>
  )
}
