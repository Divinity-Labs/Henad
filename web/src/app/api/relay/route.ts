import { createWalletClient, encodeFunctionData, fallback, http, isHex, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { MAINNET_RPCS, MONAD_MAINNET_ID, TESTNET_RPCS, chainFor, corridorRouterAbi, hashIntent, type MonadChainId } from '@henad/core'
import { appChain, appChainId } from '@/lib/chain'
import { routerAddress } from '@/lib/settle/config'
import { decodeSettleError, revertDataOf } from '@/lib/settle/errors'
import { RateLimiter, clientIp, gasLimitFor, parseRelayBody } from '@/lib/settle/relay'
import type { RelayErrorResponse, RelayResponse } from '@/lib/settle/types'

/**
 * PATH A relayer. Accepts a signed ERC-3009 authorization for an intent,
 * simulates `settleWithAuthorization` from the relayer, sets a gas limit
 * under the facts §14.5 policy and broadcasts. Returns the tx hash without
 * waiting for the receipt; the UI reads the receipt from RateAttestation.
 *
 * RELAYER_PRIVATE_KEY is read per request and never logged or echoed.
 */

const limiter = new RateLimiter(10, 60_000)

function fail(status: number, code: RelayErrorResponse['code'], error: string, reason?: RelayErrorResponse['reason']): Response {
  const body: RelayErrorResponse = reason ? { error, code, reason } : { error, code }
  return Response.json(body, { status })
}

function relayerKey(): Hex | null {
  const raw = process.env.RELAYER_PRIVATE_KEY?.trim()
  return raw && isHex(raw) && raw.length === 66 ? raw : null
}

function rpcUrls(chainId: MonadChainId): string[] {
  const custom = process.env.NEXT_PUBLIC_MONAD_RPC_URL
  const defaults = chainId === MONAD_MAINNET_ID ? MAINNET_RPCS : TESTNET_RPCS
  return custom ? [custom, ...defaults] : [...defaults]
}

function shortError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message.split('\n')[0]}` : String(error)
}

export async function POST(request: Request): Promise<Response> {
  if (!limiter.allow(clientIp(request.headers))) {
    return fail(429, 'rate_limit', 'Too many settlement requests from this address; try again in a minute.')
  }
  const key = relayerKey()
  if (!key) {
    return fail(503, 'config', 'The relayer is not configured on this deployment (RELAYER_PRIVATE_KEY is unset). Use the sponsored path or try again later.')
  }
  const chainId = appChainId()
  const router = routerAddress(chainId)
  if (!router) return fail(503, 'config', 'No CorridorRouter is configured for this chain.')

  const body: unknown = await request.json().catch(() => null)
  const parsed = parseRelayBody(body, { chainId, nowSec: Math.floor(Date.now() / 1000) })
  if (!parsed.ok) return fail(parsed.status, 'bad_request', parsed.error)
  const { intent, signature } = parsed
  const intentId = hashIntent(intent, chainId, router)

  const relayer = privateKeyToAccount(key)
  const client = appChain()
  const data = encodeFunctionData({ abi: corridorRouterAbi, functionName: 'settleWithAuthorization', args: [intent, signature] })

  // facts §14.5 — a reverting tx still bills the full limit, so simulate the exact calldata first.
  try {
    await client.call({ account: relayer.address, to: router, data })
  } catch (error) {
    const raw = revertDataOf(error)
    if (raw) {
      const decoded = decodeSettleError(raw)
      return fail(422, 'intent', decoded.message, { name: decoded.name, source: decoded.source })
    }
    console.error('[relay] pre-flight failed', intentId, shortError(error))
    return fail(502, 'relayer', 'Pre-flight simulation failed; the chain RPC did not answer.')
  }

  let gas: bigint
  try {
    gas = gasLimitFor(await client.estimateGas({ account: relayer.address, to: router, data }))
  } catch (error) {
    // The pre-flight runs against the latest block and estimation against the pending one,
    // so a revert can appear here first: a fork whose clock has passed Mento's report
    // expiry answers NoRecentRate only at the pending block. Name it the same way.
    const raw = revertDataOf(error)
    if (raw) {
      const decoded = decodeSettleError(raw)
      return fail(422, 'intent', decoded.message, { name: decoded.name, source: decoded.source })
    }
    console.error('[relay] estimate failed', intentId, shortError(error))
    return fail(502, 'relayer', 'Gas estimation failed; try again.')
  }

  const wallet = createWalletClient({
    account: relayer,
    chain: chainFor(chainId),
    transport: fallback(rpcUrls(chainId).map((url) => http(url))),
  })

  let txHash: Hex
  try {
    txHash = await wallet.sendTransaction({ to: router, data, gas })
  } catch (error) {
    console.error('[relay] send failed', intentId, shortError(error))
    return fail(502, 'relayer', 'The relayer could not broadcast the settlement.')
  }

  const response: RelayResponse = { intentId, txHash }
  return Response.json(response)
}
