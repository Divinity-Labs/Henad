import { afterEach, describe, expect, it, vi } from 'vitest'
import { recoverTypedDataAddress } from 'viem'
import { hashIntent } from '@henad/core'
import { receiveAuthorizationFor, settleViaErc3009 } from '../erc3009'
import { SettleError } from '../errors'
import type { RelayRequest, SettleAccount } from '../types'
import { AUSD, CHAIN_ID, ROUTER, TX_HASH, intent, payer } from './fixture'

// A viem LocalAccount must satisfy SettleAccount without adaptation (Mera returns one).
const account: SettleAccount = payer

describe('receiveAuthorizationFor', () => {
  it('binds the authorization to the intent: nonce = hashIntent under the router domain', () => {
    const { intentId, typedData } = receiveAuthorizationFor(intent, CHAIN_ID, ROUTER)
    expect(intentId).toBe(hashIntent(intent, CHAIN_ID, ROUTER))
    expect(typedData.primaryType).toBe('ReceiveWithAuthorization')
    expect(typedData.domain).toMatchObject({ name: 'Agora Dollar', version: '1', chainId: CHAIN_ID, verifyingContract: AUSD })
    expect(typedData.message).toEqual({
      from: intent.payer,
      to: ROUTER,
      value: intent.sourceAmount,
      validAfter: 0n,
      validBefore: intent.deadline,
      nonce: intentId,
    })
  })

  it('changes with the router, so a signature cannot be replayed against another deployment', () => {
    const a = receiveAuthorizationFor(intent, CHAIN_ID, ROUTER).typedData.message.nonce
    const b = receiveAuthorizationFor(intent, CHAIN_ID, '0x3333333333333333333333333333333333333333').typedData.message.nonce
    expect(a).not.toBe(b)
  })
})

describe('settleViaErc3009', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('signs, posts the intent with bigints as strings and returns the relayer hashes', async () => {
    const intentId = hashIntent(intent, CHAIN_ID, ROUTER)
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ intentId, txHash: TX_HASH }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await settleViaErc3009(intent, account, { chainId: CHAIN_ID, router: ROUTER })

    expect(result).toEqual({ intentId, txHash: TX_HASH, path: 'erc3009' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/relay')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json')

    const body = JSON.parse(String(init?.body)) as RelayRequest
    expect(body.chainId).toBe(CHAIN_ID)
    expect(body.intent).toEqual({
      payer: intent.payer,
      recipient: intent.recipient,
      sourceAsset: intent.sourceAsset,
      targetAsset: intent.targetAsset,
      sourceAmount: '100000000',
      quotedAmountOut: '73900000000000000000',
      toleranceBps: 50,
      maxSpreadBps: 100,
      deadline: intent.deadline.toString(),
      salt: intent.salt,
    })

    const { typedData } = receiveAuthorizationFor(intent, CHAIN_ID, ROUTER)
    expect(await recoverTypedDataAddress({ ...typedData, signature: body.signature })).toBe(payer.address)
  })

  it('honours a custom relay URL', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ intentId: hashIntent(intent, CHAIN_ID, ROUTER), txHash: TX_HASH }))
    vi.stubGlobal('fetch', fetchMock)
    await settleViaErc3009(intent, account, { chainId: CHAIN_ID, router: ROUTER, relayUrl: 'https://henad.example/api/relay' })
    expect(fetchMock.mock.calls[0]![0]).toBe('https://henad.example/api/relay')
  })

  it('maps relayer error codes onto SettleError kinds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () =>
        Response.json({ error: 'The FX market is closed for this corridor.', code: 'intent', reason: { name: 'FXMarketClosed', source: 'oracle' } }, { status: 422 }),
      ),
    )
    await expect(settleViaErc3009(intent, account, { chainId: CHAIN_ID, router: ROUTER })).rejects.toMatchObject({
      name: 'SettleError',
      kind: 'intent',
      path: 'erc3009',
      message: 'The FX market is closed for this corridor.',
    })

    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ error: 'relayer unset', code: 'config' }, { status: 503 })))
    await expect(settleViaErc3009(intent, account, { chainId: CHAIN_ID, router: ROUTER })).rejects.toMatchObject({ kind: 'config' })

    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response('<html>bad gateway</html>', { status: 502 })))
    await expect(settleViaErc3009(intent, account, { chainId: CHAIN_ID, router: ROUTER })).rejects.toMatchObject({ kind: 'relayer', message: /502/ })
  })

  it('reports an unreachable relayer as a relayer error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => {
        throw new TypeError('fetch failed')
      }),
    )
    const error = await settleViaErc3009(intent, account, { chainId: CHAIN_ID, router: ROUTER }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SettleError)
    expect((error as SettleError).kind).toBe('relayer')
  })
})
