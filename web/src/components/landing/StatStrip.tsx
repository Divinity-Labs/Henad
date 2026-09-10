import { FINALITY_MS } from '@henad/core'
import { StatCell } from '@/components/ui/StatCell'
import { bps, money } from '@/lib/format'
import type { LandingLedger } from './ledger'

/**
 * Four figures from the ledger. Two-by-two on mobile, one row on desktop.
 * With no settlement yet: "0", "—", "—", and finality, which is a chain fact.
 */
export function StatStrip({ ledger }: { ledger: LandingLedger }) {
  const p = ledger.primary
  const settlements = String(ledger.settlements)
  const delivered = p ? money(p.delivered, p.decimals, p.symbol, p.dp) : '—'
  const deliveredSub = p && p.currencies > 1 ? `+${p.currencies - 1} more` : undefined
  const spread = p ? `${p.spreadCost < 0n ? '−' : ''}${money(p.spreadCost < 0n ? -p.spreadCost : p.spreadCost, p.decimals, p.symbol, p.dp)}` : '—'
  const spreadSub = p ? `· ${bps(p.spreadBps)}` : undefined
  const finality = `${FINALITY_MS / 1000} s`
  const settlementsLabel = `${ledger.network === 'mainnet' ? 'Mainnet' : 'Testnet'} settlements`
  return (
    <>
      <div className="grid grid-cols-2 md:hidden border-t border-b border-hairline">
        <StatCell size="md" label="Settlements" value={settlements} className="border-r border-b border-hairline" />
        <StatCell size="md" label="Delivered" value={delivered} sub={deliveredSub} className="border-b border-hairline" />
        <StatCell size="md" label="Spread paid" value={spread} className="border-r border-hairline" />
        <StatCell size="md" label="Finality" value={finality} />
      </div>
      <div className="hidden md:grid grid-cols-4 border-t border-b border-hairline">
        <StatCell size="lg" label={settlementsLabel} value={settlements} className="border-r border-hairline" />
        <StatCell size="lg" label="Delivered" value={delivered} sub={deliveredSub} className="border-r border-hairline" />
        <StatCell size="lg" label="Spread paid, all time" value={spread} sub={spreadSub} className="border-r border-hairline" />
        <StatCell size="lg" label="Finality" value={finality} />
      </div>
    </>
  )
}
