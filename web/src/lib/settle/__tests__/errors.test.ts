import { describe, expect, it } from 'vitest'
import { encodeErrorResult, toFunctionSelector, type Hex } from 'viem'
import { corridorRouterAbi, hashIntent } from '@henad/core'
import { FALLBACK_KINDS, SettleError, VENUE_ERROR_SELECTORS, decodeSettleError, reasonFromReceipt, revertDataOf } from '../errors'
import { CHAIN_ID, ROUTER, intent } from './fixture'

const FACTS_14_1 = [
  ['Expired', '0x203d82d8', 'mento'],
  ['InsufficientOutputAmount', '0x42301c23', 'mento'],
  ['PoolDoesNotExist', '0x9c8787c0', 'mento'],
  ['FXMarketClosed', '0xa407143a', 'oracle'],
  ['TradingSuspended', '0x4ac30c22', 'oracle'],
  ['NoRecentRate', '0xeb0d3e81', 'oracle'],
  ['InvalidRate', '0x6a43f8d1', 'oracle'],
  ['InsufficientLiquidity', '0xbb55fd27', 'fpmm'],
  ['InvalidToAddress', '0x8aa3a72f', 'fpmm'],
  ['L0LimitExceeded', '0x493e48f0', 'fpmm'],
  ['L1LimitExceeded', '0x91336c69', 'fpmm'],
  ['InsufficientInputAmount', '0x098fb561', 'fpmm'],
] as const

describe('decodeSettleError', () => {
  it.each(FACTS_14_1)('maps %s (%s) to a %s error with a readable message', (name, selector, source) => {
    expect(toFunctionSelector(`${name}()`)).toBe(selector)
    const decoded = decodeSettleError(selector)
    expect(decoded.name).toBe(name)
    expect(decoded.source).toBe(source)
    expect(decoded.selector).toBe(selector)
    expect(decoded.message).toMatch(/^[A-Z].*\.$/)
  })

  it('covers exactly the selectors listed in facts §14.1', () => {
    expect(Object.keys(VENUE_ERROR_SELECTORS).sort()).toEqual(FACTS_14_1.map(([, s]) => s).sort())
  })

  it('still decodes when the venue selector carries trailing bytes', () => {
    expect(decodeSettleError(`0xa407143a${'00'.repeat(32)}`).name).toBe('FXMarketClosed')
  })

  it('decodes router errors and formats their arguments', () => {
    const spread = encodeErrorResult({ abi: corridorRouterAbi, errorName: 'SpreadTooWide', args: [35n, 20] })
    expect(decodeSettleError(spread)).toMatchObject({ name: 'SpreadTooWide', source: 'router', message: 'Spread of 35 bps exceeds the 20 bps you allowed.' })

    const intentId = hashIntent(intent, CHAIN_ID, ROUTER)
    const used = encodeErrorResult({ abi: corridorRouterAbi, errorName: 'AuthorizationUsed', args: [intentId] })
    expect(decodeSettleError(used)).toMatchObject({ name: 'AuthorizationUsed', source: 'router', args: [intentId] })

    const delivery = encodeErrorResult({ abi: corridorRouterAbi, errorName: 'InsufficientDelivery', args: [1n, 2n] })
    expect(decodeSettleError(delivery).message).toBe('Delivered 1 but the intent requires at least 2.')

    const generic = encodeErrorResult({ abi: corridorRouterAbi, errorName: 'NoRoute', args: [intent.sourceAsset, intent.targetAsset] })
    expect(decodeSettleError(generic).message).toBe(`NoRoute(${intent.sourceAsset}, ${intent.targetAsset})`)
  })

  it('decodes Error(string) and Panic(uint256)', () => {
    const reason = encodeErrorResult({
      abi: [{ type: 'error', name: 'Error', inputs: [{ type: 'string' }] }],
      errorName: 'Error',
      args: ['ERC20: transfer amount exceeds balance'],
    })
    expect(decodeSettleError(reason)).toMatchObject({ name: 'Error', source: 'solidity', message: 'ERC20: transfer amount exceeds balance' })

    const panic = encodeErrorResult({ abi: [{ type: 'error', name: 'Panic', inputs: [{ type: 'uint256' }] }], errorName: 'Panic', args: [0x11n] })
    expect(decodeSettleError(panic)).toMatchObject({ name: 'Panic', source: 'solidity', message: 'Panic: arithmetic overflow or underflow.' })
  })

  it('never throws on unknown or empty data', () => {
    expect(decodeSettleError('0xdeadbeef')).toMatchObject({ name: 'Unknown', source: 'unknown', message: 'Reverted with unknown selector 0xdeadbeef.' })
    expect(decodeSettleError('0x')).toMatchObject({ name: 'Unknown', source: 'unknown' })
    expect(decodeSettleError('0x08c379a0')).toMatchObject({ name: 'Error', source: 'solidity' })
  })
})

describe('revertDataOf', () => {
  it('reads structured data anywhere in the cause chain', () => {
    const rpc = Object.assign(new Error('execution reverted'), { code: 3, data: '0xa407143a' as Hex })
    const wrapped = new Error('call failed', { cause: new Error('middle', { cause: rpc }) })
    expect(revertDataOf(wrapped)).toBe('0xa407143a')
  })

  it('reads nested { data: { data } } shapes', () => {
    expect(revertDataOf({ data: { data: '0x4ac30c22' } })).toBe('0x4ac30c22')
    expect(revertDataOf({ data: { revertData: '0xeb0d3e81' } })).toBe('0xeb0d3e81')
  })

  it('scans bundler details text, but never a viem message with request arguments', () => {
    const bundler = Object.assign(new Error('UserOperation reverted during simulation'), {
      details: 'UserOperation reverted during simulation with reason: 0x42301c23',
    })
    expect(revertDataOf(bundler)).toBe('0x42301c23')

    const viemLike = {
      shortMessage: 'Execution reverted',
      message: 'Execution reverted.\nRequest Arguments:\n  data: 0x1234567890abcdef',
      cause: { code: 3, data: '0xeb0d3e81' },
    }
    expect(revertDataOf(viemLike)).toBe('0xeb0d3e81')
    expect(revertDataOf({ shortMessage: 'x', message: 'data: 0x1234567890abcdef' })).toBeUndefined()
    expect(revertDataOf(new Error('plain 0x9c8787c0 in text'))).toBe('0x9c8787c0')
    expect(revertDataOf(new Error('nothing here'))).toBeUndefined()
    expect(revertDataOf(null)).toBeUndefined()
  })
})

describe('reasonFromReceipt', () => {
  it('decodes hex reasons, embedded hex and passes through plain text', () => {
    expect(reasonFromReceipt('0xa407143a')?.name).toBe('FXMarketClosed')
    expect(reasonFromReceipt('reverted: 0x6a43f8d1')?.name).toBe('InvalidRate')
    expect(reasonFromReceipt('out of gas')).toMatchObject({ name: 'Reverted', message: 'out of gas' })
    expect(reasonFromReceipt(undefined)).toBeUndefined()
  })
})

describe('SettleError', () => {
  it('keeps kind, path and cause; only sponsorship, bundler and account failures may fall back', () => {
    const cause = new Error('boom')
    const err = new SettleError('sponsorship', 'refused', { path: 'eip7702', cause })
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('SettleError')
    expect(err.cause).toBe(cause)
    expect([...FALLBACK_KINDS].sort()).toEqual(['account', 'bundler', 'sponsorship'])
    expect(FALLBACK_KINDS.has('intent')).toBe(false)
    expect(FALLBACK_KINDS.has('pending')).toBe(false)
  })
})
