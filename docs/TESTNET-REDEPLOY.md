# Testnet redeploy (Nov 12, 2026)

The Elysium testnet redeploy with the new testnet wallets (`docs/WALLETS.md`). Rehearsed end to end on a fork of
testnet on Nov 12 with these exact configs (Foundry 1.5.1): factory 0.014 HYPE, launch vault and escrows 0.030 HYPE;
the main wallet's three acceptances worked, and none of the 27 contracts kept the deploy wallet as owner, controller,
admin or pauser.

## Before

- The main wallet `0xA650…68d6` holds at least 0.2 testnet HYPE (faucet: elysium.kinetiq.xyz).
- The session's environment has `DEPLOYER_PK` (the main wallet's key). Environment variables load when a session
  starts. Never print it.
- Foundry: the stable release from github.com/foundry-rs/foundry/releases, on `PATH`.
- `git submodule update --init --recursive`, `pnpm install --frozen-lockfile`, then `forge build` in
  `vendor/gloam/contracts`, `contracts`, `contracts-gloam` and `contracts-v4` (the last takes 5 to 20 minutes), then `pnpm --filter @cloakely/sdk build` (the deploy scripts import it).

## Deploy (in this order)

1. Factory and hook. Writes `deployments/elysium-testnet-v2-factory.json` over the old record:
   ```
   NODE_USE_ENV_PROXY=1 node e2e-gloam/deploy-v2-factory.mjs --config deployments/elysium-testnet-v2-factory.input.json
   ```
2. Copy `factory` and `v4Hook` from that record into `deployments/elysium-testnet-gloam.input.json`.
3. Launch vault, router, escrows, ecosystem vault. Writes `deployments/elysium-testnet-gloam.json` over the old record:
   ```
   NODE_USE_ENV_PROXY=1 node e2e-gloam/deploy-partner.mjs --config deployments/elysium-testnet-gloam.input.json
   ```
4. From the main wallet (in its wallet app): `acceptController()` (data `0x9bc21c0c`) on the launch vault guard and on
   the ecosystem vault guard. The config needs no `acceptOwnership()` here: when the deployer is the owner, it owns the
   config directly (the call would revert with `NotPendingOwner()`). Then check `controller()` reads back the main
   wallet with nothing pending.

**Done Nov 12** (commit 09d5ac7): 0.0043 HYPE in all. Factory `0xb906…71d7` (block 27930789), hook `0x822c…2a80`,
config `0x3133…a9ba`, launch vault `0xef42…84e7` and the escrows from block 27931042; every address is in
`deployments/elysium-testnet-*.json` and `packages/sdk/src/deployments.ts`.

## After

- The partner config needs `gloamVaultBlock` (Gloam's vault's deploy block, 26230337 on testnet) so the record and
  the SDK read Gloam's vault from its start; `block` in the record is where Cloak's own vaults start.
- `node scripts/sdk-entry.mjs deployments/elysium-testnet-gloam.json deployments/elysium-testnet-v2-factory.json`
  prints the SDK entry: put it in `packages/sdk/src/deployments.ts` (chain 99801).
- `render.yaml`: `FACTORY`, `START_BLOCK` and every `GLOAM_*` address and block from the new records.
- Run the SDK, MCP and site checks, push to main, then delete `DEPLOYER_PK` and `KEEPER_PK` from the environment.
- Render: New > Blueprint, `cloak-testnet-keeper`, with the testnet keeper's key as `KEEPER_PK`.
- Vercel: root `apps/web`, `VITE_KEEPER_URL` and `VITE_RELAYER_URL` = the keeper's onrender.com URL, domain
  `testnet.oncloak.xyz`.
- GLOAK on testnet (`deployments/elysium-testnet-gloak.input.json`, short bidding window): see `docs/GLOAK-EXPERIMENT.md`.

## Nov 13: a stand-in for Gloam's vault, with HYPE, USDC and KNTQ

Gloam has no vault on Elysium testnet, and the earlier stand-in (`0x8D15…2164`) took only USDC and is run by an old
test wallet. So testnet now runs a new stand-in that matches mainnet:

- **Gloam's mainnet vault code, unmodified.** `ShieldPoolPayments` on freshly deployed final-key verifiers, behind
  Gloam's key gate, born under a `VaultOwnerGuard`, deployed by Gloam's own `MainnetDeploy._deployMainnetGuarded`
  (`contracts-gloam/gloam-root/DeployCloakGloam.s.sol`), with Gloam's memo board.
- **Assets.** HYPE at 12 / 600 and KNTQ at 1,400 / 70,000 (the limits Gloam has queued on its mainnet vault), and
  Kinetiq's test USDC at 500 / 25,000 (Gloam's own testnet values). The cash-out fee is 0.5%, Gloam's mainnet fee.
- **KNTQ.** It has no contract on testnet (Kinetiq's mainnet address is empty there), so a test KNTQ was deployed:
  `0x2bd9…2c1f`, 18 decimals, anyone can mint.
- **Control.** The testnet main wallet `0xA650…68d6` controls the stand-in's guard `0x5851…5F97` since it accepted
  on Nov 13 (tx `0x9ab4bc9e…b30f5c`, block 28286241); the tester deployed it and holds nothing. The launch vault and
  ecosystem vault guards from this first deploy (`0x7d6b…3d12`, `0x5324…91ea`) belong to contracts replaced the same day
  (next section) and are no longer used.
- **Around it.** A new partner deploy (launch vault, launch swap, router, batch rounds, bids, receive, funds gate,
  receipt check, ecosystem vault), as on mainnet. HYPE now sits in Gloam's vault and trades through the router; the
  SDK sets `router` for testnet. Private balances in the Nov 12 launch vault (`0xef42…84e7`) stay withdrawable from
  that contract, but the site no longer shows them.
- **Cost.** 0.0008 HYPE for the stand-in and 0.0030 HYPE for the partner deploy, from the tester wallet.
- **Records.** `deployments/elysium-testnet-gloam-standin.json` (the stand-in) and
  `deployments/elysium-testnet-gloam.json` (Cloak around it). The Nov 12 record is in git history.

**Switching to Gloam's own testnet vault** when Gloam deploys one. Only its address, memo board and start block are
needed:

```
node e2e-gloam/use-gloam-vault.mjs --vault <Gloam's vault> --memo <its memo board> --block <its deploy block>
NODE_USE_ENV_PROXY=1 node e2e-gloam/deploy-partner.mjs --config deployments/elysium-testnet-gloam.input.json
node scripts/sdk-entry.mjs deployments/elysium-testnet-gloam.json deployments/elysium-testnet-v2-factory.json
```

The first command reads the vault's verifiers and Poseidon from the chain, checks it is out of setup with limits on,
reports which of HYPE, USDC and KNTQ it takes, and writes the partner config. Then put the SDK entry in
`packages/sdk/src/deployments.ts` and the `GLOAM_*` values in `render.yaml` (and on the Render service). Cloak's
contracts take the vault at deploy and nobody can repoint them later, so the switch is a redeploy (about 0.003 HYPE),
not a setting.

## Nov 13: redeploy after the GLOAK audit (main testnet wallet)

The audit fixes (docs/REVIEW-RESPONSES.md, report 3) changed the auction and the token deployer (so the factory, its
hook and its config are new) and the router and market adapter (so the partner contracts are new). Gloam's vault
stand-in and the NFT drops stay as they are. GLOAK itself isn't launched on testnet yet, so nothing is lost.

Rehearsed on a fork of testnet, all three steps chained (factory, partner, GLOAK's maker and the owner wallet's door
call): about 0.0045 HYPE at testnet gas prices.

From a session with the **testnet main wallet's** key as `DEPLOYER_PK` (`0xA650…68d6`):

```
cd contracts && forge build && cd ../contracts-v4 && forge build && cd ../contracts-gloam && forge build && cd ..
NODE_USE_ENV_PROXY=1 node e2e-gloam/deploy-v2-factory.mjs --config deployments/elysium-testnet-v2-factory.input.json
NODE_USE_ENV_PROXY=1 node e2e-gloam/deploy-partner.mjs --config deployments/elysium-testnet-gloam.input.json
node scripts/sdk-entry.mjs deployments/elysium-testnet-gloam.json deployments/elysium-testnet-v2-factory.json
```

- The partner deploy reads the new factory and hook from `deployments/elysium-testnet-v2-factory.json`
  (`factoryRecord` in its config), so there is nothing to edit between the steps.
- The deployer is the owner, so the config needs no `acceptOwnership()`, and the guards' control stays with the main wallet.
- Then: the SDK entry into `packages/sdk/src/deployments.ts` (keep the drops lines and `assets` with KNTQ),
  `render.yaml` and the Render service's `FACTORY`, `START_BLOCK` and `GLOAM_*` values (the router in `GLOAM_ESCROWS`),
  the README table, then push. Delete `DEPLOYER_PK` from the environment afterwards.
- GLOAK on testnet, when wanted: put a `commitEnd` in `deployments/elysium-testnet-gloak.input.json` (its reveal window
  is now 6 hours) and run `deploy-gloak.mjs`; it prints the owner wallet's one door call.

**Done Nov 13**, from the testnet main wallet `0xA650…68d6`, built with forge 1.5.1 (rehearsed on a fork first). GLOAK not
launched; the stand-in vault, the test KNTQ and the NFT drops untouched.

- **Factory** (block 28280297, 0.00132 HYPE): CloakConfig `0x716eb18ec96b21a134b8affe0daa6fa968bbb1a3` (owner
  `0xA650…68d6`, nothing pending), CloakFactory `0x395db13360cf54d3dbc583a68ca956a407aef4d4`, CloakV4Hook
  `0x04295229378E13f8bddE3014089b2C6625806A80`, vesting deployer `0x462f90c360d2d3e724f276c4bcf2a5d7f211cb71`.
- **Partner** (block 28280687, 0.00305 HYPE), on the stand-in `0x3ABB…6370`:
  - launch vault `0x30d8857a6d988577ab0206c0a782958e22cbcd3c`, its guard `0x22b8db11ba94f02933498921a801cc84be730e74`;
  - ecosystem vault `0x4ed9b20cd16a0de1c94c056eb709de0c1a866bd9`, its guard `0x46613a147c0f11843bf4fa790247cddc082aff00`;
  - launch swap `0xb8a7d9956c8c6af1829a6f61e30928ed52bd9a52`, router `0x987e7deca86081e459e1a86a31695bf9f917f4c8`;
  - batcher `0x9b58c5365d79fb65ab8cb8796616d80c7e6ae903`, bids `0x7ee58219cf84b5a378279d5f10fc1369e13795c3`, receive
    `0x5b67d9b3ea70d8d4da158af28772428d4cadc1f2`;
  - funds gate `0x45bdb2ff14325342639cea193a7f92c87fa14019` (verifier `0xf16dda01ccb082ce83fbca10d6d3df55c989b8aa`),
    receipt check `0x1d27fd681756fe9c72fd0ec4d6b4a18cf312f64d` (verifier `0xff019e197c1dfce113bc466178a0b980dbcd5880`);
  - trade fee `0xc3fe6064fa0765a7e21af4b1f7b62fa5c4594a8c` (0.25% to `0xA650…68d6`).
- **Checked on chain:** both guards' controller is `0xA650…68d6` (the pending controller is the same wallet, a no-op
  offer to itself); the router's `privateOnlyToken()` is `0x0`; the router's `gloamVault`, and the batcher's, bids',
  receive's and funds gate's HYPE vault, are the stand-in; the launch vault runs on the stand-in's verifier and Poseidon.
- **Cost:** 0.00437 HYPE in all (0.28331 → 0.27894 HYPE).
- The Nov 12 drops still read the Nov 12 config (`0x3133…a9ba`), as before: they weren't redeployed.
- SDK entry, `render.yaml` and the Render service's `FACTORY`, `START_BLOCK` and `GLOAM_*` values updated.

## Cloak's test vault, from the main wallet

Gloam agreed (Nov 13) that Cloak runs its own copy of their open-source guarded vault on Elysium testnet, on two
conditions: **testnet only**, and **never labelled as Gloam's vault anywhere users can see it**. On mainnet Cloak uses
Gloam's own vault. The site now names it by network (`MAIN_VAULT` in `apps/web/src/config.ts`): "Cloak's test vault" on
testnet, "Gloam's main vault" on mainnet.

The first copy (`0x3ABB…6370`) was deployed from the tester wallet. It is replaced by one deployed and run by the
testnet main wallet: `e2e-gloam/deploy-test-vault.mjs` with `deployments/elysium-testnet-test-vault.input.json`. That
config reuses the test KNTQ, has the same limits and fee, and makes the main wallet both deployer and guard controller;
the script refuses any other key. Cloak's contracts take the vault at deploy, so the partner contracts are redeployed
around the new vault. About 0.004 HYPE in all.

```
NODE_USE_ENV_PROXY=1 node e2e-gloam/deploy-test-vault.mjs --config deployments/elysium-testnet-test-vault.input.json --rehearse
NODE_USE_ENV_PROXY=1 node e2e-gloam/deploy-test-vault.mjs --config deployments/elysium-testnet-test-vault.input.json
NODE_USE_ENV_PROXY=1 node e2e-gloam/use-gloam-vault.mjs --vault <vault> --memo <memo board> --block <block>   # printed by the step above
NODE_USE_ENV_PROXY=1 node e2e-gloam/deploy-partner.mjs --config deployments/elysium-testnet-gloam.input.json
node scripts/sdk-entry.mjs deployments/elysium-testnet-gloam.json deployments/elysium-testnet-v2-factory.json
```
