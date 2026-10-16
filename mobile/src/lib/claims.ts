import * as SecureStore from 'expo-secure-store'
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
  fundTypedData,
  readLink,
  receiveWithAuthorizationTypedData,
  type LinkState,
} from '@henad/core'
import { postForTx, webUrl } from './api'
import { appChain } from './config'

/**
 * Claim links on the phone, the same contract and route as the web (web/src/lib/claims.ts).
 *
 * The person paid opens the link in any browser, so claiming happens on the web; the phone
 * makes links and takes them back. A link's key is the money until it is claimed, so the
 * list of links sent lives in SecureStore, under the account that sent them, and never
 * leaves the phone. SecureStore advises values under 2 KB, so the list keeps the newest
 * twelve in a compact form; an older link still works, it just is not listed here.
 */

export type LinkSymbol = 'AUSD' | 'USDC'

export interface SentLink {
  key: Hex
  claimSigner: Address
  symbol: LinkSymbol
  amount: bigint
  createdAt: number
}

const KEEP = 12

/** `henad.links.<address>`: SecureStore keys take letters, digits, `.`, `-` and `_` only. */
function listKey(owner: Address): string {
  return `henad.links.${owner.toLowerCase()}`
}

/** [key without 0x, A|U, amount, unix seconds], about 100 bytes a link. */
type Packed = [string, 'A' | 'U', string, number]

export async function loadSentLinks(owner: Address): Promise<SentLink[]> {
  try {
    const raw = await SecureStore.getItemAsync(listKey(owner))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((p: unknown) => {
      if (!Array.isArray(p) || typeof p[0] !== 'string' || !/^[0-9a-f]{64}$/.test(p[0])) return []
      const [k, s, a, t] = p as Packed
      const key = `0x${k}` as Hex
      return [{ key, claimSigner: privateKeyToAccount(key).address, symbol: s === 'U' ? 'USDC' : 'AUSD', amount: BigInt(a), createdAt: t }]
    })
  } catch {
    return []
  }
}

async function saveSentLink(owner: Address, link: SentLink): Promise<void> {
  const list = [link, ...(await loadSentLinks(owner))].slice(0, KEEP)
  const packed: Packed[] = list.map((l) => [l.key.slice(2), l.symbol === 'USDC' ? 'U' : 'A', l.amount.toString(), l.createdAt])
  try {
    await SecureStore.setItemAsync(listKey(owner), JSON.stringify(packed))
  } catch {
    // Storage refused: the link works, it just is not listed for taking back.
  }
}

/** The web link for `key`. The key rides in the fragment, which browsers never send to a server. */
export function linkUrl(key: Hex): string {
  return claimLink(webUrl(''), key)
}

/**
 * Put `amount` of `symbol` behind a new link and return the link. The passkey account signs
 * the token's authorization; a fresh key made here and nowhere else signs the funding.
 */
export async function createLink(account: LocalAccount, symbol: LinkSymbol, amount: bigint): Promise<string> {
  const token = TOKENS[MONAD_MAINNET_ID][symbol]
  if (!token) throw new Error(`${symbol} is not on this network.`)
  const escrow = claimEscrow()
  const client = appChain()
  const key = generatePrivateKey()
  const link = privateKeyToAccount(key)
  const now = BigInt(Math.floor(Date.now() / 1000))
  const expiry = now + BigInt(CLAIM_LINK_DAYS * 24 * 60 * 60)
  const validBefore = now + 20n * 60n
  const salt = toHex(crypto.getRandomValues(new Uint8Array(32)))

  const nonce = await client.readContract({
    address: escrow,
    abi: claimEscrowAbi,
    functionName: 'depositNonce',
    args: [token.address, account.address, amount, link.address, expiry, salt],
  })
  const signature = await account.signTypedData(
    receiveWithAuthorizationTypedData(MONAD_MAINNET_ID, token.address, { from: account.address, to: escrow, value: amount, validAfter: 0n, validBefore, nonce }),
  )
  const fundSignature = await link.signTypedData(fundTypedData(link.address, token.address, account.address, amount, expiry))

  const hash = await postForTx('/api/claim', {
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
  const receipt = await client.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error('That did not go through. Nothing moved. Try again.')
  await saveSentLink(account.address, { key, claimSigner: link.address, symbol, amount, createdAt: Number(now) })
  return linkUrl(key)
}

/** The sender takes the money back: before expiry by signature, after it by refund. */
export async function takeBack(account: LocalAccount, claimSigner: Address): Promise<void> {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 10 * 60)
  const signature = await account.signTypedData(cancelTypedData(claimSigner, deadline))
  const hash = await postForTx('/api/claim', { action: 'cancel', claimSigner, deadline: deadline.toString(), signature })
  const receipt = await appChain().waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error('That did not go through. Try again.')
}

export function readLinkNow(claimSigner: Address): Promise<LinkState> {
  return readLink(appChain(), claimSigner, BigInt(Math.floor(Date.now() / 1000)))
}
