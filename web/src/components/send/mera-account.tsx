'use client'

import { useEffect, useRef, useState } from 'react'
import { MONAD_MAINNET_ID, type MonadChainId } from '@henad/core'
import { shortAddress } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Notice } from './send-ui'

function ClipboardIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="5.2" y="2.2" width="8.6" height="10.6" rx="1.6" />
      <path d="M10.8 5.2H3.8a1.6 1.6 0 0 0-1.6 1.6v6.6a1.6 1.6 0 0 0 1.6 1.6h5.4a1.6 1.6 0 0 0 1.6-1.6" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 8.4 6.3 11.7 13 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * The signed-in address as the header chip: "0x7a3f…9c2e", click to copy the full 42
 * characters. The chip is the only place the address appears, and a truncated address is
 * useless for funding an account or pasting into an explorer, so it has to be reachable
 * without devtools. The address text never changes width on copy — only the icon and the
 * accent do — so the nav does not jump.
 */
export function AccountChip({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard blocked (insecure origin, or permission denied). The title attribute
      // still carries the full address, so selecting it by hand remains possible.
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={address}
      aria-label={`Copy full address ${address}`}
      className={`press flex items-center gap-[7px] rounded-[4px] border bg-surface px-[10px] py-[6px] font-mono text-[11px] transition-colors ${
        copied ? 'border-purple text-purple' : 'border-border text-ink hover:border-muted'
      }`}
    >
      <span>{shortAddress(address)}</span>
      {copied ? <CheckIcon /> : <ClipboardIcon />}
      <span className="sr-only" aria-live="polite">
        {copied ? 'Address copied' : ''}
      </span>
    </button>
  )
}

const POINTS = [
  'Henad never holds your money. Funds move wallet to wallet in one transaction.',
  'No fiat, no custody, no KYC. Identity checks stay with the licensed ramps you already use.',
]

/** S0. One passkey ceremony creates or restores the account; there is nothing else to sign up with. */
export function MeraSignIn({
  chainId,
  busy,
  error,
  onContinue,
  onSignIn,
}: {
  chainId: MonadChainId
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
          A wallet you don&apos;t have to think about.
        </h1>
        <p className="relative m-0 text-[14px] leading-[1.55] text-grey pretty">
          Your passkey creates an account on Monad. No seed phrase. Nothing stored anywhere but the passkey.
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
          <span>Monad {chainId === MONAD_MAINNET_ID ? 'mainnet' : 'testnet'}</span>
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
