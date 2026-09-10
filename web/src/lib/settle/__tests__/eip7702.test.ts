import { describe, expect, it } from 'vitest'
import { decodeFunctionData, getAddress, type Hex } from 'viem'
import { corridorRouterAbi, erc20Abi } from '@henad/core'
import { ENTRY_POINT_V08, SIMPLE_7702_ACCOUNT } from '../config'
import { classify7702Error, encodeSettleBatch, executeBatchAbi, isDelegatedTo, settleCalls } from '../eip7702'
import { SettleError } from '../errors'
import { ROUTER, intent } from './fixture'

describe('addresses (facts §13.2, §14.4)', () => {
  it('pins Simple7702Account and EntryPoint v0.8, checksummed', () => {
    expect(SIMPLE_7702_ACCOUNT).toBe('0xe6Cae83BdE06E4c305530e199D7217f42808555B')
    expect(ENTRY_POINT_V08).toBe(getAddress('0x4337084d9e255ff0702461cf8895ce9e3b5ff108'))
  })
})

describe('encodeSettleBatch', () => {
  it('encodes executeBatch([approve(router, amount), settle(intent)]) in that order', () => {
    const callData = encodeSettleBatch(intent, ROUTER)
    const decoded = decodeFunctionData({ abi: executeBatchAbi, data: callData })
    expect(decoded.functionName).toBe('executeBatch')
    const calls = decoded.args[0]
    expect(calls).toHaveLength(2)

    const [approve, settle] = calls
    expect(approve!.target).toBe(intent.sourceAsset)
    expect(approve!.value).toBe(0n)
    expect(decodeFunctionData({ abi: erc20Abi, data: approve!.data })).toEqual({ functionName: 'approve', args: [ROUTER, intent.sourceAmount] })

    expect(settle!.target).toBe(ROUTER)
    expect(settle!.value).toBe(0n)
    const settleCall = decodeFunctionData({ abi: corridorRouterAbi, data: settle!.data })
    expect(settleCall.functionName).toBe('settle')
    expect(settleCall.args).toEqual([intent])
  })

  it('settleCalls carries no MON value, so the 10 MON reserve rule never triggers', () => {
    for (const call of settleCalls(intent, ROUTER)) expect(call.value).toBe(0n)
  })
})

describe('isDelegatedTo', () => {
  it('recognises the 0xef0100 designator for our delegate only', () => {
    const ours = `0xef0100${SIMPLE_7702_ACCOUNT.slice(2)}` as Hex
    expect(isDelegatedTo(ours, SIMPLE_7702_ACCOUNT)).toBe(true)
    expect(isDelegatedTo(ours.toLowerCase() as Hex, SIMPLE_7702_ACCOUNT)).toBe(true)
    expect(isDelegatedTo(`0xef0100${'11'.repeat(20)}`, SIMPLE_7702_ACCOUNT)).toBe(false)
    expect(isDelegatedTo('0x6080604052', SIMPLE_7702_ACCOUNT)).toBe(false)
    expect(isDelegatedTo(undefined, SIMPLE_7702_ACCOUNT)).toBe(false)
  })
})

describe('classify7702Error', () => {
  it('passes SettleErrors through untouched', () => {
    const err = new SettleError('pending', 'waiting')
    expect(classify7702Error(err)).toBe(err)
  })

  it('treats a decodable venue or router revert as an intent failure (no fallback)', () => {
    const rpc = Object.assign(new Error('UserOperation reverted during simulation'), { details: 'reverted with reason: 0xa407143a' })
    const classified = classify7702Error(new Error('send failed', { cause: rpc }))
    expect(classified.kind).toBe('intent')
    expect(classified.path).toBe('eip7702')
    expect(classified.decoded?.name).toBe('FXMarketClosed')
    expect(classified.message).toBe('The FX market is closed for this corridor.')
  })

  it('treats paymaster and policy refusals as sponsorship failures', () => {
    const classified = classify7702Error(new Error('Sponsorship policy sp_x rejected this user operation'))
    expect(classified.kind).toBe('sponsorship')
    expect(classified.message).toMatch(/^Sponsorship refused: /)
    expect(classify7702Error(Object.assign(new Error('AA33 reverted'), { details: 'paymaster validation failed' })).kind).toBe('sponsorship')
  })

  it('treats everything else as a bundler failure', () => {
    const classified = classify7702Error(new Error('HTTP request failed. Status: 502'))
    expect(classified.kind).toBe('bundler')
    expect(classified.message).toBe('Bundler error: HTTP request failed. Status: 502')
    expect(classify7702Error('oops').kind).toBe('bundler')
  })
})
