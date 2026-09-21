import { ScrollView, StyleSheet, Text, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import type { Address } from 'viem'
import type { Holding } from '@/lib/balance'
import { Button, Card, Dashed, Eyebrow, TextLink } from '@/ui'
import { color, font, track } from '@/theme'
import { units } from '@/send/format'
import { TokenIcon } from '@/tokens/TokenIcon'

/**
 * The account: its address as text and as a QR code, what it holds, and sign out.
 *
 * The QR holds the bare checksummed address, not a payment URI, so any wallet's scanner reads
 * it and Henad's own scanner fills the recipient field from it. Holdings are read from the
 * chain on open; nothing here is cached or estimated.
 */
export function ProfileScreen({
  address,
  network,
  holdings,
  loading,
  copied,
  onCopy,
  onRefresh,
  onSettings,
}: {
  address: Address
  network: string
  holdings: Holding[] | null
  loading: boolean
  copied: boolean
  onCopy: () => void
  onRefresh: () => void
  onSettings: () => void
}) {
  const held = holdings?.filter((h) => h.value > 0n) ?? []
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <View style={s.body}>
        <View style={s.rowBetween}>
          <Eyebrow tone="purple">Your account</Eyebrow>
          <Eyebrow>{network}</Eyebrow>
        </View>

        <Card style={s.qrCard}>
          <View style={s.qr}>
            <QRCode value={address} size={208} color={color.ink} backgroundColor={color.surface} quietZone={8} />
          </View>
          <Text style={s.address} selectable>
            {address}
          </Text>
          <Text style={s.help}>Anyone paying you on Monad can scan this. Send only Monad assets to it.</Text>
          <Button label={copied ? 'Copied' : 'Copy address'} variant="secondary" onPress={onCopy} height={44} small />
        </Card>

        <Card style={s.card}>
          <View style={s.rowBetween}>
            <Eyebrow>Holdings</Eyebrow>
            <TextLink label={loading ? 'Reading…' : 'Refresh'} tone="purple" onPress={loading ? undefined : onRefresh} />
          </View>
          <Dashed />
          {holdings === null ? (
            <Text style={s.help}>{loading ? 'Reading balances from the chain…' : 'Balances could not be read. Try again.'}</Text>
          ) : held.length === 0 ? (
            <Text style={s.help}>Nothing on this account yet.</Text>
          ) : (
            held.map((h) => (
              <View key={h.symbol} style={s.holding}>
                <View style={s.token}>
                  <TokenIcon symbol={h.symbol} size={24} />
                  <Text style={s.symbol}>{h.symbol}</Text>
                </View>
                <Text style={s.value}>{units(h.value, h.decimals, 2)}</Text>
              </View>
            ))
          )}
        </Card>


        <View style={s.spacer} />
        <Button label="Settings" variant="secondary" onPress={onSettings} />
        <Text style={s.foot}>Alerts, this build&apos;s version, and signing out live in settings.</Text>
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1 },
  body: { flex: 1, gap: 12, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  qrCard: { padding: 20, gap: 14, alignItems: 'stretch' },
  qr: { alignSelf: 'center', padding: 6, borderRadius: 12, backgroundColor: color.surface },
  address: { fontFamily: font.mono, fontSize: 13, lineHeight: 20, letterSpacing: track(13, 0.02), color: color.ink, textAlign: 'center' },
  card: { padding: 16, gap: 10 },
  help: { fontFamily: font.sans, fontSize: 12, lineHeight: 18, color: color.grey, textAlign: 'center' },
  holding: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  token: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  symbol: { fontFamily: font.mono, fontSize: 13, color: color.grey },
  value: { fontFamily: font.display, fontSize: 22, letterSpacing: track(22, -0.02), color: color.ink },
  spacer: { flex: 1, minHeight: 12 },
  queued: { fontFamily: font.mono, fontSize: 11, color: color.muted, textAlign: 'center' },
  foot: { fontFamily: font.sans, fontSize: 12, lineHeight: 18, color: color.muted, textAlign: 'center' },
})
