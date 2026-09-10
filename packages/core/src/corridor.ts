import { keccak256, stringToBytes, type Hex } from 'viem'

/**
 * Mirror of contracts/src/libraries/Corridor.sol. Every function here must give
 * bit-identical results to the Solidity version; the tests pin the same vectors.
 * bigint division in JS truncates toward zero, as Solidity's does.
 */

export const RATE_DECIMALS = 18
export const ONE = 10n ** 18n
const BPS = 10_000n

/** keccak256("USD/GBP") — matches Corridor.id("USD", "GBP"). */
export function corridorId(source: string, target: string): Hex {
  return keccak256(stringToBytes(`${source}/${target}`))
}

/** Executed rate in 1e18 fixed point: target units per source unit. */
export function executedRate(
  sourceAmount: bigint,
  sourceDecimals: number,
  deliveredAmount: bigint,
  targetDecimals: number,
): bigint {
  if (sourceAmount === 0n) throw new Error('Corridor: zero source')
  return (deliveredAmount * ONE * 10n ** BigInt(sourceDecimals)) / (sourceAmount * 10n ** BigInt(targetDecimals))
}

/** Signed spread in basis points. Positive = sender got a worse rate than reference. */
export function spreadBps(referenceRate: bigint, executed: bigint): bigint {
  if (referenceRate === 0n) throw new Error('Corridor: zero reference')
  return ((referenceRate - executed) * BPS) / referenceRate
}

/**
 * Expected delivered amount at a given rate, for quotes and UI. Inverse of
 * executedRate up to integer rounding (floor).
 */
export function deliveredAt(
  rate: bigint,
  sourceAmount: bigint,
  sourceDecimals: number,
  targetDecimals: number,
): bigint {
  return (rate * sourceAmount * 10n ** BigInt(targetDecimals)) / (ONE * 10n ** BigInt(sourceDecimals))
}

/** Absolute cost of the spread in target-currency base units, for "you are paying £X". */
export function spreadCost(
  referenceRate: bigint,
  sourceAmount: bigint,
  sourceDecimals: number,
  deliveredAmount: bigint,
  targetDecimals: number,
): bigint {
  return deliveredAt(referenceRate, sourceAmount, sourceDecimals, targetDecimals) - deliveredAmount
}
