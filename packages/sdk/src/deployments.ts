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
  // limits; Cloak's launch vault and escrows are deployed around it (deployments/elysium-testnet-gloam.json). Since Nov 13 the test
  // vault is the one the testnet main wallet deployed and controls; the tester's first copy (0x3ABB…6370) is retired. On mainnet
  // `gloamVault` is Gloam's own vault.
  // Cloak v2 on Elysium mainnet (Nov 13): deployed from the mainnet deployer, every role with the owner wallet
  // (deployments/elysium-mainnet-*.json). Next to Gloam's vault, on the memo board shared with Gloam.
  99901: {
    chainId: 99901,
    config: "0xbf9d133d2be0572c9ab94adcdb2d00ac8f0e3080",
    factory: "0x01BbBA502E4a9bef60F261Cf04d8D04e48F2fB12",
    factoryBlock: 6033579n,
    poolManager: "0xe2e105d3f7209a9da11f83ccf3e7398a753823f1",
    v4Hook: "0x0df8E5771Cad0DEb29b7544b3bDe5A993D342a80",
    whype: "0x6521f9729d6c65e5e743de144f5546f334ea7d15",
    relayerUrl: "https://cloak-mainnet-keeper.onrender.com",
    // v2's own NFT drop contracts on mainnet (Nov 13, deployments/elysium-mainnet-drops.json), on v2's config, no owner
    dropFactory: "0x6b10a7c9873a99d69a68456bfc34b204b85c0ca3",
    dropFactoryBlock: 6039074n,
    spotBook: "0x6c3e17b589c5514b8db61d6533231612f5b012d7",
    escrowDropFactory: "0xa995207204e79459caed54f26580ed3676b0d7d9",
    assets: [{ symbol: "USDC", token: "0xb47c4C8F73F009CC0C0d3f92B388d13E293F0B65", decimals: 6, pool: { fee: 3000, tickSpacing: 60 } }, { symbol: "KNTQ", token: "0xe45a355d9e9cAd2aD85F2d03E3eE3102A036acF0", decimals: 18, pool: { fee: 3000, tickSpacing: 60 } }],
    gloam: {
      gloamVault: "0x89d3042390204f57b8b4F8949D3c2203E4002164",
      memoBoard: "0xb99db19cdeaf3779013a75f2cb7a13d0eecd075a",
      block: 3248495n,
      launchVault: "0x849097aa6081aa9977ceaf30b6d1cd8467b01726",
      launchVaultBlock: 6038202n,
      launchSwapV4: "0xa0aed21d694809ade5b001d413c826ca63247818",
      router: "0x13de29b8801fcaba9d476c68869a4286cf3203b3",
      ecosystemVault: "0x5ab0ecc7cc6654cf1bfc7247cfeee1ab2887046d",
      ecosystemVaultBlock: 6038202n,
      batcherV4: "0xabc13cb154e5c708600d54622bc37fb4ec14b16a",
      receive: "0xe2a8af9c67e63b7be92c3d1cc308496ba5c8ef9e",
      bids: "0x03344099637832bb26922dca9178675244271758",
      fundsGate: "0xdcd44b68626d5b9c6cff317e2f41992481997d91",
      receiptCheck: "0x3909ec2f2e4d1625b4c4348c561eae8cf5b5efb9",
      whype: "0x6521f9729d6c65e5e743de144f5546f334ea7d15",
    },
  },
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
      gloamVault: "0xA5ebd1F2e1F90d957C0459BA0dC892b0189B1678",
      memoBoard: "0x7612118bDE6e371a79A909dF6abCD981e5320cbC",
      block: 28358841n,
      launchVault: "0x0b7b1b12fb05fa433ec157d0d097f20fe1270f56",
      launchVaultBlock: 28359290n,
      launchSwapV4: "0x3a100249a9cd1757fedf7740ffa583cb0300c218",
      // Cloak's test vault takes HYPE, so HYPE is held there and buys and sells go through the router, as on mainnet
      router: "0x79da9a53d719e420b13d260e13061d85b6edc867",
      ecosystemVault: "0x5235f1e5a1c3f284f67ba6361846b71e9f3ea336",
      ecosystemVaultBlock: 28359290n,
      batcherV4: "0x5f96d587364b90da6ef03704c19f688f43759baf",
      receive: "0x11ef5ff51002f7dc1adb7d60b8c569d61486c9f6",
      bids: "0xf356b11b723a2a497b4ffaf83ba2548dbc92bcfb",
      fundsGate: "0xe2e5c9531348197e7913a0464961c7fdd2a23deb",
      receiptCheck: "0xa25ad83921e85d4a6490fb1fc82eeffcaa1162d4",
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
