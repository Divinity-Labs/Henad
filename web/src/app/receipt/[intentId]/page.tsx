import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Nav } from '@/components/Nav'
import { Button } from '@/components/ui/Button'
import { CopyPermalink } from '@/components/receipt/CopyPermalink'
import { ReceiptPanel } from '@/components/receipt/ReceiptPanel'
import { VerificationList } from '@/components/receipt/VerificationList'
import { money, rateLine, shortAddress, spreadLine, tokens } from '@/lib/format'
import { headline, isIntentId, loadReceipt, monadscanAddress, monadscanTx, requestOrigin } from '@/lib/receipt-page'
import { deploymentAddresses, type Receipt } from '@/lib/receipts'

// Read per request: the rate and the receipt are read from the chain, and a build
// artefact of either would be a number the chain no longer has. liveRates() coalesces
// concurrent reads for 12 s in process, which is the throttle this used to get from ISR.
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ intentId: string }> }

async function receiptFor(params: Props['params']): Promise<Receipt | null> {
  const { intentId } = await params
  return isIntentId(intentId) ? loadReceipt(intentId) : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await receiptFor(params)
  // The page throws notFound(); throwing it from here as well leaves the 404 to client-side rendering.
  if (!r) return { title: 'No receipt with that id' }
  const c = r.corridor
  const delivered = tokens(r.deliveredAmount, r.targetAsset.decimals, r.targetAsset.symbol, c.currencyDp)
  const title = `${r.sample ? 'Sample receipt' : 'Receipt'} · ${delivered} · ${r.sourceAsset.symbol} → ${r.targetAsset.symbol}`
  const paid = money(r.sourceAmount, r.sourceAsset.decimals, '$')
  const spread = spreadLine(r.spreadCost, r.targetAsset.decimals, c.targetSymbol, r.spreadBps, { dp: c.currencyDp })
  const description =
    (r.sample ? "The design's sample settlement, nothing on chain. " : '') +
    `${shortAddress(r.recipient)} received ${delivered} for ${paid} on Monad. Spread ${spread} against ${c.feed?.label ?? 'the reference'}. ` +
    `Reference ${rateLine(r.referenceRate, c.targetSymbol, c.rateDp)}, executed ${rateLine(r.executedRate, c.targetSymbol, c.rateDp)}.`
  return {
    title,
    description,
    alternates: { canonical: `/receipt/${r.intentId}` },
    openGraph: { title, description, type: 'article', url: `/receipt/${r.intentId}` },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function ReceiptPage({ params }: Props) {
  const r = await receiptFor(params)
  if (!r) notFound()
  const { host, origin } = await requestOrigin()
  const permalink = `${origin}/receipt/${r.intentId}`
  const deployment = deploymentAddresses()
  const explorer = r.txHash ? monadscanTx(r.txHash) : deployment ? monadscanAddress(deployment.rateAttestation) : null

  return (
    <div className="dotgrid min-h-dvh md:px-10">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1200px] flex-col border-hairline bg-canvas md:border-x">
        <Nav showBuiltOn={false} right={<span className="label-md hidden whitespace-nowrap text-muted lg:inline">Public receipt · no wallet needed</span>} />
        <main className="grid grid-cols-1 md:grid-cols-[minmax(0,7fr)_minmax(0,8fr)]">
          <ReceiptPanel receipt={r} host={host} />
          <section className="flex flex-col gap-7 px-4 py-8 md:px-8 md:py-10 lg:p-14">
            <div className="flex flex-col gap-[14px]">
              <div className="flex items-center gap-[10px]">
                <span className="label-md text-purple">Verification</span>
                {r.sample && <span className="label rounded-[3px] bg-amber px-2 py-[3px] text-ink">Sample</span>}
              </div>
              <h1 className="pretty m-0 font-display text-[28px] leading-[1.05] font-medium tracking-[-.03em] md:text-[30px] lg:text-[36px]">{headline(r)}</h1>
              <p className="pretty m-0 max-w-[520px] text-[16px] leading-[1.6] text-grey">
                This receipt is a <span className="font-mono text-[13px] text-ink">PayoutSettled</span> event emitted by RateAttestation on Monad in the same transaction
                that moved the funds. The values below are read from the chain, not from Henad.
              </p>
              {r.sample && <p className="m-0 font-mono text-[12px] text-ink">{"This is the design's sample settlement; no funds moved."}</p>}
            </div>
            <VerificationList receipt={r} />
            <div className="flex flex-wrap items-center gap-3">
              {explorer ? (
                <Button href={explorer} external variant="primary" size="lg">
                  Open on Monadscan ↗
                </Button>
              ) : (
                <Button variant="disabled" size="lg">
                  Open on Monadscan ↗
                </Button>
              )}
              <CopyPermalink url={permalink} />
              <Button href="/send" variant="secondary" size="lg">
                Send a payout
              </Button>
              {/* The trailing slot from the canvas; says why the explorer button is off. A disabled button cannot show a title. */}
              {!explorer && <span className="label text-muted sm:ml-auto">{r.sample ? 'Sample settlement · nothing on chain' : 'No transaction recorded'}</span>}
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
