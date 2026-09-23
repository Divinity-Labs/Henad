'use client'

import { useEffect, useState } from 'react'
import { parseUnits, type Hex } from 'viem'
import { Button } from '@/components/ui/Button'
import { TokenIcon } from '@/components/ui/TokenIcon'
import { Card, Notice, StepHeader } from '@/components/send/send-ui'
import { appChain } from '@/lib/chain'
import { money, tokens } from '@/lib/format'
import { describeAccountError, readBalance, unlockStoredAccount } from '@/lib/send-mera'
import { approveVault, depositAusd, previewDeposit, readEarnState, readVaultAllowance, redeemShares, redeemValue, type EarnState } from '@/lib/earn'
import { useStoredAddress } from '@/lib/use-stored-address'

const DECIMALS = 6

/**
 * Earn: AUSD that is not being sent, put to work in Upshift's earnAUSD vault.
 *
 * The screen states what it can read and refuses to imply the rest. The rate shown is the
 * one the vault has actually delivered, computed from its own share price a week ago, not a
 * headline anybody published. The exit fee is named before the deposit, not after it. And
 * the warning is plain, because a screen that shows a percentage next to a dollar balance
 * will be read as a savings account unless it says otherwise.
 */
export function EarnView({ network }: { network: string }) {
  const address = useStoredAddress()
  const [state, setState] = useState<EarnState | null>(null)
  const [ausd, setAusd] = useState<bigint | null>(null)
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit')
  const [amount, setAmount] = useState('')
  const [shares, setShares] = useState<bigint | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<Hex | null>(null)

  useEffect(() => {
    let live = true
    const read = () =>
      Promise.all([readEarnState(address ?? null), address ? readBalance(address, 'AUSD') : Promise.resolve(null)]).then(
        ([s, b]) => {
          if (!live) return
          setState(s)
          setAusd(b)
        },
        () => {},
      )
    void read()
    const id = window.setInterval(() => void read(), 20_000)
    return () => {
      live = false
      window.clearInterval(id)
    }
  }, [address, txHash])

  const units = /^\d+(\.\d{1,6})?$/.test(amount.trim()) && Number(amount) > 0 ? parseUnits(amount.trim(), DECIMALS) : null

  // What this deposit buys, asked of the vault rather than derived, so the figure on screen
  // is the one the contract will use.
  useEffect(() => {
    let live = true
    const id = window.setTimeout(() => {
      if (mode !== 'deposit' || units === null) return setShares(null)
      previewDeposit(units).then(
        (s) => live && setShares(s),
        () => live && setShares(null),
      )
    }, 250)
    return () => {
      live = false
      window.clearTimeout(id)
    }
  }, [units, mode])

  const depositing = mode === 'deposit'
  const overBalance =
    units !== null && (depositing ? ausd !== null && units > ausd : state !== null && units > (state.value * BigInt(10_000 - state.instantFeeBps)) / 10_000n)

  const blocker = !address
    ? 'Sign in first.'
    : units === null
      ? depositing
        ? 'Enter an amount of AUSD.'
        : 'Enter an amount to withdraw.'
      : overBalance
        ? depositing
          ? 'That is more AUSD than you hold.'
          : 'That is more than this account has in the vault.'
        : depositing && state?.depositsPaused
          ? 'The vault is not taking deposits right now.'
          : !depositing && state?.withdrawalsPaused
            ? 'The vault has paused withdrawals right now.'
            : null

  async function submit() {
    if (units === null || !address || !state) return
    setBusy(true)
    setError(null)
    setTxHash(null)
    let account
    try {
      account = await unlockStoredAccount()
    } catch (e) {
      setError(describeAccountError(e))
      setBusy(false)
      return
    }
    try {
      if (depositing) {
        // Approve only what this deposit needs: the vault is upgradeable, so a standing
        // unlimited allowance would outlive the code it was granted to.
        if ((await readVaultAllowance(address)) < units) {
          const approval = await approveVault(account.account, units)
          await appChain().waitForTransactionReceipt({ hash: approval, timeout: 30_000 })
        }
        const hash = await depositAusd(account.account, units)
        await appChain().waitForTransactionReceipt({ hash, timeout: 30_000 })
        setTxHash(hash)
      } else {
        // The field is in AUSD; the vault redeems shares, so convert at the share price and
        // never ask for more shares than the account holds.
        const wanted = (units * 1_000_000n) / state.sharePrice
        const hash = await redeemShares(account.account, wanted > state.shares ? state.shares : wanted)
        await appChain().waitForTransactionReceipt({ hash, timeout: 30_000 })
        setTxHash(hash)
      }
      setAmount('')
      setShares(null)
    } catch (e) {
      setError(`${e instanceof Error ? e.message : 'The transaction failed.'} Nothing moved.`)
    } finally {
      account.end()
      setBusy(false)
    }
  }

  const apy = state?.apy

  return (
    <div className="flex flex-1 flex-col gap-3 px-4 pb-6 pt-5">
      <StepHeader left="Earn" right={network} />

      <Card className="flex flex-col gap-[10px] p-4">
        <div className="label flex justify-between text-muted">
          <span>In the vault</span>
          <span className="tabular">{state === null ? '—' : `${tokens(state.shares, DECIMALS, 'earnAUSD', 2)}`}</span>
        </div>
        <div className="font-display text-[38px] font-medium leading-none tracking-[-.035em] tabular">
          {state === null ? '—' : money(state.value, DECIMALS, '$')}
        </div>
        <p className="m-0 font-mono text-[11px] text-muted tabular">
          {state === null
            ? 'Reading the vault…'
            : `1 share = ${money(state.sharePrice, DECIMALS, '$', 6)} · vault holds ${money(state.totalAssets, DECIMALS, '$', 0)}`}
        </p>
      </Card>

      <Card className="flex flex-col gap-[10px] p-4">
        <div className="label flex justify-between text-muted">
          <span>{depositing ? 'You deposit' : 'You withdraw'}</span>
          <span className="tabular">
            {depositing
              ? ausd === null
                ? 'AUSD —'
                : tokens(ausd, DECIMALS, 'AUSD', 2)
              : state === null
                ? '—'
                : `${money(redeemValue(state.shares, state.sharePrice, state.instantFeeBps), DECIMALS, '$')} available`}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <label className="flex min-w-0 flex-1 items-baseline font-display text-[38px] font-medium leading-none tracking-[-.035em]">
            <span className="sr-only">{depositing ? 'Amount of AUSD to deposit' : 'Amount of AUSD to withdraw'}</span>
            <span aria-hidden>$</span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="min-w-0 flex-1 bg-transparent p-0 tabular placeholder:text-dim-2"
              style={{ font: 'inherit' }}
            />
          </label>
          <span className="flex flex-none items-center gap-2 font-mono text-[12px]">
            <TokenIcon symbol="AUSD" size={22} />
            AUSD
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className="label text-purple disabled:text-muted"
            disabled={depositing ? ausd === null || ausd === 0n : state === null || state.shares === 0n}
            onClick={() => {
              if (depositing && ausd !== null) setAmount((Number(ausd) / 10 ** DECIMALS).toFixed(2))
              if (!depositing && state !== null) setAmount((Number(redeemValue(state.shares, state.sharePrice, state.instantFeeBps)) / 10 ** DECIMALS).toFixed(2))
            }}
          >
            Use all
          </button>
          <div className="flex gap-[6px]">
            {(['deposit', 'withdraw'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m)
                  setAmount('')
                  setError(null)
                }}
                aria-pressed={mode === m}
                className={`press rounded-full border px-3 py-[5px] font-mono text-[12px] ${mode === m ? 'border-purple text-ink' : 'border-border text-muted hover:border-muted'}`}
              >
                {m === 'deposit' ? 'Deposit' : 'Withdraw'}
              </button>
            ))}
          </div>
        </div>
        {depositing && shares !== null && (
          <p className="m-0 font-mono text-[11px] text-muted tabular">You receive {tokens(shares, DECIMALS, 'earnAUSD', 4)}</p>
        )}
        {!depositing && units !== null && state && (
          <p className="m-0 font-mono text-[11px] text-muted tabular">
            After the {state.instantFeeBps / 100}% instant-exit fee, {money((units * BigInt(10_000 - state.instantFeeBps)) / 10_000n, DECIMALS, '$')} reaches you
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-2 p-4">
        <div className="label flex justify-between text-muted">
          <span>What it has paid</span>
          <span className="tabular text-ink">{apy ? `${(apy.rate * 100).toFixed(2)}% a year` : 'not readable'}</span>
        </div>
        <p className="m-0 text-[12px] leading-[1.5] text-grey pretty">
          {apy
            ? `Worked out from the vault's own share price over the last ${apy.days.toFixed(1)} days, not from a published figure. It is what happened, not what happens next.`
            : 'The share price from a week ago could not be read, so there is no rate to show rather than a guess.'}
        </p>
      </Card>

      {error && <Notice>{error}</Notice>}
      {txHash && !error && (
        <Notice tone="info">
          {depositing ? 'Deposited. Your shares are in your own account.' : 'Withdrawn. The AUSD is back in your account.'}{' '}
          <a href={`https://monadscan.com/tx/${txHash}`} target="_blank" rel="noreferrer" className="text-purple">
            View the transaction ↗
          </a>
        </Notice>
      )}

      <div className="flex-1" />
      <Button size="xl" block variant={blocker || busy ? 'disabled' : 'primary'} onClick={() => void submit()}>
        {busy ? (depositing ? 'Depositing…' : 'Withdrawing…') : depositing ? 'Deposit AUSD' : 'Withdraw AUSD'}
      </Button>
      <p className="m-0 text-center font-mono text-[11px] text-muted">{blocker ?? 'Your passkey signs this, from your own account.'}</p>

      <p className="m-0 text-[12px] leading-[1.5] text-grey pretty">
        This is not a savings account and nothing here is insured. Upshift&apos;s vault lends your AUSD across Monad&apos;s lending markets, and that is
        where the yield comes from — it moves with those markets and it can go down. Your shares stay in your own account, Henad never holds them, and
        leaving immediately costs {state ? `${state.instantFeeBps / 100}%` : 'a small fee'}. The vault&apos;s contract can be upgraded by its operators.
      </p>
    </div>
  )
}
