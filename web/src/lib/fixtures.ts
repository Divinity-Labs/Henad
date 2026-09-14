import type { Receipt } from './receipts'
import { CORRIDORS } from '@henad/core'
import { spreadCost } from '@henad/core'

/**
 * The design's sample settlement, used ONLY when NEXT_PUBLIC_FIXTURES=1 and no
 * contracts are deployed for the configured chain. It lets the UI be built and
 * reviewed before the first mainnet payout exists. Every surface that renders it
 * shows a "sample" marker; nothing here is ever presented as a real settlement.
 * Figures: $250.00 -> £195.01, reference £0.78247, executed £0.78003, 31 bps, £0.61.
 */
export function fixturesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FIXTURES === '1'
}

const gbp = CORRIDORS[0]!
const REFERENCE = 782_470_000_000_000_000n // 0.78247e18
const EXECUTED = 780_030_000_000_000_000n // 0.78003e18 (design figure; 250 * 0.78003 = 195.0075)
const SOURCE = 250_000_000n // $250.00 at 6 dec
const DELIVERED = 195_010_000_000_000_000_000n // £195.01 at 18 dec

export const SAMPLE_RECEIPT: Receipt = {
  intentId: '0x8e12f0a2c4d9b7e1f3a5c6d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d644af',
  index: 1,
  corridor: gbp,
  payer: '0x7a3f1c2e4b5d6f708192a3b4c5d6e7f8091a9c2e',
  recipient: '0x9c41d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b7e0',
  sourceAsset: { symbol: 'AUSD', address: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a', decimals: 6 },
  targetAsset: { symbol: 'GBPm', address: gbp.targetAsset!.address, decimals: 18 },
  sourceAmount: SOURCE,
  deliveredAmount: DELIVERED,
  referenceRate: REFERENCE,
  executedRate: EXECUTED,
  spreadBps: 31,
  spreadCost: spreadCost(REFERENCE, SOURCE, 6, DELIVERED, 18),
  rateSource: '0x3fa9a1b2c3d4e5f60718293a4b5c6d7e8f90c21d',
  referenceObservation: '0x0000000000000000000000000000000000000000000000000000000000000000',
  venue: '0x4861840C2EfB2b98312B0aE34d86fD73E8f9B6f6',
  settledAt: 1_788_964_327, // 09 Sep 2026 14:32:07 UTC
  settledAtBlock: 41_208_377n,
  txHash: null,
  sample: true,
}
