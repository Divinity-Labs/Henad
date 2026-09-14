# Your list

Things only you can do, and decisions only you can make. Claude Code keeps this file
current: items get ticked, added and re-ordered as work lands. Everything here is
blocked on a human — an account, a card, a domain, a device, or a judgement call.

**Submissions close 14 Oct 2026, 03:59 UTC.** The week-4 gate (one real mainnet payout)
is 25 Sep – 1 Oct. Last updated 11 Sep 2026, after verifying every key you added by
actually calling the service with it.

---

## Blocking, soonest first

### 1. usehenad.xyz — bought; two settings left, then it is done
**Bought 14 Sep**, through Truehost, sponsored by NameSilo, expiring 14 Sep 2027.
`henad.xyz` could not be had: it has belonged to a third party since 11 June 2026 and is
parked on the Afternic aftermarket at $699. The ₦3,652 Truehost order for it was charged
and could never complete; that refund is still outstanding on invoice 553722.

The web app is deployed and public at https://henad-delta.vercel.app, reading live rates
from Monad mainnet. What is left is two things in two dashboards, both in `docs/DEPLOY.md`:

- **Vercel → henad → Settings → Domains → add `usehenad.xyz`**, then put the records it
  shows into Truehost's DNS Management. Truehost holds the nameservers, so DNS is edited
  there, not at Vercel.
- **Vercel → Settings → Environment Variables**, Production: set
  `NEXT_PUBLIC_MERA_RP_ID=usehenad.xyz` and `NEXT_PUBLIC_MERA_RP_NAME=Henad`. This is a
  safety setting rather than a convenience: without it a passkey created on the
  vercel.app URL would bind to that host forever. With it, the browser refuses to make a
  passkey anywhere but usehenad.xyz.

Two things that outlive all of this:

- **It can never be allowed to expire.** Every passkey binds to this domain permanently.
  If it lapses, every account created under it becomes unreachable, and whoever registers
  it next can mint passkeys in your name. Turn auto-renew on and keep a live card on it.
  Renewal is $11 to $14 a year and is now a permanent cost of the product existing.
- **It cannot move registrar until about 13 November.** ICANN locks a new registration for
  60 days and the record already says `server transfer prohibited`. If you want Cloudflare's
  cheaper renewal, that is the earliest date.

### 2. Finish the passkey test — creation works, restore is untested
**Half of this is now proven.** On 11 Sep, on desktop Chrome with Google Password
Manager under `rpId=localhost`, the ceremony completed: a passkey was created, the PRF
output derived a key, and the account chip rendered `0xC8C7…2Db6`. The account layer of
the product runs. That was the single highest-risk unknown and it is closed.

**What is still untested is the half that matters for a lost device.** Clear the site
data for localhost, reload `/send`, and press "I already have a passkey". The same
address must come back from the passkey alone, with nothing in browser storage to help
it. If it does not, the product has no recovery story and the Agora bounty's passkey
requirement is not really met.

Note the derivation is deterministic per passkey, so a *second* passkey gives a
different address. Restore must reuse the first one.

### 3. Pimlico — put money on the account before 25 Sep
Your key works. I called the API with it, and the free plan really is free, so your
dashboard is not lying to you. What it will not do is mainnet.

- **Testnet, today, free.** `pm_getPaymasterData` on chain 10143 returns a real signed
  sponsorship from your key, with no policy and no card. Everything we build and demo
  on testnet is covered.
- **Mainnet, chain 143, same call, same key.** It answers: `Insufficient Pimlico balance
  for sponsorship, please top up - Balance required: 0.000005 USD, Balance available:
  0 USD`. The gate is your account balance at the moment their paymaster signs, not a
  block on the key.

Their marketing pricing page lists only Pay-as-you-go and Enterprise, which is why I
doubted the Free plan existed. It does, on the docs pricing page: 1,000,000 credits a
month, 500 requests a minute, all testnets, **no mainnets**, no card. Pay-as-you-go is
$0 a month with a card on file, 10,000,000 credits, and mainnet gas billed at cost plus
ten percent with a $1,000 monthly threshold.

**What to do:** add a card at https://dashboard.pimlico.io/billing before the week-4
payout. One payout costs about **0.16 MON** of gas plus their ten percent, so the real
bill for the demo is a few payouts, not a subscription.

A sponsorship policy turned out **not** to be required — the free-plan key signs without
one. Create one anyway at https://dashboard.pimlico.io/sponsorship-policies before
mainnet, because a policy is the only limit on what that key can be made to sponsor.
Put the id in `.env` as `PIMLICO_SPONSORSHIP_POLICY_ID`, which is our variable name; the
wire field is `sponsorshipPolicyId`.

### 4. Mainnet MON, and a little real AUSD
The week-4 gate is one real settlement. The deployer `0x6639edb9…4776` holds **0 MON on
mainnet**. It needs enough for the deploy — I measured the dry run at 6,190,540 gas,
about **1.25 MON** at today's 102 gwei — plus a throwaway probe deploy first at 0.031
MON, plus gas to register the corridors. Call it 2 MON to be comfortable.

Then a small amount of real AUSD to actually send. The payout itself can be a dollar.

### 5. A mainnet deployer key that does not live in a file
`DEPLOYER_PRIVATE_KEY` in `.env` is a throwaway. It is fine for testnet, where it is
already funded and working. Do not fund it on mainnet. Before the real deploy, import a
fresh key into Foundry's keystore:

```
cast wallet import henad-mainnet --interactive
```

Then deploy with `--account henad-mainnet --sender <address>`. One caveat came out of
the contracts review: `script/Deploy.s.sol` reads `PRIVATE_KEY` from the environment and
otherwise falls back to a placeholder address, so `--account` on its own would broadcast
from the wrong sender. Tell me when the keystore exists and I will fix the script to
match it.

---

### 5a. GitHub pushes from this repo need the Miracle656 account
Found 14 Sep. Two GitHub accounts are signed in on this machine, and the **active** one is
`Salmatcre8`, which has read-only access to `Miracle656/Henad` (`push: false`). Every push
from here now fails with 403, and Vercel only deploys what reaches `main`.

**One commit is waiting locally, unpushed:** `6d2ffa3`, which publishes
`web/public/.well-known/assetlinks.json`. Until it deploys, the Android app cannot use
usehenad.xyz passkeys, so the device test in item 8 is blocked on it.

Left alone on purpose while you are using `Salmatcre8` in another terminal. When you are
free, either of these works; the first changes it for the whole machine, the second only
for the one command:

```
gh auth switch --user Miracle656
```

or tell me and I will push this repo with the right account without touching the active one.

---

## Not blocking yet, but dated

### 6. Register the project on hackathon.monad.xyz
Pick the main track — **02 Consumer Products & Payments** — since you must choose one to
be eligible for any bounty. Also still behind the login and unread: the official rules,
the judging rubric, the team-size cap, and the demo-video length. Those change what gets
built in week 6.

### 7. Re-run the verification and restamp before submitting
The naira panel says "Read on-chain 10 Sep 2026". Judges read it in late October. The
date is a single exported constant, so it is one edit once I re-run the reads. Ask me
to do this in the last week.

---

### 8. Mobile signing identity — one command gets the Android half
The mobile app is built and bundles; it cannot run until the domain vouches for it.

**Android is entirely unblocked and needs no Apple account.** From `mobile/`:

```
pnpm build:android     # EAS cloud build, ~10-20 min, generates the keystore
pnpm credentials       # read the SHA-256 fingerprint it generated
```

Then I write that fingerprint into `web/public/.well-known/assetlinks.json`, push, and the
passkey works on any Android 9+ phone with Google Password Manager. Full steps and the
things people get wrong are in `docs/TESTING-MOBILE.md`.

⚠ The keystore EAS generates on that first build becomes part of the app's identity. The
fingerprint comes from it, and replacing it later invalidates the association file and
every passkey bound through it. Do not let EAS regenerate it casually.

**iOS needs money and a Mac.** A paid Apple Developer account for the Team ID and the
Associated Domains capability, a physical device on iOS 18 or later, and `expo prebuild`
run somewhere with Xcode. Worth deferring until Android proves the account model.

Note: Expo Go cannot run this app at all. The passkey library is native code with no config
plugin, so it crashes on import. That is not a setting.

---

## Decisions I need from you

### 9. Which optional bounties to chase in week 5
Only if the mainnet payout is done. My read on each:

- **Aurora Intents, $5,000.** Fits honestly as "fund your payout from any chain". Scope
  to Intents Deposits; their execute-on-arrival product is early-access only.
- **Chainlink CRE, $3,000.** Reading a feed does not qualify; it wants a workflow. The
  only honest fit is a workflow posting an independent mid-market rate as a second named
  reference, so the receipt shows spread against two sources. Two to three days.
- **Mera "One Passkey, Many Keys", $2,500.** A passkey-encrypted address book and private
  receipt memos. Small, and it also solves the stateless test.

### 10. The MRC draft
It has to be written and posted to forum.monad.xyz before it can be cited. The forum
thread must exist first, because the standard's `discussions-to` field cannot point at a
GitHub PR. Say when you want me to draft it.

---

## Done

Everything in this section was verified on 11 Sep 2026 by calling the service, not by
looking at the config file.

- ~~Pimlico API key~~ — works, and signed a real testnet sponsorship. What is left is
  money rather than setup; see item 3.
- ~~Etherscan API key~~ — works on Monad. Etherscan's own chain list confirms 143 is
  Monad Mainnet at monadscan.com and 10143 is the testnet, and a live query on 143
  returned `status 1`. Contract verification will work at deploy time.
- ~~Envio API token~~ — works. The same HyperSync query returns 200 with your token and
  401 without it, against Monad at height 103,744,618. Both `ENVIO_API_TOKEN_HS` and
  `ENVIO_API_TOKEN_HR` are set.
- ~~Testnet gas~~ — the deployer holds **24.53 testnet MON**, plenty.
- ~~Testnet AUSD~~ — **I claimed it for you** rather than leave it to rot: 10,000 AUSD,
  tx `0x17bd25db…a64e9`, block 61464510. The faucet had 700,000 AUSD left and nobody is
  refilling it, so this is one fewer thing to lose. About 69 claims remain for everyone.
- ~~Testnet deployer key~~ — funded and working at `0x6639edb9…4776`.
- ~~Foundry upgraded to 1.8.1~~ — done 10 Sep, both Windows and WSL.
- ~~Corridor decision~~ — option C: ship USD to GBP/EUR/CHF/JPY, design for the naira,
  never ship a fake one.
- ~~Gas decision~~ — EIP-7702 with a Pimlico paymaster, ERC-3009 relayer as fallback.
- ~~The unpriced-corridor panel~~ — rebuilt 11 Sep from verified on-chain evidence.
- ~~Brand mark~~ — the Spread H is in the nav, footer, receipts and the favicon.
- ~~The rand's tier~~ — dropped to Unpriced; it had no usable price on Monad.
- ~~Pyth Hermes key~~ — not needed, and not worth getting. Their price endpoint returns
  401 since an upgrade on 26 Aug 2026, a key means a new account at pythdata.app plus a
  different base URL, and paid plans start at $500 a month. The dependency was removed
  instead, because quoting Hermes would show a price that is not on the chain we settle
  on.
