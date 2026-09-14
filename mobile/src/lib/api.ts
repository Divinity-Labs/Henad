import Constants from 'expo-constants'
import type { Address, Hex } from 'viem'
import type { QuoteDto, Tier } from '@henad/core'

/**
 * The mobile client talks to the web app's routes rather than reimplementing them.
 *
 * `/api/quote` and `/api/rates` read Chainlink and Mento. A phone could, but should not: the
 * reference rate has to come from the same place for both clients or their receipts
 * disagree. `/api/relay` holds the relayer key, which will never ship in an app bundle.
 * The phone signs, and the server broadcasts.
 */
function baseUrl(): string {
  const extra = (Constants.expoConfig?.extra as Record<string, unknown> | undefined) ?? {}
  const value = typeof extra.apiBaseUrl === 'string' ? extra.apiBaseUrl : undefined
  if (!value) throw new Error('app.config.ts is missing extra.apiBaseUrl')
  return value.replace(/\/$/, '')
}

interface ApiError {
  error: string
}

export async function fetchQuote(source: string, target: string, amount: string): Promise<QuoteDto> {
  const params = new URLSearchParams({ source, target, amount })
  const res = await fetch(`${baseUrl()}/api/quote?${params}`, { headers: { accept: 'application/json' } })
  const body: unknown = await res.json()
  if (!res.ok || (body as ApiError).error) {
    throw new Error((body as ApiError).error ?? `The quote failed (${res.status}). Try again.`)
  }
  return body as QuoteDto
}

/** Mirrors web/src/lib/send-serial.ts. Bigints are decimal strings. */
export interface RateDto {
  key: string
  target: string
  tier: Tier
  rate: string | null
  updatedAt: number | null
  stale: boolean
  marketClosed: boolean
}

export interface ReceiptDto {
  intentId: Hex
  index: number | null
  corridorKey: string
  payer: Address
  recipient: Address
  sourceAsset: { symbol: string; address: Address; decimals: number }
  targetAsset: { symbol: string; address: Address; decimals: number }
  sourceAmount: string
  deliveredAmount: string
  referenceRate: string
  executedRate: string
  spreadBps: number
  spreadCost: string
  rateSource: Address
  venue: Address
  settledAt: number
  settledAtBlock: string
  txHash: Hex | null
  sample: boolean
}

export interface RatesPayload {
  now: number
  chainId: number
  rates: RateDto[]
  ledger: { count: number; last: ReceiptDto | null; byCorridor: Record<string, ReceiptDto> }
}

export async function fetchRates(): Promise<RatesPayload> {
  const res = await fetch(`${baseUrl()}/api/rates`, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`Rates are unavailable (${res.status}).`)
  return (await res.json()) as RatesPayload
}

export interface RelayResult {
  intentId: Hex
  txHash: Hex
}

interface RelayFailure extends ApiError {
  code?: string
  reason?: { name: string; source: string }
}

export async function relaySettlement(chainId: number, intent: Record<string, unknown>, signature: Hex): Promise<RelayResult> {
  const res = await fetch(`${baseUrl()}/api/relay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chainId, intent, signature }),
  })
  const body: unknown = await res.json()
  if (!res.ok || (body as RelayFailure).error) {
    const failure = body as RelayFailure
    throw new Error(failure.reason?.name ? `${failure.error} (${failure.reason.name})` : (failure.error ?? `Settlement failed (${res.status}).`))
  }
  return body as RelayResult
}

/** The public permalink for a settled payout. The same URL anyone else would open. */
export function receiptUrl(intentId: Hex): string {
  return `${baseUrl()}/receipt/${intentId}`
}

export async function fetchReceipt(intentId: Hex): Promise<ReceiptDto | null> {
  try {
    const res = await fetch(`${baseUrl()}/api/receipt/${intentId}`, { headers: { accept: 'application/json' } })
    if (!res.ok) return null
    return (await res.json()) as ReceiptDto
  } catch {
    return null
  }
}
