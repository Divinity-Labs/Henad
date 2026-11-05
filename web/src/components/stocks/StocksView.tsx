'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, Notice } from '@/components/send/send-ui'
import type { History, Point } from '@/lib/stock-history'
import type { Session, StockInfo } from '@/lib/stocks'
import { PriceChart, Sparkline } from './PriceChart'

/** A quote as the page sends it to the browser: prices as plain USD numbers. */
export type QuoteDto = StockInfo & { price: number; bid: number; ask: number; spreadBps: number; quotedAt: number; session: Session }

const RANGES = [
  { key: '1D', sec: 86_400 },
  { key: '1W', sec: 7 * 86_400 },
] as const
type Range = (typeof RANGES)[number]['key']

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const ET = 'America/New_York'
const sinceFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, weekday: 'short', hour: 'numeric', minute: '2-digit' })

function age(quotedAt: number, now: number): string {
  const m = Math.max(0, Math.round((now - quotedAt) / 60))
  return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`
}

/** The range's points, ending on the live quote so the chart and the headline agree. */
function slice(points: Point[] | undefined, q: QuoteDto, sec: number): Point[] {
  const from = q.quotedAt - sec
  const inRange = (points ?? []).filter(([t]) => t >= from && t < q.quotedAt)
  return [...inRange, [q.quotedAt, q.price]]
}

function change(points: Point[]): { abs: number; pct: number } | null {
  if (points.length < 2) return null
  const a = points[0]![1]
  const b = points[points.length - 1]![1]
  return { abs: b - a, pct: ((b - a) / a) * 100 }
}

/**
 * The company's mark in its brand colour. The SVGs in /public/stocks are single-path Simple Icons
 * (CC0), drawn as a mask so they take whatever colour the tile needs. Funds have no mark and show
 * their ticker instead.
 */
function Logo({ q, size = 40 }: { q: StockInfo; size?: number }) {
  return (
    <span aria-hidden className="inline-flex flex-none items-center justify-center" style={{ width: size, height: size, background: q.tile, borderRadius: size * 0.26 }}>
      {q.kind === 'fund' ? (
        <span className="font-mono font-medium" style={{ color: q.ink, fontSize: size * 0.26 }}>
          {q.symbol}
        </span>
      ) : (
        <span
          className="block"
          style={{
            width: size * 0.5,
            height: size * 0.5,
            background: q.ink,
            mask: `url(/stocks/${q.symbol}.svg) center / contain no-repeat`,
            WebkitMask: `url(/stocks/${q.symbol}.svg) center / contain no-repeat`,
          }}
        />
      )}
    </span>
  )
}

function Change({ c, className = '' }: { c: { abs: number; pct: number } | null; className?: string }) {
  if (!c) return <span className={`text-muted ${className}`}>—</span>
  const up = c.abs >= 0
  return (
    <span className={`tabular text-ink ${className}`}>
      <span className={up ? 'text-[#16a34a]' : 'text-[#dc2626]'}>{up ? '▲' : '▼'}</span> {up ? '+' : '−'}
      {Math.abs(c.pct).toFixed(2)}%
    </span>
  )
}

function SessionPill({ session }: { session: Session }) {
  const open = session === 'Market open'
  const extended = session === 'Pre-market' || session === 'After hours' || session === 'Overnight'
  return (
    <span className="label inline-flex items-center gap-[6px] rounded-full border border-hairline bg-surface px-[10px] py-[4px] text-ink">
      <span className={`size-[6px] rounded-full ${open ? 'bg-[#16a34a]' : extended ? 'bg-amber' : 'bg-muted'}`} />
      {session}
    </span>
  )
}

function Stat({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-hairline-2 px-4 py-3 [&:not(:first-child)]:border-l">
      <span className="label text-muted">{k}</span>
      <span className="font-mono text-[13px] text-ink tabular">{v}</span>
    </div>
  )
}

/**
 * Stocks: live US prices read from Monday Trade's oracle on Monad, a chart of each from the
 * oracle's own update events, and the bid, the ask and the gap between them. The same promise
 * as a payout receipt — the cost is on the chain, so it is on the screen — pointed at a second
 * asset. Buying is not open yet, and the page says so.
 */
export function StocksView({ quotes, readAt }: { quotes: QuoteDto[] | null; readAt: number }) {
  const [selected, setSelected] = useState<string>(quotes?.[0]?.symbol ?? 'AAPL')
  const [range, setRange] = useState<Range>('1D')
  const [history, setHistory] = useState<History | null>(null)
  const [historyFailed, setHistoryFailed] = useState(false)

  useEffect(() => {
    let live = true
    fetch('/api/stocks/history')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(
        (j: { history: History | null }) => live && (j.history ? setHistory(j.history) : setHistoryFailed(true)),
        () => live && setHistoryFailed(true),
      )
    return () => {
      live = false
    }
  }, [])

  const sec = RANGES.find((r) => r.key === range)!.sec
  const series = useMemo(() => Object.fromEntries((quotes ?? []).map((q) => [q.symbol, slice(history?.[q.symbol], q, sec)])), [quotes, history, sec])

  if (!quotes || quotes.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[1280px] px-4 py-10 md:px-6">
        <Notice>Could not read stock prices from Monad just now. Refresh in a moment.</Notice>
      </div>
    )
  }

  const q = quotes.find((s) => s.symbol === selected) ?? quotes[0]!
  const points = series[q.symbol] ?? []
  const c = history ? change(points) : null
  const oldest = Math.min(...quotes.map((s) => s.quotedAt))
  const groups = [
    { title: 'Stocks', list: quotes.filter((s) => s.kind === 'stock') },
    { title: 'Funds', list: quotes.filter((s) => s.kind === 'fund') },
  ]

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 pb-12 pt-8 md:px-6 md:pt-12">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <span className="label text-purple">Stocks · Monad mainnet</span>
          <h1 className="m-0 font-display text-[34px] font-medium leading-[1.02] tracking-[-.04em] md:text-[52px]">US stocks, priced on chain.</h1>
          <p className="m-0 max-w-[560px] text-[14px] leading-[1.5] text-grey pretty">
            Every quote is read live from Monad, with its bid, its ask and the gap between them. Charts come from the oracle&apos;s own on-chain updates.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SessionPill session={q.session} />
          <span className="font-mono text-[11px] text-muted tabular">Quotes up to {age(oldest, readAt)} old</span>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="flex min-w-0 flex-col">
          <div className="flex flex-col gap-4 p-5 md:p-6">
            <div className="flex items-center gap-3">
              <Logo q={q} size={48} />
              <div className="min-w-0">
                <div className="truncate text-[18px] font-medium leading-tight text-ink">{q.name}</div>
                <div className="font-mono text-[12px] text-muted">{q.symbol}</div>
              </div>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="font-display text-[44px] font-medium leading-none tracking-[-.035em] text-ink tabular md:text-[56px]">{usd(q.price)}</div>
                <div className="mt-2 flex items-center gap-2 font-mono text-[12px]">
                  <Change c={c} />
                  {c && (
                    <span className="text-muted">
                      {c.abs >= 0 ? '+' : '−'}
                      {usd(Math.abs(c.abs))} since {sinceFmt.format(points[0]![0] * 1000)} ET
                    </span>
                  )}
                </div>
              </div>
              <div role="tablist" aria-label="Chart range" className="flex rounded-[6px] border border-hairline p-[3px]">
                {RANGES.map((r) => (
                  <button
                    key={r.key}
                    role="tab"
                    aria-selected={range === r.key}
                    onClick={() => setRange(r.key)}
                    className={`rounded-[4px] px-3 py-[5px] font-mono text-[11px] ${range === r.key ? 'bg-ink text-white' : 'text-grey hover:text-ink'}`}
                  >
                    {r.key}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className={`px-5 md:px-6 ${history ? '' : 'opacity-60'}`}>
            {historyFailed ? (
              <div className="flex h-[300px] items-center justify-center font-mono text-[11px] text-muted">Price history is not available right now.</div>
            ) : (
              <PriceChart points={history ? points : []} height={320} />
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 border-t border-hairline-2 md:grid-cols-4">
            <Stat k="Bid" v={usd(q.bid)} />
            <Stat k="Ask" v={usd(q.ask)} />
            <Stat k="Spread" v={`${q.spreadBps.toFixed(1)} bps`} />
            <Stat k="Quoted" v={`${age(q.quotedAt, readAt)} ago`} />
          </div>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          {groups.map((g) => (
            <section key={g.title} className="flex flex-col gap-2">
              <div className="label flex justify-between text-muted">
                <span>{g.title}</span>
                <span>{range} change</span>
              </div>
              <Card className="overflow-hidden">
                {g.list.map((s, i) => {
                  const pts = series[s.symbol] ?? []
                  const active = s.symbol === q.symbol
                  return (
                    <button
                      key={s.symbol}
                      onClick={() => setSelected(s.symbol)}
                      aria-pressed={active}
                      className={`flex w-full items-center gap-3 px-4 py-[10px] text-left transition-colors ${i ? 'border-t border-hairline-2' : ''} ${active ? 'bg-tint' : 'hover:bg-surface-2'}`}
                    >
                      <Logo q={s} size={34} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-medium leading-tight text-ink">{s.name}</div>
                        <div className="font-mono text-[11px] text-muted">{s.symbol}</div>
                      </div>
                      {history && <Sparkline points={pts} />}
                      <div className="w-[86px] flex-none text-right">
                        <div className="font-mono text-[13px] text-ink tabular">{usd(s.price)}</div>
                        <Change c={history ? change(pts) : null} className="font-mono text-[11px]" />
                      </div>
                    </button>
                  )
                })}
              </Card>
            </section>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between md:p-6">
          <div className="flex flex-col gap-1">
            <span className="label text-purple">Coming soon</span>
            <p className="m-0 max-w-[620px] text-[15px] leading-[1.5] text-ink pretty">
              Buy from your Henad account, with a receipt for every order: the quote when you ordered, the price you paid, and the difference.
            </p>
          </div>
          <Button size="lg" variant="disabled" disabled>
            Buying opens soon
          </Button>
        </Card>
        <p className="m-0 self-center text-[11.5px] leading-[1.5] text-muted pretty">
          Prices come from Monday Trade&apos;s StockOracle contract on Monad mainnet. The source quote runs about 15 minutes behind the market, so treat them as a
          guide, not a fill price. Times are US Eastern. Not available to US persons. Logos belong to their companies.{' '}
          <a href="https://monadscan.com/address/0x037848af338c38e1e0ab722be80bf4c2e612a1f7" target="_blank" rel="noreferrer" className="text-purple">
            Oracle on Monadscan ↗
          </a>
        </p>
      </div>
    </div>
  )
}
