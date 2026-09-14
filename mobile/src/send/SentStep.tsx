import { useState } from 'react'
import { Alert, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import type { Hex } from 'viem'
import { quoteMaths, type Corridor, type QuoteDto } from '@henad/core'
import { Button, Card, Label, Notice, Row, Rule } from '@/ui'
import { color, mono } from '@/theme'
import { money, rateLine, shortId, spreadLine } from './format'
import { receiptUrl } from '@/lib/api'

/**
 * Step three. The receipt.
 *
 * The permalink is the point of this screen, not the confirmation. What was settled is
 * already on the chain and readable by anyone; this is simply the first place the payer
 * can hand that fact to someone else. So sharing is the primary action and "done" is not
 * offered until the link has been seen.
 */
export function SentStep({
  corridor,
  quote,
  sourceDecimals,
  intentId,
  txHash,
  onDone,
}: {
  corridor: Corridor
  quote: QuoteDto
  sourceDecimals: number
  intentId: Hex
  txHash: Hex
  onDone: () => void
}) {
  const [copied, setCopied] = useState(false)
  const target = corridor.targetAsset
  const m = quoteMaths(quote, sourceDecimals, target?.decimals ?? 18)
  const sym = corridor.targetSymbol
  const dp = corridor.currencyDp
  const url = receiptUrl(intentId)

  async function copy() {
    await Clipboard.setStringAsync(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  async function share() {
    try {
      await Share.share({ message: url, url })
    } catch {
      Alert.alert('Could not open the share sheet', 'The link is on your clipboard instead.')
      await copy()
    }
  }

  return (
    <ScrollView contentContainerStyle={s.body}>
      <Label>SENT</Label>
      <Text style={s.headline}>{money(m.delivered, target?.decimals ?? 18, sym, dp)} delivered.</Text>

      <Card style={s.receipt}>
        <View style={s.receiptHead}>
          <Label>RECEIPT</Label>
          <Label>{corridor.key}</Label>
        </View>
        <Rule />
        <Row k="Paid" v={money(m.sourceAmount, sourceDecimals, '$')} />
        <Row k="Delivered" v={money(m.delivered, target?.decimals ?? 18, sym, dp)} />
        <Rule />
        <Row k="Reference rate" v={rateLine(m.referenceRate, sym, corridor.rateDp)} />
        <Row k="Your rate" v={rateLine(m.executedRate, sym, corridor.rateDp)} />
        <Row k="Spread" v={spreadLine(m.spreadCost, target?.decimals ?? 18, sym, m.spreadBps, dp)} strong />
        <Rule />
        <Row k="Rate source" v={corridor.feed?.label ?? '—'} />
        <Row k="Venue" v={corridor.venue?.label ?? '—'} />
        <Row k="Network fee" v="sponsored" />
        <Rule />
        <Row k="Receipt" v={shortId(intentId)} />
        <Row k="Transaction" v={shortId(txHash)} />
      </Card>

      <Notice>This receipt is on the chain. Anyone can read it without Henad, and without an account.</Notice>

      <Button onPress={() => void share()}>SHARE RECEIPT</Button>
      <Button onPress={() => void copy()} variant="secondary">
        {copied ? 'LINK COPIED' : 'COPY LINK'}
      </Button>
      <Text style={s.url} selectable>
        {url}
      </Text>
      <Button onPress={onDone} variant="secondary">
        SEND ANOTHER
      </Button>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  body: { padding: 20, gap: 14, paddingBottom: 48 },
  headline: { fontSize: 28, fontWeight: '600', color: color.ink, letterSpacing: -0.6 },
  receipt: { gap: 8 },
  receiptHead: { flexDirection: 'row', justifyContent: 'space-between' },
  url: { ...mono, fontSize: 11, color: color.muted, textAlign: 'center', paddingVertical: 4 },
})
