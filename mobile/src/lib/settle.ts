import { toHex, type Address, type Hex } from 'viem'
import {
  hashIntent,
  quoteMaths,
  receiveWithAuthorizationTypedData,
  type Corridor,
  type Intent,
  type QuoteDto,
} from '@henad/core'
import { relaySettlement, type RelayResult } from './api'
import { appChainId } from './config'
import { sourceToken } from './balance'
import type { MeraAccount } from './mera'

/** Intent validity. Sponsorship simulations need at least 10 minutes (facts §14.4). */
const INTENT_TTL_S = 600

/**
 * Settle a quoted payout from the phone.
 *
 * The device builds the intent, hashes it, and signs an ERC-3009 authorization whose
 * nonce **is** the intent id. That binding is what makes the signature useless for
 * anything else: a relayer cannot move the money to a different recipient, a different
 * amount, or a different corridor without producing a different id, which the payer never
 * signed. The relayer pays the gas and can do nothing else.
 *
 * The same intent id is recomputed here after the relayer answers, and a mismatch is
 * treated as a failure, because it would mean the transaction that landed is not the one
 * the person approved.
 */
export async function settleFromPhone(args: {
  account: MeraAccount
  corridor: Corridor
  quote: QuoteDto
  recipient: Address
  maxSpreadBps: number
  router: Address
}): Promise<RelayResult & { intent: Intent }> {
  const { account, corridor, quote, recipient, maxSpreadBps, router } = args
  const target = corridor.targetAsset
  if (!target) throw new Error(`${corridor.key} has no asset to deliver into on this chain.`)

  const chainId = appChainId()
  const source = sourceToken()
  const m = quoteMaths(quote, source.decimals, target.decimals)

  const intent: Intent = {
    payer: account.address,
    recipient,
    sourceAsset: source.address,
    targetAsset: target.address,
    sourceAmount: m.sourceAmount,
    quotedAmountOut: m.delivered,
    // One control drives both guards: the fill may not sit below the quote by more than
    // the spread cap either.
    toleranceBps: maxSpreadBps,
    maxSpreadBps,
    deadline: BigInt(Math.floor(Date.now() / 1000) + INTENT_TTL_S),
    salt: toHex(crypto.getRandomValues(new Uint8Array(32))),
  }

  const intentId = hashIntent(intent, chainId, router)
  const typedData = receiveWithAuthorizationTypedData(chainId, intent.sourceAsset, {
    from: intent.payer,
    to: router,
    value: intent.sourceAmount,
    validAfter: 0n,
    validBefore: intent.deadline,
    nonce: intentId,
  })

  const signature = (await account.account.signTypedData(typedData)) as Hex

  const result = await relaySettlement(chainId, toWire(intent), signature)
  if (result.intentId.toLowerCase() !== intentId.toLowerCase()) {
    throw new Error('The relayer settled a different intent from the one you approved.')
  }
  return { ...result, intent }
}

/** bigints are not JSON; the relay route parses these back with the same field names. */
function toWire(intent: Intent): Record<string, unknown> {
  return {
    payer: intent.payer,
    recipient: intent.recipient,
    sourceAsset: intent.sourceAsset,
    targetAsset: intent.targetAsset,
    sourceAmount: intent.sourceAmount.toString(),
    quotedAmountOut: intent.quotedAmountOut.toString(),
    toleranceBps: intent.toleranceBps,
    maxSpreadBps: intent.maxSpreadBps,
    deadline: intent.deadline.toString(),
    salt: intent.salt,
  }
}
