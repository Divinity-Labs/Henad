import { getAddress, type Address, type PublicClient } from 'viem'
import { MONAD_MAINNET_ID } from './chains'
import { HENAD_CLAIMS } from './addresses'

/**
 * Henad names: `@miracle` instead of an account number.
 *
 * Backed by HandleRegistry on Monad mainnet (contracts/src/HandleRegistry.sol). A name is
 * 3 to 20 lowercase letters, digits or underscores, first come first served, free, and the
 * relayer pays the gas to claim one, so a person with no MON gets a name the same way they
 * send money. The at-sign is display only and never stored on chain.
 *
 * A name proves only that someone registered it. Nothing is reserved and nobody checks who
 * holds what, so the send screen treats a first payment to a name like any first payment.
 */

export const HANDLE_MIN = 3
export const HANDLE_MAX = 20
const HANDLE_SHAPE = /^[a-z0-9_]{3,20}$/

export const handleRegistryAbi = [
  { type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ name: 'handle', type: 'string' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'handleOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'nonces', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
  {
    type: 'function',
    name: 'registerFor',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'handle', type: 'string' },
      { name: 'deadline', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [{ name: 'registered', type: 'bool' }],
  },
  { type: 'error', name: 'InvalidHandle', inputs: [{ name: 'handle', type: 'string' }] },
  { type: 'error', name: 'HandleTaken', inputs: [{ name: 'handle', type: 'string' }] },
  { type: 'error', name: 'SignatureExpired', inputs: [{ name: 'deadline', type: 'uint256' }] },
  { type: 'error', name: 'InvalidSignature', inputs: [{ name: 'owner', type: 'address' }] },
  { type: 'error', name: 'InvalidAccountNonce', inputs: [{ name: 'account', type: 'address' }, { name: 'currentNonce', type: 'uint256' }] },
] as const

/** HandleRegistry on mainnet; names exist nowhere else. */
export function handleRegistry(): Address {
  const deployment = HENAD_CLAIMS[MONAD_MAINNET_ID]
  if (!deployment) throw new Error('HandleRegistry is not deployed')
  return deployment.handleRegistry
}

/**
 * What a person typed, as the name the registry stores, or null if it can never be one.
 * Takes "@Miracle", "miracle" or " miracle " alike: the at-sign is dropped and case folded,
 * because the registry only ever holds lowercase.
 */
export function toHandle(input: string): string | null {
  const bare = input.trim().replace(/^@/, '').toLowerCase()
  return HANDLE_SHAPE.test(bare) ? bare : null
}

/** Why a typed name cannot be claimed, in words for the person typing it. */
export function handleProblem(input: string): string | null {
  const bare = input.trim().replace(/^@/, '')
  if (!bare) return null
  if (bare.length < HANDLE_MIN) return `At least ${HANDLE_MIN} characters.`
  if (bare.length > HANDLE_MAX) return `At most ${HANDLE_MAX} characters.`
  if (!/^[a-zA-Z0-9_]+$/.test(bare)) return 'Only letters, numbers and underscores.'
  return null
}

/** The account holding `handle`, or null if nobody does. */
export async function resolveHandle(client: PublicClient, handle: string): Promise<Address | null> {
  const name = toHandle(handle)
  if (!name) return null
  const owner = await client.readContract({ address: handleRegistry(), abi: handleRegistryAbi, functionName: 'ownerOf', args: [name] })
  return owner === '0x0000000000000000000000000000000000000000' ? null : getAddress(owner)
}

/** The name `address` holds, without the at-sign, or null. */
export async function handleOf(client: PublicClient, address: Address): Promise<string | null> {
  const name = await client.readContract({ address: handleRegistry(), abi: handleRegistryAbi, functionName: 'handleOf', args: [address] })
  return name || null
}

export const REGISTER_TYPES = {
  Register: [
    { name: 'owner', type: 'address' },
    { name: 'handle', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

/** What the owner's passkey signs so the relayer can claim `handle` for them. */
export function registerTypedData(owner: Address, handle: string, nonce: bigint, deadline: bigint) {
  return {
    domain: { name: 'Henad Handles', version: '1', chainId: MONAD_MAINNET_ID, verifyingContract: handleRegistry() },
    types: REGISTER_TYPES,
    primaryType: 'Register' as const,
    message: { owner, handle, nonce, deadline },
  }
}
