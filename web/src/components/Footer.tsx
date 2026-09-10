import Link from 'next/link'
import { Wordmark, BuiltOnMonad } from './ui/Brand'

const cols = [
  { items: [['/send', 'Send'], ['/rates', 'Rates'], ['/receipts', 'Receipts'], ['/docs', 'Docs']] },
  {
    items: [
      ['/docs/mrc', 'MRC draft'],
      ['/docs/integration-facts', 'Integration facts'],
      ['/docs/contracts', 'Contracts'],
      ['https://github.com/', 'GitHub'],
    ],
  },
  {
    items: [
      ['https://monadscan.com', 'Monadscan ↗'],
      ['https://www.monad.xyz/developers/hackathons/metropolis', 'Metropolis 2026 ↗'],
      ['https://x.com', 'X ↗'],
    ],
  },
] as const

export function Footer() {
  return (
    <>
      <footer className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1fr_1fr] border-t border-hairline">
        <div className="flex flex-col gap-[14px] px-4 md:px-9 py-8 md:py-10 md:border-r border-hairline">
          <Wordmark size={22} href={null} />
          <p className="m-0 text-[15px] leading-[1.6] text-grey pretty">
            From ἑνάς, a unit of one. The sibling of monad: the unit that makes separate things one.
          </p>
          <BuiltOnMonad height={14} className="mt-2" />
        </div>
        {cols.map((c, i) => (
          <div key={i} className={`flex flex-col gap-[18px] px-4 md:px-9 py-6 md:py-10 ${i < cols.length - 1 ? 'md:border-r' : ''} border-t md:border-t-0 border-hairline label-lg`}>
            {c.items.map(([href, label]) =>
              href.startsWith('http') ? (
                <a key={href} href={href} target="_blank" rel="noreferrer" className="text-ink">
                  {label}
                </a>
              ) : (
                <Link key={href} href={href} className="text-ink">
                  {label}
                </Link>
              ),
            )}
          </div>
        ))}
      </footer>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 md:px-9 py-[22px] border-t border-hairline text-[14px] text-grey">
        <span>© 2026 Henad. No fiat. No custody. No KYC.</span>
        <div className="flex gap-6 label-md">
          <Link href="/docs/privacy" className="text-ink">
            Privacy policy ↗
          </Link>
          <Link href="/docs/terms" className="text-ink">
            Terms of service ↗
          </Link>
        </div>
      </div>
    </>
  )
}
