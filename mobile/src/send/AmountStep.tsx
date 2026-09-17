import { useMemo, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { isAddress } from 'viem'
import type { Corridor } from '@henad/core'
import type { RateDto } from '@/lib/api'
import { age, atRate, rateLineText, tokenText } from '@/lib/display'
import { Button, Card, Chip, ErrorText, Eyebrow, TextLink, TierBadge } from '@/ui'
import { color, font, track } from '@/theme'
import { parseAmount, sanitizeAmount, units } from './format'
import { TokenIcon } from '@/tokens/TokenIcon'

/**
 * S1. Amount, corridor and recipient.
 *
 * Departures from the canvas, each because the design shows something this app does not do:
 * - No "Fund from another chain · Aurora Intents" row. That route is not built, and a link
 *   that goes nowhere is a claim.
 * - The recipient has no name. Henad keeps no address book, so the card shows the address,
 *   not "Ada Okonkwo".
 * - The tier line is computed from the registry, so it says what is true today rather than
 *   what was true when the canvas was drawn.
 */
export function AmountStep({
  corridors,
  corridor,
  onCorridor,
  rate,
  now,
  amount,
  onAmount,
  recipient,
  onRecipient,
  onPaste,
  onScan,
  balance,
  source,
  busy,
  error,
  onQuote,
  onWhy,
}: {
  corridors: Corridor[]
  corridor: Corridor
  onCorridor: (c: Corridor) => void
  rate: RateDto | undefined
  now: number
  amount: string
  onAmount: (v: string) => void
  recipient: string
  onRecipient: (v: string) => void
  onPaste: () => void
  onScan: () => void
  balance: bigint | null
  source: { symbol: string; decimals: number }
  busy: boolean
  error: string | null
  onQuote: () => void
  onWhy: () => void
}) {
  const [picking, setPicking] = useState(false)
  // The recipient field sits at the bottom of the screen, under the keyboard once it opens.
  // The avoiding view shrinks the scroll area and this brings the field back into view.
  const scroll = useRef<ScrollView>(null)
  const parsed = useMemo(() => parseAmount(amount, source.decimals), [amount, source.decimals])
  const reference = rate?.rate ? BigInt(rate.rate) : null
  const targetDecimals = corridor.targetAsset?.decimals ?? 18

  const receives = parsed && reference ? tokenText(atRate(parsed, source.decimals, reference, targetDecimals), targetDecimals, corridor.targetAsset?.symbol ?? corridor.target, corridor.currencyDp) : '—'

  const tierLine = useMemo(() => {
    const others = corridors.filter((c) => c.key !== corridor.key)
    const live = others.filter((c) => c.tier === 'live').map((c) => c.target)
    const quote = others.filter((c) => c.tier === 'quote').map((c) => c.target)
    return [live.length ? `${live.join(' ')} live` : null, quote.length ? `${quote.join(' ')} priced only` : null].filter(Boolean).join(' · ')
  }, [corridors, corridor.key])

  const blocker = useMemo(() => {
    if (corridor.tier !== 'live') return corridor.note
    if (!parsed) return 'Enter an amount.'
    if (balance !== null && parsed > balance) return `That is more than your ${source.symbol} balance.`
    if (!recipient) return 'Add a recipient address.'
    if (!isAddress(recipient)) return 'That recipient address is not valid.'
    if (!reference) return 'The reference rate is unavailable right now.'
    return null
  }, [corridor, parsed, balance, recipient, source.symbol, reference])

  const rateMeta =
    corridor.tier !== 'live' ? corridor.shortNote : rate?.stale ? 'stale' : rate?.updatedAt ? `Mento · Chainlink · ${age(now / 1000 - rate.updatedAt)}` : 'reading…'

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView ref={scroll} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <View style={s.body}>
        <View style={s.rowBetween}>
          <Eyebrow tone="purple">Send</Eyebrow>
          <Eyebrow>Step 1 of 2</Eyebrow>
        </View>

        <Card style={s.card}>
          <View style={s.rowBetween}>
            <Eyebrow>You send</Eyebrow>
            <Eyebrow>{balance === null ? 'Balance —' : `Balance ${units(balance, source.decimals, 2)}`}</Eyebrow>
          </View>
          <View style={s.amountRow}>
            <View style={s.amountField}>
              <Text style={s.amount}>$</Text>
              <TextInput
                style={[s.amount, s.amountInput]}
                value={amount}
                onChangeText={(v) => onAmount(sanitizeAmount(v))}
                placeholder="0.00"
                placeholderTextColor={color.border}
                keyboardType="decimal-pad"
                accessibilityLabel="Amount to send"
              />
            </View>
            <View style={s.chipRow}>
              <TokenIcon symbol={source.symbol} size={22} />
              <Chip filled>{`${source.symbol} · Monad`}</Chip>
            </View>
          </View>
        </Card>

        <View style={s.rateLine}>
          <Text style={s.rateValue}>{reference ? rateLineText(reference, corridor) : `1 USD = ${corridor.targetSymbol} —`}</Text>
          <Text style={s.rateMeta}>{rateMeta}</Text>
        </View>

        <Card style={s.card}>
          <Eyebrow>Recipient receives</Eyebrow>
          <View style={s.amountRow}>
            <Text style={s.amount} numberOfLines={1} adjustsFontSizeToFit>
              {receives}
            </Text>
            <View style={s.chipRow}>
              {corridor.targetAsset ? <TokenIcon symbol={corridor.targetAsset.symbol} size={22} /> : null}
              <Chip filled onPress={() => setPicking((p) => !p)}>{`${corridor.target} ▾`}</Chip>
            </View>
          </View>
          {picking ? (
            <View style={s.picker}>
              {corridors.map((c) => (
                <Pressable
                  key={c.key}
                  onPress={() => {
                    onCorridor(c)
                    setPicking(false)
                  }}
                  style={[s.pickRow, c.key === corridor.key && s.pickRowOn]}
                >
                  <View style={s.chipRow}>
                    {c.targetAsset ? <TokenIcon symbol={c.targetAsset.symbol} size={20} /> : null}
                    <Text style={s.pickText}>{`USD → ${c.target}`}</Text>
                  </View>
                  <TierBadge tier={c.tier} />
                </Pressable>
              ))}
            </View>
          ) : null}
          <Text style={s.help}>At the reference rate. The exact amount after spread comes before you sign.</Text>
          <View style={s.tierRow}>
            <Text style={s.tierText}>{tierLine.toUpperCase()}</Text>
            <TextLink label="Why →" tone="purple" onPress={onWhy} />
          </View>
        </Card>

        <Card style={s.recipient}>
          {isAddress(recipient) ? (
            <>
              <View style={s.avatar}>
                <Text style={s.avatarText}>{recipient.slice(2, 4).toUpperCase()}</Text>
              </View>
              <View style={s.recipientText}>
                <Text style={s.recipientName}>Recipient</Text>
                <Text style={s.recipientAddr}>{`${recipient.slice(0, 6)}…${recipient.slice(-4)} · Monad`}</Text>
              </View>
              <TextLink label="Change" onPress={() => onRecipient('')} />
            </>
          ) : (
            <>
              <TextInput
                style={s.recipientInput}
                value={recipient}
                onChangeText={onRecipient}
                placeholder="0x… recipient on Monad"
                placeholderTextColor={color.muted}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Recipient address"
                onFocus={() => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 300)}
              />
              <TextLink label="Scan" tone="purple" onPress={onScan} />
              <TextLink label="Paste" tone="purple" onPress={onPaste} />
            </>
          )}
        </Card>

        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button label="Get quote" variant={blocker ? 'disabled' : 'primary'} onPress={onQuote} busy={busy} />
        <Text style={s.foot}>{blocker ?? 'Nothing moves until you approve the rate.'}</Text>
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scroll: { flexGrow: 1 },
  body: { flex: 1, gap: 10, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  card: { padding: 16, gap: 10 },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  amountField: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  amount: { fontFamily: font.display, fontSize: 38, letterSpacing: track(38, -0.035), color: color.ink, flexShrink: 1 },
  amountInput: { flex: 1, padding: 0, margin: 0 },
  rateLine: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, gap: 8 },
  rateValue: { fontFamily: font.mono, fontSize: 11, color: color.ink },
  rateMeta: { fontFamily: font.mono, fontSize: 11, color: color.muted, flexShrink: 1, textAlign: 'right' },
  picker: { borderTopWidth: 1, borderTopColor: color.hairline2 },
  pickRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9 },
  pickRowOn: { backgroundColor: color.rowTint },
  pickText: { fontFamily: font.mono, fontSize: 12, color: color.ink },
  help: { fontFamily: font.sans, fontSize: 12, lineHeight: 18, color: color.grey },
  tierRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: color.hairline2 },
  tierText: { flex: 1, fontFamily: font.mono, fontSize: 10, letterSpacing: track(10, 0.08), color: color.muted },
  recipient: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  avatar: { width: 40, height: 40, borderRadius: 8, backgroundColor: color.lilac, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: font.displayBold, fontSize: 13, color: color.lilacInk },
  recipientText: { flex: 1, gap: 2 },
  recipientName: { fontFamily: font.sansMedium, fontSize: 15, color: color.ink },
  recipientAddr: { fontFamily: font.mono, fontSize: 11, color: color.muted },
  recipientInput: { flex: 1, fontFamily: font.mono, fontSize: 13, color: color.ink, paddingVertical: 8 },
  spacer: { flex: 1, minHeight: 12 },
  foot: { textAlign: 'center', fontFamily: font.mono, fontSize: 10, letterSpacing: track(10, 0.06), color: color.muted },
})
