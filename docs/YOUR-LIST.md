# Your list

Things only you can do, and decisions only you can make. Claude Code keeps this file
current: items get ticked, added and re-ordered as work lands. Everything here is
blocked on a human — an account, a card, a domain, a device, or a judgement call.

**Submissions close 14 Oct 2026, 03:59 UTC.** Last updated 21 Sep 2026.

> **The gate is passed, five days early.** Henad is live on Monad mainnet and receipt #1 is
> real: 0.40 AUSD → £0.298070 GBPm at 19 bps, block 105,952,304, from the phone.
> https://usehenad.xyz/receipt/0x9c1479f156dd1d943e417dea5dbee28cf77548df4c69774042264f146a77503c
>
> Contracts verified on Monadscan; the site and the app both read mainnet. What is left is
> money in the right places, the things only you can sign up for, and the submission itself.

### Money, as of 20 Sep
| | | |
| --- | --- | --- |
| Deployer `0x2601a8ad…8C18` | 0.4679 MON | owns the contracts; keystore, password known only to you |
| Relayer `0x5159261D…1F5c` | **0.1368 MON** | **about one payout left — top this up** |
| Your passkey account `0x2Ea1A81a…EaA6` | 0.034356 AUSD | what a demo payout spends |

Topping up the relayer is one command in Git Bash:
`~/.foundry/bin/cast send 0x5159261D57900ECADf8F380C7c43dcf0B7a11F5c --value 0.3ether --rpc-url https://rpc.monad.xyz --account henad-mainnet`

---

## Blocking, soonest first

### Now. Vercel no longer deploys the site — reconnect it to the org
The repo moved to **https://github.com/Divinity-Labs/Henad** on 21 Sep. GitHub carried the
releases, the Actions secret and the redirects across, but Vercel's git connection still
names `Miracle656/Henad`, so the push after the move produced no deployment. The site is
still up, serving the last build from before the move; it simply will not pick up new
commits until this is fixed.

Two clicks, both of which need you signed in:

1. Install the Vercel GitHub App on the Divinity-Labs org, granting it the Henad repo:
   https://github.com/apps/vercel — Configure → Divinity-Labs.
2. Vercel → project `henad` → Settings → Git → disconnect, then connect
   `Divinity-Labs/Henad`, production branch `main`, root directory `web`.

Then push anything, or hit Redeploy, and check that a deployment appears. I can verify it
from here once it does.

One thing to check while you are in that Settings page, since it has been open on the list
for a week: Environment Variables → Production has `NEXT_PUBLIC_MERA_RP_ID=usehenad.xyz`.

### 1. usehenad.xyz — live; one setting still unconfirmed
Bought 14 Sep through Truehost (NameSilo), expiring 14 Sep 2027. It serves the app on the
bare domain, and passkeys work on it from both the browser and Android.

**The one thing left:** confirm Vercel → Settings → Environment Variables has
`NEXT_PUBLIC_MERA_RP_ID=usehenad.xyz` for Production. Without it a passkey made on the
vercel.app URL would bind to that host forever.

Two things that outlive everything else here:

- **It can never be allowed to expire.** Every passkey binds to this domain permanently. If
  it lapses, every account created under it becomes unreachable, and whoever registers it
  next can mint passkeys in your name. Keep auto-renew on and a live card on it. That $11 to
  $14 a year is now a permanent cost of the product existing.
- **It cannot move registrar until about 13 November.** ICANN locks a new registration for 60
  days. If you want Cloudflare's cheaper renewal, that is the earliest date.
- The ₦3,652 Truehost charge for `henad.xyz`, which could never complete, is still
  outstanding on invoice 553722.

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

### 4. ~~Mainnet MON and real AUSD~~ — done 18–20 Sep
The deploy cost 1.11 MON of the 19.9 you sent. 18 MON became 0.4347 AUSD through
PancakeSwap, 0.3 MON funded the relayer, and 0.40 AUSD became receipt #1. Both swap routes
and their traps are written down in `docs/ONRAMP.md`.

**What is left here:** MON is $0.0243, so a $1 payout needs about 41 MON. If you want the
demo to send a more presentable figure than 40 cents, that is the only reason to add more.

### 5. ~~A mainnet deployer key that does not live in a file~~ — done 18 Sep
`henad-mainnet` in Foundry's keystore, address `0x2601a8ad1E242EE3763183Cfe0321cC5f49D8C18`,
owns the contracts. The throwaway `DEPLOYER_PRIVATE_KEY` in `.env` was never funded on
mainnet and must not be.

⚠ **Two secrets now matter and neither can be recovered:** the keystore password, and the
relayer's private key that you put in Vercel. Losing the first means nobody can ever register
a new corridor; losing the second only costs its 0.3 MON.

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

Done 14 Sep: the fingerprint was read out of the built APK and published in
`web/public/.well-known/assetlinks.json`. It works once item 5a is done and the rebuilt APK is
installed. Full steps and the
things people get wrong are in `docs/TESTING-MOBILE.md`.

**15 Sep: the phone says "RP ID cannot be validated".** Fix pushed in commit 1a35739:
- `assetlinks.json` now grants `handle_all_urls` too. This is live.
- The app now links back to the site. That half needs a new APK.

**Fixed, confirmed 17 Sep** on the phone with GitHub build run 35216856538. Continue with passkey
created the account `0x2Ea1A81aa3931C2abF6F23421d7C1493a252EaA6`, and the web shows the same
address. Still open: "I already have a passkey" failed before that passkey existed. Re-test it
after an uninstall and reinstall (TESTING-MOBILE test 2).

APKs are built like this from now on. EAS's free cloud builds are used up until 1 Oct, so
   APKs are now built on GitHub instead (`.github/workflows/android-dev-build.yml`). It uses the
   same EAS keystore and checks the certificate is still `75:D9…` before uploading. One-time setup:
   - Create an access token at expo.dev → Account settings → Access tokens, on `miracle_codes`.
   - Add it on GitHub under the repo's Settings → Secrets and variables → Actions → New repository secret, named `EXPO_TOKEN`.
   - Then: Actions tab → **Android dev build** → Run workflow. When it finishes (about 20–30 min), download `henad-dev-apk` from the run page and install it.

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

### 0. Upgradeability and the fee, before the mainnet deploy
Both are asked and answered in `docs/UPGRADEABILITY.md`, researched against Monad mainnet
on 18 Sep. Short version: proxies work here but cost 18,400 gas on every payout, and after
about 9.5 days Monad's public RPC can no longer tell a reader which implementation wrote an
old receipt, which is the claim the product rests on. These contracts hold no balances, so a
proxy preserves nothing a redeploy would lose.

Decide:
1. **Re-pointable corridors** (recommended): let the owner update a pair's feed or venue, so a
   Mento or Chainlink move does not strand a corridor. About a day with tests.
2. **A fee**: capped, shown before signing, written on the receipt, defaulting to zero — or none
   at all. It cannot be added after the deploy.
3. **A proxy anyway**: two to three days, a permanent gas cost, and a public statement about who
   holds the upgrade key.

The deployer `0x2601a8ad1E242EE3763183Cfe0321cC5f49D8C18` is funded with 19.9 MON and has never
transacted. Nothing ships to mainnet until this is settled.


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

- ~~Bare domain primary in Vercel~~ — done 14 Sep. `usehenad.xyz` serves directly and `www` redirects
  to it. Google's asset links verifier now returns the `get_login_creds` statement for
  `xyz.usehenad.app` with the APK's fingerprint, so the Android app may use usehenad.xyz passkeys.
- ~~GitHub pushes~~ — fixed 14 Sep. The active `gh` account had been `Salmatcre8`, which cannot push
  here. Switched back to `Miracle656`. Commit authorship was never affected: git identity is set
  globally to Miracle656 and every commit carries it.
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
