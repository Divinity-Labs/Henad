import Link from 'next/link'

/** The Henad wordmark. Display face, 600, tight tracking. */
export function Wordmark({ size = 24, href = '/' }: { size?: number; href?: string | null }) {
  const el = (
    <span className="font-display font-semibold tracking-[-.03em] leading-none" style={{ fontSize: size }}>
      Henad
    </span>
  )
  return href ? (
    <Link href={href} aria-label="Henad home" className="inline-flex">
      {el}
    </Link>
  ) : (
    el
  )
}

/** "Built on [Monad]" lockup. `tone` white for dark panels. */
export function BuiltOnMonad({ height = 14, tone = 'black', className = '' }: { height?: number; tone?: 'black' | 'white'; className?: string }) {
  return (
    <span className={`label-md inline-flex items-center gap-2 whitespace-nowrap ${tone === 'white' ? 'text-dim' : 'text-muted'} ${className}`}>
      Built on
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/brand/monad-full-${tone}.svg`} alt="Monad" style={{ height, opacity: 0.85 }} className="block w-auto" />
    </span>
  )
}

/** Partner wordmark from /public/brand, tinted via currentColor. */
export function PartnerMark({ name, height = 18 }: { name: 'agora' | 'chainlink' | 'mento' | 'nansen' | 'privy' | 'monad-full-black' | 'monad-logomark'; height?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/brand/${name}.svg`} alt={name.replace(/-.*/, '')} style={{ height, opacity: 0.8 }} className="block w-auto self-start" />
}
