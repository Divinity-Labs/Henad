import { MONAD_MAINNET_ID } from '@henad/core'
import { appChainId } from '@/lib/chain'
import { CORRIDORS } from '@henad/core'
import { totals, type Receipt } from '@/lib/receipts'

export type Network = 'mainnet' | 'testnet'

export interface PrimaryTotals {
  symbol: string
  decimals: number
  dp: number
  delivered: bigint
  spreadCost: bigint
  /** The receipt's own bps with one settlement; delivered-weighted across many. */
  spreadBps: number
  /** How many target currencies the ledger holds. */
  currencies: number
}

export interface LandingLedger {
  /** Newest real settlement; null before the first one. The fixture never counts. */
  latest: Receipt | null
  settlements: number
  /** Totals in the currency with the most settlements; null with none. */
  primary: PrimaryTotals | null
  network: Network
}

/** Everything the landing page says about the ledger, derived once from listReceipts(). */
export function landingLedger(receipts: Receipt[]): LandingLedger {
  const real = receipts.filter((r) => !r.sample)
  const t = totals(real)
  const [top] = Object.entries(t.byCurrency).sort((a, b) => b[1].count - a[1].count)
  let primary: PrimaryTotals | null = null
  if (top) {
    const [target, v] = top
    const atReference = v.delivered + v.spreadCost
    const spreadBps =
      v.count === 1 ? v.spreadBpsSum : atReference > 0n ? Math.round((Number(v.spreadCost) * 10_000) / Number(atReference)) : 0
    primary = {
      symbol: v.symbol,
      decimals: v.decimals,
      dp: CORRIDORS.find((c) => c.target === target)?.currencyDp ?? 2,
      delivered: v.delivered,
      spreadCost: v.spreadCost,
      spreadBps,
      currencies: Object.keys(t.byCurrency).length,
    }
  }
  return {
    latest: real.at(-1) ?? null,
    settlements: t.settlements,
    primary,
    network: appChainId() === MONAD_MAINNET_ID ? 'mainnet' : 'testnet',
  }
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

/** "one", "two" … for the small counts the copy speaks in words; digits past nine. */
export function countWord(n: number): string {
  return WORDS[n] ?? String(n)
}

export function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
