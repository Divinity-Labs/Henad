'use client'

import Link from 'next/link'
import type { Address } from 'viem'
import { cleanName } from '@henad/core'
import { Button } from '@/components/ui/Button'
import { useMyName } from '@/lib/contacts'
import { useStoredAddress } from '@/lib/use-stored-address'

/**
 * The signed-in account as a chip linking to /account: the name the person gave themselves,
 * or "Your account". The account number stays in the tooltip and the accessible name, and in
 * full on /account, which is where anyone who needs it goes.
 */
export function AccountChip({ address }: { address: Address }) {
  const name = cleanName(useMyName(address))
  return (
    <Link
      href="/account"
      title={address}
      aria-label={`${name ?? 'Your account'}, account number ${address}`}
      className="press flex max-w-[180px] items-center gap-[7px] rounded-[4px] border border-border bg-surface px-[10px] py-[6px] font-mono text-[11px] text-ink transition-colors hover:border-muted"
    >
      <span aria-hidden className="h-[6px] w-[6px] flex-none rounded-full bg-purple" />
      <span className="truncate">{name ?? 'Your account'}</span>
    </Link>
  )
}

/**
 * The nav's right-hand slot on pages that do not run the send flow: the signed-in account as
 * a chip, or Sign in when this browser has none.
 *
 * The stored address is only readable in the browser, so the first render shows nothing
 * rather than guessing, and a signed-in person never sees a Sign in button flash past.
 */
export function NavAccount({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const address = useStoredAddress()

  if (address === undefined) return <span aria-hidden className={size === 'sm' ? 'h-[34px] w-[96px]' : 'h-10 w-[120px]'} />
  if (address === null)
    return (
      <Button href="/send" variant="secondary" size={size}>
        Sign in
      </Button>
    )
  return <AccountChip address={address} />
}
