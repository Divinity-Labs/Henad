import { getAddress, isAddress, type Address } from 'viem'
import { HENAD, INFRA_MAINNET, type MonadChainId } from '@henad/core'
import type { GasPath } from './types'

/**
 * Environment the settlement library reads. Server-only values never reach the
 * browser bundle; the two NEXT_PUBLIC_ values are inlined at build time.
 *
 *   NEXT_PUBLIC_GAS_PATH                 '7702' (default) sponsors via Pimlico, '3009' always relays
 *   NEXT_PUBLIC_CORRIDOR_ROUTER_ADDRESS  CorridorRouter on the configured chain, until @henad/core HENAD is filled
 *   RELAYER_PRIVATE_KEY                  server: pays MON gas on /api/relay (ERC-3009 path)
 *   PIMLICO_API_KEY                      server: /api/bundler proxies JSON-RPC to Pimlico with it
 *   PIMLICO_SPONSORSHIP_POLICY_ID        server: attached to every pm_* call the proxy forwards
 */

export const DEFAULT_RELAY_URL = '/api/relay'
export const DEFAULT_BUNDLER_URL = '/api/bundler'

/** Simple7702Account delegate and EntryPoint v0.8 (facts §13.2, §14.4), checksummed. */
export const SIMPLE_7702_ACCOUNT: Address = getAddress(INFRA_MAINNET.simple7702Account)
export const ENTRY_POINT_V08: Address = getAddress(INFRA_MAINNET.entryPointV08)

/** Preferred path from NEXT_PUBLIC_GAS_PATH; anything but '3009' means sponsored first. */
export function gasPathFromEnv(value: string | undefined = process.env.NEXT_PUBLIC_GAS_PATH): GasPath {
  return value?.trim() === '3009' ? 'erc3009' : 'eip7702'
}

/** CorridorRouter for the chain: the core registry once deployed, the env override until then. */
export function routerAddress(chainId: MonadChainId): Address | null {
  const deployed = HENAD[chainId]?.corridorRouter
  if (deployed) return deployed
  const env = process.env.NEXT_PUBLIC_CORRIDOR_ROUTER_ADDRESS?.trim()
  return env && isAddress(env) ? getAddress(env) : null
}

/** viem's http transport needs an absolute URL in the browser; route handlers are same-origin. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  const origin = typeof globalThis.location === 'object' ? globalThis.location.origin : undefined
  return origin ? new URL(path, origin).toString() : path
}
