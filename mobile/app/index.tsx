import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import { getAddress, isAddress, type Address, type Hex } from 'viem'
import { CORRIDORS, LIVE_CORRIDOR, MAX_SPREAD_DEFAULT, MAX_SPREAD_MAX, MAX_SPREAD_MIN, isFxMarketOpen, type Corridor, type QuoteDto } from '@henad/core'
import { fetchQuote } from '@/lib/api'
import { readBalance, sourceToken } from '@/lib/balance'
import { deployment, rpId } from '@/lib/config'
import { continueWithPasskey, describeAccountError, loadStoredAccount, signIn, unlockStoredAccount, type MeraAccount } from '@/lib/mera'
import { settleFromPhone } from '@/lib/settle'
import { AmountStep } from '@/send/AmountStep'
import { shortId } from '@/send/format'
import { QuoteStep } from '@/send/QuoteStep'
import { SentStep } from '@/send/SentStep'
import { SignInStep } from '@/send/SignInStep'
import { color, mono } from '@/theme'
import { Notice } from '@/ui'

type Step = 'signin' | 'amount' | 'quote' | 'sent'

/**
 * The send flow: four steps, one screen, the same shape as the web client.
 *
 * The signing session lives in a ref and dies with the screen, because the key is never
 * written down. The address outlives it in secure storage, so a relaunch shows you signed
 * in and reads your balance, and the passkey is asked for at the moment something must be
 * signed. That is where a person expects to be asked.
 */
export default function SendFlow() {
  const session = useRef<MeraAccount | null>(null)
  const [step, setStep] = useState<Step>('signin')
  const [address, setAddress] = useState<Address | null>(null)
  const [balance, setBalance] = useState<bigint | null>(null)
  const [corridor, setCorridor] = useState<Corridor>(LIVE_CORRIDOR)
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const [quote, setQuote] = useState<QuoteDto | null>(null)
  const [maxSpreadBps, setMaxSpreadBps] = useState(MAX_SPREAD_DEFAULT)
  const [settled, setSettled] = useState<{ intentId: Hex; txHash: Hex } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const source = sourceToken()
  const dep = deployment()

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => () => session.current?.end(), [])

  useEffect(() => {
    void loadStoredAccount().then((stored) => {
      if (stored) {
        setAddress(stored.address)
        setStep('amount')
      }
    })
  }, [])

  useEffect(() => {
    if (!address) return
    let live = true
    void readBalance(address).then((b) => {
      if (live) setBalance(b)
    })
    return () => {
      live = false
    }
  }, [address, step])

  const marketClosed = corridor.tier === 'live' && !isFxMarketOpen(Math.floor(now / 1000))

  const withAccount = useCallback(async (fn: () => Promise<MeraAccount>) => {
    setBusy(true)
    setError(null)
    try {
      const account = await fn()
      session.current?.end()
      session.current = account
      setAddress(account.address)
      setStep('amount')
    } catch (e) {
      setError(describeAccountError(e))
    } finally {
      setBusy(false)
    }
  }, [])

  const getQuote = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const q = await fetchQuote('AUSD', corridor.target, amount)
      setQuote(q)
      setStep('quote')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The quote failed. Try again.')
    } finally {
      setBusy(false)
    }
  }, [amount, corridor.target])

  const send = useCallback(async () => {
    if (!quote || !dep || !isAddress(recipient)) return
    setBusy(true)
    setError(null)
    try {
      const account = session.current ?? (await unlockStoredAccount())
      session.current = account
      const result = await settleFromPhone({
        account,
        corridor,
        quote,
        recipient: getAddress(recipient),
        maxSpreadBps,
        router: dep.corridorRouter,
      })
      setSettled({ intentId: result.intentId, txHash: result.txHash })
      setStep('sent')
    } catch (e) {
      setError(`${e instanceof Error ? e.message : 'Settlement failed.'} Nothing moved.`)
    } finally {
      setBusy(false)
    }
  }, [quote, dep, recipient, corridor, maxSpreadBps])

  const reset = useCallback(() => {
    setSettled(null)
    setQuote(null)
    setAmount('')
    setRecipient('')
    setStep('amount')
  }, [])

  const live = useMemo(() => CORRIDORS.filter((c) => c.tier !== 'unpriced' || c.target === 'NGN'), [])

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <View style={s.nav}>
        <Text style={s.wordmark}>Henad</Text>
        {address ? (
          <Pressable onPress={() => void Clipboard.setStringAsync(address)} accessibilityLabel={`Copy address ${address}`}>
            <Text style={s.chip}>{`${address.slice(0, 6)}…${address.slice(-4)}`}</Text>
          </Pressable>
        ) : (
          <Text style={s.rp}>{rpId()}</Text>
        )}
      </View>

      {marketClosed && step !== 'sent' ? (
        <View style={s.banner}>
          <Notice>FX market closed. Rates reopen Sunday at 23:00 UTC; nothing settles until then.</Notice>
        </View>
      ) : null}

      {step === 'signin' ? (
        <SignInStep busy={busy} error={error} onContinue={() => void withAccount(continueWithPasskey)} onSignIn={() => void withAccount(() => signIn())} />
      ) : step === 'amount' ? (
        <AmountStep
          corridors={live}
          corridor={corridor}
          onCorridor={setCorridor}
          amount={amount}
          onAmount={setAmount}
          recipient={recipient}
          onRecipient={setRecipient}
          balance={balance}
          sourceSymbol={source.symbol}
          sourceDecimals={source.decimals}
          busy={busy}
          error={error}
          onQuote={() => void getQuote()}
        />
      ) : step === 'quote' && quote ? (
        <QuoteStep
          corridor={corridor}
          quote={quote}
          now={now}
          sourceDecimals={source.decimals}
          maxSpreadBps={maxSpreadBps}
          onSpread={(bps) => setMaxSpreadBps(Math.min(MAX_SPREAD_MAX, Math.max(MAX_SPREAD_MIN, bps)))}
          recipient={recipient}
          deployed={dep !== null}
          busy={busy}
          error={error}
          onSend={() => void send()}
          onBack={() => setStep('amount')}
          onRequote={() => void getQuote()}
        />
      ) : step === 'sent' && quote && settled ? (
        <SentStep corridor={corridor} quote={quote} sourceDecimals={source.decimals} intentId={settled.intentId} txHash={settled.txHash} onDone={reset} />
      ) : null}

      <Text style={s.foot}>PASSKEY BY MERA · BUILT ON MONAD{settled ? ` · ${shortId(settled.intentId)}` : ''}</Text>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  nav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  wordmark: { fontSize: 20, fontWeight: '600', color: color.ink, letterSpacing: -0.5 },
  chip: {
    ...mono,
    fontSize: 11,
    color: color.ink,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  rp: { ...mono, fontSize: 11, color: color.muted },
  banner: { paddingHorizontal: 20, paddingTop: 12 },
  foot: { ...mono, fontSize: 9, letterSpacing: 1, color: color.muted, textAlign: 'center', paddingVertical: 10 },
})
