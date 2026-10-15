import { getAddress, type Address, type Hex, type PublicClient } from 'viem'
import { MONAD_MAINNET_ID } from './chains'
import { HENAD_CLAIMS, TOKENS } from './addresses'

/**
 * Claim links: send money to someone who has no account yet.
 *
 * Backed by ClaimEscrow on Monad mainnet (contracts/src/ClaimEscrow.sol). The sender's app
 * makes a fresh key for every link; its address (the claimSigner) names the deposit, and the
 * key itself only ever travels in the link's fragment, after `#`, which browsers never send
 * to a server. Whoever opens the link picks the account the money goes to, so a link is cash:
 * anyone holding it can claim it until it is claimed, cancelled or expires.
 *
 * The escrow accepts any token and records whatever the token says arrived, so nothing here
 * shows or settles a deposit unless its token is AUSD or USDC (`claimToken`).
 */

export const claimEscrowAbi = [
  {
    type: 'function',
    name: 'depositOf',
    stateMutability: 'view',
    inputs: [{ name: 'claimSigner', type: 'address' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'token', type: 'address' },
          { name: 'from', type: 'address' },
          { name: 'amount', type: 'uint128' },
          { name: 'expiry', type: 'uint64' },
        ],
      },
    ],
  },
  { type: 'function', name: 'used', stateMutability: 'view', inputs: [{ name: 'claimSigner', type: 'address' }], outputs: [{ type: 'bool' }] },
  {
    type: 'function',
    name: 'depositNonce',
    stateMutability: 'view',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'from', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'claimSigner', type: 'address' },
      { name: 'expiry', type: 'uint64' },
      { name: 'salt', type: 'bytes32' },
    ],
    outputs: [{ type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'depositWithAuthorization',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'from', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'claimSigner', type: 'address' },
      { name: 'expiry', type: 'uint64' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'salt', type: 'bytes32' },
      { name: 'signature', type: 'bytes' },
      { name: 'fundSignature', type: 'bytes' },
    ],
    outputs: [{ name: 'received', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'claimSigner', type: 'address' },
      { name: 'recipient', type: 'address' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'cancelWithSig',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'claimSigner', type: 'address' },
      { name: 'deadline', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
  { type: 'function', name: 'refund', stateMutability: 'nonpayable', inputs: [{ name: 'claimSigner', type: 'address' }], outputs: [] },
  { type: 'error', name: 'ZeroAddress', inputs: [] },
  { type: 'error', name: 'ZeroAmount', inputs: [] },
  { type: 'error', name: 'ValueOverflow', inputs: [] },
  { type: 'error', name: 'InvalidExpiry', inputs: [{ name: 'expiry', type: 'uint64' }] },
  { type: 'error', name: 'ClaimSignerUsed', inputs: [{ name: 'claimSigner', type: 'address' }] },
  { type: 'error', name: 'AuthorizationUsed', inputs: [{ name: 'nonce', type: 'bytes32' }] },
  { type: 'error', name: 'NoDeposit', inputs: [{ name: 'claimSigner', type: 'address' }] },
  { type: 'error', name: 'DepositExpired', inputs: [{ name: 'claimSigner', type: 'address' }, { name: 'expiry', type: 'uint64' }] },
  { type: 'error', name: 'NotExpired', inputs: [{ name: 'claimSigner', type: 'address' }, { name: 'expiry', type: 'uint64' }] },
  { type: 'error', name: 'NotDepositor', inputs: [{ name: 'caller', type: 'address' }, { name: 'from', type: 'address' }] },
  { type: 'error', name: 'InvalidRecipient', inputs: [{ name: 'recipient', type: 'address' }] },
  { type: 'error', name: 'InvalidSignature', inputs: [{ name: 'signer', type: 'address' }] },
  { type: 'error', name: 'SignatureExpired', inputs: [{ name: 'deadline', type: 'uint256' }] },
] as const

/** How long a new link stays open. The contract allows up to 90 days. */
export const CLAIM_LINK_DAYS = 30

/** ClaimEscrow on mainnet; claim links exist nowhere else. */
export function claimEscrow(): Address {
  const deployment = HENAD_CLAIMS[MONAD_MAINNET_ID]
  if (!deployment) throw new Error('ClaimEscrow is not deployed')
  return deployment.claimEscrow
}

/** AUSD or USDC on mainnet by address, or null. The only tokens a link may hold. */
export function claimToken(token: Address): { symbol: 'AUSD' | 'USDC'; address: Address; decimals: number } | null {
  for (const symbol of ['AUSD', 'USDC'] as const) {
    const t = TOKENS[MONAD_MAINNET_ID][symbol]
    if (t && t.address.toLowerCase() === token.toLowerCase()) return { symbol, address: t.address, decimals: t.decimals }
  }
  return null
}

function domain() {
  return { name: 'Henad Claims', version: '1', chainId: MONAD_MAINNET_ID, verifyingContract: claimEscrow() } as const
}

/** Signed by the link's key: lets this sender, and only this sender, fund the link. */
export function fundTypedData(claimSigner: Address, token: Address, from: Address, amount: bigint, expiry: bigint) {
  return {
    domain: domain(),
    types: {
      Fund: [
        { name: 'claimSigner', type: 'address' },
        { name: 'token', type: 'address' },
        { name: 'from', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'expiry', type: 'uint64' },
      ],
    },
    primaryType: 'Fund' as const,
    message: { claimSigner, token, from, amount, expiry },
  }
}

/** Signed by the link's key: pay the deposit to `recipient`, and nobody else. */
export function claimTypedData(claimSigner: Address, recipient: Address) {
  return {
    domain: domain(),
    types: {
      Claim: [
        { name: 'claimSigner', type: 'address' },
        { name: 'recipient', type: 'address' },
      ],
    },
    primaryType: 'Claim' as const,
    message: { claimSigner, recipient },
  }
}

/** Signed by the sender: take the money back before anyone claims it. */
export function cancelTypedData(claimSigner: Address, deadline: bigint) {
  return {
    domain: domain(),
    types: {
      Cancel: [
        { name: 'claimSigner', type: 'address' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Cancel' as const,
    message: { claimSigner, deadline },
  }
}

/** The link for `key`: `<origin>/claim#<key without 0x>`. The key never leaves the fragment. */
export function claimLink(origin: string, key: Hex): string {
  return `${origin.replace(/\/$/, '')}/claim#${key.slice(2)}`
}

/** The key carried in a claim link's fragment (`#…`, with or without the hash), or null. */
export function claimKeyFromFragment(fragment: string): Hex | null {
  const bare = fragment.replace(/^#/, '').trim().toLowerCase()
  return /^[0-9a-f]{64}$/.test(bare) ? `0x${bare}` : null
}

export type LinkState =
  | { kind: 'open'; token: Address; symbol: 'AUSD' | 'USDC'; decimals: number; from: Address; amount: bigint; expiry: bigint }
  | { kind: 'expired'; symbol: 'AUSD' | 'USDC'; decimals: number; from: Address; amount: bigint }
  | { kind: 'done' }
  | { kind: 'none' }
  | { kind: 'foreign' }

/**
 * What a link holds right now. `done` means it was claimed, cancelled or returned; `none` that
 * it was never funded; `foreign` a deposit in a token Henad does not accept, never shown.
 */
export async function readLink(client: PublicClient, claimSigner: Address, nowSec: bigint): Promise<LinkState> {
  const escrow = claimEscrow()
  const d = await client.readContract({ address: escrow, abi: claimEscrowAbi, functionName: 'depositOf', args: [claimSigner] })
  if (d.from === '0x0000000000000000000000000000000000000000') {
    const used = await client.readContract({ address: escrow, abi: claimEscrowAbi, functionName: 'used', args: [claimSigner] })
    return used ? { kind: 'done' } : { kind: 'none' }
  }
  const token = claimToken(d.token)
  if (!token) return { kind: 'foreign' }
  const from = getAddress(d.from)
  if (nowSec >= d.expiry) return { kind: 'expired', symbol: token.symbol, decimals: token.decimals, from, amount: d.amount }
  return { kind: 'open', token: token.address, symbol: token.symbol, decimals: token.decimals, from, amount: d.amount, expiry: d.expiry }
}
