<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/brand/cloak-mark-light.svg">
    <img src="apps/web/public/brand/cloak-mark.svg" alt="Cloak" height="72">
  </picture>
</p>

# Cloak v2: private launches and private trading for Elysium, on Gloam

**Site: [oncloak.xyz](https://oncloak.xyz)** (mainnet, keeper at keeper.oncloak.xyz) and [testnet.oncloak.xyz](https://testnet.oncloak.xyz) (testnet), being hosted. Cloak v1 stays at [cloak.boblabs.tech](https://cloak.boblabs.tech) and lives in its own repository.

> **Launches nobody can snipe, and trades nobody can trace.** Bids stay sealed until bidding closes, hidden even from the sequencer. Every winner pays **one clearing price**, and the launch opens a Uniswap v4 pool at that price. After launch, anyone can hold, send, buy and sell the token **from a private balance** kept in [Gloam](https://github.com/gloamtrade/gloam)'s shielded vault: proofs are made on your device and a relay sends them, so your wallet never appears.

Plain-English walkthrough: [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md). Handover for whoever works on this next: [HANDOVER.md](HANDOVER.md). Things to check after hosting: [CHECK.md](CHECK.md).

---

## What v2 is

Cloak v1 had its own vaults, circuits and verifiers. **v2 keeps none of them.** Every proof is a Gloam proof on Gloam's final ceremony keys, checked by Gloam's verifiers, which we never change. There are three vaults, and each asset has exactly one home:
- **Gloam's main vault** (run by Gloam): HYPE, USDC and the tokens Gloam lists, such as KNTQ.
- **`CloakLaunchVault`** (Cloak's own): Cloak launch tokens. It's Gloam's vault code, plus `admitLaunch` for a settled Cloak launch.
- **`CloakEcosystemVault`** (Cloak's own): other projects' tokens Cloak lists, either from a launchpad whose code Cloak vetted or vetted on their own. The listing rules are fixed: a real pool, minimum liquidity and market cap, and caps relative to supply.

Around the vaults sit small escrows that turn a Gloam proof into an action:

| Contract | What it does |
|---|---|
| **CloakFactory** + **CloakV4Hook** | Sealed-bid launches. Each settled launch opens a Uniswap v4 pool at its clearing price. The hook keeps the liquidity forever, and splits trading fees 80% to the creator, 20% to Cloak |
| **CloakRouterV4** | Private swaps between the three vaults, up to three pools (USDC to a launch token through HYPE). It takes Cloak's 0.25% trade fee in HYPE or USDC on sales out of Cloak's vaults (**CloakTradeFee**) |
| **CloakGloamBatcherV4** | Batch rounds in standard sizes, so a trade's size is hidden too |
| **CloakGloamBids** | Sealed bids paid from a private balance |
| **CloakGloamReceive** | Receive addresses anyone can pay, shielded by the owner's app, and the landing spot for bridging in through Relay |
| **CloakFundsGate**, **CloakReceiptCheck** | Allocation gates and receipts, proved with Gloam's own holder circuit |
| **CloakWHYPE** | The routers' own fixed WHYPE (Elysium's is upgradeable) |

**Community:** [t.me/cloakdesk](https://t.me/cloakdesk) on Telegram, [@cloakonelysium](https://x.com/cloakonelysium) on X, [Cloak](https://www.linkedin.com/company/oncloak) on LinkedIn.

## Mainnet (Elysium, chain `99901`): coming, in stages

The whole deploy has been rehearsed against Gloam's real Elysium vault (`0x89d3…2164`) on a fork of mainnet, with real proofs and real pools (`e2e-gloam/part22-mainnet-fork.mjs`). Here's what's settled:
- **Fees:**
  - 1.5% of a successful raise;
  - 20% of launch pools' trading fees;
  - 0.25% on private sales out of Cloak's vaults;
  - Gloam's own 0.5% when value leaves their vault, half of it shared with Cloak.
  - The relay is free for users.
- **Caps:** Gloam's vault starts small (12 HYPE and 500 USDC per deposit), and the caps rise with Gloam. The app splits bigger deposits, trades and bids to fit.
- **Keys:** one owner wallet and a separate treasury, with a multisig later.

The rest:
- the plan step by step: [`docs/MAINNET-CHECKLIST.md`](docs/MAINNET-CHECKLIST.md);
- every decision and why: [`docs/MAINNET-DECISIONS.md`](docs/MAINNET-DECISIONS.md);
- the token: [`docs/CLOAK.md`](docs/CLOAK.md).

## Live on Elysium testnet (chain `99801`)

v2 has **its own launch factory** (redeployed Nov 13 with the GLOAK audit fixes, from the testnet main wallet), apart from Cloak v1's. Its rules are copied from v1's: launch fee 1.5%, auctions capped at 100 HYPE per bid and 10,000 HYPE in total. Testnet runs **Cloak's test vault**: Cloak's own copy of Gloam's open-source (MIT) vault, unmodified, taking HYPE, USDC and a test KNTQ with mainnet's limits. It's run by Cloak, for testnet only, and it isn't Gloam's vault (Gloam agreed to it on those terms). On mainnet, Cloak uses Gloam's own vault. It's deployed and run by the testnet main wallet (since Nov 13). Cloak's launch vault and escrows are deployed around it.

| Contract | Address |
|---|---|
| CloakConfig (v2) | `0x716eb18ec96b21a134b8affe0daa6fa968bbb1a3` |
| CloakFactory (v2), from block 28280297 | `0x395db13360cf54d3dbc583a68ca956a407aef4d4` |
| CloakV4Hook (v2) | `0x04295229378E13f8bddE3014089b2C6625806A80` |
| Cloak's test vault, from block 28358841 | `0xA5ebd1F2e1F90d957C0459BA0dC892b0189B1678` |
| Its guard / memo board | `0x8660964d071B9FD6f8aB3E63b368bd8aab911cCD` / `0x7612118bDE6e371a79A909dF6abCD981e5320cbC` |
| Test KNTQ (anyone can mint) | `0x2bd92af06c47a8ad26101a7e2084aff66b5f2c1f` |
| CloakLaunchVault, from block 28359290 / its guard | `0x0b7b1b12fb05fa433ec157d0d097f20fe1270f56` / `0x84ec184502aad6db28c18f1c3fcf00c551885680` |
| CloakLaunchSwapV4 / CloakRouterV4 | `0x3a100249a9cd1757fedf7740ffa583cb0300c218` / `0x79da9a53d719e420b13d260e13061d85b6edc867` |
| CloakEcosystemVault / its guard | `0x5235f1e5a1c3f284f67ba6361846b71e9f3ea336` / `0x84a5d21941b8777860ae4c148ee93971faf05827` |
| CloakTradeFee | `0x55bf468538eeeb4e422bca8f5abf3da8a104f08c` |
| CloakGloamBatcherV4 | `0x5f96d587364b90da6ef03704c19f688f43759baf` |
| CloakGloamBids | `0xf356b11b723a2a497b4ffaf83ba2548dbc92bcfb` |
| CloakGloamReceive | `0x11ef5ff51002f7dc1adb7d60b8c569d61486c9f6` |
| CloakFundsGate / CloakReceiptCheck | `0xe2e5c9531348197e7913a0464961c7fdd2a23deb` / `0xa25ad83921e85d4a6490fb1fc82eeffcaa1162d4` |
| PoolManager (Uniswap v4 on testnet) | `0x51027076df8416e42ea8438b27a0c433d9662e68` |

The full record: [`deployments/elysium-testnet-gloam.json`](deployments/elysium-testnet-gloam.json) and [`deployments/elysium-testnet-v2-factory.json`](deployments/elysium-testnet-v2-factory.json). The SDK carries the same addresses (`deploymentFor(99801)`). Every rule, with its number: [`docs/RULES.md`](docs/RULES.md). As on mainnet (where it's Gloam's vault), HYPE, USDC and KNTQ sit in the main vault and launch tokens in Cloak's launch vault, with the router trading between them, plus the ecosystem vault for outside tokens.

## Layout

```
contracts/          Foundry: the launch side (CloakConfig, CloakFactory, CloakAuction, CloakToken, CloakVesting, drops)
contracts-gloam/    Cloak's contracts around Gloam's vault: the launch and ecosystem vaults, the router, the trade fee and the escrows
contracts-v4/       The v4 side: CloakV4Hook, CloakLaunchSwapV4, CloakGloamBatcherV4, tested on the real PoolManager
vendor/gloam/       Gloam's repository, pinned. Never edited
packages/sdk/       @cloakely/sdk: launches (Cloak) and private balances (GloamPrivate)
packages/mcp/       @cloakely/mcp: an MCP server so agents can launch, bid and trade privately
services/keeper/    Reveals and settles launches, relays private actions (POST /gloam/relay), runs batch rounds,
                    holds split withdrawals (POST /schedule) and serves the vaults' leaf lists (GET /leaves)
apps/web/           The site (Vite + React), on Vercel
e2e-gloam/          End-to-end runs: anvil, forks of testnet and live
```

## For launchpads: `@cloakely/sdk`

```ts
import { Cloak, GloamPrivate, deploymentFor, gloamProvers, gloamRelaySubmitter } from "@cloakely/sdk";
const d = deploymentFor(99801);
const cloak = new Cloak(publicClient, walletClient, d.factory);

await cloak.createLaunch({ name: "Shade", symbol: "SHADE", /* sale, ticks, windows */ });
await cloak.bid(auction, { maxPrice, quantity }); // a hash and a drand ciphertext on chain, nothing else

const g = d.gloam;
const priv = await GloamPrivate.unlock(walletClient, {
  publicClient, chainId: 99801, payMemo: g.memoBoard, whype: g.whype,
  gloamVault: { pool: g.gloamVault, poolBlock: g.block },
  launchVault: { pool: g.launchVault, poolBlock: g.launchVaultBlock ?? g.block },
  launchSwapV4: g.launchSwapV4, batcherV4: g.batcherV4, receive: g.receive, bids: g.bids,
  provers: gloamProvers(), submit: gloamRelaySubmitter(KEEPER_URL),
});
await priv.shieldHype(walletClient, parseEther("1")); // the one public step
await priv.buy(token, parseEther("0.25"));            // the relay sends it, your wallet never shows
await priv.batch(token, "buy", parseEther("0.37"));   // size hidden too
```

## Run it

Prerequisites: Node 22, pnpm, Foundry. In a container, Node's `fetch` needs `NODE_USE_ENV_PROXY=1`.

```bash
pnpm install && pnpm build
pnpm test                       # forge (contracts, contracts-gloam, contracts-v4) and the SDK tests
node e2e-gloam/part7-adapter.mjs  # the site's backend end to end on anvil, real proofs
```

The full list of end-to-end runs is in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) and [HANDOVER.md](HANDOVER.md).

### Hosting

| Part | Where | Notes |
|---|---|---|
| Site | Vercel, root `apps/web` | Env `VITE_CHAIN_ID` (99801 or 99901), `VITE_RPC_URL`, `VITE_RPC_BACKUP` (backup RPCs, failover), `VITE_KEEPER_URL` and `VITE_RELAYER_URL`. Addresses come from the SDK, never from env |
| Keeper | Render free plan, [`render.yaml`](render.yaml) | `KEEPER_PK` and `RPC_BACKUP` in Render's dashboard. Sleeps when idle and wakes on the site's first request. See [docs/OPTIMIZATION.md](docs/OPTIMIZATION.md) |

## Honest limits

- **Hidden:** who traded, what each account holds, which trades belong together, and in batch mode each trader's size. Private sends hide the amount.
- **Visible:** an instant trade's size and direction on the public pool, a batch round's net, and the amounts of deposits and withdrawals.
- **Batch privacy needs company.** Alone in a round, your orders add up to your trade.
- **Timing can link you.** Shielding 1 HYPE and buying with exactly 1 HYPE right after is easy to connect.
- **The relay** can refuse or delay a call and sees your IP. It can't change anything: the proof binds every field. Anyone can run one.
- **Sealed bids** rely on the drand network. A threshold of its members colluding could open bids early.
- **Vault caps.** Gloam's vault caps each deposit for now. Bigger amounts go in parts, and a full vault total stops new deposits until the cap rises.
- **Not audited yet.** Cloak's own contracts are reviewed internally, and an outside audit comes next. Until then, caps stay on. Gloam's vault itself was audited by Kann.

## License

[MIT](LICENSE) © 2026 Bob Labs. Gloam's code under `vendor/gloam` and the verifiers exported from Gloam's keys keep their own licenses (GPL-3.0 headers).
