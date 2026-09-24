import { useCallback, useEffect, useRef, useState } from 'react'
import { BackHandler, Linking, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import type { Address, Hex } from 'viem'
import {
  CORRIDORS,
  LIVE_CORRIDOR,
  MAX_SPREAD_DEFAULT,
  MAX_SPREAD_MAX,
  MAX_SPREAD_MIN,
  corridorsFor,
  describeTxFailure,
  findContact,
  isFxMarketOpen,
  notePayment,
  quoteMaths,
  saveContact,
  settleableFrom,
  type Contact,
  type Corridor,
  type ParsedRecipient,
  type QuoteDto,
  type SourceAssetSymbol,
} from '@henad/core'
import { fetchQuote, fetchRates, fetchReceipt, fetchReceipts, receiptUrl, type RatesPayload, type ReceiptDto } from '@/lib/api'
import { readBalance, readHoldings, sourceToken, type Holding } from '@/lib/balance'
import { appChain, appChainId, deployment, isLocalFork } from '@/lib/config'
import { describeRecipient, loadContacts, loadMyName, safeParseRecipient, storeContacts, storeMyName, type Recipient } from '@/lib/contacts'
import { chainLabel } from '@/lib/display'
import { continueWithPasskey, describeAccountError, forgetStoredAccount, loadStoredAccount, signIn, unlockStoredAccount, type MeraAccount } from '@/lib/mera'
import { settleFromPhone } from '@/lib/settle'
import { alertsState, cancelMarketAlerts, requestAlertPermission, scheduleMarketAlerts, sendTestAlert } from '@/lib/market-alerts'
import { INTERVAL_MINUTES, WATCHABLE, rateWatchState, runRateWatch, setWatchedCorridors, startRateWatch, stopRateWatch, watchedKeys } from '@/lib/rate-watch'
import { ProfileScreen } from '@/profile/ProfileScreen'
import { SettingsScreen } from '@/settings/SettingsScreen'
import { ScanScreen } from '@/profile/ScanScreen'
import { TabBar, type Tab } from '@/nav/TabBar'
import { ReceiptsScreen } from '@/receipts/ReceiptsScreen'
import { EarnScreen } from '@/earn/EarnScreen'
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

/** "4 min ago", "3 h ago": how stale a background run is, without a date library. */
function ago(at: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - at)
  if (s < 90) return 'just now'
  if (s < 90 * 60) return `${Math.round(s / 60)} min ago`
  if (s < 36 * 3600) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} days ago`
}
type View_ = 'send' | 'fund' | 'earn' | 'rates' | 'receipts' | 'profile' | 'settings'

/** A link or scan that already names an account; `.nad` names and typos are the send screen's. */
function chosenFrom(parsed: ParsedRecipient): Recipient | null {
  if (parsed.kind === 'paylink') return { address: parsed.address, linkName: parsed.name }
  if (parsed.kind === 'address') return { address: parsed.address }
  return null
}

/**
 * The URL that launched the app is read once per process. Android hands the same one back on
 * every call, so reading it again after a remount would put back a recipient the person had
 * already paid or cleared.
 */
let launchUrlRead = false

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

  const [view, setView] = useState<View_>('send')
  const [step, setStep] = useState<Step>('signin')
  const [address, setAddress] = useState<Address | null>(null)
  const [balance, setBalance] = useState<bigint | null>(null)
  const [corridor, setCorridor] = useState<Corridor>(LIVE_CORRIDOR)
  const [sourceSymbol, setSourceSymbol] = useState<SourceAssetSymbol>('AUSD')
  const source = sourceToken(sourceSymbol)
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState<Recipient | null>(null)
  const [recipientText, setRecipientText] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  // Read by the async send path, which must note a payment against the list as it is now.
  const contactsRef = useRef<Contact[]>([])
  const [myName, setMyName] = useState<string | null>(null)
  /** A pay link opened before anyone was signed in, or during a payment, held until it can be applied. */
  const [pendingPay, setPendingPay] = useState<Recipient | null>(null)
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
    const [state, keys] = await Promise.all([rateWatchState(), watchedKeys()])
    const bg = state.background
    // Only the background task writes this, so it answers the one question that matters:
    // has Android actually woken the app, or has every reading so far come from a tap?
    const background = bg
      ? `Last background check ${new Date(bg.at * 1000).toUTCString().slice(17, 22)} UTC, ${ago(bg.at)}${bg.outcome === 'failed' ? ', and it could not read the rates' : bg.outcome === 'nothing' ? ', with nothing to report' : ''}.`
      : 'No background check has run yet. Close Henad and leave it: Android wakes it no sooner than an hour after it was last opened.'
    setWatch((w) => ({
      ...w,
      on: state.on,
      available: state.available,
      keys,
      note: !state.available
        ? 'This phone will not run background tasks for Henad. Check its battery settings.'
        : state.on
          ? `On, no sooner than every ${INTERVAL_MINUTES} minutes. ${background}`
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

  // Contacts belong to the signed-in account, so a sign-out or a switch empties the list
  // before the other account's is read.
  useEffect(() => {
    contactsRef.current = []
    setContacts([])
    if (!address) return
    let live = true
    void loadContacts(address).then((list) => {
      if (!live) return
      contactsRef.current = list
      setContacts(list)
    })
    return () => {
      live = false
    }
  }, [address])

  /** Change the contacts and store them under this account, in one step so the two cannot drift. */
  const changeContacts = useCallback(
    (fn: (list: Contact[]) => Contact[]) => {
      if (!address) return
      const next = fn(contactsRef.current)
      contactsRef.current = next
      setContacts(next)
      void storeContacts(address, next)
    },
    [address],
  )

  // The name on the pay link is per account as well, so the chip and the link never carry the
  // previous account's name while this one's is read.
  useEffect(() => {
    setMyName(null)
    if (!address) return
    let live = true
    void loadMyName(address).then((name) => {
      if (live) setMyName(name)
    })
    return () => {
      live = false
    }
  }, [address])

  const changeMyName = useCallback(
    (name: string | null) => {
      if (!address) return
      setMyName(name)
      void storeMyName(address, name)
    },
    [address],
  )

  /** Stable, because the send screen looks a `.nad` name up again whenever this changes. */
  const chooseRecipient = useCallback((r: Recipient) => {
    setRecipient(r)
    setRecipientText('')
  }, [])

  const clearRecipient = useCallback(() => {
    setRecipient(null)
    setRecipientText('')
  }, [])

  /** Typed, pasted or scanned: a link or an account is chosen at once, anything else waits in the field. */
  const enterRecipient = useCallback(
    (text: string) => {
      const chosen = chosenFrom(safeParseRecipient(text))
      if (chosen) chooseRecipient(chosen)
      else setRecipientText(text)
    },
    [chooseRecipient],
  )

  // Pay links: https://usehenad.xyz/pay/... as a verified App Link, or henad://pay/... from a QR.
  // The router is told to land on this screen (app/+native-intent.tsx); what the link says is
  // read here, where it is known whether anyone is signed in to pay from.
  useEffect(() => {
    const take = (url: string | null) => {
      if (!url) return
      // The safe parser, because this runs inside a native URL event, where a thrown error
      // closes the app: a damaged link is dropped rather than fatal.
      const parsed = safeParseRecipient(url)
      if (parsed.kind === 'paylink') setPendingPay({ address: parsed.address, linkName: parsed.name })
    }
    if (!launchUrlRead) {
      launchUrlRead = true
      Linking.getInitialURL().then(take, () => {})
    }
    const sub = Linking.addEventListener('url', ({ url }) => take(url))
    return () => sub.remove()
  }, [])

  // A link opened while signed out waits here and is applied the moment an account appears.
  // One that arrives mid-payment waits for the payment to finish: applying it then would put the
  // amount screen up over a payment still in flight.
  useEffect(() => {
    if (!address || !pendingPay || busy) return
    setPendingPay(null)
    setScanning(false)
    setSent(null)
    setQuote(null)
    setError(null)
    chooseRecipient(pendingPay)
    setStep('amount')
    setView('send')
  }, [address, pendingPay, busy, chooseRecipient])

  // USDC funds the pound corridor and nothing else yet, so picking it cannot leave you
  // holding a pair the router would revert on.
  const pickSource = useCallback(
    (symbol: SourceAssetSymbol) => {
      setSourceSymbol(symbol)
      setBalance(null)
      setQuote(null)
      setCorridor((c) => (settleableFrom(c, symbol) ? c : (corridorsFor(symbol)[0] ?? c)))
    },
    [],
  )

  const signOut = useCallback(async () => {
    await forgetStoredAccount()
    setAddress(null)
    setBalance(null)
    setSourceSymbol('AUSD')
    setHoldings(null)
    setQuote(null)
    setSent(null)
    // Stored contacts stay: they are kept per account and come back with it. Only who was
    // about to be paid is forgotten, along with any link still waiting for a sign-in.
    setRecipient(null)
    setRecipientText('')
    setPendingPay(null)
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
      readBalance(address, sourceSymbol).then((b) => {
        if (live) setBalance(b)
      })
    void read()
    const id = setInterval(() => void read(), 15_000)
    return () => {
      live = false
      clearInterval(id)
    }
  }, [address, step, sourceSymbol])

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
    if (!quote || !dep || !recipient) return
    // Who is being paid, fixed now. The receipt and the offer to save a contact are built from
    // this, never from the send screen's choice, which can change before the payment lands.
    const to = recipient
    const settledIn = corridor
    setBusy(true)
    setError(null)
    const started = Date.now()
    try {
      const account = await unlockStoredAccount()
      let result: Awaited<ReturnType<typeof settleFromPhone>>
      try {
        result = await settleFromPhone({ account, corridor, sourceSymbol, quote, recipient: to.address, maxSpreadBps, router: dep.corridorRouter })
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
      const td = settledIn.targetAsset?.decimals ?? 18
      const m = quoteMaths(quote, source.decimals, td)
      setSent({
        corridor: settledIn,
        intentId: result.intentId,
        txHash: result.txHash,
        chainId,
        index: chainReceipt?.index ?? null,
        settledAt: chainReceipt?.settledAt ?? null,
        block: chainReceipt ? BigInt(chainReceipt.settledAtBlock) : block,
        finalMs,
        to,
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
      // Only once the money has moved: contacts are ordered by who was actually paid.
      if (findContact(contactsRef.current, to.address)) {
        const at = chainReceipt?.settledAt ?? Math.floor(Date.now() / 1000)
        changeContacts((list) => notePayment(list, to.address, at))
      }
      setStep('sent')
      void loadRates()
    } catch (e) {
      console.error('[settle]', e)
      setError(`${describeTxFailure(e).message} Nothing moved.`)
    } finally {
      setBusy(false)
    }
  }, [quote, dep, recipient, corridor, sourceSymbol, maxSpreadBps, source, chainId, loadRates, changeContacts])

  const reset = useCallback(() => {
    setSent(null)
    setQuote(null)
    setAmount('')
    setRecipient(null)
    setRecipientText('')
    setStep('amount')
  }, [])

  /**
   * Android's back button, which the app is otherwise deaf to.
   *
   * Everything here is one route, so the system back gesture left the app entirely: tap
   * Top up, press back, and you are on the home screen. This walks the stack the person
   * actually sees — scanner, then settings, then any tab back to Send, then a step back
   * inside the send flow — and only leaves the app when Send is already the whole state.
   */
  useEffect(() => {
    const onBack = () => {
      if (scanning) {
        setScanning(false)
        return true
      }
      if (view === 'settings') {
        setView('profile')
        return true
      }
      if (view !== 'send') {
        setView('send')
        return true
      }
      if (step === 'sent') {
        reset()
        return true
      }
      if (step === 'quote') {
        // Swallowed while a payment is in flight, the same as the screen's own Back link.
        if (!busy) setStep('amount')
        return true
      }
      return false
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack)
    return () => sub.remove()
  }, [scanning, view, step, busy, reset])

  const closed = corridor.tier === 'live' && (!isFxMarketOpen(Math.floor(now / 1000)) || rates?.rates.find((r) => r.key === corridor.key)?.marketClosed === true)

  // Routing lives in the tab bar now. The header carries the brand and, once signed in, the
  // account chip, which is a second way into the account. It shows the person's own name
  // rather than their account number; the number is still read out to a screen reader.
  const nameChars = myName ? Array.from(myName) : []
  const chipName = myName ? (nameChars.length > 16 ? `${nameChars.slice(0, 15).join('')}…` : myName) : 'Your account'
  const header = address ? (
    <Header
      right={
        <Chip onPress={() => setView('profile')} accessibilityLabel={`${myName ?? 'Your account'}, account number ${address}`}>
          {chipName}
        </Chip>
      }
    />
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
          const chosen = chosenFrom(scanned)
          if (chosen) chooseRecipient(chosen)
          else if (scanned.kind === 'nad') setRecipientText(scanned.nadName)
          setScanning(false)
        }}
        onCancel={() => setScanning(false)}
      />
    )
  } else if (view === 'profile' && address) {
    body = (
      <ProfileScreen
        address={address}
        holdings={holdings}
        loading={holdingsLoading}
        myName={myName}
        onMyName={changeMyName}
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
  } else if (view === 'earn' && address) {
    body = <EarnScreen address={address} network={network} />
  } else if (view === 'receipts') {
    body = (
      <ReceiptsScreen
        receipts={receipts}
        loading={receiptsLoading}
        error={receiptsError}
        me={address}
        contacts={contacts}
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
    body = <SignInStep busy={busy} error={error} chain={isLocalFork() ? network : null} onContinue={() => void withAccount(continueWithPasskey)} onSignIn={() => void withAccount(() => signIn())} />
  } else if (step === 'sent' && sent) {
    const sentTo = describeRecipient(sent.to, contacts)
    body = (
      <SentStep
        corridor={sent.corridor}
        r={sent}
        to={sentTo}
        saved={sentTo.contact !== null}
        onSaveContact={(name) => {
          const at = sent.settledAt ?? Math.floor(Date.now() / 1000)
          // Saved and counted together: this payment is the one that made them a contact.
          changeContacts((list) => notePayment(saveContact(list, sent.to.address, name), sent.to.address, at))
        }}
        onDone={reset}
      />
    )
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
  } else if (step === 'quote' && quote && recipient) {
    const to = describeRecipient(recipient, contacts)
    body = (
      <QuoteStep
        corridor={corridor}
        quote={quote}
        now={now}
        source={source}
        maxSpreadBps={maxSpreadBps}
        onSpread={(bps) => setMaxSpreadBps(Math.min(MAX_SPREAD_MAX, Math.max(MAX_SPREAD_MIN, bps)))}
        to={to}
        firstPayment={to.contact === null}
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
        recipientText={recipientText}
        onRecipientText={enterRecipient}
        onChoose={chooseRecipient}
        onClearRecipient={clearRecipient}
        contacts={contacts}
        onPaste={() => void Clipboard.getStringAsync().then((t) => enterRecipient(t.trim()))}
        onScan={() => setScanning(true)}
        balance={balance}
        source={source}
        onSource={pickSource}
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

