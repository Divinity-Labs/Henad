import type { MetadataRoute } from 'next'
import { settledReceipts } from '@/lib/receipts'
import { SITE_URL } from '@/lib/site'

/** Rebuilt at most hourly: a new receipt appears in the sitemap within the hour it settles. */
export const revalidate = 3600

const PAGES: { path: string; priority: number; changeFrequency: 'hourly' | 'daily' | 'weekly' | 'monthly' }[] = [
  { path: '/', priority: 1, changeFrequency: 'hourly' },
  { path: '/send', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/rates', priority: 0.8, changeFrequency: 'hourly' },
  { path: '/receipts', priority: 0.8, changeFrequency: 'hourly' },
  { path: '/top-up', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/earn', priority: 0.7, changeFrequency: 'daily' },
  { path: '/docs', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/docs/contracts', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/docs/mrc', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/docs/fund', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/docs/privacy', priority: 0.3, changeFrequency: 'monthly' },
  { path: '/docs/terms', priority: 0.3, changeFrequency: 'monthly' },
]

/**
 * The pages, plus every settled receipt. Receipts are the site's most specific content — a
 * real payout with its rate and spread, at a permanent address — and they are the pages
 * someone checking a payment would search for by its id.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const pages = PAGES.map((p) => ({ url: `${SITE_URL}${p.path === '/' ? '' : p.path}`, lastModified: now, changeFrequency: p.changeFrequency, priority: p.priority }))
  // settledReceipts returns [] rather than throwing when the chain cannot be read, so an
  // unreachable RPC costs the receipts, never the sitemap.
  const receipts = (await settledReceipts(1000)).filter((r) => !r.sample)
  return [
    ...pages,
    ...receipts.map((r) => ({
      url: `${SITE_URL}/receipt/${r.intentId}`,
      lastModified: new Date(r.settledAt * 1000),
      changeFrequency: 'yearly' as const,
      priority: 0.4,
    })),
  ]
}
