import type { Metadata } from 'next'
import { pageMeta } from '@/lib/site'
import { Nav } from '@/components/Nav'
import { AccountView } from '@/components/account/AccountView'
import { isLocalFork } from '@/lib/chain'

// One person's address and balances: nothing a search result should ever show.
export const metadata: Metadata = pageMeta({ title: 'Account', description: 'Your Henad pay link, its QR code, and what your account holds.', path: '/account', index: false })

/**
 * /account — the signed-in account's pay link, its QR code and holdings, in the same column as
 * /send. The network is named only on a developer's local fork, where it is the warning that
 * the money is not real. The one person who needs the network's name, someone sending from an
 * exchange, finds it beside the account number.
 */
export default function AccountPage() {
  const network = isLocalFork() ? 'Local fork' : null
  return (
    <div className="flex min-h-dvh flex-col">
      <Nav />
      <main className="dotgrid flex flex-1 flex-col md:items-center md:px-6 md:py-12">
        <section aria-label="Your account" className="flex w-full flex-1 flex-col bg-canvas md:w-[420px] md:min-h-[728px] md:flex-none md:border md:border-hairline">
          <AccountView network={network} />
        </section>
      </main>
    </div>
  )
}
