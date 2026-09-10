import { describe, expect, it } from 'vitest'
import { domainSeparator, hashTypedData, keccak256, stringToBytes } from 'viem'
import { hashIntent, minAmountOut, type Intent } from '../src/intent'
import {
  RECEIVE_WITH_AUTHORIZATION_TYPES,
  cancelAuthorizationTypedData,
  receiveWithAuthorizationTypedData,
  tokenDomain,
} from '../src/erc3009'
import { MONAD_MAINNET_ID } from '../src/chains'
import { TOKENS } from '../src/addresses'

// Printed by contracts/test/IntentVector.t.sol (forge test --match-contract IntentVectorTest -vv).
const VECTOR = {
  chainId: 31337,
  router: '0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f',
  hash: '0x18bb71488e0532429aee289cd08f68fe217bffde4af348a2503807d6e4caa5be',
} as const

const intent: Intent = {
  payer: '0x1111111111111111111111111111111111111111',
  recipient: '0x2222222222222222222222222222222222222222',
  sourceAsset: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a',
  targetAsset: '0x39bb4E0a204412bB98e821d25e7d955e69d40Fd1',
  sourceAmount: 100_000_000n,
  quotedAmountOut: 73_900_000_000_000_000_000n,
  toleranceBps: 50,
  maxSpreadBps: 100,
  deadline: 1_789_000_000n,
  salt: '0x0000000000000000000000000000000000000000000000000000000000abcdef',
}

describe('intent hashing mirrors PayoutIntent.sol', () => {
  it('reproduces the Solidity vector bit for bit', () => {
    expect(hashIntent(intent, VECTOR.chainId, VECTOR.router)).toBe(VECTOR.hash)
  })

  it('changes with chain and router (domain binding)', () => {
    expect(hashIntent(intent, 143, VECTOR.router)).not.toBe(VECTOR.hash)
    expect(hashIntent(intent, VECTOR.chainId, '0x3333333333333333333333333333333333333333')).not.toBe(VECTOR.hash)
  })

  it('minAmountOut matches the contract formula', () => {
    expect(minAmountOut(intent)).toBe((73_900_000_000_000_000_000n * 9950n) / 10000n)
  })
})

describe('ERC-3009 typed data', () => {
  const AUSD = TOKENS[MONAD_MAINNET_ID].AUSD!.address
  const USDC = TOKENS[MONAD_MAINNET_ID].USDC!.address

  it('uses the canonical ReceiveWithAuthorization typehash', () => {
    const encoded =
      'ReceiveWithAuthorization(' +
      RECEIVE_WITH_AUTHORIZATION_TYPES.ReceiveWithAuthorization.map((f) => `${f.type} ${f.name}`).join(',') +
      ')'
    // Verified on-chain on AUSD and USDC (facts §14.4)
    expect(keccak256(stringToBytes(encoded))).toBe('0xd099cc98ef71107a616c4f0f941f04c322d8e254fe26b3c6668db87aae413de8')
  })

  it('AUSD domain separator matches the on-chain value', () => {
    // cast call AUSD "DOMAIN_SEPARATOR()" on 2026-09-10 (facts §14.4)
    expect(domainSeparator({ domain: tokenDomain(MONAD_MAINNET_ID, AUSD) })).toBe(
      '0x995063441ebf2219c94dce05014a545da4390d2362f99b3d7ad456046678cafe',
    )
  })

  it('builds a signable authorization with validAfter 0 and nonce = intentId', () => {
    const nonce = hashIntent(intent, MONAD_MAINNET_ID, VECTOR.router)
    const td = receiveWithAuthorizationTypedData(MONAD_MAINNET_ID, AUSD, {
      from: intent.payer,
      to: VECTOR.router,
      value: intent.sourceAmount,
      validAfter: 0n,
      validBefore: intent.deadline,
      nonce,
    })
    expect(td.domain.name).toBe('Agora Dollar')
    expect(() => hashTypedData(td)).not.toThrow()
    expect(() =>
      receiveWithAuthorizationTypedData(MONAD_MAINNET_ID, USDC, {
        from: intent.payer,
        to: VECTOR.router,
        value: 1n,
        validAfter: 1n,
        validBefore: 2n,
        nonce,
      }),
    ).toThrow(/validAfter/)
  })

  it('cancel typed data uses the token domain', () => {
    const td = cancelAuthorizationTypedData(MONAD_MAINNET_ID, USDC, intent.payer, intent.salt)
    expect(td.domain.name).toBe('USDC')
    expect(td.domain.version).toBe('2')
  })
})
