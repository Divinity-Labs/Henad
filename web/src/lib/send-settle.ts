import type { Hex, LocalAccount } from 'viem'
import type { Intent } from '@henad/core'

/**
 * The settlement seam. The send flow builds an Intent, hashes it, and hands it
 * here with the payer's Mera account (a viem LocalAccount that signs EIP-712,
 * so ERC-3009 authorizations and EIP-7702 delegations both work,
 * docs/INTEGRATION-FACTS.md §14.4). The transport behind this function is
 * being built separately and will replace this file; the interface stays.
 */
export interface Settlement {
  intentId: Hex
  txHash: Hex
}

export async function settle(intent: Intent, account: LocalAccount): Promise<Settlement> {
  throw new Error(`not wired: no settlement transport yet for ${account.address} (intent salt ${intent.salt})`)
}
