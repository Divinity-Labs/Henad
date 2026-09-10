/**
 * The Henad mark — "Spread H", chosen in the brand canvas (Henad Brand.dc.html, 1b).
 *
 * The left stem is the reference rate, the right stem is the executed rate, and the
 * crossbar breaks in the middle: the gap is the spread. It is the only mark that says
 * what the product does, which is why it beat the lens and slip options.
 *
 * Two inks by design. `tone="dark"` is the variant for dark panels (white + lilac).
 * `tone="mono"` is the one-colour fallback for embossing, faxes and favicons, and takes
 * the surrounding `currentColor`.
 *
 * Brand rules this component enforces: never animated, never on a gradient or a
 * photograph, never merged with Monad's logomark.
 */
export type MarkTone = 'light' | 'dark' | 'mono'

const INK = { stem: '#0E091C', bar: '#0E091C', barAccent: '#6E54FF', stemAccent: '#6E54FF' }
const DARK = { stem: '#FFFFFF', bar: '#FFFFFF', barAccent: '#B9AEFF', stemAccent: '#B9AEFF' }

export function HenadMark({
  size = 26,
  tone = 'light',
  title = 'Henad',
  className = '',
}: {
  size?: number
  tone?: MarkTone
  /** Empty string marks it decorative when a visible wordmark sits beside it. */
  title?: string
  className?: string
}) {
  const c = tone === 'dark' ? DARK : INK
  const mono = tone === 'mono'
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      className={`block shrink-0 ${className}`}
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <rect x="18" y="10" width="14" height="80" rx="7" fill={mono ? 'currentColor' : c.stem} />
      <rect x="32" y="45" width="13" height="10" fill={mono ? 'currentColor' : c.bar} />
      <rect x="55" y="45" width="13" height="10" fill={mono ? 'currentColor' : c.barAccent} />
      <rect x="68" y="10" width="14" height="80" rx="7" fill={mono ? 'currentColor' : c.stemAccent} />
    </svg>
  )
}

/**
 * The app icon — "Slip H" (brand canvas 1c): the H on the receipt itself, a slip with a
 * torn bottom edge and the purple tear line. Chosen for icons and avatars because the
 * silhouette stays legible at 20px where the bare letter does not.
 */
export function HenadAppIcon({ size = 40, className = '' }: { size?: number; className?: string }) {
  const r = size / 40
  return (
    <div
      className={`receipt-edge relative flex items-center justify-center bg-ink ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: `${7 * r}px ${7 * r}px ${2 * r}px ${2 * r}px`,
        ['--tooth' as string]: `${2.2 * r}px`,
      }}
      aria-hidden="true"
    >
      <span
        className="font-display font-semibold leading-none text-white"
        style={{ fontSize: 25 * r, letterSpacing: '-.05em', paddingBottom: 3 * r }}
      >
        H
      </span>
      <span className="absolute bg-purple" style={{ left: 6 * r, right: 6 * r, bottom: 8 * r, height: Math.max(1, 1.5 * r) }} />
    </div>
  )
}
