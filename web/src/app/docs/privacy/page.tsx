import type { Metadata } from 'next'
import { pageMeta } from '@/lib/site'
import Link from 'next/link'

export const metadata: Metadata = pageMeta({
  title: 'Privacy',
  description: 'What Henad stores, what it cannot store, and what is public on Monad forever.',
  path: '/docs/privacy',
})

const UPDATED = '20 September 2026'

/** /docs/privacy — short on purpose: a product that holds no accounts has little to disclose. */
export default function PrivacyPage() {
  return (
    <>
      <p className="label-md m-0 text-purple">Docs · Privacy</p>
      <h1 className="pretty m-0 font-display text-[28px] leading-[1.05] font-medium tracking-[-.03em] md:text-[36px]">
        Henad has no accounts, so there is little about you to keep.
      </h1>
      <p className="m-0 font-mono text-[12px] text-muted">Last updated {UPDATED}</p>

      <p className="pretty m-0 max-w-[560px] text-[16px] leading-[1.6] text-grey">
        There is no sign-up, no email address, no password and no profile. Your account is a passkey held by your device and its
        operating system, and Henad never sees it.
      </p>

      <h2 className="m-0 mt-4 font-display text-[20px] font-medium tracking-[-.02em]">What stays on your device</h2>
      <p className="pretty m-0 max-w-[560px] text-[16px] leading-[1.6] text-grey">
        Your browser keeps your account&apos;s public address, the id of the passkey it came from, and the domain that passkey belongs
        to, so the page can show you as signed in without asking for your fingerprint again. Signing out on{' '}
        <Link href="/account" className="text-purple">
          the account page
        </Link>{' '}
        erases it. The signing key itself is never written down anywhere: it is derived from your passkey when something must be
        signed and destroyed immediately afterwards. The phone app keeps the same three values in the device&apos;s secure storage.
      </p>

      <h2 className="m-0 mt-4 font-display text-[20px] font-medium tracking-[-.02em]">What the servers see</h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[16px] leading-[1.6] text-grey">
        <li className="pretty max-w-[560px]">
          <span className="text-ink">No analytics, no tracking pixels, no advertising, and no third-party scripts.</span> This site loads
          nothing from anyone else at runtime.
        </li>
        <li className="pretty max-w-[560px]">
          <span className="text-ink">No cookies.</span> Nothing is stored for advertising, measurement or session tracking.
        </li>
        <li className="pretty max-w-[560px]">
          <span className="text-ink">Quotes and rates</span> are read from Monad when you ask for them. Nothing about the request is kept.
        </li>
        <li className="pretty max-w-[560px]">
          <span className="text-ink">Submitting a payout</span> sends your signed authorization to Henad&apos;s relayer, which broadcasts
          it to Monad and pays the gas. Your IP address is counted in memory, for a minute at a time, only to rate-limit that one
          endpoint. It is never written to disk or shared.
        </li>
        <li className="pretty max-w-[560px]">
          Hosting is Vercel, which keeps its own short-lived request logs. We do not add to them.
        </li>
      </ul>

      <h2 className="m-0 mt-4 font-display text-[20px] font-medium tracking-[-.02em]">What is public, forever</h2>
      <p className="pretty m-0 max-w-[560px] text-[16px] leading-[1.6] text-grey">
        Every payout writes a receipt to a public blockchain: the amounts, the rates, the spread, the block, and the addresses of
        payer and recipient. That is the point of the product, and it cannot be deleted, edited or hidden, by us or by anyone. An
        address is not your name, but anyone who learns which address is yours can read everything it has ever done. Think before
        publishing a{' '}
        <Link href="/receipts" className="text-purple">
          receipt link
        </Link>{' '}
        that names you.
      </p>

      <h2 className="m-0 mt-4 font-display text-[20px] font-medium tracking-[-.02em]">What we cannot do</h2>
      <p className="pretty m-0 max-w-[560px] text-[16px] leading-[1.6] text-grey">
        We cannot freeze, move or recover your funds, and we cannot reset your passkey. Lose the passkey and the account goes with
        it. There is nothing to ask us to delete, because there is no account record to delete.
      </p>

      <p className="pretty m-0 mt-4 max-w-[560px] text-[14px] leading-[1.6] text-muted">
        Henad is a hackathon project. Questions go to the repository&apos;s issues.
      </p>
    </>
  )
}
