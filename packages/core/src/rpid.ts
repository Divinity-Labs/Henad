import { MONAD_MAINNET_ID, type MonadChainId } from './chains'

/**
 * A WebAuthn passkey is bound forever to the relying-party id it was created
 * under (docs/INTEGRATION-FACTS.md §12.1, docs/PLAN.md "Domains and passkeys").
 * Real-value accounts must therefore only ever be created under the production
 * domain. This guard makes a misconfigured mainnet deploy fail at startup instead
 * of minting accounts on the wrong domain.
 */
export const PRODUCTION_RP_ID = 'henad.xyz'

export class RpIdMismatchError extends Error {
  constructor(chainId: number, rpId: string) {
    super(
      `Refusing to build a client for chain ${chainId} with rpId "${rpId}". ` +
        `Mainnet passkeys may only be created under "${PRODUCTION_RP_ID}".`,
    )
    this.name = 'RpIdMismatchError'
  }
}

/**
 * Hosts that can only ever be this machine. A passkey created under one of these
 * is reachable by nobody else, so it cannot hold value no matter what chain id
 * the node behind it claims.
 */
const LOOPBACK_RP_IDS = new Set(['localhost', '127.0.0.1', '[::1]'])

export function isLoopbackRpId(rpId: string): boolean {
  return LOOPBACK_RP_IDS.has(rpId)
}

/**
 * Refuse to mint a mainnet passkey anywhere but the production domain.
 *
 * `localFork` is the one exception, and it is deliberately hard to trip by
 * accident: a local fork of mainnet reports chain id 143 because it is a copy of
 * mainnet, so the chain id alone cannot tell the two apart. Both conditions must
 * hold — the caller must declare a local fork AND the rpId must be a loopback
 * host. Declaring the flag on a real deployment changes nothing, because a real
 * deployment is not served from localhost, and a passkey bound to localhost is
 * reachable by nobody but the person sitting at the machine.
 */
export function assertRpIdForChain(chainId: MonadChainId, rpId: string, localFork = false): void {
  if (chainId !== MONAD_MAINNET_ID) return
  if (localFork && isLoopbackRpId(rpId)) return
  if (rpId !== PRODUCTION_RP_ID) throw new RpIdMismatchError(chainId, rpId)
}
