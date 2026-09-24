# A payments app that never shows an address

Researched 24 Sep 2026 against Track 02's own example: *"A payments app that never mentions
a blockchain to the person using it."* Everything marked **verified** was read from Monad
mainnet.

## Where Henad leaks the chain today

| Moment | What the person sees | Why it hurts |
| --- | --- | --- |
| Choosing who to pay | A field that wants `0x…` | The first real decision in the app is a hex string |
| After paying | `0x2Ea1…EaA6` on the receipt | The recipient is a hash, not a person |
| Account | A QR of an address, "send only Monad assets" | Receiving money requires knowing what Monad is |
| Top up, Earn | "This account needs a little MON" | A second currency, just to move the first |
| Everywhere | AUSD, GBPm, earnAUSD, "Monad mainnet" | Token names where people expect dollars and pounds |

## What the rest of the industry does

- **Daimo** — usernames chosen at signup, written to an onchain name registry; payment
  links; passkeys. Nobody types an address. The trade-off it accepted: a public registry
  links a name to an address forever.
- **Peanut Protocol** — claim links. Funds sit in an escrow contract behind a secret carried
  in the URL; whoever opens the link claims them. The recipient needs no account in advance.
  Open source, 20+ EVM chains; no Monad deployment found.
- **Venmo / Cash App** — handles and contacts. The account number exists and is never the
  interface.

## What exists on Monad

| | Status | Detail |
| --- | --- | --- |
| **Nad Name Service** | **Verified** | `0xCc7a1bfF8845573dbF0B3b96e25B9b549d4a2eC7`. `getResolvedAddress(namehash)` and `getPrimaryNameForAddress(address)` work: `salmo.nad` resolves. **3,831 names in total.** |
| NNS data quality | **Verified: poor** | `monad.nad` and `keone.nad` both resolve to one address whose primary name is `ttestccloudflare`. Names are first-come, and the obvious ones are squatted. |
| AllDomains | Listed | `.mon`, `.nad`, `.chog` and others; a second, competing namespace. |
| Peanut on Monad | Not found | Would need our own escrow. |

**Conclusion on names:** NNS is worth *accepting* — typing `ada.nad` should work — but not
worth *depending* on. Almost no Henad user will own one, and a resolved name proves only that
someone registered it, not that it is the person you meant.

## The plan, in the order it pays off

### 1. Pay links, contacts, and hiding the address — no contracts, ~1 day

- **"Get paid" link on Account**: `usehenad.xyz/pay/<address>?n=Ada`. The recipient shares
  it on WhatsApp; the payer taps it and sees *Pay Ada*, amount first. The address rides in
  the link and never appears on screen.
- **Contacts**: after the first payment, name the recipient once. The send screen opens on a
  list of people, not a field. Stored on the device (web storage, SecureStore on the phone).
- **Recipient field** accepts, in order: a contact, a pay link, a QR, an `.nad` name. A raw
  `0x` still works, under "Paste an account number" — present, not the front door.
- **Receipts and screens** show names first; the address moves to a "Details" row.
- **Words**: "dollars" and "pounds" in the flow; token names in the fine print and receipts,
  where exactness is the point.

### 2. Henad handles — one small contract, ~1.5 days

`@ada` chosen at signup and written to a Henad name registry on Monad: a handle maps to an
address, the owner can change it, and the relayer pays the gas so signup still costs
nothing. Pay links become `usehenad.xyz/@ada`. Public by design, like Daimo's; the signup
screen says so.

Needs a mainnet deploy from the `henad-mainnet` keystore, which only you can unlock.

### 3. Claim links — a payment to someone with no account, ~3 days

Send to a link instead of a person. The funds wait in an escrow contract, behind a secret
that lives only in the link's fragment (never sent to a server). The recipient opens it,
makes a passkey, and the money moves to their new account; unclaimed links refund after a
set time. Funded by the same ERC-3009 authorisation payouts already use, so the sender still
needs no gas. This is the one that genuinely makes "never mentions a blockchain" true for
the recipient as well as the sender.

Needs its own tests, a mainnet deploy, and care: it holds money between two parties.

### 4. No second currency for gas

Top up and Earn ask the account for MON. Payouts already avoid this through the relayer.
The Upshift vault exposes `depositWithPermit`, which may allow a gasless Earn deposit the
same way; to be tested on a fork before it is promised.

## Recommendation

Build **1** now: it removes the address from every screen a first-time user touches, costs
no contract, and can ship in a day. Then **2** if the deploy fits the schedule. **3** is
the strongest answer to the track's sentence and the most work; decide after the video is
recorded.
