// Cloak v2's own NFT drop contracts: CloakDropFactory (sealed NFT drops), CloakSpotBook (WL spot sales on those drops)
// and CloakEscrowDropFactory (sealed auctions of NFTs that already exist). All three point at v2's CloakConfig, so drop
// fees go to v2's treasury, and none of them has an owner or admin: the deploy wallet keeps no control.
// Until Nov 12 v2's testnet record pointed at Cloak v1's drop contracts (v1's config, v1's metadata domain). This
// gives v2 its own, so v1 and v2 share nothing.
//
// Built from this repo's compiled contracts (contracts/out: run forge build in contracts first).
//
//   node e2e-gloam/deploy-drops.mjs --config deployments/elysium-testnet-drops.input.json --rehearse   # a fork, writes nothing
//   NODE_USE_ENV_PROXY=1 DEPLOYER_PK=… node e2e-gloam/deploy-drops.mjs --config deployments/elysium-testnet-drops.input.json
//
// The config: { name, chainId, rpcUrl, config (v2's CloakConfig), defaultBaseURI, deployer (the wallet expected to send
// it, checked) }. Writes deployments/<name>.json (not on a rehearsal) and prints the SDK lines.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatEther, parseAbi } from "viem";
import { ANVIL_KEYS, REPO, clients, refuseRedeploy, sendAndLog, startAnvil } from "./lib.mjs";

const REHEARSE = process.argv.includes("--rehearse");
const i = process.argv.indexOf("--config");
if (i < 0) throw new Error("--config <file> is required");
const cfg = JSON.parse(readFileSync(process.argv[i + 1], "utf8"));
// "factoryRecord": v2's config comes from the record deploy-v2-factory.mjs wrote, so mainnet needs no hand edit
if (cfg.factoryRecord) cfg.config = JSON.parse(readFileSync(join(REPO, cfg.factoryRecord), "utf8")).config;
const isAddr = (v) => /^0x[0-9a-fA-F]{40}$/.test(v ?? "");
for (const k of ["config", "deployer"]) if (!isAddr(cfg[k])) throw new Error(`config: ${k} must be an address`);
if (!/^https:\/\/.+\/$/.test(cfg.defaultBaseURI ?? "")) throw new Error("config: defaultBaseURI must be an https URL ending in /");

const art = (file, name) => {
  const j = JSON.parse(readFileSync(join(REPO, "contracts/out", file, `${name}.json`), "utf8"));
  return { abi: j.abi, bytecode: j.bytecode.object };
};

let rpcUrl = cfg.rpcUrl;
let pk = process.env.DEPLOYER_PK;
let anvil;
if (REHEARSE) {
  anvil = await startAnvil({ port: 8583, forkUrl: rpcUrl, chainId: cfg.chainId });
  rpcUrl = anvil.rpcUrl;
  pk = ANVIL_KEYS[0];
}
if (!pk) throw new Error("set DEPLOYER_PK (the testnet main wallet's key)");
const me = clients(rpcUrl, pk, cfg.chainId);
const pub = me.pub;
const addr = me.account.address;
try {
  if ((await pub.getChainId()) !== cfg.chainId) throw new Error(`the RPC is chain ${await pub.getChainId()}, the config says ${cfg.chainId}`);
  if (!REHEARSE && addr.toLowerCase() !== cfg.deployer.toLowerCase()) throw new Error(`DEPLOYER_PK is ${addr}, the config expects ${cfg.deployer}`);
  await refuseRedeploy(pub, join(REPO, `deployments/${cfg.name}.json`), ["dropFactory", "spotBook", "escrowDropFactory"], REHEARSE);
  // the config must be v2's: a live CloakConfig with an owner
  const owner = await pub.readContract({ address: cfg.config, abi: parseAbi(["function owner() view returns (address)"]), functionName: "owner" });
  const start = await pub.getBalance({ address: addr });
  console.log(`v2 drop contracts from ${addr} (${formatEther(start)} HYPE)${REHEARSE ? " on a fork" : ""}; config ${cfg.config} (owner ${owner})`);

  const deploy = async (label, a, args) => (await sendAndLog(pub, `deploy ${label}`, me.wallet.deployContract({ ...a, args })));
  const f = await deploy("CloakDropFactory", art("CloakDrop.sol", "CloakDropFactory"), [cfg.config, cfg.defaultBaseURI]);
  const dropFactory = f.contractAddress;
  const spotBook = (await deploy("CloakSpotBook", art("CloakSpotBook.sol", "CloakSpotBook"), [dropFactory])).contractAddress;
  const escrowDropFactory = (await deploy("CloakEscrowDropFactory", art("CloakEscrowDrop.sol", "CloakEscrowDropFactory"), [cfg.config])).contractAddress;

  // read back what each one points at
  const rd = (address, sig, fn) => pub.readContract({ address, abi: parseAbi([sig]), functionName: fn });
  const checks = {
    "drop factory config": (await rd(dropFactory, "function config() view returns (address)", "config")).toLowerCase() === cfg.config.toLowerCase(),
    "drop factory metadata": (await rd(dropFactory, "function defaultBaseURI() view returns (string)", "defaultBaseURI")) === cfg.defaultBaseURI,
    "spot book factory": (await rd(spotBook, "function factory() view returns (address)", "factory")).toLowerCase() === dropFactory.toLowerCase(),
    "escrow factory config": (await rd(escrowDropFactory, "function config() view returns (address)", "config")).toLowerCase() === cfg.config.toLowerCase(),
  };
  for (const [k, ok] of Object.entries(checks)) console.log(`  ${ok ? "ok  " : "FAIL"} ${k}`);
  if (Object.values(checks).some((ok) => !ok)) throw new Error("a check failed");

  const end = await pub.getBalance({ address: addr });
  const out = {
    chainId: cfg.chainId,
    note: "Cloak v2's own NFT drop contracts, on v2's CloakConfig. No owner or admin on any of them.",
    deployer: addr,
    config: cfg.config,
    defaultBaseURI: cfg.defaultBaseURI,
    dropFactory,
    dropFactoryBlock: Number(f.blockNumber),
    spotBook,
    escrowDropFactory,
    costHype: formatEther(start - end),
  };
  console.log(JSON.stringify(out, null, 1));
  console.log(`\nSDK (packages/sdk/src/deployments.ts, chain ${cfg.chainId}):\n    dropFactory: "${dropFactory}",\n    dropFactoryBlock: ${f.blockNumber}n,\n    spotBook: "${spotBook}",\n    escrowDropFactory: "${escrowDropFactory}",`);
  if (!REHEARSE) {
    writeFileSync(join(REPO, `deployments/${cfg.name}.json`), JSON.stringify(out, null, 1) + "\n");
    console.log(`wrote deployments/${cfg.name}.json`);
  }
} finally {
  anvil?.stop();
}
