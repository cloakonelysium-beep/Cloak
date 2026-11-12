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
  /** CloakDropFactory: sealed NFT drops (wallet bids, shared with Cloak v1). */
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
  // Cloak v2 on Elysium testnet, redeployed Nov 12, 2026 with the new testnet wallets (docs/WALLETS.md,
  // docs/TESTNET-REDEPLOY.md): deployments/elysium-testnet-v2-factory.json and deployments/elysium-testnet-gloam.json.
  // Gloam's vault and memo board are the earlier stand-in for Gloam's own; everything else is new.
  99801: {
    chainId: 99801,
    config: "0x31337213cab071c28eed8b2256c5658c9de8a9ba",
    factory: "0xb9060dc9c5dcd49d424b0257b3a8b1a2939271d7",
    factoryBlock: 27930789n,
    poolManager: "0x51027076df8416e42ea8438b27a0c433d9662e68",
    v4Hook: "0x822c91E71BC5a63Ef2C38bc37cea6ff443CD2a80",
    whype: "0xe44b27113D4b947c0B1bDf4a93878D0e115f4bdD",
    relayerUrl: "https://cloak-testnet-keeper.onrender.com",
    // shared with Cloak v1, not redeployed: sealed NFT drops (Nov 3), WL spot sales and escrow drops
    dropFactory: "0x2afb7d9a5baa02a2d72a7c761521fc66dce9d783",
    dropFactoryBlock: 22329730n,
    spotBook: "0x91806d96814cc205d4b642e280023a1c7b361fc8",
    escrowDropFactory: "0x5f3efbfd5d15440947abfbfce7f2fcfffff71079",
    // Elysium testnet USDC (bridged from Circle's USDC on HyperEVM), in Gloam's vault
    assets: [{ symbol: "USDC", token: "0x7D29d8047B905000459c0E80c34a26CeedcB47b2", decimals: 6 }],
    gloam: {
      gloamVault: "0x8D15BA46071D5AB2e59d746c22d51C906281cB44",
      memoBoard: "0xf6816854b68CC4B67213289927d8e44050BA62D3",
      block: 26230337n,
      launchVault: "0xef42cf8f73b43764cd4c3ad97fb8c276975c84e7",
      launchVaultBlock: 27931042n,
      launchSwapV4: "0x285c456ce62369bdf439376e1a66b262a0122e84",
      // CloakRouterV4 0x043f5a420ad1131cf6a9067e05474749f39191f6 is deployed but left unset here: the stand-in Gloam vault
      // takes no HYPE (limit 0, checked Nov 12), so HYPE stays in the launch vault and trades through launchSwapV4.
      // Mainnet sets router (Gloam's vault lists HYPE).
      ecosystemVault: "0xaa0647ff29eb093627a7ab5c765b08888ad15cbf",
      ecosystemVaultBlock: 27931042n,
      batcherV4: "0x1ea4da6c117ebe0886b13517363d1a1fede72249",
      receive: "0xbc5e58de65e4877c53d74cde3d76d702210568c9",
      bids: "0x270c5401b97b1cd97c83dfbecc5ebb4534fa81ae",
      fundsGate: "0x3d2fd839cfe760242c1d26b41944c809c0be60fc",
      receiptCheck: "0x2c149f9de5f9d6d1b07ce1237be2654c9ca7a495",
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
