import type { ReactNode } from 'react'
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import type { Tier } from '@henad/core'
import { color, font, images, track } from './theme'

/** The Spread H: the canvas's four-rect mark, drawn with views because there is no SVG here. */
export function HenadMark({ size = 22 }: { size?: number }) {
  const u = size / 100
  const rect = (x: number, y: number, w: number, h: number, fill: string, r = 0): ViewStyle => ({
    position: 'absolute',
    left: x * u,
    top: y * u,
    width: w * u,
    height: h * u,
    backgroundColor: fill,
    borderRadius: r * u,
  })
  return (
    <View style={{ width: size, height: size }} accessibilityLabel="Henad">
      <View style={rect(18, 10, 14, 80, color.ink, 7)} />
      <View style={rect(32, 45, 13, 10, color.ink)} />
      <View style={rect(55, 45, 13, 10, color.purple)} />
      <View style={rect(68, 10, 14, 80, color.purple, 7)} />
    </View>
  )
}

export function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <View style={s.wordmark}>
      <HenadMark size={size * 1.1} />
      <Text style={{ fontFamily: font.displayBold, fontSize: size, letterSpacing: track(size, -0.03), color: color.ink }}>Henad</Text>
    </View>
  )
}

export function Header({ right }: { right?: ReactNode }) {
  return (
    <View style={s.header}>
      <Wordmark />
      {right}
    </View>
  )
}

export function BuiltOnMonad() {
  return (
    <View style={s.builtOn}>
      <Text style={s.builtOnText}>BUILT ON</Text>
      <Image source={images.monadFull} style={s.builtOnLogo} resizeMode="contain" accessibilityLabel="Monad" />
    </View>
  )
}

export function Chip({ children, onPress, filled = false }: { children: ReactNode; onPress?: () => void; filled?: boolean }) {
  const body = <Text style={[s.chip, filled && s.chipFilled]}>{children}</Text>
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button">
      {body}
    </Pressable>
  ) : (
    body
  )
}

/** 10px mono, tracked, uppercase: the canvas's section label. */
export function Eyebrow({ children, tone = 'muted', style }: { children: ReactNode; tone?: 'muted' | 'purple' | 'lavender' | 'amber'; style?: StyleProp<TextStyle> }) {
  const c = tone === 'purple' ? color.purple : tone === 'lavender' ? color.lavender : tone === 'amber' ? color.amber : color.muted
  return <Text style={[s.eyebrow, { color: c }, style]}>{children}</Text>
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>
}

/** A receipt line: key left, figure right, hairline below unless it is the last. */
export function Line({ k, v, strong = false, last = false, children }: { k: string; v?: string; strong?: boolean; last?: boolean; children?: ReactNode }) {
  return (
    <View style={[s.line, !last && s.lineRule]}>
      <Text style={s.lineKey}>{k}</Text>
      {children ?? <Text style={[s.lineValue, strong && s.lineStrong]}>{v}</Text>}
    </View>
  )
}

type Variant = 'primary' | 'secondary' | 'disabled'

export function Button({
  label,
  onPress,
  variant = 'primary',
  busy = false,
  height = 52,
  small = false,
  style,
}: {
  label: string
  onPress?: () => void
  variant?: Variant
  busy?: boolean
  height?: number
  small?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const off = variant === 'disabled' || busy || !onPress
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        { height },
        variant === 'primary' && s.primary,
        variant === 'secondary' && s.secondary,
        variant === 'disabled' && s.disabledBtn,
        pressed && !off && { transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : color.ink} />
      ) : (
        <Text
          style={[
            s.buttonText,
            small && { fontSize: 11, letterSpacing: track(11, 0.06) },
            { color: variant === 'primary' ? '#FFFFFF' : variant === 'disabled' ? color.muted : color.ink },
          ]}
        >
          {label.toUpperCase()}
        </Text>
      )}
    </Pressable>
  )
}

export function TextLink({ label, onPress, tone = 'ink', style }: { label: string; onPress?: () => void; tone?: 'ink' | 'muted' | 'purple'; style?: StyleProp<TextStyle> }) {
  const c = tone === 'muted' ? color.muted : tone === 'purple' ? color.purple : color.ink
  return (
    <Text onPress={onPress} suppressHighlighting accessibilityRole={onPress ? 'button' : undefined} style={[s.link, { color: c }, style]}>
      {label.toUpperCase()}
    </Text>
  )
}

export function TierBadge({ tier }: { tier: Tier }) {
  const style = tier === 'live' ? s.badgeLive : tier === 'quote' ? s.badgeQuote : s.badgeUnpriced
  const text = tier === 'live' ? '#FFFFFF' : tier === 'quote' ? color.lilacInk : color.grey
  return (
    <View style={[s.badge, style]}>
      <Text style={[s.badgeText, { color: text }]}>{tier === 'live' ? 'LIVE' : tier === 'quote' ? 'QUOTE' : 'UNPRICED'}</Text>
    </View>
  )
}

/** The receipt's dashed rule. Android draws one-sided dashed borders badly, so these are dashes. */
export function Dashed() {
  return (
    <View style={s.dashed}>
      {Array.from({ length: 60 }, (_, i) => (
        <View key={i} style={s.dash} />
      ))}
    </View>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <Text style={s.error}>{children}</Text>
}

const s = StyleSheet.create({
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  header: {
    height: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
    backgroundColor: color.canvas,
  },
  builtOn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  builtOnText: { fontFamily: font.mono, fontSize: 9, letterSpacing: track(9, 0.08), color: color.muted },
  builtOnLogo: { height: 11, width: 58, opacity: 0.85 },
  chip: {
    fontFamily: font.mono,
    fontSize: 11,
    color: color.ink,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 4,
    backgroundColor: color.surface,
    overflow: 'hidden',
  },
  chipFilled: { backgroundColor: color.chip, paddingVertical: 7 },
  eyebrow: { fontFamily: font.mono, fontSize: 10, letterSpacing: track(10, 0.12), textTransform: 'uppercase' },
  card: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.hairline, borderRadius: 12 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 8 },
  lineRule: { borderBottomWidth: 1, borderBottomColor: color.hairline2 },
  lineKey: { fontFamily: font.mono, fontSize: 11, color: color.muted },
  lineValue: { fontFamily: font.mono, fontSize: 11, color: color.ink, fontVariant: ['tabular-nums'], flexShrink: 1, textAlign: 'right' },
  lineStrong: { fontFamily: font.monoMedium },
  button: { borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: color.purple },
  secondary: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.border },
  disabledBtn: { backgroundColor: color.hairline },
  buttonText: { fontFamily: font.mono, fontSize: 12, letterSpacing: track(12, 0.06) },
  link: { fontFamily: font.mono, fontSize: 10, letterSpacing: track(10, 0.08) },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 3 },
  badgeLive: { backgroundColor: color.purple },
  badgeQuote: { backgroundColor: color.lilac },
  badgeUnpriced: { backgroundColor: color.unpricedBg, borderWidth: 1, borderColor: color.border },
  badgeText: { fontFamily: font.mono, fontSize: 9, letterSpacing: track(9, 0.12) },
  dashed: { flexDirection: 'row', overflow: 'hidden', gap: 3, height: 1 },
  dash: { width: 4, height: 1, backgroundColor: color.border },
  error: { fontFamily: font.mono, fontSize: 11, lineHeight: 17, color: color.error },
})
