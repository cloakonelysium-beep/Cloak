# Browser recovery for deposits (to brainstorm)

Status: open question, to sit down and decide. Nothing here is built. Until it is, the Receive page warns that only the
browser that made an address moves its payments into the private balance.

The question: when someone pays into Cloak (Elysium receive address, Relay from another network, card, bridge) and
then clears their browser or switches device, how does the money still reach their private balance? Below are the
facts, then the options found so far.

## The problem

Every receive address belongs to the private account, but the list of which ones were handed out lives only on the
device that made them.

- `receiveAddress(n)` in the SDK (`packages/sdk/src/core/gloamPrivate.ts`) is fully determined by the account's private
  keys and the index `n`: `boxOf(receiveKey(n).address, n)` on Cloak's receive contract. Any device that unlocks the
  account can compute address `n` again.
- The Receive page keeps the handed-out indices in an encrypted box in the browser's `localStorage`
  (`sealBox(priv, "receive", …)` in `apps/web/src/deviceBox.ts`), and nowhere else.
- Payments are moved into the private balance by `collectIssued` (`apps/web/src/gloam.ts`): on every unlock
  (`collectOnUnlock`) and every 20 seconds while the Receive page is open. Both walk only that local list.

So a payment to an address made on a phone is safe (it waits at the address, and only the account's keys can move it),
but a laptop never looks at that address. The same happens after clearing the browser's data. Nothing is lost; it
just isn't collected until the user comes back to the original browser.

It affects every kind of address, all made the same way:

| Address | Made by | Notes |
|---|---|---|
| Elysium receive address | Receive page, Elysium tab, "New address" | Shared with whoever pays, and often reused |
| Relay deposit target | Receive page, Another network | A new address per Relay deposit address, marked `relay: true` in the list |
| Card (Spicenet) target | Pay with card | A new address per card payment |
| Bridge target | Bridge page | A new address per bridge |

## What already survives a clear: receive address #1

After a clear the Receive page finds an empty list and makes address `n = 0` again, which is the same #1 as before,
because it comes from the keys. So a payment to #1 is picked up again. Payments to #2 and later are not. One gap:
today #1 is only collected while the Receive page is open, not on unlock, because `collectOnUnlock` reads the same
(now empty) list.

## Option A: one fixed address for Relay (and maybe card and bridge)

Give Relay one receive address of its own at a fixed index every device knows (for example a reserved `n`), and
always check it, together with #1, on unlock.

- Survives a clear and works on any device, with no scan.
- Relay deposits don't share an address with the Elysium one, but they can be linked to each other (each already
  comes from an exchange withdrawal). Relay's deposit addresses accept any number of deposits, so one per network
  can point at that one receive address.
- Small change: a constant index, `collectOnUnlock` always includes #1 and the fixed one.
- Card and bridge could each get a fixed address the same way, at the same privacy cost.

Simplest variant: deliver Relay to #1 itself. It also survives a clear, but links Relay deposits to everyone who pays
the Elysium address, so option A is preferred.

## Option B: scan indices on unlock

On unlock, after `collectOnUnlock`, check indices the device doesn't know about, the way HD wallets find used
accounts:

1. Let `known` be the highest index in the local list (or -1 with no list).
2. For `n = 0 … known + GAP` that aren't in the list, compute `receiveAddress(n)` and read its balance in HYPE and in
   every vault asset (USDC, KNTQ, launch tokens): one multicall per batch of addresses.
3. Any address holding something is added to the local list and collected with `collectReceived(n)`, as today.
4. Stop after `GAP` addresses in a row that hold nothing and aren't in the list.

### Choosing the gap

Indices are used up faster than in a wallet. Every Relay deposit address, card payment and bridge takes a new one,
even when the user never sends. A gap of 20 could miss a payment after a run of unused ones. Two ways round it:

- **A larger gap with cheap reads.** 50 addresses × (1 HYPE balance + about 3 token balances) in two or three
  multicalls takes a second or two. Run it once per unlock, in the background, never blocking the page.
- **Fewer used-up indices.** Reuse a Relay target per network (Relay's addresses accept any number of deposits), and
  make card and bridge targets only when the payment is actually sent.

Plan: both. A gap of 50, and reuse where it costs no privacy the user expects.

### What "holds nothing" misses

A scan by balance finds only payments that haven't been collected yet, which is the case that matters. Payments
already collected from another device are in the private balance anyway. The "Payments to this address" history on a
new device would still be empty for old addresses; that's cosmetic.

## Option C and other things worth doing

- **Option C, sync the list across devices.** Instead of only scanning, store the encrypted index list where any device can
  read it (for example in the account's own memo storage on chain, or on the keeper, encrypted to the account). A
  scan still covers anything the sync missed.
- **Relay status by deposit address.** A Relay transfer can move to a new request id when the amount or coin differs
  from the quote, so the status row may say "Waiting" after the money arrived. Relay's canonical lookup
  (`GET /requests/v3?depositAddress=…`) needs an API key, so it belongs behind a small server route (for example
  `/api/relay-status`) with the key kept server-side. Until then the Payments and Older addresses lists, which read the
  chain, are the source of truth.

## Testing it when built

- Make addresses on one browser profile (Elysium, a Relay one, a card one), pay one of each on a mainnet fork, then
  unlock the same account in a fresh profile: all three are found and collected.
- 60 unused indices, then a paid one: found with a gap of 50 only if the reuse rules keep the run under the gap;
  the test shows which.
- Unlock time with an empty account: the scan must not slow the first paint.

## To decide

- A alone, B alone, or A now and B or C later?
- Should card and bridge payments also use fixed addresses (less privacy between a user's own payments, always
  recoverable), or keep a new address each time and rely on B or C?
- Where would a synced list live (on chain memo storage, the keeper), and who can see that a list exists?
