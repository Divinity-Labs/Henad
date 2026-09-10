import type { Address, Hex } from 'viem'
import type { SourceAssetSymbol } from '@/lib/corridors'
import { MAX_SPREAD_DEFAULT, MAX_SPREAD_MAX, MAX_SPREAD_MIN, type QuoteDto } from '@/lib/send-quote'
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
  recipient: string
  /** display name for the recipient; lives in this state only and never leaves the device */
  recipientName: string
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
  | { type: 'recipient'; value: string }
  | { type: 'recipientName'; value: string }
  | { type: 'editRecipient'; editing: boolean }
  | { type: 'busy'; busy: Exclude<Busy, null> }
  | { type: 'fail'; message: string }
  | { type: 'signedIn'; address: Address; credentialId: string }
  | { type: 'balance'; value: bigint | null }
  | { type: 'quoted'; quote: QuoteDto }
  | { type: 'requote' }
  | { type: 'spread'; delta: number }
  | { type: 'sent'; receipt: ReceiptDto; txHash: Hex | null }
  | { type: 'notice'; message: string | null }

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

export function initialState(i: SendInitial): SendState {
  const demoReceipt = i.demo === 'receipt' ? i.sampleReceipt : null
  return {
    step: demoReceipt ? 'sent' : 'signin',
    now: i.now,
    corridorKey: i.corridorKey,
    rates: i.rates,
    latestReceipt: i.latestReceipt,
    forceClosed: i.demo === 'closed',
    sourceAsset: 'AUSD',
    amount: '',
    recipient: '',
    recipientName: '',
    editingRecipient: true,
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
    case 'asset':
      return a.value === s.sourceAsset ? s : { ...s, sourceAsset: a.value, balance: null, error: null }
    case 'corridor':
      return a.key === s.corridorKey ? s : { ...s, corridorKey: a.key, error: null }
    case 'recipient':
      return { ...s, recipient: a.value.trim(), error: null }
    case 'recipientName':
      return { ...s, recipientName: a.value.slice(0, 40) }
    case 'editRecipient':
      return { ...s, editingRecipient: a.editing }
    case 'busy':
      return { ...s, busy: a.busy, error: null }
    case 'fail':
      return { ...s, busy: null, error: a.message }
    case 'signedIn':
      return {
        ...s,
        busy: null,
        error: null,
        account: { address: a.address, credentialId: a.credentialId },
        balance: null,
        step: s.step === 'signin' ? 'amount' : s.step,
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
  }
}
