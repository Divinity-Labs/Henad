import type { Metadata, Viewport } from 'next'
import { Inter, Instrument_Sans, Roboto_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-inter', display: 'swap' })
const instrument = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-instrument',
  display: 'swap',
})
const mono = Roboto_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-roboto-mono', display: 'swap' })

/** Canonical host for absolute OG/canonical URLs. Vercel supplies the deploy URL. */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined) ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'Henad', template: '%s · Henad' },
  description:
    'Send money abroad. Keep proof of the rate. Cross-border payouts settled through onchain FX on Monad, with the reference rate, the executed rate, and the exact spread on every payment.',
  applicationName: 'Henad',
  manifest: '/manifest.webmanifest',
  // Icons come from src/app/icon.svg and apple-icon.svg (the file-based convention).
  // Never Monad's logomark: it is their trademark, and Henad has its own mark.
}

export const viewport: Viewport = {
  themeColor: '#fbfbfc',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${instrument.variable} ${mono.variable}`}>
      <body className="min-h-dvh bg-canvas text-ink">{children}</body>
    </html>
  )
}
