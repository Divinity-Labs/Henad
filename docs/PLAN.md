# Build plan — revised 2026-09-10

Supersedes §6 of the build prompt. Decisions D1 and D2 are in
`docs/INTEGRATION-FACTS.md`; bounty verdicts are in `docs/BOUNTIES.md`.

## What we are shipping

- **Corridor:** AUSD (or USDC) → USDm → GBPm on Monad mainnet through Mento V3,
  Chainlink AUSD/USD and GBP/USD as the reference rates. Corridor ids and the
  rate-source registry are generic so USD/NGN plugs in later without code changes.
- **Account layer:** Mera passkeys. One ceremony, plain EOA, no seed phrase.
- **Gas:** EIP-7702 delegation + Pimlico paymaster (primary). ERC-3009
  `receiveWithAuthorization` + our relayer (fallback). Both call one router.
- **Two clients, one core:**
  - `web/` — Next.js, mobile-first, installable PWA. **Built first. The flow is
    proven here end to end on mainnet before any mobile work starts.**
  - `mobile/` — Expo (React Native). Same screens, same core package. Built only
    after the web flow has settled a real mainnet payout.
  - `packages/core/` — shared TypeScript: chain config, contract ABIs and addresses,
    corridor maths (mirrors `Corridor.sol`), Mera account derivation, the 7702 and
    ERC-3009 signing helpers, quote and receipt types. Neither client talks to a
    contract except through this package.
- **Indexer:** Envio HyperIndex feeding `/rates`.
- **Standard:** `docs/MRC-DRAFT.md`, verifiable FX settlement receipts.

## Mobile: Expo, not Expo Go

Mera's React Native path depends on `react-native-passkey`, a native module that is
not bundled in the Expo Go app. Expo Go can only run modules that ship inside it.
So the mobile client is **Expo with a development build** (`expo-dev-client`, built
with EAS or locally), which is otherwise the same developer experience: Metro, hot
reload, one codebase. Treat "Expo Go" in conversation as shorthand for this.
To verify in week 5 before starting mobile: `react-native-passkey` version pinned
by Mera (3.6.1), its Expo config plugin, and PRF support on the test phone (Android
9+ with Google Password Manager; iOS 18+).

## Domains and passkeys

A WebAuthn passkey is bound to the relying-party id (rpId) it was created under, and
the rpId must be the site's host or a registrable parent of it. `vercel.app` is on
the Public Suffix List, so every `*.vercel.app` host is its own island; preview
deployments with random hostnames are islands too.

- **Testnet: Vercel.** The web app runs on its Vercel domain with rpId set to that
  exact host. Passkeys created there hold only testnet AUSD, so it does not matter
  that they can never be used on another domain.
- **Mainnet: henad.xyz.** rpId is `henad.xyz`, which also covers any future
  subdomain such as `app.henad.xyz`. No passkey that will hold real value is
  created under any other rpId.
- **Guard in code.** `packages/core` refuses to build a mainnet (chain 143) client
  unless `rpId === "henad.xyz"`. A misconfigured deploy fails loudly instead of
  minting accounts on the wrong domain.
- **Preview deployments** must never pick up the mainnet chain id; they get the
  testnet config from Vercel's preview environment variables.
- "Porting" is not a migration of passkeys; there is no such thing. It is a fresh
  deploy on the new domain where every user creates a passkey once. The old Vercel
  deployment stays up so anyone who did hold testnet funds there can still reach them.

## Repo layout

```
contracts/        Foundry
packages/core/    shared TS (pnpm workspace)
web/              Next.js PWA
mobile/           Expo app (week 5+)
indexer/          Envio HyperIndex
docs/             INTEGRATION-FACTS, BOUNTIES, PLAN, MRC-DRAFT
```

## Build order (deadline 14 Oct 03:59 UTC; today is 10 Sep, day 10 of 43)

**Week 1 — done except items marked open.**
- [x] Step-zero research, `INTEGRATION-FACTS.md`, decisions D1 and D2.
- [x] Repo scaffolded, Foundry and Next.js both building.
- [x] Interfaces: `IRateSource`, `IVenueAdapter`, `IRateAttestation`, `Corridor` lib
      with fuzz tests.
- [x] `foundryup` to 1.8.1 in WSL, `network = "monad"` enabled.
- [x] Pimlico account set up (2026-09-10).
- [ ] Envio API token.
- [ ] Production domain: **henad.xyz** (being acquired). Needed before the week-4
      mainnet deploy on 25 Sep. See "Domains and passkeys" below.

**Week 2 (11–17 Sep) — contracts, forked mainnet.** Started early on 10 Sep.
- [x] Research pass: Mento router API, all 7 pools verified, per-pool oracle adapters,
      market hours, reference-rate decision, ERC-3009 + 7702 paths proven on a fork,
      Pimlico paymaster on 143, MonadTen hardfork, gas (facts §14).
- [x] `docs/CONTRACTS-SPEC.md`; interfaces; `PayoutIntent`; `RateAttestation`; fork test base.
- [x] `ChainlinkRateSource`, `MentoVenueAdapter`, `CorridorRouter` + tests: 141 tests
      green incl. 26 fork tests on real Mento and Chainlink (merged 10 Sep).
- [ ] Integration fork suite: both paths on real Mento with real feeds, real EntryPoint (in progress).
- [ ] `script/Deploy.s.sol` (in progress); throwaway mainnet broadcast to prove the toolchain.
- [x] `packages/core`: intent typed data + ERC-3009 authorization helpers (vector-checked).
- [x] `packages/core`: ABIs generated from `forge build` (scripts/gen-abis.mjs).
- [x] Web pages built from the canvas and merged: landing, /send (Mera passkeys),
      /rates, /receipts, /receipt/[id] + OG image, /docs; settlement transport
      (ERC-3009 relayer + 7702/Pimlico) with 63 unit tests. Build green.
- [ ] **Blocked on deployment:** nothing is deployed, so `HENAD[chainId]` is empty,
      the send button is disabled and no receipt can exist.
- [ ] Four of five page builds are unreviewed (reviewers died on credits).
- [ ] The Mera passkey ceremony has never run in a browser.

**Design (10 Sep).** The "Henad v4" canvas (claude.ai/design project, exported to
`design/Henad-v4.dc.html`) is the UI source of truth; `docs/DESIGN.md` maps its
artboards to routes. Direction is Monad's institutional-clean language, not
neobrutalism (supersedes §4.3 of the build prompt). The web foundation (tokens,
receipt slip, nav, footer, corridor rows, live-rate and receipt data layer with a
Sample-labelled fixture) is committed; the pages are being built from it, pulled
forward from week 3.

**Week 3 (18–24 Sep) — web `/send`, testnet.**
- Mera onboarding in Next.js: create/sign-in ceremony, derive account, show AUSD
  balance. Stateless test passes.
- 7702 + Pimlico sponsored userOp: delegate + approve + settle in one batch.
  ERC-3009 relayer path behind a feature flag.
- Quote → spread disclosure in GBP and in bps → sign → receipt. Testnet AUSD from
  Agora's faucet contract. Reference rate on testnet is UNAVAILABLE (no Chainlink
  AUSD feed on 10143), so the testnet build uses the mainnet feed read-only for
  display and settles against the testnet pool; label it.

**Week 4 (25 Sep – 1 Oct) — mainnet. The gate.**
- Deploy contracts to Monad mainnet. One real AUSD → GBPm payout of a trivial
  amount, on a weekday inside FX market hours.
- `/receipt/[intentId]` live, server-rendered, OG image, shareable.
- PWA installable; tested on a real Android phone on throttled 3G.
- **If real value has not moved by 1 Oct, cut scope, not quality.**

**Week 5 (2–8 Oct) — `/rates`, mobile, optional bounties.**
- Envio indexer with aggregated `Corridor` entities; `/rates` explorer.
- `mobile/` Expo dev build: port `/send` and `/receipt` using `packages/core`.
  Same passkey, same account, same contracts. Demo on a physical phone.
- MRC draft posted to forum.monad.xyz.
- Only if the above is done: Aurora Intents Deposits ("fund from any chain"),
  Chainlink CRE second-reference workflow, PRF-encrypted address book.

**Week 6 (9–13 Oct) — ship.**
- Technical demo video, pitch video, README, write-up. No new features after 11 Oct.
- Submission checklist: live URL, mainnet receipt permalink, public repo, track 02,
  bounties Agora, Mera UX, Envio (+ any week-5 extras actually working).

## Definition of done (unchanged in substance)

- A stranger with an Android phone opens the URL, creates a passkey, and completes
  an AUSD → GBPm payout without instructions or MON.
- At least one real mainnet settlement with its receipt permalink in the submission.
- Every rate in the UI traces to an on-chain source named in the receipt.
- `forge test` passes including fuzz tests.
- README states what we do not do (no fiat, no custody, no KYC) and why.
