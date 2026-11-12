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
  `vendor/gloam/contracts`, `contracts`, `contracts-gloam` and `contracts-v4` (the last takes about 20 minutes).

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
4. From the main wallet (in its wallet app): `acceptOwnership()` on the config, `acceptController()` on the launch
   vault guard and on the ecosystem vault guard. The scripts print each call (address and data). Then check
   `owner()` / `controller()` read back the main wallet.

## After

- `node scripts/sdk-entry.mjs deployments/elysium-testnet-gloam.json deployments/elysium-testnet-v2-factory.json`
  prints the SDK entry: put it in `packages/sdk/src/deployments.ts` (chain 99801).
- `render.yaml`: `FACTORY`, `START_BLOCK` and every `GLOAM_*` address and block from the new records.
- Run the SDK, MCP and site checks, push to main, then delete `DEPLOYER_PK` and `KEEPER_PK` from the environment.
- Render: New > Blueprint, `cloak-testnet-keeper`, with the testnet keeper's key as `KEEPER_PK`.
- Vercel: root `apps/web`, `VITE_KEEPER_URL` and `VITE_RELAYER_URL` = the keeper's onrender.com URL, domain
  `testnet.oncloak.xyz`.
- GLOAK on testnet (`deployments/elysium-testnet-gloak.input.json`, short bidding window): see `docs/GLOAK-EXPERIMENT.md`.
