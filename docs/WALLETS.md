# Wallets

Every wallet Cloak v2 uses, what it does, and where its key lives. Addresses only: no seed phrase or private key is ever
written here, in the repo, or in chat. Created Nov 12, 2026, fresh (nothing reused from Cloak v1 or earlier testnet runs).

Four seed phrases in all: one for testnet, three for mainnet.

## Mainnet (Elysium, chain 99901)

| Wallet | Address | Seed |
|---|---|---|
| Owner | `0x430c0A8547674ac2Fc09ad55eaF71FaAfB6bDf16` | its own |
| Treasury | `0xBB5Df281F605B886C3a4E73ECD6560847719936b` | its own |
| Keeper | `0x4039F9dD5198108e417A6e568D53b4A8Fd0F5442` | operations seed, account 1 |
| Deployer | `0xBCB87773362387812532a1403d8F75D4E13F259d` | operations seed, account 2 |

### Owner `0x430c…Df16`
Controls the rules. Holds no money beyond gas.
- Owns CloakConfig (launch fee, bid caps, launch floors): `owner` in `deployments/elysium-mainnet-v2-factory.input.json`.
  Tightening a rule is instant; loosening waits 3 days in public.
- Guard controller of the launch vault and the ecosystem vault (`safe`), and launch pauser (`pauser`) in
  `deployments/elysium-mainnet-gloam.input.json`. The pauser can only stop new launches; it can't touch funds.
- Ecosystem approver: lists outside tokens and approves vetted launchpads.
- Owns CloakTradeFee (the 0.25% trade fee): lowers it at once; raising it or moving the treasury waits 3 days.
- GLOAK's admin and the only key that can use the factory's one-time door (`admin` in
  `deployments/elysium-mainnet-gloak.input.json`).
- After the deploy it accepts every role: `acceptOwnership()` on the config, `acceptController()` on each vault guard
  (the deploy scripts print the calls). Until it does, the deployer still holds them, so do it straight away.
- Kept in a wallet app in its own browser profile, connected to nothing else. Seed offline in two places.
- Funding: 0.2 HYPE.

### Treasury `0xBB5D…936b`
Receives the money. Never needs to sign anything for the protocol to work.
- `treasury` in the factory config: the 1.5% launch fee and the hook's 20% share of trading fees.
- `feeRecipient` and `tradeFee.treasury` in the partner config: the 0.25% fee on private sales out of Cloak's vaults.
- Gloam's monthly fee share is paid here.
- Tops up the keeper with gas.
- Kept like the owner, under its own seed, so one leaked seed never exposes both control and money.
- Funding: none.

### Keeper `0x4039…5442`
The hot key. Sends transactions for the service, holds no role in any contract.
- Lives only in Render's dashboard as `KEEPER_PK` on the mainnet keeper service (`keeper.oncloak.xyz`).
- Reveals sealed bids, settles launches and batch rounds, relays users' private actions (it pays their gas).
- If it leaks, only its gas balance is at risk: it can't move users' funds or change any rule.
- Funding: 3 HYPE to start, topped up from the treasury (about 0.001 HYPE per relayed transaction).

### Deployer `0xBCB8…259d`
Used once, on deploy day.
- Pays for and sends the deploys (`DEPLOYER_PK` for `e2e-gloam/deploy-v2-factory.mjs`, `deploy-partner.mjs`,
  `deploy-gloak.mjs`). Every role is handed to the owner wallet; the deployer keeps none once the owner accepts.
- After the deploy and the owner's acceptance: send what's left to the treasury and retire it.
- Its seed stays safe all the same: a future contract fix means new contracts, and this wallet can deploy them again.
- Funding: 0.5 HYPE (the fork rehearsal used about 0.05).

## Testnet (Elysium testnet, chain 99801)

| Wallet | Address | Seed |
|---|---|---|
| Main | `0xA650a2f878b15d1202bA3AF3E7dAFd959DA168d6` | testnet seed, account 1 |
| Keeper | `0x04B675C9994e5936Bff2571b8739D41224fCB474` | testnet seed, account 2 |

### Main `0xA650…68d6`
Owner, treasury and deployer in one, since testnet money isn't real.
- Deploys the testnet contracts (its key in a local, git-ignored `.env` on the machine running the deploy).
  That includes v2's own NFT drop contracts (`e2e-gloam/deploy-drops.mjs`), which have no owner role.
- Every owner and treasury role in `deployments/elysium-testnet-*.input.json`: config owner and treasury, guard
  controller, pauser, fee recipient, trade-fee treasury, GLOAK admin. Accepts the roles after the deploy.
- Funding: testnet HYPE from the faucet (elysium.kinetiq.xyz).

### Keeper `0x04B6…B474`
The testnet keeper, the same job as mainnet's.
- Lives only in Render's dashboard as `KEEPER_PK` on `cloak-testnet-keeper` (its onrender.com address, no domain).
- Its own address so its transactions never collide with the main wallet's.
- Funding: testnet HYPE from the faucet.

### E2E tester `0xE184…04E4` (testnet only, temporary)
`0xE184Cd85DdDBcbaFE742bC241a383654eCBD04E4`. Created Nov 12 for the live end-to-end test, at the owner's request.
- Plays a creator and two bidders on the new testnet factory, so the Render keeper can be watched revealing and settling.
- Its key exists only in a git-ignored `.env` on that session's temporary machine, never printed; it's gone when the
  session ends. It holds no role in any contract.
- Funding: about 0.3 testnet HYPE from the testnet main wallet. Anything left is sent back to the main wallet after the test.
- Nov 12: 0.2785 HYPE sent back to the main wallet (tx `0x6db0cf5e…25db3e8`); 0.005 kept for gas.

## Not Cloak's

Addresses in the configs that belong to others, for reference:
- Gloam's mainnet vault `0x89d3…2164`, owned by Gloam's guard; Gloam's verifiers and Poseidon.
- Uniswap's mainnet v4 PoolManager `0xe2e1…23f1`.
- On testnet, the stand-in Gloam vault `0x8D15…cB44`, controlled by an earlier test wallet `0x1302…BFE5` that nothing
  in the redeploy needs.
