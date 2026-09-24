import { useEffect, useMemo, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SOURCE_ASSETS, resolveNad, settleableFrom, type Contact, type Corridor, type SourceAssetSymbol } from '@henad/core'
import type { RateDto } from '@/lib/api'
import { appChain } from '@/lib/config'
import { describeRecipient, initials, safeParseRecipient, sourceLine, type Recipient } from '@/lib/contacts'
import { age, atRate, rateLineText, tokenText } from '@/lib/display'
import { Button, Card, Chip, ErrorText, Eyebrow, TextLink, TierBadge } from '@/ui'
import { color, font, track } from '@/theme'
import { parseAmount, sanitizeAmount, units } from './format'
import { TokenIcon } from '@/tokens/TokenIcon'

/** How long typing must pause before a `.nad` name is looked up or a typo is pointed out. */
const SETTLE_MS = 450

/** Contacts listed before "Show all": enough for the people someone actually pays. */
const CONTACTS_SHOWN = 5

/**
 * S1. Amount, corridor and recipient.
 *
 * Departures from the canvas, each because the design shows something this app does not do:
 * - No "Fund from another chain · Aurora Intents" row. That route is not built, and a link
 *   that goes nowhere is a claim.
 * - The recipient is "Ada Okonkwo" only when the payer saved her as that. A name from a pay
 *   link is shown as the link's claim, and a bare account as "Account 2EA1…EAA6"; the full
 *   account number sits one tap away under Details, never in the way.
 * - The tier line is computed from the registry, so it says what is true today rather than
 *   what was true when the canvas was drawn.
 */
export function AmountStep({
  corridors,
  corridor,
  onCorridor,
  rate,
  now,
  amount,
  onAmount,
  recipient,
  recipientText,
  onRecipientText,
  onChoose,
  onClearRecipient,
  contacts,
  onPaste,
  onScan,
  balance,
  source,
  onSource,
  busy,
  error,
  onQuote,
  onWhy,
}: {
  corridors: Corridor[]
  corridor: Corridor
  onCorridor: (c: Corridor) => void
  rate: RateDto | undefined
  now: number
  amount: string
  onAmount: (v: string) => void
  recipient: Recipient | null
  /** What is typed in the recipient field. Links and account numbers are chosen as they land. */
  recipientText: string
  onRecipientText: (v: string) => void
  /** Must keep its identity between renders: a new one would look the same name up again. */
  onChoose: (r: Recipient) => void
  onClearRecipient: () => void
  contacts: Contact[]
  onPaste: () => void
  onScan: () => void
  balance: bigint | null
  source: { symbol: SourceAssetSymbol; decimals: number }
  onSource: (symbol: SourceAssetSymbol) => void
  busy: boolean
  error: string | null
  onQuote: () => void
  onWhy: () => void
}) {
  const [picking, setPicking] = useState(false)
  const [pickingSource, setPickingSource] = useState(false)
  const [details, setDetails] = useState(false)
  const [allContacts, setAllContacts] = useState(false)
  // The recipient field sits at the bottom of the screen, under the keyboard once it opens.
  // The avoiding view shrinks the scroll area and this brings the field back into view.
  const scroll = useRef<ScrollView>(null)
  const parsed = useMemo(() => parseAmount(amount, source.decimals), [amount, source.decimals])
  const reference = rate?.rate ? BigInt(rate.rate) : null
  const targetDecimals = corridor.targetAsset?.decimals ?? 18

  const receives = parsed && reference ? tokenText(atRate(parsed, source.decimals, reference, targetDecimals), targetDecimals, corridor.targetAsset?.symbol ?? corridor.target, corridor.currencyDp) : '—'

  const tierLine = useMemo(() => {
    const others = corridors.filter((c) => c.key !== corridor.key)
    const live = others.filter((c) => c.tier === 'live').map((c) => c.target)
    const quote = others.filter((c) => c.tier === 'quote').map((c) => c.target)
    return [live.length ? `${live.join(' ')} live` : null, quote.length ? `${quote.join(' ')} priced only` : null].filter(Boolean).join(' · ')
  }, [corridors, corridor.key])

  const blocker = useMemo(() => {
    if (corridor.tier !== 'live') return corridor.note
    // The router has no corridor for this pair, so it would revert. Say it here, not at signing.
    if (!settleableFrom(corridor, source.symbol)) return `${source.symbol} cannot fund USD → ${corridor.target}. ${corridor.sources.join(' or ')} can.`
    if (!parsed) return 'Enter an amount.'
    if (balance !== null && parsed > balance) return `That is more than your ${source.symbol} balance.`
    if (!recipient) return 'Choose who to pay.'
    if (!reference) return 'The reference rate is unavailable right now.'
    return null
  }, [corridor, parsed, balance, recipient, source.symbol, reference])

  const who = useMemo(() => (recipient ? describeRecipient(recipient, contacts) : null), [recipient, contacts])

  // Typing a name filters the contacts, so "Ad" finds Ada before anything is looked up.
  const typed = recipientText.trim().toLowerCase()
  const matches = useMemo(() => (typed ? contacts.filter((c) => c.name.toLowerCase().includes(typed)) : contacts), [contacts, typed])
  const shownContacts = allContacts ? matches : matches.slice(0, CONTACTS_SHOWN)

  // What the field held once typing paused. A `.nad` name is looked up from this rather than
  // on every keystroke, and a half-typed entry is not called invalid while it is being typed.
  const [settled, setSettled] = useState(recipientText)
  useEffect(() => {
    const id = setTimeout(() => setSettled(recipientText), SETTLE_MS)
    return () => clearTimeout(id)
  }, [recipientText])

  const entry = useMemo(() => safeParseRecipient(recipientText), [recipientText])
  // The `.nad` name to look up: the field's entry once typing has paused on it, and only while
  // nobody is chosen. Any edit, a paste, a tapped contact or an arriving pay link turns this
  // null, which cancels a lookup still in flight, so a late answer for "ada.nad" can never
  // replace whoever the payer chose after asking for it.
  const pendingNad = !recipient && settled === recipientText && entry.kind === 'nad' ? entry.nadName : null
  const [lookup, setLookup] = useState<{ name: string; state: 'looking' | 'none' | 'failed' } | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!pendingNad) {
      setLookup(null)
      return
    }
    let live = true
    setLookup({ name: pendingNad, state: 'looking' })
    resolveNad(appChain(), pendingNad).then(
      (address) => {
        if (!live) return
        if (address) {
          setLookup(null)
          onChoose({ address, nadName: pendingNad })
        } else {
          setLookup({ name: pendingNad, state: 'none' })
        }
      },
      () => {
        if (live) setLookup({ name: pendingNad, state: 'failed' })
      },
    )
    return () => {
      live = false
    }
  }, [pendingNad, attempt, onChoose])

  const status = useMemo(() => {
    if (entry.kind === 'nad') {
      const state = lookup && lookup.name === entry.nadName ? lookup.state : 'looking'
      if (state === 'none') return 'No account has that name.'
      if (state === 'failed') return 'That name could not be looked up just now. Check your connection.'
      return `Looking up ${entry.nadName}…`
    }
    // Someone typing a contact's name is not making a mistake.
    if (entry.kind === 'invalid' && settled === recipientText && matches.length === 0) return entry.reason
    return null
  }, [entry, lookup, settled, recipientText, matches.length])

  const rateMeta =
    corridor.tier !== 'live' ? corridor.shortNote : rate?.stale ? 'stale' : rate?.updatedAt ? `Mento · Chainlink · ${age(now / 1000 - rate.updatedAt)}` : 'reading…'

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView ref={scroll} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <View style={s.body}>
        <View style={s.rowBetween}>
          <Eyebrow tone="purple">Send</Eyebrow>
          <Eyebrow>Step 1 of 2</Eyebrow>
        </View>

        <Card style={s.card}>
          <View style={s.rowBetween}>
            <Eyebrow>You send</Eyebrow>
            <Eyebrow>{balance === null ? 'Balance —' : `Balance ${units(balance, source.decimals, 2)}`}</Eyebrow>
          </View>
          <View style={s.amountRow}>
            <View style={s.amountField}>
              <Text style={s.amount}>$</Text>
              <TextInput
                style={[s.amount, s.amountInput]}
                value={amount}
                onChangeText={(v) => onAmount(sanitizeAmount(v))}
                placeholder="0.00"
                placeholderTextColor={color.border}
                keyboardType="decimal-pad"
                accessibilityLabel="Amount to send"
              />
            </View>
            <View style={s.chipRow}>
              <TokenIcon symbol={source.symbol} size={22} />
              <Chip filled onPress={() => setPickingSource((v) => !v)}>{`${source.symbol} ▾`}</Chip>
            </View>
          </View>
          {pickingSource ? (
            <View style={s.picker}>
              {SOURCE_ASSETS.map((a) => (
                <Pressable
                  key={a.symbol}
                  onPress={() => {
                    onSource(a.symbol)
                    setPickingSource(false)
                  }}
                  style={[s.pickRow, a.symbol === source.symbol && s.pickRowOn]}
                >
                  <View style={s.chipRow}>
                    <TokenIcon symbol={a.symbol} size={20} />
                    <Text style={s.pickText}>{a.symbol}</Text>
                  </View>
                  <Text style={s.pickMeta}>{a.symbol === 'AUSD' ? 'Agora dollar' : 'Circle USD Coin'}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </Card>

        <View style={s.rateLine}>
          <Text style={s.rateValue}>{reference ? rateLineText(reference, corridor) : `1 USD = ${corridor.targetSymbol} —`}</Text>
          <Text style={s.rateMeta}>{rateMeta}</Text>
        </View>

        <Card style={s.card}>
          <Eyebrow>Recipient receives</Eyebrow>
          <View style={s.amountRow}>
            <Text style={s.amount} numberOfLines={1} adjustsFontSizeToFit>
              {receives}
            </Text>
            <View style={s.chipRow}>
              {corridor.targetAsset ? <TokenIcon symbol={corridor.targetAsset.symbol} size={22} /> : null}
              <Chip filled onPress={() => setPicking((p) => !p)}>{`${corridor.target} ▾`}</Chip>
            </View>
          </View>
          {picking ? (
            <View style={s.picker}>
              {corridors.map((c) => {
                const fundable = settleableFrom(c, source.symbol)
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => {
                      onCorridor(c)
                      setPicking(false)
                    }}
                    style={[s.pickRow, c.key === corridor.key && s.pickRowOn]}
                  >
                    <View style={s.chipRow}>
                      {c.targetAsset ? <TokenIcon symbol={c.targetAsset.symbol} size={20} /> : null}
                      <Text style={[s.pickText, !fundable && { color: color.muted }]}>{`USD → ${c.target}`}</Text>
                    </View>
                    {/* A pair the router has no corridor for reverts; say so here rather than at signing. */}
                    {c.tier === 'live' && !fundable ? <Text style={s.pickMeta}>{`${c.sources.join(' ') || 'not'} only`}</Text> : <TierBadge tier={c.tier} />}
                  </Pressable>
                )
              })}
            </View>
          ) : null}
          <Text style={s.help}>At the reference rate. The exact amount after spread comes before you sign.</Text>
          <View style={s.tierRow}>
            <Text style={s.tierText}>{tierLine.toUpperCase()}</Text>
            <TextLink label="Why →" tone="purple" onPress={onWhy} />
          </View>
        </Card>

        <Card style={s.card}>
          <View style={s.rowBetween}>
            <Eyebrow>Pay to</Eyebrow>
            {recipient ? (
              <TextLink
                label="Change"
                onPress={() => {
                  setDetails(false)
                  onClearRecipient()
                }}
              />
            ) : null}
          </View>
          {recipient && who ? (
            <>
              <View style={s.who}>
                <View style={s.avatar}>
                  <Text style={s.avatarText}>{initials(who.label, who.source, recipient.address)}</Text>
                </View>
                <View style={s.recipientText}>
                  <Text style={s.recipientName} numberOfLines={1}>
                    {who.label}
                  </Text>
                  <Text style={[s.recipientSource, who.source === 'link' && s.claim]}>{sourceLine(who.source, recipient.nadName)}</Text>
                </View>
              </View>
              <Pressable onPress={() => setDetails((d) => !d)} style={s.disclosure} accessibilityRole="button" accessibilityState={{ expanded: details }}>
                <Text style={s.disclosureText}>DETAILS</Text>
                <Text style={s.disclosureText}>{details ? '▴' : '▾'}</Text>
              </Pressable>
              {details ? (
                <View style={s.details}>
                  <Eyebrow>Account number</Eyebrow>
                  <Text style={s.accountNumber} selectable>
                    {recipient.address}
                  </Text>
                </View>
              ) : null}
            </>
          ) : (
            <>
              {shownContacts.map((c) => (
                <Pressable
                  key={c.address}
                  onPress={() => onChoose({ address: c.address })}
                  style={({ pressed }) => [s.contact, pressed && s.pickRowOn]}
                  accessibilityRole="button"
                  accessibilityLabel={`Pay ${c.name}`}
                >
                  <View style={s.avatarSmall}>
                    <Text style={s.avatarText}>{initials(c.name, 'contact', c.address)}</Text>
                  </View>
                  <View style={s.recipientText}>
                    <Text style={s.contactName} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <Text style={s.recipientSource}>{c.payments === 0 ? 'Saved contact' : c.payments === 1 ? 'Paid once' : `Paid ${c.payments} times`}</Text>
                  </View>
                </Pressable>
              ))}
              {matches.length > CONTACTS_SHOWN && !allContacts ? <TextLink label={`Show all ${matches.length}`} tone="purple" onPress={() => setAllContacts(true)} /> : null}
              <View style={[s.inputRow, contacts.length > 0 && s.inputRule]}>
                <TextInput
                  style={s.recipientInput}
                  value={recipientText}
                  onChangeText={onRecipientText}
                  placeholder={contacts.length > 0 ? 'Or a Henad link, .nad name, account number' : 'Henad link, .nad name or account number'}
                  placeholderTextColor={color.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Who to pay: a Henad link, a .nad name or an account number"
                  onFocus={() => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 300)}
                />
                <TextLink label="Scan" tone="purple" onPress={onScan} />
                <TextLink label="Paste" tone="purple" onPress={onPaste} />
              </View>
              {status ? (
                <View style={s.statusRow}>
                  <Text style={s.status}>{status}</Text>
                  {entry.kind === 'nad' && lookup?.name === entry.nadName && lookup.state === 'failed' ? (
                    <TextLink label="Try again" tone="purple" onPress={() => setAttempt((a) => a + 1)} />
                  ) : null}
                </View>
              ) : null}
            </>
          )}
        </Card>

        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button label="Get quote" variant={blocker ? 'disabled' : 'primary'} onPress={onQuote} busy={busy} />
        <Text style={s.foot}>{blocker ?? 'Nothing moves until you approve the rate.'}</Text>
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scroll: { flexGrow: 1 },
  body: { flex: 1, gap: 10, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  card: { padding: 16, gap: 10 },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  amountField: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  amount: { fontFamily: font.display, fontSize: 38, letterSpacing: track(38, -0.035), color: color.ink, flexShrink: 1 },
  amountInput: { flex: 1, padding: 0, margin: 0 },
  rateLine: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, gap: 8 },
  rateValue: { fontFamily: font.mono, fontSize: 11, color: color.ink },
  rateMeta: { fontFamily: font.mono, fontSize: 11, color: color.muted, flexShrink: 1, textAlign: 'right' },
  picker: { borderTopWidth: 1, borderTopColor: color.hairline2 },
  pickRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9 },
  pickRowOn: { backgroundColor: color.rowTint },
  pickText: { fontFamily: font.mono, fontSize: 12, color: color.ink },
  pickMeta: { fontFamily: font.mono, fontSize: 10, letterSpacing: track(10, 0.06), color: color.muted },
  help: { fontFamily: font.sans, fontSize: 12, lineHeight: 18, color: color.grey },
  tierRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: color.hairline2 },
  tierText: { flex: 1, fontFamily: font.mono, fontSize: 10, letterSpacing: track(10, 0.08), color: color.muted },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 8, backgroundColor: color.lilac, alignItems: 'center', justifyContent: 'center' },
  avatarSmall: { width: 32, height: 32, borderRadius: 6, backgroundColor: color.lilac, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: font.displayBold, fontSize: 13, color: color.lilacInk },
  recipientText: { flex: 1, gap: 2 },
  recipientName: { fontFamily: font.sansMedium, fontSize: 17, color: color.ink },
  recipientSource: { fontFamily: font.mono, fontSize: 11, color: color.muted },
  // A name from a link is the one label on this card nobody has checked, so it is set apart.
  claim: { color: color.lilacInk },
  disclosure: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderTopColor: color.hairline2 },
  disclosureText: { fontFamily: font.mono, fontSize: 10, letterSpacing: track(10, 0.08), color: color.muted },
  details: { gap: 4 },
  accountNumber: { fontFamily: font.mono, fontSize: 12, lineHeight: 18, color: color.ink },
  contact: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderRadius: 6 },
  contactName: { fontFamily: font.sansMedium, fontSize: 14, color: color.ink },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  inputRule: { borderTopWidth: 1, borderTopColor: color.hairline2 },
  recipientInput: { flex: 1, fontFamily: font.mono, fontSize: 13, color: color.ink, paddingVertical: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  status: { flex: 1, fontFamily: font.sans, fontSize: 12, lineHeight: 18, color: color.grey },
  foot: { textAlign: 'center', fontFamily: font.mono, fontSize: 10, letterSpacing: track(10, 0.06), color: color.muted },
})
