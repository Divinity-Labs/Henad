import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { color, mono } from './theme'

/** Small-caps monospace label, the web app's `.label`. */
export function Label({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.label, style]}>{children}</Text>
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>
}

export function Rule() {
  return <View style={s.rule} />
}

/** A key on the left, a figure on the right. Every receipt line is one of these. */
export function Row({ k, v, strong = false }: { k: string; v: string; strong?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={s.rowKey}>{k}</Text>
      <Text style={[s.rowValue, strong && s.rowValueStrong]} numberOfLines={1}>
        {v}
      </Text>
    </View>
  )
}

export function Button({
  children,
  onPress,
  disabled = false,
  busy = false,
  variant = 'primary',
}: {
  children: ReactNode
  onPress: () => void
  disabled?: boolean
  busy?: boolean
  variant?: 'primary' | 'secondary'
}) {
  const off = disabled || busy
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        s.button,
        variant === 'secondary' && s.buttonSecondary,
        off && s.buttonOff,
        pressed && !off && s.buttonPressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : color.ink} />
      ) : (
        <Text style={[s.buttonText, variant === 'secondary' && s.buttonTextSecondary, off && s.buttonTextOff]}>{children}</Text>
      )}
    </Pressable>
  )
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'error' }) {
  return <Text style={[s.notice, tone === 'error' && s.noticeError]}>{children}</Text>
}

const s = StyleSheet.create({
  label: { ...mono, fontSize: 10, letterSpacing: 1.2, color: color.muted },
  card: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.hairline, borderRadius: 12, padding: 18, gap: 10 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: color.border, marginVertical: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  rowKey: { ...mono, fontSize: 12, color: color.muted, flexShrink: 0 },
  rowValue: { ...mono, fontSize: 12, color: color.ink, flexShrink: 1, textAlign: 'right' },
  rowValueStrong: { color: color.ink, fontWeight: '700' },
  button: { backgroundColor: color.ink, borderRadius: 8, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  buttonSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: color.border },
  buttonOff: { opacity: 0.45 },
  buttonPressed: { transform: [{ scale: 0.985 }] },
  buttonText: { ...mono, fontSize: 12, letterSpacing: 1.1, color: '#fff' },
  buttonTextSecondary: { color: color.ink },
  buttonTextOff: { color: '#fff' },
  notice: { ...mono, fontSize: 11, lineHeight: 18, color: color.grey },
  noticeError: { color: '#b4341f' },
})
