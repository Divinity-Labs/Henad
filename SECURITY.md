# Security policy

Henad moves real money on Monad mainnet. The contracts are deployed, unaudited, and have
no upgrade path: a bug in them cannot be patched, only worked around. Please treat a
finding here as live rather than theoretical.

## Reporting a vulnerability

**Do not open a public issue.** Use GitHub's private vulnerability reporting:

https://github.com/Divinity-Labs/Henad/security/advisories/new

That opens a private thread visible only to the maintainers. If you would rather not use
GitHub, DM [@henadonmonad](https://x.com/henadonmonad) and ask for a channel; say nothing
technical in the DM itself.

A useful report says what an attacker gains, not only what looks wrong. The most helpful
ones carry a failing test against a mainnet fork — `contracts/test/fork/` shows the shape.

Expect a first reply within 72 hours. There is no bounty programme; this is a hackathon
project by one person, and the honest answer is credit and thanks rather than money.

## What is in scope

| Area | Where |
| --- | --- |
| The contracts | `contracts/src/` — `CorridorRouter`, `RateAttestation`, `PayoutIntent`, the Chainlink and Mento adapters |
| Signing and intents | `packages/core/src/` — intent hashing, ERC-3009 authorisation, corridor maths |
| The relayer | `web/src/app/api/relay/` — anything that lets a third party spend the relayer's gas or submit an intent it was not given |
| Passkey handling | Account derivation in `web/` and `mobile/` |
| The published Android app | Anything that lets another app on the device reach Henad's account |

Deserving of particular attention, because they are the places where a mistake costs
someone else's money:

- **Rounding and decimals.** Corridors mix 6-decimal dollars with 18-decimal mento tokens.
- **The minimum-out floor.** A payout must revert rather than fill at a worse rate.
- **The owner key.** It can register and repoint corridors. `repointCorridor` is the one
  privileged call that can change where money goes; `/docs/contracts` on the site states
  the owner's powers in full, and a gap between that page and the code is itself a finding.
- **Attestation integrity.** A receipt that can be made to record a spread other than the
  one actually taken defeats the point of the product.

## What is out of scope

- Denial of service by spending your own gas, or by making the public RPC slow.
- Rate movement between quote and fill. That is what the floor is for; a fill inside your
  own floor is the system working.
- Mento's venue, Chainlink's feeds, PancakeSwap's pools and Monad itself. Report those to
  their maintainers. Report to us if Henad uses them in a way that is unsafe.
- Anything requiring the victim's passkey, device unlock, or the owner key.
- Findings from an automated scanner with no exploit path attached.

## What Henad is not

There is no custody, no float, no fiat leg and no KYC: funds move from the payer to the
recipient in one transaction. Nobody at Divinity Labs can freeze, reverse or recover a
payout, including for themselves. If a report assumes an admin who can undo a transfer,
that admin does not exist.
