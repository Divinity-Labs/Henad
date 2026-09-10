import type { Address, Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { MONAD_MAINNET_ID, TOKENS, type Intent } from '@henad/core'

/** Shared, deterministic inputs. The payer key is Foundry's second default account. */
export const CHAIN_ID = MONAD_MAINNET_ID
export const ROUTER: Address = '0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f'
export const AUSD = TOKENS[MONAD_MAINNET_ID].AUSD!.address
export const USDC = TOKENS[MONAD_MAINNET_ID].USDC!.address
export const GBPM = TOKENS[MONAD_MAINNET_ID].GBPm!.address
export const NOW_SEC = 1_789_000_000
export const TX_HASH: Hex = '0x1111111111111111111111111111111111111111111111111111111111111111'

export const PAYER_KEY: Hex = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
export const payer = privateKeyToAccount(PAYER_KEY)

export const intent: Intent = {
  payer: payer.address,
  recipient: '0x2222222222222222222222222222222222222222',
  sourceAsset: AUSD,
  targetAsset: GBPM,
  sourceAmount: 100_000_000n,
  quotedAmountOut: 73_900_000_000_000_000_000n,
  toleranceBps: 50,
  maxSpreadBps: 100,
  deadline: BigInt(NOW_SEC + 20 * 60),
  salt: '0x0000000000000000000000000000000000000000000000000000000000abcdef',
}
