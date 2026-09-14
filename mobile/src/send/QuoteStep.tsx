import { useMemo } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { countdown, quoteFreshness, quoteMaths, type Corridor, type QuoteDto } from '@henad/core'
import { Button, Card, Label, Notice, Row, Rule } from '@/ui'
import { color, mono } from '@/theme'
import { money, rateLine, spreadLine } from './format'

/**
 * Step two, and the reason the product exists.
 *
 * The spread is the headline, in the recipient's currency and in basis points, before
 * anything is signed. Everything else on this screen is subordinate to that sentence.
 *
 * The countdown is not decoration: the quote is a reading of a feed at a moment, and
 * offering to settle against a stale one would be the same trick the product is arguing
 * against. When it expires the button is replaced rather than merely disabled.
 */
export function QuoteStep({
  corridor,
  quote,
  now,
  sourceDecimals,
  maxSpreadBps,
  onSpread,
  recipient,
  deployed,
  busy,
  error,
  onSend,
  onBack,
  onRequote,
}: {
  corridor: Corridor
  quote: QuoteDto
  now: number
  sourceDecimals: number
  maxSpreadBps: number
  onSpread: (bps: number) => void
  recipient: string
  deployed: boolean
  busy: boolean
  error: string | null
  onSend: () => void
  onBack: () => void
  onRequote: () => void
}) {
  const target = corridor.targetAsset
  const m = useMemo(() => quoteMaths(quote, sourceDecimals, target?.decimals ?? 18), [quote, sourceDecimals, target])
  const fresh = quoteFreshness(quote.expiresAt, now)
  const sym = corridor.targetSymbol
  const dp = corridor.currencyDp

  if (fresh === 'expired') {
    return (
      <ScrollView contentContainerStyle={s.body}>
        <Card>
          <Label>QUOTE EXPIRED</Label>
          <Text style={s.headline}>The rate moved on.</Text>
          <Notice>A quote is a reading of a feed at one moment. Rather than settle against a stale one, here is a fresh one.</Notice>
        </Card>
        <Button onPress={onRequote} busy={busy}>
          GET A NEW QUOTE
        </Button>
        <Button onPress={onBack} variant="secondary">
          BACK
        </Button>
      </ScrollView>
    )
  }

  return (
    <ScrollView contentContainerStyle={s.body}>
      <View style={s.headRow}>
        <Label>QUOTE · STEP 2 OF 2</Label>
        <Label style={fresh === 'expiring' ? s.expiring : undefined}>EXPIRES {countdown(quote.expiresAt, now)}</Label>
      </View>

      <Text style={s.headline}>
        You are paying <Text style={s.spread}>{money(m.spreadCost, target?.decimals ?? 18, sym, dp)}</Text> in spread. That is{' '}
        {m.spreadBps} bps.
      </Text>

      <Card>
        <Row k="Reference rate" v={rateLine(m.referenceRate, sym, corridor.rateDp)} />
        <Row k="Your rate" v={rateLine(m.executedRate, sym, corridor.rateDp)} />
        <Row k="Spread" v={spreadLine(m.spreadCost, target?.decimals ?? 18, sym, m.spreadBps, dp)} strong />
        <Rule />
        <Row k="Rate source" v={corridor.feed?.label ?? '—'} />
        <Row k="Venue" v={corridor.venue?.label ?? '—'} />
        <Row k="Recipient" v={`${recipient.slice(0, 8)}…${recipient.slice(-6)}`} />
      </Card>

      <View style={s.delivered}>
        <Label style={s.deliveredLabel}>RECIPIENT RECEIVES</Label>
        <Text style={s.deliveredAmount}>{money(m.delivered, target?.decimals ?? 18, sym, dp)}</Text>
        <Text style={s.deliveredNote}>for {money(m.sourceAmount, sourceDecimals, '$')} · final in about 0.6 s</Text>
      </View>

      <Card>
        <Label>WORST RATE YOU WILL ACCEPT</Label>
        <View style={s.stepper}>
          <Text style={s.stepperValue}>{maxSpreadBps} bps</Text>
          <View style={s.stepperButtons}>
            <Text style={s.stepperBtn} onPress={() => onSpread(maxSpreadBps - 5)} accessibilityRole="button">
              −
            </Text>
            <Text style={s.stepperBtn} onPress={() => onSpread(maxSpreadBps + 5)} accessibilityRole="button">
              +
            </Text>
          </View>
        </View>
        <Notice>If the fill is worse than this, the payout reverts. Nothing moves.</Notice>
      </Card>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <Button onPress={onSend} disabled={!deployed} busy={busy}>
        SEND PAYOUT
      </Button>
      {!deployed ? <Notice>Contracts are not deployed on this chain yet.</Notice> : null}
      <Button onPress={onBack} variant="secondary">
        BACK
      </Button>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  body: { padding: 20, gap: 14, paddingBottom: 48 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between' },
  expiring: { color: '#b4341f' },
  headline: { fontSize: 24, lineHeight: 31, fontWeight: '500', color: color.ink, letterSpacing: -0.4 },
  spread: { color: color.purple },
  delivered: { backgroundColor: color.ink, borderRadius: 12, padding: 18, gap: 4 },
  deliveredLabel: { color: '#B9AEFF' },
  deliveredAmount: { fontSize: 34, fontWeight: '600', color: '#fff', letterSpacing: -0.8 },
  deliveredNote: { ...mono, fontSize: 11, color: 'rgba(255,255,255,.65)' },
  stepper: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepperValue: { ...mono, fontSize: 16, color: color.ink },
  stepperButtons: { flexDirection: 'row', gap: 8 },
  stepperBtn: {
    ...mono,
    fontSize: 18,
    width: 44,
    height: 40,
    lineHeight: 38,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 6,
    color: color.ink,
    overflow: 'hidden',
  },
})
