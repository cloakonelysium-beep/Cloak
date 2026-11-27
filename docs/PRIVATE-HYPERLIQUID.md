# Private Hyperliquid accounts, powered by seats (design note)

Nov 27. A roadmap item, not built. It waits on Elysium's HyperCore upgrade: Kinetiq's docs say the HyperCore market-data precompile and the `ElysiumCoreWriter` predeploy arrive in an ArbOS upgrade about four weeks after mainnet (Nov 9), so around early December. As of today no address or interface (ABI) is published, and calls to HyperEVM's addresses on Elysium return nothing. **Everything below the "What we need from Kinetiq" section is a plan to check against that interface, not a promise.**

## In one paragraph

Open a Hyperliquid account that nobody can link to your wallet, funded from your private balance, traded at full speed from your device, and **unable to send money anywhere except back to your private balance**. The account belongs to a Cloak seat: a one-time contract account that Cloak's escrow already makes for Eloscape and Montra. Your device holds a trading-only key, so a leaked key can't drain anything. Seats have lifetimes, so you can retire an account and start a clean one, and nothing gets stranded if you disappear.

## What exists today: Unseen

[Unseen](https://www.unseen.money) already offers private Hyperliquid accounts from Elysium, without precompiles. From its docs (read Nov 27):

| | Unseen |
|---|---|
| The account ("alias") | An ordinary Hyperliquid account whose key the browser derives from a wallet signature over a fixed message. "The same wallet always opens the same alias, on any device" |
| Rotation, expiry, more than one | Not described. One alias per wallet, kept for good |
| Funding | Vault → a one-time address → Relay's bridge → USDC on Hyperliquid. Unfunded transfers return after 20 minutes |
| Fees | 1% exit fee, about 0.002 HYPE / 0.11 USDC transfer fee, Relay's fee (about 0.2% from USDC, 0.3 to 0.4% from HYPE), and 0.025% per trade on top of Hyperliquid's fee |
| The key | Exportable. Usable in Hyperliquid's own app. Whoever holds it controls the account and can withdraw |
| Recovery | Sign again with the same wallet. Losing the wallet isn't addressed |
| Contracts | Vault, bridge and fee collector are upgradeable proxies. No outside audit yet (their own statement) |
| Token | UNSEEN, launched on Montra against HYPE. Half of HYPE exit fees buy it and burn it |

What it gets right: it's live, it's simple, and the account works without Unseen.

Where seats do better:
1. **One permanent alias** builds one public profile of every position, liquidation price and P&L. Once it's linked to a person, all of it is.
2. **The key can withdraw.** An exported or leaked key loses the funds as well as the privacy.
3. **A Relay hop on every funding**, with its fee and its dependency.

## Hyperliquid accounts, briefly

- Any EVM address is a Hyperliquid account. There's no sign-up, and a contract address is no different.
- It becomes active when it first receives USDC. Hyperliquid charges **1 USDC once** for a transfer to an address that has never been used.
- The address's key signs orders, transfers and withdrawals. An account can also approve **API wallets** (agents) that can place and cancel orders but **can't withdraw or transfer**.
- Fee tiers follow each account's recent volume, so a new account starts at the base rate.
- Positions, orders, liquidation prices and P&L are public per account. Privacy here means nobody knows **whose** account it is, never what it holds.

## The design

### The seat owns the account

A seat is a `BidAccount`: a CREATE2 contract made by `CloakGloamBids` (mainnet `0x0334…1758`) from a key that fixes:
- the note that funds it;
- the owner key (derived on the device from the private account);
- the fallback (a fresh Cloak receive address of the same private account);
- the timeout (`exitAfter`, one of 7, 30, 90, 180, 365 or 730 days, so a new device can find it again from the chain).

The owner key drives it with `ownerCall`, which Cloak's relay sends, so the user's wallet never sends a transaction.

With `ElysiumCoreWriter`, the seat's own address is its Hyperliquid account (assuming the writer acts for `msg.sender`, as HyperEVM's CoreWriter does). The seat, and only the seat, can withdraw from it.

### The flow

```
Private balance (Gloam's vault)
   │ 1. a proof pays a fresh seat (standard-size pieces hide the amount)
   ▼
Seat on Elysium ── ownerCall → ElysiumCoreWriter ──▶ the seat's account on HyperCore
   │ 2. move USDC to HyperCore (1 USDC account fee the first time)
   │ 3. approve an API wallet whose key lives on the device
   ▼
The device trades directly on Hyperliquid's API with the API wallet
   (full speed, normal order types, no Cloak server in between)
   │ 4. close or withdraw: the seat asks HyperCore to send USDC back to Elysium
   ▼
Seat → finish → new private notes in Gloam's vault
```

### The rules that make it safe

- **The device's key can only trade.** API wallets can't withdraw or transfer, so a leaked key can lose money through bad trades but can't take it out.
- **Money only goes home.** Withdrawals are seat actions, signed by the owner key, and a seat sends only to the private balance (`finish`) or its fixed fallback. Nothing can send the account's USDC to an outside address.
- **The lifetime.** Each seat has a timeout:
  - **Renew** with one signature before it ends. Same account, new timeout. That means a new seat with a new key unless the escrow gains a renew call, which is to check.
  - **Retire** at any time: close positions, bring the USDC home, open a fresh seat. A new account is a clean public history.
  - **Expiry, if you disappear:** after the timeout, anyone can return the seat's funds to its fallback, which your private account sweeps next time you open the app. **The rule for open positions:** a seat with open positions can't be forced out. Only USDC that isn't margin comes back, and positions stay until you return or they close. Automatically closing positions would be riskier and is left out.
- **What today's escrow can't do:** `exitAfterTimeout` only moves tokens the seat holds **on Elysium**. Funds on HyperCore must first be asked back with a CoreWriter action, and after the timeout nobody but the owner key can call `ownerCall`. So:
  - **Phase 1 (no new contract):** use `CloakGloamBids` as it is, through `ownerCall`. Everything works while the owner keeps the key, but the timeout doesn't cover funds on HyperCore.
  - **Phase 2 (new contract, `CloakPerpSeats`):** the same seat accounts, plus an `exitAfterTimeout` that also sends the CoreWriter request to bring free USDC home. It also gets a fixed list of allowed CoreWriter actions (move USDC in and out, approve or revoke one API wallet, order and cancel), so even the owner key can't point funds at an outside Hyperliquid address.

### Seat lifetimes as a privacy feature

| | One fixed account (Unseen) | Seats with lifetimes (Cloak) |
|---|---|---|
| Public history | Grows forever on one profile | One profile per seat. Start clean whenever you like |
| A leaked device key | Funds and history | Only trading. Funds stay locked to home |
| A lost wallet or device | The wallet is the only way back | Seats are found again from the chain with the private account, and expired seats return to the private balance |
| Costs | One 1 USDC fee | 1 USDC per new seat, and fee tiers restart per account |
| Cross margin across everything | Yes | Per seat |

Good practice the app should show:
- let funds rest before funding a seat;
- fund in standard pieces;
- don't move money from a seat straight to an account known to be yours;
- a new seat per strategy or period.

## Fees and $CLOAK

- **Gloam's 0.5%** applies when a note leaves the vault for a seat. Cloak gets its half, as for every escrow flow.
- **No Relay fee**, if the CoreWriter moves USDC directly.
- **A Hyperliquid builder fee** on orders placed through Cloak's app: Hyperliquid lets an app add a small fee per order, with the user's approval. It's paid to Cloak's builder address and goes into the $CLOAK buyback, like every Cloak fee. Something like 0.025%, matching Unseen, is enough.
- The relay's gas for seat actions is paid from what each action moves, as on the Montra page.

## What stays visible

- The seat's funding: a one-time address on Elysium paid from Gloam's vault, and the amount, unless it's split into standard pieces.
- On Hyperliquid, everything about the account: positions, orders, liquidation prices, P&L, deposits and withdrawals.
- Timing: a 5,000 USDC shield followed by a 4,950 USDC seat ten minutes later is easy to link.
- The device talks to Hyperliquid's API directly, so Hyperliquid sees its IP. A VPN helps.

## What we need from Kinetiq (questions for the upgrade)

1. The `ElysiumCoreWriter` address and ABI, and the list of actions it supports.
2. Does an action act for `msg.sender`, so a contract on Elysium owns a HyperCore account at its own address?
3. Can it move USDC and HYPE from Elysium to HyperCore and back? How long does it take, which tokens, and are there fees?
4. Can it approve and revoke API wallets?
5. Actions aren't atomic with Elysium. How does a contract learn an action ran or failed? Is there an intent ID or nonce to make each action count once (Kann's note on Elysium recommends idempotent callbacks)?
6. Is there a delay on actions (HyperEVM's CoreWriter delays orders a few seconds)? It matters less here, since trading goes through the API wallet.
7. Can the precompile read an account's margin and open positions, for the "no forced exit with open positions" rule?

## If the CoreWriter can't do it

The fallback is Unseen's model, with our improvements:
- a key-derived account per seat (not per wallet), so accounts rotate;
- funded through a one-time address and Relay;
- Cloak's relay and standard pieces;
- the app makes a new account per strategy or period.

The key could then withdraw, so the "money only goes home" rule would be app policy, not contract law.

## Build plan

1. When the upgrade ships: read the ABI, answer the questions above on a fork, and write the answers here.
2. **Phase 1:** the SDK and the app through the existing `CloakGloamBids` `ownerCall`:
   - open a seat;
   - move USDC in;
   - approve the API wallet;
   - a trading panel (Hyperliquid's API from the device);
   - bring USDC home.

   Fork tests as for Eloscape and Montra. Small amounts first.
3. **Phase 2:** `CloakPerpSeats` (allowed actions, timeout that covers HyperCore funds), with forge tests and an outside review.
4. The builder fee on, and its revenue into the buyback.

## Sources

- Kinetiq, Building on Elysium: https://elysium.kinetiq.xyz/docs/building-on-elysium
- Chainstack, Elysium HyperCore: https://chainstack.com/elysium-hypercore/ and tooling: https://docs.chainstack.com/docs/elysium-tooling
- Kann, Elysium security: https://kannaudits.com/blog/elysium-security-kinetiq-hyperliquid-l2
- Unseen docs: https://www.unseen.money/docs (start, trading, balance, privacy, fees, contracts, token)
- Cloak: `contracts-gloam/src/CloakGloamBids.sol` (seat accounts, `ownerCall`, `exitAfterTimeout`), and PrivacyonElysium `projects/eloscape/src/recover.ts` (seat lifetimes)
