# Moving HYPE from Cloak v1 to v2 (testnet)

Nov 16. Elysium testnet only, HYPE only. Cloak v1 never ran on mainnet.

## Where v1's HYPE is

Cloak v1 (cloak.boblabs.tech, its own Vercel and Render accounts, still running: keeper `cloak-keeper-x5yw`, v1
version 4, chain 99801) keeps private HYPE as WHYPE notes in its HYPE pool `0x3ACB22829bb422446caaDd8546e65ab530A53031`
(router `0x343ab9a7aac93cee28321410510ea24417cc6386`). On Nov 16 the pool held 14.0026 WHYPE, and no other v1 contract
held any HYPE or WHYPE. v1's code and testnet record are in this repo's history before `6effd97` ("Remove Cloak v1's code
from v2").

## The move

v1's withdraw (`unshieldHype`) unwraps and sends plain HYPE to any address, relayed by v1's relayer, and v2's receive
addresses move plain HYPE into the private balance. So:

1. On testnet.oncloak.xyz, the Portfolio card "Have HYPE in Cloak v1?" makes a fresh v2 receive address for the move
   (only when the user asks), added to the account's receive list.
2. The user opens cloak.boblabs.tech and withdraws their v1 HYPE to that address. v1's relayer sends it: the wallet
   isn't in the transaction.
3. v2 moves it into the private balance like any payment: while the card is open (every 20 s) and on every unlock.

Why not one click inside v2: it would bring v1's keys, tree sync and circuits (several MB) back into v2, and ask users
to sign v1's account message, which says "Only sign this on cloak.boblabs.tech", on oncloak.xyz. That teaches the habit
phishing relies on. Here each site asks only for its own signature, and nothing changes on v1 or on chain.

Shown on testnet only (`V1_MOVE` in `apps/web/src/v1move.tsx`); a user can hide the card.

## Simulated (Nov 16)

On a fork of Elysium testnet with v1's live router and HYPE pool and v2's live contracts, real proofs on both sides
(v1's SDK and circuits restored from `6effd97^` in a scratch folder): a v1 account shields 2 HYPE; it withdraws 1.5 HYPE
to a fresh v2 receive address with a real v1 proof, sent by a relayer account; 1.5 plain HYPE arrives; v2 collects it
into the test vault with real v2 proofs, sent by v2's relay; the user's wallet is in neither transaction; collecting
again moves nothing.

Result: passed in 74 s. The v1 account held 2 private HYPE; 1.5 withdrawn to the move address arrived as 1.49625 plain
HYPE (v1's own 0.25% withdrawal fee, read from the pool's `afterFee`); the v1 transaction came from the relayer, with
the user's address nowhere in it; v1's 0.5 change stayed private in v1; v2 credited exactly 1.49625 HYPE and the move
address was left empty; the v2 shield came from v2's relay; a second collect moved nothing.

So the user should expect v1's withdrawal fee (0.25%) on the way out of v1, and nothing on the way into v2.

## Later

- A banner on v1's site pointing here (v1's code is in another account).
- Other v1 assets (launch tokens, USDC) aren't moved by this card.
