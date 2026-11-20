# Receive addresses on other devices: a recovery scan (planned, not built)

Status: proposal. Nothing here is built yet. Until it is, the site warns on the Receive page that only the device that
made an address moves its payments in.

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

## The fix: scan indices on unlock

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

## Also worth doing then

- **Sync the list across devices.** Instead of only scanning, store the encrypted index list where any device can
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
