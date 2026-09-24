'use client'

import { useEffect, useState } from 'react'
import type { Address } from 'viem'
import { cleanName, findContact, parseRecipient, recipientLabel, resolveNad, type Contact, type ParsedRecipient } from '@henad/core'
import { appChain } from '@/lib/chain'
import { AccountNumber } from '@/components/AccountNumber'
import { Button } from '@/components/ui/Button'
import { Card, Notice, linkLabel } from './send-ui'

/**
 * Who the payout is for, without asking anyone to read an address: the payer's contacts, a
 * pay link, a `.nad` name, and last, never first, an account number.
 *
 * The one rule from @henad/core's recipients module holds on every screen here: a name that
 * came inside a link is somebody's claim, so it is always shown next to where it came from,
 * and only a name the payer typed themselves (a contact) is shown bare.
 */

export type RecipientSource = 'contact' | 'nad' | 'link' | 'account'

/** A chosen recipient as the screen shows it. */
export interface RecipientView {
  address: Address
  label: string
  source: RecipientSource
}

export interface RecipientChoice {
  address: Address
  linkName: string | null
  nadName: string | null
}

export function describeRecipient(address: Address, contacts: Contact[], nadName: string | null, linkName: string | null): RecipientView {
  const { label, source } = recipientLabel({ address, contact: findContact(contacts, address), nadName, linkName })
  return { address, label, source }
}

/** The line under a recipient's name that says how much to trust it. */
export function sourceLine(source: RecipientSource): string {
  switch (source) {
    case 'contact':
      return 'Saved contact'
    case 'link':
      return 'From their Henad link — not verified'
    case 'nad':
      return 'Found by its .nad name'
    case 'account':
      return 'New account'
  }
}

/** "AO" from "Ada Okonkwo"; the first two hex characters of the account when there is no name. */
export function initials(name: string, address: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length) return words.slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('')
  return address.slice(2, 4).toUpperCase()
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'Recipient'
}

/**
 * The name in "Ada receives". A contact's first name or a `.nad` name; a link's name is left
 * out, because this heading has no room for the "not verified" beside it.
 */
export function receiverName(r: RecipientView | null): string {
  if (r?.source === 'contact') return firstName(r.label)
  if (r?.source === 'nad') return r.label
  return 'Recipient'
}

function Avatar({ r }: { r: RecipientView }) {
  // "Account 2EA1…" would give "A2"; the account's own characters say more.
  const name = r.source === 'account' ? '' : r.label
  return (
    <div aria-hidden className="flex h-10 w-10 flex-none items-center justify-center rounded-[8px] bg-lilac font-display text-[13px] font-semibold text-purple-deep">
      {initials(name, r.address)}
    </div>
  )
}

function SourceText({ source }: { source: RecipientSource }) {
  return (
    <div className="flex items-center gap-[6px] font-mono text-[11px] text-muted">
      {source === 'link' && <span aria-hidden className="h-[6px] w-[6px] flex-none rounded-full bg-amber" />}
      <span className="truncate">{sourceLine(source)}</span>
    </div>
  )
}

/** The chosen recipient: the name large, where it came from underneath, the account number one tap away. */
export function ChosenRecipient({ recipient, onChange }: { recipient: RecipientView; onChange: () => void }) {
  return (
    <Card className="flex flex-col gap-[10px] px-4 py-3">
      <div className="flex items-center gap-3">
        <Avatar r={recipient} />
        <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <div className="truncate text-[15px] font-medium">{recipient.label}</div>
          <SourceText source={recipient.source} />
        </div>
        <button type="button" onClick={onChange} className={`press ${linkLabel} text-ink`}>
          Change
        </button>
      </div>
      <AccountNumber address={recipient.address} className="border-t border-hairline-2 pt-[10px]" />
    </Card>
  )
}

function RecipientRow({ r, detail, onClick }: { r: RecipientView; detail?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="press flex w-full items-center gap-3 rounded-[8px] px-2 py-2 text-left hover:bg-surface-2">
      <Avatar r={r} />
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="truncate text-[15px] font-medium text-ink">{r.label}</span>
        {detail ? <span className="truncate font-mono text-[11px] text-muted">{detail}</span> : <SourceText source={r.source} />}
      </span>
      <span className={`${linkLabel} flex-none text-purple`}>Pay</span>
    </button>
  )
}

function paidLine(c: Contact): string {
  if (c.payments === 0) return 'Not paid yet'
  return c.payments === 1 ? 'Paid once' : `Paid ${c.payments} times`
}

/**
 * `parseRecipient`, never throwing. A link cut off inside a %-escape, as chat apps sometimes
 * cut them, makes core's decodeURIComponent throw; this runs during render, so an uncaught
 * throw would take the whole send screen down with it.
 */
function safeParse(input: string): ParsedRecipient {
  try {
    return parseRecipient(input)
  } catch {
    return { kind: 'invalid', reason: 'That Henad link is damaged. Ask them to send it again.' }
  }
}

/** A value that settles once it has stopped changing for `ms`, so a half-typed name is not judged. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return settled
}

type Lookup = { nadName: string; state: 'looking' | 'found' | 'none' | 'error'; address: Address | null }

/**
 * A `.nad` name to its account, on the chain the app settles on. The result is kept with the
 * name it answers, so a slow answer for a name the payer has since changed is never shown.
 */
function useNadLookup(nadName: string | null): Lookup | null {
  const [done, setDone] = useState<Lookup | null>(null)
  useEffect(() => {
    if (!nadName) return
    let live = true
    resolveNad(appChain(), nadName).then(
      (address) => {
        if (live) setDone({ nadName, state: address ? 'found' : 'none', address })
      },
      (e: unknown) => {
        console.error('[nad]', e)
        if (live) setDone({ nadName, state: 'error', address: null })
      },
    )
    return () => {
      live = false
    }
  }, [nadName])
  if (!nadName) return null
  return done?.nadName === nadName ? done : { nadName, state: 'looking', address: null }
}

/**
 * Choosing who to pay. Opens on the payer's contacts, most recently paid first; below them one
 * field takes whatever the recipient sent: their Henad link, their `.nad` name, or an account
 * number for someone who only has that.
 */
export function RecipientPicker({
  contacts,
  input,
  canCancel,
  onInput,
  onPaste,
  onChoose,
  onCancel,
}: {
  contacts: Contact[]
  input: string
  /** true when a recipient is already chosen, so leaving without a new one keeps it */
  canCancel: boolean
  onInput: (value: string) => void
  onPaste: () => void
  onChoose: (choice: RecipientChoice) => void
  onCancel: () => void
}) {
  const parsed = safeParse(input)
  const settled = useSettled(input, 450)
  const typing = settled !== input
  const lookup = useNadLookup(!typing && parsed.kind === 'nad' ? parsed.nadName : null)

  let result = null
  if (parsed.kind === 'address' || parsed.kind === 'paylink') {
    const linkName = parsed.kind === 'paylink' ? parsed.name : null
    const r = describeRecipient(parsed.address, contacts, null, linkName)
    result = <RecipientRow r={r} onClick={() => onChoose({ address: parsed.address, linkName, nadName: null })} />
  } else if (parsed.kind === 'nad') {
    if (lookup?.state === 'found' && lookup.address) {
      const address = lookup.address
      const r = describeRecipient(address, contacts, lookup.nadName, null)
      result = <RecipientRow r={r} onClick={() => onChoose({ address, linkName: null, nadName: lookup.nadName })} />
    } else if (lookup?.state === 'none') {
      result = <Notice>No account has that name. Check the spelling, or ask them for their Henad link.</Notice>
    } else if (lookup?.state === 'error') {
      result = <Notice>That name could not be looked up just now. Try again, or ask them for their Henad link.</Notice>
    } else {
      result = <p className="m-0 font-mono text-[11px] text-muted">Looking up {parsed.nadName}…</p>
    }
  } else if (parsed.kind === 'invalid' && !typing) {
    result = <Notice>{parsed.reason}</Notice>
  }

  return (
    <Card className="flex flex-col gap-[10px] p-4">
      <div className="label flex justify-between text-muted">
        <span>Who are you paying?</span>
        {canCancel && (
          <button type="button" onClick={onCancel} className="press label text-ink">
            Cancel
          </button>
        )}
      </div>
      {contacts.length > 0 && (
        <ul aria-label="Your contacts" className="-mx-2 m-0 flex max-h-[228px] list-none flex-col overflow-y-auto p-0">
          {contacts.map((c) => (
            <li key={c.address}>
              <RecipientRow
                r={{ address: c.address, label: c.name, source: 'contact' }}
                detail={paidLine(c)}
                onClick={() => onChoose({ address: c.address, linkName: null, nadName: null })}
              />
            </li>
          ))}
        </ul>
      )}
      {/* Not a <label>: it would hand its clicks to the Paste button, the first control inside it. */}
      <div className={`flex flex-col gap-[6px] ${contacts.length > 0 ? 'border-t border-hairline-2 pt-[10px]' : ''}`}>
        <div className="label flex justify-between text-muted">
          <span>{contacts.length > 0 ? 'Someone new' : 'Their link or name'}</span>
          <button type="button" onClick={onPaste} className="press label text-purple">
            Paste
          </button>
        </div>
        <input
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Henad link, name.nad or account number"
          aria-label="A Henad link, a .nad name, or an account number"
          value={input}
          onChange={(e) => onInput(e.target.value)}
          className="w-full rounded-[4px] border border-border bg-surface px-3 py-[9px] text-[15px] text-ink placeholder:text-muted"
        />
      </div>
      {result}
    </Card>
  )
}

/**
 * Offered after a payout to someone the payer has not saved. Prefilled from what the screen
 * called them, and editable, because saving is the moment a link's claimed name becomes the
 * payer's own word for that account.
 */
export function SaveContact({ prefill, onSave }: { prefill: string; onSave: (name: string) => void }) {
  const [name, setName] = useState(prefill)
  // What saveContact will keep, not what trim() sees: a name of only invisible characters saves nothing.
  const ok = cleanName(name) !== null
  return (
    <Card className="flex flex-col gap-[10px] p-4">
      <div className="label text-muted">Save as a contact</div>
      <div className="flex gap-2">
        <label className="flex min-w-0 flex-1">
          <span className="sr-only">Contact name</span>
          <input
            type="text"
            autoComplete="off"
            placeholder="Their name"
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-[4px] border border-border bg-surface px-3 py-[9px] text-[15px] text-ink placeholder:text-muted"
          />
        </label>
        <Button variant={ok ? 'secondary' : 'disabled'} size="md" onClick={() => onSave(name)}>
          Save
        </Button>
      </div>
      <p className="m-0 text-[12px] leading-[1.5] text-grey pretty">Kept on this device only. Next time they are at the top of your list.</p>
    </Card>
  )
}

/** Before the first payout to an account the payer has not saved. Calm, because most are fine. */
export function FirstPaymentNotice() {
  return (
    <Notice tone="info">
      First payment to this account. If you can, check with them that it is theirs before you send: a payout cannot be pulled back.
    </Notice>
  )
}
