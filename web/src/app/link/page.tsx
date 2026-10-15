import type { Metadata } from 'next'
import { pageMeta } from '@/lib/site'
import { Nav } from '@/components/Nav'
import { SendLinkView } from '@/components/claim/SendLinkView'

export const metadata: Metadata = pageMeta({ title: 'Send by link', description: 'Send money to someone who is not on Henad yet, as a link they open to claim it.', path: '/link', index: false })

/** /link — put money behind a claim link, and see or take back the links already sent. */
export default function LinkPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Nav />
      <main className="dotgrid flex flex-1 flex-col md:items-center md:px-6 md:py-12">
        <section aria-label="Send by link" className="flex w-full flex-1 flex-col bg-canvas md:w-[420px] md:min-h-[728px] md:flex-none md:border md:border-hairline">
          <SendLinkView />
        </section>
      </main>
    </div>
  )
}
