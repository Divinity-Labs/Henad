import { useEffect, useMemo, useState } from 'react'
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { formatUnits, parseEther, type Address, type Hex } from 'viem'
import { SOURCE_ASSETS, describeTxFailure } from '@henad/core'
import { explorerTx } from '@/lib/display'
import { quoteMonForStable, readMonBalance, stableToken, swapMonForStable, type SwapQuote } from '@/lib/swap'
import { unlockStoredAccount, describeAccountError } from '@/lib/mera'
import { Button, Card, ErrorText, Eyebrow, TextLink } from '@/ui'
import { color, font, track } from '@/theme'
import { units as fmt } from '@/send/format'
import { TokenIcon } from '@/tokens/TokenIcon'

/** Held back so "use all" cannot leave the account unable to pay for its own transaction. */
const GAS_RESERVE = parseEther('0.05')

/**
 * Top up: MON into the stablecoin a payout spends, from the phone.
 *
 * The same honesty line as the web screen. A payout names a reference rate and enforces a
 * spread against it; this is a market swap where the pool's price is the only price there is.
 * So it names the venue, shows the floor the fill may not fall below, and claims nothing more.
 */
export function FundScreen({ address, chainId, network, onDone }: { address: Address; chainId: number; network: string; onDone: () => void }) {
  const [symbol, setSymbol] = useState<string>('AUSD')
  const [amount, setAmount] = useState('')
  const [mon, setMon] = useState<bigint | null>(null)
  const [quote, setQuote] = useState<SwapQuote | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<Hex | null>(null)

  const units = useMemo(() => {
    const v = amount.trim()
    return /^\d+(\.\d{1,18})?$/.test(v) && Number(v) > 0 ? parseEther(v) : null
  }, [amount])

  useEffect(() => {
    let alive = true
    const read = () =>
      readMonBalance(address).then(
        (b) => alive && setMon(b),
        () => {},
      )
    void read()
    const id = setInterval(() => void read(), 15_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [address, txHash])

  // The pool moves, so a quote is re-read as the amount changes and only used while it matches.
  useEffect(() => {
    if (units === null) return
    let alive = true
    const id = setTimeout(() => {
      setQuoting(true)
      quoteMonForStable(units, symbol).then(
        (q) => {
          if (!alive) return
          setQuote(q)
          setQuoting(false)
        },
        () => {
          if (!alive) return
          setQuote(null)
          setQuoting(false)
        },
      )
    }, 300)
    return () => {
      alive = false
      clearTimeout(id)
    }
  }, [units, symbol])

  const fresh = quote && units !== null && quote.amountIn === units ? quote : null
  const spendable = mon === null ? null : mon > GAS_RESERVE ? mon - GAS_RESERVE : 0n
  const decimals = stableToken(symbol).decimals
  const blocker =
    units === null
      ? 'Enter an amount of MON.'
      : spendable !== null && units > spendable
        ? 'That is more than your MON, less the gas this swap costs.'
        : fresh === null
          ? quoting
            ? 'Reading the pool…'
            : 'No quote right now.'
          : null

  async function swap() {
    if (!fresh) return
    setBusy(true)
    setError(null)
    setTxHash(null)
    let account
    try {
      account = await unlockStoredAccount()
    } catch (e) {
      setError(describeAccountError(e))
      setBusy(false)
      return
    }
    try {
      setTxHash(await swapMonForStable(account.account, fresh, symbol))
      setAmount('')
      setQuote(null)
    } catch (e) {
      console.error('[top-up]', e)
      setError(describeTxFailure(e).message)
    } finally {
      account.end()
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.body}>
          <View style={s.rowBetween}>
            <Eyebrow tone="purple">Top up</Eyebrow>
            <Eyebrow>{network}</Eyebrow>
          </View>

          <Card style={s.card}>
            <View style={s.rowBetween}>
              <Eyebrow>You swap</Eyebrow>
              <Eyebrow>{mon === null ? 'MON —' : `MON ${Number(formatUnits(mon, 18)).toFixed(4)}`}</Eyebrow>
            </View>
            <View style={s.amountRow}>
              <TextInput
                style={[s.amount, s.amountInput]}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.0"
                placeholderTextColor={color.border}
                keyboardType="decimal-pad"
                accessibilityLabel="Amount of MON to swap"
              />
              <View style={s.chipRow}>
                <TokenIcon symbol="MON" size={22} />
                <Text style={s.chipText}>MON</Text>
              </View>
            </View>
            <TextLink
              label="Use all but gas"
              tone="purple"
              onPress={spendable && spendable > 0n ? () => setAmount(formatUnits(spendable, 18)) : undefined}
            />
          </Card>

          <Card style={s.card}>
            <Eyebrow>You receive</Eyebrow>
            <View style={s.amountRow}>
              <Text style={s.amount} numberOfLines={1} adjustsFontSizeToFit>
                {fresh ? fmt(fresh.amountOut, decimals, 4) : '—'}
              </Text>
              <View style={s.picker}>
                {SOURCE_ASSETS.map((a) => (
                  <Pressable
                    key={a.symbol}
                    onPress={() => setSymbol(a.symbol)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: symbol === a.symbol }}
                    style={[s.pick, symbol === a.symbol && s.pickOn]}
                  >
                    <TokenIcon symbol={a.symbol} size={20} />
                    <Text style={[s.chipText, symbol !== a.symbol && { color: color.muted }]}>{a.symbol}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            {fresh ? <Text style={s.meta}>{`At worst ${fmt(fresh.minimumOut, decimals, 4)} ${symbol} · PancakeSwap 0.05% pool · ${fresh.slippageBps / 100}% slippage`}</Text> : null}
          </Card>

          <Text style={s.help}>
            This is a market swap, not a Henad payout. The pool’s price is the only price there is, so there is no reference rate, no spread cap and no
            receipt. A fill below the figure above reverts and your MON stays put.
          </Text>

          {error ? <ErrorText>{error}</ErrorText> : null}
          {txHash ? <TextLink label="Swapped · view on Monadscan ↗" tone="purple" onPress={() => void Linking.openURL(explorerTx(chainId, txHash))} /> : null}

          <View style={s.spacer} />
          <Button label={busy ? 'Swapping…' : 'Swap'} variant={blocker || busy ? 'disabled' : 'primary'} busy={busy} onPress={() => void swap()} />
          <Text style={s.foot}>{blocker ?? 'Your passkey signs this swap, from your own account.'}</Text>
          <Button label="Back to send" variant="secondary" height={44} small onPress={onDone} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  body: { flex: 1, gap: 10, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  card: { padding: 16, gap: 10 },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  amount: { fontFamily: font.display, fontSize: 34, letterSpacing: track(34, -0.035), color: color.ink, flexShrink: 1 },
  amountInput: { flex: 1, padding: 0, margin: 0 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: { fontFamily: font.mono, fontSize: 12, color: color.ink },
  picker: { flexDirection: 'row', gap: 6 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: color.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  pickOn: { borderColor: color.purple },
  meta: { fontFamily: font.mono, fontSize: 11, color: color.muted },
  help: { fontFamily: font.sans, fontSize: 12, lineHeight: 18, color: color.grey },
  spacer: { flex: 1, minHeight: 12 },
  foot: { fontFamily: font.mono, fontSize: 11, color: color.muted, textAlign: 'center' },
})
