import type { Metadata } from 'next'
import { Nav } from '@/components/Nav'
import { NavAccount } from '@/components/NavAccount'
import { FooterStrip } from '@/components/rates/FooterStrip'
import { RatesFrame } from '@/components/rates/RatesFrame'
import { SettlementsBlock } from '@/components/rates/SettlementsLedger'
import { explorerHref } from '@/components/rates/ledger'
import { settledReceipts } from '@/lib/receipts'

export const metadata: Metadata = { title: 'Receipts' }
// Read per request: the rate and the receipt are read from the chain, and a build
// artefact of either would be a number the chain no longer has. liveRates() coalesces
// concurrent reads for 12 s in process, which is the throttle this used to get from ISR.
export const dynamic = 'force-dynamic'

/** /receipts — the whole ledger as the W2 Settlements block, newest first. */
export default async function ReceiptsPage() {
  const receipts = await settledReceipts(200)
  return (
    <RatesFrame>
      <Nav
        showBuiltOn={false}
        right={<NavAccount />}
      />
      <main className="flex flex-1 flex-col">
        <SettlementsBlock receipts={receipts} title="Receipts" heading="h1" />
        <div className="flex-1" />
      </main>
      <FooterStrip explorer={explorerHref()} />
    </RatesFrame>
  )
}
