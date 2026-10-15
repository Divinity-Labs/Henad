'use client'

import { useEffect, useState } from 'react'
import { parseUnits, type Address } from 'viem'
import { CLAIM_LINK_DAYS, claimLink, type LinkState } from '@henad/core'
import { Button } from '@/components/ui/Button'
import { Card, Notice, StepHeader } from '@/components/send/send-ui'
import { createLink, readLinkNow, takeBack, useSentLinks, type SentLink } from '@/lib/claims'
import { tokens } from '@/lib/format'
import { describeAccountError, readBalance, unlockStoredAccount } from '@/lib/send-mera'
import { useStoredAddress } from '@/lib/use-stored-address'

const AMOUNT_RE = /^\d+(\.\d{1,6})?$/

/**
 * Send money by link, to someone with no Henad account yet. The money waits in ClaimEscrow
 * until they open the link and pick an account, or until the sender takes it back. Henad pays
 * the network fee both ways.
 */
export function SendLinkView() {
  const address = useStoredAddress()
  const [symbol, setSymbol] = useState<'AUSD' | 'USDC'>('AUSD')
  const [amount, setAmount] = useState('')
  const [balance, setBalance] = useState<bigint | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [made, setMade] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!address) return
    let live = true
    readBalance(address, symbol).then(
      (b) => live && setBalance(b),
      () => live && setBalance(null),
    )
    return () => {
      live = false
    }
  }, [address, symbol, made])

  if (address === undefined) return <div className="flex-1" />
  if (address === null) {
    return (
      <div className="flex flex-1 flex-col gap-4 px-4 pb-6 pt-5">
        <StepHeader left="Send by link" right={null} />
        <Card className="flex flex-col gap-3 p-5">
          <p className="m-0 font-display text-[24px] leading-[1.1] tracking-[-.03em]">Sign in to send a link.</p>
          <p className="m-0 text-[14px] leading-[1.6] text-grey">The money comes from your account. Sign in on the send page, then come back.</p>
          <Button href="/send" size="lg" className="self-start">
            Sign in with passkey
          </Button>
        </Card>
      </div>
    )
  }

  const value = AMOUNT_RE.test(amount) ? parseUnits(amount, 6) : null
  const tooMuch = value !== null && balance !== null && value > balance
  const ready = value !== null && value > 0n && !tooMuch && !busy

  async function make() {
    if (!ready || value === null) return
    setBusy(true)
    setError(null)
    let account: Awaited<ReturnType<typeof unlockStoredAccount>> | null = null
    try {
      account = await unlockStoredAccount()
      setMade(await createLink(account.account, symbol, value))
      setAmount('')
    } catch (e) {
      setError(account ? (e instanceof Error ? e.message : 'The link could not be made. Try again.') : describeAccountError(e))
    } finally {
      account?.end()
      setBusy(false)
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked; the link is on screen to select by hand.
    }
  }

  const canShare = typeof navigator.share === 'function'
  return (
    <div className="flex flex-1 flex-col gap-3 px-4 pb-6 pt-5">
      <StepHeader left="Send by link" right={null} />

      {made ? (
        <Card className="flex flex-col gap-3 p-5">
          <div className="label text-muted">Your link is ready</div>
          <p className="m-0 break-all rounded-[4px] border border-border bg-surface-2 px-3 py-2 font-mono text-[12px] text-ink">{made}</p>
          <Notice tone="info">Anyone with this link can take the money, so send it only to them. You can take it back below until they do.</Notice>
          <div className="flex flex-wrap gap-2">
            {canShare && (
              <Button size="md" onClick={() => void navigator.share({ title: 'Money for you', text: 'I sent you money with Henad. Open this to get it:', url: made }).catch(() => {})}>
                Share link
              </Button>
            )}
            <Button variant="secondary" size="md" onClick={() => void copy(made)}>
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            <Button variant="secondary" size="md" onClick={() => setMade(null)}>
              Send another
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="flex flex-col gap-4 p-5">
          <p className="m-0 font-display text-[24px] leading-[1.1] tracking-[-.03em]">Pay someone who isn&rsquo;t on Henad yet.</p>
          <p className="m-0 text-[14px] leading-[1.6] text-grey pretty">
            You get a link to send them any way you like. They open it, tap once, and the money is theirs. If nobody claims it in {CLAIM_LINK_DAYS} days, it comes back to you.
          </p>
          <div className="flex gap-2">
            {(['AUSD', 'USDC'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSymbol(s)}
                className={`press rounded-[4px] border px-3 py-[6px] font-mono text-[12px] ${symbol === s ? 'border-purple text-ink' : 'border-border text-muted'}`}
              >
                {s}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-[6px]">
            <span className="label flex justify-between text-muted">
              <span>Amount</span>
              <span>{balance === null ? '' : `You have ${tokens(balance, 6, symbol, 2)}`}</span>
            </span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value.replace(',', '.'))
                setError(null)
              }}
              className="w-full rounded-[4px] border border-border bg-surface px-3 py-[9px] font-display text-[22px] text-ink placeholder:text-muted"
            />
          </label>
          {tooMuch && <Notice>That is more than you have.</Notice>}
          {error && <Notice>{error}</Notice>}
          <Button size="lg" variant={ready ? 'primary' : 'disabled'} onClick={() => void make()}>
            {busy ? 'Making your link…' : 'Make link'}
          </Button>
          <p className="m-0 text-[12px] leading-[1.5] text-muted">Henad pays the network fee. Your passkey signs once.</p>
        </Card>
      )}

      <SentLinks address={address} />
    </div>
  )
}

function SentLinks({ address }: { address: Address }) {
  const links = useSentLinks(address)
  if (links.length === 0) return null
  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="label text-muted">Links you&rsquo;ve sent</div>
      <div className="border-t border-dashed border-border" />
      {links.map((l) => (
        <SentRow key={l.claimSigner} link={l} />
      ))}
    </Card>
  )
}

function SentRow({ link }: { link: SentLink }) {
  const [state, setState] = useState<LinkState | 'error' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let live = true
    readLinkNow(link.claimSigner).then(
      (s) => live && setState(s),
      () => live && setState('error'),
    )
    return () => {
      live = false
    }
  }, [link.claimSigner, busy])

  async function back() {
    setBusy(true)
    setError(null)
    let account: Awaited<ReturnType<typeof unlockStoredAccount>> | null = null
    try {
      account = await unlockStoredAccount()
      await takeBack(account.account, link.claimSigner)
    } catch (e) {
      setError(account ? (e instanceof Error ? e.message : 'That did not go through. Try again.') : describeAccountError(e))
    } finally {
      account?.end()
      setBusy(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(claimLink(window.location.origin, link.key))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked.
    }
  }

  const status =
    state === null
      ? 'Checking…'
      : state === 'error'
        ? 'Could not check'
        : state.kind === 'open'
          ? 'Waiting to be claimed'
          : state.kind === 'expired'
            ? 'Expired, not claimed'
            : 'Claimed or taken back'
  const open = state !== null && state !== 'error' && (state.kind === 'open' || state.kind === 'expired')
  return (
    <div className="flex flex-col gap-1 py-1">
      <div className="flex items-center justify-between gap-3">
        <span className="flex flex-col">
          <span className="font-display text-[18px] tracking-[-.02em] tabular">{tokens(BigInt(link.amount), 6, link.symbol, 2)}</span>
          <span className="font-mono text-[11px] text-muted">
            {new Date(link.createdAt).toLocaleDateString()} · {status}
          </span>
        </span>
        {open && (
          <span className="flex gap-3">
            {state.kind === 'open' && (
              <button type="button" className="press label text-purple" onClick={() => void copy()}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
            <button type="button" className="press label text-ink disabled:text-muted" disabled={busy} onClick={() => void back()}>
              {busy ? 'Taking back…' : 'Take back'}
            </button>
          </span>
        )}
      </div>
      {error && <Notice>{error}</Notice>}
    </div>
  )
}
