import type { Address, LocalAccount } from 'viem'
import { handleOf, handleRegistry, handleRegistryAbi, registerTypedData, resolveHandle, toHandle } from '@henad/core'
import { postForTx } from './api'
import { appChain } from './config'

/**
 * Henad names on the phone, the same as the web's (web/src/lib/handles.ts): the passkey signs
 * the claim, /api/handle submits it and pays the gas, and the registry is the only record of
 * who holds what. Nothing about a name is stored on the device.
 */

/** The name this account holds, without the at-sign, or null. Throws when the chain cannot be read. */
export function readMyHandle(address: Address): Promise<string | null> {
  return handleOf(appChain(), address)
}

/** Whether nobody holds `handle` yet. */
export async function handleIsFree(handle: string): Promise<boolean> {
  return (await resolveHandle(appChain(), handle)) === null
}

/**
 * Claim `input` for `account` and wait until the registry says it is theirs. Throws an Error
 * whose message can be shown as it is.
 */
export async function claimHandle(account: LocalAccount, input: string): Promise<string> {
  const handle = toHandle(input)
  if (!handle) throw new Error('That is not a valid Henad name.')
  const client = appChain()
  const nonce = await client.readContract({ address: handleRegistry(), abi: handleRegistryAbi, functionName: 'nonces', args: [account.address] })
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 10 * 60)
  const signature = await account.signTypedData(registerTypedData(account.address, handle, nonce, deadline))
  const hash = await postForTx('/api/handle', { owner: account.address, handle, deadline: deadline.toString(), signature })
  await client.waitForTransactionReceipt({ hash })
  // The transaction can land and still not give the name, if someone else's claim landed first.
  if ((await handleOf(client, account.address)) !== handle) throw new Error(`Someone claimed @${handle} a moment before you. Try another.`)
  return handle
}
