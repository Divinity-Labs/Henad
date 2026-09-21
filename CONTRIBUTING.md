# Contributing

Henad is a small codebase with one maintainer, so the useful contribution is usually a
narrow one: a failing test, a corrected number, a fix for something that breaks on a
device I do not own. Large refactors are unlikely to be merged.

Everything here runs against **Monad mainnet**, including the tests, which fork it. There
is no meaningful testnet: Monad testnet has no Mento pools and no Chainlink FX feeds, so a
payout cannot be simulated there at all.

## Getting set up

```bash
pnpm install                     # pnpm 10.20, Node 22 or newer
cp .env.example .env             # fill in MONAD_MAINNET_RPC_URL at minimum
curl -L https://foundry.paradigm.xyz | bash && foundryup
```

`.env` is gitignored and must stay that way — the repository is public. Nothing in it is
needed to read the code; `MONAD_MAINNET_RPC_URL` is needed to run the fork tests.

### The web app

```bash
pnpm dev:web                     # http://localhost:3000
```

It reads mainnet by default. Passkeys bind to the host they are created on, so an account
made on `localhost` is a different account from one made on `usehenad.xyz` — that is
WebAuthn working, not a bug.

### The phone app

```bash
cd mobile && pnpm start          # Expo dev client, needs a development build installed
```

`docs/TESTING-MOBILE.md` covers the parts that are specific to Android: the development
build, Digital Asset Links, and why passkeys fail if the app-side `asset_statements` are
missing.

### A local fork, when you do not want to spend real money

```bash
./scripts/local-fork.sh
```

This forks mainnet with Anvil, funds test payers, and keeps the chain's clock moving so
Mento's oracle does not go stale and start reverting with `NoRecentRate()`. It rewrites
`web/.env.local` to point at the fork; `git checkout web/.env.local` when you are done.

## Tests

```bash
pnpm test                        # TypeScript: core and web, via vitest
cd contracts && forge test       # Solidity unit tests, no network needed
cd contracts && forge test --match-path 'test/fork/*'   # needs MONAD_MAINNET_RPC_URL
```

A change to `contracts/src/` without a test is not finished. The fork tests are the ones
that catch real breakage, because they run against the actual Mento pools and Chainlink
feeds rather than mocks.

`pnpm typecheck` and `pnpm lint` run across every workspace and both must be clean.

## Style

The code is written to be read by someone who is deciding whether to trust it with their
money. Two habits follow from that:

- **Comments say why, not what.** A comment that restates the line above it is noise; a
  comment explaining why the floor is read before the prank, or why a notification needs
  an Android channel, saves the next person an afternoon.
- **Numbers in prose are checked.** Anything in a doc or a UI string that states a rate, a
  balance, an address or a gas cost should have been read from the chain, not remembered.

Commit messages follow what is already in `git log`: a lowercase `type(scope): summary`
line in the imperative, then a blank line, then a paragraph on why the change exists and
what it cost. `feat`, `fix`, `chore`, `docs`, `test`, `ci`.

## Pull requests

Branch off `main`, keep the diff to one subject, and say in the description what you ran
to convince yourself it works. If it touches money — the router, the adapters, the
relayer, the intent format — say what you think the worst case is if you are wrong.

By contributing you agree that your work is licensed under the MIT License in `LICENSE`.

## Reporting a bug that has a victim

Do not open a public issue for anything that could drain an account or misdirect a payout.
`SECURITY.md` has the private route.
