import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { Address } from 'viem'
import type { ReceiptDto } from '@/lib/api'
import { tokenText } from '@/lib/display'
import { units } from '@/send/format'
import { TokenIcon } from '@/tokens/TokenIcon'
import { Card, Eyebrow } from '@/ui'
import { color, font, track } from '@/theme'

function when(unix: number): string {
  const d = new Date(unix * 1000)
  return `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} · ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`
}

/**
 * Every settlement on the ledger, newest first, read from the chain through the web app.
 * Payouts to or from this account are marked, and each row opens the public receipt.
 */
export function ReceiptsScreen({
  receipts,
  loading,
  error,
  me,
  onRefresh,
  onOpen,
}: {
  receipts: ReceiptDto[] | null
  loading: boolean
  error: string | null
  me: Address | null
  onRefresh: () => void
  onOpen: (r: ReceiptDto) => void
}) {
  const mine = (r: ReceiptDto) => (me ? (r.payer.toLowerCase() === me.toLowerCase() ? 'Sent' : r.recipient.toLowerCase() === me.toLowerCase() ? 'Received' : null) : null)
  return (
    <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={color.purple} />}>
      <View style={s.body}>
        <View style={s.rowBetween}>
          <Eyebrow tone="purple">Receipts</Eyebrow>
          <Eyebrow>{receipts ? `${receipts.length} settled` : ''}</Eyebrow>
        </View>
        <Text style={s.title}>Every payout, with the spread it paid.</Text>

        {error ? <Text style={s.help}>{error}</Text> : null}
        {receipts && receipts.length === 0 ? <Text style={s.help}>Nothing has settled yet.</Text> : null}
        {!receipts && !error ? <Text style={s.help}>Reading the ledger…</Text> : null}

        {receipts?.map((r) => {
          const tag = mine(r)
          return (
            <Pressable key={r.intentId} onPress={() => onOpen(r)} accessibilityRole="link" style={({ pressed }) => pressed && { opacity: 0.7 }}>
              <Card style={s.row}>
                <View style={s.rowBetween}>
                  <Text style={s.index}>{r.index !== null ? `#${String(r.index).padStart(2, '0')}` : '—'}</Text>
                  <Text style={s.meta}>{when(r.settledAt)}</Text>
                </View>
                <View style={s.amountRow}>
                  <TokenIcon symbol={r.targetAsset.symbol} size={22} />
                  <Text style={s.amount}>{`$${units(BigInt(r.sourceAmount), r.sourceAsset.decimals, 2)} → ${tokenText(BigInt(r.deliveredAmount), r.targetAsset.decimals, r.targetAsset.symbol, 2)}`}</Text>
                </View>
                <View style={s.rowBetween}>
                  <Text style={s.meta}>{`${r.spreadBps} bps · to ${r.recipient.slice(0, 6)}…${r.recipient.slice(-4)}`}</Text>
                  {tag ? <Text style={[s.tag, tag === 'Received' && s.tagIn]}>{tag.toUpperCase()}</Text> : <Text style={s.open}>Open ↗</Text>}
                </View>
              </Card>
            </Pressable>
          )
        })}
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1 },
  body: { gap: 10, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title: { fontFamily: font.display, fontSize: 26, lineHeight: 29, letterSpacing: track(26, -0.03), color: color.ink, marginBottom: 6 },
  help: { fontFamily: font.sans, fontSize: 13, lineHeight: 20, color: color.grey },
  row: { padding: 14, gap: 6 },
  index: { fontFamily: font.mono, fontSize: 11, color: color.purple },
  meta: { fontFamily: font.mono, fontSize: 11, color: color.muted, flexShrink: 1 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  amount: { flexShrink: 1, fontFamily: font.display, fontSize: 19, letterSpacing: track(19, -0.02), color: color.ink },
  tag: { fontFamily: font.mono, fontSize: 10, letterSpacing: track(10, 0.08), color: color.ink, backgroundColor: color.chip, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  tagIn: { backgroundColor: color.lilac, color: color.lilacInk },
  open: { fontFamily: font.mono, fontSize: 10, color: color.purple },
})
