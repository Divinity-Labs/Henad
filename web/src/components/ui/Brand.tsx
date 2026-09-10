import Link from 'next/link'
import { HenadMark, type MarkTone } from './HenadMark'

/**
 * The Henad lockup: the Spread H mark beside the wordmark.
 *
 * Brand rules (Henad Brand.dc.html): Instrument Sans 600, tracking −0.035em, sentence
 * case and never all caps, never letterspaced or outlined. Clear space around the
 * lockup is the cap height of the wordmark. Below a 132px lockup width, use the mark
 * alone — pass `markOnly`.
 */
export function Wordmark({
  size = 24,
  href = '/',
  tone = 'light',
  markOnly = false,
  className = '',
}: {
  size?: number
  href?: string | null
  tone?: MarkTone
  markOnly?: boolean
  className?: string
}) {
  const gap = Math.round(size * 0.34)
  const el = (
    <span className={`inline-flex items-center ${className}`} style={{ gap }}>
      <HenadMark size={size + 2} tone={tone} title={markOnly ? 'Henad' : ''} />
      {!markOnly && (
        <span
          className="font-display font-semibold leading-none"
          style={{ fontSize: size, letterSpacing: '-.035em', color: tone === 'dark' ? '#FFFFFF' : undefined }}
        >
          Henad
        </span>
      )}
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

/**
 * "Built on [Monad]". Monad's logo appears whole, in the attribution slot, at its own
 * scale, and is never merged into the H.
 */
export function BuiltOnMonad({ height = 14, tone = 'black', className = '' }: { height?: number; tone?: 'black' | 'white'; className?: string }) {
  return (
    <span className={`label-md inline-flex items-center gap-2 whitespace-nowrap ${tone === 'white' ? 'text-dim' : 'text-muted'} ${className}`}>
      Built on
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/brand/monad-full-${tone}.svg`} alt="Monad" style={{ height, opacity: 0.85 }} className="block w-auto" />
    </span>
  )
}

/** Partner wordmark from /public/brand. */
export function PartnerMark({
  name,
  height = 18,
}: {
  name: 'agora' | 'chainlink' | 'mento' | 'nansen' | 'privy' | 'monad-full-black' | 'monad-logomark'
  height?: number
}) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/brand/${name}.svg`} alt={name.replace(/-.*/, '')} style={{ height, opacity: 0.8 }} className="block w-auto self-start" />
}
