/**
 * Where the visitor appears to be, for the xStocks eligibility gate on /stocks.
 *
 * xStocks are not offered in the US, UK, Canada, Australia or Belgium, and third-party front ends
 * also exclude the EU/EEA (docs/STOCKS.md). Sanctioned countries are excluded too. This is a
 * first gate, not proof of anything: the buyer also confirms eligibility themselves before
 * an order.
 */
export const dynamic = 'force-dynamic'

const RESTRICTED = new Set([
  // xStocks: not offered
  'US', 'GB', 'CA', 'AU', 'BE',
  // EU/EEA
  'AT', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES', 'SE', 'IS', 'LI', 'NO',
  // Sanctioned
  'CU', 'IR', 'KP', 'SY', 'RU', 'BY',
  // US territories
  'PR', 'GU', 'VI', 'AS', 'MP', 'UM',
])

export async function GET(request: Request): Promise<Response> {
  const country = request.headers.get('x-vercel-ip-country')?.toUpperCase() ?? null
  return Response.json({ country, restricted: country !== null && RESTRICTED.has(country) }, { headers: { 'Cache-Control': 'private, no-store' } })
}
