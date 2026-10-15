'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { Wordmark, BuiltOnMonad } from './ui/Brand'
import { Button } from './ui/Button'

const LINKS = [
  { href: '/send', label: 'Send' },
  { href: '/top-up', label: 'Top up' },
  { href: '/earn', label: 'Earn' },
  { href: '/rates', label: 'Rates' },
  { href: '/receipts', label: 'Receipts' },
  { href: '/account', label: 'Account' },
  { href: '/docs', label: 'Docs' },
]

/**
 * Site navigation. Desktop: 72px bar with links and two actions. Mobile: 52px
 * bar with the wordmark and a compact right slot. Active link gets the purple
 * hairline underline from the canvas.
 */
export function Nav({ right, mobileRight, showBuiltOn = true }: { right?: ReactNode; mobileRight?: ReactNode; showBuiltOn?: boolean }) {
  const path = usePathname()
  const isActive = (href: string) => path === href || (href !== '/' && path.startsWith(href + '/')) || (href === '/receipts' && path.startsWith('/receipt'))
  return (
    <nav className="border-b border-hairline">
      {/* desktop */}
      {/* Seven links, the attribution and an action do not fit a ~900px window at full
          spacing: the gaps tighten below xl and the attribution waits for xl, so nothing
          wraps or overlaps on a laptop with a side panel open. */}
      <div className="hidden md:flex h-[72px] items-center justify-between gap-4 px-6 xl:px-9">
        <div className="flex min-w-0 items-center gap-6 xl:gap-12">
          <Wordmark size={24} />
          <div className="flex gap-4 label-lg lg:gap-5 xl:gap-7">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={`whitespace-nowrap text-ink pb-[2px] ${isActive(l.href) ? 'border-b border-purple' : ''}`}>
                {l.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          {showBuiltOn && (
            <span className="hidden xl:block">
              <BuiltOnMonad height={14} />
            </span>
          )}
          {right ?? (
            <>
              <Button href="/rates" variant="secondary" size="md">
                View rates
              </Button>
              <Button href="/send" variant="primary" size="md">
                Send a payout
              </Button>
            </>
          )}
        </div>
      </div>
      {/* mobile */}
      <div className="flex md:hidden h-[52px] items-center justify-between px-4">
        <Wordmark size={20} />
        <div className="flex items-center gap-[10px]">
          {mobileRight ?? (
            <div className="flex gap-4 label">
              {LINKS.slice(0, 2).map((l) => (
                <Link key={l.href} href={l.href} className={`text-ink pb-[2px] ${isActive(l.href) ? 'border-b border-purple' : ''}`}>
                  {l.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
