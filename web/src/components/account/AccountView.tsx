'use client'

import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { Address } from 'viem'
import { Button } from '@/components/ui/Button'
import { Card, StepHeader } from '@/components/send/send-ui'
import { isLocalFork } from '@/lib/chain'
import { tokens } from '@/lib/format'
import { forgetStoredAccount, loadStoredAccount, readHoldings, type Holding } from '@/lib/send-mera'

/**
 * The account in this browser: address as text and QR, what it holds, sign out.
 *
 * Nothing here needs the passkey. The address was stored at sign-in and balances are public
 * chain reads, so the page never prompts. The QR holds the bare checksummed address, which is
 * what the Henad app's scanner and every wallet scanner read.
 */
export function AccountView({ network }: { network: string }) {
  const [address, setAddress] = useState<Address | null | undefined>(undefined)
  const [qr, setQr] = useState<string | null>(null)
  const [holdings, setHoldings] = useState<Holding[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setAddress(loadStoredAccount()?.address ?? null)
  }, [])

  const refresh = useCallback(async () => {
    if (!address) return
    setLoading(true)
    setHoldings(await readHoldings(address))
    setLoading(false)
  }, [address])

  useEffect(() => {
    if (!address) return
    void refresh()
    QRCode.toString(address, { type: 'svg', margin: 1, width: 224, color: { dark: '#0E091C', light: '#FFFFFF' } }).then(setQr, () => setQr(null))
  }, [address, refresh])

  async function copy() {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked; the address is selectable text right above.
    }
  }

  function signOut() {
    forgetStoredAccount()
    setAddress(null)
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
  return (
    <div className="flex flex-1 flex-col gap-3 px-4 pb-6 pt-5">
      <StepHeader left="Your account" right={network} />

      <Card className="flex flex-col items-center gap-4 p-5">
        {qr ? (
          // qrcode renders the SVG from the address alone, so there is no outside markup in it.
          <div aria-label="Address QR code" role="img" className="h-[224px] w-[224px]" dangerouslySetInnerHTML={{ __html: qr }} />
        ) : (
          <div className="h-[224px] w-[224px] rounded-[8px] bg-hairline" />
        )}
        <p className="m-0 break-all text-center font-mono text-[13px] leading-[1.5] tabular select-all">{address}</p>
        <p className="m-0 text-center text-[12px] leading-[1.5] text-grey">Anyone paying you on Monad can scan this. Send only Monad assets to it.</p>
        <Button variant="secondary" size="md" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy address'}
        </Button>
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
          <p className="m-0 text-[13px] text-grey">{loading ? 'Reading balances from the chain…' : 'Balances could not be read. Try again.'}</p>
        ) : held.length === 0 ? (
          <p className="m-0 text-[13px] text-grey">Nothing on this account yet.</p>
        ) : (
          held.map((h) => (
            <div key={h.symbol} className="flex items-baseline justify-between">
              <span className="font-mono text-[12px] text-grey">{h.symbol}</span>
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
        Signing out forgets the account in this browser. {isLocalFork() ? 'This is the local fork, not real funds.' : 'Your passkey still opens it, here or in the app.'}
      </p>
    </div>
  )
}
