import type { Metadata } from 'next'
import { Nav } from '@/components/Nav'
import { Button } from '@/components/ui/Button'
import { FooterStrip } from '@/components/rates/FooterStrip'
import { RatesFrame } from '@/components/rates/RatesFrame'
import { SettlementsBlock } from '@/components/rates/SettlementsLedger'
import { explorerHref } from '@/components/rates/ledger'
import { listReceipts } from '@/lib/receipts'

export const metadata: Metadata = { title: 'Receipts' }
export const revalidate = 30

/** /receipts — the whole ledger as the W2 Settlements block, newest first. */
export default async function ReceiptsPage() {
  const receipts = await listReceipts(200)
  return (
    <RatesFrame>
      <Nav
        showBuiltOn={false}
        right={
          <Button href="/send" variant="secondary" size="md">
            Sign in
          </Button>
        }
      />
      <main className="flex flex-1 flex-col">
        <SettlementsBlock receipts={receipts} title="Receipts" heading="h1" />
        <div className="flex-1" />
      </main>
      <FooterStrip explorer={explorerHref()} />
    </RatesFrame>
  )
}
