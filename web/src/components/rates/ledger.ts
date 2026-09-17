import { MONAD_MAINNET_ID, MONAD_TESTNET_ID } from '@henad/core'
import { appChainId, isLocalFork } from '@/lib/chain'
import { CORRIDORS } from '@henad/core'
import { utcTime } from '@/lib/format'
import { deploymentAddresses, type LedgerTotals, type Receipt } from '@/lib/receipts'

/**
 * Figures for the /rates hero, derived from `totals()`. Quoted in GBP when
 * pounds have settled, otherwise in the currency with the most settlements;
 * `more` counts the other currencies so the page can say "+ n more".
 */
export interface Headline {
  symbol: string
  /** The token that arrives, e.g. GBPm */
  token: string
  decimals: number
  dp: number
  delivered: bigint
  spreadCost: bigint
  meanBps: number
  count: number
  more: number
}

export function headline(t: LedgerTotals): Headline | null {
  const keys = Object.keys(t.byCurrency)
  if (keys.length === 0) return null
  const key = keys.includes('GBP') ? 'GBP' : keys.reduce((a, b) => (t.byCurrency[b].count > t.byCurrency[a].count ? b : a))
  const c = t.byCurrency[key]
  return {
    symbol: c.symbol,
    token: c.token,
    decimals: c.decimals,
    dp: currencyDp(key),
    delivered: c.delivered,
    spreadCost: c.spreadCost,
    meanBps: meanBps(c.spreadBpsSum, c.count),
    count: c.count,
    more: keys.length - 1,
  }
}

/** Arithmetic mean of the settled spreads, whole basis points. */
export function meanBps(sum: number, count: number): number {
  return count === 0 ? 0 : Math.round(sum / count)
}

export function currencyDp(target: string): number {
  return CORRIDORS.find((c) => c.target === target)?.currencyDp ?? 2
}

/** Newer ICU spells en-GB September "Sept"; the canvas says "Sep". */
export function noSept(s: string): string {
  return s.replace('Sept', 'Sep')
}

/** "09 Sep · 14:32:07" for the ledger's Settled column. */
export function ledgerStamp(unixSeconds: number): string {
  const date = noSept(new Date(unixSeconds * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }))
  return `${date} · ${utcTime(unixSeconds).replace(' UTC', '')}`
}

/** Real settlements only; the design fixture is never counted as one. */
export function settled(receipts: Receipt[]): Receipt[] {
  return receipts.filter((r) => !r.sample)
}

/** Zero-padded ledger number for the ghost type and the # column. */
export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Which chain the page reads: a local fork is a copy of mainnet on this machine, and says so. */
export function chainLabel(): 'mainnet' | 'testnet' | 'local fork' {
  if (isLocalFork()) return 'local fork'
  return appChainId() === MONAD_TESTNET_ID ? 'testnet' : 'mainnet'
}

/** Monadscan for the chain the app settles on; the RateAttestation contract once deployed. */
export function explorerHref(): string {
  const base = appChainId() === MONAD_MAINNET_ID ? 'https://monadscan.com' : 'https://testnet.monadscan.com'
  const dep = deploymentAddresses()
  return dep ? `${base}/address/${dep.rateAttestation}` : base
}
