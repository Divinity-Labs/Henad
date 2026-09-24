'use client'

import { Button } from '@/components/ui/Button'
import { isLocalFork } from '@/lib/chain'
import { Notice } from './send-ui'

const POINTS = [
  'Henad never holds your money. It goes straight from your account to theirs, in one step.',
  'No fiat, no custody, no KYC. Identity checks stay with the licensed ramps you already use.',
]

/**
 * S0. One passkey ceremony creates or restores the account; there is nothing else to sign up with.
 *
 * It speaks of an account, not a wallet or a network: this is the first screen a new payer
 * sees, and they came to pay someone. The network is named only on a developer's local fork,
 * where knowing it is not real money matters.
 */
export function MeraSignIn({
  busy,
  error,
  onContinue,
  onSignIn,
}: {
  busy: boolean
  error: string | null
  onContinue: () => void
  onSignIn: () => void
}) {
  return (
    <>
      <div className="relative flex flex-col gap-4 overflow-hidden border-b border-hairline px-5 pb-8 pt-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[160px]"
          style={{
            background:
              'radial-gradient(ellipse 60% 70% at 15% 100%, rgba(255,142,228,.35), transparent 70%), radial-gradient(ellipse 60% 70% at 85% 100%, rgba(110,84,255,.3), transparent 70%)',
          }}
        />
        <p className="label relative m-0 text-purple">Sign in</p>
        <h1 className="relative m-0 font-display text-[32px] font-medium leading-[1.02] tracking-[-.035em] balance">
          An account you don&apos;t have to think about.
        </h1>
        <p className="relative m-0 text-[14px] leading-[1.55] text-grey pretty">
          Your passkey creates your Henad account. No seed phrase, nothing to write down, and the same passkey opens it in the app.
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-[10px] px-4 pt-6">
        <Button variant={busy ? 'disabled' : 'primary'} size="xl" block onClick={onContinue}>
          {busy ? 'Waiting for the passkey…' : 'Continue with passkey'}
        </Button>
        <Button variant={busy ? 'disabled' : 'secondary'} size="xl" block onClick={onSignIn}>
          I already have a passkey
        </Button>
        {error && <Notice>{error}</Notice>}
        <div className="label flex items-center justify-between pt-[14px] text-muted">
          <span>Passkey by Mera</span>
          {isLocalFork() ? <span>Local fork</span> : null}
        </div>
        <div className="flex-1" />
        <ol className="m-0 flex list-none flex-col gap-[10px] border-t border-hairline p-0 pb-5 pt-4 text-[12px] leading-[1.5] text-grey">
          {POINTS.map((p, i) => (
            <li key={p} className="flex gap-[10px]">
              <span className="flex-none font-mono text-purple">0{i + 1}</span>
              <span>{p}</span>
            </li>
          ))}
        </ol>
      </div>
    </>
  )
}
