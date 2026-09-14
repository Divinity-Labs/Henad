import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { nextTransition, type Corridor } from '@henad/core'
import type { ReceiptDto } from '@/lib/api'
import { dayStamp, hm, rateLineText, weekdayLong } from '@/lib/display'
import { Button, Card, Chip, Eyebrow, Line } from '@/ui'
import { color, font, track } from '@/theme'

/**
 * S5. The FX market is closed, so Henad will not quote.
 *
 * Every time on this screen comes from the Mento breaker's schedule mirrored in
 * @henad/core, not from the canvas, which assumed Sunday 22:00. The breaker reopens at
 * 23:00 UTC. The last-settled lines appear only when there is a real settlement to cite.
 */
export function ClosedStep({
  corridor,
  now,
  amount,
  source,
  last,
  onBrowseRates,
  onOpenReceipt,
}: {
  corridor: Corridor
  now: number
  amount: string
  source: { symbol: string }
  last: ReceiptDto | null
  onBrowseRates: () => void
  onOpenReceipt: (intentId: string) => void
}) {
  const nowS = Math.floor(now / 1000)
  const first = nextTransition(nowS)
  const opens = first.opens ? first : nextTransition(first.at)
  const name = corridor.targetName.charAt(0).toUpperCase() + corridor.targetName.slice(1)

  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <View style={s.body}>
        <View style={s.rowBetween}>
          <Eyebrow tone="purple">Send</Eyebrow>
          <Eyebrow>{`${dayStamp(nowS)} · ${hm(nowS)} UTC`}</Eyebrow>
        </View>

        <View style={s.dark}>
          <Text style={s.watermark} numberOfLines={1}>
            {hm(opens.at)}
          </Text>
          <View style={s.closedRow}>
            <View style={s.amberDot} />
            <Eyebrow tone="amber">FX market closed</Eyebrow>
          </View>
          <Text style={s.title}>{`${name} reopen ${weekdayLong(opens.at)} at ${hm(opens.at)} UTC.`}</Text>
          <Text style={s.copy}>
            {`Mento’s market-hours breaker pauses ${corridor.venue?.label ?? 'the pool'} over the weekend, so Henad cannot quote a rate it could settle. Receipts and rates stay open.`}
          </Text>
        </View>

        <Card style={s.lines}>
          {last ? (
            <>
              <Line k="Last settled rate" v={rateLineText(BigInt(last.executedRate), corridor)} />
              <Line k="Settled at" v={`${dayStamp(last.settledAt)} · ${hm(last.settledAt)} UTC`} />
            </>
          ) : (
            <Line k="Last settled rate" v="No settlement yet" />
          )}
          <Line k="Reference feed" v={`${corridor.feed?.label ?? '—'} · paused`} />
          <Line k="Next open" v={`${dayStamp(opens.at)} · ${hm(opens.at)} UTC`} strong last />
        </Card>

        <Card style={s.faded}>
          <Eyebrow>You send</Eyebrow>
          <View style={s.rowBetween}>
            <Text style={s.amount}>{`$${amount || '0.00'}`}</Text>
            <Chip filled>{`${source.symbol} · Monad`}</Chip>
          </View>
        </Card>

        <View style={s.spacer} />
        <Button label={`Opens ${dayStamp(opens.at).split(' ')[0]} ${hm(opens.at)} UTC`} variant="disabled" />
        <View style={s.actions}>
          <Button label="Browse rates" small variant="secondary" height={48} style={s.flex} onPress={onBrowseRates} />
          {last && last.index !== null ? (
            <Button label={`Receipt #${last.index}`} small variant="secondary" height={48} style={s.flex} onPress={() => onOpenReceipt(last.intentId)} />
          ) : null}
        </View>
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1 },
  body: { flex: 1, gap: 10, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  dark: { overflow: 'hidden', backgroundColor: color.dark, borderRadius: 12, paddingVertical: 20, paddingHorizontal: 18, gap: 12 },
  watermark: { position: 'absolute', right: -10, bottom: -34, fontFamily: font.displayBold, fontSize: 120, letterSpacing: track(120, -0.06), color: 'rgba(255,255,255,0.06)' },
  closedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  amberDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.amber },
  title: { fontFamily: font.display, fontSize: 26, lineHeight: 28, letterSpacing: track(26, -0.03), color: '#FFFFFF' },
  copy: { fontFamily: font.sans, fontSize: 13, lineHeight: 20, color: color.dim },
  lines: { paddingHorizontal: 14 },
  faded: { padding: 16, gap: 10, opacity: 0.55 },
  amount: { fontFamily: font.display, fontSize: 38, letterSpacing: track(38, -0.035), color: color.ink },
  spacer: { flex: 1, minHeight: 8 },
  actions: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
})
