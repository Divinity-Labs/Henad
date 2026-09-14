import { MONAD_MAINNET_ID, type Corridor } from '@henad/core'
import { units } from '@/send/format'

/** "£", "€", "¥" butt against the figure; letter codes like "CHF" take a space. */
export function symbolPrefix(symbol: string): string {
  return /^[A-Za-z]/.test(symbol) ? `${symbol} ` : symbol
}

/** Target units per 1 USD at 1e18 to "£0.78247". */
export function rateText(rate: bigint, corridor: Corridor): string {
  return `${symbolPrefix(corridor.targetSymbol)}${units(rate, 18, corridor.rateDp)}`
}

/** "1 USD = £0.78247" */
export function rateLineText(rate: bigint, corridor: Corridor): string {
  return `1 USD = ${rateText(rate, corridor)}`
}

export function moneyText(value: bigint, decimals: number, corridor: Corridor): string {
  return `${symbolPrefix(corridor.targetSymbol)}${units(value, decimals, corridor.currencyDp)}`
}

/** What `sourceAmount` of a 6-decimal stablecoin comes to at a 1e18 rate, in target units. */
export function atRate(sourceAmount: bigint, sourceDecimals: number, rate: bigint, targetDecimals: number): bigint {
  return (sourceAmount * rate * 10n ** BigInt(targetDecimals)) / (10n ** 18n * 10n ** BigInt(sourceDecimals))
}

export function chainLabel(chainId: number): string {
  return chainId === MONAD_MAINNET_ID ? 'Monad mainnet' : 'Monad testnet'
}

export function explorerTx(chainId: number, hash: string): string {
  return chainId === MONAD_MAINNET_ID ? `https://monadscan.com/tx/${hash}` : `https://testnet.monadscan.com/tx/${hash}`
}

export function explorerAddress(address: string): string {
  // Feeds and the rate source are read on mainnet whatever chain settles.
  return `https://monadscan.com/address/${address}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const pad = (n: number) => String(n).padStart(2, '0')

/**
 * UTC formatting by table. Engines disagree on short month names ("Sep" against "Sept"),
 * and a receipt must print the same date on every device that reads it.
 */
export function hm(ts: number): string {
  const d = new Date(ts * 1000)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}
export function hms(ts: number): string {
  const d = new Date(ts * 1000)
  return `${hm(ts)}:${pad(d.getUTCSeconds())}`
}
export function weekdayLong(ts: number): string {
  return DAYS_LONG[new Date(ts * 1000).getUTCDay()]!
}
/** "Sun 13 Sep" */
export function dayStamp(ts: number): string {
  const d = new Date(ts * 1000)
  return `${DAYS_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}
/** "14 Sep 2026 · 19:04:29 UTC" */
export function dateTimeStamp(ts: number): string {
  const d = new Date(ts * 1000)
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${hms(ts)} UTC`
}

/** "2 s", "4 min", "3 h" */
export function age(seconds: number): string {
  if (seconds < 90) return `${Math.max(0, Math.round(seconds))} s`
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`
  return `${Math.round(seconds / 3600)} h`
}
