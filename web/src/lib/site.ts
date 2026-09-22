import type { Metadata } from 'next'

/**
 * The one public address Henad answers to, for anything a search engine or a crawler keeps:
 * canonical URLs, the sitemap, structured data. Previews and local dev still render their
 * own OG images from `metadataBase`, but they never tell a crawler they are the real site.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://usehenad.xyz').replace(/\/$/, '')

export const SITE_NAME = 'Henad'
export const X_HANDLE = '@henadonmonad'
export const X_URL = 'https://x.com/henadonmonad'
export const REPO_URL = 'https://github.com/Divinity-Labs/Henad'
export const ANDROID_URL = `${REPO_URL}/releases/latest`

/** What a search result says under the title. Written to be the answer, not the teaser. */
export const DESCRIPTION =
  'Send dollars, they arrive as pounds, euros, francs or yen. Cross-border payouts settled through onchain FX on Monad, with a public receipt showing the reference rate, the rate you got, and the spread in basis points.'

/** Whether this deployment is the one search engines should index. */
export function isProductionSite(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.NEXT_PUBLIC_SITE_URL !== undefined
}

/**
 * Metadata for one page: title, description, canonical URL, and matching Open Graph and X
 * cards. Next does not fill og:title from the page title, so a page that sets only `title`
 * shares the home page's card. This keeps the three in step.
 */
export function pageMeta({ title, description, path, index = true }: { title: string; description: string; path: string; index?: boolean }): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title: `${title} · ${SITE_NAME}`, description, url: path, siteName: SITE_NAME, type: 'website' },
    twitter: { card: 'summary_large_image', site: X_HANDLE, title: `${title} · ${SITE_NAME}`, description },
    ...(index ? {} : { robots: { index: false, follow: true } }),
  }
}
