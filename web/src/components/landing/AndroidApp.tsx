import type { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { HenadMark } from '@/components/ui/HenadMark'
import { ANDROID_URL } from '@/lib/site'

const POINTS = ['Passkey sign-in. No seed phrase.', 'Spread shown in pounds before you sign.', 'Every receipt opens as a public link.']

const label = 'font-mono text-[8px] uppercase tracking-[.1em]'

/**
 * "Henad is live on Android": the app's download, beside two of its screens. The button goes to
 * the latest GitHub release, which the Android build workflow publishes, so a new APK reaches
 * this page without a deploy.
 *
 * The phones are pictures (aria-hidden) of the app's own sign-in and send screens; their figures
 * are the canvas's examples, and the points beside them say everything the pictures do.
 */
export function AndroidApp() {
  return (
    <section aria-labelledby="android-heading" className="grid lg:grid-cols-2 border-b border-hairline">
      <div className="flex flex-col justify-center gap-5 px-4 md:px-9 py-12 lg:py-20 lg:border-r lg:border-hairline">
        <p className="m-0 flex items-center gap-2 font-mono uppercase text-[10px] md:text-[11px] tracking-[.12em] text-purple">
          <span aria-hidden className="h-[6px] w-[6px] rounded-full bg-purple" />
          {/* The scramble rewrites its element's text, so it gets the words and not the dot. */}
          <span data-scramble>Now on Android</span>
        </p>
        <h2 id="android-heading" data-split className="m-0 font-display font-medium text-[34px] md:text-[48px] tracking-[-.03em] leading-[1.05] balance">
          Henad is live on Android.
        </h2>
        <p data-rise className="m-0 max-w-[460px] text-[15px] md:text-[17px] leading-[1.6] text-grey pretty">
          Sign in with a passkey, pick an amount, and see the exact spread before you sign. The same receipt, from your phone.
        </p>
        <ol data-stagger className="m-0 p-0 list-none flex flex-col border-t border-hairline max-w-[460px]">
          {POINTS.map((p, i) => (
            <li key={p} className="grid grid-cols-[40px_1fr] py-3 border-b border-hairline font-mono text-[12px] text-ink">
              <span className="text-purple">0{i + 1}</span>
              {p}
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-3 pt-1">
          <Button href={ANDROID_URL} external size="lg" data-magnetic>
            Get it on Android
          </Button>
          <Button href="/send" variant="secondary" size="lg" data-magnetic>
            Open in browser
          </Button>
        </div>
        <p className="m-0 font-mono text-[10px] uppercase tracking-[.08em] text-muted">Android 9 or later · APK from GitHub releases</p>
      </div>

      <div
        aria-hidden="true"
        className="relative hidden md:flex min-h-[520px] items-center justify-center overflow-hidden"
        style={{ background: 'radial-gradient(ellipse 70% 60% at 60% 20%, rgba(221,215,254,.7), transparent 70%), radial-gradient(ellipse 60% 50% at 30% 90%, rgba(133,230,255,.25), transparent 70%)' }}
      >
        {/* The scroll moves the outer box and the tilt sits inside it: GSAP would take over a tilt on the box it moves. */}
        <div data-parallax="30" className="absolute left-[12%] top-[16%]">
          <div className="-rotate-[8deg]">
            <Phone>
              <SignInScreen />
            </Phone>
          </div>
        </div>
        <div data-parallax="60" className="absolute right-[10%] top-[8%]">
          <div className="rotate-[6deg]">
            <Phone>
              <SendScreen />
            </Phone>
          </div>
        </div>
      </div>
    </section>
  )
}

/** The canvas's phone: white body, ink outline, the status bar, Henad's header. */
function Phone({ children }: { children: ReactNode }) {
  return (
    <div className="h-[440px] w-[220px] overflow-hidden rounded-[26px] border-[3px] border-ink bg-canvas shadow-[0_40px_70px_-30px_rgba(14,9,28,.45)]">
      <div className="flex items-center justify-between px-4 pt-2 font-mono text-[8px] text-ink">
        <span>9:30</span>
        <span className="h-[7px] w-[7px] rounded-full bg-ink" />
        <span>5G</span>
      </div>
      {children}
    </div>
  )
}

function Head({ chip }: { chip: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
      <span className="flex items-center gap-[5px]">
        <HenadMark size={13} title="" />
        <span className="font-display text-[12px] font-semibold tracking-[-.02em]">Henad</span>
      </span>
      {chip}
    </div>
  )
}

function SignInScreen() {
  return (
    <div className="flex h-full flex-col">
      <Head chip={<span className={`${label} text-muted`}>Built on Monad</span>} />
      <div className="flex flex-col gap-2 px-3 pt-4" style={{ background: 'linear-gradient(180deg, transparent, rgba(221,215,254,.55) 70%, transparent)' }}>
        <span className={`${label} text-purple`}>Sign in</span>
        <span className="font-display text-[19px] font-medium leading-[1.05] tracking-[-.03em]">A wallet you don’t have to think about.</span>
        <span className="text-[8px] leading-[1.5] text-grey">Your passkey creates a wallet on Monad. No seed phrase.</span>
        <span className="mt-3 flex h-8 items-center justify-center rounded-[3px] bg-purple font-mono text-[8px] uppercase tracking-[.06em] text-white">Continue with passkey</span>
        <span className="flex h-8 items-center justify-center rounded-[3px] border border-border bg-surface font-mono text-[8px] uppercase tracking-[.06em]">I already have a passkey</span>
        <span className={`${label} mt-2 flex justify-between text-muted`}>
          <span>Passkey on device</span>
          <span>Monad mainnet</span>
        </span>
      </div>
      <div className="mt-auto flex flex-col gap-1 border-t border-hairline px-3 py-3 pb-8 text-[8px] leading-[1.5] text-grey">
        <span>
          <span className="font-mono text-purple">01</span> Henad never holds your money. Funds move wallet to wallet in one transaction.
        </span>
        <span>
          <span className="font-mono text-purple">02</span> No fiat, no custody, no KYC.
        </span>
      </div>
    </div>
  )
}

function SendScreen() {
  return (
    <div className="flex h-full flex-col">
      <Head chip={<span className="rounded-[3px] border border-border px-[5px] py-[2px] font-mono text-[7px]">@miracle</span>} />
      <div className="flex flex-1 flex-col gap-2 px-3 pt-3 pb-8">
        <span className={`${label} flex justify-between text-purple`}>
          <span>Send</span>
          <span className="text-muted">Step 1 of 2</span>
        </span>
        <div className="flex flex-col gap-1 rounded-[8px] border border-hairline bg-surface p-2">
          <span className={`${label} flex justify-between text-muted`}>
            <span>You send</span>
            <span>Balance 1,188.42</span>
          </span>
          <span className="flex items-center justify-between">
            <span className="font-display text-[24px] font-medium leading-none tracking-[-.03em]">$250.00</span>
            <span className="rounded-[3px] border border-border px-[5px] py-[2px] font-mono text-[7px]">AUSD · Monad</span>
          </span>
        </div>
        <span className={`${label} flex justify-between text-muted`}>
          <span>1 USD = £0.78247</span>
          <span>Chainlink GBP/USD</span>
        </span>
        <div className="flex flex-col gap-1 rounded-[8px] border border-hairline bg-surface p-2">
          <span className={`${label} text-muted`}>Ada receives</span>
          <span className="flex items-center justify-between">
            <span className="font-display text-[24px] font-medium leading-none tracking-[-.03em]">£195.62</span>
            <span className="rounded-[3px] border border-border px-[5px] py-[2px] font-mono text-[7px]">GBP</span>
          </span>
          <span className="text-[7px] leading-[1.5] text-grey">At the reference rate. The exact amount after spread comes before you sign.</span>
        </div>
        <div className="flex items-center gap-2 rounded-[8px] border border-hairline bg-surface p-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-lilac font-display text-[8px] font-semibold text-purple-deep">AO</span>
          <span className="flex flex-col">
            <span className="text-[9px] font-medium">Ada Okonkwo</span>
            <span className="font-mono text-[7px] text-muted">@ada · Monad</span>
          </span>
        </div>
        <span className="mt-auto flex h-8 items-center justify-center rounded-[3px] bg-purple font-mono text-[8px] uppercase tracking-[.06em] text-white">Get quote</span>
        <span className="text-center text-[7px] text-muted">Nothing moves until you approve the rate.</span>
      </div>
    </div>
  )
}
