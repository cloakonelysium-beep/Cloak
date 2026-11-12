# Cloak v2: audit scope

**Repository:** https://github.com/cloakonelysium-beep/Cloak
**Commit:** `e55dde9e445eee1c6b9eab7fdadd8684985cbba6` (`main`, Nov 12, 2026). The code in scope is frozen at this commit
until the audit is done.

This replaces the scope we shared on Nov 6, which was for Cloak v1 (github.com/NECOKIZZ/Cloak). Cloak v2 is a new
repository: launches now settle into Uniswap v4 pools, and private balances run on Gloam's shielded vault instead of our
own vaults and circuits.

## What Cloak does

Cloak launches tokens on Elysium (an Arbitrum Orbit chain with a single sequencer) through a sealed-bid,
uniform-price auction:

1. **Commit.** Bidders lock a HYPE deposit with a hash of their bid and a drand-timelocked ciphertext of it.
2. **Reveal.** Once the drand round passes, the keeper (or anyone) opens each bid with its preimage. A bid that's never
   revealed loses a penalty from its deposit.
3. **Settle.** The auction walks price ticks from high to low to find one clearing price, then opens a Uniswap v4 pool
   at that price through Cloak's hook.
4. **Claim.** Every winner pays the same price, and the rest of each deposit comes back.

The full rules are in [`docs/RULES.md`](RULES.md), and the design in [`docs/HOW-IT-WORKS.md`](HOW-IT-WORKS.md).

## In scope

Counted without blank lines or comments:

| File | Lines | What it does |
|---|---|---|
| `contracts/src/CloakConfig.sol` | 334 | Launch rules (launch fee, bid and deposit caps). Loosening a rule waits a 3-day timelock once setup ends. |
| `contracts/src/CloakFactory.sol` | 105 | Creates a launch: the token, its auction and its vesting. |
| `contracts/src/CloakAuction.sol` | 444 | Commit, reveal, settle and claim, the no-reveal penalty, and pull-based payouts. |
| `contracts/src/CloakToken.sol` | 49 | The launched ERC-20. |
| `contracts/src/CloakVesting.sol` | 92 | Linear vesting for a creator's allocation, and the deployer that makes launch tokens and vesting contracts for the factory. |
| `contracts-v4/src/CloakV4Hook.sol` | 351 | The factory's seeder and Uniswap v4 hook: at settlement it opens a HYPE / token pool at the clearing price as one permanent full-range position, then runs the anti-snipe fee and splits trading fees (20% to Cloak, the rest to the creator). |
| `contracts-v4/src/CloakV4Market.sol` | 134 | A launch's v4 pool as Cloak's contracts and SDK see a market: native HYPE in and out, reserves and a time-weighted price. |
| **Total** | **about 1,500** | |

**Compiler settings:**
- `contracts/`: solc 0.8.24, `shanghai`, optimizer at 200 runs, `via_ir`.
- `contracts-v4/`: solc 0.8.26, `cancun`, the same settings as Uniswap's v4-core.

**Deployment, for context:** `e2e-gloam/deploy-v2-factory.mjs` (with `e2e-gloam/v2factory.mjs`) deploys the config, the hook at its flagged address and the factory, and hands the config's ownership over.
Please flag anything you see in how roles are assigned.

## Out of scope

- **Everything built on Gloam's shielded vault:** `contracts-gloam/` (the launch vault, escrows, batchers, routers and
  receipt checks) and Gloam's own vault, circuits and keys (`vendor/gloam`). These go through Gloam's own audit
  process.
- **Code that doesn't ship to mainnet:** the Uniswap V2 path (`CloakPair`, `CloakSeeder`, `CloakV2Market`,
  `CloakFeeLocker`), NFT drops (`CloakDrop`, `CloakEscrowDrop`), `CloakSpotBook`, `contracts-v4/src/experiment`, and
  `TestToken`. `CloakAuction` imports `CloakPair.sol` only for its token interface and the V2 fallback.
- Uniswap v4-core and v4-periphery, solmate and forge-std, used as they are.
- The TypeScript SDK, keeper, relay and site.

## Running the tests

```bash
git clone https://github.com/cloakonelysium-beep/Cloak && cd Cloak
git checkout e55dde9e445eee1c6b9eab7fdadd8684985cbba6
cd contracts && forge test
cd ../contracts-v4 && forge test
```

`contracts-v4` reads Cloak's launch contracts from `../contracts/src`. Its `CloakV4Mainnet` tests run against a fork
of Elysium mainnet and are skipped unless `MAINNET_RPC` is set.

## Earlier reviews

All findings so far and what we did about each are in [`docs/REVIEW-RESPONSES.md`](REVIEW-RESPONSES.md) and the
review log in [`SECURITY.md`](../SECURITY.md). Known issues we've accepted for the beta are listed there too, such as
W-01, where one well-funded bidder can fill a launch's deposit cap while the beta caps are on.

## Contact

Bob, on the Telegram thread or by DM to [@cloakonelysium](https://x.com/cloakonelysium) on X.
