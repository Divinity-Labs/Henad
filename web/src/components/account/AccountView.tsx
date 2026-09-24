'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { cleanName, payLink } from '@henad/core'
import { AccountNumber } from '@/components/AccountNumber'
import { Button } from '@/components/ui/Button'
import { Card, StepHeader } from '@/components/send/send-ui'
import { TokenIcon } from '@/components/ui/TokenIcon'
import { isLocalFork } from '@/lib/chain'
import { storeMyName, useMyName } from '@/lib/contacts'
import { tokens } from '@/lib/format'
import { forgetStoredAccount, readHoldings, type Holding } from '@/lib/send-mera'
import { useStoredAddress } from '@/lib/use-stored-address'

/**
 * The account in this browser: how to get paid, what it holds, sign out.
 *
 * Nothing here needs the passkey. The address was stored at sign-in and balances are public
 * chain reads, so the page never prompts. Getting paid is a link, not an address: the QR and
 * the share sheet both carry the pay link, which a phone camera opens straight into a payment
 * to this account. The account number itself sits folded away for the one case that needs it,
 * someone sending from an exchange or another wallet.
 */
export function AccountView({ network }: { network: string | null }) {
  const address = useStoredAddress()
  const storedName = useMyName(address)
  // The field edits a local copy and writes it through, so it still takes typing, and the link
  // still carries the name for this visit, when this browser refuses to store it. The copy
  // follows the stored name whenever that moves on its own: hydration, another tab, another account.
  const [myName, setMyName] = useState(storedName)
  const [following, setFollowing] = useState(`${address}:${storedName}`)
  if (following !== `${address}:${storedName}`) {
    setFollowing(`${address}:${storedName}`)
    setMyName(storedName)
  }
  const [qr, setQr] = useState<string | null>(null)
  const [holdings, setHoldings] = useState<Holding[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const link = address ? payLink(address, myName) : null

  /** A failed read keeps the last good balances rather than blanking them. */
  function apply(next: Holding[] | null) {
    setHoldings((prev) => next ?? prev)
    setFailed(next === null)
  }

  /** The Refresh button: the same read, with the button showing it is working. */
  async function refresh() {
    if (!address) return
    setLoading(true)
    apply(await readHoldings(address))
    setLoading(false)
  }

  useEffect(() => {
    if (!address) return
    let live = true
    const read = () =>
      readHoldings(address).then((next) => {
        if (!live) return
        setHoldings((prev) => next ?? prev)
        setFailed(next === null)
      })
    void read()
    // Balances change when a payout lands, including one sent from the phone, so keep reading
    // while the page is open and read again the moment the tab comes back into view.
    const id = window.setInterval(() => void read(), 15_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void read()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      live = false
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [address])

  // Redrawn as the name is typed, because the name rides in the link the code carries.
  useEffect(() => {
    if (!link) return
    let live = true
    QRCode.toString(link, { type: 'svg', margin: 1, width: 224, color: { dark: '#0E091C', light: '#FFFFFF' } }).then(
      (svg) => live && setQr(svg),
      () => live && setQr(null),
    )
    return () => {
      live = false
    }
  }, [link])

  async function copyLink() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked; Share, where the browser has it, still works.
    }
  }

  async function share() {
    if (!link) return
    const name = cleanName(myName)
    try {
      await navigator.share({ title: name ? `Pay ${name}` : 'Pay me with Henad', text: 'Pay me with Henad:', url: link })
    } catch {
      // The share sheet was dismissed; nothing to report.
    }
  }

  function signOut() {
    // useStoredAddress hears the sign-out and re-renders this page as signed out. Contacts are
    // stored per account, so they are left where they are for the next time it signs in here.
    forgetStoredAccount()
    setHoldings(null)
  }

  if (address === undefined) return <div className="flex-1" />

  if (address === null) {
    return (
      <div className="flex flex-1 flex-col gap-4 px-4 pb-6 pt-5">
        <StepHeader left="Account" right={network} />
        <Card className="flex flex-col gap-3 p-5">
          <p className="m-0 font-display text-[24px] leading-[1.1] tracking-[-.03em]">Not signed in on this browser.</p>
          <p className="m-0 text-[14px] leading-[1.6] text-grey">Your passkey opens the account. Sign in on the send page and it shows up here.</p>
          <Button href="/send" size="lg" className="self-start">
            Sign in with passkey
          </Button>
        </Card>
      </div>
    )
  }

  const held = holdings?.filter((h) => h.value > 0n) ?? []
  // Only read once the account is known, which is after hydration, so the server never asks.
  const canShare = typeof navigator.share === 'function'
  return (
    <div className="flex flex-1 flex-col gap-3 px-4 pb-6 pt-5">
      <StepHeader left="Your account" right={network} />

      <Card className="flex flex-col gap-4 p-5">
        <div className="label text-muted">Get paid</div>
        <label className="flex flex-col gap-[6px]">
          <span className="label text-muted">Your name · shown on your link</span>
          <input
            type="text"
            autoComplete="name"
            placeholder="Your name"
            maxLength={40}
            value={myName}
            onChange={(e) => {
              setMyName(e.target.value)
              storeMyName(address, e.target.value)
            }}
            className="w-full rounded-[4px] border border-border bg-surface px-3 py-[9px] text-[15px] text-ink placeholder:text-muted"
          />
        </label>
        <div className="flex flex-col items-center gap-3">
          {qr ? (
            // qrcode renders the SVG from the link alone, so there is no outside markup in it.
            <div aria-label="QR code for your pay link" role="img" className="h-[224px] w-[224px]" dangerouslySetInnerHTML={{ __html: qr }} />
          ) : (
            <div className="h-[224px] w-[224px] rounded-[8px] bg-hairline" />
          )}
          <p className="m-0 text-center text-[12px] leading-[1.5] text-grey pretty">
            Anyone can scan this with their phone camera to pay you, or you can send them the link.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {canShare && (
            <Button size="md" onClick={() => void share()}>
              Share link
            </Button>
          )}
          <Button variant="secondary" size="md" onClick={() => void copyLink()}>
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        </div>
        <AccountNumber
          address={address}
          summary="Account number"
          note="For people sending from an exchange or another wallet. Choose the Monad network when you send."
          className="border-t border-hairline-2 pt-3"
        />
      </Card>

      <Card className="flex flex-col gap-2 p-4">
        <div className="label flex items-center justify-between text-muted">
          <span>Holdings</span>
          <button type="button" className="label text-purple disabled:text-muted" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Reading…' : 'Refresh'}
          </button>
        </div>
        <div className="border-t border-dashed border-border" />
        {holdings === null ? (
          <p className="m-0 text-[13px] text-grey">{failed && !loading ? 'Balances could not be read. Try again.' : 'Reading your balances…'}</p>
        ) : held.length === 0 ? (
          <p className="m-0 text-[13px] text-grey">Nothing on this account yet.</p>
        ) : (
          held.map((h) => (
            <div key={h.symbol} className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-mono text-[12px] text-grey">
                <TokenIcon symbol={h.symbol} size={22} />
                {h.symbol}
              </span>
              <span className="font-display text-[22px] tracking-[-.02em] tabular">{tokens(h.value, h.decimals, h.symbol, 2)}</span>
            </div>
          ))
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button href="/send" size="lg">
          Send a payout
        </Button>
        <Button href="/receipts" variant="secondary" size="lg">
          Receipts
        </Button>
        <Button variant="secondary" size="lg" onClick={signOut}>
          Sign out
        </Button>
      </div>
      <p className="m-0 text-[12px] leading-[1.5] text-muted">
        Signing out forgets the account in this browser; your contacts wait here for it. {isLocalFork() ? 'This is the local fork, not real funds.' : 'Your passkey still opens it, here or in the app.'}
      </p>
    </div>
  )
}
