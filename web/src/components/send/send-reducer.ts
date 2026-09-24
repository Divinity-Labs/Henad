import type { Address, Hex } from 'viem'
import type { SourceAssetSymbol } from '@henad/core'
import { MAX_SPREAD_DEFAULT, MAX_SPREAD_MAX, MAX_SPREAD_MIN, corridorByKey, corridorsFor, settleableFrom, type QuoteDto } from '@henad/core'
import type { RateDto, ReceiptDto } from '@/lib/send-serial'

/**
 * The whole send flow is one reducer: sign-in, amount, quote, sent. The FX
 * market state is derived at render time from `now`, not stored, so a market
 * that closes while the page is open flips the screen on the next tick.
 */
export type Step = 'signin' | 'amount' | 'quote' | 'sent'
export type Busy = 'account' | 'quote' | 'send' | null

/** What the server page hands the client. */
export interface SendInitial {
  /** server clock, unix ms; the client ticks on from here so hydration matches */
  now: number
  corridorKey: string
  rates: RateDto[]
  /** newest settlement in this corridor, for the closed state's "last settled" rows */
  latestReceipt: ReceiptDto | null
  /** ?demo=receipt renders S3 with the fixture; ?demo=closed forces S5 */
  demo: 'receipt' | 'closed' | null
  sampleReceipt: ReceiptDto | null
  /** The account a pay link was opened for (/pay/[address]); absent on /send. */
  recipient?: Address
  /** The name that link carries, already through `cleanName`. A claim, never a fact. */
  recipientName?: string | null
  /** Where `recipient` came from. Only a pay link hands one over today. */
  recipientSource?: 'link'
}

export interface SendState {
  step: Step
  now: number
  corridorKey: string
  rates: RateDto[]
  latestReceipt: ReceiptDto | null
  forceClosed: boolean
  sourceAsset: SourceAssetSymbol
  /** raw text of the amount field, sanitised to d+(.dd)? */
  amount: string
  /** raw text of the recipient field: a Henad link, a .nad name or an account number */
  recipientInput: string
  /** the account being paid, once chosen */
  recipient: Address | null
  /**
   * The name the recipient's pay link carried, if they were chosen from one. Unverified:
   * anyone can type ?n=Mum, so it is shown as coming from the link until the payer saves a
   * contact of their own.
   */
  recipientName: string | null
  /** the .nad name the payer typed, if they chose the recipient by one */
  recipientNad: string | null
  editingRecipient: boolean
  account: { address: Address; credentialId: string } | null
  /** source-asset balance on the app chain; null while unread */
  balance: bigint | null
  busy: Busy
  error: string | null
  quote: QuoteDto | null
  maxSpreadBps: number
  receipt: ReceiptDto | null
  txHash: Hex | null
  /** transient confirmation line, e.g. "Link copied." */
  notice: string | null
}

export type SendAction =
  | { type: 'tick'; now: number }
  | { type: 'amount'; value: string }
  | { type: 'asset'; value: SourceAssetSymbol }
  | { type: 'corridor'; key: string }
  | { type: 'recipientInput'; value: string }
  | { type: 'chooseRecipient'; address: Address; linkName: string | null; nadName: string | null }
  | { type: 'editRecipient'; editing: boolean }
  | { type: 'busy'; busy: Exclude<Busy, null> }
  | { type: 'fail'; message: string }
  | { type: 'signedIn'; address: Address; credentialId: string }
  /** The stored account as it now stands, after a sign-out or sign-in here or in another tab. */
  | { type: 'storedAccount'; account: { address: Address; credentialId: string } | null }
  | { type: 'balance'; value: bigint | null }
  | { type: 'quoted'; quote: QuoteDto }
  | { type: 'requote' }
  | { type: 'spread'; delta: number }
  | { type: 'sent'; receipt: ReceiptDto; txHash: Hex | null }
  | { type: 'notice'; message: string | null }
  /** After a payout: back to the amount screen for another, keeping the recipient. */
  | { type: 'again' }

/** Digits, one dot, two decimals, nine integer digits. Accepts a comma as the dot. */
export function sanitizeAmount(raw: string): string {
  const cleaned = raw.replace(',', '.').replace(/[^\d.]/g, '')
  const dot = cleaned.indexOf('.')
  const int = (dot === -1 ? cleaned : cleaned.slice(0, dot)).slice(0, 9)
  if (dot === -1) return int
  const frac = cleaned
    .slice(dot + 1)
    .replace(/\./g, '')
    .slice(0, 2)
  return `${int}.${frac}`
}

/** Nobody chosen: what a new payout, a sign-out or a switch of account starts from. */
const NO_RECIPIENT = { recipientInput: '', recipient: null, recipientName: null, recipientNad: null, editingRecipient: true } as const

/**
 * No payout in hand. A quote or a receipt belongs to the account that asked for it: left behind
 * after a sign-out or a switch, the next recipient chosen would jump straight to the old quote,
 * priced for another amount and maybe another pair, and send it.
 */
const NO_PAYOUT = { quote: null, receipt: null, txHash: null, notice: null } as const

export function initialState(i: SendInitial): SendState {
  const demoReceipt = i.demo === 'receipt' ? i.sampleReceipt : null
  const fromLink = i.recipientSource === 'link' && i.recipient ? i.recipient : null
  return {
    step: demoReceipt ? 'sent' : 'signin',
    now: i.now,
    corridorKey: i.corridorKey,
    rates: i.rates,
    latestReceipt: i.latestReceipt,
    forceClosed: i.demo === 'closed',
    sourceAsset: 'AUSD',
    amount: '',
    ...NO_RECIPIENT,
    ...(fromLink ? { recipient: fromLink, recipientName: i.recipientName ?? null, editingRecipient: false } : {}),
    account: null,
    balance: null,
    busy: null,
    error: null,
    quote: null,
    maxSpreadBps: MAX_SPREAD_DEFAULT,
    receipt: demoReceipt,
    txHash: null,
    notice: null,
  }
}

export function sendReducer(s: SendState, a: SendAction): SendState {
  switch (a.type) {
    case 'tick':
      return a.now === s.now ? s : { ...s, now: a.now }
    case 'amount':
      return { ...s, amount: sanitizeAmount(a.value), error: null }
    case 'asset': {
      if (a.value === s.sourceAsset) return s
      // USDC funds the pound corridor and nothing else yet. Moving to an asset that cannot
      // fund the chosen pair moves the pair too, rather than leaving a quote that reverts.
      const corridor = corridorByKey(s.corridorKey)
      const keep = corridor && settleableFrom(corridor, a.value)
      const corridorKey = keep ? s.corridorKey : (corridorsFor(a.value)[0]?.key ?? s.corridorKey)
      return { ...s, sourceAsset: a.value, corridorKey, balance: null, error: null }
    }
    case 'corridor':
      return a.key === s.corridorKey ? s : { ...s, corridorKey: a.key, error: null }
    case 'recipientInput':
      return { ...s, recipientInput: a.value, error: null }
    case 'chooseRecipient':
      return {
        ...s,
        recipient: a.address,
        recipientName: a.linkName,
        recipientNad: a.nadName,
        recipientInput: '',
        editingRecipient: false,
        error: null,
      }
    case 'editRecipient':
      return { ...s, editingRecipient: a.editing, recipientInput: '' }
    case 'busy':
      return { ...s, busy: a.busy, error: null }
    case 'fail':
      return { ...s, busy: null, error: a.message }
    case 'signedIn': {
      // A different account has different contacts, and a recipient chosen from the last
      // one's list is not something this one picked.
      const switched = s.account !== null && s.account.address.toLowerCase() !== a.address.toLowerCase()
      return {
        ...s,
        ...(switched ? { ...NO_RECIPIENT, ...NO_PAYOUT } : {}),
        busy: null,
        error: null,
        account: { address: a.address, credentialId: a.credentialId },
        balance: null,
        step: switched || s.step === 'signin' ? 'amount' : s.step,
      }
    }
    case 'storedAccount': {
      const next = a.account
      // Contacts stay in storage under the account they belong to; only what is on screen goes.
      if (!next) return s.account ? { ...s, ...NO_RECIPIENT, ...NO_PAYOUT, account: null, balance: null, busy: null, error: null, step: 'signin' } : s
      // The same account written again (a sign-in elsewhere with the same passkey) changes nothing here.
      if (s.account?.address.toLowerCase() === next.address.toLowerCase()) return s
      return sendReducer(s, { type: 'signedIn', ...next })
    }
    case 'balance':
      return { ...s, balance: a.value }
    case 'quoted':
      return { ...s, busy: null, error: null, quote: a.quote, step: 'quote' }
    case 'requote':
      return { ...s, quote: null, error: null, step: 'amount' }
    case 'spread': {
      const next = Math.min(MAX_SPREAD_MAX, Math.max(MAX_SPREAD_MIN, s.maxSpreadBps + a.delta))
      return next === s.maxSpreadBps ? s : { ...s, maxSpreadBps: next }
    }
    case 'sent':
      return { ...s, busy: null, error: null, receipt: a.receipt, txHash: a.txHash, step: 'sent' }
    case 'notice':
      return { ...s, notice: a.message }
    case 'again':
      return { ...s, step: 'amount', amount: '', quote: null, receipt: null, txHash: null, error: null, notice: null, busy: null }
  }
}
