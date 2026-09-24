import type { Metadata } from 'next'
import { getAddress, isAddress } from 'viem'
import { cleanName } from '@henad/core'
import { Nav } from '@/components/Nav'
import { NavAccount } from '@/components/NavAccount'
import { SendFlow } from '@/components/send/send-flow'
import { Card, StepHeader } from '@/components/send/send-ui'
import { Button } from '@/components/ui/Button'
import { corridorFromSearch, loadInitial, one, type Search } from '@/lib/send-initial'
import { pageMeta } from '@/lib/site'

type Props = { params: Promise<{ address: string }>; searchParams: Promise<Search> }

/**
 * The same title for every link, whatever name it carries. ?n= is the link's claim, and a title
 * has no room for "not verified": "Pay Mum · Henad" in a browser tab, or in a Henad-branded
 * chat preview, would read as Henad vouching for a name anyone can type. The name is shown on
 * the page itself, beside where it came from. Never indexed: each link is one person's account.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params
  const valid = isAddress(address, { strict: false })
  return pageMeta({
    title: 'Make a payment',
    description: valid
      ? 'Send dollars with Henad and they arrive as pounds, euros, francs or yen. The rate and the spread are shown before you pay.'
      : 'This payment link is not valid.',
    path: `/pay/${valid ? getAddress(address) : encodeURIComponent(address)}`,
    index: false,
  })
}

function InvalidLink() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Nav right={<NavAccount />} />
      <main className="dotgrid flex flex-1 flex-col md:items-center md:px-6 md:py-12">
        <section aria-label="Payment link" className="flex w-full flex-1 flex-col bg-canvas md:w-[420px] md:min-h-[728px] md:flex-none md:border md:border-hairline">
          <div className="flex flex-1 flex-col gap-4 px-4 pb-6 pt-5">
            <StepHeader left="Payment link" right={null} />
            <Card className="flex flex-col gap-3 p-5">
              <p className="m-0 font-display text-[24px] leading-[1.1] tracking-[-.03em]">This payment link is not valid.</p>
              <p className="m-0 text-[14px] leading-[1.6] text-grey">
                Part of it may have been lost when it was copied. Ask them to send it again, or start a payment and paste it there.
              </p>
              <Button href="/send" size="lg" className="self-start">
                Make a payment
              </Button>
            </Card>
          </div>
        </section>
      </main>
    </div>
  )
}

/**
 * /pay/[address]?n=Ada — someone's pay link, opened. The send flow, with the recipient already
 * chosen and the link's name marked as the link's. ?to= picks the corridor as it does on /send,
 * so switching currency and reloading keeps it.
 */
export default async function PayPage({ params, searchParams }: Props) {
  const [{ address }, sp] = await Promise.all([params, searchParams])
  if (!isAddress(address, { strict: false })) return <InvalidLink />
  const recipient = getAddress(address)
  const initial = await loadInitial(corridorFromSearch(sp).key, null)
  // Keyed by the account: the flow's state is built once, and a second link must not inherit the first's.
  return <SendFlow key={recipient} initial={{ ...initial, recipient, recipientName: cleanName(one(sp.n)), recipientSource: 'link' }} />
}
