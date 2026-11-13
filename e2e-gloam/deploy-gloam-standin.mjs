// A stand-in for Gloam's vault on Elysium testnet, until Gloam deploys its own there: Gloam's mainnet vault code,
// unmodified (ShieldPoolPayments on the ceremony's final-key verifiers, behind Gloam's key gate, born under a
// VaultOwnerGuard), deployed by Gloam's own MainnetDeploy._deployMainnetGuarded (contracts-gloam/gloam-root/
// DeployCloakGloam.s.sol), plus Gloam's payment-memo board. Listed: native HYPE, Kinetiq's test USDC and KNTQ.
//
// KNTQ has no contract on Elysium testnet (Kinetiq's mainnet address has no code there), so a test KNTQ is deployed
// first: a plain 18-decimal ERC-20 that anyone can mint (contracts-gloam TestToken). Give `kntq.token` in the config to
// use an existing one instead.
//
// Switching to Gloam's own testnet vault later is one command, with nothing in this file involved:
//   node e2e-gloam/use-gloam-vault.mjs --vault <Gloam's vault> --memo <its memo board>
// then the partner deploy (see that script). This one is only for the stand-in.
//
//   node e2e-gloam/deploy-gloam-standin.mjs --config deployments/elysium-testnet-gloam-standin.input.json --rehearse
//   NODE_USE_ENV_PROXY=1 node e2e-gloam/deploy-gloam-standin.mjs --config deployments/elysium-testnet-gloam-standin.input.json
//
// Key: DEPLOYER_PK, else GLOAM_TESTNET_PK from ../.env. The deploy wallet is the guard's controller only until the
// config's controller accepts (acceptController() on the guard, printed at the end); it keeps nothing else.
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
for (const k of ["poseidon", "usdc", "feeRecipient", "controller"]) if (!isAddr(cfg[k])) throw new Error(`config: ${k} must be an address`);
for (const k of ["hype", "usdcLimits", "kntqLimits"]) if (!cfg[k]?.perDeposit || !cfg[k]?.total) throw new Error(`config: ${k} needs perDeposit and total`);

function envKey() {
  if (process.env.DEPLOYER_PK) return process.env.DEPLOYER_PK;
  const p = join(REPO, ".env");
  const m = existsSync(p) && readFileSync(p, "utf8").match(/^GLOAM_TESTNET_PK=(0x[0-9a-fA-F]{64})\s*$/m);
  return m ? m[1] : null;
}

let rpcUrl = cfg.rpcUrl;
let pk = envKey();
let anvil;
if (REHEARSE) {
  anvil = await startAnvil({ port: 8591, forkUrl: rpcUrl, chainId: cfg.chainId });
  rpcUrl = anvil.rpcUrl;
  pk = ANVIL_KEYS[0];
}
if (!pk) throw new Error("set DEPLOYER_PK, or GLOAM_TESTNET_PK in .env");
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
  for (const k of ["poseidon", "usdc"]) if (((await pub.getCode({ address: cfg[k] })) ?? "0x") === "0x") throw new Error(`${k} ${cfg[k]} has no code on this chain`);
  const start = await pub.getBalance({ address: addr });
  console.log(`Gloam's vault (mainnet code) as a stand-in on ${REHEARSE ? "a fork of " : ""}chain ${cfg.chainId}, from ${addr} (${formatEther(start)} HYPE)`);

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
    note: "Cloak's stand-in for Gloam's vault on Elysium testnet: Gloam's mainnet vault code, unmodified, deployed by Gloam's own guarded mainnet deploy. HYPE, test USDC and test KNTQ listed. Replaced by Gloam's own testnet vault with use-gloam-vault.mjs once there is one.",
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
