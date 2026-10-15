'use client'

import { useEffect, useState } from 'react'
import type { Address } from 'viem'
import { handleProblem, toHandle } from '@henad/core'
import { Button } from '@/components/ui/Button'
import { claimHandle, handleIsFree, readMyHandle } from '@/lib/handles'
import { describeAccountError, unlockStoredAccount } from '@/lib/send-mera'

type Check = { name: string; state: 'checking' | 'free' | 'taken' | 'error' }

/**
 * The account's Henad name: shown once held, claimable until then. Claiming needs the
 * passkey, because the account signs the claim, and no MON, because the relayer submits it.
 */
export function HenadName({ address, suggestion, onHeld }: { address: Address; suggestion: string; onHeld: (handle: string | null) => void }) {
  const [held, setHeld] = useState<string | null | undefined>(undefined)
  const [typed, setTyped] = useState<string | null>(null)
  const [check, setCheck] = useState<Check | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    readMyHandle(address).then(
      (h) => {
        if (!live) return
        setHeld(h)
        onHeld(h)
      },
      () => live && setHeld(null),
    )
    return () => {
      live = false
    }
  }, [address, onHeld])

  // Until they type, offer their link name as the name to claim, when it could be one.
  const input = typed ?? (toHandle(suggestion.replace(/\s+/g, '_')) ?? '')
  const name = toHandle(input)

  useEffect(() => {
    if (!name) return
    let live = true
    const id = window.setTimeout(() => {
      handleIsFree(name).then(
        (free) => live && setCheck({ name, state: free ? 'free' : 'taken' }),
        () => live && setCheck({ name, state: 'error' }),
      )
    }, 400)
    return () => {
      live = false
      window.clearTimeout(id)
    }
  }, [name])
  const status = name ? (check?.name === name ? check.state : 'checking') : null

  async function claim() {
    if (!name) return
    setBusy(true)
    setError(null)
    let account: Awaited<ReturnType<typeof unlockStoredAccount>> | null = null
    try {
      account = await unlockStoredAccount()
      const handle = await claimHandle(account.account, name)
      setHeld(handle)
      onHeld(handle)
    } catch (e) {
      setError(account ? (e instanceof Error ? e.message : 'The name could not be claimed. Try again.') : describeAccountError(e))
    } finally {
      account?.end()
      setBusy(false)
    }
  }

  if (held === undefined) return null

  if (held) {
    return (
      <div className="flex flex-col gap-1">
        <span className="label text-muted">Your Henad name</span>
        <span className="font-display text-[28px] leading-none tracking-[-.03em]">@{held}</span>
        <p className="m-0 text-[12px] leading-[1.5] text-grey">Anyone on Henad can pay you by typing this name.</p>
      </div>
    )
  }

  const problem = handleProblem(input)
  return (
    <div className="flex flex-col gap-[6px]">
      <span className="label text-muted">Claim your Henad name · free</span>
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center rounded-[4px] border border-border bg-surface px-3">
          <span className="text-[15px] text-muted">@</span>
          <input
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="yourname"
            maxLength={21}
            value={input}
            onChange={(e) => {
              setTyped(e.target.value)
              setError(null)
            }}
            aria-label="Henad name to claim"
            className="w-full bg-transparent py-[9px] pl-[2px] text-[15px] text-ink placeholder:text-muted focus:outline-none"
          />
        </div>
        <Button size="md" variant={busy || status !== 'free' ? 'disabled' : 'primary'} onClick={() => void claim()}>
          {busy ? 'Claiming…' : 'Claim'}
        </Button>
      </div>
      <p role="status" className={`m-0 border-l-2 pl-3 text-[12px] leading-[1.5] text-grey ${error || problem || status === 'taken' ? 'border-amber' : 'border-transparent'}`}>
        {error ??
          problem ??
          (status === 'checking'
            ? 'Checking…'
            : status === 'taken'
              ? `@${name} is taken. Try another.`
              : status === 'error'
                ? 'Could not check that name just now.'
                : status === 'free'
                  ? `@${name} is free. People will be able to pay you by typing it.`
                  : 'Letters, numbers and underscores, 3 to 20 characters.')}
      </p>
    </div>
  )
}
