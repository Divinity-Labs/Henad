'use client'

import { useEffect, useState } from 'react'
import { privateKeyToAccount } from 'viem/accounts'
import type { Hex } from 'viem'
import { claimKeyFromFragment, handleOf, type LinkState } from '@henad/core'
import { Button } from '@/components/ui/Button'
import { Card, Notice, StepHeader } from '@/components/send/send-ui'
import { appChain } from '@/lib/chain'
import { claimTo, readLinkNow } from '@/lib/claims'
import { tokens } from '@/lib/format'
import { continueWithPasskey, describeAccountError } from '@/lib/send-mera'
import { ACCOUNT_EVENT, useStoredAddress } from '@/lib/use-stored-address'

type View = { key: Hex; state: LinkState; sender: string | null } | 'bad' | 'error' | null

/**
 * Opening a claim link. The key sits in the fragment, which never reaches a server; this page
 * reads it, shows what the link holds and who sent it, and pays it to the account in this
 * browser, making one with a passkey first if there is none.
 */
export function ClaimView() {
  const address = useStoredAddress()
  const [view, setView] = useState<View>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [claimed, setClaimed] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    async function open(): Promise<View> {
      const key = claimKeyFromFragment(window.location.hash)
      if (!key) return 'bad'
      const state = await readLinkNow(privateKeyToAccount(key).address)
      // The sender's Henad name is read from the chain, so unlike a name in a pay link it is not their own claim.
      const from = state.kind === 'open' || state.kind === 'expired' ? state.from : null
      const name = from ? await handleOf(appChain(), from).catch(() => null) : null
      return { key, state, sender: name ? `@${name}` : null }
    }
    open().then(
      (v) => live && setView(v),
      () => live && setView('error'),
    )
    return () => {
      live = false
    }
  }, [])

  async function claim() {
    if (!view || typeof view === 'string' || view.state.kind !== 'open') return
    setBusy(true)
    setError(null)
    let to = address ?? null
    try {
      if (!to) {
        try {
          const acc = await continueWithPasskey()
          to = acc.address
          acc.end()
          window.dispatchEvent(new Event(ACCOUNT_EVENT))
        } catch (e) {
          setError(describeAccountError(e))
          return
        }
      }
      await claimTo(view.key, to)
      setClaimed(tokens(view.state.amount, view.state.decimals, view.state.symbol, 2))
      // Spent: drop the key from the address bar so a reload or a screenshot does not carry it.
      window.history.replaceState(null, '', '/claim')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }

  let body
  if (claimed) {
    body = (
      <Card className="flex flex-col gap-3 p-5">
        <p className="m-0 font-display text-[28px] leading-[1.1] tracking-[-.03em]">{claimed} is yours.</p>
        <p className="m-0 text-[14px] leading-[1.6] text-grey">It is in your Henad account now. Your passkey opens it, here or in the app.</p>
        <div className="flex flex-wrap gap-2">
          <Button href="/account" size="lg">
            See your account
          </Button>
          <Button href="/send" variant="secondary" size="lg">
            Send money
          </Button>
        </div>
      </Card>
    )
  } else if (view === null) {
    body = <p className="m-0 font-mono text-[11px] text-muted">Opening your link…</p>
  } else if (view === 'bad') {
    body = <Message title="This link is not complete." text="Part of it may have been cut off. Ask the sender to send it again." />
  } else if (view === 'error') {
    body = <Message title="We could not open this link just now." text="Check your connection and reload the page." />
  } else if (view.state.kind === 'done') {
    body = <Message title="This link has already been used." text="The money was claimed, or the sender took it back." />
  } else if (view.state.kind === 'none' || view.state.kind === 'foreign') {
    body = <Message title="There is no money behind this link." text="Ask the sender to check it and send it again." />
  } else if (view.state.kind === 'expired') {
    body = <Message title="This link has expired." text="Nobody claimed it in time, so the money goes back to the sender. Ask them to send a new one." />
  } else {
    const s = view.state
    body = (
      <Card className="flex flex-col gap-4 p-5">
        <div className="label text-muted">{view.sender ? `From ${view.sender}` : 'Someone sent you money'}</div>
        <p className="m-0 font-display text-[40px] leading-none tracking-[-.03em] tabular">{tokens(s.amount, s.decimals, s.symbol, 2)}</p>
        <p className="m-0 text-[14px] leading-[1.6] text-grey pretty">
          {address
            ? 'It goes straight into your Henad account. Nothing to pay.'
            : 'Make a Henad account with your fingerprint or face, and it goes straight in. Nothing to pay, nothing to install.'}
        </p>
        {error && <Notice>{error}</Notice>}
        <Button size="lg" variant={busy ? 'disabled' : 'primary'} onClick={() => void claim()}>
          {busy ? 'Claiming…' : address ? 'Claim it' : 'Claim with passkey'}
        </Button>
        <p className="m-0 text-[12px] leading-[1.5] text-muted">
          Open until {new Date(Number(s.expiry) * 1000).toLocaleDateString()}. After that it goes back to the sender.
        </p>
      </Card>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-3 px-4 pb-6 pt-5">
      <StepHeader left="Money for you" right={null} />
      {body}
    </div>
  )
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <p className="m-0 font-display text-[24px] leading-[1.1] tracking-[-.03em]">{title}</p>
      <p className="m-0 text-[14px] leading-[1.6] text-grey">{text}</p>
      <Button href="/" variant="secondary" size="md" className="self-start">
        What is Henad?
      </Button>
    </Card>
  )
}
