import { useCallback, useEffect, useState } from 'react'
import { Linking, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import { getAddress, isAddress, type Address, type Hex } from 'viem'
import { CORRIDORS, LIVE_CORRIDOR, MAX_SPREAD_DEFAULT, MAX_SPREAD_MAX, MAX_SPREAD_MIN, isFxMarketOpen, quoteMaths, type Corridor, type QuoteDto } from '@henad/core'
import { fetchQuote, fetchRates, fetchReceipt, fetchReceipts, receiptUrl, type RatesPayload, type ReceiptDto } from '@/lib/api'
import { readBalance, readHoldings, sourceToken, type Holding } from '@/lib/balance'
import { appChain, appChainId, deployment, isLocalFork } from '@/lib/config'
import { chainLabel } from '@/lib/display'
import { continueWithPasskey, describeAccountError, forgetStoredAccount, loadStoredAccount, signIn, unlockStoredAccount, type MeraAccount } from '@/lib/mera'
import { settleFromPhone } from '@/lib/settle'
import { alertsState, cancelMarketAlerts, requestAlertPermission, scheduleMarketAlerts, sendTestAlert } from '@/lib/market-alerts'
import { INTERVAL_MINUTES, WATCHABLE, rateWatchState, runRateWatch, setWatchedCorridors, startRateWatch, stopRateWatch } from '@/lib/rate-watch'
import { ProfileScreen } from '@/profile/ProfileScreen'
import { SettingsScreen } from '@/settings/SettingsScreen'
import { ScanScreen } from '@/profile/ScanScreen'
import { TabBar, type Tab } from '@/nav/TabBar'
import { ReceiptsScreen } from '@/receipts/ReceiptsScreen'
import { FundScreen } from '@/fund/FundScreen'
import { RatesScreen } from '@/rates/RatesScreen'
import { AmountStep } from '@/send/AmountStep'
import { ClosedStep } from '@/send/ClosedStep'
import { QuoteStep } from '@/send/QuoteStep'
import { SentStep, type SentReceipt } from '@/send/SentStep'
import { SignInStep } from '@/send/SignInStep'
import { BuiltOnMonad, Chip, Header } from '@/ui'
import { color } from '@/theme'

type Step = 'signin' | 'amount' | 'quote' | 'sent'
type View_ = 'send' | 'fund' | 'rates' | 'receipts' | 'profile' | 'settings'

/**
 * The app: the send flow and the rates screen, in the canvas's six states.
 *
 * No signing key is kept between actions: every payout asks for the passkey, and the key
 * derived for it is ended as soon as the payout is signed. The address lives in secure
 * storage, so a relaunch shows you signed in and reads your balance.
 */
export default function App() {
  const chainId = appChainId()
  const dep = deployment()
  const source = sourceToken()

  const [view, setView] = useState<View_>('send')
  const [step, setStep] = useState<Step>('signin')
  const [address, setAddress] = useState<Address | null>(null)
  const [balance, setBalance] = useState<bigint | null>(null)
  const [corridor, setCorridor] = useState<Corridor>(LIVE_CORRIDOR)
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const [quote, setQuote] = useState<QuoteDto | null>(null)
  const [maxSpreadBps, setMaxSpreadBps] = useState(MAX_SPREAD_DEFAULT)
  const [sent, setSent] = useState<SentReceipt | null>(null)
  const [rates, setRates] = useState<RatesPayload | null>(null)
  const [ratesLoading, setRatesLoading] = useState(false)
  const [ratesError, setRatesError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [scanning, setScanning] = useState(false)
  const [holdings, setHoldings] = useState<Holding[] | null>(null)
  const [holdingsLoading, setHoldingsLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [receipts, setReceipts] = useState<ReceiptDto[] | null>(null)
  const [receiptsLoading, setReceiptsLoading] = useState(false)
  const [receiptsError, setReceiptsError] = useState<string | null>(null)
  const [watch, setWatch] = useState<{ on: boolean; available: boolean; keys: string[]; note: string }>({
    on: false,
    available: true,
    keys: WATCHABLE,
    note: 'Off. Turn it on to be told hourly what a dollar buys, and which way it moved.',
  })
  const [alerts, setAlerts] = useState<{ on: boolean; note: string; queued: string[] }>({
    on: false,
    note: 'Get told when the FX market opens and closes.',
    queued: [],
  })

  /** Read the schedule and say, in words, what the next alert will be. */
  const readAlerts = useCallback(async () => {
    const state = await alertsState()
    const at = new Date(state.nextAt * 1000)
    const when = `${String(at.getUTCHours()).padStart(2, '0')}:${String(at.getUTCMinutes()).padStart(2, '0')} UTC`
    const what = state.opens ? `opens ${when}` : `closes ${when}`
    setAlerts({
      on: state.count > 0,
      note:
        state.count > 0
          ? `On. The market is ${state.open ? 'open' : 'closed'} now, and ${what}. Your phone holds these:`
          : `Off. The market is ${state.open ? 'open' : 'closed'} now, and ${what}.`,
      // The times the phone is actually holding, so a schedule that never arrived is visible
      // here rather than only by waiting for it again.
      queued: state.queued.map((q) => {
        const d = new Date(q * 1000)
        return `${d.toUTCString().slice(0, 22)} UTC`
      }),
    })
  }, [])

  /** What the phone's background scheduler is actually doing, in words. */
  const readWatch = useCallback(async () => {
    const state = await rateWatchState()
    const last = state.lastAt ? new Date(state.lastAt * 1000).toUTCString().slice(17, 22) : null
    setWatch((w) => ({
      ...w,
      on: state.on,
      available: state.available,
      note: !state.available
        ? 'This phone will not run background tasks for Henad. Check its battery settings.'
        : state.on
          ? `On, no sooner than every ${INTERVAL_MINUTES} minutes.${last ? ` Last read ${last} UTC.` : ' Nothing read yet.'}`
          : 'Off. Turn it on to be told hourly what a dollar buys, and which way it moved.',
    }))
  }, [])

  useEffect(() => {
    if (view !== 'settings') return
    void readAlerts()
    void readWatch()
  }, [view, readAlerts, readWatch])

  const toggleWatch = useCallback(async () => {
    if (watch.on) {
      await stopRateWatch()
    } else {
      if (!(await requestAlertPermission())) {
        setWatch((w) => ({ ...w, note: 'Notifications are blocked for Henad, so there is nowhere to put a rate alert.' }))
        return
      }
      setWatchedCorridors(watch.keys)
      await startRateWatch()
    }
    await readWatch()
  }, [watch.on, watch.keys, readWatch])

  const toggleCorridor = useCallback((key: string) => {
    setWatch((w) => {
      const keys = w.keys.includes(key) ? w.keys.filter((k) => k !== key) : [...w.keys, key]
      setWatchedCorridors(keys)
      return { ...w, keys }
    })
  }, [])

  /** The same pass the background task runs, on demand: proves the whole path in one tap. */
  const checkRatesNow = useCallback(async () => {
    setWatch((w) => ({ ...w, note: 'Reading the rates…' }))
    try {
      const { posted, summary } = await runRateWatch(watch.keys)
      setWatch((w) => ({ ...w, note: posted ? summary : 'No rate was available to read just now.' }))
    } catch (e) {
      setWatch((w) => ({ ...w, note: e instanceof Error ? e.message : 'Could not read the rates.' }))
    }
  }, [watch.keys])

  const toggleAlerts = useCallback(async () => {
    if (alerts.on) {
      await cancelMarketAlerts()
    } else {
      if (!(await requestAlertPermission())) {
        setAlerts((a) => ({ ...a, note: 'Notifications are blocked for Henad. Turn them on in your phone settings, then try again.' }))
        return
      }
      await scheduleMarketAlerts()
    }
    await readAlerts()
  }, [alerts.on, readAlerts])

  const loadReceipts = useCallback(async () => {
    setReceiptsLoading(true)
    try {
      setReceipts(await fetchReceipts())
      setReceiptsError(null)
    } catch (e) {
      setReceiptsError(e instanceof Error ? e.message : 'Receipts are unavailable.')
    } finally {
      setReceiptsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (view === 'receipts') void loadReceipts()
  }, [view, loadReceipts])
  const network = isLocalFork() ? 'Local fork' : chainLabel(chainId)

  const loadHoldings = useCallback(async () => {
    if (!address) return
    setHoldingsLoading(true)
    const next = await readHoldings(address)
    // A failed background read keeps the last good balances rather than blanking them.
    setHoldings((prev) => next ?? prev)
    setHoldingsLoading(false)
  }, [address])

  // Balances change when a payout lands, including one sent from the web, so the account
  // screen keeps reading while it is open.
  useEffect(() => {
    if (view !== 'profile') return
    void loadHoldings()
    const id = setInterval(() => void loadHoldings(), 15_000)
    return () => clearInterval(id)
  }, [view, loadHoldings])

  const copyAddress = useCallback(() => {
    if (!address) return
    void Clipboard.setStringAsync(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [address])

  const signOut = useCallback(async () => {
    await forgetStoredAccount()
    setAddress(null)
    setBalance(null)
    setHoldings(null)
    setQuote(null)
    setSent(null)
    setRecipient('')
    setStep('signin')
    setView('send')
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    void loadStoredAccount().then((stored) => {
      if (stored) {
        setAddress(stored.address)
        setStep('amount')
      }
    })
  }, [])

  // Money arrives from outside the app too, so this keeps reading rather than only on a step
  // change: a swap or a payout from the web shows up without reopening anything.
  useEffect(() => {
    if (!address) return
    let live = true
    const read = () =>
      readBalance(address).then((b) => {
        if (live) setBalance(b)
      })
    void read()
    const id = setInterval(() => void read(), 15_000)
    return () => {
      live = false
      clearInterval(id)
    }
  }, [address, step])

  const loadRates = useCallback(async () => {
    setRatesLoading(true)
    try {
      setRates(await fetchRates())
      setRatesError(null)
    } catch (e) {
      setRatesError(e instanceof Error ? e.message : 'Rates are unavailable.')
    } finally {
      setRatesLoading(false)
    }
  }, [])

  // The feeds heartbeat every 240 s; reading every 30 s keeps the age honest without
  // hammering a public RPC.
  useEffect(() => {
    void loadRates()
    const id = setInterval(() => void loadRates(), 30_000)
    return () => clearInterval(id)
  }, [loadRates])

  const withAccount = useCallback(async (fn: () => Promise<MeraAccount>) => {
    setBusy(true)
    setError(null)
    try {
      const account = await fn()
      // Signing in only needs the address. Each payout asks for the passkey again.
      account.end()
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
      setQuote(await fetchQuote(source.symbol, corridor.target, amount))
      setStep('quote')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The quote failed. Try again.')
    } finally {
      setBusy(false)
    }
  }, [amount, corridor.target, source.symbol])

  const send = useCallback(async () => {
    if (!quote || !dep || !isAddress(recipient)) return
    setBusy(true)
    setError(null)
    const started = Date.now()
    try {
      const account = await unlockStoredAccount()
      let result: Awaited<ReturnType<typeof settleFromPhone>>
      try {
        result = await settleFromPhone({ account, corridor, quote, recipient: getAddress(recipient), maxSpreadBps, router: dep.corridorRouter })
      } finally {
        account.end()
      }

      // Finality measured here, tap to receipt, rather than copied from a design.
      let finalMs: number | null = null
      let block: bigint | null = null
      try {
        const receipt = await appChain().waitForTransactionReceipt({ hash: result.txHash, timeout: 30_000 })
        finalMs = Date.now() - started
        block = receipt.blockNumber
      } catch {
        // Still pending or unreachable: show the receipt without the figure.
      }
      const chainReceipt = await fetchReceipt(result.intentId)
      const td = corridor.targetAsset?.decimals ?? 18
      const m = quoteMaths(quote, source.decimals, td)
      setSent({
        intentId: result.intentId,
        txHash: result.txHash,
        chainId,
        index: chainReceipt?.index ?? null,
        settledAt: chainReceipt?.settledAt ?? null,
        block: chainReceipt ? BigInt(chainReceipt.settledAtBlock) : block,
        finalMs,
        recipient,
        sourceAmount: m.sourceAmount,
        sourceSymbol: source.symbol,
        sourceDecimals: source.decimals,
        delivered: chainReceipt ? BigInt(chainReceipt.deliveredAmount) : m.delivered,
        referenceRate: chainReceipt ? BigInt(chainReceipt.referenceRate) : m.referenceRate,
        executedRate: chainReceipt ? BigInt(chainReceipt.executedRate) : m.executedRate,
        spreadBps: chainReceipt?.spreadBps ?? m.spreadBps,
        spreadCost: chainReceipt ? BigInt(chainReceipt.spreadCost) : m.spreadCost,
        rateSource: chainReceipt?.rateSource ?? null,
        maxSpreadBps,
      })
      setStep('sent')
      void loadRates()
    } catch (e) {
      setError(`${e instanceof Error ? e.message : 'Settlement failed.'} Nothing moved.`)
    } finally {
      setBusy(false)
    }
  }, [quote, dep, recipient, corridor, maxSpreadBps, source, chainId, loadRates])

  const reset = useCallback(() => {
    setSent(null)
    setQuote(null)
    setAmount('')
    setRecipient('')
    setStep('amount')
  }, [])

  const closed = corridor.tier === 'live' && (!isFxMarketOpen(Math.floor(now / 1000)) || rates?.rates.find((r) => r.key === corridor.key)?.marketClosed === true)

  // Routing lives in the tab bar now. The header carries the brand and, once signed in, the
  // address chip, which is a second way into the account.
  const header = address ? (
    <Header right={<Chip onPress={() => setView('profile')}>{`${address.slice(0, 6)}…${address.slice(-4)}`}</Chip>} />
  ) : (
    <Header right={<BuiltOnMonad />} />
  )

  const activeTab: Tab | null = view === 'profile' || view === 'settings' ? 'account' : view
  const selectTab = (tab: Tab) => {
    setError(null)
    // Account without an account is the sign-in screen, which lives under Send.
    if (tab === 'account') setView(address ? 'profile' : 'send')
    else setView(tab)
  }

  let body
  if (scanning) {
    body = (
      <ScanScreen
        onScanned={(scanned) => {
          setRecipient(scanned)
          setScanning(false)
        }}
        onCancel={() => setScanning(false)}
      />
    )
  } else if (view === 'profile' && address) {
    body = (
      <ProfileScreen
        address={address}
        network={network}
        holdings={holdings}
        loading={holdingsLoading}
        copied={copied}
        onCopy={copyAddress}
        onRefresh={() => void loadHoldings()}
        onSettings={() => setView('settings')}
      />
    )
  } else if (view === 'settings') {
    body = (
      <SettingsScreen
        network={network}
        alerts={alerts}
        onToggleAlerts={() => void toggleAlerts()}
        onTestAlert={() => void sendTestAlert()}
        watch={watch}
        onToggleWatch={() => void toggleWatch()}
        onToggleCorridor={toggleCorridor}
        onCheckNow={() => void checkRatesNow()}
        onSignOut={() => void signOut()}
        onBack={() => setView('profile')}
      />
    )
  } else if (view === 'fund' && address) {
    body = <FundScreen address={address} chainId={chainId} network={network} onDone={() => setView('send')} />
  } else if (view === 'receipts') {
    body = (
      <ReceiptsScreen
        receipts={receipts}
        loading={receiptsLoading}
        error={receiptsError}
        me={address}
        onRefresh={() => void loadReceipts()}
        onOpen={(r) => void Linking.openURL(receiptUrl(r.intentId))}
      />
    )
  } else if (view === 'rates') {
    body = (
      <RatesScreen
        network={network}
        data={rates}
        loading={ratesLoading}
        error={ratesError}
        onRefresh={() => void loadRates()}
        onSend={(c) => {
          setCorridor(c)
          setView('send')
        }}
      />
    )
  } else if (step === 'signin') {
    body = <SignInStep busy={busy} error={error} chain={network} onContinue={() => void withAccount(continueWithPasskey)} onSignIn={() => void withAccount(() => signIn())} />
  } else if (step === 'sent' && sent) {
    body = <SentStep corridor={corridor} r={sent} onDone={reset} />
  } else if (closed) {
    body = (
      <ClosedStep
        corridor={corridor}
        now={now}
        amount={amount}
        source={source}
        last={rates?.ledger.byCorridor[corridor.key] ?? null}
        onBrowseRates={() => setView('rates')}
        onOpenReceipt={(id) => void Linking.openURL(receiptUrl(id as Hex))}
      />
    )
  } else if (step === 'quote' && quote) {
    body = (
      <QuoteStep
        corridor={corridor}
        quote={quote}
        now={now}
        source={source}
        maxSpreadBps={maxSpreadBps}
        onSpread={(bps) => setMaxSpreadBps(Math.min(MAX_SPREAD_MAX, Math.max(MAX_SPREAD_MIN, bps)))}
        deployed={dep !== null}
        busy={busy}
        error={error}
        onSend={() => void send()}
        onBack={() => setStep('amount')}
        onRequote={() => void getQuote()}
      />
    )
  } else {
    body = (
      <AmountStep
        corridors={CORRIDORS}
        corridor={corridor}
        onCorridor={setCorridor}
        rate={rates?.rates.find((r) => r.key === corridor.key)}
        now={now}
        amount={amount}
        onAmount={setAmount}
        recipient={recipient}
        onRecipient={setRecipient}
        onPaste={() => void Clipboard.getStringAsync().then((t) => setRecipient(t.trim()))}
        onScan={() => setScanning(true)}
        balance={balance}
        source={source}
        busy={busy}
        error={error}
        onQuote={() => void getQuote()}
        onWhy={() => setView('rates')}
      />
    )
  }

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      {scanning ? null : header}
      <View style={s.body}>{body}</View>
      {/* Signed out there is one thing to do, so the sign-in screen carries no navigation:
          rates and receipts are behind an account you do not have yet. */}
      {scanning || !address ? null : <TabBar active={activeTab} onSelect={selectTab} />}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  body: { flex: 1 },
})

