import { Platform } from 'react-native'
import * as BackgroundTask from 'expo-background-task'
import * as Notifications from 'expo-notifications'
import * as SecureStore from 'expo-secure-store'
import * as TaskManager from 'expo-task-manager'
import { CORRIDORS } from '@henad/core'
import { fetchRates } from './api'

/**
 * Rate watch: the phone wakes up, reads the rates Henad itself quotes from, and says what
 * moved.
 *
 * A scheduled notification carries fixed text, so a live price cannot come from one: the
 * device has to wake, fetch and then post. That is what this is. The figures come from
 * `/api/rates`, the same endpoint the app's own screens read, so an alert can never disagree
 * with what the app shows a second later.
 *
 * **The interval is a request, not a promise.** Android decides when a background task
 * actually runs, batching it with other work and skipping it in Doze; an hour is the floor,
 * not the rhythm. The settings screen says so rather than implying a clock.
 */

export const TASK = 'henad.rate-watch'
const SEEN_KEY = 'henad.rateWatch.seen'
/** When the background task last actually ran, and how it ended. Written only by the task. */
const BACKGROUND_KEY = 'henad.rateWatch.background'

type Outcome = 'posted' | 'nothing' | 'failed'

interface BackgroundRun {
  at: number
  outcome: Outcome
}

async function writeBackgroundRun(run: BackgroundRun): Promise<void> {
  try {
    await SecureStore.setItemAsync(BACKGROUND_KEY, JSON.stringify(run))
  } catch {
    // Nothing to be done from a headless task; the settings screen will say it never ran.
  }
}

async function readBackgroundRun(): Promise<BackgroundRun | null> {
  try {
    const raw = await SecureStore.getItemAsync(BACKGROUND_KEY)
    return raw ? (JSON.parse(raw) as BackgroundRun) : null
  } catch {
    return null
  }
}
const CHANNEL = 'rate-watch'

/** An hour in minutes. Android treats this as "no sooner than", and often much later. */
export const INTERVAL_MINUTES = 60

/** What the last run saw, so a move can be reported rather than a bare number. */
interface Seen {
  at: number
  rates: Record<string, string>
}

async function readSeen(): Promise<Seen | null> {
  try {
    const raw = await SecureStore.getItemAsync(SEEN_KEY)
    return raw ? (JSON.parse(raw) as Seen) : null
  } catch {
    return null
  }
}

async function writeSeen(seen: Seen): Promise<void> {
  try {
    await SecureStore.setItemAsync(SEEN_KEY, JSON.stringify(seen))
  } catch {
    // Storage refused. The next run simply reports levels instead of moves.
  }
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Rate watch',
    description: 'Hourly movement in the corridors you follow.',
    importance: Notifications.AndroidImportance.LOW,
  })
}

/** "1 USD = ¥156.88" at the corridor's own precision. */
function level(rate: bigint, dp: number, symbol: string): string {
  const whole = rate / 10n ** 18n
  const frac = ((rate % 10n ** 18n) * 10n ** BigInt(dp)) / 10n ** 18n
  const text = dp > 0 ? `${whole}.${frac.toString().padStart(dp, '0')}` : `${whole}`
  return /^[A-Za-z]/.test(symbol) ? `${symbol} ${text}` : `${symbol}${text}`
}

/** Basis points of movement, or null when there is nothing to compare against. */
function moveBps(now: bigint, before: bigint | undefined): number | null {
  if (before === undefined || before === 0n) return null
  return Number(((now - before) * 10_000n) / before)
}

/**
 * One pass: read the rates, compare with last time, notify if anything is worth saying.
 *
 * Exported so the settings screen can run it on demand. A person who taps "check now" and
 * sees the same notification the background task would post knows the whole path works.
 */
export async function runRateWatch(keys: string[]): Promise<{ posted: boolean; summary: string }> {
  const payload = await fetchRates()
  const seen = await readSeen()
  const next: Record<string, string> = {}
  const lines: string[] = []

  for (const key of keys) {
    const corridor = CORRIDORS.find((c) => c.key === key)
    const rate = payload.rates.find((r) => r.key === key)
    if (!corridor || !rate?.rate) continue
    const value = BigInt(rate.rate)
    next[key] = rate.rate
    const bps = moveBps(value, seen?.rates[key] ? BigInt(seen.rates[key]) : undefined)
    const arrow = bps === null ? '·' : bps > 0 ? '▲' : bps < 0 ? '▼' : '–'
    const move = bps === null ? 'first reading' : `${arrow} ${Math.abs(bps)} bps`
    lines.push(`${corridor.target} ${level(value, corridor.rateDp, corridor.targetSymbol)} ${move}`)
  }

  await writeSeen({ at: Math.floor(Date.now() / 1000), rates: next })
  if (lines.length === 0) return { posted: false, summary: 'No rate was available to read.' }

  const summary = lines.join('\n')
  await ensureChannel()
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '1 USD buys',
      body: summary,
      ...(Platform.OS === 'android' ? { channelId: CHANNEL } : {}),
    },
    trigger: null, // now
  })
  return { posted: true, summary }
}

/** Which corridors the watch follows. Live ones by default; the rest have no rate to report. */
export const WATCHABLE = CORRIDORS.filter((c) => c.feed).map((c) => c.key)

const KEYS_KEY = 'henad.rateWatch.keys'

/**
 * Which corridors to report on. Stored, not held in memory: the background task runs in a
 * fresh process that has never seen the settings screen, and a module variable there is
 * always the default.
 */
export function setWatchedCorridors(keys: string[]): void {
  const chosen = keys.length > 0 ? keys : WATCHABLE
  SecureStore.setItemAsync(KEYS_KEY, JSON.stringify(chosen)).catch(() => {
    // Refused storage leaves the default in place, which reports every live corridor.
  })
}

export async function watchedKeys(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(KEYS_KEY)
    const keys = raw ? (JSON.parse(raw) as string[]).filter((k) => WATCHABLE.includes(k)) : []
    return keys.length > 0 ? keys : WATCHABLE
  } catch {
    return WATCHABLE
  }
}

TaskManager.defineTask(TASK, async () => {
  // Recorded separately from "Check now", so the settings screen can tell a background run
  // that happened from a tap that happened. Until this exists there is no way to know
  // whether Android ever woke the app at all.
  const at = Math.floor(Date.now() / 1000)
  try {
    const { posted } = await runRateWatch(await watchedKeys())
    await writeBackgroundRun({ at, outcome: posted ? 'posted' : 'nothing' })
    return posted ? BackgroundTask.BackgroundTaskResult.Success : BackgroundTask.BackgroundTaskResult.Failed
  } catch {
    // A failed fetch is not worth a notification; the next run will try again.
    await writeBackgroundRun({ at, outcome: 'failed' })
    return BackgroundTask.BackgroundTaskResult.Failed
  }
})

export async function startRateWatch(): Promise<void> {
  await ensureChannel()
  await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: INTERVAL_MINUTES })
}

export async function stopRateWatch(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(TASK)) await BackgroundTask.unregisterTaskAsync(TASK)
}

export async function rateWatchState(): Promise<{
  on: boolean
  available: boolean
  lastAt: number | null
  /** The last time Android actually woke the app for this, as opposed to a tap on "Check now". */
  background: BackgroundRun | null
}> {
  const [registered, status, seen, background] = await Promise.all([
    TaskManager.isTaskRegisteredAsync(TASK),
    BackgroundTask.getStatusAsync(),
    readSeen(),
    readBackgroundRun(),
  ])
  return {
    on: registered,
    available: status === BackgroundTask.BackgroundTaskStatus.Available,
    lastAt: seen?.at ?? null,
    background,
  }
}
