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

export const metadata: Metadata = {
  title: { default: 'Henad', template: '%s · Henad' },
  description:
    'Send money abroad. Keep proof of the rate. Cross-border payouts settled through onchain FX on Monad, with the reference rate, the executed rate, and the exact spread on every payment.',
  applicationName: 'Henad',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/brand/monad-logomark.svg' },
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
