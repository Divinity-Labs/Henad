import { hashTypedData, type Address, type Hex, type TypedDataDomain } from 'viem'

/**
 * Mirror of contracts/src/PayoutIntent.sol. The EIP-712 hash computed here is the
 * `intentId`, and in the relayer path it is also the ERC-3009 nonce, so any
 * divergence from the contract would make signatures unusable. The test pins a
 * vector printed by the Solidity test suite.
 */

export interface Intent {
  payer: Address
  recipient: Address
  sourceAsset: Address
  targetAsset: Address
  sourceAmount: bigint
  quotedAmountOut: bigint
  toleranceBps: number
  maxSpreadBps: number
  deadline: bigint
  salt: Hex
}

export const INTENT_TYPES = {
  Intent: [
    { name: 'payer', type: 'address' },
    { name: 'recipient', type: 'address' },
    { name: 'sourceAsset', type: 'address' },
    { name: 'targetAsset', type: 'address' },
    { name: 'sourceAmount', type: 'uint256' },
    { name: 'quotedAmountOut', type: 'uint256' },
    { name: 'toleranceBps', type: 'uint16' },
    { name: 'maxSpreadBps', type: 'uint16' },
    { name: 'deadline', type: 'uint64' },
    { name: 'salt', type: 'bytes32' },
  ],
} as const

export function henadDomain(chainId: number, router: Address): TypedDataDomain {
  return { name: 'Henad', version: '1', chainId, verifyingContract: router }
}

/** intentId = EIP-712 hash under the router's domain. */
export function hashIntent(intent: Intent, chainId: number, router: Address): Hex {
  return hashTypedData({
    domain: henadDomain(chainId, router),
    types: INTENT_TYPES,
    primaryType: 'Intent',
    message: intent,
  })
}

/** Least the venue may deliver; mirrors PayoutIntent.minAmountOut. */
export function minAmountOut(intent: Pick<Intent, 'quotedAmountOut' | 'toleranceBps'>): bigint {
  return (intent.quotedAmountOut * BigInt(10_000 - intent.toleranceBps)) / 10_000n
}
