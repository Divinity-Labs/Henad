'use client'

import { useEffect, useState } from 'react'
import { formatUnits } from 'viem'
import { Card } from '@/components/send/send-ui'
import { TokenIcon } from '@/components/ui/TokenIcon'
import { readHoldings, type Holding } from '@/lib/send-mera'
import { readMonBalance } from '@/lib/swap'
import { useStoredAddress } from '@/lib/use-stored-address'
import { XSTOCKS, readXStockBalance, sharesPerToken } from '@/lib/xstocks'

/** The dollar tokens that count at face value in the total. FX tokens are listed, not summed. */
const DOLLARS = new Set(['USDC', 'AUSD', 'USDm'])

interface Trade {
  txHash: string
  at: number
  kind: 'buy' | 'sell' | 'in' | 'out'
  symbol: string
  tokens: string
  cash: 'USDC' | 'AUSD' | null
  cashAmount: string | null
}

interface Position {
  symbol: string
  tokens: bigint
  ratio: number
}

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const num = (n: number, dp = 4) => n.toLocaleString('en-US', { maximumFractionDigits: dp })
const when = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/**
 * Everything the account holds, valued, and every stock trade it has made.
 *
 * Dollars count at face value; stocks count at the oracle's price per share times the shares
 * each wrapped token stands for. The trade history is rebuilt from the chain on each visit, so
 * it includes trades made in the app or anywhere else from this account.
 */
export function PortfolioView() {
  const address = useStoredAddress()
  const [holdings, setHoldings] = useState<Holding[] | null>(null)
  const [mon, setMon] = useState<bigint | null>(null)
  const [positions, setPositions] = useState<Position[] | null>(null)
  const [prices, setPrices] = useState<Record<string, number> | null>(null)
  const [trades, setTrades] = useState<Trade[] | null | undefined>(undefined)

  useEffect(() => {
    if (!address) return
    let live = true
    const read = () => {
      void readHoldings(address).then((h) => live && h && setHoldings(h))
      void readMonBalance(address).then((m) => live && setMon(m), () => {})
      void Promise.all(
        Object.keys(XSTOCKS).map(async (symbol) => {
          const [tokens, ratio] = await Promise.all([readXStockBalance(symbol, address), sharesPerToken(symbol)])
          return { symbol, tokens, ratio }
        }),
      ).then(
        (p) => live && setPositions(p),
        () => {},
      )
    }
    read()
    // History is kept in this browser and only the blocks since the last read are asked for, so
    // only the first visit pays for a full scan. It can always be rebuilt from the chain.
    const key = `henad:stock-history:${address.toLowerCase()}`
    let saved: { trades: Trade[]; scannedTo: number } | null = null
    try {
      saved = JSON.parse(window.localStorage.getItem(key) ?? 'null')
    } catch {
      saved = null
    }
    const cached = saved
    if (cached) void Promise.resolve().then(() => live && setTrades(cached.trades))
    fetch(`/api/portfolio?address=${address}${saved ? `&from=${saved.scannedTo}` : ''}`)
      .then((r) => r.json())
      .then(
        (j: { trades: Trade[] | null; scannedTo: number | null }) => {
          if (!live) return
          if (j.trades === null || j.scannedTo === null) {
            if (!saved) setTrades(null)
            return
          }
          const seen = new Set(j.trades.map((t) => t.txHash))
          const merged = [...j.trades, ...(saved?.trades ?? []).filter((t) => !seen.has(t.txHash))].sort((a, b) => b.at - a.at)
          setTrades(merged)
          try {
            window.localStorage.setItem(key, JSON.stringify({ trades: merged, scannedTo: j.scannedTo }))
          } catch {
            // Storage blocked: the next visit reads the whole history again.
          }
        },
        () => live && !saved && setTrades(null),
      )
    fetch('/api/portfolio?prices=1')
      .then((r) => r.json())
      .then(
        (j: { prices: Record<string, number> | null }) => live && setPrices(j.prices),
        () => {},
      )
    const id = window.setInterval(read, 20_000)
    return () => {
      live = false
      window.clearInterval(id)
    }
  }, [address])

  if (!address) return null

  const dollars = (holdings ?? []).filter((h) => DOLLARS.has(h.symbol) && h.value > 0n)
  const other = (holdings ?? []).filter((h) => !DOLLARS.has(h.symbol) && h.value > 0n)
  const dollarTotal = dollars.reduce((s, h) => s + Number(formatUnits(h.value, h.decimals)), 0)
  const held = (positions ?? []).filter((p) => p.tokens > 0n).map((p) => {
    const shares = Number(formatUnits(p.tokens, 18)) * p.ratio
    const price = prices?.[p.symbol] ?? null
    // Cost basis from this account's own buys and sells, average-cost method.
    let costShares = 0
    let cost = 0
    for (const t of [...(trades ?? [])].reverse()) {
      if (t.symbol !== p.symbol || !t.cashAmount) continue
      const s = Number(formatUnits(BigInt(t.tokens), 18)) * p.ratio
      const c = Number(formatUnits(BigInt(t.cashAmount), 6))
      if (t.kind === 'buy') {
        costShares += s
        cost += c
      } else if (t.kind === 'sell' && costShares > 0) {
        const part = Math.min(1, s / costShares)
        cost -= cost * part
        costShares -= s
      }
    }
    const basis = costShares > 0 ? (cost / costShares) * shares : null
    return { ...p, shares, price, value: price === null ? null : shares * price, basis }
  })
  const stockTotal = held.reduce((s, p) => s + (p.value ?? 0), 0)
  const total = dollarTotal + stockTotal
  const pnl = held.reduce((s, p) => (p.value !== null && p.basis !== null ? s + p.value - p.basis : s), 0)
  const hasBasis = held.some((p) => p.basis !== null)

  return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-5">
      <div className="label text-purple">Portfolio</div>

      <Card className="flex flex-col gap-1 p-5">
        <span className="label text-muted">Total value</span>
        <span className="font-display text-[40px] font-medium leading-none tracking-[-.035em] tabular">{holdings === null ? '—' : usd(total)}</span>
        <span className="font-mono text-[11px] text-muted tabular">
          Dollars {usd(dollarTotal)} · Stocks {usd(stockTotal)}
          {hasBasis && (
            <>
              {' · '}
              <span className={pnl >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}>
                {pnl >= 0 ? '+' : '−'}
                {usd(Math.abs(pnl))} on stocks
              </span>
            </>
          )}
        </span>
      </Card>

      <Card className="flex flex-col gap-2 p-4">
        <div className="label flex justify-between text-muted">
          <span>Stocks</span>
          <a href="/stocks" className="text-purple">
            Trade
          </a>
        </div>
        <div className="border-t border-dashed border-border" />
        {positions === null ? (
          <p className="m-0 text-[13px] text-grey">Reading your stocks…</p>
        ) : held.length === 0 ? (
          <p className="m-0 text-[13px] text-grey">No stocks yet.</p>
        ) : (
          held.map((p) => (
            <div key={p.symbol} className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-[14px] font-medium text-ink">{p.symbol}</span>
                <span className="font-mono text-[11px] text-muted tabular">
                  {num(p.shares, 6)} shares{p.price !== null && ` · ${usd(p.price)}`}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="font-display text-[20px] tracking-[-.02em] tabular">{p.value === null ? '—' : usd(p.value)}</span>
                {p.value !== null && p.basis !== null && (
                  <span className={`font-mono text-[11px] tabular ${p.value >= p.basis ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                    {p.value >= p.basis ? '+' : '−'}
                    {usd(Math.abs(p.value - p.basis))}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </Card>

      <Card className="flex flex-col gap-2 p-4">
        <div className="label text-muted">Cash</div>
        <div className="border-t border-dashed border-border" />
        {holdings === null ? (
          <p className="m-0 text-[13px] text-grey">Reading your balances…</p>
        ) : (
          <>
            {[...dollars, ...other].map((h) => (
              <div key={h.symbol} className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-mono text-[12px] text-grey">
                  <TokenIcon symbol={h.symbol} size={20} />
                  {h.symbol}
                </span>
                <span className="font-mono text-[14px] text-ink tabular">{num(Number(formatUnits(h.value, h.decimals)), 2)}</span>
              </div>
            ))}
            {mon !== null && (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-mono text-[12px] text-grey">
                  <TokenIcon symbol="MON" size={20} />
                  MON <span className="text-muted">gas</span>
                </span>
                <span className="font-mono text-[14px] text-ink tabular">{num(Number(formatUnits(mon, 18)), 4)}</span>
              </div>
            )}
            {other.length > 0 && <p className="m-0 font-mono text-[11px] text-muted">Non-dollar tokens and MON are not counted in the total.</p>}
          </>
        )}
      </Card>

      <Card className="flex flex-col gap-2 p-4">
        <div className="label text-muted">Stock history</div>
        <div className="border-t border-dashed border-border" />
        {trades === undefined ? (
          <p className="m-0 text-[13px] text-grey">Reading your history from the chain. The first read can take half a minute.</p>
        ) : trades === null ? (
          <p className="m-0 text-[13px] text-grey">History is not available right now.</p>
        ) : trades.length === 0 ? (
          <p className="m-0 text-[13px] text-grey">No stock trades yet.</p>
        ) : (
          trades.map((t) => {
            const pos = positions?.find((p) => p.symbol === t.symbol)
            const shares = Number(formatUnits(BigInt(t.tokens), 18)) * (pos?.ratio ?? 1)
            const cash = t.cashAmount ? Number(formatUnits(BigInt(t.cashAmount), 6)) : null
            const label = { buy: 'Bought', sell: 'Sold', in: 'Received', out: 'Sent' }[t.kind]
            return (
              <a
                key={t.txHash}
                href={`https://monadscan.com/tx/${t.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-3 rounded-[4px] py-[2px] hover:bg-surface-2"
              >
                <div className="flex flex-col">
                  <span className="text-[13px] text-ink">
                    {label} {num(shares, 6)} {t.symbol}
                  </span>
                  <span className="font-mono text-[11px] text-muted">
                    {t.at ? when.format(t.at * 1000) : '—'}
                    {cash !== null && shares > 0 && ` · ${usd(cash / shares)}/share`}
                  </span>
                </div>
                <span className={`font-mono text-[13px] tabular ${t.kind === 'sell' ? 'text-[#16a34a]' : 'text-ink'}`}>
                  {cash === null ? '' : `${t.kind === 'buy' ? '−' : '+'}${num(cash, 2)} ${t.cash}`} ↗
                </span>
              </a>
            )
          })
        )}
      </Card>
    </div>
  )
}
