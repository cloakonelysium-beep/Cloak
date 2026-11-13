import type { Address } from "viem";

/**
 * Where Cloak v2 lives on each chain, so integrators never copy addresses by hand. Cloak v2 runs on Gloam's vaults and
 * keys; Cloak v1 (Cloak's own vaults) is a separate deployment in Cloak v1's repo.
 */
export interface CloakDeployment {
  chainId: number;
  /** Cloak v2's CloakConfig: the launch fee, the treasury and the bid caps its launches use. */
  config: Address;
  /** Cloak v2's launch factory (sealed-bid launches that open a Uniswap v4 pool through CloakV4Hook). */
  factory: Address;
  /** Block the factory was deployed in: scan launch events from here. */
  factoryBlock: bigint;
  /** Uniswap v4's PoolManager (on testnet, Cloak's deployment of Uniswap's exact build; on mainnet, Uniswap's own). */
  poolManager: Address;
  /** CloakV4Hook: seeds and looks after every v2 launch's pool. */
  v4Hook: Address;
  /** WHYPE, the token pages use for HYPE. */
  whype: Address;
  /** Cloak's keeper and relay (POST /gloam/relay, /schedule, /leaves). */
  relayerUrl: string;
  /** CloakDropFactory: sealed NFT drops (wallet bids). */
  dropFactory?: Address;
  /** Block the drop factory was deployed in: scan drop events from here. */
  dropFactoryBlock?: bigint;
  /** CloakSpotBook: WL spot sales on top of drops; winners name the wallets to whitelist. */
  spotBook?: Address;
  /** CloakEscrowDropFactory: sealed auctions of NFTs that already exist (listed with the drops). */
  escrowDropFactory?: Address;
  /**
   * Tokens that aren't launches (USDC): private balances in Gloam's vault. `pool` is the asset's plain native-HYPE
   * Uniswap v4 pool (no hook): with gloam.router set, the asset trades privately against HYPE, and through HYPE against
   * every launch token and outside token in one swap.
   */
  assets?: { symbol: string; token: Address; decimals: number; pool?: { fee: number; tickSpacing: number } }[];
  /** Gloam's vault and Cloak's launch vault and escrows on it. */
  gloam: GloamDeployment;
}

/** Where Cloak v2 on Gloam lives on a chain (deployments/<chain>-gloam.json). */
export interface GloamDeployment {
  /** The main vault: Gloam's on mainnet; on testnet, Cloak's test vault (Cloak's own copy of Gloam's open-source vault). */
  gloamVault: Address;
  memoBoard: Address;
  /** CloakLaunchVault: Gloam's code and keys, launch tokens admitted when their launch settles. */
  launchVault: Address;
  /** First block to scan Gloam's vault from (and the launch vault, unless launchVaultBlock is set). */
  block: bigint;
  /** First block to scan the launch vault from, when it was deployed later than Gloam's vault. */
  launchVaultBlock?: bigint;
  launchSwap?: Address;
  /** CloakLaunchSwapV4: private swaps through Cloak launches' own Uniswap v4 pools. */
  launchSwapV4?: Address;
  /**
   * CloakRouterV4. When set, HYPE lives in Gloam's vault and launch tokens in the launch vault: buys and sells go through
   * it. Unset, HYPE stays in the launch vault and trades through launchSwapV4.
   */
  router?: Address;
  /** CloakEcosystemVault: admitted outside tokens (KNTQ, ...), traded through `router`; and its deploy block. */
  ecosystemVault?: Address;
  ecosystemVaultBlock?: bigint;
  /** CloakGloamBatcher: batch rounds through Uniswap V2 pairs. */
  batcher?: Address;
  /** CloakGloamBatcherV4: batch rounds through launches' own v4 pools; the keeper registers each settled launch. */
  batcherV4?: Address;
  /** CloakGloamReceive: receive addresses. */
  receive?: Address;
  /** CloakGloamBids on the launch vault: sealed bids from the private balance. */
  bids?: Address;
  fundsGate?: Address;
  receiptCheck?: Address;
  /** The WHYPE the launch swap trades through. */
  whype: Address;
  /** True while any of these are test stand-ins (launch factory, WHYPE, V2 pool), as in the Nov 8 live run. */
  standIns?: boolean;
}

export const deployments: Record<number, CloakDeployment> = {
  // Cloak v2 on Elysium testnet. The factory, hook and config were redeployed on Nov 13 after the GLOAK audit fixes, from
  // the testnet main wallet (docs/TESTNET-REDEPLOY.md, deployments/elysium-testnet-v2-factory.json); the drops are from
  // Nov 12. `gloamVault` here is Cloak's test vault: Cloak's own copy of Gloam's open-source vault code, testnet only and
  // run by Cloak, not Gloam's (deployments/elysium-testnet-test-vault.json), with HYPE, USDC and a test KNTQ at mainnet's
  // limits; Cloak's launch vault and escrows are deployed around it (deployments/elysium-testnet-gloam.json). On mainnet
  // `gloamVault` is Gloam's own vault.
  99801: {
    chainId: 99801,
    config: "0x716eb18ec96b21a134b8affe0daa6fa968bbb1a3",
    factory: "0x395db13360cf54d3dbc583a68ca956a407aef4d4",
    factoryBlock: 28280297n,
    poolManager: "0x51027076df8416e42ea8438b27a0c433d9662e68",
    v4Hook: "0x04295229378E13f8bddE3014089b2C6625806A80",
    whype: "0xe44b27113D4b947c0B1bDf4a93878D0e115f4bdD",
    relayerUrl: "https://cloak-testnet-keeper.onrender.com",
    // v2's own NFT drop contracts (Nov 12, deployments/elysium-testnet-drops.json): sealed drops, WL spot sales and
    // escrow drops on v2's config. Nothing is shared with Cloak v1.
    dropFactory: "0x7981e75475ede391153adcbee7ff876923afefe5",
    dropFactoryBlock: 28037996n,
    spotBook: "0x8da43271d9fd55c6bebc03372f17dc0d021175f7",
    escrowDropFactory: "0xac4cc1fe9dd62a9a8101fa763a11f3a4530a3ec3",
    // in Gloam's vault: Elysium testnet USDC (bridged from Circle's USDC on HyperEVM) and a test KNTQ (KNTQ has no
    // contract on testnet; anyone can mint this one). Neither has a HYPE pool on testnet, so both are held, sent and
    // withdrawn privately but not traded.
    assets: [
      { symbol: "USDC", token: "0x7D29d8047B905000459c0E80c34a26CeedcB47b2", decimals: 6 },
      { symbol: "KNTQ", token: "0x2bd92af06c47a8ad26101a7e2084aff66b5f2c1f", decimals: 18 },
    ],
    gloam: {
      gloamVault: "0x3ABB2f659c1d203E18C8E8FeEf914D0DAc946370",
      memoBoard: "0x0ffd9BC4767b5082409615e842CD7F0adC570B44",
      block: 28255692n,
      launchVault: "0x30d8857a6d988577ab0206c0a782958e22cbcd3c",
      launchVaultBlock: 28280687n,
      launchSwapV4: "0xb8a7d9956c8c6af1829a6f61e30928ed52bd9a52",
      // set since Nov 13: the stand-in takes HYPE, so HYPE is held in Gloam's vault and buys and sells go through the
      // router, as on mainnet
      router: "0x987e7deca86081e459e1a86a31695bf9f917f4c8",
      ecosystemVault: "0x4ed9b20cd16a0de1c94c056eb709de0c1a866bd9",
      ecosystemVaultBlock: 28280687n,
      batcherV4: "0x9b58c5365d79fb65ab8cb8796616d80c7e6ae903",
      receive: "0x5b67d9b3ea70d8d4da158af28772428d4cadc1f2",
      bids: "0x7ee58219cf84b5a378279d5f10fc1369e13795c3",
      fundsGate: "0x45bdb2ff14325342639cea193a7f92c87fa14019",
      receiptCheck: "0x1d27fd681756fe9c72fd0ec4d6b4a18cf312f64d",
      whype: "0xe44b27113D4b947c0B1bDf4a93878D0e115f4bdD",
    },
  },
};

/** The Cloak deployment on `chainId`, or an error naming the chains Cloak is on. */
export function deploymentFor(chainId: number): CloakDeployment {
  const d = deployments[chainId];
  if (!d) throw new Error(`Cloak isn't deployed on chain ${chainId} (available: ${Object.keys(deployments).join(", ")})`);
  return d;
}
