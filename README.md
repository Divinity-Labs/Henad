# Henad

**Send dollars, they arrive as pounds — onchain FX on Monad, with a public receipt showing
the rate you got and the spread in bps.**

Remittance pricing hides its real cost inside the exchange rate. The advertised "zero fee"
is paid in the spread, and nobody can audit it because the quote and the fill are both
private. On Monad both can be public and provable. The payment is the product; the receipt
is the proof.

| | |
| --- | --- |
| Web app | **https://usehenad.xyz** |
| Android app | [latest release](https://github.com/Divinity-Labs/Henad/releases/latest) — an APK, no store account needed |
| A real receipt | [0.40 AUSD → £0.298070 at 19 bps](https://usehenad.xyz/receipt/0x9c1479f156dd1d943e417dea5dbee28cf77548df4c69774042264f146a77503c) |
| Network | Monad mainnet, chain 143. Live since 18 Sep 2026 |

---

## How a payout works

1. **You hold AUSD or USDC.** No fiat leg, no float, no KYC; `/top-up` swaps MON for either
   if your account only has gas.
2. **You sign one ERC-3009 authorisation** with your passkey. Henad's relayer submits it,
   so you never need MON to pay for a payout.
3. **`CorridorRouter` settles it in a single transaction**: it pulls the dollars, swaps them
   at Mento's onchain FX venue into the recipient's currency, and delivers them. Either the
   whole thing completes at a rate you agreed to, or it reverts and you still have your
   money. A minimum-out floor is enforced onchain, not in the UI.
4. **`RateAttestation` writes the receipt**, onchain, in the same transaction: the Chainlink
   reference rate at that moment, the rate actually executed, and the gap between them in
   basis points.

Anyone can read that spread without trusting us. It is the number every remittance service
declines to print.

**Corridors live today:** AUSD → GBPm, EURm, CHFm, JPYm, and USDC → GBPm. They settle only
while the FX market is open — Mento's market-hours breaker halts quoting from 21:00 UTC
Friday to 23:00 UTC Sunday, and the apps say so rather than failing mysteriously.

**Accounts are passkeys.** Face ID or a fingerprint, no seed phrase, no password, and the
same passkey opens the same account on the web and on Android.

## On Monad mainnet

All four contracts are verified on Monadscan, deployed at block 105,928,848. They have no
proxy and no upgrade path, which is a deliberate trade: what you read is what runs, and it
cannot be swapped underneath you.

| Contract | Address |
| --- | --- |
| `CorridorRouter` | [`0x994e95FDb1713b1b12d3ccE47e2BC2145F43a0c9`](https://monadscan.com/address/0x994e95FDb1713b1b12d3ccE47e2BC2145F43a0c9) |
| `RateAttestation` | [`0xCA9536F48Ac5C1673c7D7B20D4E76056Fc4fE3B1`](https://monadscan.com/address/0xCA9536F48Ac5C1673c7D7B20D4E76056Fc4fE3B1) |
| `ChainlinkRateSource` | [`0x0b7CB973f3ceBbdd8983973727dcB381dD184228`](https://monadscan.com/address/0x0b7CB973f3ceBbdd8983973727dcB381dD184228) |
| `MentoVenueAdapter` | [`0xdf80efdAb089F33157845B653A44388640838360`](https://monadscan.com/address/0xdf80efdAb089F33157845B653A44388640838360) |

The owner key can register a corridor and repoint an existing one at a different venue or
rate source. It cannot touch anyone's funds, pause a payout, or alter a receipt that has
been written. https://usehenad.xyz/docs/contracts states those powers exhaustively.

## What Henad deliberately does not do

- **No fiat.** We never take naira or dollars, never hold a float, never do KYC. Nigeria's
  SEC licenses virtual-asset service providers under the Investments and Securities Act
  2025. Henad is software that routes between existing licensed on- and off-ramps; it is
  not one of them.
- **No custody.** Funds move from the payer's wallet to the recipient's wallet in one
  transaction. Nobody here can freeze, reverse or recover a payout.
- **No own liquidity and no invented rate.** The reference comes from Chainlink, the fill
  from Mento.
- **No fee.** There is no fee parameter in the contracts to switch on later. Charging
  before anyone wants the product would be pricing a thing nobody uses; if that changes it
  will be a new contract and a public one, not a flag flipped overnight.
- **No wallet, no token, no points.**

## Layout

```
contracts/      Foundry. CorridorRouter, RateAttestation, PayoutIntent, Chainlink + Mento adapters.
packages/core/  Shared TypeScript: chain config, addresses, ABIs, corridor maths, intent signing.
web/            Next.js App Router. /send, /rates, /receipts, /receipt/[intentId], /top-up, /docs.
mobile/         Expo app on the same core: send, top up, rates, receipts, account, settings.
scripts/        local-fork.sh and the operational odds and ends.
docs/           How it was built and what is actually verified on chain.
design/         Brand and UI source.
```

## Running it

```bash
pnpm install
cp .env.example .env     # MONAD_MAINNET_RPC_URL is the only one needed to read the chain
pnpm dev:web             # http://localhost:3000
```

Tests, the phone app, and a local mainnet fork that lets you spend fake money against the
real pools: see [CONTRIBUTING.md](CONTRIBUTING.md).

```bash
pnpm test                # TypeScript
cd contracts && forge test                              # unit
cd contracts && forge test --match-path 'test/fork/*'   # against live Mento and Chainlink
```

## Releasing the Android app

The APK is built by GitHub Actions rather than on a laptop, and the workflow publishes the
release itself:

```bash
gh workflow run android-dev-build.yml --ref main -f profile=community -f release_tag=v0.1.2
```

It refuses to publish if the signing certificate differs from the one already shipped,
because a new certificate would force everyone to uninstall and lose the app-bound half of
their setup.

## Documentation

| | |
| --- | --- |
| [`docs/PROBLEM.md`](docs/PROBLEM.md) | Why this exists, and who it is for |
| [`docs/INTEGRATION-FACTS.md`](docs/INTEGRATION-FACTS.md) | Every external address and claim, with how it was verified |
| [`docs/CONTRACTS-SPEC.md`](docs/CONTRACTS-SPEC.md) | The contracts, their invariants and their failure modes |
| [`docs/UPGRADEABILITY.md`](docs/UPGRADEABILITY.md) | Why there is no proxy, and what the escape hatch is instead |
| [`docs/ONRAMP.md`](docs/ONRAMP.md) | How money actually gets onto Monad, routes measured on chain |
| [`docs/NAIRA.md`](docs/NAIRA.md) | Why there is no naira corridor yet |
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | The site, the domain, and the deploy path |
| [`docs/TESTING-MOBILE.md`](docs/TESTING-MOBILE.md) | Android builds, passkeys and Digital Asset Links |

## The name

**Henad** is from the Greek ἑνάς (*henas*), "a unit of one," from ἕν (*hen*), "one." The
Neoplatonists, Proclus in particular, used *henads* for the individual units of unity that
proceed from the One.

It is the sibling word to **monad**, μονάς (*monas*), "unit," from μόνος (*monos*), "one,
single, alone." The Pythagoreans used *monas* for the first number of a series, the one
from which all others derive; Leibniz took it for his simple, indivisible substances in the
*Monadology* (1714). Same root family, same tradition, different prefix: *mono-* is single,
*hen-* is unified.

A monad is the indivisible unit. A henad is the unit that makes separate things one. That
is what this product does: two currencies, one settlement, one receipt.

Pronounced HEE-nad. `Henad` in prose and UI, `henad` in code.

## Status and licence

Built for [Monad Metropolis](https://www.monad.xyz/developers/hackathons/metropolis),
1 Sep – 13 Oct 2026, by one person. Live on mainnet and unaudited: read
[`SECURITY.md`](SECURITY.md) before you trust it with an amount you would miss.

MIT — see [`LICENSE`](LICENSE). Built by [Divinity Labs](https://github.com/Divinity-Labs).
