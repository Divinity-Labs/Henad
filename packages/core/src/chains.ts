import { monad, monadTestnet } from 'viem/chains'
import type { Chain } from 'viem'

/**
 * Monad chains as used by Henad. viem's definitions are the source of truth for
 * ids and native currency; the RPC lists below come from docs.monad.xyz
 * (see docs/INTEGRATION-FACTS.md §1) and are ordered by rate limit.
 */
export const MONAD_MAINNET_ID = 143 as const
export const MONAD_TESTNET_ID = 10143 as const

export type MonadChainId = typeof MONAD_MAINNET_ID | typeof MONAD_TESTNET_ID

export const MAINNET_RPCS = [
  'https://rpc.monad.xyz', // QuickNode, 25 rps
  'https://rpc3.monad.xyz', // Ankr, 300 per 10 s
  'https://rpc2.monad.xyz', // Goldsky, 300 per 10 s, historical eth_call
  'https://rpc1.monad.xyz', // Alchemy, 15 rps
] as const

export const TESTNET_RPCS = [
  'https://testnet-rpc.monad.xyz', // QuickNode, 50 rps
  'https://rpc.ankr.com/monad_testnet',
  'https://rpc-testnet.monadinfra.com',
] as const

export const EXPLORERS = {
  [MONAD_MAINNET_ID]: { name: 'MonadVision', url: 'https://monadvision.com' },
  [MONAD_TESTNET_ID]: { name: 'MonadVision', url: 'https://testnet.monadvision.com' },
} as const

/** Monad finalises after two 300 ms blocks. */
export const FINALITY_MS = 600

export function chainFor(id: MonadChainId): Chain {
  return id === MONAD_MAINNET_ID ? monad : monadTestnet
}

export function isMonadChainId(id: number): id is MonadChainId {
  return id === MONAD_MAINNET_ID || id === MONAD_TESTNET_ID
}
