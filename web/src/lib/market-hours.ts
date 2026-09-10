/**
 * Mirror of Mento's MarketHoursBreaker on Monad mainnet
 * (0x0A18B8e7338eF8d6025529257aA5CCd5A14e0DAF, pure, verified in
 * docs/INTEGRATION-FACTS.md §14.2): the GBPm/EURm/CHFm/JPYm pools are closed
 *   - Friday from 21:00:00 UTC through Sunday 22:59:59 UTC
 *   - all day 25 December and 1 January
 *   - 24 and 31 December from 22:00 UTC
 * The USD-collateral pools (AUSD/USDm, USDC/USDm) are open 24/7 today.
 */

const HOUR = 3600
const DAY = 86400

function utc(ts: number) {
  const d = new Date(ts * 1000)
  return {
    dow: d.getUTCDay(), // 0 Sun .. 6 Sat
    hour: d.getUTCHours(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  }
}

export function isFxMarketOpen(ts: number): boolean {
  const { dow, hour, month, day } = utc(ts)
  if (dow === 6) return false
  if (dow === 5 && hour >= 21) return false
  if (dow === 0 && hour < 23) return false
  if (month === 12 && day === 25) return false
  if (month === 1 && day === 1) return false
  if (month === 12 && (day === 24 || day === 31) && hour >= 22) return false
  return true
}

/** Next instant (unix seconds) at which the market flips state, scanning by the minute. */
export function nextTransition(ts: number): { at: number; opens: boolean } {
  const now = isFxMarketOpen(ts)
  let t = Math.floor(ts / 60) * 60
  const limit = t + 10 * DAY
  while (t < limit) {
    t += 60
    if (isFxMarketOpen(t) !== now) return { at: t, opens: !now }
  }
  return { at: t, opens: !now }
}

export { HOUR, DAY }
