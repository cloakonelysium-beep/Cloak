// Points Cloak's testnet at a vault on Gloam's code: Cloak's test vault (deploy-test-vault.mjs), or Gloam's own testnet
// vault once it exists. Only the vault's address is needed: its verifiers and Poseidon are read from it, so Cloak's
// launch vault proves on the same keys, and its memo board and start block come in as flags.
//
// Cloak's router, batch rounds, receive, bids, funds gate and receipt check take the vault at deploy (immutable, so no
// admin can ever repoint them), so a switch is: this script, then the partner deploy, then the SDK entry.
//
//   node e2e-gloam/use-gloam-vault.mjs --vault 0x… --memo 0x… --block 123 [--config deployments/elysium-testnet-gloam.input.json]
//   NODE_USE_ENV_PROXY=1 node e2e-gloam/deploy-partner.mjs --config deployments/elysium-testnet-gloam.input.json
//   node scripts/sdk-entry.mjs deployments/elysium-testnet-gloam.json deployments/elysium-testnet-v2-factory.json
//
// Checks first: the chain id, code at every address, that the vault is out of setup with deposit limits on, which of
// HYPE, USDC and KNTQ it takes (warns on any it doesn't), and that its verifiers and Poseidon have code.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, http, parseAbi, zeroAddress } from "viem";
import { REPO } from "./lib.mjs";

const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i < 0 ? undefined : process.argv[i + 1];
};
const cfgPath = arg("--config") ?? join(REPO, "deployments/elysium-testnet-gloam.input.json");
const vault = arg("--vault");
const memo = arg("--memo");
const block = arg("--block");
const isAddr = (v) => /^0x[0-9a-fA-F]{40}$/.test(v ?? "");
if (!isAddr(vault) || !isAddr(memo) || !/^\d+$/.test(block ?? "")) throw new Error("usage: --vault <address> --memo <address> --block <start block> [--config <partner config>]");

const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
const pub = createPublicClient({ transport: http(cfg.rpcUrl) });
if ((await pub.getChainId()) !== cfg.chainId) throw new Error(`the RPC is chain ${await pub.getChainId()}, the config says ${cfg.chainId}`);
const V = parseAbi([
  "function verifier() view returns (address)",
  "function shieldVerifier() view returns (address)",
  "function poseidon2() view returns (address)",
  "function setupMode() view returns (bool)",
  "function depositLimitsOn() view returns (bool)",
  "function depositLimit(address) view returns (uint128 perDeposit, uint128 total)",
]);
const rd = (f, args = []) => pub.readContract({ address: vault, abi: V, functionName: f, args });
const hasCode = async (a) => ((await pub.getCode({ address: a })) ?? "0x") !== "0x";
for (const [k, a] of [["vault", vault], ["memo board", memo]]) if (!(await hasCode(a))) throw new Error(`the ${k} ${a} has no code`);
const [verifier, shieldVerifier, poseidon, setup, limitsOn] = await Promise.all([rd("verifier"), rd("shieldVerifier"), rd("poseidon2"), rd("setupMode"), rd("depositLimitsOn")]);
for (const [k, a] of [["verifier", verifier], ["shield verifier", shieldVerifier], ["Poseidon", poseidon]]) if (!(await hasCode(a))) throw new Error(`the vault's ${k} ${a} has no code`);
if (setup) throw new Error("the vault is still in setup: its owner could still change its rules at once");
if (!limitsOn) throw new Error("the vault's deposit limits are off");

// what it takes (a warning, not a stop: Gloam's own testnet vault may list fewer)
const standin = (() => {
  try {
    return JSON.parse(readFileSync(join(REPO, "deployments/elysium-testnet-test-vault.json"), "utf8"));
  } catch {
    return null;
  }
})();
const kntq = standin?.assets?.find((a) => a.symbol === "KNTQ")?.token;
for (const [sym, a] of [["HYPE", zeroAddress], ["USDC", "0x7D29d8047B905000459c0E80c34a26CeedcB47b2"], ...(kntq ? [["KNTQ (test)", kntq]] : [])]) {
  const [p, t] = await rd("depositLimit", [a]);
  console.log(`  ${sym}: ${p > 0n ? `takes up to ${p} per deposit, ${t} in total` : "NOT taken (0 / 0)"}`);
}

const before = { gloamVault: cfg.gloamVault, memoBoard: cfg.memoBoard };
Object.assign(cfg, { gloamVault: vault, gloamVaultBlock: Number(block), memoBoard: memo, poseidon, verifier, shieldVerifier });
cfg._gloamVault = `Set by use-gloam-vault.mjs on ${new Date().toISOString().slice(0, 10)}${standin && standin.gloamVault.toLowerCase() === vault.toLowerCase() ? ": Cloak's test vault on Gloam's open-source code (deployments/elysium-testnet-test-vault.json)" : ""}. Before: ${before.gloamVault}.`;
writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
console.log(`\n${cfgPath}: Gloam's vault ${before.gloamVault} -> ${vault}, memo board ${before.memoBoard} -> ${memo}, verifiers ${verifier} / ${shieldVerifier}, Poseidon ${poseidon}`);
console.log("Next: the partner deploy with this config, then the SDK entry (see the top of this file).");
