# Henad

**Cross-border payouts that settle through onchain FX and emit a public, verifiable
receipt on every payment: the reference rate, the executed rate, and the exact spread
taken.**

Remittance pricing hides its real cost inside the exchange-rate spread. The advertised
"zero fee" is paid in the rate, and nobody can audit it because the quote and the fill
are private. On Monad both can be public and provable. The payment is the product; the
receipt is the proof.

## The name

**Henad** is from the Greek ἑνάς (*henas*), "a unit of one," from ἕν (*hen*), "one."
The Neoplatonists, Proclus in particular, used *henads* for the individual units of
unity that proceed from the One.

It is the sibling word to **monad**, μονάς (*monas*), "unit," from μόνος (*monos*),
"one, single, alone." The Pythagoreans used *monas* for the first number of a series,
the one from which all others derive; Leibniz took it for his simple, indivisible
substances in the *Monadology* (1714). Same Greek root family, same philosophical
tradition, different prefix: *mono-* is single, *hen-* is unified.

A monad is the indivisible unit. A henad is the unit that makes separate things one.
That is what this product does: two currencies, one settlement, one receipt.

Pronounced HEE-nad. `Henad` in prose and UI, `henad` in code.

## What Henad deliberately does not do

- **No fiat.** We never take naira or dollars, never hold a float, never do KYC.
  Nigeria's SEC licenses virtual-asset service providers under the Investments and
  Securities Act 2025. Henad is software that routes between existing licensed on/off
  ramps; it is not one.
- **No custody.** Funds move from the payer's wallet to the recipient's wallet in one
  transaction.
- **No own liquidity.** We read an onchain reference rate (Chainlink, via Mento on
  Monad); we do not invent one.
- **No wallet, no token, no points.**

## Layout

```
contracts/   Foundry. PayoutIntent, CorridorRouter, RateAttestation + adapters.
web/         Next.js App Router. /send, /rates, /receipt/[intentId].
docs/        INTEGRATION-FACTS.md (verified addresses, sources), MRC-DRAFT.md.
```

## Status

Built for Monad Metropolis (1 Sep – 13 Oct 2026). See `docs/INTEGRATION-FACTS.md`
for what is verified on Monad mainnet and what is not.
