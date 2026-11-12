// Which network a page or a request is on, from the address it was opened at. One Vercel project serves both:
// oncloak.xyz (and www) is Elysium mainnet; testnet.oncloak.xyz, preview deployments (*.vercel.app) and localhost are
// Elysium testnet. Anything unknown is testnet, so nothing ever lands on mainnet by mistake.
// Shared by the site (src/config.ts) and the routes in this folder; no imports, so it runs in both. Files starting with
// _ are not routes.

export const MAINNET = 99901;
export const TESTNET = 99801;

/** Each network's own address: links, previews and the token list point here. */
export const SITES = { [MAINNET]: "https://oncloak.xyz", [TESTNET]: "https://testnet.oncloak.xyz" };

const MAINNET_HOSTS = new Set(["oncloak.xyz", "www.oncloak.xyz"]);

/** The chain id for a hostname (a port or a trailing dot is ignored). */
export function chainIdForHost(host) {
  const h = String(host ?? "").trim().toLowerCase().replace(/\.$/, "").replace(/:\d+$/, "");
  return MAINNET_HOSTS.has(h) ? MAINNET : TESTNET;
}
