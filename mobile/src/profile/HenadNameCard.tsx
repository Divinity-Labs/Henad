import { useEffect, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import type { Address } from 'viem'
import { handleProblem, toHandle } from '@henad/core'
import { claimHandle, handleIsFree } from '@/lib/handles'
import { describeAccountError, unlockStoredAccount } from '@/lib/mera'
import { Button, Card, Eyebrow } from '@/ui'
import { color, font, track } from '@/theme'

type Check = { name: string; state: 'checking' | 'free' | 'taken' | 'error' }

/**
 * The account's Henad name: shown once held, claimable until then. The same as the web's
 * HenadName: the passkey signs the claim, Henad's relayer pays for it, so it costs nothing.
 *
 * `handle` is undefined while it is being read, so a held name never flashes a claim form.
 */
export function HenadNameCard({
  address,
  handle,
  suggestion,
  onClaimed,
}: {
  address: Address
  handle: string | null | undefined
  suggestion: string | null
  onClaimed: (handle: string) => void
}) {
  const [typed, setTyped] = useState<string | null>(null)
  const [check, setCheck] = useState<Check | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Until they type, offer the name on their pay link, when it could be one.
  const input = typed ?? (toHandle((suggestion ?? '').replace(/\s+/g, '_')) ?? '')
  const name = toHandle(input)

  useEffect(() => {
    if (!name || handle) return
    let live = true
    const id = setTimeout(() => {
      handleIsFree(name).then(
        (free) => live && setCheck({ name, state: free ? 'free' : 'taken' }),
        () => live && setCheck({ name, state: 'error' }),
      )
    }, 400)
    return () => {
      live = false
      clearTimeout(id)
    }
  }, [name, handle])
  const status = name ? (check?.name === name ? check.state : 'checking') : null

  async function claim() {
    if (!name) return
    setBusy(true)
    setError(null)
    let account: Awaited<ReturnType<typeof unlockStoredAccount>> | null = null
    try {
      account = await unlockStoredAccount()
      if (account.address.toLowerCase() !== address.toLowerCase()) throw new Error('That passkey opens a different account.')
      onClaimed(await claimHandle(account.account, name))
    } catch (e) {
      setError(account ? (e instanceof Error ? e.message : 'The name could not be claimed. Try again.') : describeAccountError(e))
    } finally {
      account?.end()
      setBusy(false)
    }
  }

  if (handle === undefined) return null

  if (handle) {
    return (
      <Card style={s.card}>
        <Eyebrow>Your Henad name</Eyebrow>
        <Text style={s.held}>@{handle}</Text>
        <Text style={s.help}>Anyone on Henad can pay you by typing this name.</Text>
      </Card>
    )
  }

  const problem = handleProblem(input)
  const note =
    error ??
    problem ??
    (status === 'checking'
      ? 'Checking…'
      : status === 'taken'
        ? `@${name} is taken. Try another.`
        : status === 'error'
          ? 'Could not check that name just now.'
          : status === 'free'
            ? `@${name} is free. People will be able to pay you by typing it.`
            : 'Letters, numbers and underscores, 3 to 20 characters.')
  const warn = Boolean(error || problem || status === 'taken')
  return (
    <Card style={s.card}>
      <Eyebrow>Claim your Henad name · free</Eyebrow>
      <View style={s.row}>
        <View style={s.field}>
          <Text style={s.at}>@</Text>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={(t) => {
              setTyped(t)
              setError(null)
            }}
            placeholder="yourname"
            placeholderTextColor={color.muted}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={21}
            accessibilityLabel="Henad name to claim"
          />
        </View>
        <Button label={busy ? 'Claiming…' : 'Claim'} small height={44} busy={busy} variant={status === 'free' && !busy ? 'primary' : 'disabled'} onPress={() => void claim()} style={s.button} />
      </View>
      <Text style={[s.note, warn && s.warn]}>{note}</Text>
    </Card>
  )
}

const s = StyleSheet.create({
  card: { padding: 16, gap: 10 },
  held: { fontFamily: font.display, fontSize: 32, letterSpacing: track(32, -0.03), color: color.ink },
  help: { fontFamily: font.sans, fontSize: 12, lineHeight: 18, color: color.grey },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  field: { flex: 1, height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: color.border, borderRadius: 4 },
  at: { fontFamily: font.sans, fontSize: 15, color: color.muted },
  input: { flex: 1, padding: 0, marginLeft: 2, fontFamily: font.sans, fontSize: 15, color: color.ink },
  button: { paddingHorizontal: 16 },
  note: { fontFamily: font.sans, fontSize: 12, lineHeight: 18, color: color.grey, borderLeftWidth: 2, borderLeftColor: 'transparent', paddingLeft: 10 },
  warn: { borderLeftColor: color.amber },
})
