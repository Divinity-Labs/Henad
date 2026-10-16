'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin'
import { TextPlugin } from 'gsap/TextPlugin'
import { useGSAP } from '@gsap/react'
import { Button } from '@/components/ui/Button'
import { HenadMark } from '@/components/ui/HenadMark'
import { TokenIcon } from '@/components/ui/TokenIcon'
import { Rows } from '@/components/send/send-ui'
import { readEarnState } from '@/lib/earn'

gsap.registerPlugin(useGSAP, ScrollTrigger, DrawSVGPlugin, TextPlugin)

/** What the vault has actually paid lately and what leaving at once costs, both read from the chain. */
interface VaultTerms {
  rate: number | null
  days: number | null
  feeBps: number | null
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

function steps(terms: VaultTerms | null) {
  const paid =
    terms?.rate != null && terms.days != null
      ? `Over the last ${Math.round(terms.days)} days it paid about ${pct(terms.rate)} a year, worked out from the vault’s own share price. `
      : 'The rate shown is worked out from the vault’s own share price. '
  const fee = terms?.feeBps != null ? `Leaving at once costs ${(terms.feeBps / 100).toFixed(1)}%.` : 'Withdraw any time.'
  return [
    {
      title: 'Claim your @name',
      body: 'Pick a Henad name once. Anyone on Henad pays you by typing it, instead of copying a long account number. Free, and Henad pays the network fee.',
    },
    {
      title: 'Send money as a link',
      body: 'Paying someone who isn’t on Henad yet? Make a link and drop it in any chat. The money waits in a contract until they open it.',
    },
    {
      title: 'They tap once. It’s theirs.',
      body: 'Their fingerprint or face makes an account on the spot. No app, no seed phrase. Until they claim it, you can take it back.',
    },
    {
      title: 'Earn on AUSD while it waits',
      body: `Put idle AUSD into Upshift’s earnAUSD vault from the Earn tab. ${paid}It moves with lending markets and isn’t a promise. ${fee}`,
    },
  ]
}

/**
 * Everything around the payout: Henad names, claim links and Earn, told as four steps beside
 * a phone drawn like the app itself; for the claim it is the recipient's phone. On desktop the section pins and the scroll drives the phone; on a phone the demo
 * loops while it is on screen. Reduced motion gets the steps and a still phone.
 *
 * The phone is an illustration (aria-hidden): its names and amounts are examples, apart from
 * the vault's rate, which is the one the steps state, read live.
 */
export function PayPeople() {
  const root = useRef<HTMLElement>(null)
  const [terms, setTerms] = useState<VaultTerms | null>(null)

  useEffect(() => {
    let live = true
    readEarnState(null).then(
      (s) => live && setTerms({ rate: s.apy?.rate ?? null, days: s.apy?.days ?? null, feeBps: s.instantFeeBps }),
      () => live && setTerms({ rate: null, days: null, feeBps: null }),
    )
    return () => {
      live = false
    }
  }, [])

  useGSAP(
    () => {
      const el = root.current
      if (!el) return
      // Scoped, so the selectors in the timeline only ever reach this section's phone.
      const mm = gsap.matchMedia(el)
      mm.add({ motion: '(prefers-reduced-motion: no-preference)', desktop: '(min-width: 1024px)' }, (ctx) => {
        const { motion, desktop } = ctx.conditions as { motion: boolean; desktop: boolean }
        if (!motion) return
        const tl = demo(el, desktop)
        if (desktop) {
          ScrollTrigger.create({
            trigger: el.querySelector('[data-pin]'),
            pin: true,
            start: 'top top',
            end: '+=3400',
            scrub: 0.6,
            animation: tl,
          })
        } else {
          tl.repeat(-1).repeatDelay(1.6)
          ScrollTrigger.create({ trigger: el.querySelector('[data-phone]'), start: 'top 80%', end: 'bottom 10%', animation: tl, toggleActions: 'play pause resume pause' })
        }
      })
    },
    { scope: root },
  )

  const list = steps(terms)
  return (
    <section ref={root} aria-labelledby="people-heading" className="border-b border-hairline">
      <div data-pin className="grid lg:min-h-dvh lg:grid-cols-[1fr_460px] lg:items-center gap-10 lg:gap-6 px-4 md:px-9 pt-10 pb-12 lg:py-12 bg-canvas">
        <div className="flex flex-col gap-6 lg:gap-7">
          <div className="flex flex-col gap-[10px] lg:gap-4">
            <p className="m-0 font-mono uppercase text-[10px] md:text-[11px] tracking-[.12em] text-purple">More than a payout</p>
            <h2 id="people-heading" className="m-0 max-w-[600px] balance font-display font-medium text-[28px] md:text-[44px] tracking-[-.03em] leading-[1.05]">
              Pay a name. Pay anyone. Earn while it waits.
            </h2>
          </div>
          <ol className="m-0 p-0 list-none flex flex-col border-t border-hairline">
            {list.map((s, i) => (
              <li key={s.title} data-step className="grid grid-cols-[36px_1fr] gap-x-3 gap-y-[6px] py-4 border-b border-hairline">
                <span className="font-mono text-[12px] text-purple pt-[5px]">0{i + 1}</span>
                <h3 className="m-0 font-display font-medium text-[19px] md:text-[21px] tracking-[-.02em]">{s.title}</h3>
                <p className="col-start-2 m-0 max-w-[540px] overflow-hidden text-[14px] leading-[1.6] text-grey pretty">{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-3">
            <Button href="/account" size="lg" data-magnetic>
              Claim your name
            </Button>
            <Button href="/link" variant="secondary" size="lg" data-magnetic>
              Send a link
            </Button>
            <Button href="/earn" variant="secondary" size="lg" data-magnetic>
              Start earning
            </Button>
          </div>
        </div>
        <div className="flex justify-center">
          <Phone rate={terms?.rate ?? null} feeBps={terms?.feeBps ?? null} />
        </div>
      </div>
    </section>
  )
}

/**
 * The phone's story as one timeline. Each step ends in a short hold, so a scroll that stops
 * anywhere near it shows a whole screen rather than half of a change. Screens cross-fade in
 * place, the way the app moves between steps.
 */
function demo(el: HTMLElement, collapse: boolean) {
  const steps = Array.from(el.querySelectorAll<HTMLElement>('[data-step]'))
  const bodies = steps.map((s) => s.querySelector('p'))
  const values = Array.from(el.querySelectorAll<HTMLElement>('[data-earn-value]'))
  const tl = gsap.timeline({ defaults: { ease: 'power3.out', duration: 0.5 } })
  const focus = (i: number) => {
    tl.to(steps, { opacity: (j: number) => (j === i ? 1 : 0.3), duration: 0.3 }, '<')
    // Pinned on a laptop, four open steps can outgrow the screen: only the current one stays open.
    if (collapse) tl.to(bodies, { height: (j: number): string => (j === i ? 'auto' : '0px'), autoAlpha: (j: number) => (j === i ? 1 : 0), duration: 0.35 }, '<')
  }
  const show = (from: string, to: string, owner?: string) => {
    tl.to(`[data-screen="${from}"]`, { autoAlpha: 0, y: -12, duration: 0.35, ease: 'power2.in' })
    if (owner) tl.set('[data-owner]', { text: owner })
    tl.fromTo(`[data-screen="${to}"]`, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.45 })
  }
  const press = (sel: string) => tl.to(sel, { scale: 0.96, duration: 0.12, yoyo: true, repeat: 1, ease: 'power1.inOut' })

  // 1 · Claim a name
  tl.set('[data-screen]', { autoAlpha: 0, y: 0 })
  tl.set('[data-screen="name"]', { autoAlpha: 1 })
  tl.set('[data-owner]', { text: 'Your phone' })
  tl.set('[data-chip]', { text: '0x7a3f…9c2e' })
  tl.set('[data-held], [data-won], [data-free], [data-ready]', { autoAlpha: 0 })
  tl.set('[data-form]', { autoAlpha: 1, y: 0 })
  tl.set('[data-typed]', { text: '' })
  focus(0)
  tl.to('[data-typed]', { text: 'ada', duration: 0.6, ease: 'none' })
  tl.to('[data-free]', { autoAlpha: 1, duration: 0.3 })
  press('[data-claim-btn]')
  tl.to('[data-form]', { autoAlpha: 0, y: -8, duration: 0.3 })
  tl.fromTo('[data-held]', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.45 })
  tl.set('[data-chip]', { text: '@ada' })
  tl.addLabel('name')
  tl.to({}, { duration: 0.6 })

  // 2 · Send a link
  focus(1)
  show('name', 'link')
  press('[data-make-btn]')
  tl.fromTo('[data-ready]', { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.45 })
  tl.addLabel('link')
  tl.to({}, { duration: 0.6 })

  // 3 · Mum claims it, on her own phone
  focus(2)
  show('link', 'claim', 'Mum’s phone')
  tl.set('[data-chip]', { text: 'New here' }, '<')
  press('[data-pay-btn]')
  tl.fromTo('[data-print] path', { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.6, stagger: 0.05, ease: 'power1.inOut' })
  tl.fromTo('[data-won]', { autoAlpha: 0, y: -14 }, { autoAlpha: 1, y: 0, duration: 0.45 })
  tl.addLabel('claim')
  tl.to({}, { duration: 0.6 })

  // 4 · Back on your phone: the rest of it earns
  focus(3)
  show('claim', 'earn', 'Your phone')
  tl.set('[data-chip]', { text: '@ada' }, '<')
  tl.fromTo('[data-spark-line]', { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.9, ease: 'power1.inOut' })
  tl.fromTo('[data-spark-fill]', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5 }, '<0.4')
  // The balance creeps up as the line draws: the yield shows in the share price, a little at a time.
  const held = { v: 1000 }
  tl.fromTo(
    held,
    { v: 1000 },
    {
      v: 1000.42,
      duration: 1.1,
      ease: 'none',
      onUpdate: () => {
        const text = held.v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        for (const n of values) n.textContent = text
      },
    },
    '<',
  )
  tl.addLabel('earn')
  tl.to({}, { duration: 0.6 })
  return tl
}

/** The app's own small pieces, as spans: the phone is a picture, so nothing in it may take focus. */
const label = 'font-mono text-[9px] uppercase tracking-[.1em]'
const cta = 'flex h-11 flex-none items-center justify-center rounded-[4px] bg-purple font-mono text-[11px] uppercase tracking-[.06em] text-white'
const card = 'rounded-[12px] border border-hairline bg-surface'

/** A phone drawn like the product canvas: white body, ink outline, Henad's header, one screen at a time. */
function Phone({ rate, feeBps }: { rate: number | null; feeBps: number | null }) {
  return (
    <div data-phone aria-hidden="true" className="phone-fit flex flex-col items-center gap-3 select-none">
      <span data-owner className={`${label} text-muted`}>
        Your phone
      </span>
      <div className="relative h-[600px] w-[300px] overflow-hidden rounded-[30px] border-[3px] border-ink bg-canvas shadow-[0_40px_80px_-40px_rgba(14,9,28,.45)]">
        <div className="flex items-center justify-between px-6 pt-3 font-mono text-[11px] text-ink">
          <span>9:30</span>
          <span className="h-[10px] w-[10px] rounded-full bg-ink" />
          <span className="flex items-center gap-[5px]">
            <svg viewBox="0 0 16 12" className="h-[10px] w-[13px]" fill="currentColor">
              <path d="M8 11.5 1 4.2a10 10 0 0 1 14 0z" />
            </svg>
            <span className="h-[9px] w-[16px] rounded-[2px] border border-ink p-[1px]">
              <span className="block h-full w-[75%] bg-ink" />
            </span>
          </span>
        </div>
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <span className="flex items-center gap-[7px]">
            <HenadMark size={18} title="" />
            <span className="font-display text-[16px] font-semibold tracking-[-.02em]">Henad</span>
          </span>
          <span data-chip className="rounded-[4px] border border-border bg-surface px-2 py-[3px] font-mono text-[10px] text-ink">
            0x7a3f…9c2e
          </span>
        </div>
        <div className="relative h-[524px]">
          <NameScreen />
          <LinkScreen />
          <ClaimScreen />
          <EarnScreen rate={rate} feeBps={feeBps} />
        </div>
      </div>
    </div>
  )
}

const SCREEN = 'absolute inset-0 flex flex-col gap-3 px-4 pt-1 pb-5'

function ScreenHead({ left, right }: { left: string; right?: string }) {
  return (
    <span className={`${label} flex justify-between text-purple`}>
      <span>{left}</span>
      {right ? <span className="text-muted">{right}</span> : null}
    </span>
  )
}

/** A made-up QR: corner finders plus a fixed scatter, so it reads as a code without being one. */
const QR = Array.from({ length: 81 }, (_, i) => {
  const r = Math.floor(i / 9)
  const c = i % 9
  const finder = (r < 3 && c < 3) || (r < 3 && c > 5) || (r > 5 && c < 3)
  return finder ? !(r % 6 === 1 && c % 6 === 1) || (r === 1 && c === 1) || (r === 1 && c === 7) || (r === 7 && c === 1) : (r * 7 + c * 3 + r * c) % 5 < 2
})

function NameScreen() {
  return (
    <div data-screen="name" className={SCREEN}>
      <ScreenHead left="Your account" right="Get paid" />
      <div className={`${card} grid p-4`}>
        <div data-form className="[grid-area:1/1] flex flex-col gap-2">
          <span className={`${label} text-muted`}>Claim your Henad name · free</span>
          <span className="flex gap-2">
            <span className="flex flex-1 items-center rounded-[4px] border border-border bg-surface px-3 py-[9px] text-[15px]">
              <span className="text-muted">@</span>
              <span data-typed>ada</span>
              <span className="ml-[1px] h-[16px] w-[1.5px] animate-pulse bg-purple" />
            </span>
            <span data-claim-btn className="flex items-center rounded-[4px] bg-purple px-3 font-mono text-[10px] uppercase tracking-[.06em] text-white">
              Claim
            </span>
          </span>
          <span data-free className="border-l-2 border-purple pl-2 text-[11px] text-grey">
            @ada is free. People can pay you by typing it.
          </span>
        </div>
        <div data-held className="[grid-area:1/1] self-center flex flex-col gap-1 opacity-0">
          <span className={`${label} text-muted`}>Your Henad name</span>
          <span className="font-display text-[34px] font-medium leading-none tracking-[-.03em]">@ada</span>
          <span className="text-[11px] text-grey">Anyone on Henad can pay you by typing this name.</span>
        </div>
      </div>
      <div className={`${card} flex items-center gap-4 p-4`}>
        <span className="grid h-[84px] w-[84px] flex-none grid-cols-9 gap-[1px]">
          {QR.map((on, i) => (
            <span key={i} className={on ? 'bg-ink' : ''} />
          ))}
        </span>
        <span className="text-[11px] leading-[1.5] text-grey">Anyone can scan this with their phone camera to pay you.</span>
      </div>
      <Rows
        rows={[
          { k: 'AUSD', v: '1,025.00' },
          { k: 'Pay link', v: 'usehenad.xyz/pay/…' },
        ]}
      />
      <span className={`${cta} mt-auto`}>Share link</span>
    </div>
  )
}

function LinkScreen() {
  return (
    <div data-screen="link" className={`${SCREEN} opacity-0`}>
      <ScreenHead left="Send by link" right="No account needed" />
      <div className={`${card} flex flex-col gap-2 p-4`}>
        <span className={`${label} flex justify-between text-muted`}>
          <span>You send</span>
          <span>Balance 1,025.00</span>
        </span>
        <span className="flex items-center justify-between">
          <span className="font-display text-[34px] font-medium leading-none tracking-[-.03em] tabular">$25.00</span>
          <span className="flex items-center gap-[6px] rounded-[4px] border border-border px-2 py-1 font-mono text-[10px]">
            <TokenIcon symbol="AUSD" size={14} />
            AUSD
          </span>
        </span>
      </div>
      <span className="text-[12px] leading-[1.55] text-grey">They open it, tap once, and the money is theirs. Until they do, you can take it back.</span>
      <div data-ready className="flex flex-col gap-2 rounded-[12px] bg-dark p-4 text-white opacity-0">
        <span className={`${label} text-lilac-2`}>Your link is ready</span>
        <span className="break-all font-mono text-[11px] text-dim-2">usehenad.xyz/claim#8f3c…a91d</span>
        <span className="flex gap-2 pt-1">
          <span className="rounded-[4px] bg-white px-3 py-[6px] font-mono text-[10px] uppercase tracking-[.06em] text-ink">Share</span>
          <span className="rounded-[4px] border border-white/20 px-3 py-[6px] font-mono text-[10px] uppercase tracking-[.06em]">Copy</span>
        </span>
      </div>
      <span data-make-btn className={`${cta} mt-auto`}>
        Make link
      </span>
      <span className="text-center font-mono text-[9px] text-muted">Henad pays the network fee</span>
    </div>
  )
}

function ClaimScreen() {
  return (
    <div data-screen="claim" className={`${SCREEN} opacity-0`}>
      <ScreenHead left="Money for you" />
      <div className={`${card} flex flex-col gap-3 p-4`}>
        <span className={`${label} text-muted`}>From @ada</span>
        <span className="flex items-baseline gap-2">
          <span className="font-display text-[40px] font-medium leading-none tracking-[-.03em]">$25.00</span>
          <span className="font-mono text-[11px] text-muted">AUSD</span>
        </span>
        <span className="text-[12px] leading-[1.55] text-grey">Make a Henad account with your fingerprint or face, and it goes straight in. Nothing to pay.</span>
      </div>
      <div className="relative flex flex-1 items-center justify-center">
        <svg data-print viewBox="0 0 48 48" className="h-20 w-20 text-purple" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M14 21a10 10 0 0 1 20 0v3" />
          <path d="M9 27v-6a15 15 0 0 1 30 0v6" />
          <path d="M24 23v4c0 5-2 9-5 12" />
          <path d="M19 22a5 5 0 0 1 10 0v5c0 4-1 8-3 11" />
          <path d="M14 27c0 4-1 7-3 9" />
          <path d="M34 28c0 4-1 8-2 10" />
        </svg>
        <div data-won className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 flex-col gap-1 rounded-[12px] bg-dark p-4 text-white opacity-0">
          <span className={`${label} flex items-center gap-2 text-lilac-2`}>
            <span className="h-[6px] w-[6px] rounded-full bg-cyan" />
            Claimed · final in 0.6 s
          </span>
          <span className="font-display text-[26px] font-medium leading-none tracking-[-.03em]">$25.00 is yours.</span>
          <span className="text-[11px] text-dim">In your new Henad account.</span>
        </div>
      </div>
      <span data-pay-btn className={cta}>
        Claim with passkey
      </span>
      <span className="text-center font-mono text-[9px] text-muted">If nobody claims it, it can go back to the sender.</span>
    </div>
  )
}

function EarnScreen({ rate, feeBps }: { rate: number | null; feeBps: number | null }) {
  return (
    <div data-screen="earn" className={`${SCREEN} opacity-0`}>
      <ScreenHead left="Earn" right="Upshift · earnAUSD" />
      <div className="flex flex-col gap-1 rounded-[12px] bg-dark p-4 text-white">
        <span className={`${label} text-lilac-2`}>In the vault</span>
        <span className="flex items-baseline gap-2">
          <span data-earn-value className="font-display text-[34px] font-medium leading-none tracking-[-.03em] tabular">
            1,000.00
          </span>
          <span className="font-mono text-[11px] text-lilac-2">AUSD</span>
        </span>
        <svg viewBox="0 0 240 56" className="mt-2 h-[56px] w-full" fill="none">
          <defs>
            <linearGradient id="earn-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#6e54ff" stopOpacity=".55" />
              <stop offset="1" stopColor="#6e54ff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path data-spark-fill d="M0 50 C30 48 45 43 70 41 S115 32 140 27 S190 15 240 6 L240 56 L0 56 Z" fill="url(#earn-fill)" />
          <path data-spark-line d="M0 50 C30 48 45 43 70 41 S115 32 140 27 S190 15 240 6" stroke="#b9aeff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <Rows
        rows={[
          { k: 'Paid lately', v: rate !== null ? `≈ ${pct(rate)} a year` : 'From the share price' },
          { k: 'Leave at once', v: feeBps !== null ? `${(feeBps / 100).toFixed(1)}% fee` : 'Any time' },
          { k: 'Held by', v: 'You, not Henad', strong: true },
        ]}
      />
      <span className="text-[11px] leading-[1.5] text-grey">The vault lends AUSD across Monad’s markets. The rate moves and is not a promise.</span>
      <span className={`${cta} mt-auto`}>Add AUSD</span>
    </div>
  )
}
