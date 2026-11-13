// The payment-memo board on Elysium mainnet: Gloam's GloamPayMemo, unchanged, deployed by Cloak and shared by both apps
// (Gloam's CEO, Nov 12: Cloak deploys it and sends Gloam the address and deploy block; Gloam checks the bytecode and
// points their app at the same board). It has no owner and no settings: anyone posts sealed memos, nobody can change it.
//
// Built from vendor/gloam/contracts with Gloam's own settings, so its runtime code matches their build. Checks the deployed
// code against that build, then writes `memoBoard` and `memoBoardBlock` into the partner config, ready for deploy-partner.
//
//   node e2e-gloam/deploy-memo.mjs --config deployments/elysium-mainnet-gloam.input.json --rehearse   # a fork, writes nothing
//   NODE_USE_ENV_PROXY=1 DEPLOYER_PK=… node e2e-gloam/deploy-memo.mjs --config deployments/elysium-mainnet-gloam.input.json --deployer 0x…
//
// --deployer: the address DEPLOYER_PK must be (the mainnet deployer in docs/WALLETS.md). Runs once: it stops if the
// config already names a board with code on chain.
import { readFileSync, writeFileSync } from "node:fs";
import { formatEther, keccak256 } from "viem";
import { ANVIL_KEYS, clients, gloamArtifact, sendAndLog, startAnvil } from "./lib.mjs";

const REHEARSE = process.argv.includes("--rehearse");
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const cfgPath = arg("--config");
if (!cfgPath) throw new Error("--config <partner config> is required");
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
const isAddr = (v) => /^0x[0-9a-fA-F]{40}$/.test(v ?? "");
const expect = arg("--deployer");
if (!REHEARSE && !isAddr(expect)) throw new Error("--deployer <address> is required (the deployer wallet DEPLOYER_PK must be)");

let rpcUrl = cfg.rpcUrl;
let pk = process.env.DEPLOYER_PK;
let anvil;
if (REHEARSE) {
  anvil = await startAnvil({ port: 8597, forkUrl: rpcUrl, chainId: cfg.chainId });
  rpcUrl = anvil.rpcUrl;
  pk = ANVIL_KEYS[0];
}
if (!pk) throw new Error("set DEPLOYER_PK");
const me = clients(rpcUrl, pk, cfg.chainId);
const pub = me.pub;
const addr = me.account.address;
try {
  if ((await pub.getChainId()) !== cfg.chainId) throw new Error(`the RPC is chain ${await pub.getChainId()}, the config says ${cfg.chainId}`);
  if (!REHEARSE && addr.toLowerCase() !== expect.toLowerCase()) throw new Error(`DEPLOYER_PK is ${addr}, --deployer says ${expect}`);
  if (!REHEARSE && isAddr(cfg.memoBoard) && ((await pub.getCode({ address: cfg.memoBoard })) ?? "0x") !== "0x") {
    throw new Error(`the config already names a memo board with code on chain (${cfg.memoBoard}). Nothing was sent.`);
  }
  const art = gloamArtifact("GloamPayMemo.sol", "GloamPayMemo");
  const start = await pub.getBalance({ address: addr });
  console.log(`GloamPayMemo (Gloam's, unchanged) on ${REHEARSE ? "a fork of " : ""}chain ${cfg.chainId}, from ${addr} (${formatEther(start)} HYPE)`);
  const r = await sendAndLog(pub, "deploy GloamPayMemo", me.wallet.deployContract({ abi: art.abi, bytecode: art.bytecode }));
  const board = r.contractAddress;
  const code = await pub.getCode({ address: board });
  const built = JSON.parse(readFileSync(new URL("../vendor/gloam/contracts/out/GloamPayMemo.sol/GloamPayMemo.json", import.meta.url), "utf8")).deployedBytecode.object;
  if (keccak256(code) !== keccak256(built)) throw new Error("the deployed code doesn't match Gloam's build");
  const end = await pub.getBalance({ address: addr });
  console.log(`  ok   runtime code matches Gloam's build (keccak ${keccak256(code)})`);
  console.log(`  memo board ${board}, block ${r.blockNumber}, cost ${formatEther(start - end)} HYPE`);
  console.log(`  send Gloam: address ${board}, deploy block ${r.blockNumber}, runtime code hash ${keccak256(code)}`);
  if (!REHEARSE) {
    cfg.memoBoard = board;
    cfg.memoBoardBlock = Number(r.blockNumber);
    cfg._memoBoard = `GloamPayMemo, Gloam's code unchanged, deployed by Cloak's deployer ${addr} at block ${r.blockNumber} (deploy-memo.mjs); shared with Gloam's app.`;
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
    console.log(`wrote memoBoard into ${cfgPath}`);
  }
} finally {
  anvil?.stop();
}
