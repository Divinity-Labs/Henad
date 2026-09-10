import type { NextRequest } from 'next/server'
import { parseUnits, type Address } from 'viem'
import { CHAINLINK_MAINNET, MONAD_MAINNET_ID, TOKENS } from '@henad/core'
import { CORRIDORS, SOURCE_ASSETS, type Corridor } from '@/lib/corridors'
import { isFxMarketOpen } from '@/lib/market-hours'
import { mentoQuote, referenceRate } from '@/lib/rates'
import { QUOTE_TTL_MS, type QuoteDto } from '@/lib/send-quote'

/**
 * GET /api/quote?source=AUSD&target=GBP&amount=250.00
 *
 * Reads the reference rate and the venue quote on MONAD MAINNET regardless of
 * the chain the app settles on: the testnet has no Mento pools and no fiat
 * feeds (docs/INTEGRATION-FACTS.md §2, §12.2), so a testnet build quotes
 * mainnet prices it cannot yet settle. The figures are real; the settlement
 * seam decides whether they can be honoured.
 */
export const dynamic = 'force-dynamic'

const AMOUNT = /^\d{1,9}(\.\d{1,6})?$/

function bad(error: string, status = 400) {
  return Response.json({ error }, { status })
}

function refusal(c: Corridor): string {
  return c.tier === 'quote'
    ? `USD → ${c.target}: ${c.note}. Henad can show the rate but has no ${c.targetName} asset to deliver into.`
    : `USD → ${c.target}: ${c.note}.`
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const source = q.get('source') ?? 'AUSD'
  const target = q.get('target') ?? 'GBP'
  const amount = q.get('amount') ?? ''

  const asset = SOURCE_ASSETS.find((a) => a.symbol === source)
  if (!asset) return bad('Source asset must be AUSD or USDC.')
  const corridor = CORRIDORS.find((c) => c.target === target)
  if (!corridor) return bad(`There is no USD → ${target} corridor.`)
  if (corridor.tier !== 'live' || !corridor.feed || !corridor.targetAsset) return bad(refusal(corridor))
  if (!AMOUNT.test(amount)) return bad('Amount must be a positive number with at most six decimals.')
  const amountIn = parseUnits(amount, asset.decimals)
  if (amountIn === 0n) return bad('Amount must be more than zero.')

  const marketOpen = isFxMarketOpen(Math.floor(Date.now() / 1000))
  if (!marketOpen) return Response.json({ error: `The ${corridor.targetName} market is closed.`, marketOpen }, { status: 409 })

  const sourceFeed = CHAINLINK_MAINNET[`${asset.symbol}/USD`]
  try {
    const [ref, quotedAmountOut] = await Promise.all([
      referenceRate(sourceFeed.address, sourceFeed.decimals, corridor.feed.ref as Address, corridor.feed.decimals ?? 18),
      mentoQuote(TOKENS[MONAD_MAINNET_ID][asset.symbol]!.address, corridor.targetAsset.address, amountIn),
    ])
    const body: QuoteDto = {
      source: asset.symbol,
      target: corridor.target,
      sourceAmount: amountIn.toString(),
      quotedAmountOut: quotedAmountOut.toString(),
      referenceRate: ref.rate.toString(),
      observation: ref.observation,
      marketOpen,
      feedUpdatedAt: ref.updatedAt,
      expiresAt: Date.now() + QUOTE_TTL_MS,
    }
    return Response.json(body, { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    return bad(`Could not read the rate from Monad (${(e as Error).message.split('\n')[0]}). Try again.`, 502)
  }
}
