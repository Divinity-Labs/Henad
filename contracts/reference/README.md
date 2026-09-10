# Reference tests from the week-2 research pass

These are NOT compiled (`.txt` suffix). They were written by the research agents
against throwaway projects and prove, on a Foundry fork of Monad mainnet:

- `HandleOps.t.sol.txt` — a real EntryPoint v0.8 `handleOps` with an EIP-7702
  payer delegated to Simple7702Account, a stub paymaster, `executeBatch([approve,
  settle])`, the `0x7702` first-use marker, and every AA2x/AA3x negative case.
- `Paths.t.sol.txt` — ERC-3009 `receiveWithAuthorization` on real AUSD and USDC,
  with plain and 7702-delegated payers, tampered intents, cancellation.
- `RateSource.t.sol.txt` — the reference-vs-relay spread band at three pinned
  blocks (pre-relay downward, pre-relay upward, post-relay).

Use them as templates for `test/fork/Settlement.t.sol`; do not copy them blindly,
their mocks and addresses belong to the probe projects.
