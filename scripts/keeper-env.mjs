// The keeper's settings for one network, read from the deploy records, so nothing is copied by hand:
//   node scripts/keeper-env.mjs mainnet      # KEY=value lines for the mainnet keeper (Render)
//   node scripts/keeper-env.mjs testnet
//   node scripts/keeper-env.mjs mainnet --json
// Secrets (KEEPER_PK, RPC_BACKUP) are never here: they go in Render's dashboard only.
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const net = process.argv[2];
if (net !== "mainnet" && net !== "testnet") throw new Error("usage: node scripts/keeper-env.mjs mainnet|testnet [--json]");
const read = (f) => {
  const p = join(REPO, "deployments", f);
  if (!existsSync(p)) throw new Error(`deployments/${f} isn't there yet: run its deploy first`);
  return JSON.parse(readFileSync(p, "utf8"));
};
const name = `elysium-${net}`;
const fac = read(`${name}-v2-factory.json`);
const g = read(`${name}-gloam.json`);
const drops = existsSync(join(REPO, "deployments", `${name}-drops.json`)) ? read(`${name}-drops.json`) : null;

const env = {
  NODE_VERSION: "22",
  CHAIN_ID: String(fac.chainId),
  ...(net === "mainnet" ? { RPC_URL: "https://rpc.elysium.kinetiq.xyz" } : {}),
  FACTORY: fac.factory,
  START_BLOCK: String(fac.factoryBlock),
  CORS_ORIGINS: net === "mainnet" ? "https://oncloak.xyz,https://www.oncloak.xyz" : "https://testnet.oncloak.xyz,http://localhost:5173",
  TRUSTED_PROXY_HOPS: "1",
  DROPS: drops ? "1" : "0",
  ...(drops ? { DROP_FACTORY: drops.dropFactory, DROP_FACTORY_BLOCK: String(drops.dropFactoryBlock), ESCROW_DROP_FACTORY: drops.escrowDropFactory } : {}),
  GLOAM_VAULT: g.gloamVault,
  GLOAM_VAULT_BLOCK: String(g.gloamVaultBlock ?? g.block),
  GLOAM_LAUNCH_VAULT: g.launchVault,
  GLOAM_LAUNCH_VAULT_BLOCK: String(g.block),
  ...(g.ecosystemVault ? { GLOAM_ECOSYSTEM_VAULT: g.ecosystemVault, GLOAM_ECOSYSTEM_VAULT_BLOCK: String(g.block) } : {}),
  GLOAM_MEMO: g.memoBoard,
  // the escrows the relay sends for: launch swap, router, batch rounds, bids, receive addresses, funds gate
  GLOAM_ESCROWS: [g.launchSwapV4, g.router, g.batcherV4, g.bids, g.receive, g.fundsGate].filter(Boolean).join(","),
  GLOAM_BATCHER_V4: g.batcherV4,
  GLOAM_BATCHER_V4_BLOCK: String(g.block),
  GLOAM_FUNDS_GATE: g.fundsGate,
};
for (const [k, v] of Object.entries(env)) if (!v || v === "undefined") throw new Error(`${k} has no value in the records`);
if (process.argv.includes("--json")) console.log(JSON.stringify(env, null, 2));
else for (const [k, v] of Object.entries(env)) console.log(`${k}=${v}`);
console.error("Secrets go in Render's dashboard only: KEEPER_PK (the keeper wallet's key) and RPC_BACKUP (the keyed backup RPC).");
