'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { shortAddress } from '@/lib/format'
import { useStoredAddress } from '@/lib/use-stored-address'

/**
 * The nav's right-hand slot on pages that do not run the send flow: the signed-in account as
 * a chip linking to /account, or Sign in when this browser has none.
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
  return (
    <Link
      href="/account"
      title={address}
      aria-label={`Your account ${address}`}
      className="press flex items-center gap-[7px] rounded-[4px] border border-border bg-surface px-[10px] py-[6px] font-mono text-[11px] text-ink transition-colors hover:border-muted"
    >
      <span aria-hidden className="h-[6px] w-[6px] rounded-full bg-purple" />
      {shortAddress(address)}
    </Link>
  )
}
