'use client'

import { useEffect, useState } from 'react'
import { formatUnits, parseUnits, type Hex } from 'viem'
import { describeTxFailure } from '@henad/core'
import { Button } from '@/components/ui/Button'
import { Card, Notice } from '@/components/send/send-ui'
import { appChain } from '@/lib/chain'
import { describeAccountError, readBalance, unlockStoredAccount } from '@/lib/send-mera'
import { useStoredAddress } from '@/lib/use-stored-address'
import { XSTOCKS, XSTOCK_DECIMALS, executeStockOrder, quoteStockOrder, readXStockBalance, sharesPerToken, type StockOrderQuote } from '@/lib/xstocks'

type Side = 'buy' | 'sell'
const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const SLIPPAGE_BPS = 100

/**
 * Buy or sell one stock from the Henad account, as its wrapped xStock, with the receipt's three
 * numbers before signing: the oracle's price per share, the price this order fills at, and the
 * difference in basis points. A fill below the floor shown reverts.
 */
export function TradePanel({ symbol, name, price }: { symbol: string; name: string; price: number }) {
  const address = useStoredAddress()
  const x = XSTOCKS[symbol]!
  const [side, setSide] = useState<Side>('buy')
  const [amount, setAmount] = useState('')
  const [usdc, setUsdc] = useState<bigint | null>(null)
  const [held, setHeld] = useState<bigint | null>(null)
  const [ratio, setRatio] = useState<number | null>(null)
  const [quote, setQuote] = useState<StockOrderQuote | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [busy, setBusy] = useState<'approving' | 'swapping' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<Hex | null>(null)
  const [geo, setGeo] = useState<{ restricted: boolean } | null>(null)
  const [eligible, setEligible] = useState(false)

  useEffect(() => {
    let live = true
    fetch('/api/geo')
      .then((r) => r.json())
      .then(
        (g: { restricted: boolean }) => live && setGeo(g),
        () => live && setGeo({ restricted: false }),
      )
    return () => {
      live = false
    }
  }, [])

  // The parent keys this panel by symbol, so a new stock starts from a clean form.
  useEffect(() => {
    void sharesPerToken(symbol).then(setRatio, () => setRatio(null))
  }, [symbol])

  useEffect(() => {
    if (!address) return
    let live = true
    const read = () =>
      Promise.all([readBalance(address, 'USDC'), readXStockBalance(symbol, address)]).then(
        ([u, h]) => {
          if (!live) return
          setUsdc(u)
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

  const inDecimals = side === 'buy' ? 6 : XSTOCK_DECIMALS
  const pattern = new RegExp(`^\\d+(\\.\\d{1,${inDecimals}})?$`)
  const units = pattern.test(amount.trim()) && Number(amount) > 0 ? parseUnits(amount.trim(), inDecimals) : null

  useEffect(() => {
    if (units === null || !address) return
    let live = true
    const id = window.setTimeout(() => {
      setQuoting(true)
      quoteStockOrder(side, symbol, units, address, price, SLIPPAGE_BPS).then(
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
    }, 400)
    return () => {
      live = false
      window.clearTimeout(id)
    }
  }, [units, side, symbol, address, price])

  const fresh = quote && quote.side === side && quote.symbol === symbol && units !== null && quote.amountIn === units ? quote : null
  const spendable = side === 'buy' ? usdc : held
  const overBalance = units !== null && spendable !== null && units > spendable

  const blocker = geo?.restricted
    ? 'Stocks are not available where you are.'
    : !address
      ? 'Sign in first.'
      : units === null
        ? side === 'buy'
          ? 'Enter an amount of USDC.'
          : `Enter an amount of ${x.label}.`
        : overBalance
          ? side === 'buy'
            ? 'That is more USDC than this account holds. Top up first.'
            : `That is more ${x.label} than this account holds.`
          : fresh === null
            ? quoting
              ? 'Reading the price…'
              : 'No quote right now.'
            : !eligible
              ? 'Confirm you are eligible first.'
              : null

  async function submit() {
    if (!fresh || blocker) return
    setBusy('approving')
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
      const hash = await executeStockOrder(account.account, fresh, { onApproved: () => setBusy('swapping') })
      setBusy('swapping')
      const receipt = await appChain().waitForTransactionReceipt({ hash, timeout: 30_000 })
      if (receipt.status !== 'success') throw new Error('The order reverted, so nothing moved.')
      setTxHash(hash)
      setAmount('')
      setQuote(null)
    } catch (e) {
      console.error('[stocks]', e)
      setError(describeTxFailure(e).message)
    } finally {
      account.end()
      setBusy(null)
    }
  }

  const heldShares = held !== null && ratio !== null ? (Number(formatUnits(held, XSTOCK_DECIMALS)) * ratio) : null
  const outLabel = side === 'buy' ? x.label : 'USDC'
  const outDecimals = side === 'buy' ? XSTOCK_DECIMALS : 6
  const fmtOut = (v: bigint) => Number(formatUnits(v, outDecimals)).toLocaleString('en-US', { maximumFractionDigits: side === 'buy' ? 6 : 2 })

  if (geo?.restricted) {
    return (
      <Card className="flex flex-col gap-2 p-5 md:p-6">
        <span className="label text-purple">Trade {symbol}</span>
        <p className="m-0 text-[14px] leading-[1.5] text-ink pretty">
          Buying stocks is not available where you are. xStocks are not offered in the US, the UK, Canada, Australia, the EU and EEA, or sanctioned countries.
        </p>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-4 p-5 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="label text-purple">Trade {name}</span>
        <div role="tablist" aria-label="Order side" className="flex rounded-[6px] border border-hairline p-[3px]">
          {(['buy', 'sell'] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={side === s}
              onClick={() => {
                setSide(s)
                setAmount('')
                setQuote(null)
              }}
              className={`rounded-[4px] px-3 py-[5px] font-mono text-[11px] capitalize ${side === s ? 'bg-ink text-white' : 'text-grey hover:text-ink'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="label flex justify-between text-muted">
          <span>{side === 'buy' ? 'You pay' : 'You sell'}</span>
          <span className="tabular">
            {side === 'buy'
              ? usdc === null
                ? 'USDC —'
                : `USDC ${Number(formatUnits(usdc, 6)).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
              : held === null
                ? `${x.label} —`
                : `${x.label} ${Number(formatUnits(held, XSTOCK_DECIMALS)).toLocaleString('en-US', { maximumFractionDigits: 6 })}`}
          </span>
        </div>
        <label className="flex items-baseline gap-2 font-display text-[34px] font-medium leading-none tracking-[-.035em]">
          <span className="sr-only">Amount</span>
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
          <span className="font-mono text-[13px] text-muted">{side === 'buy' ? 'USDC' : x.label}</span>
        </label>
        <button
          type="button"
          className="label self-start text-purple disabled:text-muted"
          disabled={!spendable}
          onClick={() => spendable && setAmount(formatUnits(spendable, inDecimals))}
        >
          Use all
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-hairline-2 pt-3 font-mono text-[12px] tabular">
        <span className="text-muted">You get</span>
        <span className="text-right text-ink">{fresh ? `${fmtOut(fresh.amountOut)} ${outLabel}` : '—'}</span>
        <span className="text-muted">Oracle price</span>
        <span className="text-right text-ink">{usd(price)}</span>
        <span className="text-muted">Your price</span>
        <span className="text-right text-ink">{fresh ? usd(fresh.executedPrice) : '—'}</span>
        <span className="text-muted">Spread</span>
        <span className="text-right text-ink">{fresh ? `${fresh.spreadBps.toFixed(1)} bps` : '—'}</span>
        <span className="text-muted">At worst</span>
        <span className="text-right text-ink">{fresh ? `${fmtOut(fresh.minimumOut)} ${outLabel}` : '—'}</span>
      </div>

      {heldShares !== null && heldShares > 0 && (
        <p className="m-0 font-mono text-[11px] text-muted tabular">
          You hold {heldShares.toLocaleString('en-US', { maximumFractionDigits: 6 })} {symbol} shares, about {usd(heldShares * price)}.
        </p>
      )}

      <label className="flex items-start gap-2 text-[12px] leading-[1.5] text-grey">
        <input type="checkbox" checked={eligible} onChange={(e) => setEligible(e.target.checked)} className="mt-[3px]" />
        <span>
          I am not a US person, and I am not in the US, the UK, Canada, Australia, the EU or EEA, or a sanctioned country. I understand xStocks track a share&apos;s price but
          carry no voting rights.
        </span>
      </label>

      {error && <Notice>{error}</Notice>}
      {txHash && (
        <Notice tone="info">
          {side === 'buy' ? 'Bought.' : 'Sold.'}{' '}
          <a href={`https://monadscan.com/tx/${txHash}`} target="_blank" rel="noreferrer" className="text-purple">
            View on Monadscan ↗
          </a>
        </Notice>
      )}

      <Button size="lg" block variant={blocker || busy ? 'disabled' : 'primary'} onClick={() => void submit()}>
        {busy === 'approving' ? 'Approving…' : busy === 'swapping' ? (side === 'buy' ? 'Buying…' : 'Selling…') : side === 'buy' ? `Buy ${symbol}` : `Sell ${symbol}`}
      </Button>
      <p className="m-0 text-center font-mono text-[11px] text-muted">{blocker ?? 'Your passkey signs this order, from your own account. Gas is paid in MON.'}</p>
      <p className="m-0 text-[11px] leading-[1.5] text-muted pretty">
        You hold {x.label}, a wrapped xStock on Monad, filled through Relay from Uniswap v4. The oracle price runs about 15 minutes behind the market, so the spread
        includes any move since. A fill below &quot;At worst&quot; reverts. Not investment advice.
      </p>
    </Card>
  )
}
