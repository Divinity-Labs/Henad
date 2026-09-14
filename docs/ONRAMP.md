# Getting MON and AUSD onto Monad mainnet, from Nigeria

Researched 14 September 2026. Prices and listings move; re-check before acting.

**Target address:** the mainnet deployer. Not the testnet throwaway in `.env` — see
`docs/YOUR-LIST.md` item 5 about using a keystore key for mainnet.

**How much you need.** Less than it sounds.

| For | MON | At $0.0232 |
| --- | --- | --- |
| Throwaway probe deploy | 0.015 | $0.0004 |
| Full deploy, five corridors | 0.63 | $0.015 |
| Five payouts | 0.80 | $0.019 |
| ~$2 of AUSD to actually send | ~86 | $2.00 |
| Exchange withdrawal fee | 1 to 25 | up to $0.58 |

**Buy about $10 of MON.** That covers everything with room to spare, and most of it comes
back as the AUSD you send.

---

## Before anything: two traps

**Binance is useless here.** It lists a MON perpetual, not spot, and has had no naira rail
since March 2024. Starting there wastes an afternoon.

**Check the withdrawal fee before you buy, not after.** It is charged in MON and varies
wildly between venues: 1 MON at Backpack, 10 at Kraken, 25 at KuCoin, and a startling 429
MON *minimum* at Bitget. On a $10 purchase a bad venue eats most of it. The fee is shown
in the withdraw window; read it first.

---

## Route 1 — Gate. Fewest hops, no P2P counterparty.

Recommended unless their KYC refuses you.

1. **Register at gate.com** and complete KYC with your NIN or international passport.
2. **Deposit naira** by bank transfer. Gate has run NGN deposits through Flutterwave since
   April 2026, so this is a normal transfer to a licensed processor, not a P2P trade with
   a stranger.
3. **Buy MON** on the MON/USDT market. About $10 worth.
4. **Withdraw to Monad.** In the withdraw window choose network **`MON`**. Paste the
   deployer address. Minimum withdrawal is 0.433 MON, the lowest of any venue found.
   **Read the fee on this screen before confirming.**
5. **Swap a little MON for AUSD** at https://monorail.xyz, connected to Monad mainnet.
   A live quote at the time of research: 100 MON produced 2.3248 AUSD at 0.015% price
   impact and about $0.002 of gas.

Gate is not on the NCC's ISP block list. Its MON withdrawal fee is not published anywhere,
which is the one unknown in this route.

---

## Route 2 — Busha, then Base, then Relay. The naira leg stays with a licensed Nigerian firm.

Use this if Gate's KYC is a problem, or if you would rather the naira never leave a
Nigerian-regulated entity.

1. **Busha** (busha.co), which holds an SEC provisional licence. Free naira deposit, 0.5%
   on the trade.
2. **Buy USDC and withdraw it on the Base network.** Busha supports Base. It has no Monad
   network at all, which is why this route needs a bridge.
3. **Bridge at https://relay.link/bridge**, Base USDC to native MON. About 1.56%, and it
   settles in roughly a second.
4. **Swap for AUSD** on Monorail, as above.

More hops, but the naira side touches only a licensed Nigerian entity.

---

## Route 3 — Bybit P2P. Only if the first two fail.

Deepest naira liquidity by far, around 338 live ads at roughly ₦1,365 per USDT, MON listed,
and Monad withdrawals confirmed open since November 2025.

The reason it is third: P2P carries real counterparty risk in Nigeria. If a trading partner
funds your account with money that is later reported, your bank account can be frozen for
72 hours or longer under an EFCC order. That exposure is wildly disproportionate to a $10
purchase. Use it only if nothing else works.

---

## AUSD always ends on-chain

No exchange reachable from Nigeria lists Agora's AUSD. Kraken has the only MON/AUSD pair
found anywhere and has no Nigerian fiat rail, is ISP-blocked, and had its Monad funding
gateway down twice in the fortnight before this was written.

So whichever route you take, the last hop is the same: swap MON for AUSD on Monad itself,
at Monorail. That is fine. It costs fractions of a cent and it is one transaction.

---

## Verifying it arrived

Do not trust the exchange's "completed". Read the chain:

```
cast balance <address> --rpc-url https://rpc.monad.xyz --ether
cast call 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a "balanceOf(address)(uint256)" <address> --rpc-url https://rpc.monad.xyz
```

AUSD has 6 decimals, so 2000000 is $2.00.

---

## Venues checked and rejected

| Venue | Why not |
| --- | --- |
| Binance | Perpetual only, no spot MON. No naira rail since March 2024. |
| Bitget | Minimum withdrawal around 429 MON, roughly $10 in fees alone. |
| KuCoin | 25 MON withdrawal fee, and its naira P2P book is empty. |
| Upbit | Korea only. |
| Luno, Quidax, Busha, Yellow Card, Roqqu, Bitnob | None list MON. Busha is still useful as the naira leg of Route 2. |
| Backpack | Cheapest withdrawal anywhere at 1 MON, and accepts NIN for KYC, but has no naira rail, so it needs funding from somewhere else first. |
