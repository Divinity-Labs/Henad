import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import * as Clipboard from 'expo-clipboard'
import type { Address } from 'viem'
import { cleanName, payLink } from '@henad/core'
import type { Holding } from '@/lib/balance'
import { Button, Card, Dashed, Eyebrow, TextLink } from '@/ui'
import { color, font, track } from '@/theme'
import { units } from '@/send/format'
import { TokenIcon } from '@/tokens/TokenIcon'

/**
 * The account: how to get paid, what it holds, and the way to settings.
 *
 * The QR holds the pay link, not the address. Henad's scanner and a phone's own camera both
 * open it as "pay this person", with the name they chose, and nobody has to read a string of
 * hex to be paid. The account number itself is still one tap away for the one case that needs
 * it: money sent from an exchange or another wallet, which knows nothing of pay links.
 * Holdings are read from the chain on open; nothing here is cached or estimated.
 */
export function ProfileScreen({
  address,
  holdings,
  loading,
  myName,
  onMyName,
  onRefresh,
  onSettings,
}: {
  address: Address
  holdings: Holding[] | null
  loading: boolean
  /** The name this person put on their own pay link. */
  myName: string | null
  onMyName: (name: string | null) => void
  onRefresh: () => void
  onSettings: () => void
}) {
  const held = holdings?.filter((h) => h.value > 0n) ?? []
  const [draft, setDraft] = useState(myName ?? '')
  const [copied, setCopied] = useState<'link' | 'account' | null>(null)
  const [showAccount, setShowAccount] = useState(false)

  // The stored name arrives after the first render; typing has not started by then.
  useEffect(() => setDraft(myName ?? ''), [myName])

  // Built from what is typed, so the QR and the shared link always match the field on screen.
  const link = payLink(address, draft)

  const commitName = () => {
    const clean = cleanName(draft)
    setDraft(clean ?? '')
    if (clean !== myName) onMyName(clean)
  }

  // onEndEditing alone loses the name. Share and Copy leave the field focused (taps are handled
  // without closing the keyboard), and leaving the screen from there unmounts it before any blur
  // arrives, so the link just shared would carry a name the account never kept.
  const latest = useRef({ draft, myName, onMyName })
  useEffect(() => {
    latest.current = { draft, myName, onMyName }
  })
  useEffect(
    () => () => {
      const { draft, myName, onMyName } = latest.current
      const clean = cleanName(draft)
      if (clean !== myName) onMyName(clean)
    },
    [],
  )

  // A link that leaves the phone carries the name, so the name is kept at the same moment.
  const copy = (what: 'link' | 'account') => {
    if (what === 'link') commitName()
    void Clipboard.setStringAsync(what === 'link' ? link : address)
    setCopied(what)
    setTimeout(() => setCopied(null), 2000)
  }

  const share = () => {
    commitName()
    void Share.share({ message: `Pay me with Henad: ${link}` })
  }

  return (
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <View style={s.body}>
        <Eyebrow tone="purple">Your account</Eyebrow>

        <Card style={s.qrCard}>
          <Eyebrow>Get paid</Eyebrow>
          <View style={s.qr}>
            <QRCode value={link} size={208} color={color.ink} backgroundColor={color.surface} quietZone={8} />
          </View>
          <Text style={s.help}>Anyone with Henad can pay you by scanning this or opening your link.</Text>
          <View style={s.field}>
            <Eyebrow>Your name on the link</Eyebrow>
            <TextInput
              style={s.input}
              value={draft}
              onChangeText={setDraft}
              onEndEditing={commitName}
              placeholder="Optional, like Ada"
              placeholderTextColor={color.muted}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              maxLength={40}
              accessibilityLabel="Your name on the pay link"
            />
            <Text style={s.fieldHelp}>Whoever opens your link sees it marked as unchecked until they save you as a contact.</Text>
          </View>
          <View style={s.actions}>
            <Button label="Share link" small height={44} style={s.flex} onPress={share} />
            <Button label={copied === 'link' ? 'Copied' : 'Copy link'} variant="secondary" small height={44} style={s.flex} onPress={() => copy('link')} />
          </View>
        </Card>

        <Card style={s.card}>
          <Pressable onPress={() => setShowAccount((v) => !v)} style={s.rowBetween} accessibilityRole="button" accessibilityState={{ expanded: showAccount }}>
            <Eyebrow>Account number</Eyebrow>
            <Eyebrow>{showAccount ? '▴' : '▾'}</Eyebrow>
          </Pressable>
          {showAccount ? (
            <>
              <Text style={s.address} selectable>
                {address}
              </Text>
              <Text style={s.help}>For people sending from an exchange or another wallet, on the Monad network.</Text>
              <Button label={copied === 'account' ? 'Copied' : 'Copy account number'} variant="secondary" onPress={() => copy('account')} height={40} small />
            </>
          ) : null}
        </Card>

        <Card style={s.card}>
          <View style={s.rowBetween}>
            <Eyebrow>Holdings</Eyebrow>
            <TextLink label={loading ? 'Reading…' : 'Refresh'} tone="purple" onPress={loading ? undefined : onRefresh} />
          </View>
          <Dashed />
          {holdings === null ? (
            <Text style={s.help}>{loading ? 'Reading your balances…' : 'Balances could not be read. Try again.'}</Text>
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
  field: { gap: 6 },
  input: { height: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: color.border, borderRadius: 4, fontFamily: font.sans, fontSize: 15, color: color.ink },
  fieldHelp: { fontFamily: font.sans, fontSize: 12, lineHeight: 18, color: color.grey },
  actions: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  holding: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  token: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  symbol: { fontFamily: font.mono, fontSize: 13, color: color.grey },
  value: { fontFamily: font.display, fontSize: 22, letterSpacing: track(22, -0.02), color: color.ink },
  spacer: { flex: 1, minHeight: 12 },
  foot: { fontFamily: font.sans, fontSize: 12, lineHeight: 18, color: color.muted, textAlign: 'center' },
})
