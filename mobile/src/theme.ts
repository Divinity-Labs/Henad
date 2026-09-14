/**
 * Design tokens from `Henad v4.dc.html`, verbatim, so the phone and the canvas are one
 * product. Letter spacing in the canvas is in em; React Native takes pixels, so every
 * tracked style multiplies by its own font size.
 */
export const color = {
  ink: '#0E091C',
  canvas: '#FBFBFC',
  surface: '#FFFFFF',
  hairline: '#E7E7EB',
  hairline2: '#EFEFF3',
  border: '#D9D9DE',
  muted: '#8A8A96',
  grey: '#6B6B78',
  purple: '#6E54FF',
  lilac: '#DDD7FE',
  lilacInk: '#3B2A9E',
  dark: '#17171B',
  lavender: '#B9AEFF',
  dim: '#A7A7B3',
  chip: '#F4F4F6',
  rowTint: '#F7F6FD',
  unpricedBg: '#F1F1F4',
  watermark: '#ECECF0',
  amber: '#FFAE45',
  cyan: '#85E6FF',
  error: '#B4341F',
} as const

/**
 * One family per weight. Android ignores `fontWeight` on custom fonts, so the weight is
 * chosen by name rather than by style.
 */
export const font = {
  display: 'InstrumentSans-500',
  displayBold: 'InstrumentSans-600',
  sans: 'Inter-400',
  sansMedium: 'Inter-500',
  mono: 'RobotoMono-400',
  monoMedium: 'RobotoMono-500',
} as const

export const fontFiles = {
  'InstrumentSans-400': require('../assets/fonts/InstrumentSans-400.ttf'),
  'InstrumentSans-500': require('../assets/fonts/InstrumentSans-500.ttf'),
  'InstrumentSans-600': require('../assets/fonts/InstrumentSans-600.ttf'),
  'Inter-400': require('../assets/fonts/Inter-400.ttf'),
  'Inter-500': require('../assets/fonts/Inter-500.ttf'),
  'RobotoMono-400': require('../assets/fonts/RobotoMono-400.ttf'),
  'RobotoMono-500': require('../assets/fonts/RobotoMono-500.ttf'),
}

/** Rendered from web/public/brand; the installed build has no SVG renderer. */
export const images = {
  monadFull: require('../assets/brand/monad-full-black.png'),
  monadMark: require('../assets/brand/monad-logomark.png'),
  signinGlow: require('../assets/brand/signin-glow.png'),
}

/** Canvas em tracking to pixels. */
export const track = (size: number, em: number) => size * em
