'use client'

import type { Corridor, SourceAssetSymbol } from '@henad/core'
import { money, rateLine, utcDayTime } from '@/lib/format'
import { nextTransition } from '@henad/core'
import type { Receipt } from '@/lib/receipts'
import { Button } from '@/components/ui/Button'
import { amountUnits } from './amount-step'
import { Card, Rows, StepHeader } from './send-ui'

function weekday(ts: number, style: 'long' | 'short'): string {
  return new Date(ts * 1000).toLocaleDateString('en-GB', { weekday: style, timeZone: 'UTC' })
}

/** "23:00" */
function hm(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
}

/** S5. The corridor's venue is paused by Mento's market-hours breaker; the next open comes from the mirrored schedule. */
export function ClosedStep({
  corridor,
  now,
  latestReceipt,
  amount,
  sourceAsset,
}: {
  corridor: Corridor
  now: number
  latestReceipt: Receipt | null
  amount: string
  sourceAsset: SourceAssetSymbol
}) {
  const c = corridor
  const nowS = Math.floor(now / 1000)
  // While the market is open (the state forced by ?demo=closed), the first transition is the close; the open is the one after it.
  const first = nextTransition(nowS)
  const next = first.opens ? first : nextTransition(first.at)
  const opens = hm(next.at)
  const day = weekday(next.at, 'long')
  const name = c.targetName.charAt(0).toUpperCase() + c.targetName.slice(1)
  const pool = c.venue?.label.replace('Mento ', '') ?? `${c.target}m/USDm`
  const feed = c.feed?.label ?? `${c.target}/USD`
  const units = amountUnits(amount)

  return (
    <div className="flex flex-1 flex-col gap-[10px] px-4 pb-4 pt-5">
      <StepHeader left="Send" right={utcDayTime(nowS)} />

      <div className="grain relative flex flex-col gap-3 overflow-hidden rounded-[12px] bg-dark px-[18px] py-5 text-white">
        <div aria-hidden className="pointer-events-none absolute -bottom-[34px] -right-[10px] font-display text-[120px] font-semibold leading-none tracking-[-.06em] text-white/6">
          {opens}
        </div>
        <div className="label relative flex items-center gap-2 text-amber">
          <span aria-hidden className="h-2 w-2 rounded-full bg-amber" />
          FX market closed
        </div>
        <p className="relative m-0 font-display text-[26px] font-medium leading-[1.05] tracking-[-.03em] balance">
          {name} reopen {day} at {opens} UTC.
        </p>
        <p className="relative m-0 text-[13px] leading-[1.55] text-dim pretty">
          Mento&apos;s market-hours breaker pauses {pool} {day === 'Sunday' ? 'over the weekend' : 'until the market reopens'}, so Henad cannot quote a rate it
          could settle. Receipts and rates stay open.
        </p>
      </div>

      <Rows
        pad="py-[10px]"
        rows={[
          { k: 'Last settled rate', v: latestReceipt ? rateLine(latestReceipt.executedRate, c.targetSymbol, c.rateDp) : '—' },
          { k: 'Settled at', v: latestReceipt ? `${utcDayTime(latestReceipt.settledAt)}${latestReceipt.sample ? ' · sample' : ''}` : '—' },
          { k: 'Reference feed', v: `${feed} · paused` },
          { k: 'Next open', v: utcDayTime(next.at), strong: true },
        ]}
      />

      <Card dim className="flex flex-col gap-[10px] p-4">
        <div className="label text-muted">You send</div>
        <div className="flex items-center justify-between gap-3">
          <div className="font-display text-[38px] font-medium leading-none tracking-[-.035em] tabular">{units ? money(units, 6, '$') : '—'}</div>
          <span className="whitespace-nowrap rounded-[4px] border border-border bg-surface-2 px-[10px] py-[7px] font-mono text-[11px]">{sourceAsset}</span>
        </div>
      </Card>

      <div className="flex-1" />
      <Button variant="disabled" size="xl" block>
        Opens {weekday(next.at, 'short')} {opens} UTC
      </Button>
      <div className="flex gap-2">
        <Button href="/rates" variant="secondary" size="xl" className="flex-1">
          Browse rates
        </Button>
        {latestReceipt ? (
          <Button href={`/receipt/${latestReceipt.intentId}`} variant="secondary" size="xl" className="flex-1">
            Receipt{latestReceipt.index ? ` #${latestReceipt.index}` : ''}
          </Button>
        ) : (
          <Button href="/receipts" variant="secondary" size="xl" className="flex-1">
            Receipts
          </Button>
        )}
      </div>
    </div>
  )
}
