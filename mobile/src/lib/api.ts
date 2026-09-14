import Constants from 'expo-constants'
import type { Hex } from 'viem'
import type { QuoteDto } from '@henad/core'

/**
 * The mobile client talks to the web app's routes rather than reimplementing them.
 *
 * Two of them cannot live on a phone at all. `/api/quote` reads Chainlink and Mento
 * directly, which a phone could technically do but should not: the reference rate has to
 * come from the same place for both clients or their receipts disagree. `/api/relay`
 * holds the relayer key, which will never be shipped in an app bundle.
 *
 * So the phone signs, and the server broadcasts. The signature is the part only the
 * passkey can produce, and it never leaves the device in any other form.
 */
function baseUrl(): string {
  const extra = (Constants.expoConfig?.extra as Record<string, unknown> | undefined) ?? {}
  const value = typeof extra.apiBaseUrl === 'string' ? extra.apiBaseUrl : undefined
  if (!value) throw new Error('app.config.ts is missing extra.apiBaseUrl')
  return value.replace(/\/$/, '')
}

export interface QuoteError {
  error: string
}

export async function fetchQuote(source: string, target: string, amount: string): Promise<QuoteDto> {
  const params = new URLSearchParams({ source, target, amount })
  const res = await fetch(`${baseUrl()}/api/quote?${params}`, { headers: { accept: 'application/json' } })
  const body: unknown = await res.json()
  if (!res.ok || (body as QuoteError).error) {
    throw new Error((body as QuoteError).error ?? `The quote failed (${res.status}). Try again.`)
  }
  return body as QuoteDto
}

export interface RelayResult {
  intentId: Hex
  txHash: Hex
}

interface RelayFailure {
  error: string
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

export async function fetchReceipt(intentId: Hex): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${baseUrl()}/api/receipt/${intentId}`, { headers: { accept: 'application/json' } })
    if (!res.ok) return null
    return (await res.json()) as Record<string, unknown>
  } catch {
    return null
  }
}
