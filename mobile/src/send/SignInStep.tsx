import { ScrollView, StyleSheet, Text } from 'react-native'
import { Button, Card, Label, Notice } from '@/ui'
import { color } from '@/theme'

const POINTS = [
  'Henad never holds your money. Funds move wallet to wallet in one transaction.',
  'No fiat, no custody, no KYC. Identity checks stay with the licensed ramps you already use.',
]

/**
 * Step zero. One passkey ceremony creates or restores the account.
 *
 * "I already have a passkey" is not a convenience. It is the recovery path: with no
 * pinned credential the platform lists every discoverable passkey for this relying
 * party, which is how a new phone reaches an account created on the web.
 */
export function SignInStep({
  busy,
  error,
  onContinue,
  onSignIn,
}: {
  busy: boolean
  error: string | null
  onContinue: () => void
  onSignIn: () => void
}) {
  return (
    <ScrollView contentContainerStyle={s.body}>
      <Label>ACCOUNT</Label>
      <Text style={s.headline}>Send money abroad. Keep proof of the rate.</Text>

      <Card>
        <Text style={s.body_}>
          Your account comes from a passkey. No seed phrase, no extension, nothing to write down. The same passkey works on the
          web and here, and gives the same account.
        </Text>
        {POINTS.map((p) => (
          <Notice key={p}>{p}</Notice>
        ))}
      </Card>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <Button onPress={onContinue} busy={busy}>
        CONTINUE WITH PASSKEY
      </Button>
      <Button onPress={onSignIn} variant="secondary" disabled={busy}>
        I ALREADY HAVE A PASSKEY
      </Button>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  body: { padding: 20, gap: 14, paddingBottom: 48 },
  headline: { fontSize: 26, lineHeight: 33, fontWeight: '500', color: color.ink, letterSpacing: -0.6 },
  body_: { fontSize: 15, lineHeight: 23, color: color.grey },
})
