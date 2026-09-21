---
mip: TBD
title: Verifiable FX Settlement Receipts
description: A record written in the same transaction as a currency conversion, stating the reference rate, the rate executed, and the spread between them
author: TBD (@Miracle656)
discussions-to: TBD
status: Draft
type: Standards Track
category: MRC
created: 2026-09-21
---

## Abstract

This MRC defines a receipt for an onchain currency conversion: a record written in the
same transaction as the swap, stating the reference rate the payer was shown, the rate
they actually received, and the difference between them in basis points, along with enough
provenance to replay the reference read.

It specifies a struct, an event, and a small read interface. Any contract that converts one
asset into another on behalf of a payer may implement it. A reader who trusts nothing but
the chain can then answer, for any settlement, the only question that matters in foreign
exchange: what did this cost me, and how do I know.

## Motivation

Cross-border payment pricing is quoted as a fee and charged as a rate. A service advertises
"zero fees" and takes its margin in the exchange rate, and the customer cannot check it,
because the reference rate at the moment of the trade and the rate they were actually given
are both private to the provider. The industry term for this is the spread. It is the
product's real price and it is the one number that is never printed on the receipt.

Onchain, both halves are available. An oracle publishes a reference rate that anyone can
read at a block; an AMM or an RFQ venue executes at a rate anyone can recompute from the
transfer amounts. Nothing stops a contract from writing both down at the moment it settles.
Yet a Transfer event only says that money moved, and a swap event only says what was
exchanged. Neither says what the conversion should have cost, so neither can be audited as
a price.

The consequence is that FX on Monad is, today, no more auditable than FX at a bank. Each
application invents its own records, and an integrator wanting to compare venues, or a
recipient wanting to check a payout, must reverse-engineer a private format per application
and hope the reference rate they pick after the fact is the one the contract used.

A shared receipt fixes this at the layer where the information already exists:

1. **A recipient can verify a payment they did not send.** The receipt names the reference
   source, the observation, and the executed rate, so the spread can be checked by a party
   with no access to the sender's application.
2. **Venues become comparable.** Spread in basis points, recorded identically across
   applications, is directly aggregatable. A leaderboard of execution quality per corridor
   becomes an indexing problem rather than a research project.
3. **Payment applications can prove a claim rather than assert one.** "We took 19 basis
   points" is checkable. "Zero fees" is not.
4. **Standardisation, not novelty, is the point.** Every element here is already computed
   inside the settling contract. The proposal is that it be written down in one shape.

## Specification

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be interpreted as described
in RFC 2119 and RFC 8174.

### Definitions

- **Corridor** — an ordered pair of currencies, identified by
  `keccak256(bytes(<source>/<target>))` over their ISO 4217 codes: `keccak256("USD/GBP")`.
  The identifier names currencies, not tokens, so a corridor survives a change of the token
  that represents it.
- **Reference rate** — the rate an independent source published for the corridor, read by
  the settling contract in the settling transaction.
- **Executed rate** — the rate the settlement actually achieved, derived from the amounts
  that moved, not from a quote.
- **Spread** — the shortfall of the executed rate against the reference rate, in basis
  points.

### Interface

```solidity
interface IFxReceipt {
    /// @notice "MRC-<n>/1.0.0"
    function VERSION() external view returns (string memory);

    struct FxReceipt {
        bytes32 corridor;              // keccak256("USD/GBP")
        bytes32 referenceObservation;  // provenance of the reference read
        uint128 referenceRate;         // 1e18, target per unit of source
        uint128 executedRate;          // 1e18, target per unit of source
        uint128 sourceAmount;          // source asset base units
        uint128 deliveredAmount;       // target asset base units
        address rateSource;            // the contract the reference was read from
        int32   spreadBps;             // (reference - executed) / reference * 1e4
        uint64  settledAt;             // block.timestamp
        address venue;                 // the contract that executed the conversion
        uint64  settledAtBlock;        // block.number
    }

    /// @notice Emitted once per settlement, in the settling transaction.
    event FxSettled(
        bytes32 indexed receiptId,
        bytes32 indexed corridor,
        address indexed payer,
        address recipient,
        address sourceAsset,
        address targetAsset,
        FxReceipt r
    );

    /// @notice A stored receipt. `settledAt == 0` means none exists.
    function receiptOf(bytes32 receiptId) external view returns (FxReceipt memory);

    /// @notice Number of receipts ever written.
    function count() external view returns (uint256);

    /// @notice Receipt id by position, oldest first.
    function receiptIdAt(uint256 index) external view returns (bytes32);
}
```

### Rates

`referenceRate` and `executedRate` are fixed-point with 18 decimals and express **target
currency per one unit of source currency**, normalised for both tokens' decimals. For a
6-decimal source and an 18-decimal target:

```
executedRate = deliveredAmount * 1e18 * 10**sourceDecimals
             / (sourceAmount * 10**targetDecimals)
```

A rate of `746668483739685621` means one dollar buys 0.746668483739685621 pounds. The
normalisation matters: without it a receipt cannot be compared against another
implementation that happened to pick different tokens for the same currencies.

### Spread

```
spreadBps = int32((int256(referenceRate) - int256(executedRate)) * 10_000 / int256(referenceRate))
```

`spreadBps` MUST be computed from the two rates in the receipt and MUST NOT be supplied by
the caller. It is signed: a negative value means the execution beat the reference, which
happens and must not be misrepresented as zero. Implementations MUST truncate toward zero
rather than round, so a reported spread is never larger than the spread actually taken.

### Requirements

An implementation:

1. MUST write the receipt in the same transaction as the conversion. A receipt written
   later is an assertion about the past, which is the thing this standard exists to
   replace.
2. MUST read `referenceRate` before any asset moves, and MUST fail the settlement if no
   acceptable reference is available. A settlement with no reference has no spread, and a
   receipt without a spread is a transfer record.
3. MUST derive `deliveredAmount` from the recipient's observed balance change, not from a
   quote or a return value.
4. MUST reject a second receipt for the same `receiptId`.
5. MUST NOT provide any function that alters a written receipt. A receipt store SHOULD have
   no owner, no pause and no upgrade path; where an implementation is upgradeable, it MUST
   state so where the receipt is published.
6. MUST set `settledAt` to a non-zero `block.timestamp`, so that a zero reads unambiguously
   as "no receipt".
7. SHOULD keep receipt ids in an append-only list exposed by `count()` and `receiptIdAt()`,
   so that the ledger can be paged without an indexer and without log queries, which public
   RPC providers commonly restrict.
8. SHOULD populate `referenceObservation` with whatever makes the reference read replayable
   at the source. For a Chainlink pair this is the two round ids, packed. Where no such
   identifier exists it MUST be zero rather than fabricated.

### Receipt id

`receiptId` is opaque to this standard. Implementations that settle a signed intent SHOULD
use the intent's hash, which binds the receipt to the exact terms the payer approved.
Others MAY use `keccak256(abi.encode(payer, recipient, sourceAsset, targetAsset, nonce))`.
It MUST be unique per settlement.

## Rationale

**Why both rates rather than a fee field.** A fee is a number the provider chooses. Two
rates and the amounts that moved are facts a reader can recompute, and the spread falls out
of them. Recording the fee instead would preserve exactly the trust assumption this
standard removes.

**Why basis points are stored at all**, given they are derivable. Because the derivation
depends on a convention — signedness, rounding, which rate is the denominator — and a
standard whose headline number is computed three different ways by three implementations is
not a standard. Storing it fixes the convention, and the inputs remain present so a reader
can check the arithmetic.

**Why `int32` for the spread.** It holds ±214,748 basis points, far beyond any plausible
execution, and it packs into a slot beside two addresses.

**Why the struct is eleven fields and not four.** Everything here is needed to verify the
receipt from outside the application that wrote it: `rateSource` and
`referenceObservation` to replay the reference, `venue` to attribute execution,
`settledAtBlock` to fetch the event with a single-block log query, the amounts to
recompute the executed rate. Fields that are recoverable from the event and not needed for
verification — payer, recipient, the asset addresses — are deliberately kept in the event
only, where they cost calldata rather than storage.

**Why storage and not events alone.** An event is enough for an indexer and useless to a
contract. Storage lets a downstream contract — an escrow releasing on evidence of a payout,
a refund policy triggered by an excessive spread — read the receipt in the same way a
reader does. Storage on Monad is priced per page, so the struct is ordered to pack into six
slots.

**Why currency codes rather than token addresses in the corridor id.** Tokens for a given
currency change: an issuer redeploys, a venue migrates liquidity, a better-collateralised
pound token appears. Aggregate history for "USD to GBP" should survive that. The token
addresses are in the event for anyone who needs them.

**Why this is an MRC and not an application's private format.** The value of a receipt is
proportional to how many settlements share its shape. One application publishing spreads is
a marketing claim; every application publishing spreads in one format is a market.

## Backwards Compatibility

This MRC introduces a new interface and does not modify existing behaviour. It is additive
for any contract that already settles conversions: the receipt is written alongside the
existing transfers and events.

`FxSettled` does not collide with ERC-20 `Transfer`, ERC-4626, or the swap events emitted by
existing venues. An implementation can emit all of them in the same transaction, and should:
this standard describes the price of a conversion, not the conversion itself.

## Test Cases

A settlement on Monad mainnet, block 105,952,304, receipt id
`0x9c1479f156dd1d943e417dea5dbee28cf77548df4c69774042264f146a77503c`:

| Field | Value |
| --- | --- |
| `corridor` | `0x881ce35a123c3875df4e6b83b3efbdd694b3ae9c7523fe5d96ca517d56485a82` (`keccak256("USD/GBP")`) |
| `referenceRate` | `746668483739685621` |
| `executedRate` | `745175706773569052` |
| `sourceAmount` | `400000` (0.40 AUSD, 6 decimals) |
| `deliveredAmount` | `298070282709427621` (0.298070282709427621 GBPm, 18 decimals) |
| `spreadBps` | `19` |
| `settledAt` | `1789753013` |

Checks a verifier can run with nothing but this table:

```
executedRate  = 298070282709427621 * 1e18 * 1e6 / (400000 * 1e18)
              = 745175706773569052                              ✓

spreadBps     = (746668483739685621 - 745175706773569052) * 10000
              / 746668483739685621
              = 19 (19.99 truncated)                            ✓

cost of spread = 400000 * 746668483739685621 / 1e6 / 1e18
               - 0.298070282709427621
               = 0.000597 GBPm                                  ✓
```

The reference read is replayable: `rateSource` is
`0x0b7CB973f3ceBbdd8983973727dcB381dD184228`, and `referenceObservation`
`0x00000000000000000000000000010000000000001ca5000100000000000150a6` holds the two
Chainlink round ids, so a third party can fetch both answers and confirm the reference rate
was not chosen after the fact.

## Reference Implementation

`RateAttestation` on Monad mainnet at
[`0xCA9536F48Ac5C1673c7D7B20D4E76056Fc4fE3B1`](https://monadscan.com/address/0xCA9536F48Ac5C1673c7D7B20D4E76056Fc4fE3B1),
verified, with no owner and no upgrade path. Its only writer is the router fixed at its
construction. Source, tests and a mainnet fork suite:
https://github.com/Divinity-Labs/Henad — `contracts/src/RateAttestation.sol` and
`contracts/src/interfaces/IRateAttestation.sol`.

The deployed interface differs from this proposal only in naming: `Attestation`,
`PayoutSettled`, `get()` and `intentIdAt()` correspond to `FxReceipt`, `FxSettled`,
`receiptOf()` and `receiptIdAt()`. The proposal takes the more general names; the
implementation predates the draft and is left as it was deployed, because a contract that
changes to match a document is worth less than a document that admits which contract it
came from.

## Security Considerations

**A receipt is evidence, not a guarantee.** It records what a settlement did. It does not
make the reference rate correct, the venue honest, or the token solvent. A reader trusting
a receipt inherits the trust assumptions of `rateSource` and `venue`, both of which are
named in the receipt precisely so they can be judged.

**Reference sources can be manipulated.** A rate read from a source an attacker controls
produces an honest receipt of a dishonest number. Implementations SHOULD prefer sources with
independent publishers and freshness guarantees, MUST fail rather than settle on a stale
answer, and MUST record the source address so a reader can apply their own judgement.

**Writing the receipt must not become optional under stress.** An implementation that
catches a failure from its receipt store and settles anyway produces settlements with no
record, which is the pre-standard world with extra steps. The write MUST be part of the
same atomic transaction as the transfer.

**Balance-derived amounts and unusual tokens.** `deliveredAmount` is a balance delta.
Fee-on-transfer or rebasing tokens make that delta a poor measure of what the recipient
received over any longer horizon. Implementations MUST measure the delta on the recipient
and SHOULD refuse corridors whose tokens are not fixed-supply-per-unit.

**Immutability cuts both ways.** A wrong receipt cannot be corrected, only annotated by a
later one. This is deliberate. A store with an owner who can rewrite history provides no
stronger guarantee than the private database it replaces.

**Privacy.** Every receipt is public and permanent, including payer, recipient and amount.
This standard describes a public record and is unsuitable, without additional work, for
payments whose participants must not be linkable.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
