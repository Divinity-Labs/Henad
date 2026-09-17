import { formatUnits } from 'viem'

const ONE = 10n ** 18n

/** "£195.01", "$250.00", "¥153", "CHF 0.81". Never rounds to a fake round number. */
export function money(amount: bigint, decimals: number, symbol: string, dp = 2): string {
  const n = Number(formatUnits(amount, decimals))
  return symbol + n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

/**
 * A token amount named by its token: "745.13 GBPm".
 *
 * Used wherever the figure is what actually arrives. The recipient holds a pound-pegged token
 * on Monad, not pounds in a bank, and "£745.13" alone read as the second. Rates and spreads
 * keep the currency sign, because those are prices, not holdings.
 */
export function tokens(amount: bigint, decimals: number, tokenSymbol: string, dp = 2): string {
  const n = Number(formatUnits(amount, decimals))
  return `${n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })} ${tokenSymbol}`
}

/** Rate in 1e18 fixed point (target per 1 source) -> "1 USD = £0.78247". */
export function rateLine(rate1e18: bigint, targetSymbol: string, dp = 5, source = 'USD'): string {
  return `1 ${source} = ${rateValue(rate1e18, targetSymbol, dp)}`
}

export function rateValue(rate1e18: bigint, targetSymbol: string, dp = 5): string {
  const n = Number(formatUnits(rate1e18, 18))
  return targetSymbol + n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

/** Signed basis points. `signed` adds "+" for positive values as the receipt does. */
export function bps(n: number | bigint, signed = false): string {
  const v = Number(n)
  const s = signed && v > 0 ? '+' : ''
  return `${s}${v} bps`
}

/** "£0.61 · 31 bps" — amount first, bps second, always. */
export function spreadLine(cost: bigint, targetDecimals: number, targetSymbol: string, spreadBps: number, opts?: { signed?: boolean; dp?: number }) {
  const amount = money(cost < 0n ? -cost : cost, targetDecimals, targetSymbol, opts?.dp ?? 2)
  return `${cost < 0n ? '−' : ''}${amount} · ${bps(spreadBps, opts?.signed)}`
}

export function shortAddress(a: string, head = 6, tail = 4): string {
  return a.length > head + tail + 2 ? `${a.slice(0, head)}…${a.slice(-tail)}` : a
}

export function shortHash(h: string): string {
  return shortAddress(h, 6, 4)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/**
 * Three-letter months from a fixed table, not Intl: Node's ICU renders
 * September as "Sept" in en-GB, and the design uses "Sep" everywhere.
 */
function utcDate(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** "09 Sep 2026 · 14:32:07 UTC" */
export function utcStamp(unixSeconds: number | bigint): string {
  const d = new Date(Number(unixSeconds) * 1000)
  const date = utcDate(d)
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC' })
  return `${date} · ${time} UTC`
}

/** "14:32:07 UTC" */
export function utcTime(unixSeconds: number | bigint): string {
  const d = new Date(Number(unixSeconds) * 1000)
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC'
}

/** "Sun 13 Sep · 23:00 UTC" */
export function utcDayTime(unixSeconds: number | bigint): string {
  const d = new Date(Number(unixSeconds) * 1000)
  const day = `${WEEKDAYS[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]}`
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
  return `${day} · ${time} UTC`
}

export function blockNumber(n: bigint | number): string {
  return Number(n).toLocaleString('en-GB')
}

/** Human "age" of a feed update for the stale check. */
export function ageSeconds(updatedAt: bigint | number, now = Date.now() / 1000): number {
  return Math.max(0, Math.floor(now - Number(updatedAt)))
}

export { ONE }
