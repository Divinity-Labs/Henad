# Design guide — implementing the Henad v4 canvas

Source of truth: the Claude Design project "Henad v4" (10 Sep 2026), exported to
`scratch/design/Henad-v4.dc.html` (git-ignored; re-import with DesignSync if
missing). Read the artboard you are implementing in that file before writing a
line of JSX. This guide maps artboards to routes and records the rules.

## Direction

Monad's institutional-clean web language, not neobrutalism: near-white canvas
with dot-grid gutters, 1px hairline structure, mono uppercase labels,
sentence-case medium-weight headlines, grey body text, exactly one dark
cinematic panel per page with giant background type and grain. Brand purple
`#6E54FF` is allowed. Britti Sans is commercial; Instrument Sans stands in.
Inter body, Roboto Mono for labels, buttons, links, code.

Anti-slop rules (from the project's taste skill): no emoji; no
centered-everything except the landing hero; no three-equal-card rows unless
hairline-divided; no fake round numbers; no generic names; no filler copy;
tactile `:active` states on every button. Every figure on screen must be one
Henad can back: read from the chain, or clearly marked as a sample.

## Tokens and primitives (already built)

- `web/src/app/globals.css` — Tailwind v4 `@theme` tokens (`bg-canvas`, `text-ink`,
  `border-hairline`, `text-muted`, `bg-purple`, `bg-lilac`, `bg-dark`, `bg-tint`,
  `bg-amber` …), fonts (`font-display`, `font-sans`, `font-mono`), utilities
  `.dotgrid`, `.grain`, `.receipt-edge`, `.label` / `.label-md` / `.label-lg`,
  `.tabular`, `.press`, `.balance`, `.pretty`, `.motion`, and the three keyframes
  (`animate-feed`, `animate-stamp`, `animate-toast`). `prefers-reduced-motion`
  disables `.motion`.
- `web/src/app/layout.tsx` — fonts via next/font, metadata, manifest.
- `web/src/components/ui/Button.tsx` — `primary | secondary | dark | disabled`,
  sizes `sm 34px | md 40px | lg 44px | xl 48px`, `block`, `href` renders a Link.
- `web/src/components/ui/TierPill.tsx` — `Live` purple, `Quote` lilac, `Unpriced`
  grey outline; plus `ClosedPill`, `LivePill`.
- `web/src/components/ui/Brand.tsx` — `Wordmark`, `BuiltOnMonad`, `PartnerMark`.
- `web/src/components/ui/StatCell.tsx` — mono label over display figure.
- `web/src/components/ReceiptSlip.tsx` — the hero artifact, sizes `sm|md|lg`,
  `compact` for the mobile hero, `animate` for the confirmation moment,
  `maxSpreadBps` row. Takes a `Receipt`.
- `web/src/components/Nav.tsx` (client) and `Footer.tsx`.
- `web/src/components/CorridorRows.tsx` — `CorridorTable` (desktop) and
  `CorridorList` (mobile) over `LiveRate[]`.

Brand assets live in `web/public/brand/` (Monad full black/white, logomark, MON
token, Agora, Chainlink, Mento, Nansen, Privy). Partner marks are tinted with
`currentColor`.

## Data layer (already built, `web/src/lib/`)

- `corridors.ts` — the registry with three tiers. Today: **live** USD→GBP, EUR,
  CHF, JPY (all four Mento pools exist and quote, facts §14.1); **quote** CAD
  (Chainlink, no asset), ZAR (Pyth pull, no asset); **unpriced** NGN.
- `rates.ts` — `liveRates()` reads every corridor's feed (Chainlink via viem on
  Monad mainnet, Pyth via Hermes), flags `stale` past 1.5× heartbeat and
  `marketClosed` from the mirrored market-hours breaker. `referenceRate()`
  composes the receipt reference exactly like `ChainlinkRateSource`.
  `mentoQuote()` is the venue quote. `poolStatus()` reads a pool's own oracle
  adapter. Reads are cached 30 s.
- `receipts.ts` — `getReceipt(intentId)`, `listReceipts()`, `totals()` read
  RateAttestation on the configured chain; with no deployment and
  `NEXT_PUBLIC_FIXTURES=1` they return the design's sample receipt, which has
  `sample: true` and must render as "Sample receipt", never as a settlement.
- `format.ts` — `money`, `rateLine`, `rateValue`, `bps`, `spreadLine` (amount
  first, bps second, always), `shortAddress`, `utcStamp`, `utcTime`,
  `utcDayTime`, `blockNumber`.
- `market-hours.ts` — `isFxMarketOpen(ts)`, `nextTransition(ts)`. Closed
  Fri 21:00 → Sun 23:00 UTC. (The canvas says "Sun 22:00"; the verified breaker
  says 23:00. Use 23:00.)
- `chain.ts` — `mainnet()` client for rate reads, `appChain()` for the chain
  the app settles on (`NEXT_PUBLIC_MONAD_CHAIN_ID`, testnet by default).

## Artboards → routes

| Artboard | Route | Notes |
| --- | --- | --- |
| L1 (1280) + L1m (360) | `/` | Landing. One responsive page; the mobile canvas is the ≤ md layout. |
| S0 | `/send` (signed out) | Passkey sign-in. **Mera, not Privy**: one button "Continue with passkey", a secondary "I already have a passkey" (sign-in ceremony). Footer line "Passkey by Mera · Monad mainnet". No email, no external wallet. |
| S1 | `/send` step 1 | Amount, source asset (AUSD default, USDC), recipient, indicative "receives" at the reference rate, "Fund from another chain · Aurora Intents →" (link only for now). |
| S2 | `/send` step 2 | Quote with expiry (fresh / expiring ≤ 10 s amber / expired), spread headline, rate table, dark "receives" panel, worst-rate stepper (maxSpreadBps, default 50), "Send payout". |
| S3 | `/send` step 3 | Toast "Payout sent · final in 0.6 s", the receipt printing (feed then stamp), Share receipt / Monadscan. |
| S4 | `/rates` (≤ md) | Mobile rates. |
| S5 | `/send` closed | FX market closed state for a live corridor: dark panel with next open, last settled rate, disabled amount card, "Opens Sun 23:00 UTC" disabled button, Browse rates / Receipt #1. |
| W1 | `/receipt/[intentId]` | Server-rendered, no wallet, OG image. Dark left panel with the slip and permalink, right column verification list read from the chain, Monadscan and Copy permalink. |
| W2 | `/rates` (≥ md) | Closed-market banner when `marketClosed`, hero with "01" ghost type, three stats, corridor table, Routes column, Settlements ledger, footer strip. |

Design props → app state: `sourceAsset` is the asset selector; `marketClosed`
comes from `isFxMarketOpen`; `quoteState` from the quote's deadline countdown;
`spreadUnit` is fixed to `both` (amount first); `printAnimation` respects
`prefers-reduced-motion`.

## Copy rules

- Amount first, bps second: "£0.61 · 31 bps". On the quote screen: "You are
  paying £0.61 in spread. That is 31 bps."
- Buttons are verbs: "Send a payout", "Get quote", "Send payout", "Share receipt".
- Errors say what happened and what to do next.
- Finality copy is "final in 0.6 s" (two 300 ms blocks), not 0.8 s.
- The corridor line names the venue and the feed: "Mento GBPm/USDm · Chainlink GBP/USD".
- Never invent aggregates. With one settlement the ledger says so.

## Breakpoints

Mobile first at 360px real viewport. `md` (768px) switches to the desktop
layouts, which are designed at 1280px inside a 1200px column with 40px
dot-grid gutters (`.dotgrid` on the outer, hairline left/right on the inner).
