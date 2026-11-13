// Cloak's hosted MCP server: https://oncloak.xyz/mcp (a rewrite in vercel.json points it here).
// Read and plan only: it never has a key and never signs. See packages/mcp/src/http.ts.
import { handleMcpRequest } from "@cloakely/mcp/http";
import { MAINNET, chainIdForHost } from "./_net.js";

export const config = { maxDuration: 30 };

// Each address answers for its own network: oncloak.xyz/mcp for mainnet (once the SDK carries Cloak's mainnet deployment;
// until then it says mainnet isn't live yet), testnet.oncloak.xyz/mcp for testnet.
const handle = (req) => handleMcpRequest(req, { network: chainIdForHost(new URL(req.url).hostname) === MAINNET ? "mainnet" : "testnet" });

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export const OPTIONS = handle;
