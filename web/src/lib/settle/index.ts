import type { Intent } from '@henad/core'
import { gasPathFromEnv } from './config'
import { FALLBACK_KINDS, SettleError } from './errors'
import { settleViaErc3009 } from './erc3009'
import { settleViaEip7702 } from './eip7702'
import type { GasPath, SettleAccount, SettleOptions, SettleResult } from './types'

/**
 * Settlement transport for the send flow. One call, two rails
 * (docs/INTEGRATION-FACTS.md §13.5):
 *
 *   eip7702  Pimlico-sponsored userOp from the payer's delegated EOA (primary)
 *   erc3009  ReceiveWithAuthorization relayed by /api/relay (fallback)
 *
 * Environment:
 *   NEXT_PUBLIC_GAS_PATH                 '7702' (default) or '3009' — which rail settle() tries first
 *   NEXT_PUBLIC_CORRIDOR_ROUTER_ADDRESS  CorridorRouter on the configured chain until @henad/core HENAD is filled
 *   RELAYER_PRIVATE_KEY                  server only — /api/relay signs and pays for path A with it
 *   PIMLICO_API_KEY                      server only — /api/bundler forwards JSON-RPC to Pimlico with it
 *   PIMLICO_SPONSORSHIP_POLICY_ID        server only — stamped onto every pm_* call by /api/bundler
 *
 * The UI passes the account from Mera (`toViemAccount(session)`), the intent it
 * quoted, the chain id and the router; it gets back the intentId (receipt key),
 * the inclusion tx hash and the path that carried it.
 */

export type { BatchCall } from './eip7702'
export type { DecodedSettleError, ErrorSource, SettleErrorKind } from './errors'
export type { GasPath, IntentWire, RelayErrorResponse, RelayRequest, RelayResponse, SettleAccount, SettleOptions, SettleResult } from './types'
export { DEFAULT_BUNDLER_URL, DEFAULT_RELAY_URL, ENTRY_POINT_V08, SIMPLE_7702_ACCOUNT, gasPathFromEnv, routerAddress } from './config'
export { FALLBACK_KINDS, SettleError, VENUE_ERROR_SELECTORS, decodeSettleError, reasonFromReceipt, revertDataOf } from './errors'
export { receiveAuthorizationFor, settleViaErc3009 } from './erc3009'
export { SPONSORSHIP_MIN_DEADLINE_SEC, classify7702Error, encodeSettleBatch, executeBatchAbi, isDelegatedTo, settleCalls, settleViaEip7702 } from './eip7702'
export { fromWire, toWire } from './types'

/** Sponsored when the env prefers it and the account can sign a 7702 authorization; relayed otherwise. */
export function chooseGasPath(account: SettleAccount, preferred: GasPath = gasPathFromEnv()): GasPath {
  return preferred === 'eip7702' && typeof account.signAuthorization === 'function' ? 'eip7702' : 'erc3009'
}

/**
 * Settle a quoted intent. With `path: 'auto'` (default) a sponsorship or
 * bundler failure on the 7702 rail falls back to the relayer exactly once;
 * an intent failure (venue closed, quote moved, spread) never does, because
 * the relayer would hit the same revert and Monad bills the gas limit.
 */
export async function settle(intent: Intent, account: SettleAccount, opts: SettleOptions): Promise<SettleResult> {
  const requested = opts.path ?? 'auto'
  const path = requested === 'auto' ? chooseGasPath(account) : requested
  if (path === 'erc3009') return settleViaErc3009(intent, account, opts)

  try {
    return await settleViaEip7702(intent, account, opts)
  } catch (error) {
    if (!(requested === 'auto' && error instanceof SettleError && FALLBACK_KINDS.has(error.kind))) throw error
    try {
      return await settleViaErc3009(intent, account, opts)
    } catch (fallbackError) {
      if (fallbackError instanceof SettleError) {
        throw new SettleError(fallbackError.kind, `${fallbackError.message} (sponsored path failed first: ${error.message})`, {
          path: 'erc3009',
          cause: error,
          decoded: fallbackError.decoded,
        })
      }
      throw fallbackError
    }
  }
}
