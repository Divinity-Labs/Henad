# Your list

Things only you can do, and decisions only you can make. Claude Code keeps this file
current: items get ticked, added and re-ordered as work lands. Everything here is
blocked on a human — an account, a card, a domain, a device, or a judgement call.

**Submissions close 14 Oct 2026, 03:59 UTC.** The week-4 gate (one real mainnet payout)
is 25 Sep – 1 Oct. Last updated 11 Sep 2026, with sign-up URLs confirmed against each service.

---

## Blocking, soonest first

### 1. henad.xyz — needed before 25 Sep
Mera passkeys bind permanently to the domain they were created under. A passkey made on
a Vercel URL can never control a mainnet account on henad.xyz. So the domain has to
exist before the first mainnet user, and the code already refuses to build a mainnet
client under any other rpId. If it is not in hand by 25 Sep, the mainnet demo happens on
the Vercel domain and the receipt permalink lives there permanently.

### 2. Test the Mera passkey ceremony on a real device
**The highest-risk untested thing in the project.** The account layer for the entire
product has never actually run. The code typechecks and builds, but no passkey has been
created, no key derived, no signature produced. The Agora bounty explicitly requires
passkey onboarding in the demo, so a problem here is a problem with the main prize.

Needs a passkey-capable device: Android with Google Password Manager, or iOS 18+, or
desktop Chrome with a synced Google profile. It will not work on a desktop Chrome local
profile, Bitwarden or Dashlane — those lack the PRF extension the derivation depends on.

Run `pnpm dev` in `web/`, open `/send`, press "Continue with passkey", and tell me what
happens. Then clear the site data and press "I already have a passkey" — the account
must come back from the passkey alone.

### 3. Pimlico — the key and the policy are two different pages
You created the account. Two things remain, and they live in separate places:

- **API key** — https://dashboard.pimlico.io/apikeys → Create API key. Put it in
  `web/.env.local` as `PIMLICO_API_KEY`. There is a shortcut that writes it for you:
  `pnpm dlx @pimlico/cli@latest`.
- **Sponsorship policy** — https://dashboard.pimlico.io/sponsorship-policies → Create
  Policy. Paymaster calls are rejected without one. The id looks like
  `sp_amused_gladiator`.

Two things to know. The free tier is **testnets only**; mainnet sponsorship needs a card
on file, billed at gas plus ten percent with a $1,000 monthly threshold. And
`PIMLICO_SPONSORSHIP_POLICY_ID` is our own variable name, not theirs — the wire field is
`sponsorshipPolicyId`, so do not go hunting for our name in their docs.

Policies have no calldata filter, so the policy webhook is the only thing stopping the
key from sponsoring arbitrary transactions.

### 4. Etherscan API key — needed at deploy time
Register at https://etherscan.io/register, then create the key at
https://etherscan.io/myapikey. **One key covers Monad**: Etherscan's V2 API lists chain
143 pointing at monadscan.com, and 10143 for testnet. Free tier is 3 calls a second and
100,000 a day across all chains. No card.

Goes in `.env` as `ETHERSCAN_API_KEY`, the name forge reads by default. I confirmed our
forge 1.8.1 resolves chain 143 on its own, so no extra flags are needed. Without the key
the contracts deploy but stay unverified, which a judge will notice.

### 5. Testnet gas — 50 MON a day
https://faucet.monad.xyz — paste the deployer address. Up to **50 testnet MON per 24
hours**, which is plenty. No GitHub account needed; connecting Discord and X qualifies
you for larger drips. The page sits behind a browser challenge, so use a real browser
rather than a script.

Ignore the third-party claims that you need mainnet history to qualify. That appears
nowhere in Monad's own faucet page or docs.

### 6. Testnet AUSD — get this early, the faucet is running low
Permissionless, no sign-up, one transaction:

```
cast send 0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C   "requestFunds(address)" <yourAddress>   --rpc-url https://testnet-rpc.monad.xyz   --private-key $PRIVATE_KEY
```

It sends **10,000 AUSD** per call. I traced the contract: it holds about 700,000 AUSD,
so roughly seventy claims remain and nobody is refilling it. That is the reason to do
this early rather than in week four. It also reads your balance before transferring, so
a second call from an address that already holds 10,000 will probably revert.

### 7. Mainnet MON for the real payout
The week-4 gate is one real settlement. That needs mainnet MON in the deployer for the
deploy, and a small amount of real AUSD to send. The payout itself can be trivial.

---

## Not blocking yet, but dated

### 8. Envio API token — now mandatory, not optional
https://envio.dev/app/api-tokens (their API error message points at
https://app.envio.dev/api-tokens if that one does not load). Goes in `.env` as
`ENVIO_API_TOKEN`.

This changed since the plan was written. Querying HyperSync without a token now returns
401 — I confirmed it against Monad's endpoint. Tokens became mandatory in November 2025.
Needed for the `/rates` indexer and the $1,000 Envio bounty. Not on the critical path
until week 5, but free and quick.

### 9. Register the project on hackathon.monad.xyz
Pick the main track — **02 Consumer Products & Payments** — since you must choose one to
be eligible for any bounty. Also still behind the login and unread: the official rules,
the judging rubric, the team-size cap, and the demo-video length. Those change what gets
built in week 6.

### 10. Re-run the verification and restamp before submitting
The naira panel says "Read on-chain 10 Sep 2026". Judges read it in late October. The
date is a single exported constant, so it is one edit once I re-run the reads. Ask me
to do this in the last week.

---

## Decisions I need from you

### 11. Which optional bounties to chase in week 5
Only if the mainnet payout is done. My read on each:

- **Aurora Intents, $5,000.** Fits honestly as "fund your payout from any chain". Scope
  to Intents Deposits; their execute-on-arrival product is early-access only.
- **Chainlink CRE, $3,000.** Reading a feed does not qualify; it wants a workflow. The
  only honest fit is a workflow posting an independent mid-market rate as a second named
  reference, so the receipt shows spread against two sources. Two to three days.
- **Mera "One Passkey, Many Keys", $2,500.** A passkey-encrypted address book and private
  receipt memos. Small, and it also solves the stateless test.

### 12. The MRC draft
It has to be written and posted to forum.monad.xyz before it can be cited. The forum
thread must exist first, because the standard's `discussions-to` field cannot point at a
GitHub PR. Say when you want me to draft it.

---

## Done

- ~~Foundry upgraded to 1.8.1~~ — done 10 Sep, both Windows and WSL.
- ~~Pimlico account~~ — created 10 Sep. Key and policy still outstanding, see item 3.
- ~~Corridor decision~~ — option C: ship USD to GBP/EUR/CHF/JPY, design for the naira,
  never ship a fake one.
- ~~Gas decision~~ — EIP-7702 with a Pimlico paymaster, ERC-3009 relayer as fallback.
- ~~The unpriced-corridor panel~~ — rebuilt 11 Sep from verified on-chain evidence.
- ~~Brand mark~~ — the Spread H is in the nav, footer, receipts and the favicon.
- ~~The rand's tier~~ — dropped to Unpriced; it had no usable price on Monad.
- ~~Pyth Hermes key~~ — not needed, and not worth getting. Confirmed: their price
  endpoint returns 401 since an upgrade on 26 Aug 2026, a key means a new account at
  pythdata.app plus a move to a different base URL, and the free tier is rate-limited
  with paid plans from $500 a month. The dependency was removed instead, because
  quoting Hermes would show a price that is not on the chain we settle on.
