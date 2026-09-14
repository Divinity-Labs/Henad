import type { Hex } from 'viem'
import { deliveredAt, executedRate, spreadBps, spreadCost } from './corridor'
import type { SourceAssetSymbol } from './corridors'

/** A quote is good for 45 s; the last 10 s render amber. */
export const QUOTE_TTL_MS = 45_000
export const QUOTE_EXPIRING_MS = 10_000

/** Worst spread the payer will accept, in 5 bps steps. */
export const MAX_SPREAD_DEFAULT = 50
export const MAX_SPREAD_MIN = 25
export const MAX_SPREAD_MAX = 200
export const MAX_SPREAD_STEP = 5

/** Response of GET /api/quote. Bigints are decimal strings. */
export interface QuoteDto {
  source: SourceAssetSymbol
  target: string
  /** source base units the quote was priced for */
  sourceAmount: string
  /** target base units the venue would deliver this block */
  quotedAmountOut: string
  /** reference rate, target per source at 1e18, composed exactly like ChainlinkRateSource */
  referenceRate: string
  /** packed Chainlink round ids, the receipt's referenceObservation */
  observation: Hex
  marketOpen: boolean
  /** unix seconds of the older of the two feed rounds */
  feedUpdatedAt: number
  /** unix milliseconds after which the quote must be refreshed */
  expiresAt: number
}

export interface QuoteMaths {
  sourceAmount: bigint
  delivered: bigint
  referenceRate: bigint
  executedRate: bigint
  /** signed; positive means the payer gets a worse rate than reference */
  spreadBps: number
  /** signed target base units lost to spread (negative = better than reference) */
  spreadCost: bigint
}

/** The receipt's figures, from the quote, using the same Corridor maths the contracts mirror. */
export function quoteMaths(q: QuoteDto, sourceDecimals: number, targetDecimals: number): QuoteMaths {
  const sourceAmount = BigInt(q.sourceAmount)
  const delivered = BigInt(q.quotedAmountOut)
  const reference = BigInt(q.referenceRate)
  const executed = executedRate(sourceAmount, sourceDecimals, delivered, targetDecimals)
  return {
    sourceAmount,
    delivered,
    referenceRate: reference,
    executedRate: executed,
    spreadBps: Number(spreadBps(reference, executed)),
    spreadCost: spreadCost(reference, sourceAmount, sourceDecimals, delivered, targetDecimals),
  }
}

/** Least the recipient receives when the fill sits exactly on the spread cap. */
export function deliveredAtSpreadCap(
  referenceRate: bigint,
  maxSpreadBps: number,
  sourceAmount: bigint,
  sourceDecimals: number,
  targetDecimals: number,
): bigint {
  const worst = (referenceRate * BigInt(10_000 - maxSpreadBps)) / 10_000n
  return deliveredAt(worst, sourceAmount, sourceDecimals, targetDecimals)
}

export type QuoteFreshness = 'fresh' | 'expiring' | 'expired'

export function quoteFreshness(expiresAt: number, now: number): QuoteFreshness {
  const left = expiresAt - now
  if (left <= 0) return 'expired'
  return left <= QUOTE_EXPIRING_MS ? 'expiring' : 'fresh'
}

/** "0:27" */
export function countdown(expiresAt: number, now: number): string {
  const s = Math.max(0, Math.ceil((expiresAt - now) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
