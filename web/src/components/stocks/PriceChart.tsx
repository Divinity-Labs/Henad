'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import type { Point } from '@/lib/stock-history'

const ET = 'America/New_York'
const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, weekday: 'short', day: 'numeric', month: 'short' })
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: ET, hour: '2-digit', minute: '2-digit' })
const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Three to five round price levels across [lo, hi]. */
function ticks(lo: number, hi: number): number[] {
  const span = hi - lo || hi * 0.01 || 1
  const raw = span / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(Number(v.toFixed(6)))
  return out
}

/**
 * One ticker's price over the chosen range: a 2px line over a 10% wash, recessive gridlines,
 * and a crosshair that snaps to the nearest quote and reads it out. Times are US Eastern,
 * the market's own clock.
 */
export function PriceChart({ points, height = 300 }: { points: Point[]; height?: number }) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e!.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pad = { top: 12, right: 64, bottom: 28, left: 0 }
  const w = Math.max(0, width - pad.left - pad.right)
  const h = height - pad.top - pad.bottom
  const ready = width > 0 && points.length > 1

  const t0 = ready ? points[0]![0] : 0
  const t1 = ready ? points[points.length - 1]![0] : 1
  const prices = points.map((p) => p[1])
  const lo0 = ready ? Math.min(...prices) : 0
  const hi0 = ready ? Math.max(...prices) : 1
  const margin = (hi0 - lo0) * 0.12 || hi0 * 0.002
  const lo = lo0 - margin
  const hi = hi0 + margin
  const x = (t: number) => pad.left + ((t - t0) / (t1 - t0 || 1)) * w
  const y = (v: number) => pad.top + (1 - (v - lo) / (hi - lo || 1)) * h

  const line = ready ? points.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('') : ''
  const area = ready ? `${line}L${x(t1).toFixed(1)},${pad.top + h}L${x(t0).toFixed(1)},${pad.top + h}Z` : ''

  // Day boundaries (US Eastern) for the x axis; within one day, every few hours instead.
  const xLabels: { t: number; label: string }[] = []
  if (ready) {
    const multiDay = t1 - t0 > 1.5 * 86_400
    let last = ''
    for (const [t] of points) {
      const key = multiDay ? dayFmt.format(t * 1000) : timeFmt.format(t * 1000).slice(0, 2)
      if (key !== last) {
        if (multiDay || Number(key) % 3 === 0) xLabels.push({ t, label: multiDay ? key : `${key}:00` })
        last = key
      }
    }
  }
  const spaced = xLabels.filter((l, i, all) => i === 0 || x(l.t) - x(all[i - 1]!.t) > 70)

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!ready) return
    const rect = e.currentTarget.getBoundingClientRect()
    const t = t0 + ((e.clientX - rect.left - pad.left) / w) * (t1 - t0)
    let best = 0
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i]![0] - t) < Math.abs(points[best]![0] - t)) best = i
    setHover(best)
  }

  const hp = hover !== null && ready ? points[hover] : null

  return (
    <div ref={box} className="relative w-full" style={{ height }}>
      {ready ? (
        <svg
          width={width}
          height={height}
          className="block touch-none select-none"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={`Price from ${usd(points[0]![1])} to ${usd(points[points.length - 1]![1])}`}
        >
          {ticks(lo, hi).map((v) => (
            <g key={v}>
              <line x1={pad.left} x2={pad.left + w} y1={y(v)} y2={y(v)} className="stroke-hairline-2" strokeWidth={1} />
              <text x={pad.left + w + 10} y={y(v) + 4} className="fill-muted font-mono text-[10.5px] tabular">
                {usd(v)}
              </text>
            </g>
          ))}
          {spaced.map((l) => (
            <text key={l.t} x={x(l.t)} y={height - 8} className="fill-muted font-mono text-[10.5px]">
              {l.label}
            </text>
          ))}
          <path d={area} className="fill-purple" fillOpacity={0.1} />
          <path d={line} fill="none" className="stroke-purple" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hp && (
            <g>
              <line x1={x(hp[0])} x2={x(hp[0])} y1={pad.top} y2={pad.top + h} className="stroke-grey" strokeWidth={1} strokeDasharray="3 3" />
              <circle cx={x(hp[0])} cy={y(hp[1])} r={4.5} className="fill-purple stroke-surface" strokeWidth={2} />
            </g>
          )}
        </svg>
      ) : (
        <div className="flex h-full items-center justify-center font-mono text-[11px] text-muted">{points.length > 1 || width === 0 ? 'Loading history…' : 'No history yet'}</div>
      )}
      {hp && (
        <div
          className="pointer-events-none absolute top-0 rounded-[6px] border border-hairline bg-surface px-[10px] py-[6px] shadow-sm"
          style={{ left: Math.min(Math.max(x(hp[0]) - 70, 0), Math.max(0, width - 150)) }}
        >
          <div className="font-display text-[15px] font-medium text-ink tabular">{usd(hp[1])}</div>
          <div className="font-mono text-[10.5px] text-muted">
            {dayFmt.format(hp[0] * 1000)} · {timeFmt.format(hp[0] * 1000)} ET
          </div>
        </div>
      )}
    </div>
  )
}

/** A 2px line, no axes: the shape of a ticker's range, for the watchlist. */
export function Sparkline({ points, width = 72, height = 28 }: { points: Point[]; width?: number; height?: number }) {
  if (points.length < 2) return <span style={{ width, height }} className="inline-block" />
  const prices = points.map((p) => p[1])
  const lo = Math.min(...prices)
  const hi = Math.max(...prices)
  const t0 = points[0]![0]
  const t1 = points[points.length - 1]![0]
  const d = points
    .map((p, i) => `${i ? 'L' : 'M'}${(((p[0] - t0) / (t1 - t0 || 1)) * (width - 2) + 1).toFixed(1)},${((1 - (p[1] - lo) / (hi - lo || 1)) * (height - 4) + 2).toFixed(1)}`)
    .join('')
  const up = prices[prices.length - 1]! >= prices[0]!
  return (
    <svg width={width} height={height} aria-hidden className="block flex-none">
      <path d={d} fill="none" stroke={up ? '#16a34a' : '#dc2626'} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
