import { StyleSheet, Text, View } from 'react-native'
import { SvgXml } from 'react-native-svg'
import { color, font } from '@/theme'
import { TOKEN_SVG } from './svg'

/** A token's icon, or a lettered disc for tokens without artwork (USDC, USDm). */
export function TokenIcon({ symbol, size = 24 }: { symbol: string; size?: number }) {
  const xml = TOKEN_SVG[symbol]
  if (xml) return <SvgXml xml={xml} width={size} height={size} />
  return (
    <View style={[s.disc, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[s.letter, { fontSize: Math.round(size * 0.42) }]}>{symbol.charAt(0)}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  disc: { alignItems: 'center', justifyContent: 'center', backgroundColor: color.hairline },
  letter: { fontFamily: font.mono, color: color.ink },
})
