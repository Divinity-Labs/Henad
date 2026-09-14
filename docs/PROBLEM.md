# The problem, and what Henad does about it

Written for the submission, the README and the film. Every figure here is one this
project measured, not one it borrowed.

---

## The problem

**Cross-border payments hide their price, and the hiding is structural rather than
dishonest.**

When you send money abroad you are shown two numbers: an amount and a fee. Often the fee
is zero. The real cost is in neither. It sits in the exchange rate you were given, in the
gap between the mid-market rate at the moment your money moved and the rate the provider
actually used. That gap is the spread, and it is the business.

You cannot check it, and the reason is simple. Pricing a transfer takes two numbers, and
you are only ever given one. The provider knows the reference rate and the executed rate.
You know what arrived. Without the first number the second is unfalsifiable: any rate can
be described as a good one.

This produces three failures that stack.

### 1. The quote is unauditable at the moment you accept it

You approve a rate without knowing what it is a discount from. "No fees" is accurate and
uninformative at the same time. The information you would need to evaluate the offer is
held by the party making it.

### 2. The record afterwards comes from the same party

Even where a rate is disclosed, the receipt is issued by the company that chose the rate.
There is no independent artifact. Nothing a recipient, a regulator, an accountant or a
journalist can check without asking the provider to confirm its own numbers.

### 3. Some corridors have no price at all, and this is never said out loud

This is the failure nobody names. Not "expensive" — absent.

On Monad, Chainlink runs exactly five fiat feeds: euro, pound, Swiss franc, yen, Canadian
dollar. None of them is African. Pyth publishes no naira feed on any chain. The one
African currency it does publish, the rand, sits in Monad's Pyth contract with a publish
time of 2 September 2025, and every staleness-checked read of it reverts.

Faced with that, infrastructure normally does one of two things: pretends the corridor
does not exist, or ships a number it cannot source. Both are worse than saying nothing.

---

## What Henad does

**Settle the payment and the proof in the same transaction.**

One on-chain transaction reads a public reference rate, swaps through a public venue,
delivers to the recipient, and writes a receipt. There is no step where a number is
chosen privately.

### The quote states the spread before you sign

Not in the confirmation email. On the screen you approve, in the recipient's own currency
and in basis points:

> You are paying **£0.61** in spread. That is **31 bps**.

The reference rate is named with its source, and the venue is named too. Nothing is
described as free.

### The spread is enforced, not merely displayed

This is the part that makes it a mechanism rather than a claim. The router computes the
spread on-chain at settlement, from the same feed it names, and compares it against the
cap the payer approved. If the fill is worse than that cap, **the transaction reverts and
nothing moves.** The number is not a disclosure printed after the fact. It is a condition
of the payment happening at all.

### The receipt is an on-chain artifact, not a document we issue

Every settlement writes an attestation: the corridor, the reference rate, the executed
rate, the spread in basis points, the rate source, the venue, the amounts and the block.
It is readable by anyone, directly from the chain, with no account and no permission, and
it does not depend on Henad continuing to exist.

A measured example, settled end to end against the live Mento pool and live Chainlink
feeds:

| | |
| --- | --- |
| Paid | $10.00 AUSD |
| Received | £7.3883 GBPm |
| Reference rate | 1 USD = £0.74036 |
| Executed rate | 1 USD = £0.73888 |
| Spread | 19 bps |

### It refuses to price what it cannot price, and says why

The registry carries `USD → NGN` with a rate source of none. The app offers the corridor,
declines to quote it, and shows the reason where a rate would be. Closing that corridor
needs two decisions from two organisations, neither of which is Henad, and the product
names them rather than implying it could fix them.

Shipping a corridor you refuse to quote is a strange thing to do. It is also the only
honest option, and it is the argument: an FX product that will not invent a number is
demonstrating precisely the discipline its receipts claim.

### Nobody needs a wallet

The account comes from a passkey. Face or fingerprint, no seed phrase, no extension, no
app store, and no gas token: the payer never holds MON. The recipient needs nothing at
all, because the receipt is a public link.

---

## Why this chain

Settlement finality is about 600ms, so the quote a person approves is the quote that
executes. There is no window in which the rate drifts between approval and inclusion,
which is what makes stating the spread in advance meaningful rather than decorative.

Monad also carries the pieces this needs in public: Chainlink fiat feeds and Mento's FX
pools, both readable by anyone, so the reference rate and the venue are independently
checkable rather than internal.

---

## In one paragraph

Cross-border payments hide their cost in the exchange rate, and you cannot audit it
because you are never shown what the rate was a discount from. Henad settles the payment
through public on-chain FX and writes the reference rate, the executed rate and the exact
spread into an on-chain receipt anyone can read. The spread is stated before you sign and
enforced when you do: if the fill is worse than the cap you approved, nothing moves. And
where a corridor has no honest price on this chain, which today includes every African
currency, Henad says so instead of inventing one.

**The payment is the product. The receipt is the proof.**
