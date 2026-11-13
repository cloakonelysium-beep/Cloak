// Rebuilds deployments/<name>.json for a launch factory whose deploy sent every transaction but stopped before writing
// its record (Nov 13, mainnet: an RPC read failed during the read-back). Reads only, sends nothing, needs no key.
// Starts from the config's address, finds the factory, hook and vesting deployer from the chain, runs the same read-back
// checks as deploy-v2-factory.mjs against the deploy config (with retries), then writes the record.
//
//   node e2e-gloam/recover-v2-factory.mjs --config deployments/elysium-mainnet-v2-factory.input.json --cloak-config 0x… --deployer 0x… [--spent <HYPE>]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, http, zeroAddress } from "viem";
import { cloakConfigAbi, cloakFactoryAbi, cloakV4HookAbi } from "@cloakely/sdk";
import { REPO } from "./lib.mjs";

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const isAddr = (v) => /^0x[0-9a-fA-F]{40}$/.test(v ?? "");
const cfgPath = arg("--config");
const config = arg("--cloak-config");
const deployer = arg("--deployer");
if (!cfgPath || !isAddr(config) || !isAddr(deployer)) throw new Error("usage: --config <factory input> --cloak-config <CloakConfig address> --deployer <deployer address> [--spent <HYPE>]");
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
const out = join(REPO, `deployments/${cfg.name}.json`);
if (existsSync(out)) throw new Error(`${out} already exists: nothing to recover`);
const pub = createPublicClient({ transport: http(cfg.rpcUrl, { retryCount: 6, retryDelay: 1500 }) });
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const HOOK_FLAGS = (1n << 13n) | (1n << 11n) | (1n << 9n) | (1n << 7n);
// a read that's asked again when a node behind the load balancer answers badly
const rd = async (address, abi, functionName, args = []) => {
  for (let i = 0; ; i++) {
    try {
      return await pub.readContract({ address, abi, functionName, args });
    } catch (e) {
      if (i >= 5) throw e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
};
const ok = (cond, what) => {
  if (!cond) throw new Error(`check failed: ${what}`);
  console.log(`  ok   ${what}`);
};

if ((await pub.getChainId()) !== cfg.chainId) throw new Error("wrong chain");
const C = cloakConfigAbi, F = cloakFactoryAbi, H = cloakV4HookAbi;
const n = Number(await rd(config, C, "launchFactoriesCount"));
ok(n === 1, `the config has one launch factory (${n})`);
const factory = await rd(config, C, "launchFactories", [0n]);
const [hook, vd, fConfig, fTimed] = await Promise.all([rd(factory, F, "seeder"), rd(factory, F, "vestingDeployer"), rd(factory, F, "config"), rd(factory, F, "timedLocks")]);
ok(same(fConfig, config) && fTimed === false, "factory → config, no timed locks");
const [pm, hFac, hTimed, baseFee, startFee, decaySecs] = await Promise.all(["poolManager", "factory", "timedLocks", "baseFee", "startFee", "decaySecs"].map((f) => rd(hook, H, f)));
ok(same(pm, cfg.poolManager), "hook → Uniswap's PoolManager");
ok(same(hFac, factory) && hTimed === false, "hook → factory, no timed locks");
ok((BigInt(hook) & 0x3fffn) === HOOK_FLAGS, "hook address has the right permission bits");
ok(Number(baseFee) === cfg.hook.baseFee && Number(startFee) === cfg.hook.startFee && Number(decaySecs) === cfg.hook.decaySecs, `hook fees ${baseFee} / ${startFee} / ${decaySecs}s`);
const [fee, rec, setup, lim, limitsOn, floors, owner, pending, verifier] = await Promise.all(["launchFeeBps", "feeRecipient", "setupMode", "auctionLimit", "depositLimitsOn", "launchFloors", "owner", "pendingOwner", "verifier"].map((f) => rd(config, C, f)));
ok(Number(fee) === cfg.launchFeeBps, `launch fee ${fee} bps`);
ok(same(rec, cfg.treasury), "fees go to the treasury");
ok(setup === false, "setup ended");
ok(limitsOn === true && lim[0] === BigInt(cfg.perBid) && lim[1] === BigInt(cfg.total), "bid caps 100 / 10,000 HYPE, on");
ok(floors[0] === BigInt(cfg.launchFloors.minRaise) && Number(floors[1]) === cfg.launchFloors.minLpBps, "launch floors");
ok(same(verifier, cfg.vaultVerifier), "verifier field names Gloam's verifier");
ok(same(owner, deployer) && same(pending, cfg.owner), "ownership offered to the owner wallet (it accepts next)");
const door = await rd(vd, [{ type: "function", name: "owner", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" }], "owner").catch(() => null);
if (door) ok(same(door, cfg.owner), "the vesting deployer's door belongs to the owner wallet");
// the factory's deploy block: the first block with its code
let lo = 0n, hi = await pub.getBlockNumber();
while (lo < hi) {
  const mid = (lo + hi) / 2n;
  if (((await pub.getCode({ address: factory, blockNumber: mid })) ?? "0x") === "0x") lo = mid + 1n;
  else hi = mid;
}
console.log(`  factory deployed in block ${lo}`);

const rec2 = {
  chainId: cfg.chainId,
  note: "Cloak v2's own launch factory (v2's launches, apart from Cloak v1's). CloakConfig v2 holds the launch fee, treasury and bid caps; its verifier field names Gloam's verifier and is unused (v2 has no Cloak vaults).",
  config,
  factory,
  factoryBlock: Number(lo),
  v4Hook: hook,
  poolManager: cfg.poolManager,
  vestingDeployer: vd,
  launchFeeBps: Number(fee),
  auctionLimit: { perBid: String(lim[0]), total: String(lim[1]), on: limitsOn },
  launchFloors: { minRaise: String(floors[0]), minLpBps: Number(floors[1]) },
  treasury: rec,
  hookFees: cfg.hook,
  owner: cfg.owner,
  ownerAccepts: { to: config, data: "0x79ba5097", call: "acceptOwnership()" },
  hookAdmin: deployer,
  ...(arg("--spent") ? { costHype: arg("--spent") } : {}),
  _recovered: "Every transaction of deploy-v2-factory.mjs landed; its read-back hit a failed RPC read, so this record was rebuilt from the chain by recover-v2-factory.mjs with the same checks.",
};
writeFileSync(out, JSON.stringify(rec2, null, 2) + "\n");
console.log(`wrote ${out}\nFrom the owner wallet ${cfg.owner}: a call to ${config}, value 0, data 0x79ba5097 (acceptOwnership()).`);
