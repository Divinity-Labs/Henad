import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { CORRIDORS, type Corridor } from '@henad/core'
import type { RatesPayload } from '@/lib/api'
import { hms, rateText, tokenText } from '@/lib/display'
import { ErrorText, Eyebrow, TierBadge } from '@/ui'
import { color, font, track } from '@/theme'

/**
 * S4. What the spread actually was.
 *
 * Departures from the canvas:
 * - The footer said "Indexed by Envio · Labels by Nansen". Nansen was dropped and the Envio
 *   indexer is not built, so it names what the figures actually come from.
 * - Tiers come from the registry. The rand is Unpriced, not Quote: its only price on Monad
 *   was last published in 2025 and every staleness-checked read reverts.
 *
 * The three figures across the top are settlements on the chain this build settles on, so on
 * testnet with no contracts they read zero. That is the correct number.
 */
export function RatesScreen({
  data,
  loading,
  error,
  onRefresh,
  onSend,
}: {
  data: RatesPayload | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  onSend: (c: Corridor) => void
}) {
  const count = data?.ledger.count ?? 0
  const last = data?.ledger.last ?? null
  const lastCorridor = last ? CORRIDORS.find((c) => c.key === last.corridorKey) : undefined

  return (
    <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={color.purple} />}>
      <View style={s.hero}>
        <Text style={s.watermark}>{String(count).padStart(2, '0')}</Text>
        <Eyebrow tone="purple">Rates · Monad mainnet</Eyebrow>
        <Text style={s.title}>What the spread actually was.</Text>
      </View>

      <View style={s.stats}>
        <Stat label="Settled" value={String(count)} />
        <Stat label="Spread" value={last ? `${last.spreadBps} bps` : '—'} />
        <Stat
          label="Delivered"
          value={last && lastCorridor ? tokenText(BigInt(last.deliveredAmount), last.targetAsset.decimals, last.targetAsset.symbol, lastCorridor.currencyDp) : '—'}
          last
        />
      </View>

      <View style={s.sectionHead}>
        <Text style={s.section}>Corridors</Text>
        <Text style={s.sectionMeta}>LIVE FEEDS ONLY</Text>
      </View>
      {error ? <ErrorText>{`  ${error}`}</ErrorText> : null}

      <View>
        {CORRIDORS.map((c, i) => {
          const r = data?.rates.find((x) => x.key === c.key)
          const value = c.tier === 'unpriced' ? '—' : r?.stale ? 'stale' : r?.rate ? rateText(BigInt(r.rate), c) : '…'
          const sub = c.tier === 'live' && r?.updatedAt ? `${c.shortNote} · ${hms(r.updatedAt)}` : c.shortNote
          const row = (
            <View
              style={[
                s.row,
                i === 0 ? s.rowFirst : s.rowNext,
                i === 0 && c.tier === 'live' && s.rowTint,
                i === CORRIDORS.length - 1 && s.rowLast,
              ]}
            >
              <View style={s.badgeCol}>
                <TierBadge tier={c.tier} />
              </View>
              <View style={s.mid}>
                <Text style={[s.pair, c.tier === 'live' && s.strong]}>{`${c.source} → ${c.target}`}</Text>
                <Text style={s.sub}>{sub}</Text>
              </View>
              <Text style={[s.value, c.tier === 'live' && !r?.stale ? s.strong : s.valueMuted]}>{value}</Text>
            </View>
          )
          return c.tier === 'live' ? (
            <Pressable key={c.key} onPress={() => onSend(c)} accessibilityRole="button" accessibilityLabel={`Send USD to ${c.target}`}>
              {row}
            </Pressable>
          ) : (
            <View key={c.key}>{row}</View>
          )
        })}
      </View>

      <View style={s.spacer} />
      <View style={s.foot}>
        <Text style={s.footText}>RATES BY CHAINLINK · MENTO</Text>
        <Text style={s.footText}>{data ? `READ ${hms(data.now)} UTC` : ''}</Text>
      </View>
    </ScrollView>
  )
}

function Stat({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[s.stat, !last && s.statRule]}>
      <Text style={s.statLabel}>{label.toUpperCase()}</Text>
      <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  )
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1 },
  hero: { overflow: 'hidden', gap: 8, paddingTop: 24, paddingHorizontal: 16, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: color.hairline },
  watermark: { position: 'absolute', right: -6, top: -14, fontFamily: font.display, fontSize: 96, lineHeight: 96, letterSpacing: track(96, -0.06), color: color.watermark },
  title: { fontFamily: font.display, fontSize: 28, lineHeight: 30, letterSpacing: track(28, -0.03), color: color.ink, maxWidth: 260 },
  stats: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: color.hairline },
  stat: { flex: 1, gap: 4, paddingVertical: 14, paddingHorizontal: 16 },
  statRule: { borderRightWidth: 1, borderRightColor: color.hairline },
  statLabel: { fontFamily: font.mono, fontSize: 9, letterSpacing: track(9, 0.12), color: color.muted },
  statValue: { fontFamily: font.display, fontSize: 20, letterSpacing: track(20, -0.03), color: color.ink },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 20, paddingHorizontal: 16, paddingBottom: 8 },
  section: { fontFamily: font.display, fontSize: 17, letterSpacing: track(17, -0.02), color: color.ink },
  sectionMeta: { fontFamily: font.mono, fontSize: 9, letterSpacing: track(9, 0.08), color: color.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 16 },
  rowFirst: { borderTopWidth: 1, borderTopColor: color.hairline },
  rowNext: { borderTopWidth: 1, borderTopColor: color.hairline2 },
  rowLast: { borderBottomWidth: 1, borderBottomColor: color.hairline },
  rowTint: { backgroundColor: color.rowTint },
  badgeCol: { width: 58 },
  mid: { flex: 1, gap: 3 },
  pair: { fontFamily: font.mono, fontSize: 11, color: color.ink },
  strong: { fontFamily: font.monoMedium },
  sub: { fontFamily: font.mono, fontSize: 10, color: color.muted },
  value: { fontFamily: font.mono, fontSize: 11, color: color.ink, fontVariant: ['tabular-nums'] },
  valueMuted: { color: color.muted },
  spacer: { flex: 1, minHeight: 16 },
  foot: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16 },
  footText: { fontFamily: font.mono, fontSize: 9, letterSpacing: track(9, 0.08), color: color.muted },
})
