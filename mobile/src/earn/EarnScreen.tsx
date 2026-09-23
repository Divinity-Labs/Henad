import { useEffect, useMemo, useState } from 'react'
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { parseUnits, type Address, type Hex } from 'viem'
import { describeTxFailure } from '@henad/core'
import { explorerTx } from '@/lib/display'
import { approveVault, depositAusd, previewDeposit, readEarnState, readVaultAllowance, redeemShares, redeemValue, type EarnState } from '@/lib/earn'
import { readBalance } from '@/lib/balance'
import { readMonBalance } from '@/lib/swap'
import { appChain, appChainId } from '@/lib/config'
import { unlockStoredAccount, describeAccountError } from '@/lib/mera'
import { Button, Card, Dashed, ErrorText, Eyebrow, Line, TextLink } from '@/ui'
import { color, font, track } from '@/theme'
import { units as fmt } from '@/send/format'
import { TokenIcon } from '@/tokens/TokenIcon'

const DECIMALS = 6

/** Below this much MON an account cannot pay for its own transaction. Two transactions' worth. */
const GAS_FLOOR = 2_000_000_000_000_000n

/**
 * Earn: AUSD that is not being sent, working in Upshift's earnAUSD vault.
 *
 * Same screen as the web, same refusals. The rate shown is what the vault's share price has
 * actually done over the past week, the exit fee is stated before the deposit rather than
 * after it, and the words "savings account" appear only in the sentence denying it.
 */
export function EarnScreen({ address, network }: { address: Address; network: string }) {
  const [state, setState] = useState<EarnState | null>(null)
  const [ausd, setAusd] = useState<bigint | null>(null)
  const [mon, setMon] = useState<bigint | null>(null)
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit')
  const [amount, setAmount] = useState('')
  const [shares, setShares] = useState<bigint | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<Hex | null>(null)

  const depositing = mode === 'deposit'
  const units = useMemo(() => {
    const v = amount.trim()
    return /^\d+(\.\d{1,6})?$/.test(v) && Number(v) > 0 ? parseUnits(v, DECIMALS) : null
  }, [amount])

  useEffect(() => {
    let alive = true
    const read = () =>
      Promise.all([readEarnState(address), readBalance(address, 'AUSD'), readMonBalance(address)]).then(
        ([s, b, m]) => {
          if (!alive) return
          setState(s)
          setAusd(b)
          setMon(m)
        },
        () => {},
      )
    void read()
    const id = setInterval(() => void read(), 20_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [address, txHash])

  // What the deposit buys, asked of the vault rather than derived from the share price.
  useEffect(() => {
    let alive = true
    const id = setTimeout(() => {
      if (!depositing || units === null) return setShares(null)
      previewDeposit(units).then(
        (s) => alive && setShares(s),
        () => alive && setShares(null),
      )
    }, 250)
    return () => {
      alive = false
      clearTimeout(id)
    }
  }, [units, depositing])

  const available = state ? redeemValue(state.shares, state.sharePrice, state.instantFeeBps) : null
  // Gas is paid in MON by this account. Saying so first beats explaining a failure after.
  const blocker =
    mon !== null && mon < GAS_FLOOR
      ? 'This account needs a little MON for the network fee. Top up first.'
      : units === null
      ? depositing
        ? 'Enter an amount of AUSD.'
        : 'Enter an amount to withdraw.'
      : depositing && ausd !== null && units > ausd
        ? 'That is more AUSD than you hold.'
        : !depositing && available !== null && units > available
          ? 'That is more than this account has in the vault.'
          : depositing && state?.depositsPaused
            ? 'The vault is not taking deposits right now.'
            : !depositing && state?.withdrawalsPaused
              ? 'The vault has paused withdrawals right now.'
              : null

  async function submit() {
    if (units === null || !state) return
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
      {
        if (depositing) {
          // Approve only this deposit: the vault can be upgraded, so a standing unlimited
          // allowance would outlive the code it was granted to.
          if ((await readVaultAllowance(address)) < units) {
            const approval = await approveVault(account.account, units)
            await appChain().waitForTransactionReceipt({ hash: approval, timeout: 30_000 })
          }
          const hash = await depositAusd(account.account, units)
          await appChain().waitForTransactionReceipt({ hash, timeout: 30_000 })
          setTxHash(hash)
        } else {
          const wanted = (units * 1_000_000n) / state.sharePrice
          const hash = await redeemShares(account.account, wanted > state.shares ? state.shares : wanted)
          await appChain().waitForTransactionReceipt({ hash, timeout: 30_000 })
          setTxHash(hash)
        }
        setAmount('')
        setShares(null)
      }
    } catch (e) {
      console.error('[earn]', e)
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
            <Eyebrow tone="purple">Earn</Eyebrow>
            <Eyebrow>{network}</Eyebrow>
          </View>

          <Card style={s.card}>
            <View style={s.rowBetween}>
              <Eyebrow>In the vault</Eyebrow>
              <Eyebrow>{state === null ? '—' : `${fmt(state.shares, DECIMALS, 2)} earnAUSD`}</Eyebrow>
            </View>
            <Text style={s.amount}>{state === null ? '—' : `$${fmt(state.value, DECIMALS, 2)}`}</Text>
            <Dashed />
            <Line k="Share price" v={state === null ? '—' : `$${fmt(state.sharePrice, DECIMALS, 6)}`} />
            <Line k="Vault holds" v={state === null ? '—' : `$${fmt(state.totalAssets, DECIMALS, 0)}`} />
            <Line k="What it has paid" v={state?.apy ? `${(state.apy.rate * 100).toFixed(2)}% a year` : 'not readable'} strong last />
          </Card>

          <Card style={s.card}>
            <View style={s.rowBetween}>
              <Eyebrow>{depositing ? 'You deposit' : 'You withdraw'}</Eyebrow>
              <Eyebrow>
                {depositing ? (ausd === null ? 'AUSD —' : `${fmt(ausd, DECIMALS, 2)} AUSD`) : available === null ? '—' : `$${fmt(available, DECIMALS, 2)} available`}
              </Eyebrow>
            </View>
            <View style={s.amountRow}>
              <View style={s.amountField}>
                <Text style={s.amount}>$</Text>
                <TextInput
                  style={[s.amount, s.amountInput]}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor={color.border}
                  keyboardType="decimal-pad"
                  accessibilityLabel={depositing ? 'Amount of AUSD to deposit' : 'Amount of AUSD to withdraw'}
                />
              </View>
              <View style={s.chipRow}>
                <TokenIcon symbol="AUSD" size={22} />
                <Text style={s.symbol}>AUSD</Text>
              </View>
            </View>
            <View style={s.rowBetween}>
              <TextLink
                label="Use all"
                tone="purple"
                onPress={() => {
                  // fmt groups thousands and the amount field rejects commas.
                  if (depositing && ausd !== null) setAmount(fmt(ausd, DECIMALS, 2).replace(/,/g, ''))
                  if (!depositing && available !== null) setAmount(fmt(available, DECIMALS, 2).replace(/,/g, ''))
                }}
              />
              <View style={s.chipRow}>
                {(['deposit', 'withdraw'] as const).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => {
                      setMode(m)
                      setAmount('')
                      setError(null)
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: mode === m }}
                    style={[s.pill, mode === m && s.pillOn]}
                  >
                    <Text style={[s.pillText, mode !== m && { color: color.muted }]}>{m === 'deposit' ? 'Deposit' : 'Withdraw'}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            {depositing && shares !== null ? <Text style={s.fine}>{`You receive ${fmt(shares, DECIMALS, 4)} earnAUSD`}</Text> : null}
            {!depositing && units !== null && state ? (
              <Text style={s.fine}>{`After the ${state.instantFeeBps / 100}% instant-exit fee, $${fmt((units * BigInt(10_000 - state.instantFeeBps)) / 10_000n, DECIMALS, 2)} reaches you`}</Text>
            ) : null}
          </Card>

          {error ? <ErrorText>{error}</ErrorText> : null}
          {txHash && !error ? (
            <TextLink label="View the transaction ↗" tone="purple" onPress={() => void Linking.openURL(explorerTx(appChainId(), txHash))} />
          ) : null}

          <View style={s.spacer} />
          <Button
            label={busy ? (depositing ? 'Depositing…' : 'Withdrawing…') : depositing ? 'Deposit AUSD' : 'Withdraw AUSD'}
            variant={blocker || busy ? 'disabled' : 'primary'}
            busy={busy}
            onPress={() => void submit()}
          />
          <Text style={s.foot}>{blocker ?? 'Your passkey signs this, from your own account.'}</Text>
          <Text style={s.fine}>
            {`This is not a savings account and nothing here is insured. Upshift's vault lends your AUSD across Monad's lending markets, which is where the yield comes from: it moves with those markets and it can go down. The shares stay in your own account and Henad never holds them. Leaving immediately costs ${
              state ? `${state.instantFeeBps / 100}%` : 'a small fee'
            }, and the vault's contract can be upgraded by its operators.`}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  body: { flex: 1, gap: 12, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  card: { padding: 16, gap: 10 },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  amountField: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  amount: { fontFamily: font.display, fontSize: 38, letterSpacing: track(38, -0.035), color: color.ink, flexShrink: 1 },
  amountInput: { flex: 1, padding: 0, margin: 0 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  symbol: { fontFamily: font.mono, fontSize: 12, color: color.grey },
  pill: { borderWidth: 1, borderColor: color.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  pillOn: { borderColor: color.purple, backgroundColor: color.rowTint },
  pillText: { fontFamily: font.mono, fontSize: 12, color: color.ink },
  fine: { fontFamily: font.sans, fontSize: 12, lineHeight: 18, color: color.muted },
  spacer: { flex: 1, minHeight: 12 },
  foot: { textAlign: 'center', fontFamily: font.mono, fontSize: 10, letterSpacing: track(10, 0.06), color: color.muted },
})
