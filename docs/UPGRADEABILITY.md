# Can these contracts be upgraded, and should they be

Researched 18 September 2026, against Monad mainnet (chain 143). Everything marked
**measured** was read from the chain or benchmarked with Foundry 1.8.1 under
`network = "monad"`, `hardfork = "monad:MonadTen"`. Everything else is documentation.

This exists because the deploy was paused on one question: if a bug or a broken
dependency turns up after launch, what can be changed?

---

## The short version

| | |
| --- | --- |
| Do proxies work on Monad? | Yes, unreservedly. Transparent, UUPS and beacon are all live on mainnet today. |
| What do they cost? | **+18,400 gas on every call** (beacon: +28,900), about 3.7× the Ethereum overhead. |
| What do they cost the product? | After ~9.5 days, nobody can tell which code produced an old receipt without a paid archive node or an indexer. |
| Do we hold state a proxy would preserve? | **No.** No balances, no accounts, no allowances between payouts. |

---

## 1. Monad runs the upgrade primitives exactly as Ethereum does

**Measured.** A probe contract run through `eth_call` on chain 143 confirmed `CREATE2`
address derivation matching `keccak256(0xff ‖ deployer ‖ salt ‖ initcodehash)`,
`EXTCODEHASH` with EIP-1052 semantics, `DELEGATECALL`, `STATICCALL`, transient storage
(EIP-1153) and `MCOPY`. The canonical CREATE2 singletons are all present at their
Ethereum addresses, including `0x4e59b448…0B4956C` and CreateX.

**Measured.** Sampling 120 mainnet blocks turned up nine EIP-1967 proxies in live
traffic, among them:

- **Pyth's price feed** `0x2880aB155794e7179c9eE2e38200202908C17B43` — UUPS, verified on
  Monadscan with Read and Write as Proxy, `proxiableUUID()` confirming ERC-1822.
- **AUSD** `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a` — transparent proxy, admin
  `0xB8Fcc66d613e5f54Ee6a425DdBf4A2fDBE4DEdEe`. The asset every Henad corridor starts
  from is itself upgradeable, which is worth stating plainly rather than ignoring.
- A live beacon proxy, and a transparent proxy whose Monadscan page shows "multiple
  implementations" with its last upgrade block.

Monad's asynchronous execution and deferred state root change none of this: parallel
execution is serial-equivalent, so storage layout rules, `delegatecall` context and the
1967 slot behave normally.

## 2. The gas is the first cost

**Measured, two ways that agree.** Sending identical calldata to Pyth's proxy and its
implementation differs by 18,424 and 18,597 gas on two methods. A controlled OZ v5
bench under the Monad hardfork:

| pattern | Monad | overhead | same bench on Ethereum |
| --- | --- | --- | --- |
| direct call | 39,804 | — | 26,322 |
| UUPS / transparent / diamond | ~58,200 | **+18,400** | +4,900 |
| beacon proxy | 68,724 | +28,900 | +7,900 |
| registry pointer (on-chain lookup) | 68,985 | +29,200 | +8,200 |
| off-chain pointer, plain migration | 39,804 | **0** | 0 |

The arithmetic is Monad's own repricing: cold account access is 10,100 gas here against
2,600 on Ethereum, and the first read of a storage page is 8,100 against 2,100. The
EIP-1967 slot is a pseudorandom index, so it always sits alone on its page and always
pays the full 8,100. At 100 gwei that is 0.00184 MON per call: nothing in money, and
permanent.

## 3. The verification cost is the one that matters

**Measured.** The public RPC serves historical state for about **2,042,540 blocks**,
which at 400 ms blocks is **≈ 9.5 days**. Past that, `eth_getStorageAt` answers
"historical state that is not available". `eth_getLogs` is capped at 100 blocks per
request.

So with an upgradeable router, a reader holding a month-old receipt cannot establish
which implementation produced it. Not "it is hard": the default node no longer knows.
Reconstructing Pyth's own 26 Aug upgrade took a binary search against a deeper archive
endpoint, and only worked because the block was already known.

This is the direct cost to the claim in `docs/PROBLEM.md`. An upgrade cannot rewrite a
past receipt — events and storage are as immutable here as anywhere — but it removes the
reader's ability to *interpret* one. The receipt says "spread 19 bps"; what that number
means is defined by the code that wrote it.

**The fix, if we ever do go upgradeable:** record the implementation address in the
receipt itself, one extra field, about 400 gas. Chainlink already does exactly this —
a round id carries its phase, and `phaseAggregators(phase)` names the contract that
answered it, forever, with no archive node. Safe does the same with `masterCopy`.

## 4. Tooling, if we take that path

- `openzeppelin-foundry-upgrades` **v0.4.2** (5 Aug 2026); `@openzeppelin/contracts-upgradeable`
  **5.6.1**. The validator is AST and storage-layout diffing with no RPC parameter at all,
  so it is chain-agnostic and "does it support Monad" does not arise.
- It needs `ffi`, `ast`, `build_info` and `extra_output = ["storageLayout"]` in
  `foundry.toml`, none of which we set today, plus a remapping restructure so
  `@openzeppelin/contracts/` resolves inside the upgradeable package.
- **On Windows it needs `OPENZEPPELIN_BASH_PATH`** pointing at `bash.exe`, or the plugin's
  shell-out fails.
- Our contracts would need refactoring to initialisers: a proxied implementation cannot use
  constructor state or `immutable`, and `RateAttestation.router` and `CorridorRouter.attestation`
  are both immutable today.
- UUPS carries a permanent brick risk: ship an implementation with a broken
  `_authorizeUpgrade` and the proxy can never be upgraded again.
- Foundry must be pinned to 1.8.1; 1.5.1 cannot read `network = "monad"`.

## 5. Why immutable still holds here

A proxy preserves state at a fixed address. **These contracts have no state worth
preserving.** No balances, no user accounts, no standing allowances: a payout moves funds
from payer to recipient inside one transaction. Replacing the router means deploying new
contracts and repointing two apps, which is an afternoon, and the receipts already written
stay readable at the old attestation forever.

What immutability does buy is the sentence a reader can check without trusting anyone:
the owner key can register corridors and nothing else. It cannot pause, upgrade, sweep,
or edit a receipt.

### The realistic failure it does not cover

If Mento redeploys a pool or Chainlink retires a feed, that corridor stops working and
cannot be repointed, because `registerCorridor` is write-once per pair. Fixing that means
new contracts today. Allowing an existing pair to be re-registered removes this without
touching anything else, and each receipt still records the feed and venue it used.

---

## Decided, 18 September 2026

1. **Re-pointable corridors: done.** `CorridorRouter.repointCorridor` may change a registered
   pair's rate source and venue, and nothing else. The pair, its corridor id and its stored
   decimals are fixed at registration, so receipts written before and after remain the same
   corridor, and `CorridorRepointed` names the outgoing and incoming addresses so the history
   reads from logs alone. Seven tests cover it, including a repointed venue that keeps the
   payer's funds: settlement reverts and the payer keeps every unit.
2. **No fee.** No fee mechanism ships. Charging later means new contracts, which is the right
   trade while nobody has asked to pay. The receipt, not FX margin, is the business.
3. **No proxy.** These contracts hold no balances or accounts, so a proxy would preserve
   nothing that a redeploy loses, in exchange for 18,400 gas on every payout and a receipt a
   reader could no longer interpret after nine days.

The deployer `0x2601a8ad1E242EE3763183Cfe0321cC5f49D8C18` holds 19.9 MON and has never
transacted. The deploy is unblocked.
