/** Formatting shared by the send steps. Figures never round up; a payout is not a guess. */

/** Fixed-point to a plain string, truncated. */
export function units(value: bigint, decimals: number, dp: number): string {
  const base = 10n ** BigInt(decimals)
  const whole = value / base
  const frac = ((value % base) * 10n ** BigInt(dp)) / base
  return dp === 0 ? whole.toLocaleString('en-US') : `${whole.toLocaleString('en-US')}.${frac.toString().padStart(dp, '0')}`
}

/** "£195.01" */
export function money(value: bigint, decimals: number, symbol: string, dp = 2): string {
  return `${symbol}${units(value, decimals, dp)}`
}

/** "1 USD = £0.74036" */
export function rateLine(rate: bigint, symbol: string, dp: number): string {
  return `1 USD = ${symbol}${units(rate, 18, dp)}`
}

/** "£0.61 · 31 bps", the product's core sentence in miniature. */
export function spreadLine(cost: bigint, decimals: number, symbol: string, bps: number, dp = 2): string {
  return `${money(cost, decimals, symbol, dp)} · ${bps} bps`
}

export function shortId(id: string): string {
  return `${id.slice(0, 10)}…${id.slice(-6)}`
}

/** Digits and a single dot, capped at two decimals. Keeps the keypad honest. */
export function sanitizeAmount(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '')
  const [whole, ...rest] = cleaned.split('.')
  const frac = rest.join('').slice(0, 2)
  return rest.length ? `${whole}.${frac}` : whole
}

/** "12.34" to the smallest unit of a 6-decimal token. Returns null when unusable. */
export function parseAmount(text: string, decimals: number): bigint | null {
  if (!text || text === '.') return null
  const [whole = '0', frac = ''] = text.split('.')
  const padded = frac.padEnd(decimals, '0').slice(0, decimals)
  try {
    const value = BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(padded || '0')
    return value > 0n ? value : null
  } catch {
    return null
  }
}
