import { describe, expect, it } from 'vitest'
import { createPublicClient, createTestClient, createWalletClient, erc20Abi, http, parseUnits, toHex, type Address } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import {
  MONAD_MAINNET_ID,
  PANCAKE_MAINNET,
  TOKENS,
  cancelTypedData,
  chainFor,
  claimEscrow,
  claimEscrowAbi,
  claimKeyFromFragment,
  claimLink,
  claimTypedData,
  fundTypedData,
  readLink,
  receiveWithAuthorizationTypedData,
} from '../src'

/**
 * Claim links end to end against a fork of mainnet, with the same typed data the app signs.
 * Skipped unless CLAIMS_FORK_RPC points at one, e.g. `anvil --fork-url https://rpc.monad.xyz`.
 */
const rpc = process.env.CLAIMS_FORK_RPC
const chain = chainFor(MONAD_MAINNET_ID)

describe.skipIf(!rpc)('claim links on a mainnet fork', () => {
  const pub = createPublicClient({ chain, transport: http(rpc) })
  const test = createTestClient({ chain, mode: 'anvil', transport: http(rpc) })
  const relayer = privateKeyToAccount(generatePrivateKey())
  const relayerWallet = createWalletClient({ account: relayer, chain, transport: http(rpc) })
  const sender = privateKeyToAccount(generatePrivateKey())
  const ausd = TOKENS[MONAD_MAINNET_ID].AUSD!.address
  const escrow = claimEscrow()
  const now = async () => (await pub.getBlock()).timestamp

  async function fundSender(amount: bigint) {
    const whale = PANCAKE_MAINNET.pools['AUSD/WMON'] as Address
    await test.setBalance({ address: whale, value: 10n ** 20n })
    await test.setBalance({ address: relayer.address, value: 10n ** 20n })
    await test.impersonateAccount({ address: whale })
    const w = createWalletClient({ account: whale, chain, transport: http(rpc) })
    const r = await pub.waitForTransactionReceipt({ hash: await w.writeContract({ address: ausd, abi: erc20Abi, functionName: 'transfer', args: [sender.address, amount] }) })
    await test.stopImpersonatingAccount({ address: whale })
    expect(r.status).toBe('success')
    expect(await pub.readContract({ address: ausd, abi: erc20Abi, functionName: 'balanceOf', args: [sender.address] })).toBe(amount)
  }

  async function makeLink(amount: bigint) {
    const key = generatePrivateKey()
    const link = privateKeyToAccount(key)
    const t = await now()
    const expiry = t + 30n * 86400n
    const validBefore = t + 1200n
    const salt = toHex(crypto.getRandomValues(new Uint8Array(32)))
    const nonce = await pub.readContract({ address: escrow, abi: claimEscrowAbi, functionName: 'depositNonce', args: [ausd, sender.address, amount, link.address, expiry, salt] })
    const signature = await sender.signTypedData(
      receiveWithAuthorizationTypedData(MONAD_MAINNET_ID, ausd, { from: sender.address, to: escrow, value: amount, validAfter: 0n, validBefore, nonce }),
    )
    const fundSignature = await link.signTypedData(fundTypedData(link.address, ausd, sender.address, amount, expiry))
    const hash = await relayerWallet.writeContract({
      address: escrow,
      abi: claimEscrowAbi,
      functionName: 'depositWithAuthorization',
      args: [ausd, sender.address, amount, link.address, expiry, validBefore, salt, signature, fundSignature],
    })
    const receipt = await pub.waitForTransactionReceipt({ hash })
    expect(receipt.status).toBe('success')
    return { key, link, gas: receipt.gasUsed }
  }

  it('funds a link, then pays it to the account the link holder names', async () => {
    const amount = parseUnits('5', 6)
    await fundSender(amount * 2n)
    const { key, link, gas } = await makeLink(amount)
    expect(gas).toBeLessThan(333_000n)

    // The link survives the round trip through its URL.
    const url = claimLink('https://usehenad.xyz', key)
    expect(claimKeyFromFragment(new URL(url).hash)).toBe(key)

    const open = await readLink(pub, link.address, await now())
    expect(open).toMatchObject({ kind: 'open', symbol: 'AUSD', from: sender.address, amount })

    const recipient = privateKeyToAccount(generatePrivateKey()).address
    const signature = await link.signTypedData(claimTypedData(link.address, recipient))
    const hash = await relayerWallet.writeContract({ address: escrow, abi: claimEscrowAbi, functionName: 'claim', args: [link.address, recipient, signature] })
    const r = await pub.waitForTransactionReceipt({ hash })
    expect(r.status).toBe('success')
    expect(r.gasUsed).toBeLessThan(333_000n)
    expect(await pub.readContract({ address: ausd, abi: erc20Abi, functionName: 'balanceOf', args: [recipient] })).toBe(amount)
    expect((await readLink(pub, link.address, await now())).kind).toBe('done')
  })

  it('lets the sender take an unclaimed link back by signature', async () => {
    const amount = parseUnits('5', 6)
    const before = await pub.readContract({ address: ausd, abi: erc20Abi, functionName: 'balanceOf', args: [sender.address] })
    const { link } = await makeLink(amount)
    const deadline = (await now()) + 600n
    const signature = await sender.signTypedData(cancelTypedData(link.address, deadline))
    const hash = await relayerWallet.writeContract({ address: escrow, abi: claimEscrowAbi, functionName: 'cancelWithSig', args: [link.address, deadline, signature] })
    expect((await pub.waitForTransactionReceipt({ hash })).status).toBe('success')
    expect(await pub.readContract({ address: ausd, abi: erc20Abi, functionName: 'balanceOf', args: [sender.address] })).toBe(before)
    expect((await readLink(pub, link.address, await now())).kind).toBe('done')
  })
})
