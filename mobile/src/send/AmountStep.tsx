import { useMemo } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { isAddress } from 'viem'
import type { Corridor } from '@henad/core'
import { Button, Card, Label, Notice, Row, Rule } from '@/ui'
import { color, mono } from '@/theme'
import { parseAmount, sanitizeAmount, units } from './format'

/**
 * Step one. Amount, corridor, recipient.
 *
 * The live reference rate is shown here rather than only on the quote, so the number a
 * person is about to be offered is never the first number they see. The button explains
 * why it is disabled instead of just being grey.
 */
export function AmountStep({
  corridors,
  corridor,
  onCorridor,
  amount,
  onAmount,
  recipient,
  onRecipient,
  balance,
  sourceSymbol,
  sourceDecimals,
  busy,
  error,
  onQuote,
}: {
  corridors: Corridor[]
  corridor: Corridor
  onCorridor: (c: Corridor) => void
  amount: string
  onAmount: (v: string) => void
  recipient: string
  onRecipient: (v: string) => void
  balance: bigint | null
  sourceSymbol: string
  sourceDecimals: number
  busy: boolean
  error: string | null
  onQuote: () => void
}) {
  const parsed = useMemo(() => parseAmount(amount, sourceDecimals), [amount, sourceDecimals])

  const blocker = useMemo(() => {
    if (corridor.tier !== 'live') return corridor.note
    if (!parsed) return 'Enter an amount.'
    if (balance !== null && parsed > balance) return `That is more than your ${sourceSymbol} balance.`
    if (!recipient) return 'Add a recipient address.'
    if (!isAddress(recipient)) return 'That recipient address is not valid.'
    return null
  }, [corridor, parsed, balance, recipient, sourceSymbol])

  return (
    <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
      <Card>
        <View style={s.headRow}>
          <Label>YOU SEND</Label>
          <Label>{balance === null ? 'BALANCE —' : `BALANCE ${units(balance, sourceDecimals, 2)}`}</Label>
        </View>
        <View style={s.amountRow}>
          <Text style={s.currency}>$</Text>
          <TextInput
            style={s.amount}
            value={amount}
            onChangeText={(v) => onAmount(sanitizeAmount(v))}
            placeholder="0.00"
            placeholderTextColor={color.border}
            keyboardType="decimal-pad"
            inputMode="decimal"
            accessibilityLabel="Amount to send"
          />
          <Text style={s.asset}>{sourceSymbol}</Text>
        </View>
      </Card>

      <Label style={s.sectionLabel}>RECIPIENT RECEIVES</Label>
      <View style={s.corridors}>
        {corridors.map((c) => {
          const on = c.key === corridor.key
          return (
            <Text
              key={c.key}
              onPress={() => onCorridor(c)}
              accessibilityRole="button"
              style={[s.chip, on && s.chipOn, c.tier !== 'live' && s.chipMuted]}
            >
              {c.targetSymbol} {c.target}
            </Text>
          )
        })}
      </View>

      <Card>
        {corridor.tier === 'live' ? (
          <Row k="Rate source" v={corridor.feed?.label ?? '—'} />
        ) : (
          <Notice>{corridor.note}</Notice>
        )}
        <Rule />
        <Label>RECIPIENT</Label>
        <TextInput
          style={s.address}
          value={recipient}
          onChangeText={onRecipient}
          placeholder="0x… address on Monad"
          placeholderTextColor={color.border}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Recipient address"
        />
      </Card>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <Button onPress={onQuote} disabled={blocker !== null} busy={busy}>
        GET QUOTE
      </Button>
      {blocker ? <Notice>{blocker}</Notice> : <Notice>Nothing moves until you approve the rate.</Notice>}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  body: { padding: 20, gap: 14, paddingBottom: 48 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between' },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  currency: { fontSize: 40, fontWeight: '300', color: color.muted },
  amount: { flex: 1, fontSize: 40, fontWeight: '500', color: color.ink, padding: 0 },
  asset: { ...mono, fontSize: 12, color: color.grey },
  sectionLabel: { marginTop: 4 },
  corridors: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    ...mono,
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: color.border,
    color: color.ink,
    overflow: 'hidden',
  },
  chipOn: { backgroundColor: color.ink, color: '#fff', borderColor: color.ink },
  chipMuted: { color: color.muted },
  address: { ...mono, fontSize: 13, color: color.ink, paddingVertical: 6 },
})
