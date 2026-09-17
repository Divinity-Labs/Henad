# What it would actually take to do USD to NGN

Researched 14 September 2026. Every load-bearing claim about what exists on a chain was
checked by reading the chain, not by reading documentation. Where a source could not be
confirmed it says UNVERIFIED.

This exists because the corridor Henad can demonstrate is not the corridor that hurts, and
that gap deserves an answer better than "Chainlink has not deployed a feed."

---

## The short version

A corridor needs two independent things: a **rate source** it can read on-chain, and a
**venue** to swap into a target-currency asset. Naira has neither on Monad, and only one
of them anywhere.

| | Rate source | Venue |
| --- | --- | --- |
| **Monad mainnet** | none | **no naira token exists at all** |
| **Celo mainnet** | Chainlink NGN/USD, live | one Uniswap pool, about $184,000 |

---

## 1. There is no naira on Monad. Not thin — absent.

`cNGN` is the only naira stablecoin that matters. It is issued by WrappedCBDC Limited
under Nigeria's SEC regulatory incubation, with reserves in naira at Nigerian banks and
monthly attestations.

It is deployed on Base, BNB Chain, Celo, Asset Chain, Ethereum, Polygon, Lisk, Bantu and
Solana. Live supply read from each chain totals about **3.43bn NGN, roughly $2.6M**, of
which Base alone is 2.13bn.

**It is not on Monad.** Three independent confirmations:

- The issuer's own docs list Monad with the value "Not yet deployed."
- The issuer's GitHub lists Monad only under Testnets.
- `eth_getCode` on Monad mainnet returns **zero bytes** for every cNGN address the issuer
  publishes, including their Monad testnet address.

`NGNC` from LINK.IO is the other candidate and is not a serious one: its Polygon supply
reads 111 **trillion** tokens, which cannot be a backed float, its own site claims 108
million circulating, and its issuing entity is UK-registered with no Nigerian licence
stated. Not on Monad either.

Mento's own naira asset, `NGNm`, exists on Celo only. Mento's Monad deployment carries USDm, GBPm,
EURm, JPYm and CHFm (checked 17 Sep 2026), and no naira.

> **Integration trap.** Several explorers display Mento's `NGNm` under the ticker `cNGN`.
> Two unrelated tokens share that display name on the same chain. Key off the address.

---

## 2. The naira barely trades on-chain anywhere

| Chain | Venue | Pair | TVL | 24h volume |
| --- | --- | --- | --- | --- |
| Celo | Uniswap v3 | cNGN / USD₮ | ~$184,000 | ~$1,800 |
| Base | Uniswap v4 | cNGN / USDC | ~$86,000 | ~$2,500 |
| BNB | Uniswap v4 | cNGN / USDT | ~$43,000 | ~$260 |
| Celo | Uniswap v3 | NGNm / USD₮ | ~$63,000 | **zero** |

The whole on-chain naira market is roughly **$400,000 of liquidity and under $5,000 a
day**. The deepest pool is concentrated-liquidity, so tradeable depth at the current tick
is well below its reserves. It absorbs low tens of thousands of dollars before slippage
bites.

> One widely-cited figure is false. A BSC pool reports $67.2M of TVL. It prices cNGN at
> $1,486.76, which is the NGN/USD rate inverted, implying a $3.39 **trillion** market cap,
> and it has had zero transactions since early 2025. It is an artifact. Real BSC liquidity
> is the $43,000 pool above.

---

## 3. Celo is not the easy fallback it looked like

The rate source is genuinely there. Chainlink NGN/USD on Celo, proxy
`0xc17cBE2dB40e53F4984C46F608DA6DA1fF074c11`, read live at **₦1,326.01 per USD**, updated
minutes before this was written, on a 240-second heartbeat. Celo also carries KES, GHS and
ZAR, which Monad does not.

> **Corrected 17 Sep 2026.** This section first said Mento's naira market on Celo was dead.
> That was wrong. The check passed the NGNm **token address** to SortedOracles, which is not
> how Mento keys the rate: it keys it by rate-feed ID. Read with the right ID, the market is
> live. What stays true is that none of it is on Monad.

**Mento's naira market is live on Celo, and only on Celo.** Verified on chain 42220 on 17 Sep:

- NGNm is `0xE2702Bd97ee33c88c8f6f92DA3B733608aa76F71` (18 decimals, supply about ₦64.5M).
- A Mento **V2** BiPool swaps USDm ↔ NGNm (exchange ID `0x67a5122d…06cc`, 1% spread).
  `Broker.getAmountOut` for 10 USDm returned 13,176.98 NGNm, and the breaker reports
  trading not suspended.
- Its oracle is rate feed `0xC13D42556f1baeab4a8600C735afcd5344048d3C` ("NGN/USD"). It was
  reported 28 seconds before the read, at ₦1,331.0 per USD, by the Chainlink relayer.
  Chainlink NGN/USD on Celo read ₦1,331 as well, 68 seconds old.
- **Caveat:** Mento proposal MGP-18 is winding V2 down. It keeps this pool for redemptions
  and caps its lifetime net flow, so new NGNm minting through it is limited.

**On Monad there is still nothing.** Mento's deployment address book and SDK list NGNm only
for Celo and Celo Sepolia. Their Monad config has `ngn: address(0)`. Monad's FPMM factory
holds the same seven pools as on 10 Sep, none of them naira. Mento's Monad SortedOracles has
no NGN/USD rate under either ID. Chainlink's 102 Monad feeds, Pyth and RedStone have no NGN.

Mento's app switches networks, and its NGNm swap is the Celo market. Key off the address, not
the ticker: Mento's own repos still map the old `cNGN` name to NGNm.

What also works on Celo is: read Chainlink, swap through the one Uniswap pool, redeem cNGN
to a bank account through the issuer's API. That is a thin retail corridor whose last leg
is off-chain and KYC'd.

---

## 4. Two things that genuinely change what is buildable

### Chainlink CRE supports Monad, verified on-chain

CRE is a workflow runtime: you write a workflow, a decentralised network reaches consensus
on its output, and a forwarder delivers a signed report to your contract.

The production KeystoneForwarder on Monad mainnet, `0x76c9cf548b4179F8901cda1f8623568b58215E62`,
has **8,591 bytes of live code**. This is real and deployed.

So a workflow can publish an NGN/USD rate to Monad, into a consumer contract implementing
`IReceiver`, which the router could then read. That would move USD → NGN from **unpriced**
to **quotable**: a real naira rate, sourced and checkable, with the spread that would be
paid, and only settlement missing.

Three caveats, and the first is not optional:

- **It is not a Chainlink price feed.** It is your workflow's output signed by a network.
  You choose the source, you own the rate, you carry the responsibility. Describing it as
  "a Chainlink NGN/USD feed on Monad" would be a material misrepresentation, and this
  project cannot afford that sentence.
- Signed reports can be replayed across chains or resubmitted after a revert. Protective
  metadata must be embedded in the payload and checked in the consumer.
- Monad appearing in CRE's global table does not mean it is enabled for a given tenant.
  Run `cre workflow supported-chains` first. UNVERIFIED whether it is on by default.

CRE Connect Beta is a different, narrower product covering five chains and not Monad. Do
not confuse them.

### Aurora Intents covers the funding gap

Intents Deposits generates a deposit address and handles chain detection, routing and
settlement. Verified against the underlying token API: **Tether on Tron** and both
stablecoins on **BNB Chain** are supported sources, and **Monad is a supported
destination** for MON, USDT0 and USDC.

That is exactly what people in Nigeria hold, and it removes the worst step of the on-ramp.
It does nothing for the naira leg: of 189 supported assets, **none is naira-denominated**.

---

## 5. The options, ranked

**1. Settle the naira leg off-chain through a licensed partner. Everything else on Monad.**
Fund through Aurora Intents from Tron or BNB. Settle the dollar side on Monad against
Mento's real liquidity, with the receipt. Hand the naira leg to the cNGN issuer's
redemption API or a licensed Nigerian payment provider.
*Controlled by:* the partner, and the CBN/SEC regime. *Available:* today, at size.

**2. Run the corridor on Celo.** Chainlink NGN/USD, the one Uniswap pool, cNGN redemption.
*Controlled by:* whoever provides that pool's liquidity. *Costs:* leaving Monad, and with
it the premise of this submission. *Caps out:* low tens of thousands per trade.

**3. Publish your own NGN rate to Monad via CRE, paired with option 1.**
*Controlled by:* you, which is both the appeal and the liability. *Gives:* a rate, not a
venue.

**4. Wait for cNGN on Monad.** It is on their testnet and marked "not yet deployed" on
mainnet, so this is a roadmap item rather than a fantasy. *Controlled by:* the issuer. No
published date, and deployment alone is not a market.

**5. Get Mento to enable naira.** Lowest probability. Their naira is dormant even where it
exists.

---

## 6. What this means for the product's claim

Be exact, because the strong version is not achievable today and a judge will test it.

Under option 1, what is verifiable on Monad is: the funds arrived, the dollar-side rate was
read from a named source, the spread was computed and enforced on-chain, and the amounts
and recipient are immutable. What is **not** on-chain is the naira ever existing as a token,
or a bank account being credited. That is an attestation from a licensed partner. Signed
and anchorable, but a claim about the world rather than a settled transfer.

The defensible sentence is:

> An on-chain verifiable record of instruction and dollar-side settlement, with an attested
> off-chain naira payout.

The indefensible one is "fully on-chain USD to NGN settlement on Monad". No product can
say that today, because there is no naira on Monad to settle into, and that is verified by
zero bytecode at every address the issuer publishes.
