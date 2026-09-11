/**
 * End-to-end payout against the local Monad fork, with no browser involved.
 *
 * This is the same journey the send flow makes — quote, build the intent, sign an
 * ERC-3009 authorization, hand it to the relayer, read the receipt back off the chain —
 * minus the passkey, which needs a human and a fingerprint. It exists so the transport
 * can be proven before anyone is asked to test it, and so a regression in the rail is
 * caught without a device.
 *
 * It is NOT part of `pnpm test`: the vitest config only picks up `src/**\/__tests__`, and
 * this needs a live fork and a running dev server. Run it deliberately:
 *
 *   scripts/local-fork.sh <anyAddress>          # from the repo root
 *   pnpm dev                                    # in web/, with the env the script printed
 *   pnpm exec vitest run --config vitest.live.config.ts
 *
 * The payer here is anvil account 3, not your passkey account, because this file cannot
 * produce a passkey signature. The rail it exercises is identical.
 */
import { describe, expect, it } from 'vitest'
import { createPublicClient, createWalletClient, getAddress, http, isAddress, parseAbi, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { MONAD_MAINNET_ID, TOKENS, hashIntent, rateAttestationAbi, receiveWithAuthorizationTypedData, type Intent } from '@henad/core'

const RPC = process.env.NEXT_PUBLIC_MONAD_RPC_URL ?? 'http://127.0.0.1:8545'
const APP = process.env.LOCAL_APP_URL ?? 'http://localhost:3000'
const ROUTER = process.env.NEXT_PUBLIC_CORRIDOR_ROUTER_ADDRESS as Address | undefined
const ATTESTATION = process.env.NEXT_PUBLIC_RATE_ATTESTATION_ADDRESS as Address | undefined

// anvil account 3, funded by the fork script's own deployer. Published key, local only.
const PAYER_KEY = '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6' as Hex
const RECIPIENT = getAddress('0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65') // anvil account 4
const WHALE = getAddress('0x4255Cf38e51516766180b33122029A88Cb853806') // AUSD ReserveV2

const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)', 'function transfer(address,uint256) returns (bool)'])

const chain = { id: MONAD_MAINNET_ID, name: 'Monad (local fork)', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } } as const
const pub = createPublicClient({ chain, transport: http(RPC) })

async function rpc(method: string, params: unknown[]) {
  const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  return (await res.json()) as { result?: unknown; error?: { message: string } }
}

describe('local payout, end to end', () => {
  it('quotes, settles through Mento and writes a receipt anyone can read', async () => {
    expect(ROUTER && isAddress(ROUTER), 'NEXT_PUBLIC_CORRIDOR_ROUTER_ADDRESS must be set — run scripts/local-fork.sh').toBe(true)
    expect(ATTESTATION && isAddress(ATTESTATION), 'NEXT_PUBLIC_RATE_ATTESTATION_ADDRESS must be set').toBe(true)
    const router = getAddress(ROUTER!)

    const payer = privateKeyToAccount(PAYER_KEY)
    const ausd = TOKENS[MONAD_MAINNET_ID].AUSD!.address
    const gbpm = TOKENS[MONAD_MAINNET_ID].GBPm!.address

    // 1. fund the payer from the reserve, the way the fork script funds yours
    await rpc('anvil_setBalance', [WHALE, '0xde0b6b3a7640000'])
    await rpc('anvil_setBalance', [payer.address, '0xde0b6b3a7640000'])
    const whaleWallet = createWalletClient({ account: WHALE, chain, transport: http(RPC) })
    await whaleWallet.writeContract({ address: ausd, abi: erc20, functionName: 'transfer', args: [payer.address, 1_000_000_000n] })
    const funded = await pub.readContract({ address: ausd, abi: erc20, functionName: 'balanceOf', args: [payer.address] })
    expect(funded, 'payer funded with AUSD').toBeGreaterThanOrEqual(10_000_000n)

    // 2. quote through the app, exactly as the amount step does
    const quoteRes = await fetch(`${APP}/api/quote?source=AUSD&target=GBP&amount=10`, { cache: 'no-store' })
    const quote = (await quoteRes.json()) as { quotedAmountOut: string; referenceRate: string; marketOpen: boolean; error?: string }
    expect(quote.error, `quote failed: ${quote.error}`).toBeUndefined()
    expect(quote.marketOpen, 'FX market must be open to settle; try on a weekday inside market hours').toBe(true)

    // 3. the intent the quote screen would sign
    const sourceAmount = 10_000_000n
    const quotedOut = BigInt(quote.quotedAmountOut)
    const intent: Intent = {
      payer: payer.address,
      recipient: RECIPIENT,
      sourceAsset: ausd,
      targetAsset: gbpm,
      sourceAmount,
      quotedAmountOut: quotedOut,
      toleranceBps: 50,
      maxSpreadBps: 50,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 600),
      salt: `0x${'11'.repeat(32)}` as Hex,
    }
    const intentId = hashIntent(intent, MONAD_MAINNET_ID, router)

    // 4. sign the ERC-3009 authorization, nonce bound to the intent id
    const typedData = receiveWithAuthorizationTypedData(MONAD_MAINNET_ID, ausd, {
      from: intent.payer,
      to: router,
      value: intent.sourceAmount,
      validAfter: 0n,
      validBefore: intent.deadline,
      nonce: intentId,
    })
    const signature = await payer.signTypedData(typedData)

    // 5. relay it
    const before = await pub.readContract({ address: gbpm, abi: erc20, functionName: 'balanceOf', args: [RECIPIENT] })
    const relayRes = await fetch(`${APP}/api/relay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chainId: MONAD_MAINNET_ID,
        intent: { ...intent, sourceAmount: intent.sourceAmount.toString(), quotedAmountOut: intent.quotedAmountOut.toString(), deadline: intent.deadline.toString() },
        signature,
      }),
    })
    const relay = (await relayRes.json()) as { intentId?: Hex; txHash?: Hex; error?: string; reason?: { name: string } }
    expect(relay.error, `relay refused: ${relay.error} ${relay.reason?.name ?? ''}`).toBeUndefined()
    expect(relay.intentId?.toLowerCase()).toBe(intentId.toLowerCase())

    const receipt = await pub.waitForTransactionReceipt({ hash: relay.txHash! })
    expect(receipt.status, 'settlement transaction reverted').toBe('success')

    // 6. the recipient actually received pounds
    const after = await pub.readContract({ address: gbpm, abi: erc20, functionName: 'balanceOf', args: [RECIPIENT] })
    const delivered = after - before
    expect(delivered, 'recipient received GBPm').toBeGreaterThan(0n)

    // 7. the receipt is on the chain, and it is the whole point
    const attested = await pub.readContract({ address: getAddress(ATTESTATION!), abi: rateAttestationAbi, functionName: 'get', args: [intentId] })
    expect(attested.deliveredAmount).toBe(delivered)
    expect(attested.referenceRate).toBeGreaterThan(0n)
    expect(attested.executedRate).toBeGreaterThan(0n)
    expect(Math.abs(Number(attested.spreadBps))).toBeLessThanOrEqual(50)

    // 8. and the app can read it back
    const apiRes = await fetch(`${APP}/api/receipt/${intentId}`, { cache: 'no-store' })
    expect(apiRes.ok, `receipt route returned ${apiRes.status}`).toBe(true)
    const shown = (await apiRes.json()) as { sample: boolean; deliveredAmount: string; spreadBps: number }
    expect(shown.sample, 'a real settlement must never be labelled a sample').toBe(false)
    expect(BigInt(shown.deliveredAmount)).toBe(delivered)

    const pounds = Number(delivered) / 1e18
    console.log(`\n  settled: $10.00 AUSD -> £${pounds.toFixed(4)} GBPm, spread ${attested.spreadBps} bps, tx ${relay.txHash}\n`)
  }, 120_000)
})
