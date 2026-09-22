import type { Metadata } from 'next'
import { pageMeta } from '@/lib/site'
import { Nav } from '@/components/Nav'
import { AccountView } from '@/components/account/AccountView'
import { MONAD_MAINNET_ID } from '@henad/core'
import { appChainId, isLocalFork } from '@/lib/chain'

// One person's address and balances: nothing a search result should ever show.
export const metadata: Metadata = pageMeta({ title: 'Account', description: 'Your Henad address, its QR code, and what it holds on Monad.', path: '/account', index: false })

/** /account — the signed-in address, its QR code and holdings, in the same column as /send. */
export default function AccountPage() {
  const network = isLocalFork() ? 'Local fork' : appChainId() === MONAD_MAINNET_ID ? 'Monad mainnet' : 'Monad testnet'
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
