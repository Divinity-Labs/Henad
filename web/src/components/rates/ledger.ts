import { MONAD_MAINNET_ID, MONAD_TESTNET_ID } from '@henad/core'
import { appChainId } from '@/lib/chain'
import { CORRIDORS } from '@/lib/corridors'
import { utcTime } from '@/lib/format'
import { deploymentAddresses, type LedgerTotals, type Receipt } from '@/lib/receipts'

/**
 * Figures for the /rates hero, derived from `totals()`. Quoted in GBP when
 * pounds have settled, otherwise in the currency with the most settlements;
 * `more` counts the other currencies so the page can say "+ n more".
 */
export interface Headline {
  symbol: string
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

/** "09 Sep · 14:32:07" for the ledger's Settled column. Newer ICU spells en-GB September "Sept"; the canvas says "Sep". */
export function ledgerStamp(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }).replace('Sept', 'Sep')
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

export function chainLabel(): 'mainnet' | 'testnet' {
  return appChainId() === MONAD_TESTNET_ID ? 'testnet' : 'mainnet'
}

/** Monadscan for the chain the app settles on; the RateAttestation contract once deployed. */
export function explorerHref(): string {
  const base = appChainId() === MONAD_MAINNET_ID ? 'https://monadscan.com' : 'https://testnet.monadscan.com'
  const dep = deploymentAddresses()
  return dep ? `${base}/address/${dep.rateAttestation}` : base
}
