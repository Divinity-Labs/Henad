import { useEffect, useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Constants from 'expo-constants'
import { CORRIDORS } from '@henad/core'
import { WATCHABLE } from '@/lib/rate-watch'
import { Button, Card, Dashed, Eyebrow, Line, TextLink } from '@/ui'
import { color, font, track } from '@/theme'

const REPO = 'https://github.com/Miracle656/Henad'
const RELEASES = `${REPO}/releases`
const LATEST = 'https://api.github.com/repos/Miracle656/Henad/releases/latest'
const SITE = 'https://usehenad.xyz'

export interface WatchView {
  on: boolean
  available: boolean
  /** Corridor keys being followed. */
  keys: string[]
  note: string
}

export interface AlertsView {
  on: boolean
  note: string
  /** The times this phone is actually holding, so a schedule that never fired is visible. */
  queued: string[]
}

/**
 * Settings: the things that are true of this installation rather than of your account.
 *
 * An app installed from a file has no store behind it, so it has to answer for itself which
 * version it is, whether a newer one exists, and what it promises. The alert controls live
 * here too, with the queue shown: a notification that never arrives is otherwise indis-
 * tinguishable from one that was never scheduled.
 */
export function SettingsScreen({
  network,
  alerts,
  onToggleAlerts,
  onTestAlert,
  watch,
  onToggleWatch,
  onToggleCorridor,
  onCheckNow,
  onSignOut,
  onBack,
}: {
  network: string
  alerts: AlertsView
  onToggleAlerts: () => void
  onTestAlert: () => void
  watch: WatchView
  onToggleWatch: () => void
  onToggleCorridor: (key: string) => void
  onCheckNow: () => void
  onSignOut: () => void
  onBack: () => void
}) {
  const version = Constants.expoConfig?.version ?? '0.0.0'
  const build = Constants.expoConfig?.android?.versionCode
  const [update, setUpdate] = useState<{ state: 'checking' | 'current' | 'newer' | 'unknown'; tag?: string }>({ state: 'checking' })

  useEffect(() => {
    let live = true
    fetch(LATEST, { headers: { accept: 'application/vnd.github+json' } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { tag_name?: string }) => {
        if (!live) return
        const tag = body.tag_name?.replace(/^v/, '')
        if (!tag) return setUpdate({ state: 'unknown' })
        setUpdate(tag === version ? { state: 'current', tag } : { state: 'newer', tag })
      })
      .catch(() => live && setUpdate({ state: 'unknown' }))
    return () => {
      live = false
    }
  }, [version])

  const updateNote =
    update.state === 'checking'
      ? 'Checking for a newer build…'
      : update.state === 'current'
        ? 'This is the newest release.'
        : update.state === 'newer'
          ? `Version ${update.tag} is out. Installing it keeps your account: your passkey owns it, not the app.`
          : 'Could not reach GitHub, so this cannot say whether a newer build exists.'

  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <View style={s.body}>
        <View style={s.rowBetween}>
          <Eyebrow tone="purple">Settings</Eyebrow>
          <Eyebrow>{network}</Eyebrow>
        </View>

        <Card style={s.card}>
          <View style={s.rowBetween}>
            <Eyebrow>Market alerts</Eyebrow>
            <TextLink label={alerts.on ? 'Turn off' : 'Turn on'} tone="purple" onPress={onToggleAlerts} />
          </View>
          <Dashed />
          <Text style={s.help}>{alerts.note}</Text>
          {alerts.queued.map((q) => (
            <Text key={q} style={s.queued}>
              {q}
            </Text>
          ))}
          <TextLink label="Send a test alert" tone="purple" onPress={onTestAlert} />
          <Text style={s.fine}>
            If the test does not arrive, this phone is holding the notification back rather than Henad failing to send it. Allow notifications for Henad, and
            exclude it from battery optimisation.
          </Text>
        </Card>

        <Card style={s.card}>
          <View style={s.rowBetween}>
            <Eyebrow>Rate watch</Eyebrow>
            <TextLink label={watch.on ? 'Turn off' : 'Turn on'} tone="purple" onPress={watch.available ? onToggleWatch : undefined} />
          </View>
          <Dashed />
          <Text style={s.help}>{watch.note}</Text>
          <View style={s.pills}>
            {WATCHABLE.map((key) => {
              const corridor = CORRIDORS.find((c) => c.key === key)
              const on = watch.keys.includes(key)
              return (
                <Pressable key={key} onPress={() => onToggleCorridor(key)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[s.pill, on && s.pillOn]}>
                  <Text style={[s.pillText, !on && { color: color.muted }]}>{corridor?.target ?? key}</Text>
                </Pressable>
              )
            })}
          </View>
          <TextLink label="Check now" tone="purple" onPress={onCheckNow} />
          <Text style={s.fine}>
            An hour is the soonest Android will wake the app, not a promise of when: it batches background work and skips it while the phone is dozing. The
            figures come from the same endpoint the rates screen reads.
          </Text>
        </Card>

        <Card style={s.card}>
          <Eyebrow>This build</Eyebrow>
          <Dashed />
          <Line k="Version" v={version} strong />
          <Line k="Build" v={build !== undefined ? String(build) : 'unnumbered'} />
          <Line k="Network" v={network} last />
          <Text style={s.help}>{updateNote}</Text>
          <Button
            label={update.state === 'newer' ? `Get ${update.tag}` : 'Releases'}
            variant={update.state === 'newer' ? 'primary' : 'secondary'}
            height={44}
            small
            onPress={() => void Linking.openURL(RELEASES)}
          />
        </Card>

        <Card style={s.card}>
          <Eyebrow>What this app promises</Eyebrow>
          <Dashed />
          <Text style={s.help}>
            Your passkey is your account. Nobody can reset it, recover it or move your funds, including us. A payout cannot be undone, and it settles with
            real money.
          </Text>
          <View style={s.links}>
            <TextLink label="Terms of service ↗" tone="purple" onPress={() => void Linking.openURL(`${SITE}/docs/terms`)} />
            <TextLink label="Privacy ↗" tone="purple" onPress={() => void Linking.openURL(`${SITE}/docs/privacy`)} />
            <TextLink label="The contracts ↗" tone="purple" onPress={() => void Linking.openURL(`${SITE}/docs/contracts`)} />
          </View>
        </Card>

        <Card style={s.card}>
          <Eyebrow>Open source</Eyebrow>
          <Dashed />
          <Text style={s.help}>
            Henad&apos;s own code is MIT, and every contract it deploys is verified on Monadscan, so the source you read is the code that runs. It stands on
            React Native, Expo, viem, Mera, OpenZeppelin and Foundry, all MIT or Apache 2.0. Instrument Sans, Inter and Roboto Mono are used under the SIL
            Open Font License.
          </Text>
          <TextLink label="Source and licences ↗" tone="purple" onPress={() => void Linking.openURL(REPO)} />
        </Card>

        <View style={s.spacer} />
        <Button label="Sign out of this phone" variant="secondary" onPress={onSignOut} />
        <Text style={s.fine}>Signing out forgets the account on this phone. Your passkey still opens it, here or on the web.</Text>
        <Button label="Back to account" variant="secondary" height={44} small onPress={onBack} />
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1 },
  body: { flex: 1, gap: 12, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  card: { padding: 16, gap: 10 },
  help: { fontFamily: font.sans, fontSize: 13, lineHeight: 19, color: color.grey },
  fine: { fontFamily: font.sans, fontSize: 12, lineHeight: 18, color: color.muted },
  queued: { fontFamily: font.mono, fontSize: 11, color: color.muted, letterSpacing: track(11, 0.02) },
  links: { gap: 8 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { borderWidth: 1, borderColor: color.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  pillOn: { borderColor: color.purple, backgroundColor: color.rowTint },
  pillText: { fontFamily: font.mono, fontSize: 12, color: color.ink },
  spacer: { flex: 1, minHeight: 12 },
})
