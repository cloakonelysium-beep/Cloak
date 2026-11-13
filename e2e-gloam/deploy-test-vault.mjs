// Cloak's test vault on Elysium testnet: Cloak's own copy of Gloam's open-source (MIT) guarded vault, unmodified
// (ShieldPoolPayments on the ceremony's final-key verifiers, behind Gloam's key gate, born under a VaultOwnerGuard),
// deployed by Gloam's own MainnetDeploy._deployMainnetGuarded (contracts-gloam/gloam-root/DeployCloakGloam.s.sol), plus a
// copy of Gloam's payment-memo board. Listed: native HYPE, Kinetiq's test USDC and a test KNTQ.
//
// Testnet only, and never called Gloam's anywhere users see it: that's what Gloam asked when they agreed to it (Nov 13).
// On mainnet Cloak uses Gloam's own vault.
//
// KNTQ has no contract on Elysium testnet, so `kntq.token` names a test KNTQ (deployed Nov 13, anyone can mint); leave
// it out to deploy a fresh one.
//
// Then point Cloak at it and redeploy the partner contracts around it (they take the vault at deploy):
//   node e2e-gloam/use-gloam-vault.mjs --vault <vault> --memo <memo board> --block <block>
//   NODE_USE_ENV_PROXY=1 node e2e-gloam/deploy-partner.mjs --config deployments/elysium-testnet-gloam.input.json
//
//   node e2e-gloam/deploy-test-vault.mjs --config deployments/elysium-testnet-test-vault.input.json --rehearse
//   NODE_USE_ENV_PROXY=1 node e2e-gloam/deploy-test-vault.mjs --config deployments/elysium-testnet-test-vault.input.json
//
// Key: DEPLOYER_PK, which must be the config's `deployer` (the testnet main wallet). The deploy wallet is also the
// guard's controller (the config's `controller`), so nothing waits on an acceptance.
// Writes deployments/<name>.json (not on a rehearsal).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatEther, parseAbi, zeroAddress } from "viem";
import { ANVIL_KEYS, REPO, clients, deployGloamStack, ourArtifact, sendAndLog, startAnvil } from "./lib.mjs";

const REHEARSE = process.argv.includes("--rehearse");
const ci = process.argv.indexOf("--config");
if (ci < 0) throw new Error("--config <file> is required");
const cfg = JSON.parse(readFileSync(process.argv[ci + 1], "utf8"));
const isAddr = (v) => /^0x[0-9a-fA-F]{40}$/.test(v ?? "");
for (const k of ["poseidon", "usdc", "feeRecipient", "controller", "deployer"]) if (!isAddr(cfg[k])) throw new Error(`config: ${k} must be an address`);
for (const k of ["hype", "usdcLimits", "kntqLimits"]) if (!cfg[k]?.perDeposit || !cfg[k]?.total) throw new Error(`config: ${k} needs perDeposit and total`);

function envKey() {
  return process.env.DEPLOYER_PK ?? null;
}

let rpcUrl = cfg.rpcUrl;
let pk = envKey();
let anvil;
if (REHEARSE) {
  anvil = await startAnvil({ port: 8591, forkUrl: rpcUrl, chainId: cfg.chainId });
  rpcUrl = anvil.rpcUrl;
  pk = ANVIL_KEYS[0];
}
if (!pk) throw new Error("set DEPLOYER_PK (the testnet main wallet's key)");
const me = clients(rpcUrl, pk, cfg.chainId);
const pub = me.pub;
const addr = me.account.address;
const ERC20 = parseAbi(["function symbol() view returns (string)", "function decimals() view returns (uint8)"]);
const VAULT = parseAbi([
  "function owner() view returns (address)",
  "function setupMode() view returns (bool)",
  "function depositLimitsOn() view returns (bool)",
  "function depositLimit(address) view returns (uint128 perDeposit, uint128 total)",
  "function verifier() view returns (address)",
  "function shieldVerifier() view returns (address)",
  "function poseidon2() view returns (address)",
  "function withdrawFeeBps() view returns (uint16)",
  "function feeRecipient() view returns (address)",
]);
const GUARD = parseAbi(["function controller() view returns (address)", "function pendingController() view returns (address)", "function vault() view returns (address)"]);
const same = (a, b) => a.toLowerCase() === b.toLowerCase();

try {
  if ((await pub.getChainId()) !== cfg.chainId) throw new Error(`the RPC is chain ${await pub.getChainId()}, the config says ${cfg.chainId}`);
  if (!REHEARSE && addr.toLowerCase() !== cfg.deployer.toLowerCase()) throw new Error(`DEPLOYER_PK is ${addr}, the config expects ${cfg.deployer}`);
  if (cfg.chainId !== 99801) throw new Error("Cloak's test vault is for Elysium testnet (99801) only");
  for (const k of ["poseidon", "usdc"]) if (((await pub.getCode({ address: cfg[k] })) ?? "0x") === "0x") throw new Error(`${k} ${cfg[k]} has no code on this chain`);
  const start = await pub.getBalance({ address: addr });
  console.log(`Cloak's test vault (Gloam's open-source vault code) on ${REHEARSE ? "a fork of " : ""}chain ${cfg.chainId}, from ${addr} (${formatEther(start)} HYPE)`);

  // KNTQ: the given token, or a test one
  let kntq = cfg.kntq?.token;
  if (!kntq) {
    const r = await sendAndLog(pub, "deploy test KNTQ", me.wallet.deployContract({ ...ourArtifact("TestToken.sol", "TestToken"), args: [cfg.kntq?.name ?? "Kinetiq (test)", "KNTQ", 18] }));
    kntq = r.contractAddress;
  }
  const kSym = await pub.readContract({ address: kntq, abi: ERC20, functionName: "symbol" });
  const kDec = await pub.readContract({ address: kntq, abi: ERC20, functionName: "decimals" });
  if (kSym !== "KNTQ" || kDec !== 18) throw new Error(`KNTQ at ${kntq} reads ${kSym}/${kDec}`);

  const assets = [
    { symbol: "HYPE", address: zeroAddress, perDeposit: BigInt(cfg.hype.perDeposit), total: BigInt(cfg.hype.total) },
    { symbol: "USDC", address: cfg.usdc, perDeposit: BigInt(cfg.usdcLimits.perDeposit), total: BigInt(cfg.usdcLimits.total) },
    { symbol: "KNTQ", address: kntq, perDeposit: BigInt(cfg.kntqLimits.perDeposit), total: BigInt(cfg.kntqLimits.total) },
  ];
  const before = await pub.getBlockNumber(); // the vault is deployed after this block: its tree starts here
  const stack = await deployGloamStack({ rpcUrl, pk, poseidon: cfg.poseidon, assets, feeBps: cfg.withdrawFeeBps ?? 50, feeRecipient: cfg.feeRecipient, controller: cfg.controller });

  // read everything back
  const rd = (address, abi, functionName, args = []) => pub.readContract({ address, abi, functionName, args });
  const checks = {
    "the guard owns the vault": same(await rd(stack.pool, VAULT, "owner"), stack.guard),
    "setup is over (rules change only through the guard's 3-day queue)": (await rd(stack.pool, VAULT, "setupMode")) === false,
    "deposit limits are on": await rd(stack.pool, VAULT, "depositLimitsOn"),
    "the guard names this vault": same(await rd(stack.guard, GUARD, "vault"), stack.pool),
    "control is offered to the config's controller": same(await rd(stack.guard, GUARD, "pendingController"), cfg.controller) || same(await rd(stack.guard, GUARD, "controller"), cfg.controller),
    "Poseidon is the one given": same(await rd(stack.pool, VAULT, "poseidon2"), cfg.poseidon),
    "the proof checker is the deploy's final-key one": same(await rd(stack.pool, VAULT, "verifier"), stack.dual),
    "the deposit proof checker is the deploy's final-key one": same(await rd(stack.pool, VAULT, "shieldVerifier"), stack.shieldVerifier),
    "the cash-out fee is as configured": (await rd(stack.pool, VAULT, "withdrawFeeBps")) === (cfg.withdrawFeeBps ?? 50) && same(await rd(stack.pool, VAULT, "feeRecipient"), cfg.feeRecipient),
  };
  for (const a of assets) {
    const [p, t] = await rd(stack.pool, VAULT, "depositLimit", [a.address]);
    checks[`${a.symbol} listed at ${a.perDeposit} / ${a.total}`] = p === a.perDeposit && t === a.total;
  }
  for (const [k, ok] of Object.entries(checks)) console.log(`  ${ok ? "ok  " : "FAIL"} ${k}`);
  if (Object.values(checks).some((ok) => !ok)) throw new Error("a check failed");

  const end = await pub.getBalance({ address: addr });
  const out = {
    chainId: cfg.chainId,
    note: "Cloak's test vault on Elysium testnet: Cloak's own copy of Gloam's open-source (MIT) vault, unmodified, deployed by Gloam's own guarded deploy routine. Testnet only and run by Cloak; not Gloam's vault. HYPE, test USDC and test KNTQ listed.",
    deployer: addr,
    gloamVault: stack.pool,
    gloamVaultBlock: Number(before),
    _gloamVaultBlock: "The block just before the vault's deploy: apps rebuild its tree from here.",
    guard: stack.guard,
    guardController: { now: await rd(stack.guard, GUARD, "controller"), pending: await rd(stack.guard, GUARD, "pendingController") },
    memoBoard: stack.payMemo,
    poseidon: cfg.poseidon,
    verifier: stack.dual,
    shieldVerifier: stack.shieldVerifier,
    withdrawFee: { bps: cfg.withdrawFeeBps ?? 50, recipient: cfg.feeRecipient },
    assets: assets.map((a) => ({ symbol: a.symbol, token: a.address, perDeposit: a.perDeposit.toString(), total: a.total.toString() })),
    kntqIsTest: !cfg.kntq?.token,
    costHype: formatEther(start - end),
  };
  console.log(JSON.stringify(out, null, 1));
  if (!same(out.guardController.now, cfg.controller)) console.log(`\nNext, from ${cfg.controller}: acceptController() on the guard, a call to ${stack.guard}, value 0, data 0x9bc21c0c`);
  console.log(`To use it: node e2e-gloam/use-gloam-vault.mjs --vault ${stack.pool} --memo ${stack.payMemo} --block ${before}`);
  if (!REHEARSE) {
    writeFileSync(join(REPO, `deployments/${cfg.name}.json`), JSON.stringify(out, null, 1) + "\n");
    console.log(`wrote deployments/${cfg.name}.json`);
  }
} finally {
  anvil?.stop();
}
