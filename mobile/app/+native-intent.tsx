import { parseRecipient } from '@henad/core'

/**
 * Where the router goes when the system opens the app with a URL.
 *
 * A pay link, https://usehenad.xyz/pay/0x… or henad://pay/0x…, has no screen of its own: the
 * router would read "/pay/0x…" as a route and show "unmatched route". It lands on the app's
 * one screen instead, which reads the same URL through Linking and fills in who to pay, or
 * keeps it until someone signs in. A malformed pay link lands there too, and is ignored.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (parseRecipient(path).kind === 'paylink') return '/'
    return /^(https:\/\/(www\.)?usehenad\.xyz\/pay\b|henad:\/\/pay\b|\/pay\b)/i.test(path) ? '/' : path
  } catch {
    // Throwing here crashes the app on launch; an unreadable URL just opens it.
    return '/'
  }
}
