import type { Metadata, Viewport } from 'next'
import { Inter, Instrument_Sans, Roboto_Mono } from 'next/font/google'
import { SiteJsonLd } from '@/components/JsonLd'
import { DESCRIPTION, SITE_NAME, X_HANDLE } from '@/lib/site'
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

const HOME_TITLE = 'Henad — cross-border payouts with a public FX receipt'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  // The home title carries what the product is, because "Henad" alone is a word nobody
  // searches for yet. Every other page reads "<Page> · Henad".
  title: { default: HOME_TITLE, template: '%s · Henad' },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: '/' },
  openGraph: { type: 'website', siteName: SITE_NAME, title: HOME_TITLE, description: DESCRIPTION, url: '/', locale: 'en_GB' },
  twitter: { card: 'summary_large_image', site: X_HANDLE, creator: X_HANDLE, title: HOME_TITLE, description: DESCRIPTION },
  category: 'finance',
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
      <body className="min-h-dvh bg-canvas text-ink">
        <SiteJsonLd />
        {children}
      </body>
    </html>
  )
}
