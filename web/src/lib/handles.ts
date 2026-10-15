import type { Address, Hex, LocalAccount } from 'viem'
import { handleOf, handleRegistry, handleRegistryAbi, registerTypedData, resolveHandle, toHandle } from '@henad/core'
import { appChain } from './chain'

/** The name this account holds, without the at-sign, or null. Throws when the chain cannot be read. */
export function readMyHandle(address: Address): Promise<string | null> {
  return handleOf(appChain(), address)
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
  return handle
}
