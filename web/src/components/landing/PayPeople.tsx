'use client'

import { useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin'
import { TextPlugin } from 'gsap/TextPlugin'
import { useGSAP } from '@gsap/react'
import { Button } from '@/components/ui/Button'

gsap.registerPlugin(useGSAP, ScrollTrigger, DrawSVGPlugin, TextPlugin)

const STEPS = [
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
]

/**
 * Paying people rather than addresses: Henad names and claim links, told as three steps beside
 * a phone that acts them out. On desktop the section pins and the scroll drives the phone; on
 * a phone the demo plays on a loop while it is on screen. Reduced motion gets the steps and a
 * still phone showing a claimed name.
 *
 * The phone is an illustration (aria-hidden): the names and amount in it are examples, and
 * everything it shows is said in the steps beside it.
 */
export function PayPeople() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const el = root.current
      if (!el) return
      // Scoped, so the selectors in the timeline only ever reach this section's phone.
      const mm = gsap.matchMedia(el)
      mm.add({ motion: '(prefers-reduced-motion: no-preference)', desktop: '(min-width: 1024px)' }, (ctx) => {
        const { motion, desktop } = ctx.conditions as { motion: boolean; desktop: boolean }
        if (!motion) return
        const steps = Array.from(el.querySelectorAll<HTMLElement>('[data-step]'))
        const tl = demo(steps)
        if (desktop) {
          ScrollTrigger.create({
            trigger: el.querySelector('[data-pin]'),
            pin: true,
            start: 'top top',
            end: '+=2400',
            scrub: 0.6,
            animation: tl,
            snap: { snapTo: 'labelsDirectional', duration: { min: 0.2, max: 0.8 }, ease: 'power2.inOut' },
          })
        } else {
          tl.repeat(-1).repeatDelay(1.6)
          ScrollTrigger.create({ trigger: el.querySelector('[data-phone]'), start: 'top 80%', end: 'bottom 10%', animation: tl, toggleActions: 'play pause resume pause' })
        }
      })
    },
    { scope: root },
  )

  return (
    <section ref={root} aria-labelledby="people-heading" className="border-b border-hairline">
      <div data-pin className="grid lg:min-h-dvh lg:grid-cols-[1fr_440px] lg:items-center gap-10 lg:gap-6 px-4 md:px-9 pt-10 pb-12 lg:py-16 bg-canvas">
        <div className="flex flex-col gap-6 lg:gap-8">
          <div className="flex flex-col gap-[10px] lg:gap-4">
            <p className="m-0 font-mono uppercase text-[10px] md:text-[11px] tracking-[.12em] text-purple">Pay a person, not an address</p>
            <h2 id="people-heading" className="m-0 max-w-[560px] balance font-display font-medium text-[28px] md:text-[44px] tracking-[-.03em] leading-[1.05]">
              Send to a name. Or to someone with no account at all.
            </h2>
          </div>
          <ol className="m-0 p-0 list-none flex flex-col border-t border-hairline">
            {STEPS.map((s, i) => (
              <li key={s.title} data-step className="grid grid-cols-[36px_1fr] gap-x-3 gap-y-2 py-5 border-b border-hairline">
                <span className="font-mono text-[12px] text-purple pt-[6px]">0{i + 1}</span>
                <h3 className="m-0 font-display font-medium text-[20px] md:text-[22px] tracking-[-.02em]">{s.title}</h3>
                <p className="col-start-2 m-0 max-w-[520px] text-[14px] md:text-[15px] leading-[1.6] text-grey pretty">{s.body}</p>
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
          </div>
        </div>
        <div className="flex justify-center">
          <Phone />
        </div>
      </div>
    </section>
  )
}

/** The phone's story as one timeline, labelled per step so the pinned scroll can snap to each. */
function demo(steps: HTMLElement[]) {
  const tl = gsap.timeline({ defaults: { ease: 'power3.out', duration: 0.5 } })
  const focus = (i: number) => tl.to(steps, { opacity: (j: number) => (j === i ? 1 : 0.32), duration: 0.3 }, '<')

  // 1 · Claim a name
  tl.addLabel('name')
  tl.set('[data-screen="link"], [data-screen="claim"], [data-held], [data-won]', { autoAlpha: 0 })
  tl.set('[data-screen="name"]', { autoAlpha: 1, yPercent: 0 })
  tl.set('[data-typed]', { text: '' })
  tl.set('[data-free]', { autoAlpha: 0 })
  focus(0)
  tl.to('[data-typed]', { text: 'ada', duration: 0.6, ease: 'none' })
  tl.to('[data-free]', { autoAlpha: 1, y: 0, duration: 0.3 })
  tl.to('[data-claim-btn]', { scale: 0.94, duration: 0.12, yoyo: true, repeat: 1, ease: 'power1.inOut' })
  tl.to('[data-form]', { autoAlpha: 0, y: -10, duration: 0.3 })
  tl.fromTo('[data-held]', { autoAlpha: 0, scale: 0.85 }, { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'back.out(2)' })
  tl.to({}, { duration: 0.5 })

  // 2 · Send a link
  tl.addLabel('link')
  tl.to('[data-screen="name"]', { autoAlpha: 0, yPercent: -6, duration: 0.4 })
  tl.fromTo('[data-screen="link"]', { autoAlpha: 0, yPercent: 6 }, { autoAlpha: 1, yPercent: 0, duration: 0.4 }, '<0.1')
  focus(1)
  tl.from('[data-bubble]', { y: 40, autoAlpha: 0, scale: 0.9, transformOrigin: '100% 100%', duration: 0.5, ease: 'back.out(1.6)', stagger: 0.25 })
  tl.to('[data-ticks]', { color: '#6e54ff', duration: 0.2 })
  tl.to({}, { duration: 0.5 })

  // 3 · They claim it
  tl.addLabel('claim')
  tl.to('[data-screen="link"]', { autoAlpha: 0, yPercent: -6, duration: 0.4 })
  tl.fromTo('[data-screen="claim"]', { autoAlpha: 0, yPercent: 6 }, { autoAlpha: 1, yPercent: 0, duration: 0.4 }, '<0.1')
  focus(2)
  tl.from('[data-amount]', { yPercent: 60, autoAlpha: 0, duration: 0.5 })
  tl.to('[data-pay-btn]', { scale: 0.94, duration: 0.12, yoyo: true, repeat: 1, ease: 'power1.inOut' })
  tl.fromTo('[data-print] path', { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.7, stagger: 0.06, ease: 'power1.inOut' })
  tl.fromTo('[data-won]', { autoAlpha: 0, scale: 0.9 }, { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'back.out(1.8)' })
  tl.fromTo(
    '[data-spark]',
    { scale: 0, x: 0, y: 0, autoAlpha: 1 },
    {
      scale: 1,
      x: (i: number) => Math.cos((i / 10) * Math.PI * 2) * 110,
      y: (i: number) => Math.sin((i / 10) * Math.PI * 2) * 110,
      autoAlpha: 0,
      duration: 0.9,
      ease: 'expo.out',
    },
    '<',
  )
  tl.to({}, { duration: 0.6 })
  tl.addLabel('end')
  return tl
}

/** A phone in Henad's own colours, three screens stacked in it. */
function Phone() {
  return (
    <div data-phone aria-hidden="true" className="phone-fit relative w-[290px] rounded-[44px] bg-ink p-[10px] shadow-[0_50px_100px_-40px_rgba(14,9,28,.55)]">
      <div className="relative h-[580px] overflow-hidden rounded-[34px] bg-canvas">
        <div className="flex items-center justify-between px-6 pt-4 font-mono text-[11px] text-ink">
          <span>9:41</span>
          <span className="h-[18px] w-[76px] rounded-full bg-ink" />
          <span>100%</span>
        </div>

        {/* 1 · The account page, claiming a name */}
        <div data-screen="name" className="absolute inset-x-0 top-12 bottom-0 flex flex-col gap-4 px-5">
          <span className="label text-purple">Your account</span>
          <div className="rounded-[12px] border border-hairline bg-surface p-4 flex flex-col gap-3">
            <span className="label text-muted">Get paid</span>
            <div className="grid">
              <div data-form className="[grid-area:1/1] flex flex-col gap-2">
                <span className="label text-muted">Claim your Henad name · free</span>
                <div className="flex gap-2">
                  <div className="flex flex-1 items-center rounded-[4px] border border-border px-3 py-2 text-[15px]">
                    <span className="text-muted">@</span>
                    <span data-typed>ada</span>
                    <span className="ml-[1px] h-[18px] w-[1.5px] animate-pulse bg-purple" />
                  </div>
                  <span data-claim-btn className="flex items-center rounded-[4px] bg-purple px-3 font-mono text-[10px] uppercase tracking-[.06em] text-white">
                    Claim
                  </span>
                </div>
                <span data-free className="border-l-2 border-purple pl-2 text-[11px] text-grey">
                  @ada is free. People can pay you by typing it.
                </span>
              </div>
              <div data-held className="[grid-area:1/1] self-center flex flex-col gap-1 opacity-0">
                <span className="label text-muted">Your Henad name</span>
                <span className="font-display text-[34px] leading-none tracking-[-.03em]">@ada</span>
                <span className="text-[11px] text-grey">Anyone on Henad can pay you by typing this name.</span>
              </div>
            </div>
          </div>
          <div className="rounded-[12px] border border-hairline bg-surface p-4 flex flex-col gap-2">
            <span className="label text-muted">Holdings</span>
            <div className="flex justify-between font-mono text-[12px] text-grey">
              <span>AUSD</span>
              <span className="font-display text-[18px] text-ink">120.00</span>
            </div>
          </div>
        </div>

        {/* 2 · A chat, the link going out */}
        <div data-screen="link" className="absolute inset-x-0 top-12 bottom-0 flex flex-col opacity-0">
          <div className="flex items-center gap-3 border-b border-hairline px-5 pb-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-lilac font-display text-[12px] font-semibold text-purple-deep">MA</span>
            <span className="flex flex-col">
              <span className="text-[14px] font-medium">Mum</span>
              <span className="font-mono text-[10px] text-muted">online</span>
            </span>
          </div>
          <div className="flex flex-1 flex-col justify-end gap-2 bg-surface-2 px-4 pb-6">
            <div data-bubble className="max-w-[78%] self-start rounded-[14px] rounded-bl-[4px] bg-surface px-3 py-2 text-[13px]">
              Did it go through?
            </div>
            <div data-bubble className="max-w-[82%] self-end rounded-[14px] rounded-br-[4px] bg-lilac p-[6px] text-[13px]">
              <div className="flex flex-col gap-1 rounded-[10px] bg-surface p-3">
                <span className="label text-purple">Money for you</span>
                <span className="font-display text-[26px] leading-none tracking-[-.03em]">25.00 AUSD</span>
                <span className="font-mono text-[10px] text-muted">usehenad.xyz/claim</span>
              </div>
              <span className="block px-2 pt-[6px]">For the weekend. Open this</span>
              <span data-ticks className="block px-2 text-right font-mono text-[10px] text-muted">
                ✓✓
              </span>
            </div>
          </div>
        </div>

        {/* 3 · The claim page */}
        <div data-screen="claim" className="absolute inset-x-0 top-12 bottom-0 flex flex-col gap-4 px-5 opacity-0">
          <span className="label text-purple">Money for you</span>
          <div className="relative rounded-[12px] border border-hairline bg-surface p-4 flex flex-col gap-4 overflow-hidden">
            <span className="label text-muted">From @tunde</span>
            <span data-amount className="font-display text-[34px] leading-none tracking-[-.03em] whitespace-nowrap">
              25.00 AUSD
            </span>
            <span className="text-[12px] leading-[1.5] text-grey">Make a Henad account with your fingerprint, and it goes straight in.</span>
            <span data-pay-btn className="flex h-11 items-center justify-center rounded-[4px] bg-purple font-mono text-[11px] uppercase tracking-[.06em] text-white">
              Claim with passkey
            </span>
            <div className="flex justify-center pt-2">
              <svg data-print viewBox="0 0 48 48" className="h-16 w-16 text-purple" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M14 21a10 10 0 0 1 20 0v3" />
                <path d="M9 27v-6a15 15 0 0 1 30 0v6" />
                <path d="M24 23v4c0 5-2 9-5 12" />
                <path d="M19 22a5 5 0 0 1 10 0v5c0 4-1 8-3 11" />
                <path d="M14 27c0 4-1 7-3 9" />
                <path d="M34 28c0 4-1 8-2 10" />
              </svg>
            </div>
          </div>
          <div data-won className="absolute inset-x-5 bottom-8 flex flex-col items-center gap-1 rounded-[12px] bg-ink px-4 py-5 text-center text-white opacity-0 shadow-[0_24px_50px_-20px_rgba(14,9,28,.6)]">
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} data-spark className={`absolute left-1/2 top-1/2 h-2 w-2 rounded-full ${['bg-purple', 'bg-pink', 'bg-amber', 'bg-cyan', 'bg-lilac'][i % 5]}`} />
            ))}
            <span className="font-display text-[20px] tracking-[-.02em] whitespace-nowrap">25.00 AUSD is yours.</span>
            <span className="font-mono text-[10px] uppercase tracking-[.08em] text-lilac-2">In your Henad account</span>
          </div>
        </div>
      </div>
    </div>
  )
}
