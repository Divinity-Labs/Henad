'use client'

import { useEffect, useState } from 'react'
import { formatUnits, parseUnits, parseEther, type Hex } from 'viem'
import { SOURCE_ASSETS, describeTxFailure, type SourceAssetSymbol } from '@henad/core'
import { Button } from '@/components/ui/Button'
import { TokenIcon } from '@/components/ui/TokenIcon'
import { Card, Notice, StepHeader } from '@/components/send/send-ui'
import { appChain } from '@/lib/chain'
import { money, tokens } from '@/lib/format'
import { describeAccountError, readBalance, unlockStoredAccount } from '@/lib/send-mera'
import {
  quoteMonForStable,
  quoteStableSwap,
  readMonBalance,
  stableToken,
  swapMonForStable,
  swapStable,
  type StableSwapQuote,
  type SwapQuote,
} from '@/lib/swap'
import { useStoredAddress } from '@/lib/use-stored-address'

/** Gas for the swap itself, held back so a "swap everything" cannot leave the account stranded. */
const GAS_RESERVE = parseEther('0.05')

type From = 'MON' | SourceAssetSymbol
const FROM: From[] = ['MON', ...SOURCE_ASSETS.map((a) => a.symbol)]

/** One shape for both kinds of quote, so the screen does not care which venue answered. */
type Quote = { amountIn: bigint; amountOut: bigint; minimumOut: bigint; slippageBps: number; venueLabel: string } & (
  | { kind: 'mon'; mon: SwapQuote }
  | { kind: 'stable'; stable: StableSwapQuote }
)

/**
 * Top up: MON, or the other stablecoin, into the stablecoin a payout spends.
 *
 * Deliberately not dressed as a payout. A payout states a reference rate and enforces a spread
 * against it; this is a market swap where the venue's price is the only price there is, so the
 * screen names the venue, shows the floor the fill may not fall below, and promises nothing else.
 * USDC ⇄ AUSD asks PancakeSwap's direct pool and Mento's route through USDm and takes the better.
 */
export function FundView({ network }: { network: string }) {
  const address = useStoredAddress()
  const [from, setFrom] = useState<From>('MON')
  const [symbol, setSymbol] = useState<SourceAssetSymbol>('AUSD')
  const [amount, setAmount] = useState('')
  const [mon, setMon] = useState<bigint | null>(null)
  const [fromHeld, setFromHeld] = useState<bigint | null>(null)
  const [held, setHeld] = useState<bigint | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [busy, setBusy] = useState<'approving' | 'swapping' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<Hex | null>(null)

  // A stablecoin cannot be swapped for itself: picking USDC to spend moves the target to AUSD.
  const targets = SOURCE_ASSETS.filter((a) => a.symbol !== from)
  const to: SourceAssetSymbol = from !== 'MON' && symbol === from ? targets[0]!.symbol : symbol
  const fromDecimals = from === 'MON' ? 18 : stableToken(from).decimals
  const decimals = stableToken(to).decimals

  useEffect(() => {
    if (!address) return
    let live = true
    const read = () =>
      Promise.all([readMonBalance(address), readBalance(address, to), from === 'MON' ? Promise.resolve(null) : readBalance(address, from)]).then(
        ([m, h, f]) => {
          if (!live) return
          setMon(m)
          setHeld(h)
          setFromHeld(f ?? m)
        },
        () => {},
      )
    void read()
    const id = window.setInterval(() => void read(), 15_000)
    return () => {
      live = false
      window.clearInterval(id)
    }
  }, [address, from, to, txHash])

  const pattern = new RegExp(`^\\d+(\\.\\d{1,${fromDecimals}})?$`)
  const units = pattern.test(amount.trim()) && Number(amount) > 0 ? parseUnits(amount.trim(), fromDecimals) : null

  // Re-quote as the amount or the pair changes. Prices move, so an old number is a lie:
  // anything quoted for a different amount or pair is ignored below rather than shown.
  useEffect(() => {
    if (units === null) return
    let live = true
    const id = window.setTimeout(() => {
      setQuoting(true)
      const ask: Promise<Quote> =
        from === 'MON'
          ? quoteMonForStable(units, to).then((q) => ({ ...q, venueLabel: 'PancakeSwap 0.05% pool', kind: 'mon' as const, mon: q }))
          : quoteStableSwap(units, from, to, 50, address ?? undefined).then((q) => ({ ...q, kind: 'stable' as const, stable: q }))
      ask.then(
        (q) => {
          if (!live) return
          setQuote(q)
          setQuoting(false)
        },
        () => {
          if (!live) return
          setQuote(null)
          setQuoting(false)
        },
      )
    }, 300)
    return () => {
      live = false
      window.clearTimeout(id)
    }
  }, [units, from, to, address])

  const spendable = from === 'MON' ? (mon === null ? null : mon > GAS_RESERVE ? mon - GAS_RESERVE : 0n) : fromHeld
  // A quote belongs to the amount and pair it was asked for; anything else is stale.
  const samePair = quote && (quote.kind === 'mon' ? from === 'MON' : quote.stable.from === from && quote.stable.to === to)
  const fresh = quote && samePair && units !== null && quote.amountIn === units ? quote : null
  const overBalance = units !== null && spendable !== null && units > spendable
  const noGas = mon !== null && mon < GAS_RESERVE / 5n

  const blocker = !address
    ? 'Sign in first.'
    : units === null
      ? `Enter an amount of ${from}.`
      : overBalance
        ? from === 'MON'
          ? 'That is more than your MON, less the gas this swap costs.'
          : `That is more ${from} than this account holds.`
        : noGas
          ? 'This account needs a little MON for gas first.'
          : fresh === null
            ? quoting
              ? 'Reading the price…'
              : 'No quote right now.'
            : null

  async function swap() {
    if (!fresh || !address) return
    setBusy('swapping')
    setError(null)
    setTxHash(null)
    let account
    try {
      account = await unlockStoredAccount()
    } catch (e) {
      setError(describeAccountError(e))
      setBusy(null)
      return
    }
    try {
      let hash: Hex
      if (fresh.kind === 'mon') {
        hash = await swapMonForStable(account.account, fresh.mon, to)
      } else {
        setBusy('approving')
        hash = await swapStable(account.account, fresh.stable, { onApproved: () => setBusy('swapping') })
      }
      const receipt = await appChain().waitForTransactionReceipt({ hash, timeout: 30_000 })
      if (receipt.status !== 'success') throw new Error('The swap reverted, so nothing moved.')
      setTxHash(hash)
      setAmount('')
      setQuote(null)
    } catch (e) {
      console.error('[top-up]', e)
      setError(describeTxFailure(e).message)
    } finally {
      account.end()
      setBusy(null)
    }
  }

  const fmtFrom = (v: bigint) =>
    from === 'MON' ? `MON ${Number(formatUnits(v, 18)).toLocaleString('en-GB', { maximumFractionDigits: 4 })}` : tokens(v, fromDecimals, from, 2)

  return (
    <div className="flex flex-1 flex-col gap-3 px-4 pb-6 pt-5">
      <StepHeader left="Top up" right={network} />

      <Card className="flex flex-col gap-[10px] p-4">
        <div className="label flex justify-between text-muted">
          <span>You swap</span>
          <span className="tabular">{fromHeld === null ? `${from} —` : fmtFrom(fromHeld)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <label className="flex min-w-0 flex-1 items-baseline font-display text-[38px] font-medium leading-none tracking-[-.035em]">
            <span className="sr-only">Amount of {from} to swap</span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="min-w-0 flex-1 bg-transparent p-0 tabular placeholder:text-dim-2"
              style={{ font: 'inherit' }}
            />
          </label>
          <div className="flex flex-none gap-[6px]">
            {FROM.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setFrom(s)
                  setAmount('')
                  setQuote(null)
                }}
                aria-pressed={from === s}
                className={`press flex items-center gap-[6px] rounded-full border px-3 py-[5px] font-mono text-[12px] ${
                  from === s ? 'border-purple text-ink' : 'border-border text-muted hover:border-muted'
                }`}
              >
                <TokenIcon symbol={s} size={20} />
                {s}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="label self-start text-purple disabled:text-muted"
          disabled={spendable === null || spendable === 0n}
          onClick={() => spendable && setAmount(formatUnits(spendable, fromDecimals))}
        >
          {from === 'MON' ? 'Use all but gas' : 'Use all'}
        </button>
      </Card>

      <Card className="flex flex-col gap-[10px] p-4">
        <div className="label flex justify-between text-muted">
          <span>You receive</span>
          <span className="tabular">{held === null ? '—' : tokens(held, decimals, to, 2)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="font-display text-[38px] font-medium leading-none tracking-[-.035em] tabular">
            {fresh ? tokens(fresh.amountOut, decimals, '', 4).trim() : '—'}
          </div>
          <div className="flex flex-none gap-[6px]">
            {targets.map((a) => (
              <button
                key={a.symbol}
                type="button"
                onClick={() => setSymbol(a.symbol)}
                aria-pressed={to === a.symbol}
                className={`press flex items-center gap-[6px] rounded-full border px-3 py-[5px] font-mono text-[12px] ${
                  to === a.symbol ? 'border-purple text-ink' : 'border-border text-muted hover:border-muted'
                }`}
              >
                <TokenIcon symbol={a.symbol} size={20} />
                {a.symbol}
              </button>
            ))}
          </div>
        </div>
        {fresh && (
          <p className="m-0 font-mono text-[11px] text-muted tabular">
            At worst {tokens(fresh.minimumOut, decimals, to, 4)} · {fresh.venueLabel} · {fresh.slippageBps / 100}% slippage
          </p>
        )}
      </Card>

      <p className="m-0 text-[12px] leading-[1.5] text-grey pretty">
        This is a market swap, not a Henad payout. The venue&apos;s price is the only price there is, so there is no reference rate, no spread cap and
        no receipt. A fill below the figure above reverts and your {from} stays put.
        {from !== 'MON' && ` The first ${from} swap asks your passkey twice: once to approve the amount, once to swap.`}
      </p>

      {error && <Notice>{error}</Notice>}
      {txHash && (
        <Notice tone="info">
          Swapped.{' '}
          <a href={`https://monadscan.com/tx/${txHash}`} target="_blank" rel="noreferrer" className="text-purple">
            View on Monadscan ↗
          </a>
        </Notice>
      )}

      <div className="flex-1" />
      <Button size="xl" block variant={blocker || busy ? 'disabled' : 'primary'} onClick={() => void swap()}>
        {busy === 'approving' ? `Approving ${from}…` : busy === 'swapping' ? 'Swapping…' : 'Swap'}
      </Button>
      <p className="m-0 text-center font-mono text-[11px] text-muted">{blocker ?? 'Your passkey signs this swap, from your own account.'}</p>
      <div className="flex gap-2">
        <Button href="/send" variant="secondary" size="lg" className="flex-1">
          Send a payout
        </Button>
        <Button href="/account" variant="secondary" size="lg" className="flex-1">
          Account
        </Button>
      </div>
      <p className="m-0 text-center text-[12px] text-muted">
        {mon !== null && mon < GAS_RESERVE ? 'This account has little MON. Send some to it first, or it cannot pay for the swap.' : `Gas is paid in MON from this account, about ${money(GAS_RESERVE / 10n, 18, '')} MON.`}
      </p>
    </div>
  )
}
