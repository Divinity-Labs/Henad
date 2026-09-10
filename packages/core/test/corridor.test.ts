import { describe, expect, it } from 'vitest'
import { keccak256, stringToBytes } from 'viem'
import { corridorId, deliveredAt, executedRate, spreadBps, spreadCost } from '../src/corridor'

// Same vectors as contracts/test/Corridor.t.sol. If one side changes, both must.
describe('corridor maths mirrors Corridor.sol', () => {
  it('corridorId is keccak256 of the pair string', () => {
    expect(corridorId('USD', 'GBP')).toBe(keccak256(stringToBytes('USD/GBP')))
    expect(corridorId('USD', 'GBP')).not.toBe(corridorId('GBP', 'USD'))
  })

  it('executedRate handles mixed decimals: 100 AUSD -> 78 GBPm = 0.78e18', () => {
    expect(executedRate(100n * 10n ** 6n, 6, 78n * 10n ** 18n, 18)).toBe(78n * 10n ** 16n)
  })

  it('spreadBps signs match the contract', () => {
    expect(spreadBps(80n * 10n ** 16n, 78n * 10n ** 16n)).toBe(250n)
    expect(spreadBps(78n * 10n ** 16n, 80n * 10n ** 16n)).toBe(-256n)
    expect(spreadBps(10n ** 18n, 10n ** 18n)).toBe(0n)
  })

  it('reverts on zero inputs like the contract', () => {
    expect(() => executedRate(0n, 6, 1n, 18)).toThrow('Corridor: zero source')
    expect(() => spreadBps(0n, 1n)).toThrow('Corridor: zero reference')
  })

  it('deliveredAt inverts executedRate', () => {
    const src = 12_345_678n // 12.345678 AUSD
    const delivered = 9_131_231_000_000_000_000n // 9.131231 GBPm
    const rate = executedRate(src, 6, delivered, 18)
    const back = deliveredAt(rate, src, 6, 18)
    expect(delivered - back).toBeLessThanOrEqual(10n ** 12n)
    expect(delivered - back).toBeGreaterThanOrEqual(0n)
  })

  it('spreadCost is the pounds lost to spread', () => {
    // reference 0.80, sender sends 100 AUSD, receives 78 GBPm -> lost 2 GBPm
    const cost = spreadCost(80n * 10n ** 16n, 100n * 10n ** 6n, 6, 78n * 10n ** 18n, 18)
    expect(cost).toBe(2n * 10n ** 18n)
  })
})
