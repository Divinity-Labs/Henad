import { cache } from 'react'
import { headers } from 'next/headers'
import type { Hex } from 'viem'
import { money, shortAddress } from './format'
import { getReceipt, type Receipt } from './receipts'

/**
 * Helpers for the public receipt permalink (/receipt/[intentId]) and its OG
 * image. Server-only: reads request headers and the chain.
 */

const INTENT_ID = /^0x[0-9a-f]{64}$/i

/** A route param is a receipt id only when it is 0x plus 64 hex characters. */
export function isIntentId(s: string): s is Hex {
  return INTENT_ID.test(s)
}

/** One chain read per request, shared by generateMetadata and the page. */
export const loadReceipt = cache((intentId: Hex) => getReceipt(intentId))

/**
 * Host and origin of the current request, for display and for the permalink.
 * Nothing is hardcoded: behind a proxy the forwarded headers win.
 */
export async function requestOrigin(): Promise<{ host: string; origin: string }> {
  const h = await headers()
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? '').split(',')[0]!.trim()
  if (!host) return { host: '', origin: '' }
  const local = /^(localhost|127\.|\[::1\])/.test(host)
  const proto = h.get('x-forwarded-proto')?.split(',')[0]!.trim() ?? (local ? 'http' : 'https')
  return { host, origin: `${proto}://${host}` }
}

/**
 * ChainlinkRateSource packs both round ids into the observation:
 * (roundIdBase << 80) | roundIdQuote, base = source-asset feed, quote = target feed.
 * Null when the observation is empty (the design fixture).
 */
export function unpackObservation(observation: Hex): { base: bigint; quote: bigint } | null {
  const v = BigInt(observation)
  if (v === 0n) return null
  return { base: v >> 80n, quote: v & ((1n << 80n) - 1n) }
}

/** Fixed-point bigint as a plain decimal string, truncated (floor) to `dp` places: "0.782470". */
export function fixed(value: bigint, decimals: number, dp: number): string {
  const neg = value < 0n
  const digits = (neg ? -value : value).toString().padStart(decimals + 1, '0')
  const int = digits.slice(0, digits.length - decimals)
  const frac = digits.slice(digits.length - decimals).padEnd(dp, '0').slice(0, dp)
  return `${neg ? '−' : ''}${int}${dp > 0 ? `.${frac}` : ''}`
}

/** "The spread was £0.61." or, when the venue beat the reference, says so. */
export function spreadSentence(r: Receipt): string {
  const c = r.corridor
  const cost = money(r.spreadCost < 0n ? -r.spreadCost : r.spreadCost, r.targetAsset.decimals, c.targetSymbol, c.currencyDp)
  return r.spreadCost < 0n ? `The rate beat the reference by ${cost}.` : `The spread was ${cost}.`
}

/** The verification headline. There are no names in the data layer, so the recipient is its short address. */
export function headline(r: Receipt): string {
  const c = r.corridor
  const got = money(r.deliveredAmount, r.targetAsset.decimals, c.targetSymbol, c.currencyDp)
  const paid = money(r.sourceAmount, r.sourceAsset.decimals, '$')
  return `${shortAddress(r.recipient)} received ${got} for ${paid}. ${spreadSentence(r)} Anyone can check.`
}

const MONADSCAN = 'https://monadscan.com'
export const monadscanTx = (hash: Hex) => `${MONADSCAN}/tx/${hash}`
export const monadscanAddress = (address: string) => `${MONADSCAN}/address/${address}`
