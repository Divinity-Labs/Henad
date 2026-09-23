'use client'

import { useEffect, useState } from 'react'
import { formatUnits, parseEther, type Hex } from 'viem'
import { SOURCE_ASSETS, describeTxFailure, type SourceAssetSymbol } from '@henad/core'
import { Button } from '@/components/ui/Button'
import { TokenIcon } from '@/components/ui/TokenIcon'
import { Card, Notice, StepHeader } from '@/components/send/send-ui'
import { appChain } from '@/lib/chain'
import { money, tokens } from '@/lib/format'
import { describeAccountError, readBalance, unlockStoredAccount } from '@/lib/send-mera'
import { quoteMonForStable, readMonBalance, stableToken, swapMonForStable, type SwapQuote } from '@/lib/swap'
import { useStoredAddress } from '@/lib/use-stored-address'

/** Gas for the swap itself, held back so a "swap everything" cannot leave the account stranded. */
const GAS_RESERVE = parseEther('0.05')

/**
 * Top up: MON into the stablecoin a payout spends.
 *
 * Deliberately not dressed as a payout. A payout states a reference rate and enforces a spread
 * against it; this is a market swap where the pool's price is the only price there is, so the
 * screen names the venue, shows the floor the fill may not fall below, and promises nothing else.
 */
export function FundView({ network }: { network: string }) {
  const address = useStoredAddress()
  const [symbol, setSymbol] = useState<SourceAssetSymbol>('AUSD')
  const [amount, setAmount] = useState('')
  const [mon, setMon] = useState<bigint | null>(null)
  const [held, setHeld] = useState<bigint | null>(null)
  const [quote, setQuote] = useState<SwapQuote | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<Hex | null>(null)

  useEffect(() => {
    if (!address) return
    let live = true
    const read = () =>
      Promise.all([readMonBalance(address), readBalance(address, symbol)]).then(
        ([m, h]) => {
          if (!live) return
          setMon(m)
          setHeld(h)
        },
        () => {},
      )
    void read()
    const id = window.setInterval(() => void read(), 15_000)
    return () => {
      live = false
      window.clearInterval(id)
    }
  }, [address, symbol, txHash])

  const units = /^\d+(\.\d{1,18})?$/.test(amount.trim()) && Number(amount) > 0 ? parseEther(amount.trim()) : null

  // Re-quote as the amount or the target changes. The pool moves, so an old number is a lie:
  // anything quoted for a different amount is ignored below rather than shown.
  useEffect(() => {
    if (units === null) return
    let live = true
    const id = window.setTimeout(() => {
      setQuoting(true)
      quoteMonForStable(units, symbol).then(
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
  }, [units, symbol])
  const spendable = mon === null ? null : mon > GAS_RESERVE ? mon - GAS_RESERVE : 0n
  // A quote belongs to the amount it was asked for; anything else is stale.
  const fresh = quote && units !== null && quote.amountIn === units ? quote : null
  const overBalance = units !== null && spendable !== null && units > spendable
  const decimals = stableToken(symbol).decimals

  const blocker = !address
    ? 'Sign in first.'
    : units === null
      ? 'Enter an amount of MON.'
      : overBalance
        ? 'That is more than your MON, less the gas this swap costs.'
        : fresh === null
          ? quoting
            ? 'Reading the pool…'
            : 'No quote right now.'
          : null

  async function swap() {
    if (!fresh || !address) return
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
      const hash = await swapMonForStable(account.account, fresh, symbol)
      await appChain().waitForTransactionReceipt({ hash, timeout: 30_000 })
      setTxHash(hash)
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
    <div className="flex flex-1 flex-col gap-3 px-4 pb-6 pt-5">
      <StepHeader left="Top up" right={network} />

      <Card className="flex flex-col gap-[10px] p-4">
        <div className="label flex justify-between text-muted">
          <span>You swap</span>
          <span className="tabular">{mon === null ? 'MON —' : `MON ${Number(formatUnits(mon, 18)).toLocaleString('en-GB', { maximumFractionDigits: 4 })}`}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <label className="flex min-w-0 flex-1 items-baseline font-display text-[38px] font-medium leading-none tracking-[-.035em]">
            <span className="sr-only">Amount of MON to swap</span>
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
          <span className="flex flex-none items-center gap-2 font-mono text-[12px]">
            <TokenIcon symbol="MON" size={22} />
            MON
          </span>
        </div>
        <button
          type="button"
          className="label self-start text-purple disabled:text-muted"
          disabled={spendable === null || spendable === 0n}
          onClick={() => spendable && setAmount(formatUnits(spendable, 18))}
        >
          Use all but gas
        </button>
      </Card>

      <Card className="flex flex-col gap-[10px] p-4">
        <div className="label flex justify-between text-muted">
          <span>You receive</span>
          <span className="tabular">{held === null ? '—' : tokens(held, decimals, symbol, 2)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="font-display text-[38px] font-medium leading-none tracking-[-.035em] tabular">
            {fresh ? tokens(fresh.amountOut, decimals, '', 4).trim() : '—'}
          </div>
          <div className="flex flex-none gap-[6px]">
            {SOURCE_ASSETS.map((a) => (
              <button
                key={a.symbol}
                type="button"
                onClick={() => setSymbol(a.symbol)}
                aria-pressed={symbol === a.symbol}
                className={`press flex items-center gap-[6px] rounded-full border px-3 py-[5px] font-mono text-[12px] ${
                  symbol === a.symbol ? 'border-purple text-ink' : 'border-border text-muted hover:border-muted'
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
            At worst {tokens(fresh.minimumOut, decimals, symbol, 4)} · PancakeSwap 0.05% pool · {fresh.slippageBps / 100}% slippage
          </p>
        )}
      </Card>

      <p className="m-0 text-[12px] leading-[1.5] text-grey pretty">
        This is a market swap, not a Henad payout. The pool&apos;s price is the only price there is, so there is no reference rate, no spread cap and no
        receipt. A fill below the figure above reverts and your MON stays put.
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
        {busy ? 'Swapping…' : 'Swap'}
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
        {mon !== null && mon < GAS_RESERVE ? 'This account has no MON. Send some to it first, or it cannot pay for the swap.' : `Gas is paid in MON from this account, about ${money(GAS_RESERVE / 10n, 18, '')} MON.`}
      </p>
    </div>
  )
}
