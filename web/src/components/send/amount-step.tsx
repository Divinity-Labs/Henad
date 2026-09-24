'use client'

import Link from 'next/link'
import { parseUnits } from 'viem'
import { deliveredAt, type Contact } from '@henad/core'
import { CORRIDORS, SOURCE_ASSETS, settleableFrom, type Corridor, type SourceAssetSymbol } from '@henad/core'
import { money, rateLine, tokens } from '@/lib/format'
import type { RateDto } from '@/lib/send-serial'
import { Button } from '@/components/ui/Button'
import { TierPill } from '@/components/ui/TierPill'
import { TokenIcon } from '@/components/ui/TokenIcon'
import { AssetSelect } from './asset-select'
import { ChosenRecipient, RecipientPicker, receiverName, type RecipientChoice, type RecipientView } from './recipient'
import { Card, Notice, StepHeader, linkLabel } from './send-ui'

const SOURCE_DECIMALS = 6

/** Base units of the amount field, or null when it is not a positive dollar amount. */
export function amountUnits(amount: string): bigint | null {
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) return null
  const units = parseUnits(amount, SOURCE_DECIMALS)
  return units > 0n ? units : null
}

function refusal(c: Corridor): string {
  return c.tier === 'quote'
    ? `Henad can show a rate for ${c.targetName}, but cannot deliver them yet.`
    : `Henad has no rate for ${c.targetName} yet.`
}

export interface AmountStepProps {
  corridor: Corridor
  rate: RateDto | undefined
  now: number
  sourceAsset: SourceAssetSymbol
  amount: string
  balance: bigint | null
  /** the chosen recipient, labelled; null until one is chosen */
  recipient: RecipientView | null
  recipientInput: string
  editingRecipient: boolean
  /** the payer's contacts, most recently paid first */
  contacts: Contact[]
  busy: boolean
  error: string | null
  onAmount: (value: string) => void
  onAsset: (value: SourceAssetSymbol) => void
  onCorridor: (key: string) => void
  onRecipientInput: (value: string) => void
  onChooseRecipient: (choice: RecipientChoice) => void
  onEditRecipient: (editing: boolean) => void
  onPaste: () => void
  onQuote: () => void
}

/** S1. Amount, source asset, the indicative "receives" at the reference rate, the recipient, "Get quote". */
export function AmountStep(p: AmountStepProps) {
  const c = p.corridor
  const targetAsset = c.targetAsset
  const units = amountUnits(p.amount)
  const rate = p.rate?.rate ? BigInt(p.rate.rate) : null
  const live = c.tier === 'live' && targetAsset !== null
  const receives =
    units !== null && rate !== null && targetAsset
      ? tokens(deliveredAt(rate, units, SOURCE_DECIMALS, targetAsset.decimals), targetAsset.decimals, targetAsset.symbol, c.currencyDp)
      : '—'
  const chosen = p.recipient !== null && !p.editingRecipient
  const overBalance = units !== null && p.balance !== null && units > p.balance
  const age = p.rate?.updatedAt ? Math.max(0, Math.floor(p.now / 1000 - p.rate.updatedAt)) : null
  const fundable = settleableFrom(c, p.sourceAsset)
  const blocker = !live
    ? `Henad cannot send ${c.targetName} yet.`
    : // The router has no corridor for this pair, so it would revert at settlement.
      !fundable
      ? `${p.sourceAsset} cannot fund USD → ${c.target}. ${c.sources.join(' or ')} can.`
      : units === null
      ? 'Enter an amount.'
      : overBalance
        ? `That is more than your ${p.sourceAsset} balance.`
        : !chosen
          ? 'Choose who you are paying.'
          : rate === null
            ? 'No reference rate right now.'
            : null
  const canQuote = blocker === null && !p.busy
  const pricedOnly = CORRIDORS.filter((x) => x.tier === 'quote')
    .map((x) => x.target)
    .join(' ')

  return (
    <div className="flex flex-1 flex-col gap-[10px] px-4 pb-4 pt-5">
      <StepHeader left="Send" right="Step 1 of 2" />

      <Card className="flex flex-col gap-[10px] p-4">
        <div className="label flex justify-between text-muted">
          <span>You send</span>
          <span className="tabular">Balance {p.balance === null ? '—' : money(p.balance, SOURCE_DECIMALS, '')}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <label className="flex min-w-0 flex-1 items-baseline font-display text-[38px] font-medium leading-none tracking-[-.035em]">
            <span className="sr-only">Amount to send, in US dollars</span>
            <span aria-hidden>$</span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="done"
              placeholder="0.00"
              value={p.amount}
              onChange={(e) => p.onAmount(e.target.value)}
              className="min-w-0 flex-1 bg-transparent p-0 tabular placeholder:text-dim-2"
              style={{ font: 'inherit' }}
            />
          </label>
          <AssetSelect
            label="Source asset"
            value={p.sourceAsset}
            onChange={(v) => p.onAsset(v as SourceAssetSymbol)}
            options={SOURCE_ASSETS.map((a) => ({
              value: a.symbol,
              label: a.label,
              icon: <TokenIcon symbol={a.symbol} size={22} />,
              detail: a.symbol === 'AUSD' ? 'Agora dollar' : 'Circle USD Coin',
            }))}
          />
        </div>
        {/* Where you notice the balance is short, so the way out of that belongs here. */}
        <Link href="/top-up" className={`${linkLabel} flex items-center justify-between border-t border-hairline-2 pt-[10px] text-purple`}>
          <span>Add money</span>
          <span className="text-muted">Top up →</span>
        </Link>
      </Card>

      <div className="flex items-center justify-between whitespace-nowrap px-4 font-mono text-[11px] text-muted tabular">
        {rate !== null ? (
          <>
            <span className="text-ink">{rateLine(rate, c.targetSymbol, c.rateDp)}</span>
            <span>
              {c.feed?.kind === 'pyth' ? 'Pyth' : 'Chainlink'} · {age ?? '—'} s{p.rate?.stale ? <span className="text-amber"> · stale</span> : null}
            </span>
          </>
        ) : (
          <span>{c.feed ? `${c.feed.label} · no answer` : 'No rate yet'}</span>
        )}
      </div>

      <Card className="flex flex-col gap-[10px] p-4">
        <div className="label text-muted">{receiverName(p.recipient)} receives</div>
        <div className="flex items-center justify-between gap-3">
          <div className="font-display text-[38px] font-medium leading-none tracking-[-.035em] tabular">{receives}</div>
          <AssetSelect
            label="Currency the recipient receives"
            value={c.key}
            onChange={p.onCorridor}
            options={CORRIDORS.map((x) => ({
              value: x.key,
              label: x.target,
              icon: <TokenIcon symbol={x.targetAsset?.symbol ?? x.target} size={22} />,
              // Name the token that arrives, or say plainly why nothing can.
              detail: !x.targetAsset
                ? x.tier === 'quote'
                  ? `${x.targetName} · rate only`
                  : `${x.targetName} · not available yet`
                : settleableFrom(x, p.sourceAsset)
                  ? `${x.targetName} · ${x.targetAsset.symbol}`
                  : `${x.targetName} · ${x.sources.join(' or ')} only`,
              badge: <TierPill tier={x.tier} size="sm" />,
            }))}
          />
        </div>
        {live ? (
          <p className="m-0 text-[12px] leading-[1.5] text-grey pretty">At the reference rate. The exact amount after spread comes before you sign.</p>
        ) : (
          <>
            <p className="m-0 font-mono text-[11px] text-ink">{c.note}</p>
            <p className="m-0 text-[12px] leading-[1.5] text-grey pretty">{refusal(c)}</p>
          </>
        )}
        <Link
          href={c.tier === 'unpriced' ? '/docs/mrc' : '/rates'}
          className={`${linkLabel} flex items-center justify-between border-t border-hairline-2 pt-[10px] text-muted`}
        >
          <span>{c.tier === 'unpriced' ? 'Read the MRC' : `${pricedOnly} · priced only`}</span>
          <span className="text-purple">Why →</span>
        </Link>
      </Card>

      {p.recipient && !p.editingRecipient ? (
        <ChosenRecipient recipient={p.recipient} onChange={() => p.onEditRecipient(true)} />
      ) : (
        <RecipientPicker
          contacts={p.contacts}
          input={p.recipientInput}
          canCancel={p.recipient !== null}
          onInput={p.onRecipientInput}
          onPaste={p.onPaste}
          onChoose={p.onChooseRecipient}
          onCancel={() => p.onEditRecipient(false)}
        />
      )}

      <div className="flex-1" />
      {p.error && <Notice>{p.error}</Notice>}
      <Button variant={canQuote ? 'primary' : 'disabled'} size="xl" block onClick={p.onQuote}>
        {p.busy ? 'Getting quote…' : 'Get quote'}
      </Button>
      <p className="m-0 text-center font-mono text-[10px] tracking-[.06em] text-muted">{blocker ?? 'Nothing moves until you approve the rate.'}</p>
    </div>
  )
}
