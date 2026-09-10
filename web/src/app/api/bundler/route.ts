import { appChainId } from '@/lib/chain'
import { RateLimiter, clientIp, prepareBundlerRequest } from '@/lib/settle/relay'

/**
 * JSON-RPC proxy in front of Pimlico for the EIP-7702 path (facts §14.4).
 * The API key stays on the server; only the allow-listed bundler and
 * paymaster methods pass, and every paymaster call carries our sponsorship
 * policy id. Neither the key nor the upstream URL is ever logged.
 */

/** A settlement makes a handful of calls plus up to 90 receipt polls. */
const limiter = new RateLimiter(240, 60_000)

function rpcError(id: number | string | null, code: number, message: string, status: number): Response {
  return Response.json({ jsonrpc: '2.0', id, error: { code, message } }, { status })
}

export async function POST(request: Request): Promise<Response> {
  if (!limiter.allow(clientIp(request.headers))) {
    return rpcError(null, -32029, 'Too many bundler requests from this address; try again in a minute.', 429)
  }
  const apiKey = process.env.PIMLICO_API_KEY?.trim()
  if (!apiKey) {
    return rpcError(null, -32000, 'Sponsored settlement is not configured on this deployment (PIMLICO_API_KEY is unset).', 503)
  }
  const policyId = process.env.PIMLICO_SPONSORSHIP_POLICY_ID?.trim() || undefined

  const body: unknown = await request.json().catch(() => null)
  const prepared = prepareBundlerRequest(body, policyId)
  if (!prepared.ok) {
    return rpcError(prepared.id, prepared.status === 403 ? -32601 : -32600, prepared.error, prepared.status)
  }

  const upstream = `https://api.pimlico.io/v2/${appChainId()}/rpc?apikey=${encodeURIComponent(apiKey)}`
  let res: Response
  try {
    res = await fetch(upstream, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(prepared.payload),
      cache: 'no-store',
    })
  } catch {
    return rpcError(null, -32603, 'The bundler did not answer.', 502)
  }

  return new Response(await res.text(), {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  })
}
