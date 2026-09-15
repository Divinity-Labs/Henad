import { Image, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Button, ErrorText, Eyebrow } from '@/ui'
import { color, font, images, track } from '@/theme'

const POINTS = [
  'Henad never holds your money. Funds move wallet to wallet in one transaction.',
  'No fiat, no custody, no KYC. Identity checks stay with the licensed ramps you already use.',
]

/**
 * S0. The canvas's sign-in screen, with the parts that are not true of this app removed.
 *
 * The design offers "Continue with email" and "Connect a wallet I have" and says "Secured by
 * Privy". Henad uses Mera passkeys and nothing else, so those two buttons would do nothing
 * and the attribution would be false. "I already have a passkey" takes the second button's
 * place, because it is the recovery path: with no pinned credential the platform lists every
 * passkey for this relying party, which is how a new phone reaches an account made on the web.
 *
 * The design's "You can export it any time" is also gone. Export is not built.
 */
export function SignInStep({
  busy,
  error,
  chain,
  onContinue,
  onSignIn,
}: {
  busy: boolean
  error: string | null
  chain: string
  onContinue: () => void
  onSignIn: () => void
}) {
  return (
    <ScrollView contentContainerStyle={s.scroll} bounces={false}>
      <View style={s.hero}>
        <Image source={images.signinGlow} style={s.glow} resizeMode="stretch" />
        <Eyebrow tone="purple">Sign in</Eyebrow>
        <Text style={s.title}>A wallet you don’t have to think about.</Text>
        <Text style={s.body}>
          Your passkey creates your account on Monad. No seed phrase, nothing to write down, and the same passkey opens it on the web.
        </Text>
      </View>

      <View style={s.actions}>
        <Button label="Continue with passkey" onPress={onContinue} busy={busy} />
        <Button label="I already have a passkey" variant={busy ? 'disabled' : 'secondary'} onPress={onSignIn} />
        {error ? <ErrorText>{error}</ErrorText> : null}
        <View style={s.meta}>
          <Text style={s.metaText}>PASSKEY BY MERA</Text>
          <Text style={s.metaText}>{chain.toUpperCase()}</Text>
        </View>
        <View style={s.spacer} />
        <View style={s.points}>
          {POINTS.map((p, i) => (
            <View key={p} style={s.point}>
              <Text style={s.pointNo}>{`0${i + 1}`}</Text>
              <Text style={s.pointText}>{p}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1 },
  hero: { overflow: 'hidden', gap: 16, paddingTop: 40, paddingHorizontal: 20, paddingBottom: 32, borderBottomWidth: 1, borderBottomColor: color.hairline },
  // left and right pin it to the hero's edges. A width of 100% as well would size it to the
  // content box inside the hero's padding, so it stopped 40dp short of the right edge.
  glow: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 160 },
  title: { fontFamily: font.display, fontSize: 32, lineHeight: 33, letterSpacing: track(32, -0.035), color: color.ink },
  body: { fontFamily: font.sans, fontSize: 14, lineHeight: 22, color: color.grey },
  actions: { flex: 1, gap: 10, paddingTop: 24, paddingHorizontal: 16 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 14 },
  metaText: { fontFamily: font.mono, fontSize: 10, letterSpacing: track(10, 0.08), color: color.muted },
  spacer: { flex: 1, minHeight: 24 },
  points: { gap: 10, paddingTop: 16, paddingBottom: 20, borderTopWidth: 1, borderTopColor: color.hairline },
  point: { flexDirection: 'row', gap: 10 },
  pointNo: { fontFamily: font.mono, fontSize: 12, lineHeight: 18, color: color.purple },
  pointText: { flex: 1, fontFamily: font.sans, fontSize: 12, lineHeight: 18, color: color.grey },
})
