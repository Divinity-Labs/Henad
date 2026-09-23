import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Path, Rect } from 'react-native-svg'
import { color, font, track } from '@/theme'

export type Tab = 'send' | 'fund' | 'earn' | 'rates' | 'receipts' | 'account'

const TABS: { key: Tab; label: string }[] = [
  { key: 'send', label: 'Send' },
  { key: 'fund', label: 'Top up' },
  { key: 'earn', label: 'Earn' },
  { key: 'rates', label: 'Rates' },
  { key: 'receipts', label: 'Receipts' },
  { key: 'account', label: 'Account' },
]

/** Line icons on a 24 grid, 1.6 stroke, drawn to match each other rather than taken from four sets. */
function Icon({ tab, tint }: { tab: Tab; tint: string }) {
  const stroke = { stroke: tint, strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' }
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      {tab === 'send' && (
        <>
          <Path d="M8 20V5m0 0L4.5 8.5M8 5l3.5 3.5" {...stroke} />
          <Path d="M16 4v15m0 0l3.5-3.5M16 19l-3.5-3.5" {...stroke} />
        </>
      )}
      {tab === 'fund' && (
        <>
          {/* Two arrows swapping, the universal mark for an exchange. */}
          <Path d="M4.5 9h12m0 0-3-3m3 3-3 3" {...stroke} />
          <Path d="M19.5 15h-12m0 0 3 3m-3-3 3-3" {...stroke} />
        </>
      )}
      {tab === 'earn' && (
        <>
          {/* Coins stacking: money that sits still and grows, rather than moving. */}
          <Path d="M5 8.5h9M5 12h9M5 15.5h9" {...stroke} />
          <Path d="M17 17V9m0 0-2.2 2.2M17 9l2.2 2.2" {...stroke} />
        </>
      )}
      {tab === 'rates' && (
        <>
          <Rect x={3.5} y={3.5} width={17} height={17} rx={5} {...stroke} />
          <Path d="M8.5 16v-3M12 16V9.5M15.5 16v-5" {...stroke} />
        </>
      )}
      {tab === 'receipts' && (
        <>
          {/* The torn bottom edge is the receipt's own mark on the web slip. */}
          <Path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4v-17z" {...stroke} />
          <Path d="M9 8.5h6M9 12h6M9 15.5h3.5" {...stroke} />
        </>
      )}
      {tab === 'account' && (
        <>
          <Rect x={3.5} y={6} width={17} height={13.5} rx={4} {...stroke} />
          <Path d="M7 6V5.5a2 2 0 012-2h6a2 2 0 012 2V6M16.5 12.75h.01" {...stroke} strokeWidth={2.4} />
        </>
      )}
    </Svg>
  )
}

/**
 * The floating tab bar: a white pill lifted off the canvas, four destinations, the active one
 * in ink and the rest muted. It sits in the layout rather than over it, so no screen's last
 * button can end up underneath.
 */
export function TabBar({ active, onSelect }: { active: Tab | null; onSelect: (tab: Tab) => void }) {
  return (
    <View style={s.wrap}>
      <View style={s.bar} accessibilityRole="tablist">
        {TABS.map((t) => {
          const on = t.key === active
          const tint = on ? color.ink : color.muted
          return (
            <Pressable
              key={t.key}
              onPress={() => onSelect(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t.label}
              style={({ pressed }) => [s.item, pressed && { opacity: 0.6 }]}
            >
              <Icon tab={t.key} tint={tint} />
              <Text style={[s.label, { color: tint, fontFamily: on ? font.displayBold : font.display }]}>{t.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: color.surface,
    borderRadius: 32,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: color.ink,
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  item: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 2 },
  label: { fontSize: 12, letterSpacing: track(12, -0.005) },
})
