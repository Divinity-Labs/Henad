import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hashIntent } from '@henad/core'

vi.mock('../erc3009', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../erc3009')>()),
  settleViaErc3009: vi.fn(),
}))
vi.mock('../eip7702', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../eip7702')>()),
  settleViaEip7702: vi.fn(),
}))

import { settleViaErc3009 } from '../erc3009'
import { settleViaEip7702 } from '../eip7702'
import { SettleError, chooseGasPath, gasPathFromEnv, settle, type SettleAccount, type SettleResult } from '../index'
import { CHAIN_ID, ROUTER, TX_HASH, intent, payer } from './fixture'

const relay = vi.mocked(settleViaErc3009)
const sponsored = vi.mocked(settleViaEip7702)

const withAuthorization: SettleAccount = payer
const withoutAuthorization: SettleAccount = { address: payer.address, signTypedData: (td) => payer.signTypedData(td) }

const intentId = hashIntent(intent, CHAIN_ID, ROUTER)
const relayed: SettleResult = { intentId, txHash: TX_HASH, path: 'erc3009' }
const sponsoredResult: SettleResult = { intentId, txHash: TX_HASH, path: 'eip7702' }
const opts = { chainId: CHAIN_ID, router: ROUTER } as const

beforeEach(() => {
  relay.mockReset()
  sponsored.mockReset()
  relay.mockResolvedValue(relayed)
  sponsored.mockResolvedValue(sponsoredResult)
})

describe('gas path selection', () => {
  it('reads NEXT_PUBLIC_GAS_PATH with 7702 as the default', () => {
    expect(gasPathFromEnv(undefined)).toBe('eip7702')
    expect(gasPathFromEnv('7702')).toBe('eip7702')
    expect(gasPathFromEnv('3009')).toBe('erc3009')
    expect(gasPathFromEnv(' 3009 ')).toBe('erc3009')
  })

  it('sponsors only accounts that can sign a 7702 authorization', () => {
    expect(chooseGasPath(withAuthorization, 'eip7702')).toBe('eip7702')
    expect(chooseGasPath(withoutAuthorization, 'eip7702')).toBe('erc3009')
    expect(chooseGasPath(withAuthorization, 'erc3009')).toBe('erc3009')
  })
})

describe('settle', () => {
  it('uses the sponsored path first and returns its result', async () => {
    await expect(settle(intent, withAuthorization, opts)).resolves.toEqual(sponsoredResult)
    expect(sponsored).toHaveBeenCalledWith(intent, withAuthorization, opts)
    expect(relay).not.toHaveBeenCalled()
  })

  it('relays directly when the account cannot sign authorizations', async () => {
    await expect(settle(intent, withoutAuthorization, opts)).resolves.toEqual(relayed)
    expect(sponsored).not.toHaveBeenCalled()
    expect(relay).toHaveBeenCalledTimes(1)
  })

  it('honours an explicit path', async () => {
    await expect(settle(intent, withAuthorization, { ...opts, path: 'erc3009' })).resolves.toEqual(relayed)
    expect(sponsored).not.toHaveBeenCalled()
  })

  it.each(['sponsorship', 'bundler', 'account'] as const)('falls back to the relayer once after a %s failure', async (kind) => {
    sponsored.mockRejectedValueOnce(new SettleError(kind, `${kind} failed`, { path: 'eip7702' }))
    await expect(settle(intent, withAuthorization, opts)).resolves.toEqual(relayed)
    expect(sponsored).toHaveBeenCalledTimes(1)
    expect(relay).toHaveBeenCalledTimes(1)
  })

  it.each(['intent', 'pending'] as const)('does not fall back after a %s failure', async (kind) => {
    sponsored.mockRejectedValueOnce(new SettleError(kind, `${kind} failed`, { path: 'eip7702' }))
    await expect(settle(intent, withAuthorization, opts)).rejects.toMatchObject({ kind, path: 'eip7702' })
    expect(relay).not.toHaveBeenCalled()
  })

  it('does not fall back when the caller pinned the sponsored path', async () => {
    sponsored.mockRejectedValueOnce(new SettleError('sponsorship', 'refused', { path: 'eip7702' }))
    await expect(settle(intent, withAuthorization, { ...opts, path: 'eip7702' })).rejects.toMatchObject({ kind: 'sponsorship' })
    expect(relay).not.toHaveBeenCalled()
  })

  it('does not fall back on unknown errors', async () => {
    sponsored.mockRejectedValueOnce(new TypeError('unexpected'))
    await expect(settle(intent, withAuthorization, opts)).rejects.toBeInstanceOf(TypeError)
    expect(relay).not.toHaveBeenCalled()
  })

  it('reports both failures when the fallback fails too', async () => {
    sponsored.mockRejectedValueOnce(new SettleError('sponsorship', 'policy refused', { path: 'eip7702' }))
    relay.mockRejectedValueOnce(new SettleError('config', 'relayer unset', { path: 'erc3009' }))
    const error = await settle(intent, withAuthorization, opts).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SettleError)
    expect(error).toMatchObject({ kind: 'config', path: 'erc3009', message: 'relayer unset (sponsored path failed first: policy refused)' })
    expect((error as SettleError).cause).toMatchObject({ kind: 'sponsorship' })
  })
})
