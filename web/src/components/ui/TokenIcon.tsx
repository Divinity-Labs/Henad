/**
 * A token's icon from /public/tokens, or a lettered disc for tokens without artwork.
 * AUSD is the Agora bug in Agora gold; GBPm, EURm, CHFm, JPYm and NGNm are Mento's own icons.
 */
const ARTWORK = new Set(['AUSD', 'GBPm', 'EURm', 'CHFm', 'JPYm', 'NGNm'])

export function TokenIcon({ symbol, size = 24, className = '' }: { symbol: string; size?: number; className?: string }) {
  if (ARTWORK.has(symbol)) {
    // eslint-disable-next-line @next/next/no-img-element -- a 1-2 KB static SVG gains nothing from next/image
    return <img src={`/tokens/${symbol}.svg`} alt="" width={size} height={size} className={`flex-none object-contain ${className}`} />
  }
  return (
    <span
      aria-hidden
      className={`inline-flex flex-none items-center justify-center rounded-full bg-hairline font-mono text-ink ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {symbol.charAt(0)}
    </span>
  )
}
