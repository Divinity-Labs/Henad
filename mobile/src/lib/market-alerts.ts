import { Platform } from 'react-native'
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

/** Android channel id. Named for what it is, so a person can silence it without silencing payments. */
const CHANNEL = 'market-hours'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

/**
 * Android posts nothing without a channel. One is created before anything is scheduled,
 * because a notification with no channel is dropped silently: no error, no banner, nothing
 * to debug. iOS ignores this call.
 */
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Market hours',
    description: 'When the FX market opens and closes, which is when payouts start and stop working.',
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  })
}

/** Ask once. Android 13 and later prompt; earlier versions grant on install. iOS always prompts. */
export async function requestAlertPermission(): Promise<boolean> {
  await ensureChannel()
  const current = await Notifications.getPermissionsAsync()
  if (current.granted) return true
  if (!current.canAskAgain) return false
  return (await Notifications.requestPermissionsAsync()).granted
}

/**
 * Prove delivery works, in seconds rather than waiting for Friday.
 *
 * Scheduling something a day away and waiting is a poor way to find out that the phone is
 * dropping notifications: a missing channel, a revoked permission and an aggressive battery
 * saver all look identical from inside the app. This one arrives or it does not.
 */
export async function sendTestAlert(): Promise<void> {
  await ensureChannel()
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Henad alerts work',
      body: 'This is the test. Market opens and closes will arrive the same way.',
      ...(Platform.OS === 'android' ? { channelId: CHANNEL } : {}),
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, repeats: false },
  })
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
  await ensureChannel()
  await Notifications.cancelAllScheduledNotificationsAsync()
  let ts = Math.floor(now / 1000)
  let scheduled = 0
  for (let i = 0; i < AHEAD; i++) {
    const next = nextTransition(ts)
    await Notifications.scheduleNotificationAsync({
      content: {
        ...(next.opens
          ? { title: 'FX market is open', body: `Payouts settle again. Rates are live from ${when(next.at)}.` }
          : { title: 'FX market closes now', body: `Mento stops quoting at ${when(next.at)}. Payouts resume Sunday evening.` }),
        ...(Platform.OS === 'android' ? { channelId: CHANNEL } : {}),
      },
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
export async function alertsState(now = Date.now()): Promise<{ count: number; nextAt: number; opens: boolean; open: boolean; queued: number[] }> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync()
  const ts = Math.floor(now / 1000)
  const next = nextTransition(ts)
  // What the phone will actually do, as opposed to what we asked it to do.
  const queued = scheduled
    .map((n) => {
      const t = n.trigger as { type?: string; value?: number; date?: number } | null
      const at = typeof t?.value === 'number' ? t.value : typeof t?.date === 'number' ? t.date : null
      return at === null ? null : Math.floor(at / 1000)
    })
    .filter((x): x is number => x !== null)
    .sort((a, b) => a - b)
  return { count: scheduled.length, nextAt: next.at, opens: next.opens, open: isFxMarketOpen(ts), queued }
}
