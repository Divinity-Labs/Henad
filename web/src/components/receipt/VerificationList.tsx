import type { ReactNode } from 'react'
import type { Receipt } from '@/lib/receipts'
import { blockNumber, shortAddress, shortHash } from '@/lib/format'
import { fixed, monadscanTx, unpackObservation } from '@/lib/receipt-page'

/**
 * The hairline field list: every attestation field as it sits on the chain,
 * labelled with its Solidity name. Server-safe.
 */
export function VerificationList({ receipt: r }: { receipt: Receipt }) {
  const c = r.corridor
  const sourceFeed = `${r.sourceAsset.symbol}/USD`
  const targetFeed = `${c.target}/USD`
  const obs = unpackObservation(r.referenceObservation)
  const muted = (s: string) => <span className="text-muted"> · {s}</span>
  const signed = r.spreadBps > 0 ? `+${r.spreadBps}` : r.spreadBps < 0 ? `−${-r.spreadBps}` : '0'

  const rows: { k: string; v: ReactNode }[] = [
    { k: 'intentId', v: <span title={r.intentId}>{shortAddress(r.intentId, 10, 4)}</span> },
    { k: 'corridor', v: `keccak("${c.key}") · ${shortAddress(c.id)}` },
    {
      k: 'referenceRate',
      v: (
        <>
          {fixed(r.referenceRate, 18, 6)}
          {muted('18 dp')}
        </>
      ),
    },
    { k: 'executedRate', v: fixed(r.executedRate, 18, 6) },
    {
      k: 'spreadBps',
      v: (
        <>
          {signed}
          {muted('signed, negative means better than reference')}
        </>
      ),
    },
    { k: 'deliveredAmount', v: `${fixed(r.deliveredAmount, r.targetAsset.decimals, 6)} ${r.targetAsset.symbol}` },
    {
      k: 'rateSource',
      v: (
        <>
          <span title={r.rateSource}>{shortAddress(r.rateSource)}</span>
          {muted(`Chainlink ${sourceFeed} ÷ ${targetFeed}, composed on-chain`)}
        </>
      ),
    },
    {
      k: 'referenceObservation',
      v: obs ? (
        <>
          {`${sourceFeed} round ${obs.base} · ${targetFeed} round ${obs.quote}`}
          {muted('replay with getRoundData')}
        </>
      ) : (
        <>
          {shortHash(r.referenceObservation)}
          {muted('no round ids recorded')}
        </>
      ),
    },
    { k: 'recipient', v: <span title={r.recipient}>{shortAddress(r.recipient)}</span> },
    { k: 'payer', v: <span title={r.payer}>{shortAddress(r.payer)}</span> },
    { k: 'settledAt', v: `${r.settledAt} · block ${blockNumber(r.settledAtBlock)}` },
    {
      k: 'tx',
      v: r.txHash ? (
        <a href={monadscanTx(r.txHash)} target="_blank" rel="noreferrer" className="text-purple" title={r.txHash}>
          {shortHash(r.txHash)} ↗
        </a>
      ) : (
        <span className="text-muted">{r.sample ? 'none · sample settlement' : '—'}</span>
      ),
    },
  ]

  return (
    <dl className="m-0 border-t border-hairline font-mono text-[12px] tabular">
      {rows.map(({ k, v }) => (
        <div key={k} className="grid grid-cols-1 gap-1 border-b border-hairline py-3 md:grid-cols-[150px_1fr] md:gap-4 xl:grid-cols-[170px_1fr]">
          <dt className="text-muted">{k}</dt>
          <dd className="m-0 min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  )
}
