import { useEffect, useState } from 'react'
import { toHex, type Address, type Hex, type LocalAccount } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import {
  CLAIM_LINK_DAYS,
  MONAD_MAINNET_ID,
  TOKENS,
  cancelTypedData,
  claimEscrow,
  claimEscrowAbi,
  claimLink,
  claimTypedData,
  fundTypedData,
  readLink,
  receiveWithAuthorizationTypedData,
  type LinkState,
} from '@henad/core'
import { appChain } from './chain'

/**
 * Claim links in the browser: make one, claim one, take one back. The relayer submits every
 * transaction (/api/claim), so neither the sender nor the person claiming needs MON.
 *
 * A link's key is the money until someone claims it. It is written into the link and into this
 * browser's list of links sent, under the sender's account, so the sender can copy it again or
 * take the money back; it is never sent to Henad's server.
 */

export interface SentLink {
  key: Hex
  claimSigner: Address
  symbol: 'AUSD' | 'USDC'
  amount: string
  createdAt: number
}

const listKey = (owner: Address) => `henad.links.${owner.toLowerCase()}`
const listeners = new Set<() => void>()

export function loadSentLinks(owner: Address): SentLink[] {
  try {
    const raw = window.localStorage.getItem(listKey(owner))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as SentLink[]).filter((l) => typeof l?.key === 'string' && typeof l?.claimSigner === 'string') : []
  } catch {
    return []
  }
}

function saveSentLink(owner: Address, link: SentLink) {
  try {
    window.localStorage.setItem(listKey(owner), JSON.stringify([link, ...loadSentLinks(owner)].slice(0, 50)))
  } catch {
    // Blocked storage: the link still works, it just is not listed here.
  }
  listeners.forEach((l) => l())
}

/** This browser's links sent from `owner`, newest first, kept current as links are made. */
export function useSentLinks(owner: Address | null | undefined): SentLink[] {
  const [links, setLinks] = useState<SentLink[]>([])
  useEffect(() => {
    if (!owner) return
    const read = () => setLinks(loadSentLinks(owner))
    read()
    listeners.add(read)
    return () => {
      listeners.delete(read)
    }
  }, [owner])
  return owner ? links : []
}

async function post(body: Record<string, string>): Promise<Hex> {
  let res: Response
  try {
    res = await fetch('/api/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    throw new Error('Could not reach Henad. Check your connection and try again.')
  }
  const json = (await res.json().catch(() => null)) as { txHash?: Hex; error?: string } | null
  if (!res.ok || !json?.txHash) throw new Error(json?.error ?? 'That did not go through. Try again.')
  const receipt = await appChain().waitForTransactionReceipt({ hash: json.txHash })
  if (receipt.status !== 'success') throw new Error('That did not go through. Nothing moved. Try again.')
  return json.txHash
}

export function linkToken(symbol: 'AUSD' | 'USDC') {
  const t = TOKENS[MONAD_MAINNET_ID][symbol]
  if (!t) throw new Error(`${symbol} is not on this network`)
  return t
}

/**
 * Put `amount` of `symbol` behind a new link and return it. The passkey account signs the
 * token's authorization; a fresh key, made here and nowhere else, signs the funding.
 */
export async function createLink(account: LocalAccount, symbol: 'AUSD' | 'USDC', amount: bigint): Promise<string> {
  const token = linkToken(symbol)
  const escrow = claimEscrow()
  const key = generatePrivateKey()
  const link = privateKeyToAccount(key)
  const now = BigInt(Math.floor(Date.now() / 1000))
  const expiry = now + BigInt(CLAIM_LINK_DAYS * 24 * 60 * 60)
  const validBefore = now + 20n * 60n
  const salt = toHex(crypto.getRandomValues(new Uint8Array(32)))

  const nonce = await appChain().readContract({
    address: escrow,
    abi: claimEscrowAbi,
    functionName: 'depositNonce',
    args: [token.address, account.address, amount, link.address, expiry, salt],
  })
  const signature = await account.signTypedData(
    receiveWithAuthorizationTypedData(MONAD_MAINNET_ID, token.address, { from: account.address, to: escrow, value: amount, validAfter: 0n, validBefore, nonce }),
  )
  const fundSignature = await link.signTypedData(fundTypedData(link.address, token.address, account.address, amount, expiry))

  await post({
    action: 'fund',
    token: token.address,
    from: account.address,
    amount: amount.toString(),
    claimSigner: link.address,
    expiry: expiry.toString(),
    validBefore: validBefore.toString(),
    salt,
    signature,
    fundSignature,
  })
  saveSentLink(account.address, { key, claimSigner: link.address, symbol, amount: amount.toString(), createdAt: Date.now() })
  return claimLink(window.location.origin, key)
}

/** Pay the money behind `key` to `recipient`. Needs no passkey: the link's own key signs. */
export async function claimTo(key: Hex, recipient: Address): Promise<void> {
  const link = privateKeyToAccount(key)
  const signature = await link.signTypedData(claimTypedData(link.address, recipient))
  await post({ action: 'claim', claimSigner: link.address, recipient, signature })
}

/** The sender takes the money back: before expiry by signature, after it by refund. */
export async function takeBack(account: LocalAccount, claimSigner: Address): Promise<void> {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 10 * 60)
  const signature = await account.signTypedData(cancelTypedData(claimSigner, deadline))
  await post({ action: 'cancel', claimSigner, deadline: deadline.toString(), signature })
}

export function readLinkNow(claimSigner: Address): Promise<LinkState> {
  return readLink(appChain(), claimSigner, BigInt(Math.floor(Date.now() / 1000)))
}
