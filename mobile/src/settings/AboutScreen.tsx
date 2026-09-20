import { useEffect, useState } from 'react'
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native'
import Constants from 'expo-constants'
import { Button, Card, Dashed, Eyebrow, Line, TextLink } from '@/ui'
import { color, font, track } from '@/theme'

const REPO = 'https://github.com/Miracle656/Henad'
const RELEASES = `${REPO}/releases`
const LATEST = 'https://api.github.com/repos/Miracle656/Henad/releases/latest'

/**
 * About: what you are running, whether there is a newer one, and the promises the app makes.
 *
 * An app installed from a file rather than a store has no update mechanism, so it has to ask.
 * This reads GitHub's latest release once when the screen opens. A failure says so plainly
 * rather than claiming you are up to date, because "up to date" would be a guess.
 */
export function AboutScreen({ network, onBack }: { network: string; onBack: () => void }) {
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
          ? `Version ${update.tag} has been released. Installing it keeps your account: your passkey is what owns it, not the app.`
          : 'Could not reach GitHub, so this cannot say whether a newer build exists.'

  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <View style={s.body}>
        <View style={s.rowBetween}>
          <Eyebrow tone="purple">About</Eyebrow>
          <Eyebrow>{network}</Eyebrow>
        </View>
        <Text style={s.title}>Henad {version}</Text>

        <Card style={s.card}>
          <Line k="Version" v={version} strong />
          <Line k="Build" v={build !== undefined ? String(build) : 'unnumbered'} />
          <Line k="Network" v={network} last />
          <Dashed />
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
            Your passkey is your account. Nobody can reset it, recover it or move your funds, including us. A payout cannot be undone, and it settles on
            Monad mainnet with real money.
          </Text>
          <View style={s.links}>
            <TextLink label="Terms of service ↗" tone="purple" onPress={() => void Linking.openURL('https://usehenad.xyz/docs/terms')} />
            <TextLink label="Privacy ↗" tone="purple" onPress={() => void Linking.openURL('https://usehenad.xyz/docs/privacy')} />
            <TextLink label="The contracts ↗" tone="purple" onPress={() => void Linking.openURL('https://usehenad.xyz/docs/contracts')} />
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
        <Button label="Back to account" variant="secondary" onPress={onBack} />
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1 },
  body: { flex: 1, gap: 12, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: font.display, fontSize: 28, lineHeight: 30, letterSpacing: track(28, -0.03), color: color.ink },
  card: { padding: 16, gap: 10 },
  help: { fontFamily: font.sans, fontSize: 13, lineHeight: 19, color: color.grey },
  links: { gap: 8 },
  spacer: { flex: 1, minHeight: 12 },
})
