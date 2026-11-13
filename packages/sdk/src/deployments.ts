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
  /** Gloam's vault, or Cloak's own instance of Gloam's guarded deploy until Gloam's is live on this chain. */
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
  // Cloak v2 on Elysium testnet. The factory, hook and drops are from Nov 12 (docs/WALLETS.md, docs/TESTNET-REDEPLOY.md,
  // deployments/elysium-testnet-v2-factory.json). Gloam's vault is Cloak's stand-in running Gloam's mainnet vault code
  // (Nov 13, deployments/elysium-testnet-gloam-standin.json) with HYPE, USDC and a test KNTQ listed, as Gloam's mainnet
  // vault will have them; Cloak's launch vault and escrows around it are from the same day
  // (deployments/elysium-testnet-gloam.json). Gloam's own testnet vault replaces the stand-in with use-gloam-vault.mjs.
  99801: {
    chainId: 99801,
    config: "0x31337213cab071c28eed8b2256c5658c9de8a9ba",
    factory: "0xb9060dc9c5dcd49d424b0257b3a8b1a2939271d7",
    factoryBlock: 27930789n,
    poolManager: "0x51027076df8416e42ea8438b27a0c433d9662e68",
    v4Hook: "0x822c91E71BC5a63Ef2C38bc37cea6ff443CD2a80",
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
      launchVault: "0xe3847f0140bdc06629b2b30a770f393e080f30b2",
      launchVaultBlock: 28256098n,
      launchSwapV4: "0xa022edbe332f433ab8bc081b228c8a1d9bad98b6",
      // set now (unset before Nov 13): the stand-in takes HYPE, so HYPE is held in Gloam's vault and buys and sells go
      // through the router, as on mainnet
      router: "0x6f67078181752ed9f312d51e2fd7f787564a86bf",
      ecosystemVault: "0x95d9073ec1840dabe4de4b9cbebdfe6bdc86706f",
      ecosystemVaultBlock: 28256098n,
      batcherV4: "0xc2c642bfbd0ad192df272c7e7486696de2355e1f",
      receive: "0x88eb84e9d8f2e59a73c41b198d32eeac84c5c7e4",
      bids: "0x83430908906887d4b9ec920b0a90193b479b15f6",
      fundsGate: "0xccbd5f8fe8b3a796f2eaedc010189349e61278f6",
      receiptCheck: "0xe57a30d49842966605912dd9ed76a08635cdaf32",
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
