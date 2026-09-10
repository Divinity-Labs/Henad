import Link from 'next/link'

const LINKS = [
  ['/send', 'Send'],
  ['/rates', 'Rates'],
  ['/receipts', 'Receipts'],
  ['/docs', 'Docs'],
] as const

/** The two-line menu glyph from the mobile canvas. A native disclosure: no client JavaScript. */
export function LandingMobileMenu() {
  return (
    <details className="relative">
      <summary
        aria-label="Menu"
        className="press list-none [&::-webkit-details-marker]:hidden cursor-pointer flex h-9 w-5 flex-col justify-center gap-[5px]"
      >
        <span className="block h-[1.5px] bg-ink" />
        <span className="block h-[1.5px] bg-ink" />
      </summary>
      <div className="absolute right-0 top-full z-20 mt-2 flex w-44 flex-col overflow-hidden rounded-[8px] border border-hairline bg-surface shadow-[0_12px_30px_-12px_rgba(14,9,28,.25)] label-lg">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className="px-4 py-3 text-ink border-b border-hairline-2 last:border-b-0">
            {label}
          </Link>
        ))}
      </div>
    </details>
  )
}
