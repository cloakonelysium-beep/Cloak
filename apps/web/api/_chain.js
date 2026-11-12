// A request's network for the routes in this folder: its chain id, viem chain, site address and Cloak's deployment
// there (undefined until Cloak is deployed on that network). Files starting with _ are not routes.
import { deployments, elysium, elysiumTestnet } from "@cloakely/sdk";
import { MAINNET, SITES, chainIdForHost } from "./_net.js";

export function netOf(req) {
  const id = chainIdForHost(new URL(req.url).hostname);
  return { id, chain: id === MAINNET ? elysium : elysiumTestnet, site: SITES[id], d: deployments[id] };
}
