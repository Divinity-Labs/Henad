import { pad, parseEventLogs, erc20Abi, type Address, type Hex } from 'viem'
import { mainnet } from './chain'

/**
 * One account's stock trades, rebuilt from the chain.
 *
 * HyperSync finds every transaction that moved one of the wrapped xStocks Henad trades in or out of
 * this account. Only those tokens are scanned: they are quiet, while USDC moves millions of
 * times, and scanning it made a first read take close to a minute. The USDC or AUSD side of each
 * trade is then read from the transaction's own receipt. Wrapped xStock in and a dollar out is a
 * buy, the reverse is a sell, and stock with no dollar leg is a transfer.
 *
 * Reads are incremental: the caller passes the block it last read up to, and gets back the
 * block this read reached. Nothing is stored server-side; the chain is the ledger.
 */

const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
/** The first wrapped xStocks pool on Monad was created at block 119,810,537 (Nov 2026). */
export const STOCKS_FROM_BLOCK = 119_810_000

const STOCK_TOKENS: Record<string, string> = {
  '0xabec6aeab037b77c09a2a99264f9c81a35b02649': 'ANT',
  '0xa8ddb5cd96b5222afe198316e9a57caa642850d5': 'NVDA',
  '0xc3fdbe3a68ee5de461d30415a8165cf9aefe1171': 'TSLA',
  '0xe7e553cd128f0011777323a0b44a7b96ea1cb540': 'SPY',
  '0x4c1ae29c159838fc1b224636e28e086eb69101f7': 'QQQ',
}
const CASH_TOKENS: Record<string, 'USDC' | 'AUSD'> = { '0x754704bc059f8c67012fed69bc8a327a5aafb603': 'USDC', '0x00000000efe302beaa2b3e6e1b18d08d69a9012a': 'AUSD' }

export interface StockTrade {
  txHash: Hex
  /** Unix seconds */
  at: number
  block: number
  kind: 'buy' | 'sell' | 'in' | 'out'
  symbol: string
  /** wrapped xStock tokens, 18 decimals, as a decimal string */
  tokens: string
  cash: 'USDC' | 'AUSD' | null
  /** 6 decimals, as a decimal string */
  cashAmount: string | null
}

interface RawLog {
  block_number?: number
  transaction_hash?: Hex
}

export async function stockTrades(account: Address, fromBlock = STOCKS_FROM_BLOCK, signal?: AbortSignal): Promise<{ trades: StockTrade[]; scannedTo: number } | null> {
  const token = process.env.ENVIO_API_TOKEN_HS?.trim()
  if (!token) {
    console.error('[stock-trades] ENVIO_API_TOKEN_HS is not set')
    return null
  }
  const me = pad(account.toLowerCase() as Hex).toLowerCase()
  const stocks = Object.keys(STOCK_TOKENS)

  const logs: RawLog[] = []
  const blockTime = new Map<number, number>()
  let cursor = Math.max(fromBlock, STOCKS_FROM_BLOCK)
  let scannedTo = cursor
  for (let page = 0; page < 20; page++) {
    const res = await fetch('https://143.hypersync.xyz/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        from_block: cursor,
        logs: [
          { address: stocks, topics: [[TRANSFER], [me]] },
          { address: stocks, topics: [[TRANSFER], [], [me]] },
        ],
        field_selection: { log: ['block_number', 'transaction_hash'], block: ['number', 'timestamp'] },
      }),
      signal,
      cache: 'no-store',
    })
    if (!res.ok) {
      console.error('[stock-trades] HyperSync', res.status)
      return null
    }
    const answer = (await res.json()) as { data?: { logs?: RawLog[]; blocks?: { number?: number; timestamp?: number | string }[] }[]; next_block?: number; archive_height?: number }
    for (const batch of answer.data ?? []) {
      logs.push(...(batch.logs ?? []))
      for (const b of batch.blocks ?? []) if (b.number !== undefined && b.timestamp !== undefined) blockTime.set(b.number, Number(b.timestamp))
    }
    if (answer.next_block) scannedTo = answer.next_block
    if (!answer.next_block || answer.next_block <= cursor || (answer.archive_height && answer.next_block >= answer.archive_height)) break
    cursor = answer.next_block
  }

  // Each transaction once, read from its receipt so the dollar leg comes with it.
  const txs = new Map<Hex, number>()
  for (const l of logs) if (l.transaction_hash) txs.set(l.transaction_hash, l.block_number ?? 0)
  const mine = account.toLowerCase()

  const trades = await Promise.all(
    // A trading bot can have thousands; a person has a handful. Keep the newest 200.
    [...txs]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 200)
      .map(async ([txHash, block]): Promise<StockTrade | null> => {
        const receipt = await mainnet().getTransactionReceipt({ hash: txHash })
        const net = new Map<string, bigint>()
        for (const e of parseEventLogs({ abi: erc20Abi, eventName: 'Transfer', logs: receipt.logs })) {
          const tokenAddr = e.address.toLowerCase()
          if (!STOCK_TOKENS[tokenAddr] && !CASH_TOKENS[tokenAddr]) continue
          const sign = (e.args.to.toLowerCase() === mine ? 1n : 0n) - (e.args.from.toLowerCase() === mine ? 1n : 0n)
          if (sign !== 0n) net.set(tokenAddr, (net.get(tokenAddr) ?? 0n) + sign * e.args.value)
        }
        const stock = [...net].find(([a, v]) => STOCK_TOKENS[a] && v !== 0n)
        if (!stock) return null
        const bought = stock[1] > 0n
        const cash = [...net].find(([a, v]) => CASH_TOKENS[a] && v !== 0n && v > 0n !== bought)
        return {
          txHash,
          at: blockTime.get(block) ?? 0,
          block,
          kind: cash ? (bought ? 'buy' : 'sell') : bought ? 'in' : 'out',
          symbol: STOCK_TOKENS[stock[0]]!,
          tokens: (bought ? stock[1] : -stock[1]).toString(),
          cash: cash ? CASH_TOKENS[cash[0]]! : null,
          cashAmount: cash ? (cash[1] > 0n ? cash[1] : -cash[1]).toString() : null,
        }
      }),
  )
  return { trades: trades.filter((t): t is StockTrade => t !== null).sort((a, b) => b.at - a.at || b.block - a.block), scannedTo }
}
