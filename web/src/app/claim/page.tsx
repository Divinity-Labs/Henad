import type { Metadata } from 'next'
import { pageMeta } from '@/lib/site'
import { Nav } from '@/components/Nav'
import { ClaimView } from '@/components/claim/ClaimView'

// Every link is one person's money: nothing a search result should ever show.
export const metadata: Metadata = pageMeta({ title: 'Money for you', description: 'Someone sent you money with Henad. Open the link to claim it.', path: '/claim', index: false })

/** /claim#<key> — opening a claim link. The key stays in the fragment, which the server never sees. */
export default function ClaimPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Nav />
      <main className="dotgrid flex flex-1 flex-col md:items-center md:px-6 md:py-12">
        <section aria-label="Claim your money" className="flex w-full flex-1 flex-col bg-canvas md:w-[420px] md:min-h-[600px] md:flex-none md:border md:border-hairline">
          <ClaimView />
        </section>
      </main>
    </div>
  )
}
