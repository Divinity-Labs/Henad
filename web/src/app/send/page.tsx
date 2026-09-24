import type { Metadata } from 'next'
import { pageMeta } from '@/lib/site'
import { SendFlow } from '@/components/send/send-flow'
import { corridorFromSearch, loadInitial, one, type Search } from '@/lib/send-initial'

export const metadata: Metadata = pageMeta({
  title: 'Send money abroad',
  description:
    'Send AUSD or USDC and the recipient receives pounds, euros, francs or yen on Monad in one transaction. The rate, the spread and the worst rate you will accept are shown before you sign.',
  path: '/send',
})

/**
 * /send — one route, a client-side step machine. This server shell reads the
 * live reference rates and the newest settlement, and hands them to the client
 * as plain JSON with the server clock. ?to=GBP|EUR|CHF|JPY picks the corridor;
 * ?demo=receipt renders S3 with the fixture receipt (labelled Sample) and
 * ?demo=closed forces the FX-closed state, both for review.
 */
export default async function SendPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams
  const demoRaw = one(sp.demo)
  const demo = demoRaw === 'receipt' || demoRaw === 'closed' ? demoRaw : null
  const initial = await loadInitial(corridorFromSearch(sp).key, demo)
  return <SendFlow initial={initial} />
}
