# Design brief — rebuild the unpriced-corridor panel (Henad v4)

Paste this whole file into Claude Design. It replaces the panel currently headed
"Naira has a price on Celo and none on Monad." on the landing artboards L1 (desktop,
the 1fr / 520px split with the peach grain card) and L1m (mobile, the rounded peach
card).

Every fact below was read on-chain on **10 September 2026** against Monad mainnet
(chain 143) and Celo mainnet (chain 42220), plus the Chainlink and Pyth machine-
readable registries. Nothing here is from a blog post or a search snippet. Where a
figure could go stale before judging in late October, the copy states the date the
reading was taken rather than an elapsed duration.

---

## Why the panel is changing

The old panel made four claims. Two survived, one was editorial, and one is false.

| Old sentence | Verdict |
| --- | --- |
| "Chainlink publishes NGN/USD on Celo, where Mento relays it" | **True**, verified to the aggregator |
| "On Monad there is no NGN feed from Chainlink or Pyth and no naira asset" | **True**, and Pyth's absence is true on *every* chain |
| "Five wealthy-country currencies have a number on this chain" | Count correct, wording editorial |
| "No African currency except the rand has even that" | **False as implied.** See below |

**The rand sentence is the defect.** It silently swaps oracles mid-thought. The five
currencies come from Chainlink; the rand comes from Pyth. Chainlink has no rand feed
on Monad at all. Pyth's Monad contract does hold a rand price, but its publish time
is **2 September 2025** and every staleness-checked read of it reverts `StalePrice`.
In a 100-block window, 53 different Pyth feeds were updated on Monad and not one was
an FX feed: somebody posts the crypto set, nobody posts the currencies. So the rand
does not have a usable number on Monad, and the sentence as written implies it does.

**The headline also points at the wrong chain.** This is a Monad submission; leading
with Celo makes the first idea "look what another chain has". The finding that
actually lands is on Monad itself.

---

## The new argument, in one line

As of 10 September 2026 Monad has a live price for five currencies and none for any
African one, and the naira is missing not one thing but two, held by two different
parties: a Chainlink feed only Chainlink can deploy here, and a Mento asset, relay
and funded pool only Mento can put behind it.

The single most quotable detail, and it is checkable in Mento's own repository:
**Mento's Monad config file contains `ngn: address(0)`** — the naira slot exists in
the schema and is explicitly empty, one line below a filled-in `cad`.

And the counter-example that kills any "it just needs the feed" reading:
**Chainlink's CAD/USD feed is already live on Monad and already filled in in Mento's
config, and there is still no CADm, no relayer and no pool.** A feed alone has not
produced a market here.

---

## Copy — use verbatim

**EYEBROW**
The unpriced corridor

**HEADLINE**
Five currencies have a live price on Monad. None of them is African.

**BODY 1**
Chainlink runs five fiat feeds here — euro, pound, Swiss franc, yen, Canadian dollar —
and no African currency among them. Pyth publishes no naira feed on any chain, and the
one African currency it does publish, the rand, sits in Monad's Pyth contract with a
publish time of 2 September 2025; every staleness-checked read of it reverts. Chainlink
does produce NGN/USD: it runs on Celo, where Mento relays it into a naira market.

**BODY 2**
Henad's registry holds USD → NGN anyway, with a rate source of none: the app offers the
corridor, refuses to quote it, and gives the reason instead of a number. Closing it takes
two decisions from two parties. Chainlink would have to deploy NGN/USD on Monad, which
Mento cannot do for it. Mento would have to add the naira to a bridge config that today
names five tokens and no naira, deploy the spoke, get a relayer through a factory
restricted to its own multisig, set the breakers, and fund a pool. Mento has left the
slot open — its Monad config reads `ngn: address(0)`, one line below a filled-in `cad` —
and the Canadian dollar, whose Chainlink feed is live on Monad, still has no Mento
asset, no relayer and no pool.

**LIST — "What has to exist". Four items, not three.**
The old list had three and skipped the relay, which is the step no third party can take.

- **01** A Chainlink NGN/USD aggregator deployed on Monad. Chainlink already runs this
  feed on Celo; deploying it here is Chainlink's decision, and Mento cannot make it for them.
- **02** NGNm on Monad. Mento's bridge config names five tokens and no naira, and there
  is no naira spoke to deploy from.
- **03** A relayer carrying that feed into Mento's oracle, with breakers set. The
  factory's `deployRelayer` is restricted to Mento's multisig, so no third party can add one.
- **04** An NGNm/USDm pool funded with reserve-backed liquidity, pricing from the
  relayed feed rather than a curve. This is the step the Canadian dollar never got.

**CARD** (the white slip on the peach grain panel)

| Label | Value |
| --- | --- |
| header | `USD → NGN` + Unpriced pill |
| Reference rate | none |
| Chainlink · Monad | no NGN feed; five fiat feeds, none African |
| Pyth · any chain | no NGN feed |
| Pyth · Monad | rand only, last published 2 Sep 2025 |
| Chainlink · Celo | NGN/USD live, relayed by Mento · 0xc17c…4c11 |
| Mento · Monad | no NGNm, no relayer, no pool |
| Settlement asset | none on Monad |
| Read on-chain | 10 Sep 2026 |
| footer | Registry entry kept open. Send offers this corridor, refuses to quote it, and gives this as the reason. |

The card header must render `USD → NGN` only. The old copy said
`USD → NGN · GBP → NGN`, but the component derives the header from the registry and
the registry holds exactly one unpriced corridor.

**LINK**
Read the MRC: how a registry records a corridor it cannot price →

(The old link said "a registry that holds a rate with no venue". That describes the
*quote* tier — the Canadian dollar and the rand, priced with no asset — not the naira,
which has neither a rate nor a venue.)

---

## Layout note for the designer

The card grows from five rows to eight plus a date row. In the 520px column with its
560px minimum height that may crowd the bottom of the peach panel. Two options, your
call: merge "Pyth · any chain" and "Pyth · Monad" into one two-line row, or let the
card grow and reduce the `NGN` ghost type from 250px so the two do not collide. The
date row should read as fine print, one step down in weight from the rest.

The mobile card (L1m) carries the headline, one shortened body paragraph and the link
only. Its body becomes:

> Chainlink runs five fiat feeds on Monad and none is African. Pyth publishes no naira
> feed on any chain. Henad keeps the corridor in its registry with a rate source of
> none, and says so.

---

## Do not write

- "No African currency has a number on this chain, full stop." Falsifiable in one call:
  Monad's Pyth contract returns a rand price of 17.70819.
- Any elapsed duration ("373 days stale"). It is wrong by the time a judge reads it.
  Fixed publish dates only.
- "cNGN". Mento's token has reported the symbol NGNm since 16 December 2025, and an
  unrelated cNGN from another issuer exists.
- "just", "only", "simply", "a config change", "one feed away", "hasn't come across yet".
  Two gaps, two parties, and the Canadian dollar proves a feed alone is not enough.
- "Mento will bring the naira to Monad", or any timeline. Mento has never named a
  currency for Monad beyond the pound and the dollar; both of its posts say only that
  "additional currencies are expected to follow".
- "Chainlink won't" or "Chainlink refuses". The evidence shows absence, never intent.
- "Monad ignores African currencies", or any hostile framing. Monad Foundation's own
  local-stablecoins post names the naira explicitly. The panel's force comes from the
  absence being documented, not resented.
- "Five wealthy-country currencies". Accurate but editorial; naming the five cannot be
  argued with and reads flatter.

---

## Evidence appendix

Chainlink on Monad: 102 feeds, exactly five fiat, all 18-decimal, 240s heartbeat —
EUR `0x00D7E359…`, GBP `0x1ffC8B75…`, CHF `0x6DBa7f3A…`, JPY `0xF64664Ea…`,
CAD `0x3293eA56…`. Forty African currency codes scanned, zero hits.

Chainlink on Celo: 16 fiat feeds including five African — NGN, KES, GHS, ZAR, XOF.
NGN/USD `0xc17cBE2dB40e53F4984C46F608DA6DA1fF074c11`, 8 decimals, reading 0.00075560
USD per naira (1,323.45 naira to the dollar), 151 seconds old against a 240s heartbeat.

Mento's relay on Celo: SortedOracles `0xefB84935…` returns a non-zero median for rate
feed id `0xC13D4255…` = `address(keccak256("relayed:NGNUSD"))`. Its single oracle is
relayer `0xce35D1F6…` whose `rateFeedDescription()` is "NGN/USD" and whose
`getAggregators()` is exactly that Chainlink proxy, un-inverted. The median is
byte-identical to the Chainlink answer.

NGNm on Celo: `0xE2702Bd9…`, symbol "NGNm", name "Mento Nigerian Naira", 18 decimals,
supply 64,501,778.85. Renamed from cNGN on 16 December 2025. Tradable through Mento v2's
BiPoolManager cUSD/NGNm exchange.

Mento on Monad: five stables (USDm, GBPm, EURm, CHFm, JPYm), seven pools, seven
relayers. No naira token, pool, relayer or rate — confirmed four independent ways.
Mento issues 15 currencies in total on Celo, five of them African (NGN, KES, GHS, ZAR,
XOF); Monad has received only the G10 subset.

Pyth: 1,893 feeds, 39 FX, exactly one African currency (the rand). No naira on any
chain. On Monad the rand's stored publish time is 2 September 2025;
`getPriceNoOlderThan` reverts `StalePrice` at both 60 seconds and 86,400 seconds.
