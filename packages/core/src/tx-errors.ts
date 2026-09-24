/**
 * What went wrong, in a sentence a person can act on.
 *
 * Wallet libraries throw for people who already know what a nonce is. A payer reading
 * "Signer had insufficient balance" followed by a raw transaction blob learns nothing,
 * least of all that the fix is to hold a little MON. Every screen that sends a transaction
 * runs its failures through here, so the words are the same wherever the failure happens.
 *
 * The raw error is never shown. It is worth logging, and callers do, but a stack trace in
 * the interface is a confession that nobody thought about the case.
 */

function textOf(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) {
    // viem nests the useful part; the outer message is often the least specific line.
    const parts = [error.message]
    const cause = (error as { cause?: unknown }).cause
    if (cause) parts.push(textOf(cause))
    const details = (error as { details?: unknown }).details
    if (typeof details === 'string') parts.push(details)
    const short = (error as { shortMessage?: unknown }).shortMessage
    if (typeof short === 'string') parts.push(short)
    return parts.join(' · ')
  }
  return String(error ?? '')
}

/** A sentence for the screen, and whether the fix is to get more MON. */
export interface TxFailure {
  message: string
  /** True when the account cannot pay the network fee, which the caller may want to link to. */
  needsGas: boolean
}

export function describeTxFailure(error: unknown): TxFailure {
  const raw = textOf(error)
  const m = raw.toLowerCase()

  // Gas, in every phrasing the stack produces. This is the common first failure: a fresh
  // account holds dollars and no MON, and every transaction costs MON.
  if (
    /signer had insufficient balance|insufficient funds|insufficient balance for transfer|gas required exceeds|cannot afford|exceeds the balance of the account/.test(
      m,
    )
  ) {
    return { message: 'This account has no MON to pay the network fee. Add a little MON first, then try again.', needsGas: true }
  }

  if (/user rejected|user denied|rejected the request|notallowederror|aborterror/.test(m)) {
    return { message: 'You cancelled the signature, so nothing was sent.', needsGas: false }
  }

  if (/transfer amount exceeds balance|erc20: transfer amount|insufficient token balance/.test(m)) {
    return { message: 'That is more than this account holds.', needsGas: false }
  }

  if (/insufficient allowance|erc20: insufficient allowance|transfer amount exceeds allowance/.test(m)) {
    return { message: 'The approval did not go through. Try again, and approve the first prompt before the second.', needsGas: false }
  }

  if (/nonce too low|already known|replacement transaction underpriced|nonce has already been used/.test(m)) {
    return { message: 'A transaction from this account is already in flight. Wait a few seconds and try again.', needsGas: false }
  }

  if (/deadline|expired/.test(m)) {
    return { message: 'This took too long and the quote expired. Try again.', needsGas: false }
  }

  if (/paused|not accepting deposits/.test(m)) {
    return { message: 'This is paused right now. Nothing moved.', needsGas: false }
  }

  if (/slippage|too little received|price impact|amountoutmin/.test(m)) {
    return { message: 'The price moved past the limit you approved, so it stopped rather than filling worse.', needsGas: false }
  }

  if (/timeout|timed out|waitfortransactionreceipt/.test(m)) {
    return { message: 'This did not confirm in time. It may still go through: check your account before trying again.', needsGas: false }
  }

  if (/fetch failed|network error|failed to fetch|econnrefused|http request failed|socket|503|502|429/.test(m)) {
    return { message: 'Henad could not be reached just now. Try again in a moment.', needsGas: false }
  }

  if (/execution reverted|reverted with|custom error/.test(m)) {
    return { message: 'That was refused, so nothing moved.', needsGas: false }
  }

  // Messages Henad wrote itself are already for people: a closed market, a stale rate, a
  // spread past the cap. They are short, plain, and worth keeping. Anything long, or
  // carrying a library's fingerprints, is a blob and gets replaced.
  const written = typeof error === 'string' || error instanceof Error
  const first = raw.split('·')[0]!.trim()
  const blob = /viem@|request arguments|docs: https|contract call:|0x[0-9a-f]{64}|\n\s*at |\[object /i.test(raw)
  if (written && !blob && first.length > 0 && first.length <= 140) return { message: first, needsGas: false }

  return { message: 'That did not go through, and nothing moved.', needsGas: false }
}

/** The sentence alone, for callers with nothing to do about gas. */
export function describeTxError(error: unknown): string {
  return describeTxFailure(error).message
}
