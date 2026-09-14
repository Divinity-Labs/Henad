import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Address } from 'viem'
import { formatUnits, readBalance, shortAddress, sourceToken } from '@/lib/balance'
import { continueWithPasskey, describeAccountError, loadStoredAccount, signIn, type MeraAccount } from '@/lib/mera'
import { rpId } from '@/lib/config'
import { color, mono } from '@/theme'

/**
 * The account screen.
 *
 * This is deliberately the whole app for now. Before any of the send flow is worth
 * porting, one thing has to be true on a real device: the passkey created on the web at
 * usehenad.xyz must produce the *same address* here. If it does not, the two clients are
 * different products and nothing built on top of them matters.
 *
 * So the screen shows the address large, and nothing else competes with it.
 */
export default function AccountScreen() {
  const insets = useSafeAreaInsets()
  const session = useRef<MeraAccount | null>(null)
  const [address, setAddress] = useState<Address | null>(null)
  const [balance, setBalance] = useState<bigint | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A previous launch's address, shown without asking for the passkey again. The key is
  // not restored here and is not needed: reading a balance requires no signature.
  useEffect(() => {
    void loadStoredAccount().then((stored) => {
      if (stored) setAddress(stored.address)
    })
  }, [])

  useEffect(() => () => session.current?.end(), [])

  useEffect(() => {
    if (!address) return
    let live = true
    void readBalance(address).then((b) => {
      if (live) setBalance(b)
    })
    return () => {
      live = false
    }
  }, [address])

  const run = useCallback(async (fn: () => Promise<MeraAccount>) => {
    setBusy(true)
    setError(null)
    try {
      const account = await fn()
      session.current?.end()
      session.current = account
      setAddress(account.address)
    } catch (e) {
      setError(describeAccountError(e))
    } finally {
      setBusy(false)
    }
  }, [])

  const token = sourceToken()

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 }]}
    >
      <Text style={s.wordmark}>Henad</Text>
      <Text style={s.label}>Account</Text>

      {address ? (
        <View style={s.card}>
          <Text style={s.cardLabel}>YOUR ADDRESS</Text>
          <Text style={s.address} selectable>
            {address}
          </Text>
          <Text style={s.short}>{shortAddress(address)}</Text>
          <View style={s.rule} />
          <View style={s.row}>
            <Text style={s.rowKey}>Balance</Text>
            <Text style={s.rowValue}>{balance === null ? '—' : `${formatUnits(balance, token.decimals)} ${token.symbol}`}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.rowKey}>Passkey domain</Text>
            <Text style={s.rowValue}>{rpId()}</Text>
          </View>
        </View>
      ) : (
        <View style={s.card}>
          <Text style={s.body}>
            Your account comes from a passkey. No seed phrase, no wallet, and nothing to write down. The same passkey works on
            the web and here, and gives the same account.
          </Text>
        </View>
      )}

      {error ? <Text style={s.error}>{error}</Text> : null}

      <Pressable style={[s.button, busy && s.buttonBusy]} disabled={busy} onPress={() => void run(continueWithPasskey)}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>{address ? 'RE-AUTHENTICATE' : 'CONTINUE WITH PASSKEY'}</Text>}
      </Pressable>

      <Pressable style={s.secondary} disabled={busy} onPress={() => void run(() => signIn())}>
        <Text style={s.secondaryText}>I already have a passkey</Text>
      </Pressable>

      <Text style={s.foot}>PASSKEY BY MERA · BUILT ON MONAD</Text>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  content: { paddingHorizontal: 20, gap: 14 },
  wordmark: { fontSize: 26, fontWeight: '600', color: color.ink, letterSpacing: -0.6 },
  label: { ...mono, fontSize: 11, letterSpacing: 1.2, color: color.muted, marginBottom: 4 },
  card: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.hairline, borderRadius: 12, padding: 18, gap: 10 },
  cardLabel: { ...mono, fontSize: 10, letterSpacing: 1.2, color: color.muted },
  address: { ...mono, fontSize: 13, color: color.ink, lineHeight: 20 },
  short: { ...mono, fontSize: 12, color: color.purple },
  rule: { height: 1, backgroundColor: color.hairline, marginVertical: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowKey: { ...mono, fontSize: 12, color: color.muted },
  rowValue: { ...mono, fontSize: 12, color: color.ink },
  body: { fontSize: 15, lineHeight: 23, color: color.grey },
  error: { ...mono, fontSize: 12, lineHeight: 19, color: '#b4341f' },
  button: { backgroundColor: color.ink, borderRadius: 8, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  buttonBusy: { opacity: 0.6 },
  buttonText: { ...mono, fontSize: 12, letterSpacing: 1.1, color: '#fff' },
  secondary: { paddingVertical: 14, alignItems: 'center' },
  secondaryText: { ...mono, fontSize: 12, color: color.grey },
  foot: { ...mono, fontSize: 10, letterSpacing: 1, color: color.muted, textAlign: 'center', marginTop: 8 },
})
