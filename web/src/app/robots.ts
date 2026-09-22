import type { MetadataRoute } from 'next'
import { SITE_URL, isProductionSite } from '@/lib/site'

/**
 * Everything public is crawlable, including by the AI search crawlers, which are named
 * rather than left to the wildcard: an answer engine that cannot read the site cannot
 * quote it, and a product whose pitch is "check the number yourself" wants to be quoted.
 *
 * Only the API is off limits; it returns JSON for the apps, not pages for people. The
 * account page is crawlable but marks itself noindex, because a disallowed page cannot be
 * read closely enough to see that it asked not to be indexed.
 */
const AI_CRAWLERS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended']

export default function robots(): MetadataRoute.Robots {
  // A preview deployment is a copy of the site; letting it be indexed splits the real one.
  if (!isProductionSite()) return { rules: [{ userAgent: '*', disallow: '/' }] }
  const rule = { allow: '/', disallow: ['/api/'] }
  return {
    rules: [{ userAgent: '*', ...rule }, ...AI_CRAWLERS.map((userAgent) => ({ userAgent, ...rule }))],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
