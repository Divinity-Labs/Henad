# Metropolis bounty texts — pasted from hackathon.monad.xyz on 2026-09-10

Source: the logged-in bounty pages at https://hackathon.monad.xyz/ (pasted by the
founder; not publicly fetchable). All deadlines: **14 Oct 2026, 04:59 GMT+1**.
Standard submission requirements apply on top of every bounty: **public repo,
technical demo video, pitch video, live product link** (stated in the Aurora text as
"track-level deliverables").

Verdict column is ours. "Pursue" means the integration earns its place in the
product; "Drop" means it would be bolted on.

| Sponsor | Bounty | Prize | Track | Verdict |
| --- | --- | --- | --- | --- |
| Agora | Best Cross-Border Payments App on Monad | $10,000 single | Consumer Products & Payments | **Pursue — primary** |
| Monad Foundation | Best Mera-Powered UX on Monad | $2,500 single | All | **Pursue** — required by Agora anyway |
| Envio | Best Use of Envio | $1,000 single | All | **Pursue** — powers `/rates` |
| Aurora Intents | Bring Any-Chain Liquidity to Monad | $5,000 (2,500/1,500/1,000) | All | **Pursue if week 5 has room** — Intents Deposits only |
| Chainlink | Best workflow with CRE | $3,000 single | All | **Maybe** — only as a second reference-rate source, see notes |
| Monad Foundation | Mera: One Passkey, Many Keys | $2,500 single | All | **Maybe** — encrypted receipt memos, see notes |
| Privy | Privy! | $5,000 single | All | **Drop** — Mera is the account layer; can't have two |
| Nansen | Best use of Nansen | $5,000 pool | All | **Drop** — no core-feature fit |
| Kuru | Build the Next Consumer Trading App on Kuru | $5,000 single | Onchain Finance & Trading | **Drop** — wrong track, no FX market |

Main track: **02 Consumer Products & Payments** (required to be eligible for the Agora bounty).

---

## Agora — Best Cross-Border Payments App on Monad — $10,000

> Build a mobile app letting users send AUSD across borders using Mera passkey
> onboarding and instant settlement.

**About:** A team must build a mobile application that lets a user send AUSD to
another person or across borders, using Mera passkey authentication for onboarding
and instant settlement for the transfer itself. Teams should build against Agora's
public API documentation and staging environment (internal codebase access is not
provided).

**Judging:** Implementation quality. Real-world usability. Business viability of the
payments flow.

**Deliverables:** A working demo showing passkey onboarding, an AUSD balance, and a
completed send/receive transaction settled instantly.

**Resources:** docs.agora.finance/contract-overview, docs.agora.finance

**What this changes for Henad**
- Source asset is **AUSD**, not USDC. Mento's AUSD/USDm pool is live on Monad
  (`0xb0a0264Ce6847F101b76ba36A4a3083ba489F501`) and Chainlink has an AUSD/USD feed,
  so the corridor becomes **AUSD → USDm → GBPm**. USDC can stay as a second source.
- Account layer is **Mera passkeys**, not Privy. This is stated in the bounty, and it
  also unlocks the Mera UX bounty. Privy is dropped.
- "Mobile app" — the text says mobile application; the Mera resources include a
  React Native recipe. We are building an installable mobile-web PWA. **Risk: the
  judges may read "mobile app" as native.** Mitigation: a PWA that installs to the
  home screen, demoed on a real Android phone in the video. Flag this in the write-up.
- "Agora's public API documentation and staging environment" — what this API does
  and whether a hackathon team can get staging credentials is being researched.

## Monad Foundation — Best Mera-Powered UX on Monad — $2,500

> Build an app on Monad where Mera is the entire account layer — no seed phrase, no
> extension, no custody backend.

**About:** The winner is the app where the user never notices there's a blockchain
underneath.

**Judging:** Time-to-first-transaction (taps and seconds from landing page to
confirmed Monad transaction). Session design (sensible scoping of prompt-free vs.
re-prompt actions, clean session-expiry UX). The stateless test. Stack composability
(bonus: gas sponsorship, intents, recovery flows, smart-account patterns,
cross-chain accounts).

**Deliverables:** Deployed on Monad testnet or mainnet with real transactions and a
live demo. One-prompt onboarding (a single passkey ceremony, no seed phrase,
extension, or email/OTP). Prompt-free signing via Mera signing sessions with a
clearly scoped session. Must pass the stateless test: judges clear local storage or
open the app on a fresh device mid-demo, and identity/access must fully reconstruct
from the passkey (plus untrusted storage if used).

**Resources:** mera.category.xyz/getting-started/, github.com/category-labs/mera

**What this changes for Henad**
- Design the session so that quoting and reading balances is prompt-free, and only
  "Send payout" re-prompts (or is covered by a scoped session with a spend limit).
- Nothing about the user may live only in local storage. Address book and history
  must come from chain/indexer or from PRF-encrypted untrusted storage.
- Gas sponsorship counts as bonus. Worth checking whether Mera or Monad offers a
  paymaster path; a first-time user with only AUSD and no MON cannot pay gas.

## Envio — Best Use of Envio — $1,000

> Meaningfully use Envio's HyperIndex, HyperSync, or HyperRPC to power real on-chain
> data driving a core feature in your app.

**Judging:** Depth of use (multichain indexing, non-trivial schema, derived/aggregated
entities, creative HyperSync analytics score higher than a single-event ERC-20
indexer). Working product, data live and correct. Originality. Craft (readable code,
sensible schema, a repo someone else could pick up).

**Deliverables:** A working indexer deployed to Envio Cloud or self-hosted, public
repo showing `config.yaml`, `schema.graphql` and event handlers. A frontend that
consumes the data. A short demo showing data flowing end to end.

**What this changes for Henad**
- `/rates` is exactly this. Schema: `Settlement`, `Corridor` (running median spread,
  count, volume), `RateSource`, `RouteLeaderboard`. Aggregated entities score higher
  than raw events, so compute corridor stats in the handler, not in the frontend.

## Aurora Intents — Bring Any-Chain Liquidity to Monad — $5,000

> Integrate Aurora Intents (powered by NEAR Intents) into a Monad app for any-chain
> deposits, swaps, or deposit-and-execute flows.

**Prizes:** 1st $2,500, 2nd $1,500, 3rd $1,000, plus office hours, roadmap session,
livestream, case study, distribution, BD support.

**Judging:** Ships a working integration of at least one product (Intents Connect,
Swap API, Intents Deposits), demoed live, not mocked. Removes a real cross-chain
friction point. Technical quality: correct settlement/refund handling, cross-chain
complexity hidden. Fit within track. Bonus: multi-chain source coverage,
contract-level composability via Intents Connect, Confidential Intents.

**Deliverables:** A live, working cross-chain flow showing funds arriving from
another chain and being used within the Monad app.

**What this changes for Henad**
- Fits as "fund your Henad balance from any chain": a persistent deposit address
  that swaps whatever the sender holds into AUSD on Monad. This is the on-ramp side
  of the payment, so it earns its place. Scope to **Intents Deposits** (self-serve);
  Intents Connect is early-access.
- Only if `/send` and `/receipt` are done on mainnet first. Week 5 at the earliest.

## Chainlink — Best workflow with CRE — $3,000

> Build, simulate, or deploy a Chainlink Runtime Environment (CRE) Workflow used as
> an orchestration layer within your project.

**Deliverables:** Integrate at least one blockchain with an external API, system,
data source, LLM, or AI agent. Demonstrate a successful simulation via the CRE CLI or
a live deployment. CRE must be meaningfully used.

**What this changes for Henad**
- Reading a Chainlink feed does not qualify. A workflow would.
- The only honest fit: a CRE workflow that pulls an independent mid-market rate from
  an external FX API and posts it on-chain as a **second, named reference source**
  in our rate-source registry. The receipt would then show spread against both the
  Chainlink feed and the external mid-market. That is a real feature (two independent
  references make the receipt harder to game), and a CLI simulation is enough.
- Cost estimate: two to three days. Decide at the start of week 5 based on where
  the mainnet payout stands.

## Monad Foundation — Mera: One Passkey, Many Keys — $2,500

> Most creative non-wallet use of Mera's PRF-derived key material.

**Judging:** Novelty (the further from "passkey wallet" the better). Correct use of
primitives (encryption vs. derivation, salts namespaced, nothing sensitive persisted).
Cross-device test: same passkey on a fresh device reproduces the derived keys live.

**Deliverables:** At least one PRF namespace doing non-account work, demonstrated live.

**What this changes for Henad**
- Possible fit: the sender's **address book and private receipt memos** ("rent for
  September") encrypted under a PRF-derived key in its own salt namespace, stored in
  untrusted storage, reconstructible on any device from the passkey. The public
  receipt stays public; the private annotation is private. Small, and it also solves
  the stateless-test requirement for the address book. Decide in week 5.

## Privy — Privy! — $5,000 — DROPPED

> Integrate Privy beyond authentication — login-only integrations will not qualify.

Dropped because the Agora bounty names Mera as the onboarding layer and an app cannot
have two account layers without the user noticing. Removed from the build plan.

## Nansen — Best use of Nansen — $5,000 pool — DROPPED

Requires Nansen data as a core product feature. No honest place for wallet
intelligence in a payout receipt. Dropped.

## Kuru — Build the Next Consumer Trading App on Kuru — $5,000 — DROPPED

Track is Onchain Finance & Trading, we are in Consumer Products & Payments. Kuru has
no FX or stablecoin market, so it cannot serve as a fallback venue. The
`KuruVenueAdapter` is removed from the contract plan.
