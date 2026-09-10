import { describe, expect, it } from 'vitest'
import { MONAD_TESTNET_ID, TOKENS } from '@henad/core'
import {
  BUNDLER_METHODS,
  GAS_LIMIT_CAP,
  GAS_LIMIT_FLOOR,
  RELAY_MAX_DEADLINE_SEC,
  RateLimiter,
  clientIp,
  gasLimitFor,
  parseRelayBody,
  prepareBundlerRequest,
  relayableAssets,
} from '../relay'
import { toWire } from '../types'
import { AUSD, CHAIN_ID, GBPM, NOW_SEC, USDC, intent } from './fixture'

const SIG = `0x${'ab'.repeat(65)}` as const

function body(overrides: Record<string, unknown> = {}, signature: string = SIG) {
  return { chainId: CHAIN_ID, intent: { ...toWire(intent), ...overrides }, signature }
}

const ctx = { chainId: CHAIN_ID, nowSec: NOW_SEC }

describe('gasLimitFor (facts §14.5: Monad bills the limit)', () => {
  it('adds 10 % headroom, rounded up', () => {
    expect(gasLimitFor(1_300_000n)).toBe(1_430_000n)
    expect(gasLimitFor(1_300_001n)).toBe(1_430_002n)
  })
  it('never goes below the 1.4M floor', () => {
    expect(gasLimitFor(1_250_000n)).toBe(GAS_LIMIT_FLOOR)
    expect(gasLimitFor(0n)).toBe(1_400_000n)
  })
  it('caps at 1.6M', () => {
    expect(gasLimitFor(1_500_000n)).toBe(GAS_LIMIT_CAP)
    expect(gasLimitFor(1_500_000n)).toBe(1_600_000n)
    expect(gasLimitFor(10_000_000n)).toBe(1_600_000n)
  })
})

describe('parseRelayBody', () => {
  it('accepts a well-formed body and restores the bigint fields', () => {
    const parsed = parseRelayBody(body(), ctx)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.intent).toEqual(intent)
    expect(parsed.signature).toBe(SIG)
  })

  it('accepts USDC and lower-cased addresses, checksumming them', () => {
    const parsed = parseRelayBody(body({ sourceAsset: USDC.toLowerCase(), payer: intent.payer.toLowerCase() }), ctx)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.intent.sourceAsset).toBe(USDC)
    expect(parsed.intent.payer).toBe(intent.payer)
  })

  it('tolerates a missing chainId but rejects a wrong one', () => {
    const { intent: wire, signature } = body()
    expect(parseRelayBody({ intent: wire, signature }, ctx).ok).toBe(true)
    expect(parseRelayBody({ intent: wire, signature, chainId: MONAD_TESTNET_ID }, ctx)).toMatchObject({ ok: false, status: 400, error: /chainId/ })
  })

  it('rejects deadlines that are past or more than 30 minutes out', () => {
    expect(parseRelayBody(body({ deadline: String(NOW_SEC) }), ctx)).toMatchObject({ ok: false, error: /already passed/ })
    expect(parseRelayBody(body({ deadline: String(NOW_SEC + RELAY_MAX_DEADLINE_SEC + 1) }), ctx)).toMatchObject({ ok: false, error: /30 minutes/ })
    expect(parseRelayBody(body({ deadline: String(NOW_SEC + RELAY_MAX_DEADLINE_SEC) }), ctx).ok).toBe(true)
    expect(parseRelayBody(body({ deadline: 'soon' }), ctx)).toMatchObject({ ok: false, error: /deadline/ })
    expect(parseRelayBody(body({ deadline: 1_789_001_200 }), ctx)).toMatchObject({ ok: false, error: /deadline/ })
  })

  it('rejects source assets other than AUSD and USDC on the chain', () => {
    expect(parseRelayBody(body({ sourceAsset: GBPM }), ctx)).toMatchObject({ ok: false, error: /source asset/ })
    expect(parseRelayBody(body({ sourceAsset: TOKENS[MONAD_TESTNET_ID].AUSD!.address }), ctx)).toMatchObject({ ok: false, error: /source asset/ })
    expect(relayableAssets(CHAIN_ID)).toEqual([AUSD, USDC])
  })

  it('rejects malformed fields', () => {
    expect(parseRelayBody(null, ctx)).toMatchObject({ ok: false, status: 400 })
    expect(parseRelayBody([], ctx)).toMatchObject({ ok: false })
    expect(parseRelayBody({ signature: SIG }, ctx)).toMatchObject({ ok: false, error: /intent/ })
    expect(parseRelayBody(body({}, '0x1234'), ctx).ok).toBe(false)
    expect(parseRelayBody(body({}, 'not-hex'), ctx)).toMatchObject({ ok: false, error: /signature/ })
    expect(parseRelayBody(body({ payer: '0x123' }), ctx)).toMatchObject({ ok: false, error: /payer/ })
    expect(parseRelayBody(body({ sourceAmount: '0' }), ctx)).toMatchObject({ ok: false, error: /positive/ })
    expect(parseRelayBody(body({ sourceAmount: '-1' }), ctx)).toMatchObject({ ok: false, error: /sourceAmount/ })
    expect(parseRelayBody(body({ sourceAmount: 100 }), ctx)).toMatchObject({ ok: false, error: /sourceAmount/ })
    expect(parseRelayBody(body({ quotedAmountOut: '1e18' }), ctx)).toMatchObject({ ok: false, error: /quotedAmountOut/ })
    expect(parseRelayBody(body({ toleranceBps: 10_001 }), ctx)).toMatchObject({ ok: false, error: /toleranceBps/ })
    expect(parseRelayBody(body({ maxSpreadBps: '50' }), ctx)).toMatchObject({ ok: false, error: /maxSpreadBps/ })
    expect(parseRelayBody(body({ salt: '0x00' }), ctx)).toMatchObject({ ok: false, error: /salt/ })
    expect(parseRelayBody(body({ deadline: String((1n << 64n).toString()) }), ctx)).toMatchObject({ ok: false, error: /range/ })
  })
})

describe('RateLimiter', () => {
  it('allows the limit within a window, then refuses until the window rolls', () => {
    const limiter = new RateLimiter(10, 60_000)
    const t0 = 1_000_000
    for (let i = 0; i < 10; i++) expect(limiter.allow('1.2.3.4', t0 + i)).toBe(true)
    expect(limiter.allow('1.2.3.4', t0 + 11)).toBe(false)
    expect(limiter.allow('5.6.7.8', t0 + 11)).toBe(true)
    expect(limiter.allow('1.2.3.4', t0 + 60_000)).toBe(true)
  })

  it('reads the client address from proxy headers', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }))).toBe('9.9.9.9')
    expect(clientIp(new Headers({ 'x-real-ip': '8.8.8.8' }))).toBe('8.8.8.8')
    expect(clientIp(new Headers())).toBe('unknown')
  })
})

describe('prepareBundlerRequest', () => {
  const policy = 'sp_test_policy'

  it('allows exactly the documented methods', () => {
    expect([...BUNDLER_METHODS].sort()).toEqual(
      [
        'eth_estimateUserOperationGas',
        'eth_sendUserOperation',
        'eth_getUserOperationReceipt',
        'pm_getPaymasterStubData',
        'pm_getPaymasterData',
        'pm_sponsorUserOperation',
        'eth_supportedEntryPoints',
        'pimlico_getUserOperationGasPrice',
      ].sort(),
    )
    const ok = prepareBundlerRequest({ jsonrpc: '2.0', id: 1, method: 'eth_supportedEntryPoints', params: [] }, policy)
    expect(ok).toEqual({ ok: true, payload: { jsonrpc: '2.0', id: 1, method: 'eth_supportedEntryPoints', params: [] } })
    expect(prepareBundlerRequest({ jsonrpc: '2.0', id: 2, method: 'eth_sendRawTransaction', params: ['0x'] }, policy)).toMatchObject({
      ok: false,
      status: 403,
      id: 2,
      error: /eth_sendRawTransaction/,
    })
    expect(prepareBundlerRequest({ method: 'eth_supportedEntryPoints' }, policy)).toMatchObject({ ok: false, status: 400 })
    expect(prepareBundlerRequest('x', policy)).toMatchObject({ ok: false, status: 400 })
    expect(prepareBundlerRequest([], policy)).toMatchObject({ ok: false, status: 400 })
  })

  it('stamps the sponsorship policy onto paymaster calls only', () => {
    const userOp = { sender: intent.payer }
    const stub = prepareBundlerRequest({ jsonrpc: '2.0', id: 3, method: 'pm_getPaymasterStubData', params: [userOp, '0xEP', '0x8f'] }, policy)
    expect(stub).toMatchObject({ ok: true, payload: { params: [userOp, '0xEP', '0x8f', { sponsorshipPolicyId: policy }] } })

    const data = prepareBundlerRequest(
      { jsonrpc: '2.0', id: 4, method: 'pm_getPaymasterData', params: [userOp, '0xEP', '0x8f', { validUntil: 1 }] },
      policy,
    )
    expect(data).toMatchObject({ ok: true, payload: { params: [userOp, '0xEP', '0x8f', { validUntil: 1, sponsorshipPolicyId: policy }] } })

    const sponsor = prepareBundlerRequest({ jsonrpc: '2.0', id: 5, method: 'pm_sponsorUserOperation', params: [userOp, '0xEP'] }, policy)
    expect(sponsor).toMatchObject({ ok: true, payload: { params: [userOp, '0xEP', { sponsorshipPolicyId: policy }] } })

    const send = prepareBundlerRequest({ jsonrpc: '2.0', id: 6, method: 'eth_sendUserOperation', params: [userOp, '0xEP'] }, policy)
    expect(send).toMatchObject({ ok: true, payload: { params: [userOp, '0xEP'] } })

    const none = prepareBundlerRequest({ jsonrpc: '2.0', id: 7, method: 'pm_sponsorUserOperation', params: [userOp, '0xEP'] }, undefined)
    expect(none).toMatchObject({ ok: true, payload: { params: [userOp, '0xEP'] } })
  })

  it('handles batches as a unit', () => {
    const batch = [
      { jsonrpc: '2.0', id: 1, method: 'pimlico_getUserOperationGasPrice', params: [] },
      { jsonrpc: '2.0', id: 2, method: 'pm_getPaymasterStubData', params: [{}, '0xEP', '0x8f'] },
    ]
    const prepared = prepareBundlerRequest(batch, policy)
    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return
    expect(Array.isArray(prepared.payload)).toBe(true)
    expect(prepared.payload).toMatchObject([{ id: 1 }, { id: 2, params: [{}, '0xEP', '0x8f', { sponsorshipPolicyId: policy }] }])
    expect(prepareBundlerRequest([...batch, { jsonrpc: '2.0', id: 3, method: 'eth_call', params: [] }], policy)).toMatchObject({ ok: false, status: 403, id: 3 })
  })
})
