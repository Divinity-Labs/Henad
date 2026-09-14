import { useMemo } from 'react'
import { Image, Linking, ScrollView, StyleSheet, Text, View } from 'react-native'
import { MAX_SPREAD_STEP, countdown, deliveredAtSpreadCap, quoteFreshness, quoteMaths, type Corridor, type QuoteDto } from '@henad/core'
import { explorerAddress, moneyText, rateLineText } from '@/lib/display'
import { Button, Card, ErrorText, Eyebrow, Line, TextLink } from '@/ui'
import { color, font, images, track } from '@/theme'
import { units } from './format'

/**
 * S2. The reason the product exists: the spread, stated before anything is signed.
 *
 * Departures from the canvas:
 * - "Venue · Mento GBPm/USDm · Kuru off" loses "Kuru off". Kuru was dropped; naming a
 *   switched-off fallback implies one exists.
 * - "Network fee · 0.0003 MON" becomes "sponsored". The relayer pays the gas on this path,
 *   so the payer's fee is zero, and printing a MON figure would be printing a charge that
 *   does not happen.
 */
export function QuoteStep({
  corridor,
  quote,
  now,
  source,
  maxSpreadBps,
  onSpread,
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
  source: { symbol: string; decimals: number }
  maxSpreadBps: number
  onSpread: (bps: number) => void
  deployed: boolean
  busy: boolean
  error: string | null
  onSend: () => void
  onBack: () => void
  onRequote: () => void
}) {
  const td = corridor.targetAsset?.decimals ?? 18
  const m = useMemo(() => quoteMaths(quote, source.decimals, td), [quote, source.decimals, td])
  const fresh = quoteFreshness(quote.expiresAt, now)
  const worst = deliveredAtSpreadCap(m.referenceRate, maxSpreadBps, m.sourceAmount, source.decimals, td)

  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <View style={s.body}>
        <View style={s.rowBetween}>
          <Text style={s.eyebrowPurple}>
            QUOTE · <Text style={{ color: color.muted }}>STEP 2 OF 2</Text>
          </Text>
          {fresh === 'expired' ? (
            <Text style={[s.badge, s.badgeExpired]}>QUOTE EXPIRED</Text>
          ) : (
            <Text style={[s.badge, fresh === 'expiring' ? s.badgeExpiring : s.badgeFresh]}>{`EXPIRES ${countdown(quote.expiresAt, now)}`}</Text>
          )}
        </View>

        <Text style={s.headline}>
          You are paying <Text style={{ color: color.purple }}>{moneyText(m.spreadCost, td, corridor)}</Text> in spread. That is {m.spreadBps} bps.
        </Text>

        <Card style={s.lines}>
          <Line k="Reference rate" v={rateLineText(m.referenceRate, corridor)} />
          <Line k="Your rate" v={rateLineText(m.executedRate, corridor)} />
          <Line k="Spread" v={`${moneyText(m.spreadCost, td, corridor)} · ${m.spreadBps} bps`} strong />
          <Line k="Rate source">
            <Text style={s.value} onPress={corridor.feed ? () => void Linking.openURL(explorerAddress(corridor.feed!.ref)) : undefined}>
              {corridor.feed ? `${corridor.feed.label} ↗` : '—'}
            </Text>
          </Line>
          <Line k="Venue" v={corridor.venue?.label ?? '—'} />
          <Line k="Network fee" last>
            <View style={s.fee}>
              <Image source={images.monadMark} style={s.feeIcon} resizeMode="contain" />
              <Text style={s.value}>sponsored</Text>
            </View>
          </Line>
        </Card>

        <View style={s.delivered}>
          <Eyebrow tone="lavender">Recipient receives</Eyebrow>
          <Text style={s.deliveredAmount}>{moneyText(m.delivered, td, corridor)}</Text>
          <Text style={s.deliveredNote}>{`for $${units(m.sourceAmount, source.decimals, 2)} ${source.symbol} · final in under a second`}</Text>
        </View>

        <Card style={s.cap}>
          <View style={s.rowBetween}>
            <View style={{ gap: 3 }}>
              <Eyebrow>Worst rate you’ll accept</Eyebrow>
              <Text style={s.capValue}>{`${moneyText(worst, td, corridor)} · ${maxSpreadBps} bps`}</Text>
            </View>
            <View style={s.steppers}>
              <Text style={s.stepper} onPress={() => onSpread(maxSpreadBps - MAX_SPREAD_STEP)} accessibilityRole="button">
                −
              </Text>
              <Text style={s.stepper} onPress={() => onSpread(maxSpreadBps + MAX_SPREAD_STEP)} accessibilityRole="button">
                +
              </Text>
            </View>
          </View>
          <Text style={s.help}>If the fill is worse than this, the payout reverts. Nothing moves.</Text>
        </Card>

        {error ? <ErrorText>{error}</ErrorText> : null}
        <View style={s.spacer} />
        {fresh === 'expired' ? (
          <Button label="Get a new quote" variant="secondary" height={48} onPress={onRequote} busy={busy} />
        ) : (
          <Button label="Send payout" variant={deployed ? 'primary' : 'disabled'} height={48} onPress={onSend} busy={busy} />
        )}
        {!deployed && fresh !== 'expired' ? <Text style={s.note}>Contracts are not deployed on this chain yet.</Text> : null}
        <TextLink label="Back" tone="muted" onPress={onBack} style={s.back} />
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1 },
  body: { flex: 1, gap: 8, paddingVertical: 14, paddingHorizontal: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrowPurple: { fontFamily: font.mono, fontSize: 10, letterSpacing: track(10, 0.12), color: color.purple },
  badge: { fontFamily: font.mono, fontSize: 10, letterSpacing: track(10, 0.12), paddingHorizontal: 8, paddingVertical: 5, borderRadius: 4, overflow: 'hidden', fontVariant: ['tabular-nums'] },
  badgeFresh: { borderWidth: 1, borderColor: color.border, backgroundColor: color.surface, color: color.ink },
  badgeExpiring: { backgroundColor: color.amber, color: color.ink },
  badgeExpired: { backgroundColor: color.ink, color: '#FFFFFF' },
  headline: { fontFamily: font.display, fontSize: 24, lineHeight: 27, letterSpacing: track(24, -0.03), color: color.ink, paddingTop: 2 },
  lines: { paddingHorizontal: 14 },
  value: { fontFamily: font.mono, fontSize: 11, color: color.ink },
  fee: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  feeIcon: { width: 14, height: 14 },
  delivered: { backgroundColor: color.dark, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, gap: 4 },
  deliveredAmount: { fontFamily: font.display, fontSize: 32, letterSpacing: track(32, -0.035), color: '#FFFFFF' },
  deliveredNote: { fontFamily: font.mono, fontSize: 11, color: color.dim },
  cap: { paddingVertical: 10, paddingHorizontal: 14, gap: 6 },
  capValue: { fontFamily: font.monoMedium, fontSize: 13, color: color.ink, fontVariant: ['tabular-nums'] },
  steppers: { flexDirection: 'row', gap: 6 },
  stepper: {
    width: 44,
    height: 44,
    lineHeight: 42,
    textAlign: 'center',
    fontFamily: font.mono,
    fontSize: 18,
    color: color.ink,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 4,
    backgroundColor: color.surface,
    overflow: 'hidden',
  },
  help: { fontFamily: font.sans, fontSize: 12, lineHeight: 18, color: color.grey },
  spacer: { flex: 1, minHeight: 8 },
  note: { textAlign: 'center', fontFamily: font.mono, fontSize: 10, color: color.muted },
  back: { textAlign: 'center', paddingVertical: 6 },
})
