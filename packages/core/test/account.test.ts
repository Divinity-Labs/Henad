import { describe, expect, it } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { bytesToHex } from 'viem'
import { ETH_DERIVATION_PATH, privateKeyFromPrfOutput } from '../src/account'

/**
 * These vectors are the contract between the web app and the mobile app.
 *
 * The same passkey must derive the same address on both, because it is the same
 * account holding the same money. WebAuthn guarantees the PRF output is identical
 * across platforms for a given credential and salt; everything after that is this
 * function, and nothing in the product would warn you if it drifted. A person would
 * simply sign in on their phone and find an empty wallet.
 *
 * So if a change here makes these fail, the change is wrong, however reasonable it
 * looks. There is no migration available: the authenticator cannot be asked to produce
 * different bytes, so a different derivation means every existing account is gone.
 */
const ZERO_PRF = () => new Uint8Array(32)
const COUNTING_PRF = () => Uint8Array.from({ length: 32 }, (_, i) => i + 1)

describe('passkey account derivation', () => {
  it('derives the pinned key for 32 zero bytes', () => {
    // BIP-39 maps all-zero entropy to the canonical "abandon abandon … art" mnemonic,
    // which is a published vector rather than something we produced, so this asserts
    // the whole chain and not merely that the code agrees with itself.
    const key = privateKeyFromPrfOutput(ZERO_PRF())
    expect(bytesToHex(key)).toBe('0x1053fae1b3ac64f178bcc21026fd06a3f4544ec2f35338b001f02d1d8efa3d5f')
    expect(privateKeyToAccount(bytesToHex(key)).address).toBe('0xF278cF59F82eDcf871d630F28EcC8056f25C1cdb')
  })

  it('derives the pinned key for a second vector', () => {
    const key = privateKeyFromPrfOutput(COUNTING_PRF())
    expect(bytesToHex(key)).toBe('0x7c56100e187f2845a35ce856646662dfc2024be2b4a150b45ad1f62564617128')
    expect(privateKeyToAccount(bytesToHex(key)).address).toBe('0x50B240678777451BEfd67B7e8c3b4366482ba8F9')
  })

  it('is deterministic', () => {
    expect(bytesToHex(privateKeyFromPrfOutput(COUNTING_PRF()))).toBe(bytesToHex(privateKeyFromPrfOutput(COUNTING_PRF())))
  })

  it('uses the standard Ethereum account path', () => {
    // Named so a reader does not have to trust a comment, and so changing it is loud.
    expect(ETH_DERIVATION_PATH).toBe("m/44'/60'/0'/0/0")
  })

  it('zeroes the PRF output it was given', () => {
    // The caller's copy reconstructs the private key, so leaving it alive in memory
    // would defeat the point of never persisting the key.
    const prf = COUNTING_PRF()
    privateKeyFromPrfOutput(prf)
    expect([...prf]).toEqual(new Array(32).fill(0))
  })

  it('refuses a wrong-sized output, and still zeroes it', () => {
    const short = Uint8Array.from({ length: 16 }, (_, i) => i + 1)
    expect(() => privateKeyFromPrfOutput(short)).toThrow(/32 bytes/)
    expect([...short]).toEqual(new Array(16).fill(0))
  })
})
