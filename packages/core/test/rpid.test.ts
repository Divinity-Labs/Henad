import { describe, expect, it } from 'vitest'
import { MONAD_MAINNET_ID, MONAD_TESTNET_ID } from '../src/chains'
import { RpIdMismatchError, assertRpIdForChain } from '../src/rpid'

describe('rpId guard', () => {
  it('allows any rpId on testnet', () => {
    expect(() => assertRpIdForChain(MONAD_TESTNET_ID, 'henad.vercel.app')).not.toThrow()
    expect(() => assertRpIdForChain(MONAD_TESTNET_ID, 'localhost')).not.toThrow()
  })

  it('allows only henad.xyz on mainnet', () => {
    expect(() => assertRpIdForChain(MONAD_MAINNET_ID, 'henad.xyz')).not.toThrow()
    expect(() => assertRpIdForChain(MONAD_MAINNET_ID, 'henad.vercel.app')).toThrow(RpIdMismatchError)
    expect(() => assertRpIdForChain(MONAD_MAINNET_ID, 'localhost')).toThrow(RpIdMismatchError)
  })
})
