'use client'

import { useEffect, useReducer, useRef } from 'react'
import { isAddress, toHex } from 'viem'
import { HENAD, MONAD_MAINNET_ID, hashIntent, type Intent } from '@henad/core'
import { Nav } from '@/components/Nav'
import { BuiltOnMonad } from '@/components/ui/Brand'
import { Button } from '@/components/ui/Button'
import { appChainId } from '@/lib/chain'
import { LIVE_CORRIDOR, corridorByKey } from '@/lib/corridors'
import { isFxMarketOpen } from '@/lib/market-hours'
import { continueWithPasskey, describeAccountError, readBalance, signInWithPasskey, sourceToken, type MeraAccount } from '@/lib/send-mera'
import { quoteMaths, type QuoteDto } from '@/lib/send-quote'
import { receiptFromDto, type ReceiptDto } from '@/lib/send-serial'
import { settle } from '@/lib/send-settle'
import { AmountStep } from './amount-step'
import { ClosedStep } from './closed-step'
import { AccountChip, MeraSignIn } from './mera-account'
import { QuoteStep, type LiveVenue } from './quote-step'
import { initialState, sendReducer, type SendInitial } from './send-reducer'
import { SentStep } from './sent-step'

const SOURCE_DECIMALS = 6
/** Intent validity. Sponsorship simulations need at least 10 minutes (docs/INTEGRATION-FACTS.md §14.4). */
const INTENT_TTL_S = 600

function explorerTx(chainId: number, hash: string): string {
  return chainId === MONAD_MAINNET_ID ? `https://monadscan.com/tx/${hash}` : `https://testnet.monadscan.com/tx/${hash}`
}

/**
 * The send flow: one reducer, four screens, the FX-closed state derived from
 * the clock. The Nav lives here rather than in the server shell because its
 * address chip shows reducer state and there is no global store to read it from.
 */
export function SendFlow({ initial }: { initial: SendInitial }) {
  const [s, dispatch] = useReducer(sendReducer, initial, initialState)
  const session = useRef<MeraAccount | null>(null)
  const chainId = appChainId()
  const deployment = HENAD[chainId] ?? null

  useEffect(() => {
    const id = window.setInterval(() => dispatch({ type: 'tick', now: Date.now() }), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(
    () => () => {
      session.current?.end()
      session.current = null
    },
    [],
  )

  const address = s.account?.address
  useEffect(() => {
    if (!address) return
    let live = true
    readBalance(address, s.sourceAsset).then(
      (b) => {
        if (live) dispatch({ type: 'balance', value: b })
      },
      () => {
        if (live) dispatch({ type: 'balance', value: null })
      },
    )
    return () => {
      live = false
    }
  }, [address, s.sourceAsset])

  const corridor = corridorByKey(s.corridorKey) ?? LIVE_CORRIDOR
  const rate = s.rates.find((r) => r.key === corridor.key)
  const closed = s.forceClosed || (corridor.tier === 'live' && (!isFxMarketOpen(Math.floor(s.now / 1000)) || rate?.marketClosed === true))
  const venue: LiveVenue | null =
    corridor.tier === 'live' && corridor.targetAsset && corridor.feed && corridor.venue
      ? {
          targetDecimals: corridor.targetAsset.decimals,
          targetAddress: corridor.targetAsset.address,
          feedLabel: corridor.feed.label,
          feedRef: corridor.feed.ref,
          venueLabel: corridor.venue.label,
        }
      : null

  async function withAccount(run: () => Promise<MeraAccount>) {
    dispatch({ type: 'busy', busy: 'account' })
    try {
      const acc = await run()
      session.current?.end()
      session.current = acc
      dispatch({ type: 'signedIn', address: acc.address, credentialId: acc.credentialId })
    } catch (e) {
      dispatch({ type: 'fail', message: describeAccountError(e) })
    }
  }

  async function paste() {
    try {
      dispatch({ type: 'recipient', value: await navigator.clipboard.readText() })
    } catch {
      dispatch({ type: 'fail', message: 'Could not read the clipboard. Paste the address into the field instead.' })
    }
  }

  function chooseCorridor(key: string) {
    dispatch({ type: 'corridor', key })
    const c = corridorByKey(key)
    if (!c) return
    const url = new URL(window.location.href)
    url.searchParams.set('to', c.target)
    window.history.replaceState(null, '', url)
  }

  async function getQuote() {
    if (!venue) return
    dispatch({ type: 'busy', busy: 'quote' })
    try {
      const params = new URLSearchParams({ source: s.sourceAsset, target: corridor.target, amount: s.amount })
      const res = await fetch(`/api/quote?${params}`, { cache: 'no-store' })
      const body = (await res.json()) as QuoteDto | { error: string }
      if (!res.ok || 'error' in body) throw new Error('error' in body ? body.error : `The quote failed (${res.status}). Try again.`)
      dispatch({ type: 'quoted', quote: body })
    } catch (e) {
      dispatch({ type: 'fail', message: e instanceof Error ? e.message : 'The quote failed. Try again.' })
    }
  }

  async function sendPayout() {
    const acc = session.current
    const quote = s.quote
    if (!acc || !quote || !venue || !deployment || !isAddress(s.recipient)) return
    const m = quoteMaths(quote, SOURCE_DECIMALS, venue.targetDecimals)
    const intent: Intent = {
      payer: acc.address,
      recipient: s.recipient,
      sourceAsset: sourceToken(s.sourceAsset).address,
      targetAsset: venue.targetAddress,
      sourceAmount: m.sourceAmount,
      quotedAmountOut: m.delivered,
      // One stepper drives both guards: the fill may not sit below the quote by more than the spread cap either.
      toleranceBps: s.maxSpreadBps,
      maxSpreadBps: s.maxSpreadBps,
      deadline: BigInt(Math.floor(s.now / 1000) + INTENT_TTL_S),
      salt: toHex(crypto.getRandomValues(new Uint8Array(32))),
    }
    const intentId = hashIntent(intent, chainId, deployment.corridorRouter)
    dispatch({ type: 'busy', busy: 'send' })
    let settled
    try {
      settled = await settle(intent, acc.account)
      if (settled.intentId.toLowerCase() !== intentId.toLowerCase()) throw new Error('The transport settled a different intent from the one you approved.')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Settlement failed.'
      dispatch({ type: 'fail', message: msg.startsWith('not wired') ? 'Settlement is not wired to Monad yet. Nothing moved.' : `${msg} Nothing moved.` })
      return
    }
    try {
      const res = await fetch(`/api/receipt/${settled.intentId}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`receipt ${res.status}`)
      dispatch({ type: 'sent', receipt: (await res.json()) as ReceiptDto, txHash: settled.txHash })
    } catch {
      dispatch({ type: 'fail', message: 'The payout settled but its receipt could not be read yet. Open Receipts to find it.' })
    }
  }

  async function share() {
    if (!s.receipt) return
    const url = `${window.location.origin}/receipt/${s.receipt.intentId}`
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'Henad receipt', url })
        return
      }
      await navigator.clipboard.writeText(url)
      dispatch({ type: 'notice', message: 'Link copied.' })
      window.setTimeout(() => dispatch({ type: 'notice', message: null }), 2500)
    } catch {
      // The share sheet was dismissed; nothing to report.
    }
  }

  const receipt = s.receipt ? receiptFromDto(s.receipt) : null
  let view
  if (s.step === 'sent' && receipt) {
    view = (
      <SentStep
        receipt={receipt}
        explorerTx={s.txHash ? explorerTx(chainId, s.txHash) : null}
        maxSpreadBps={receipt.sample ? null : s.maxSpreadBps}
        notice={s.notice}
        onShare={share}
      />
    )
  } else if (closed) {
    view = (
      <ClosedStep
        corridor={corridor}
        now={s.now}
        latestReceipt={s.latestReceipt ? receiptFromDto(s.latestReceipt) : null}
        amount={s.amount}
        sourceAsset={s.sourceAsset}
      />
    )
  } else if (!s.account) {
    view = (
      <MeraSignIn
        chainId={chainId}
        busy={s.busy === 'account'}
        error={s.error}
        onContinue={() => withAccount(continueWithPasskey)}
        onSignIn={() => withAccount(() => signInWithPasskey())}
      />
    )
  } else if (s.step === 'quote' && s.quote && venue) {
    view = (
      <QuoteStep
        quote={s.quote}
        corridor={corridor}
        venue={venue}
        sourceAsset={s.sourceAsset}
        recipientName={s.recipientName}
        maxSpreadBps={s.maxSpreadBps}
        now={s.now}
        busy={s.busy === 'send'}
        error={s.error}
        deployed={deployment !== null}
        onSpread={(delta) => dispatch({ type: 'spread', delta })}
        onSend={sendPayout}
        onRequote={() => dispatch({ type: 'requote' })}
        onBack={() => dispatch({ type: 'requote' })}
      />
    )
  } else {
    view = (
      <AmountStep
        corridor={corridor}
        rate={rate}
        now={s.now}
        sourceAsset={s.sourceAsset}
        amount={s.amount}
        balance={s.balance}
        recipient={s.recipient}
        recipientName={s.recipientName}
        editingRecipient={s.editingRecipient}
        busy={s.busy === 'quote'}
        error={s.error}
        onAmount={(value) => dispatch({ type: 'amount', value })}
        onAsset={(value) => dispatch({ type: 'asset', value })}
        onCorridor={chooseCorridor}
        onRecipient={(value) => dispatch({ type: 'recipient', value })}
        onRecipientName={(value) => dispatch({ type: 'recipientName', value })}
        onEditRecipient={(editing) => dispatch({ type: 'editRecipient', editing })}
        onPaste={paste}
        onQuote={getQuote}
      />
    )
  }

  const chip = s.account ? <AccountChip address={s.account.address} /> : null
  return (
    <div className="flex min-h-dvh flex-col">
      <Nav
        right={
          chip ?? (
            <Button href="/rates" variant="secondary" size="md">
              View rates
            </Button>
          )
        }
        mobileRight={chip ?? <BuiltOnMonad height={11} />}
      />
      <main className="dotgrid flex flex-1 flex-col md:items-center md:px-6 md:py-12">
        <section aria-label="Send a payout" className="flex w-full flex-1 flex-col bg-canvas md:w-[420px] md:min-h-[728px] md:flex-none md:border md:border-hairline">
          {view}
        </section>
      </main>
    </div>
  )
}
