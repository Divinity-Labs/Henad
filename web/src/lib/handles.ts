import { useEffect, useState } from 'react'
import type { Address, Hex, LocalAccount } from 'viem'
import { handleOf, handleRegistry, handleRegistryAbi, registerTypedData, resolveHandle, toHandle } from '@henad/core'
import { appChain } from './chain'

/** One read per account per page load, shared by the nav chip and the account page. */
const known = new Map<string, string | null>()
const listeners = new Set<() => void>()

/** The name this account holds, without the at-sign, or null. Throws when the chain cannot be read. */
export async function readMyHandle(address: Address): Promise<string | null> {
  const handle = await handleOf(appChain(), address)
  rememberHandle(address, handle)
  return handle
}

function rememberHandle(address: Address, handle: string | null) {
  known.set(address.toLowerCase(), handle)
  listeners.forEach((l) => l())
}

/** The account's Henad name for display; null until read, or when it has none or the read fails. */
export function useMyHandle(address: Address): string | null {
  const key = address.toLowerCase()
  const [, bump] = useState(0)
  useEffect(() => {
    const listen = () => bump((n) => n + 1)
    listeners.add(listen)
    if (!known.has(key)) readMyHandle(address).catch(() => {})
    return () => {
      listeners.delete(listen)
    }
  }, [address, key])
  return known.get(key) ?? null
}

/** Whether nobody holds `handle` yet. */
export async function handleIsFree(handle: string): Promise<boolean> {
  return (await resolveHandle(appChain(), handle)) === null
}

/**
 * Claim `input` for `account`: the passkey signs, /api/handle submits and pays the gas, and
 * this waits until the registry says the name is theirs. Throws an Error whose message can be
 * shown as it is.
 */
export async function claimHandle(account: LocalAccount, input: string): Promise<string> {
  const handle = toHandle(input)
  if (!handle) throw new Error('That is not a valid Henad name.')
  const client = appChain()
  const nonce = await client.readContract({ address: handleRegistry(), abi: handleRegistryAbi, functionName: 'nonces', args: [account.address] })
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 10 * 60)
  const signature = await account.signTypedData(registerTypedData(account.address, handle, nonce, deadline))

  let res: Response
  try {
    res = await fetch('/api/handle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner: account.address, handle, deadline: deadline.toString(), signature }),
    })
  } catch {
    throw new Error('Could not reach Henad. Check your connection and try again.')
  }
  const json = (await res.json().catch(() => null)) as { txHash?: Hex; error?: string } | null
  if (!res.ok || !json?.txHash) throw new Error(json?.error ?? 'The name could not be claimed. Try again.')

  await client.waitForTransactionReceipt({ hash: json.txHash })
  // The transaction can land and still not give the name, if someone else's claim landed first.
  const held = await handleOf(client, account.address)
  if (held !== handle) throw new Error(`Someone claimed @${handle} a moment before you. Try another.`)
  rememberHandle(account.address, handle)
  return handle
}
