/** The web app's design tokens, verbatim, so the two clients are visibly one product. */
export const color = {
  ink: '#0e091c',
  canvas: '#fbfbfc',
  surface: '#ffffff',
  hairline: '#e7e7eb',
  border: '#d9d9de',
  muted: '#8a8a96',
  grey: '#6b6b78',
  purple: '#6e54ff',
} as const

/** The receipt and every figure are monospaced; prose is not. */
export const mono = { fontFamily: 'Courier' } as const
