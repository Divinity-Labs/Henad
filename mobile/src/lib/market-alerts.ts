import * as Notifications from 'expo-notifications'
import { isFxMarketOpen, nextTransition } from '@henad/core'

/**
 * Tell someone when the FX market opens and closes, because the product stops working at
 * 21:00 UTC on Friday and nothing on a phone's home screen explains why.
 *
 * These are local notifications, scheduled on the device from the same `isFxMarketOpen` the
 * contracts' venue adapter enforces, so the app never promises a time the chain disagrees
 * with. No server, no push token, and nothing leaves the phone.
 */

/** How many transitions ahead to schedule. Four covers a fortnight of Friday closes and Sunday opens. */
const AHEAD = 4

export const ALERTS_KEY = 'henad.marketAlerts'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

/** Ask once. Android grants on install for most versions; iOS always prompts. */
export async function requestAlertPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync()
  if (current.granted) return true
  if (!current.canAskAgain) return false
  return (await Notifications.requestPermissionsAsync()).granted
}

function when(at: number): string {
  const d = new Date(at * 1000)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm} UTC`
}

/**
 * Replace the schedule with the next few transitions.
 *
 * Always cancels first: a phone that has been asleep for a week holds stale entries, and two
 * notifications for the same open is worse than none.
 */
export async function scheduleMarketAlerts(now = Date.now()): Promise<number> {
  await Notifications.cancelAllScheduledNotificationsAsync()
  let ts = Math.floor(now / 1000)
  let scheduled = 0
  for (let i = 0; i < AHEAD; i++) {
    const next = nextTransition(ts)
    await Notifications.scheduleNotificationAsync({
      content: next.opens
        ? { title: 'FX market is open', body: `Payouts settle again. Rates are live from ${when(next.at)}.` }
        : { title: 'FX market closes now', body: `Mento stops quoting at ${when(next.at)}. Payouts resume Sunday evening.` },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(next.at * 1000) },
    })
    scheduled++
    ts = next.at + 60
  }
  return scheduled
}

export async function cancelMarketAlerts(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync()
}

/** What the account screen shows: whether alerts are on, and what the next one will say. */
export async function alertsState(now = Date.now()): Promise<{ count: number; nextAt: number; opens: boolean; open: boolean }> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync()
  const ts = Math.floor(now / 1000)
  const next = nextTransition(ts)
  return { count: scheduled.length, nextAt: next.at, opens: next.opens, open: isFxMarketOpen(ts) }
}
