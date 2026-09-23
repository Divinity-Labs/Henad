import { describe, expect, it } from 'vitest'
import { describeTxFailure } from '../src/tx-errors'

/** The real thing a payer saw on /earn before this existed, trimmed but not tidied. */
const REAL_GAS_ERROR = new Error(
  'Missing or invalid parameters. Double check you have provided the correct parameters. URL: https://rpc.monad.xyz Request body: {"method":"eth_sendRawTransaction","params":["0x02f8b2818f808477359400852a77e32000830115af94"]} Request Arguments: from: 0x2Ea1A81aa3931C2abF6F23421d7C1493a252EaA6 Contract Call: address: 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a function: approve(address spender, uint256 amount) Docs: https://viem.sh/docs/contract/writeContract Details: Signer had insufficient balance Version: viem@2.56.3',
)

describe('describeTxFailure', () => {
  it('turns the gas failure into an instruction, and flags it as a gas problem', () => {
    const f = describeTxFailure(REAL_GAS_ERROR)
    expect(f.needsGas).toBe(true)
    expect(f.message).toContain('MON')
    expect(f.message).not.toContain('viem')
    expect(f.message.length).toBeLessThan(120)
  })

  it('never shows a library blob, whatever the failure', () => {
    for (const raw of [REAL_GAS_ERROR.message, 'TransactionExecutionError: foo\n    at doThing (viem@2.56.3)', 'Details: 0x' + 'a'.repeat(64)]) {
      expect(describeTxFailure(new Error(raw)).message).not.toMatch(/viem@|Request Arguments|0x[0-9a-f]{64}/i)
    }
  })

  it('names the cancelled signature rather than calling it an error', () => {
    expect(describeTxFailure(new Error('User rejected the request.')).message).toContain('cancelled')
  })

  it('keeps a message Henad wrote for a person', () => {
    const ours = 'The FX market is closed until Sunday evening.'
    expect(describeTxFailure(new Error(ours)).message).toBe(ours)
  })

  it('reads the cause, where viem hides the useful line', () => {
    const outer = new Error('Transaction failed')
    ;(outer as { cause?: unknown }).cause = new Error('insufficient funds for gas * price + value')
    expect(describeTxFailure(outer).needsGas).toBe(true)
  })

  it('says something plain when it has no idea', () => {
    expect(describeTxFailure({ weird: true }).message).toBe('That did not go through, and nothing moved.')
  })
})
