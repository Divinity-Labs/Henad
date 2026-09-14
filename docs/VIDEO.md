# Henad — motion film treatment

A 90-second film. One idea, carried by one shape.

> **Before anything else.** The required demo-video length is still behind the
> hackathon login (`docs/YOUR-LIST.md` item 6). Ninety seconds is the safe default for
> a judged demo, and this treatment is built so it cuts cleanly to 60 and to 30 — the
> cut points are marked. Check the rules before the final render.

---

## The idea

Every cross-border transfer has a number nobody shows you. You put in one figure, a
different figure comes out, and the distance between them is the business. Banks call it
"no fees" and take it on the rate. Apps quote you a rate and take it on the spread.

Henad's logo is two uprights with a gap between two bars. **That gap is the spread.**

The whole film is that gap: hidden, named, measured, printed. Nothing else needs saying.

---

## Tone

The product's voice is already written, on the site and in the receipt: short sentences,
real numbers, no adjectives. The film must not be louder than the product.

- **No stock footage.** No handshakes, no globes, no aerial city shots, no smiling people
  holding phones. The subject is a number, and the number is the hero.
- **No claims the receipt cannot back.** Every figure on screen must be one the chain
  actually produced.
- **Typography and the product UI only.** The design canvas already holds seven phone
  screens at 360×780 and the full desktop set. That is the art direction.
- **Silence is a tool.** The spread reveal should land in a gap in the sound.

Palette, straight from the tokens: canvas off-white, ink `#0E091C`, purple `#6E54FF`,
hairline rules, one mono face for figures. Dark only for the delivered band.

---

## Structure

| Act | Time | What it does |
| --- | --- | --- |
| 1 | 0:00–0:18 | The hidden number |
| 2 | 0:18–0:30 | The gap gets a name |
| 3 | 0:30–1:02 | The product, in one take |
| 4 | 1:02–1:20 | The receipt |
| 5 | 1:20–1:32 | The argument |
| 6 | 1:32–1:38 | Mark and line |

---

## Act 1 — The hidden number (0:00–0:18)

**0:00** Black. One line of mono type, small, centred, no animation:

> You sent $250.

**0:03** The type holds. Then, on the same baseline, far right of frame, a second figure
fades up with a large void between them:

> You sent $250.  ·  They received £195.01

**0:06** A caret blinks in the void. Something belongs there. Nothing arrives.

**0:09** Cut to white. Three lines, each appearing on its own beat, each replacing the
last rather than stacking:

> Your bank called it no fee.
> Your app called it the rate.
> Neither of them wrote it down.

**0:15** Back to the two figures. The void between them now has a faint dashed rule, the
same dashed rule the receipt uses.

*Sound: room tone only. One soft mechanical tick on the caret.*

> **Cut for 60s:** keep 0:00–0:06 and 0:15–0:18, drop the three lines.
> **Cut for 30s:** open directly on Act 2.

---

## Act 2 — The gap gets a name (0:18–0:30)

**0:18** The two figures slide toward each other and become two vertical strokes. The
dashed rule between them thickens into two horizontal bars with a gap at the centre.

The Spread H assembles itself out of the transaction. The left stem and bar in ink, the
right stem and bar in purple — the same two-tone treatment the mark already uses.

**0:24** The gap at the centre pulses once and a hairline callout draws to it:

> £0.61 · 31 bps

**0:27** One line under the mark:

> This is the spread. It has always been there.

**0:29** And it resolves to the wordmark: **Henad**.

*Sound: a single low note on the assembly. The callout lands in silence.*

**This is the most important twelve seconds in the film.** If the logo assembling out of
the transaction does not read instantly, the rest is decoration. Prototype this beat
first and show it to someone cold before building anything else.

---

## Act 3 — The product, in one take (0:30–1:02)

Phone frame, 360×780, centred, on the dot-grid. One continuous move down the flow — no
cuts between screens, the content scrolls and morphs. It should feel like one object,
not a slideshow.

**0:30 — Sign in.** The passkey prompt. A fingerprint. The address chip writes itself in.
Caption, lower third, mono, small:

> No wallet. No seed phrase. No app store.

**0:38 — Amount.** `$250.00` types in. The live rate line appears beneath it with its
source named:

> 1 USD = £0.74036 · Chainlink GBP/USD

Caption:

> The reference rate, read from the chain.

**0:46 — Quote.** This is the beat the product exists for. The quote card resolves and
the headline sets itself line by line:

> You are paying **£0.61** in spread. That is **31 bps**.

Hold. Let it sit for a full second longer than feels comfortable.

Caption:

> Before you sign. Not after.

**0:56 — Settle.** The button presses. A progress line crosses the card. It finishes
before the eye expects it to.

> Final in 0.6 seconds.

*Sound: the sign-in has a soft haptic thud. The quote headline lands dry. The settle is
one clean transient and then silence.*

> **Cut for 60s:** drop the sign-in beat, open Act 3 on the amount.
> **Cut for 30s:** amount and quote only, six seconds each.

---

## Act 4 — The receipt (1:02–1:20)

**1:02** The receipt slides up out of the card, on the torn-edge treatment the product
already uses. It prints line by line, each line snapping in with the dashed rule
redrawing beneath it:

> Reference rate — 1 USD = £0.74036
> Your rate — 1 USD = £0.73888
> **Spread — £0.61 · 31 bps**
> Rate source — Chainlink GBP/USD
> Venue — Mento GBPm/USDm
> Network fee — sponsored

**1:12** The frame pulls back. The receipt is now a URL in a browser bar, on a plain
page, with no app around it.

> Nobody needs Henad to read this.

**1:16** A second cursor, from nowhere in particular, selects the spread line. Someone
else is checking.

> The payment is the product. The receipt is the proof.

*Sound: a light mechanical print per line, six of them, then nothing.*

---

## Act 5 — The argument (1:20–1:32)

This is what separates a submission from a demo. Do not cut it.

**1:20** The corridor table draws itself, live rows first:

> GBP · EUR · CHF · JPY — **Live**
> CAD — **Quote**
> ZAR · NGN — **Unpriced**

**1:24** The four live rows dim. One line:

> Chainlink runs five fiat feeds on Monad. None of them is African.

**1:28** The `USD → NGN` row stays lit, and its reason writes out where a rate would be:

> No NGN feed on Monad.

**1:30** One line, the thesis:

> Henad ships the corridor anyway, refuses to quote it, and shows you why.

*Sound: nothing. Let this one be silent.*

---

## Act 6 — Mark and line (1:32–1:38)

**1:32** The mark, centred, on canvas. The gap at its centre is the last thing on screen.

**1:35**

> **Henad** — usehenad.xyz
> Built on Monad

**1:38** Out.

---

## Production notes

### The numbers must be real, and that is a scheduling constraint

The film's entire claim is that the figures are checkable. Someone will paste the
receipt URL. So the settlement in Acts 3 and 4 should be a **real mainnet payout**, shot
after the week-4 deploy, with the permalink live at the moment the film is submitted.

Until then, shoot against the local fork and treat it as an animatic, not a master. The
figures used above are from the design's canonical example, `$250 → £195.01`, spread
`£0.61`, 31 bps. The real end-to-end settlement produced `$10.00 → £7.3883` at 19 bps,
which is true but reads small on screen. Pick a round figure for the real payout so the
film's arithmetic is legible: **$250 is the right size to send for real.**

If the mainnet payout has not happened by the filming date, every number on screen must
carry the word `Sample`, exactly as the product does. Do not quietly show fork figures as
mainnet ones. That is the one thing this project cannot be caught doing.

### Sound

No music bed under Acts 1 and 2. A sparse, low pad can start at Act 3 and drop out
entirely at 1:20 for the argument. If you can only do one thing well, do the silences.

### Voiceover

Recommended: **none.** The product's voice is typographic and the lines are short enough
to read. A voiceover would make it sound like every other fintech video, and an accent
question becomes a distraction judges do not need.

If a voiceover is required by the rules, read only the lines already written above, at
about 80% of a normal pace, with no emphasis added. The words are doing the work.

### What to build first

1. The Act 2 logo assembly. Everything depends on it.
2. The Act 3 quote headline, because it is the product's argument in one frame.
3. The Act 4 receipt print.

Acts 1, 5 and 6 are typography on flat colour and can be built last in a day.

### Assets already in the repo

- `design/Henad-v4.dc.html` — the full canvas, including seven phone screens at 360×780
- `web/src/components/ui/HenadMark.tsx` — the mark as SVG, with the exact geometry
- `web/src/app/globals.css` — tokens, the dot grid, the grain, the receipt torn edge
- A running local fork via `scripts/local-fork.sh` for screen capture

### Three labels in the canvas are out of date

The mobile screens still say **Privy** on sign-in, **Kuru fallback** on the quote, and
**Labels by Nansen** on rates. All three were dropped. Fix them in the canvas before
capturing any frame that shows them, or the film advertises integrations that do not
exist.
