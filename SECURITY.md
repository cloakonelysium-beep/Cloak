# Security

Cloak v2 runs on Elysium **testnet** (chain `99801`) on top of Gloam's shielded vault. It is beta software. Gloam's
vault has its own audit (Kann). **Cloak's own contracts around it are not externally audited yet.** Mainnet opens with
deposit caps that stay on until an external audit of Cloak's contracts is done.

Cloak v1 (its own vaults and circuits) lives in its own repository with its own `SECURITY.md` and review history.

## Reporting a vulnerability

Please report it privately. Don't open a public issue until a fix ships.

- **Where:** DM [@cloakonelysium](https://x.com/cloakonelysium) on X, or a private security advisory on this repository.
- **What helps:** the affected contract, page or endpoint, exact steps or a proof of concept (a forge test or a local
  anvil run is ideal), and the impact you saw.
- **In scope:** `contracts/src` (launches), `contracts-gloam/src` (the launch vault and escrows), `contracts-v4/src`
  (the v4 hook and market), the SDK, the keeper and relay, and the site.
- **Out of scope here:** Gloam's own vault, circuits and keys (`vendor/gloam`). Report those to Gloam.
- **Please don't** degrade the service for others, touch other people's funds or notes, or use social engineering.
- **What to expect:** a reply within 3 days, updates as we fix it, and credit once it ships if you'd like.

## What nobody can do

- **No Cloak function moves user funds.** A note leaves a vault only with its owner's zero-knowledge proof, made with
  Gloam's circuits. Auction money only goes to bidders, the creator and the fee recipient.
- **Nothing expires.** Won tokens, refunds and a creator's raise wait in the auction until their owner takes them.
- **The relay can't steal from, alter or redirect a transaction.** Every field is bound by the proof, and each escrow
  address is made from the whole action. It can only refuse or delay one.
- **The launch vault's owner is Gloam's `VaultOwnerGuard`.** Its launch pauser can only stop new admissions.
- **`CloakConfig` holds the launch rules** (launch fee, bid caps). Loosening one waits a public 3-day timelock once setup
  ends. Tightening one is instant.

## Review log

**Nov 6, 2026, KupiaSec (external report, on v1's batcher).** In a quiet round the average price could cover only a
few seconds, so a price held that long could set the crossing price. v2's batchers (`CloakGloamBatcher`,
`CloakGloamBatcherV4`) were written after the report with the fix built in:

- a round settles only once its average covers **a full round** from its first order (`settleOpens`);
- the average must also sit within the slippage bound of a **time-weighted price from before the round**, so pinning
  the opening spot doesn't help;
- the pool must be within **0.5%** of the average when the net trades, and the net trade within the impact cap, or the
  round is refunded rather than crossed at a band's edge.

Tests in `contracts-gloam/test/CloakGloamBatcher.t.sol`: `test_the_average_always_covers_a_whole_round`,
`test_a_push_in_the_first_orders_block_doesnt_pin_the_price`, `test_a_push_in_the_settling_transaction_doesnt_set_the_price`,
`test_a_big_move_held_through_the_round_is_refunded` and `test_a_small_move_held_through_the_round_sets_the_price`.
v1's batchers got the matching fix in v1's repository.

**Nov 7 and 8, 2026, two outside reviews.** Every finding fixed or decided, finding by finding, in
[`docs/REVIEW-RESPONSES.md`](docs/REVIEW-RESPONSES.md).

**Nov 9, 2026, stress test.** Contract and relay findings and their fixes in [`docs/STRESS-REPORT.md`](docs/STRESS-REPORT.md).

**Nov 10, 2026, code review.**
- **R-01 (Medium), fixed.** A batch order whose spend lands alone could be blocked for good by a stranger topping up its public escrow (1 wei with no vault fee). The order now counts at most its size. Tests: `test_R01_a_topped_up_escrow_still_places`, `test_R01_one_wei_with_no_vault_fee` (both fail on the old code).
- **R-02 (Low), fixed.** A creator contract that refuses HYPE could block Cloak's 20% of its pool's fees. The hook now pays the creator separately, and holds what a creator refuses for it to claim elsewhere (`claimHeldFees`). Tests: `test_R02_*`.
- **R-03 (Low), fixed.** Copies of one escrow call sent to the relay together all passed simulation and burned gas. The relay now locks each escrow call while it's in flight (end to end: part 3).
- **R-04 and R-05 (Low): no change.** The uint128 casts in batch settlement are bounded by the 4% side cap and the token's supply. An escrow can't be opened without its order being recorded in the same transaction.
- `CloakGraduation`, which had R-01's flaw too, was removed for the beta.

## Acknowledgements

Thank you to the people who reviewed Cloak's code on their own time and reported what they found privately.

- **Proovant ([@proovant_ai](https://x.com/proovant_ai))**, run by Haider Ali, did an independent AI-assisted security
  review of Cloak v1's contracts (Nov 7, 2026), with Foundry proofs of concept for each finding. This was not an audit,
  and it covered v1, not v2's code on Gloam's vault. The launch and drop contracts it reviewed are the same in v2. A
  recheck of our fixes found that a reveal window could still be one second long, which is now fixed with a 5-minute
  minimum. Findings CL-01 to CL-09 and A-1 to A-3 are in [`docs/REVIEW-RESPONSES.md`](docs/REVIEW-RESPONSES.md).
- **Shieldify Security ([@shieldifysec](https://x.com/shieldifysec))** reported findings on the auction's sealed bids
  and the batcher's price window (Nov 8, 2026). This was not an audit. Both findings led to fixes, described in Report 2
  of [`docs/REVIEW-RESPONSES.md`](docs/REVIEW-RESPONSES.md).

## Known issues (accepted for the beta)

- **W-01 (High): one well-funded bidder can fill a launch's deposit cap.** With 100 wallets and about 10,000 HYPE, someone can fill a launch's 10,000 HYPE cap with bids at the creator's minimum price, lock others out, and buy the whole sale at that price. They always pay at least the creator's minimum, and their deposit beyond the cost comes back. It exists only while the beta caps do, and the fix (counting each bid's cost rather than its deposit, or dropping the total cap) waits for after the beta (`docs/MAINNET-DECISIONS.md`, A6).

## To do: Elysium (ArbOS) findings, Nov 14

From Parapet Labs' article "Elysium security: ArbOS, HyperEVM, HyperCore" (parapetlabs.net, Nov 7), checked against our
contracts and measured on chain on Nov 14. Not fixed yet; tracked here.

Measured: inside a contract on Elysium, `block.number` is HyperEVM's block number, not Elysium's. On mainnet it read
51,219,671 while Elysium was at block 6,310,176 (testnet: 69,576,909 against 28,648,868), and it stayed the same across
about 12 Elysium blocks. `ArbSys(address(100)).arbBlockNumber()` returns Elysium's own number. Our tests and fork
rehearsals run on anvil, where `block.number` is the chain's own number, so they don't show this. The only uses of
`block.number`, `blockhash` or `prevrandao` in deployed contracts are the three below; Gloam's contracts use none.

- **E-1 (Low): the NFT drops' tie draw seeds from `blockhash`.** `CloakDrop._drawSeed()` and `CloakEscrowDrop`'s
  (the tie draw, and the token rotation in escrow drops) mix the bidders' salts with `blockhash(seedBlock)`, where
  `seedBlock` is the HyperEVM block after settlement. On ArbOS that hash is pseudo-random and produced by Elysium's single
  sequencer, so the sequencer could in principle steer which tied bidder wins (or which token each winner gets).
  Bidders can't: their salts are sealed until they open, and the block comes after every bid is open. Rated Low: only
  the chain's operator (Kinetiq, through Conduit) builds blocks, so nobody outside can influence that hash without
  compromising Elysium's sequencer itself, and ties only matter when a drop is oversubscribed at its clearing price. Also: once the seed block's hash exists, anyone can compute the result before drawing; if nobody draws
  within 256 HyperEVM blocks (minutes) it is re-drawn from a new block, so a tied bidder could only re-roll it by keeping
  everyone else, the keeper included, from drawing. The keeper draws within seconds.
  **Fix (next drop factory, not urgent):** seed from a drand round after the reveal deadline, as the launches' time-lock already
  does (planned since CL-01, `docs/REVIEW-RESPONSES.md`). **Until then:** don't run drops where a tie decides something
  valuable, or say so on the drop, if we want to remove even the operator's theoretical influence.
- **E-2 (Low, informational): `CloakConfig._register()` compares a start block with `block.number`.** Start blocks are
  Elysium's numbers and `block.number` is HyperEVM's, which is far larger on both networks, so the check
  `startBlock > block.number` never fires: it can't block a real registration, it just checks nothing. The registry is
  a Cloak v1 feature and is empty on v2's mainnet config. **Fix (next config):** compare with `ArbSys.arbBlockNumber()`,
  or drop the check.
- **E-3 (Low, to confirm): how Elysium orders transactions.** The article says by priority fee within each block;
  `docs/DESIGN.md` says the same, but `docs/REVIEW-RESPONSES.md` 2.2 and the site (landing, Docs, pitch) say first come,
  first served. Sealed bids are safe either way. Settling launches, rounds and drops, and opening bids, can be called by
  anyone and give the same result whoever calls first, so racing them gains nothing; the batch round settles at a
  time-weighted price within a slippage bound either way. **To do:** confirm with Kinetiq, then make the docs and the
  site say one thing.
- **E-4 (none): timestamps.** Blocks come about every 0.1 to 0.3 s and several share one `block.timestamp`. Every window
  we use (bidding, reveals, the 3-day timelocks, rounds, the time-weighted price) is seconds to days, so nothing
  changes. Rule for new code: never assume the timestamp or `block.number` moves with every block.
- **Later:** before using HyperCore's price precompile (mentioned on the Elysium hooks form), treat its data as the
  sequencer's word: enforce a maximum age and guard against thin order books. Test ArbOS-specific behaviour on Elysium
  itself (or its exact ArbOS version), not only on anvil forks.

## Audit scope for mainnet

Cloak's code only (Gloam's vault and circuits are audited separately). Counted without comments, tests or interfaces:

| Part | Contracts | Lines |
|---|---|---|
| Launches | CloakConfig, CloakFactory, CloakAuction, CloakToken, CloakVesting | about 950 |
| Uniswap v4 | CloakV4Hook, CloakV4Market | about 420 |
| NFT drops | CloakDrop and CloakDropFactory (sealed NFT drops), CloakEscrowDrop and CloakEscrowDropFactory (sealed auctions of NFTs that already exist), CloakSpotBook (whitelist spot sales on drops) | about 1,180 |
| On Gloam's vault | CloakLaunchVault (our one addition to Gloam's vault code), CloakEcosystemVault (outside tokens: Gloam's vault code plus rule-checked listing from vetted launchpads), CloakLaunchpadCheck (asks a launchpad's registry whether it made a token), CloakLaunchSwap base and V4, CloakRouterV4 (buys and sells across the three vaults, and Cloak's trade fee on sales), CloakTradeFee (the trade fee's rate and treasury, timelocked), CloakGloamBatcher base and V4, CloakGloamBids, CloakGloamReceive, CloakFundsGate, CloakReceiptCheck, CloakWHYPE (the routers' fixed WHYPE, a WETH9 port) | about 1,900 |
| Deployment and roles | `deploy-v2-factory.mjs`, `deploy-partner.mjs`, the guard, pauser and Safe handover | included |
| **Total** | | **about 4,450** |

Not shipped to mainnet, so not in scope: the Uniswap V2 path (`CloakPair`, `CloakSeeder`, `CloakV2Market`,
`CloakFeeLocker`, `CloakV2PairSwap`) and `TestToken`.
