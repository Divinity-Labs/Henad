import { useEffect, useRef } from 'react'
import { Animated, Easing, Linking, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import type { Hex } from 'viem'
import type { Corridor } from '@henad/core'
import { receiptUrl } from '@/lib/api'
import { dateTimeStamp, explorerTx, moneyText, rateLineText } from '@/lib/display'
import { Button, Dashed, HenadMark, TextLink } from '@/ui'
import { color, font, track } from '@/theme'
import { shortId, units } from './format'

/** Everything the printed receipt shows. Nulls are figures the chain has not yet returned. */
export interface SentReceipt {
  intentId: Hex
  txHash: Hex
  chainId: number
  index: number | null
  settledAt: number | null
  block: bigint | null
  finalMs: number | null
  recipient: string
  sourceAmount: bigint
  sourceSymbol: string
  sourceDecimals: number
  delivered: bigint
  referenceRate: bigint
  executedRate: bigint
  spreadBps: number
  spreadCost: bigint
  rateSource: string | null
  maxSpreadBps: number
}

/**
 * S3. The receipt prints out of a slot.
 *
 * "Final in" is measured on this device, from the tap to the transaction receipt arriving,
 * rather than copied from the canvas. When the chain has not answered, the figure is left
 * out instead of guessed.
 */
export function SentStep({ corridor, r, onDone }: { corridor: Corridor; r: SentReceipt; onDone: () => void }) {
  const td = corridor.targetAsset?.decimals ?? 18
  const feed = useRef(new Animated.Value(0)).current
  const stamp = useRef(new Animated.Value(0)).current
  const toast = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(toast, { toValue: 1, duration: 500, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }),
      Animated.timing(feed, { toValue: 1, duration: 1600, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(1750),
        Animated.timing(stamp, { toValue: 1, duration: 450, easing: Easing.bezier(0.2, 1.4, 0.4, 1), useNativeDriver: true }),
      ]),
    ]).start()
  }, [feed, stamp, toast])

  const final = r.finalMs !== null ? `final in ${(r.finalMs / 1000).toFixed(1)} s` : 'broadcast'
  const url = receiptUrl(r.intentId)

  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Animated.View style={[s.toastWrap, { opacity: toast, transform: [{ translateY: toast.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
        <View style={s.toast}>
          <View style={s.dot} />
          <Text style={s.toastText}>PAYOUT SENT</Text>
          <Text style={s.toastMeta}>{final}</Text>
        </View>
      </Animated.View>

      <View style={s.body}>
        <View style={s.slot}>
          <View style={s.slotLine} />
        </View>
        <View style={s.clip}>
          <Animated.View style={[s.paperWrap, { transform: [{ translateY: feed.interpolate({ inputRange: [0, 1], outputRange: [-520, 0] }) }] }]}>
            <View style={s.paper}>
              <View style={s.rowBetween}>
                <View style={s.brand}>
                  <HenadMark size={16} />
                  <Text style={s.brandText}>Henad</Text>
                </View>
                <Text style={s.receiptNo}>{`SETTLEMENT RECEIPT${r.index !== null ? ` · #${r.index}` : ''}`}</Text>
              </View>
              <View style={s.rowBetween}>
                <Text style={s.small}>{`${corridor.source} → ${corridor.target} · Monad`}</Text>
                <Text style={s.small}>{r.settledAt ? dateTimeStamp(r.settledAt) : ''}</Text>
              </View>
              <Dashed />
              <Row k="Sent" v={`$${units(r.sourceAmount, r.sourceDecimals, 2)} · ${r.sourceSymbol}`} />
              <Row k="Reference rate" v={rateLineText(r.referenceRate, corridor)} />
              <Row k="Executed rate" v={rateLineText(r.executedRate, corridor)} />
              <Row k="Spread" v={`${moneyText(r.spreadCost, td, corridor)} · ${r.spreadBps >= 0 ? '+' : ''}${r.spreadBps} bps`} strong />
              <Dashed />
              <View style={s.deliveredBlock}>
                <Text style={s.label}>DELIVERED</Text>
                <Text style={s.deliveredAmount}>{moneyText(r.delivered, td, corridor)}</Text>
                <Text style={s.small}>{`to ${r.recipient.slice(0, 6)}…${r.recipient.slice(-4)}`}</Text>
                <Animated.View
                  style={[
                    s.stamp,
                    { opacity: stamp, transform: [{ rotate: '-4deg' }, { scale: stamp.interpolate({ inputRange: [0, 1], outputRange: [1.8, 1] }) }] },
                  ]}
                >
                  <Text style={s.stampText}>SETTLED</Text>
                </Animated.View>
              </View>
              <Dashed />
              <Row k="Rate source" v={`${corridor.feed?.label ?? '—'}${r.rateSource ? `\n${r.rateSource.slice(0, 6)}…${r.rateSource.slice(-4)}` : ''}`} />
              <Row k="Venue" v={corridor.venue?.label ?? '—'} />
              <Row k="Intent" v={shortId(r.intentId)} />
              <Row k="Block" v={r.block !== null ? `${r.block.toLocaleString('en-US')} · ${final}` : '—'} />
              <Row k="Max spread" v={`${r.maxSpreadBps} bps · ${r.spreadBps <= r.maxSpreadBps ? 'not exceeded' : 'exceeded'}`} />
            </View>
            <TornEdge />
          </Animated.View>
        </View>

        <View style={s.spacer} />
        <View style={s.actions}>
          <Button label="Share receipt" small style={s.flex} onPress={() => void Share.share({ message: url, url })} />
          <Button label="Monadscan ↗" small variant="secondary" style={s.flex} onPress={() => void Linking.openURL(explorerTx(r.chainId, r.txHash))} />
        </View>
        <TextLink label="Send another" tone="muted" onPress={onDone} style={s.again} />
      </View>
    </ScrollView>
  )
}

function Row({ k, v, strong = false }: { k: string; v: string; strong?: boolean }) {
  return (
    <View style={s.rowBetween}>
      <Text style={s.key}>{k}</Text>
      <Text style={[s.val, strong && { fontFamily: font.monoMedium }]}>{v}</Text>
    </View>
  )
}

/** The canvas masks the paper's bottom into scallops; here, canvas-coloured circles bite it. */
function TornEdge() {
  return (
    <View style={s.edge}>
      {Array.from({ length: 32 }, (_, i) => (
        <View key={i} style={s.tooth}>
          <View style={s.bite} />
        </View>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1 },
  toastWrap: { paddingTop: 10, paddingHorizontal: 16 },
  toast: { height: 44, paddingHorizontal: 14, borderRadius: 6, backgroundColor: color.dark, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.cyan },
  toastText: { fontFamily: font.mono, fontSize: 11, letterSpacing: track(11, 0.08), color: '#FFFFFF' },
  toastMeta: { marginLeft: 'auto', fontFamily: font.mono, fontSize: 11, color: color.dim },
  body: { flex: 1, paddingTop: 16, paddingHorizontal: 16 },
  slot: { height: 14, backgroundColor: color.dark, borderTopLeftRadius: 6, borderTopRightRadius: 6, zIndex: 2 },
  slotLine: { position: 'absolute', left: 14, right: 14, top: 5, height: 2, borderRadius: 1, backgroundColor: color.purple },
  clip: { overflow: 'hidden', paddingBottom: 24 },
  paperWrap: { shadowColor: color.ink, shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 18 }, elevation: 6 },
  paper: { backgroundColor: color.surface, borderWidth: 1, borderBottomWidth: 0, borderColor: color.hairline, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 18, gap: 9 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandText: { fontFamily: font.displayBold, fontSize: 16, letterSpacing: track(16, -0.03), color: color.ink },
  receiptNo: { fontFamily: font.mono, fontSize: 10, letterSpacing: track(10, 0.12), color: color.purple },
  small: { fontFamily: font.mono, fontSize: 10, color: color.muted },
  key: { fontFamily: font.mono, fontSize: 11, color: color.muted },
  val: { fontFamily: font.mono, fontSize: 11, color: color.ink, textAlign: 'right', flexShrink: 1, fontVariant: ['tabular-nums'] },
  deliveredBlock: { gap: 4, paddingVertical: 2 },
  label: { fontFamily: font.mono, fontSize: 10, letterSpacing: track(10, 0.12), color: color.muted },
  deliveredAmount: { fontFamily: font.display, fontSize: 34, letterSpacing: track(34, -0.035), color: color.ink },
  stamp: { position: 'absolute', right: 0, top: 0, borderWidth: 2, borderColor: color.purple, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 5 },
  stampText: { fontFamily: font.mono, fontSize: 10, letterSpacing: track(10, 0.16), color: color.purple },
  edge: { flexDirection: 'row', height: 8, overflow: 'hidden', borderLeftWidth: 1, borderRightWidth: 1, borderColor: color.hairline },
  tooth: { width: 14, height: 8, backgroundColor: color.surface, overflow: 'hidden' },
  bite: { position: 'absolute', left: 1.5, top: 2.5, width: 11, height: 11, borderRadius: 5.5, backgroundColor: color.canvas },
  spacer: { flex: 1, minHeight: 8 },
  actions: { flexDirection: 'row', gap: 8, paddingBottom: 8 },
  flex: { flex: 1 },
  again: { textAlign: 'center', paddingVertical: 10 },
})
