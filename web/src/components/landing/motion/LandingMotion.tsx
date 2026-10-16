'use client'

import { useRef, type ReactNode } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText, ScrambleTextPlugin)

/**
 * The landing page's motion, as one layer over server-rendered sections. Sections opt in with
 * data attributes, so they stay server components and keep every figure read from the chain:
 *
 *   data-hero          the hero; its parts are data-h="eyebrow|title|copy|actions|slip|glow"
 *   data-card / data-depth   a floating hero card (inner) inside its parallax layer (outer)
 *   data-split         a heading whose lines rise out of a mask as it scrolls in
 *   data-scramble      a mono eyebrow that decodes itself once
 *   data-rise          one block that fades up once
 *   data-stagger       its children fade up in turn
 *   data-rows          the rows (tr or li) inside it fade up in turn
 *   data-count         a figure that counts up from zero, formatting kept
 *   data-parallax="n"  drifts n px against the scroll
 *   data-drift="n"     ghost type that slides n % sideways with the scroll
 *   data-zoom          ghost type that grows into place with the scroll
 *   data-magnetic      leans towards the pointer
 *
 * GSAP folds an element's Tailwind translate-* into its own transform when it animates it, so
 * a centred box (-translate-x-1/2) keeps its centring only if the animated element is a child.
 *
 * Nothing is hidden until this runs, except the hero, which CSS holds back for at most 2.4 s
 * (globals.css, .hero-pre) so the first paint is not a flash of the finished page. Reduced
 * motion gets none of it: matchMedia skips the setup and the CSS hold.
 */
export function LandingMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const el = root.current
      if (!el) return
      const q = <T extends Element = HTMLElement>(sel: string) => Array.from(el.querySelectorAll<T & Element>(sel)) as T[]
      const mm = gsap.matchMedia()

      mm.add(
        { motion: '(prefers-reduced-motion: no-preference)', desktop: '(min-width: 768px)', fine: '(pointer: fine)' },
        (ctx) => {
          const { motion, desktop, fine } = ctx.conditions as { motion: boolean; desktop: boolean; fine: boolean }
          const hero = el.querySelector<HTMLElement>('[data-hero]')
          const undo: (() => void)[] = []
          if (!motion) {
            hero?.classList.remove('hero-pre')
            return
          }

          // Reading progress: a purple hairline along the top of the window.
          if (bar.current) {
            gsap.fromTo(bar.current, { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.3 } })
          }

          if (hero) undo.push(heroIn(hero, desktop, fine))

          for (const h of q('[data-scramble]')) {
            const text = h.textContent ?? ''
            gsap.to(h, {
              duration: 1.1,
              scrambleText: { text, chars: '0123456789ABCDEF→·', speed: 0.6, revealDelay: 0.25 },
              scrollTrigger: { trigger: h, start: 'top 88%', once: true },
            })
          }

          for (const h of q('[data-split]')) {
            SplitText.create(h, {
              type: 'lines',
              mask: 'lines',
              autoSplit: true,
              onSplit: (self) =>
                gsap.from(self.lines, {
                  yPercent: 105,
                  duration: 1.1,
                  ease: 'expo.out',
                  stagger: 0.09,
                  scrollTrigger: { trigger: h, start: 'top 85%', once: true },
                }),
            })
          }

          for (const b of q('[data-rise]')) {
            gsap.from(b, { y: 28, autoAlpha: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: b, start: 'top 88%', once: true } })
          }

          for (const group of q('[data-stagger]')) {
            gsap.from(group.children, {
              y: 36,
              autoAlpha: 0,
              duration: 0.9,
              ease: 'power3.out',
              stagger: 0.08,
              scrollTrigger: { trigger: group, start: 'top 85%', once: true },
            })
          }

          for (const group of q('[data-rows]')) {
            const rows = group.querySelectorAll('tbody tr, li')
            if (rows.length) {
              gsap.from(rows, { y: 18, autoAlpha: 0, duration: 0.7, ease: 'power2.out', stagger: 0.05, scrollTrigger: { trigger: group, start: 'top 85%', once: true } })
            }
          }

          for (const n of q('[data-count]')) undo.push(countUp(n))

          for (const p of q('[data-parallax]')) {
            const by = Number(p.dataset.parallax) || 60
            gsap.fromTo(p, { y: by }, { y: -by, ease: 'none', scrollTrigger: { trigger: p, start: 'top bottom', end: 'bottom top', scrub: 0.6 } })
          }

          for (const g of q('[data-drift]')) {
            const by = Number(g.dataset.drift) || 12
            gsap.fromTo(g, { xPercent: by }, { xPercent: -by, ease: 'none', scrollTrigger: { trigger: g.parentElement ?? g, start: 'top bottom', end: 'bottom top', scrub: 0.8 } })
          }

          for (const g of q('[data-zoom]')) {
            gsap.fromTo(
              g,
              { scale: 0.7, autoAlpha: 0 },
              { scale: 1, autoAlpha: 1, ease: 'none', scrollTrigger: { trigger: g.parentElement ?? g, start: 'top 90%', end: 'center 55%', scrub: 0.8 } },
            )
          }

          if (fine) for (const m of q('[data-magnetic]')) undo.push(magnetic(m))

          // Fonts change line breaks and heights; measure again once they are in.
          void document.fonts?.ready.then(() => ScrollTrigger.refresh())
          return () => undo.forEach((u) => u())
        },
      )
    },
    { scope: root },
  )

  return (
    <div ref={root}>
      <div ref={bar} aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px] origin-left scale-x-0 bg-purple" />
      {children}
    </div>
  )
}

/** The hero's entrance, then the cards' idle float, pointer parallax and scroll depth. */
function heroIn(hero: HTMLElement, desktop: boolean, fine: boolean): () => void {
  const part = (name: string) => hero.querySelectorAll<HTMLElement>(`[data-h="${name}"]`)
  hero.classList.remove('hero-pre')

  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } })
  tl.from(part('glow'), { autoAlpha: 0, scale: 0.7, transformOrigin: '50% 100%', duration: 2.4, ease: 'power2.out' }, 0)

  const eyebrow = part('eyebrow')[0]
  if (eyebrow) {
    // The eyebrow holds a mobile and a desktop wording; decode only the one on screen.
    const shown = Array.from(eyebrow.children).find((c): c is HTMLElement => c instanceof HTMLElement && c.offsetParent !== null) ?? eyebrow
    tl.from(eyebrow, { autoAlpha: 0, duration: 0.3 }, 0.1)
    tl.to(shown, { duration: 1.2, scrambleText: { text: shown.textContent ?? '', chars: '0123456789→·£$', speed: 0.5, revealDelay: 0.3 } }, 0.1)
  }

  const title = part('title')[0]
  if (title) {
    const split = SplitText.create(title, { type: 'lines, words', mask: 'lines' })
    tl.from(split.words, { yPercent: 110, rotate: 4, duration: 1.3, stagger: 0.06 }, 0.2)
    // Give the heading back its own text once it has landed, so it reflows freely on resize.
    tl.add(() => split.revert())
  }

  tl.from(part('copy'), { y: 24, autoAlpha: 0, duration: 1.1 }, 0.6)
  tl.from(part('actions'), { y: 20, autoAlpha: 0, duration: 1, stagger: 0.08 }, 0.75)
  tl.from(part('slip'), { y: 180, rotation: 9, autoAlpha: 0, duration: 1.6, ease: 'expo.out' }, 0.55)

  const cards = Array.from(hero.querySelectorAll<HTMLElement>('[data-card]'))
  if (cards.length) {
    tl.from(cards, { autoAlpha: 0, scale: 0.6, y: 60, rotation: '+=18', duration: 1.4, stagger: 0.12, ease: 'back.out(1.6)' }, 0.9)
    // A slow, out-of-step bob, so they read as hanging in the air rather than stuck on.
    cards.forEach((c, i) => {
      gsap.to(c, { yPercent: i % 2 ? 9 : -9, duration: 2.6 + i * 0.45, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 2 + i * 0.2 })
    })
  }

  if (desktop) {
    // Depth on scroll: the slip lifts and squares up, the cards move at their own speeds.
    const slip = Array.from(part('slip')).find((s) => s.offsetParent !== null)
    if (slip) gsap.to(slip, { y: -90, rotation: 1.5, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 0.7 } })
    for (const layer of hero.querySelectorAll<HTMLElement>('[data-depth]')) {
      const d = Number(layer.dataset.depth) || 1
      gsap.to(layer, { y: -140 * d, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 0.5 } })
    }
  }

  if (desktop && fine && cards.length) {
    // The cards lean away from the pointer, nearer ones further, like a window onto a scene.
    const movers = cards.map((c, i) => ({
      x: gsap.quickTo(c, 'x', { duration: 0.9, ease: 'power3' }),
      y: gsap.quickTo(c, 'y', { duration: 0.9, ease: 'power3' }),
      k: 14 + i * 7,
    }))
    const glow = part('glow')[0]
    const gx = glow ? gsap.quickTo(glow, 'x', { duration: 1.6, ease: 'power3' }) : null
    const onMove = (e: PointerEvent) => {
      const r = hero.getBoundingClientRect()
      const nx = (e.clientX - r.left) / r.width - 0.5
      const ny = (e.clientY - r.top) / r.height - 0.5
      for (const m of movers) {
        m.x(-nx * m.k)
        m.y(-ny * m.k)
      }
      gx?.(nx * 60)
    }
    hero.addEventListener('pointermove', onMove)
    return () => hero.removeEventListener('pointermove', onMove)
  }
  return () => {}
}

/** Counts the first number in `n` up from zero, keeping its prefix, suffix, separators and decimals. */
function countUp(n: HTMLElement): () => void {
  const text = n.textContent ?? ''
  const m = text.match(/\d[\d,]*(\.\d+)?/)
  if (!m || m.index === undefined) return () => {}
  const raw = m[0]
  const target = Number(raw.replace(/,/g, ''))
  if (!Number.isFinite(target) || target === 0) return () => {}
  const dp = m[1] ? m[1].length - 1 : 0
  const grouped = raw.includes(',')
  const before = text.slice(0, m.index)
  const after = text.slice(m.index + raw.length)
  const fmt = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp, useGrouping: grouped })
  const state = { v: 0 }
  // The real figure stays readable to assistive tech while the visible one runs.
  n.setAttribute('aria-label', text)
  gsap.to(state, {
    v: target,
    duration: 1.8,
    ease: 'power3.out',
    scrollTrigger: { trigger: n, start: 'top 92%', once: true },
    onStart: () => {
      n.textContent = before + fmt(0) + after
    },
    onUpdate: () => {
      n.textContent = before + fmt(state.v) + after
    },
    onComplete: () => {
      n.textContent = text
    },
  })
  return () => {
    n.textContent = text
    n.removeAttribute('aria-label')
  }
}

/** A button that leans a few pixels towards the pointer and springs back when it leaves. */
function magnetic(m: HTMLElement): () => void {
  const x = gsap.quickTo(m, 'x', { duration: 0.5, ease: 'power3' })
  const y = gsap.quickTo(m, 'y', { duration: 0.5, ease: 'power3' })
  const move = (e: PointerEvent) => {
    const r = m.getBoundingClientRect()
    x((e.clientX - r.left - r.width / 2) * 0.28)
    y((e.clientY - r.top - r.height / 2) * 0.4)
  }
  const leave = () => gsap.to(m, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.35)' })
  m.addEventListener('pointermove', move)
  m.addEventListener('pointerleave', leave)
  return () => {
    m.removeEventListener('pointermove', move)
    m.removeEventListener('pointerleave', leave)
  }
}
