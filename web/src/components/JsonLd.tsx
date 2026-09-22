import { ANDROID_URL, DESCRIPTION, REPO_URL, SITE_NAME, SITE_URL, X_URL } from '@/lib/site'

/**
 * Structured data: who publishes the site, what the site is, and what the app is.
 *
 * Search engines and answer engines read this to decide what an entity *is* before they
 * decide whether to cite it. Every claim here is one the site already makes in prose; a
 * price of zero is true because Henad charges no fee.
 */
const graph = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#org`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/icon.svg`,
      sameAs: [X_URL, REPO_URL],
      parentOrganization: { '@type': 'Organization', name: 'Divinity Labs', url: 'https://github.com/Divinity-Labs' },
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#site`,
      name: SITE_NAME,
      url: SITE_URL,
      description: DESCRIPTION,
      publisher: { '@id': `${SITE_URL}/#org` },
      inLanguage: 'en',
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#app`,
      name: SITE_NAME,
      url: SITE_URL,
      description: DESCRIPTION,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web, Android',
      downloadUrl: ANDROID_URL,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      publisher: { '@id': `${SITE_URL}/#org` },
    },
  ],
}

export function SiteJsonLd() {
  return <JsonLd data={graph} />
}

/** One JSON-LD block. `<` is escaped so no string in the data can close the script tag. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\u003c') }} />
}
