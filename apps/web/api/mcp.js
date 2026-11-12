// Cloak's hosted MCP server: https://oncloak.xyz/mcp (a rewrite in vercel.json points it here).
// Read and plan only: it never has a key and never signs. See packages/mcp/src/http.ts.
import { handleMcpRequest } from "@cloakely/mcp/http";
import { MAINNET, chainIdForHost } from "./_net.js";

export const config = { maxDuration: 30 };

// The MCP server knows testnet only for now (packages/mcp/src/config.ts refuses mainnet), so on the mainnet address it
// says so instead of answering for testnet.
const notOnMainnet = () =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Cloak's hosted MCP server isn't on mainnet yet. Use https://testnet.oncloak.xyz/mcp for testnet." } }), {
    status: 503,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
const handle = (req) => (chainIdForHost(new URL(req.url).hostname) === MAINNET && req.method !== "OPTIONS" ? notOnMainnet() : handleMcpRequest(req));

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export const OPTIONS = handle;
