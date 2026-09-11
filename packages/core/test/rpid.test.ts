import { describe, expect, it } from 'vitest'
import { MONAD_MAINNET_ID, MONAD_TESTNET_ID } from '../src/chains'
import { RpIdMismatchError, assertRpIdForChain, isLoopbackRpId } from '../src/rpid'

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

  // A local fork of mainnet reports chain id 143 because it is a copy of mainnet, so the
  // chain id alone cannot distinguish the two and development would otherwise be
  // impossible without weakening the guard for everyone.
  it('lets a local fork use a loopback rpId, and nothing else', () => {
    expect(() => assertRpIdForChain(MONAD_MAINNET_ID, 'localhost', true)).not.toThrow()
    expect(() => assertRpIdForChain(MONAD_MAINNET_ID, '127.0.0.1', true)).not.toThrow()
    expect(() => assertRpIdForChain(MONAD_MAINNET_ID, '[::1]', true)).not.toThrow()
  })

  // The exemption needs BOTH conditions. Setting the flag on a real deployment must not
  // open the door, because a deployment is not served from a loopback host and a passkey
  // bound to one is reachable by nobody else.
  it('refuses a real domain even when a local fork is claimed', () => {
    expect(() => assertRpIdForChain(MONAD_MAINNET_ID, 'henad.vercel.app', true)).toThrow(RpIdMismatchError)
    expect(() => assertRpIdForChain(MONAD_MAINNET_ID, 'evil.example', true)).toThrow(RpIdMismatchError)
    // Lookalikes are not loopback: only the exact hosts count.
    expect(() => assertRpIdForChain(MONAD_MAINNET_ID, 'localhost.evil.example', true)).toThrow(RpIdMismatchError)
    expect(() => assertRpIdForChain(MONAD_MAINNET_ID, 'notlocalhost', true)).toThrow(RpIdMismatchError)
  })

  it('knows which hosts are loopback', () => {
    expect(isLoopbackRpId('localhost')).toBe(true)
    expect(isLoopbackRpId('127.0.0.1')).toBe(true)
    expect(isLoopbackRpId('localhost.evil.example')).toBe(false)
    expect(isLoopbackRpId('henad.xyz')).toBe(false)
  })
})
