'use client'

import { useEffect, useReducer } from 'react'
import { toHex } from 'viem'
import { MONAD_MAINNET_ID, describeTxFailure, findContact, hashIntent, notePayment, saveContact, type Intent } from '@henad/core'
import { Nav } from '@/components/Nav'
import { AccountChip } from '@/components/NavAccount'
import { BuiltOnMonad } from '@/components/ui/Brand'
import { Button } from '@/components/ui/Button'
import { appChainId } from '@/lib/chain'
import { loadContacts, storeContacts, useContacts } from '@/lib/contacts'
import { LIVE_CORRIDOR, corridorByKey } from '@henad/core'
import { isFxMarketOpen } from '@henad/core'
import {
  PASSKEY_STORAGE_KEY,
  continueWithPasskey,
  describeAccountError,
  loadStoredAccount,
  readBalance,
  signInWithPasskey,
  sourceToken,
  unlockStoredAccount,
  type MeraAccount,
} from '@/lib/send-mera'
import { deploymentAddresses } from '@/lib/receipts'
import { ACCOUNT_EVENT } from '@/lib/use-stored-address'
import { quoteMaths, type QuoteDto } from '@henad/core'
import { receiptFromDto, type ReceiptDto } from '@/lib/send-serial'
import { settle } from '@/lib/settle'
import { AmountStep } from './amount-step'
import { ClosedStep } from './closed-step'
import { MeraSignIn } from './mera-account'
import { QuoteStep, type LiveVenue } from './quote-step'
import { SaveContact, describeRecipient } from './recipient'
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
  const chainId = appChainId()
  const deployment = deploymentAddresses()

  useEffect(() => {
    const id = window.setInterval(() => dispatch({ type: 'tick', now: Date.now() }), 1000)
    return () => window.clearInterval(id)
  }, [])

  // No signing key is kept between actions. The stored address puts the chip and the
  // balance back on load; the passkey is asked for each time something must be signed.
  useEffect(() => {
    const stored = loadStoredAccount()
    if (stored) dispatch({ type: 'signedIn', address: stored.address, credentialId: stored.credentialId })
  }, [])

  // Signing out on /account, or in another tab, forgets the account; this screen follows, and
  // takes the recipient with it. Contacts stay in storage under the account they belong to.
  useEffect(() => {
    const onChange = (e: Event) => {
      // Other tabs' storage writes include contacts and names; only the account matters here.
      if (e instanceof StorageEvent && e.key !== null && e.key !== PASSKEY_STORAGE_KEY) return
      dispatch({ type: 'storedAccount', account: loadStoredAccount() })
    }
    window.addEventListener('storage', onChange)
    window.addEventListener(ACCOUNT_EVENT, onChange)
    return () => {
      window.removeEventListener('storage', onChange)
      window.removeEventListener(ACCOUNT_EVENT, onChange)
    }
  }, [])

  const address = s.account?.address
  const contacts = useContacts(address)
  const contact = findContact(contacts, s.recipient)
  const recipient = s.recipient ? describeRecipient(s.recipient, contacts, s.recipientNad, s.recipientName) : null
  // Money arrives from outside this tab: a swap, a payout from a phone, someone paying you.
  // Reading once per step meant a full page reload to see it, so this keeps reading while
  // the page is open and again the moment the tab is looked at.
  useEffect(() => {
    if (!address) return
    let live = true
    const read = () =>
      readBalance(address, s.sourceAsset).then(
        (b) => {
          if (live) dispatch({ type: 'balance', value: b })
        },
        () => {
          if (live) dispatch({ type: 'balance', value: null })
        },
      )
    void read()
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
  }, [address, s.sourceAsset, s.step])

  const corridor = corridorByKey(s.corridorKey) ?? LIVE_CORRIDOR
  const rate = s.rates.find((r) => r.key === corridor.key)
  const closed = s.forceClosed || (corridor.tier === 'live' && (!isFxMarketOpen(Math.floor(s.now / 1000)) || rate?.marketClosed === true))
  // Mento is mainnet-only: its router, USDm and every fiat stable have no code on
  // chain 10143, and neither does any Chainlink fiat feed (verified 11 Sep, §14.7).
  // The corridor registry names mainnet addresses whatever chain the app is pointed
  // at, so without this the flow would build an intent that pays a mainnet token out
  // of a testnet one and could never settle anywhere. A local fork counts as mainnet
  // here, and correctly: it is a copy of it, with the real pools.
  const settleable = chainId === MONAD_MAINNET_ID
  const venue: LiveVenue | null =
    settleable && corridor.tier === 'live' && corridor.targetAsset && corridor.feed && corridor.venue
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
      // Signing in only needs the address. The key is dropped here; each payout asks again.
      acc.end()
      dispatch({ type: 'signedIn', address: acc.address, credentialId: acc.credentialId })
    } catch (e) {
      dispatch({ type: 'fail', message: describeAccountError(e) })
    }
  }

  async function paste() {
    try {
      dispatch({ type: 'recipientInput', value: await navigator.clipboard.readText() })
    } catch {
      dispatch({ type: 'fail', message: 'Could not read the clipboard. Paste their link into the field instead.' })
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
      console.error('[quote]', e)
      dispatch({ type: 'fail', message: describeTxFailure(e).message })
    }
  }

  async function sendPayout() {
    const quote = s.quote
    const to = s.recipient
    if (!quote || !venue || !deployment || !to) return
    dispatch({ type: 'busy', busy: 'send' })
    // Every payout asks for the passkey. A key held in the tab after the first payout let
    // the next one go out with a single click from anyone at the open page, and the
    // approval would not be tied to the payout it authorises.
    let acc: MeraAccount
    try {
      acc = await unlockStoredAccount()
    } catch (e) {
      dispatch({ type: 'fail', message: describeAccountError(e) })
      return
    }
    const m = quoteMaths(quote, SOURCE_DECIMALS, venue.targetDecimals)
    const intent: Intent = {
      payer: acc.address,
      recipient: to,
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
    let settled
    try {
      settled = await settle(intent, acc.account, { chainId, router: deployment.corridorRouter })
      if (settled.intentId.toLowerCase() !== intentId.toLowerCase()) throw new Error('The transport settled a different intent from the one you approved.')
    } catch (e) {
      console.error('[settle]', e)
      dispatch({ type: 'fail', message: `${describeTxFailure(e).message} Nothing moved.` })
      return
    } finally {
      acc.end()
    }
    // Only now, with the payout settled: a contact's place in the list is who you actually paid.
    // Read fresh rather than from this render, which may be a tab's worth of edits behind.
    const list = loadContacts(acc.address)
    if (findContact(list, to)) storeContacts(acc.address, notePayment(list, to, Math.floor(Date.now() / 1000)))
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
      flash('Link copied.')
    } catch {
      // The share sheet was dismissed; nothing to report.
    }
  }

  function flash(message: string) {
    dispatch({ type: 'notice', message })
    window.setTimeout(() => dispatch({ type: 'notice', message: null }), 2500)
  }

  /** Saving is also the payout's first entry in the contact's history, so the list opens on them. */
  function saveRecipient(name: string, paidAt: number) {
    if (!address || !s.recipient) return
    const list = notePayment(saveContact(loadContacts(address), s.recipient, name), s.recipient, paidAt)
    // saveContact returns the list unchanged for a name with nothing left after cleaning, and
    // "Saved" then would promise a contact that the next payout does not find.
    if (!findContact(list, s.recipient)) {
      flash('That name has nothing in it to save. Type their name.')
      return
    }
    flash(storeContacts(address, list) ? 'Saved to your contacts.' : 'This browser would not keep the contact. Storage may be blocked.')
  }

  const receipt = s.receipt ? receiptFromDto(s.receipt) : null
  // Offered for a real payout to an account that is not a contact yet, and only to its payer.
  const offerSave = receipt && !receipt.sample && recipient && !contact && address && receipt.recipient.toLowerCase() === recipient.address.toLowerCase()
  let view
  if (s.step === 'sent' && receipt) {
    view = (
      <SentStep
        receipt={receipt}
        explorerTx={s.txHash ? explorerTx(chainId, s.txHash) : null}
        maxSpreadBps={receipt.sample ? null : s.maxSpreadBps}
        notice={s.notice}
        contactOffer={
          offerSave ? (
            <SaveContact
              key={recipient.address}
              prefill={recipient.source === 'account' ? '' : recipient.label}
              onSave={(name) => saveRecipient(name, receipt.settledAt)}
            />
          ) : null
        }
        onShare={share}
        onAgain={() => dispatch({ type: 'again' })}
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
        busy={s.busy === 'account'}
        error={s.error}
        onContinue={() => withAccount(continueWithPasskey)}
        onSignIn={() => withAccount(() => signInWithPasskey())}
      />
    )
  } else if (s.step === 'quote' && s.quote && venue && recipient) {
    view = (
      <QuoteStep
        quote={s.quote}
        corridor={corridor}
        venue={venue}
        sourceAsset={s.sourceAsset}
        recipient={recipient}
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
        recipient={recipient}
        recipientInput={s.recipientInput}
        editingRecipient={s.editingRecipient}
        contacts={contacts}
        busy={s.busy === 'quote'}
        error={s.error}
        onAmount={(value) => dispatch({ type: 'amount', value })}
        onAsset={(value) => dispatch({ type: 'asset', value })}
        onCorridor={chooseCorridor}
        onRecipientInput={(value) => dispatch({ type: 'recipientInput', value })}
        onChooseRecipient={(choice) => dispatch({ type: 'chooseRecipient', ...choice })}
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
