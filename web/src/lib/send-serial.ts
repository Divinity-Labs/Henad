import type { Address, Hex } from 'viem'
import { corridorByKey, type Tier } from '@henad/core'
import type { LiveRate } from './rates'
import type { Receipt } from './receipts'

/**
 * Wire shapes for the send flow. Everything the server hands the client, and
 * everything the route handlers return, crosses as JSON with bigints as decimal
 * strings and corridors by key. `receiptFromDto` restores a full `Receipt` so
 * the shared `ReceiptSlip` renders it unchanged.
 */

export interface RateDto {
  key: string
  target: string
  tier: Tier
  /** target units per 1 USD, 1e18 fixed point, decimal string; null when unpriced or the read failed */
  rate: string | null
  updatedAt: number | null
  stale: boolean
  marketClosed: boolean
}

export function rateToDto(r: LiveRate): RateDto {
  return {
    key: r.corridor.key,
    target: r.corridor.target,
    tier: r.corridor.tier,
    rate: r.rate === null ? null : r.rate.toString(),
    updatedAt: r.updatedAt,
    stale: r.stale,
    marketClosed: r.marketClosed,
  }
}

interface AssetDto {
  symbol: string
  address: Address
  decimals: number
}

export interface ReceiptDto {
  intentId: Hex
  index: number | null
  corridorKey: string
  payer: Address
  recipient: Address
  sourceAsset: AssetDto
  targetAsset: AssetDto
  sourceAmount: string
  deliveredAmount: string
  referenceRate: string
  executedRate: string
  spreadBps: number
  spreadCost: string
  rateSource: Address
  referenceObservation: Hex
  venue: Address
  settledAt: number
  settledAtBlock: string
  txHash: Hex | null
  sample: boolean
}

export function receiptToDto(r: Receipt): ReceiptDto {
  return {
    intentId: r.intentId,
    index: r.index,
    corridorKey: r.corridor.key,
    payer: r.payer,
    recipient: r.recipient,
    sourceAsset: r.sourceAsset,
    targetAsset: r.targetAsset,
    sourceAmount: r.sourceAmount.toString(),
    deliveredAmount: r.deliveredAmount.toString(),
    referenceRate: r.referenceRate.toString(),
    executedRate: r.executedRate.toString(),
    spreadBps: r.spreadBps,
    spreadCost: r.spreadCost.toString(),
    rateSource: r.rateSource,
    referenceObservation: r.referenceObservation,
    venue: r.venue,
    settledAt: r.settledAt,
    settledAtBlock: r.settledAtBlock.toString(),
    txHash: r.txHash,
    sample: r.sample,
  }
}

/** Null when the corridor key is not in the registry (a receipt from a later build). */
export function receiptFromDto(d: ReceiptDto): Receipt | null {
  const corridor = corridorByKey(d.corridorKey)
  if (!corridor) return null
  return {
    intentId: d.intentId,
    index: d.index,
    corridor,
    payer: d.payer,
    recipient: d.recipient,
    sourceAsset: d.sourceAsset,
    targetAsset: d.targetAsset,
    sourceAmount: BigInt(d.sourceAmount),
    deliveredAmount: BigInt(d.deliveredAmount),
    referenceRate: BigInt(d.referenceRate),
    executedRate: BigInt(d.executedRate),
    spreadBps: d.spreadBps,
    spreadCost: BigInt(d.spreadCost),
    rateSource: d.rateSource,
    referenceObservation: d.referenceObservation,
    venue: d.venue,
    settledAt: d.settledAt,
    settledAtBlock: BigInt(d.settledAtBlock),
    txHash: d.txHash,
    sample: d.sample,
  }
}
