import { useCallback, useEffect, useMemo, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { parseUnits, type Address } from 'viem'
import { CLAIM_LINK_DAYS, type LinkState } from '@henad/core'
import { readBalance } from '@/lib/balance'
import { createLink, linkUrl, loadSentLinks, readLinkNow, takeBack, type LinkSymbol, type SentLink } from '@/lib/claims'
import { describeAccountError, unlockStoredAccount } from '@/lib/mera'
import { Button, Card, Dashed, ErrorText, Eyebrow, TextLink } from '@/ui'
import { color, font, track } from '@/theme'
import { units } from '@/send/format'
import { TokenIcon } from '@/tokens/TokenIcon'

const DECIMALS = 6
const AMOUNT_RE = /^\d+(\.\d{1,6})?$/

/**
 * Send by link: money for someone who is not on Henad yet. The same as the web's /link. The
 * money waits in ClaimEscrow until they open the link in any browser and claim it with a
 * passkey, or until the sender takes it back here. Henad pays the network fee both ways.
 */
export function LinksScreen({ address, onBack }: { address: Address; onBack: () => void }) {
  const [symbol, setSymbol] = useState<LinkSymbol>('AUSD')
  const [amount, setAmount] = useState('')
  const [balance, setBalance] = useState<bigint | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [made, setMade] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [links, setLinks] = useState<SentLink[]>([])

  const reload = useCallback(() => {
    void loadSentLinks(address).then(setLinks)
  }, [address])
  useEffect(reload, [reload])

  useEffect(() => {
    let live = true
    readBalance(address, symbol).then(
      (b) => live && setBalance(b),
      () => live && setBalance(null),
    )
    return () => {
      live = false
    }
  }, [address, symbol, made])

  const value = useMemo(() => {
    const v = amount.trim()
    return AMOUNT_RE.test(v) && Number(v) > 0 ? parseUnits(v, DECIMALS) : null
  }, [amount])
  const tooMuch = value !== null && balance !== null && value > balance
  const ready = value !== null && !tooMuch && !busy

  async function make() {
    if (!ready || value === null) return
    setBusy(true)
    setError(null)
    let account: Awaited<ReturnType<typeof unlockStoredAccount>> | null = null
    try {
      account = await unlockStoredAccount()
      setMade(await createLink(account.account, symbol, value))
      setAmount('')
      reload()
    } catch (e) {
      setError(account ? (e instanceof Error ? e.message : 'The link could not be made. Try again.') : describeAccountError(e))
    } finally {
      account?.end()
      setBusy(false)
    }
  }

  const share = (url: string) => void Share.share({ message: `I sent you money with Henad. Open this to get it: ${url}` })
  const copy = (url: string) => {
    void Clipboard.setStringAsync(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.body}>
          <View style={s.rowBetween}>
            <Eyebrow tone="purple">Send by link</Eyebrow>
            <TextLink label="Back" tone="muted" onPress={onBack} />
          </View>

          {made ? (
            <View style={s.ready}>
              <Eyebrow tone="lavender">Your link is ready</Eyebrow>
              <Text style={s.readyLink} selectable>
                {made}
              </Text>
              <Text style={s.readyHelp}>Anyone with this link can take the money, so send it only to them. You can take it back below until they do.</Text>
              <View style={s.actions}>
                <Button label="Share link" small height={44} style={s.flex} onPress={() => share(made)} />
                <Button label={copied ? 'Copied' : 'Copy'} variant="secondary" small height={44} style={s.flex} onPress={() => copy(made)} />
              </View>
              <TextLink label="Send another" tone="muted" onPress={() => setMade(null)} />
            </View>
          ) : (
            <>
              <Text style={s.title}>Pay someone who isn’t on Henad yet.</Text>
              <Text style={s.help}>
                {`You get a link to send them any way you like. They open it, tap once, and the money is theirs. Until they do, you can take it back. Links close after ${CLAIM_LINK_DAYS} days.`}
              </Text>
              <Card style={s.card}>
                <View style={s.rowBetween}>
                  <Eyebrow>You send</Eyebrow>
                  <Eyebrow>{balance === null ? '—' : `Balance ${units(balance, DECIMALS, 2)}`}</Eyebrow>
                </View>
                <View style={s.amountRow}>
                  <View style={s.amountField}>
                    <Text style={s.amount}>$</Text>
                    <TextInput
                      style={[s.amount, s.amountInput]}
                      value={amount}
                      onChangeText={(t) => {
                        setAmount(t.replace(',', '.'))
                        setError(null)
                      }}
                      placeholder="0.00"
                      placeholderTextColor={color.border}
                      keyboardType="decimal-pad"
                      accessibilityLabel="Amount to send by link"
                    />
                  </View>
                  <View style={s.pills}>
                    {(['AUSD', 'USDC'] as const).map((t) => (
                      <Pressable
                        key={t}
                        onPress={() => setSymbol(t)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: symbol === t }}
                        style={[s.pill, symbol === t && s.pillOn]}
                      >
                        <TokenIcon symbol={t} size={16} />
                        <Text style={[s.pillText, symbol !== t && { color: color.muted }]}>{t}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </Card>
              {tooMuch ? <ErrorText>That is more than you have.</ErrorText> : null}
              {error ? <ErrorText>{error}</ErrorText> : null}
              <Button label={busy ? 'Making your link…' : 'Make link'} busy={busy} variant={ready ? 'primary' : 'disabled'} onPress={() => void make()} />
              <Text style={s.foot}>Henad pays the network fee. Your passkey signs once.</Text>
            </>
          )}

          {links.length > 0 ? (
            <Card style={s.card}>
              <Eyebrow>Links you’ve sent</Eyebrow>
              <Dashed />
              {links.map((l) => (
                <SentRow key={l.claimSigner} link={l} onShare={() => share(linkUrl(l.key))} />
              ))}
            </Card>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function SentRow({ link, onShare }: { link: SentLink; onShare: () => void }) {
  const [state, setState] = useState<LinkState | 'error' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [round, setRound] = useState(0)

  useEffect(() => {
    let live = true
    readLinkNow(link.claimSigner).then(
      (s) => live && setState(s),
      () => live && setState('error'),
    )
    return () => {
      live = false
    }
  }, [link.claimSigner, round])

  async function back() {
    setBusy(true)
    setError(null)
    let account: Awaited<ReturnType<typeof unlockStoredAccount>> | null = null
    try {
      account = await unlockStoredAccount()
      await takeBack(account.account, link.claimSigner)
      setRound((n) => n + 1)
    } catch (e) {
      setError(account ? (e instanceof Error ? e.message : 'That did not go through. Try again.') : describeAccountError(e))
    } finally {
      account?.end()
      setBusy(false)
    }
  }

  const status =
    state === null
      ? 'Checking…'
      : state === 'error'
        ? 'Could not check'
        : state.kind === 'open'
          ? 'Waiting to be claimed'
          : state.kind === 'expired'
            ? 'Expired, not claimed'
            : 'Claimed or taken back'
  const open = state !== null && state !== 'error' && (state.kind === 'open' || state.kind === 'expired')
  return (
    <View style={s.sent}>
      <View style={s.rowBetween}>
        <View>
          <Text style={s.sentAmount}>{`${units(link.amount, DECIMALS, 2)} ${link.symbol}`}</Text>
          <Text style={s.sentMeta}>{`${new Date(link.createdAt * 1000).toLocaleDateString()} · ${status}`}</Text>
        </View>
        {open ? (
          <View style={s.sentActions}>
            {state.kind === 'open' ? <TextLink label="Share" tone="purple" onPress={onShare} /> : null}
            <TextLink label={busy ? 'Taking back…' : 'Take back'} onPress={busy ? undefined : () => void back()} />
          </View>
        ) : null}
      </View>
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  body: { flex: 1, gap: 12, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: font.display, fontSize: 26, lineHeight: 29, letterSpacing: track(26, -0.03), color: color.ink },
  help: { fontFamily: font.sans, fontSize: 14, lineHeight: 21, color: color.grey },
  card: { padding: 16, gap: 10 },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  amountField: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  amount: { fontFamily: font.display, fontSize: 38, letterSpacing: track(38, -0.035), color: color.ink, flexShrink: 1 },
  amountInput: { flex: 1, padding: 0, margin: 0 },
  pills: { gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: color.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  pillOn: { borderColor: color.purple, backgroundColor: color.rowTint },
  pillText: { fontFamily: font.mono, fontSize: 12, color: color.ink },
  foot: { textAlign: 'center', fontFamily: font.mono, fontSize: 10, letterSpacing: track(10, 0.06), color: color.muted },
  ready: { gap: 10, padding: 16, borderRadius: 12, backgroundColor: color.dark },
  readyLink: { fontFamily: font.mono, fontSize: 12, lineHeight: 18, color: '#FFFFFF' },
  readyHelp: { fontFamily: font.sans, fontSize: 12, lineHeight: 18, color: color.dim },
  actions: { flexDirection: 'row', gap: 8 },
  sent: { gap: 6, paddingVertical: 4 },
  sentAmount: { fontFamily: font.display, fontSize: 20, letterSpacing: track(20, -0.02), color: color.ink },
  sentMeta: { fontFamily: font.mono, fontSize: 10, color: color.muted },
  sentActions: { flexDirection: 'row', gap: 14, alignItems: 'center' },
})
