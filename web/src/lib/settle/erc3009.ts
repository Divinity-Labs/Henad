import type { Address } from 'viem'
import { hashIntent, receiveWithAuthorizationTypedData, type Intent, type MonadChainId } from '@henad/core'
import { DEFAULT_RELAY_URL } from './config'
import { SettleError, type SettleErrorKind } from './errors'
import { toWire, type RelayErrorResponse, type RelayRequest, type RelayResponse, type SettleAccount, type SettleOptions, type SettleResult } from './types'

/**
 * PATH A — ERC-3009 `receiveWithAuthorization` submitted by our relayer
 * (facts §13.3, §14.4, CONTRACTS-SPEC "The settlement flow").
 *
 * The payer signs one ReceiveWithAuthorization under the token's domain with
 * `to` = CorridorRouter, `validAfter` = 0, `validBefore` = the intent deadline
 * and `nonce` = intentId. The router recomputes the intentId from the intent it
 * receives, so this single signature binds every field of the intent.
 */

/** The typed data the payer signs, plus the intentId it is bound to. */
export function receiveAuthorizationFor(intent: Intent, chainId: MonadChainId, router: Address) {
  const intentId = hashIntent(intent, chainId, router)
  const typedData = receiveWithAuthorizationTypedData(chainId, intent.sourceAsset, {
    from: intent.payer,
    to: router,
    value: intent.sourceAmount,
    validAfter: 0n,
    validBefore: intent.deadline,
    nonce: intentId,
  })
  return { intentId, typedData }
}

const CODE_TO_KIND: Record<RelayErrorResponse['code'], SettleErrorKind> = {
  bad_request: 'relayer',
  rate_limit: 'relayer',
  config: 'config',
  intent: 'intent',
  relayer: 'relayer',
}

function isRelayError(value: unknown): value is RelayErrorResponse {
  return !!value && typeof value === 'object' && typeof (value as RelayErrorResponse).error === 'string'
}

function isRelayResponse(value: unknown): value is RelayResponse {
  return !!value && typeof value === 'object' && typeof (value as RelayResponse).txHash === 'string' && typeof (value as RelayResponse).intentId === 'string'
}

/** Sign the authorization and hand it to /api/relay. Resolves as soon as the relayer has a tx hash. */
export async function settleViaErc3009(
  intent: Intent,
  account: SettleAccount,
  opts: Pick<SettleOptions, 'chainId' | 'router' | 'relayUrl'>,
): Promise<SettleResult> {
  const { intentId, typedData } = receiveAuthorizationFor(intent, opts.chainId, opts.router)
  const signature = await account.signTypedData(typedData)
  const body: RelayRequest = { chainId: opts.chainId, intent: toWire(intent), signature }

  let res: Response
  try {
    res = await fetch(opts.relayUrl ?? DEFAULT_RELAY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (cause) {
    throw new SettleError('relayer', 'Could not reach the relayer.', { path: 'erc3009', cause })
  }

  const json: unknown = await res.json().catch(() => null)
  if (res.ok && isRelayResponse(json)) {
    if (json.intentId.toLowerCase() !== intentId.toLowerCase()) {
      throw new SettleError('relayer', 'The relayer answered for a different intent.', { path: 'erc3009' })
    }
    return { intentId, txHash: json.txHash, path: 'erc3009' }
  }
  if (isRelayError(json)) {
    throw new SettleError(CODE_TO_KIND[json.code] ?? 'relayer', json.error, { path: 'erc3009' })
  }
  throw new SettleError('relayer', `Relayer returned ${res.status}.`, { path: 'erc3009' })
}
