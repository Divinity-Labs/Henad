# Deploying the web app

Vercel project **henad** (`prj_UqclSIe5Pk7AjrS3TbMhvO7hJFwf`), linked to
`Miracle656/Henad`, production branch `main`, root directory `web`. Every push to main
deploys. Vercel detects Next.js and pnpm workspaces on its own; `@henad/core` is compiled
through `transpilePackages`, so nothing extra is needed.

Current production URL: https://henad-delta.vercel.app

---

## The domain

**usehenad.xyz**, registered 14 Sep 2026 through Truehost, sponsored by NameSilo, expiring
14 Sep 2027. Nameservers are Truehost's own (`ns1.cloudoon.com`, `ns2.cloudoon.net`,
`ns3.cloudoon.org`), so DNS is edited in the Truehost client area under **DNS Management**,
not at Vercel.

It cannot be transferred to another registrar until roughly **13 November 2026** — ICANN
locks a new registration for 60 days, and the record already carries
`server transfer prohibited`.

### Attaching it

1. Vercel → project **henad** → Settings → Domains → add `usehenad.xyz`.
2. Vercel then shows the records it wants. Use **its** values rather than the ones below if
   they differ, since Vercel sometimes issues a project-specific CNAME target.
3. Truehost → My Domains → usehenad.xyz → DNS Management, and add:

   | Type | Name | Value |
   | --- | --- | --- |
   | A | `@` | `76.76.21.21` |
   | CNAME | `www` | `cname.vercel-dns.com` |

4. Wait for propagation, up to 24 hours but usually minutes. Verify from a shell rather
   than a browser, which caches aggressively:

   ```
   curl -s "https://dns.google/resolve?name=usehenad.xyz&type=A"
   ```

5. Vercel issues the TLS certificate automatically once the records resolve.

---

## Environment variables

Set these in Vercel → Settings → Environment Variables, **Production** scope.

| Variable | Value | Why |
| --- | --- | --- |
| `NEXT_PUBLIC_MERA_RP_ID` | `usehenad.xyz` | Pins the passkey domain. See below. |
| `NEXT_PUBLIC_MERA_RP_NAME` | `Henad` | Shown in the passkey prompt. |

**Setting the rpId explicitly is a safety measure, not a convenience.** Without it,
`rpId()` falls back to `window.location.hostname`, so a passkey created on
`henad-delta.vercel.app` would bind to *that* host permanently and would not work on
usehenad.xyz. With it set, the browser refuses to create a passkey on any origin that is
not usehenad.xyz, because WebAuthn requires the rpId to be a registrable suffix of the
origin. The vercel.app URLs stop offering accounts at all, which is the behaviour we want.

### Deliberately not set yet

| Variable | When |
| --- | --- |
| `NEXT_PUBLIC_MONAD_CHAIN_ID` | At the mainnet deploy. Until then it defaults to testnet, and the corridor guard keeps `/send` unsettleable. |
| `NEXT_PUBLIC_CORRIDOR_ROUTER_ADDRESS` | At the mainnet deploy. |
| `NEXT_PUBLIC_RATE_ATTESTATION_ADDRESS` | At the mainnet deploy. |
| `NEXT_PUBLIC_DEPLOYED_AT_BLOCK` | At the mainnet deploy. |
| `PIMLICO_API_KEY` | When the sponsored path goes live, and only after a card is on the Pimlico account. |
| `PIMLICO_SPONSORSHIP_POLICY_ID` | Same. A policy is the only limit on what that key can be made to sponsor. |
| `RELAYER_PRIVATE_KEY` | Only if the ERC-3009 fallback is ever enabled in production. This key pays real gas, so it does not belong on a public deployment until it must be. |
| `NEXT_PUBLIC_LOCAL_FORK` | **Never in production.** It exists so a local fork of mainnet can use a loopback passkey domain. It cannot help a real deployment — the guard requires a loopback host too — but it has no business being set here. |
| `NEXT_PUBLIC_FIXTURES` | Never in production. Design fixtures are for local work; every real page must show only what the chain has. |

---

## What the site does today

Read-only, and honestly so. No contracts are deployed, so `deploymentAddresses()` returns
null and the send button stays disabled under its own explanation. What works:

- `/` and `/rates` — live Chainlink and Mento reads from Monad mainnet
- `/docs` — the corridor argument and the funding guide
- `/receipts` — empty, because nothing has settled
- `/send` — the passkey ceremony, the amount step, and a real quote; settlement disabled

That is the right thing to have live before the mainnet deploy. Nothing on it claims a
payout has happened.

---

## After the mainnet deploy

1. Run the deploy script against mainnet with a keystore key, not `PRIVATE_KEY`.
2. Add the four contract variables above from `contracts/deployments/143.json`.
3. Set `NEXT_PUBLIC_MONAD_CHAIN_ID=143`.
4. Redeploy, and make the first real payout.
5. Then and only then is the receipt permalink on usehenad.xyz worth putting in the film.

---

## Mobile, later

The same domain must serve two files for a native app to use these passkeys, both as JSON
with no redirect:

- `/.well-known/apple-app-site-association`
- `/.well-known/assetlinks.json`

Both need values only a human can obtain; see `docs/YOUR-LIST.md` item 8. In Next these
go in `web/public/.well-known/`, and the AASA file must be served without a `.json`
extension.
