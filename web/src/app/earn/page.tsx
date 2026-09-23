import type { Metadata } from 'next'
import { pageMeta } from '@/lib/site'
import { Nav } from '@/components/Nav'
import { NavAccount } from '@/components/NavAccount'
import { EarnView } from '@/components/earn/EarnView'
import { MONAD_MAINNET_ID } from '@henad/core'
import { appChainId, isLocalFork } from '@/lib/chain'

export const metadata: Metadata = pageMeta({
  title: 'Earn on idle AUSD',
  description:
    "Put AUSD to work in Upshift's earnAUSD vault on Monad while it waits to be sent. Self-custodial, withdraw any time, and the rate shown is the one the vault actually paid.",
  path: '/earn',
})

/** /earn — AUSD into the earnAUSD vault, in the same column as /send and /top-up. */
export default function EarnPage() {
  const network = isLocalFork() ? 'Local fork' : appChainId() === MONAD_MAINNET_ID ? 'Monad mainnet' : 'Monad testnet'
  return (
    <div className="flex min-h-dvh flex-col">
      <Nav right={<NavAccount />} />
      <main className="dotgrid flex flex-1 flex-col md:items-center md:px-6 md:py-12">
        <section aria-label="Earn" className="flex w-full flex-1 flex-col bg-canvas md:w-[420px] md:min-h-[728px] md:flex-none md:border md:border-hairline">
          <EarnView network={network} />
        </section>
      </main>
    </div>
  )
}
