import { createPublicClient, formatUnits, http, type Address, type PublicClient } from "viem";

/**
 * The connected wallet's balance of a bridge source token, read from that chain's public RPC (the wallet itself only
 * answers for the chain it's on). Every RPC here answered for its own chain id and allows browser requests from
 * oncloak.xyz (checked Nov 16). EVM chains only: Tron, Solana and Bitcoin aren't wallets the site connects.
 */
const RPC: Record<number, string> = {
  999: "https://rpc.hyperliquid.xyz/evm",
  42161: "https://arbitrum-one-rpc.publicnode.com",
  8453: "https://base-rpc.publicnode.com",
  1: "https://ethereum-rpc.publicnode.com",
  56: "https://bsc-rpc.publicnode.com",
  10: "https://optimism-rpc.publicnode.com",
  137: "https://polygon-bor-rpc.publicnode.com",
  43114: "https://avalanche-c-chain-rpc.publicnode.com",
  143: "https://rpc.monad.xyz",
  130: "https://unichain-rpc.publicnode.com",
  59144: "https://linea-rpc.publicnode.com",
  480: "https://worldchain-mainnet.g.alchemy.com/public",
  146: "https://sonic-rpc.publicnode.com",
  5000: "https://mantle-rpc.publicnode.com",
  80094: "https://berachain-rpc.publicnode.com",
  324: "https://mainnet.era.zksync.io",
  534352: "https://scroll-rpc.publicnode.com",
  57073: "https://rpc-gel.inkonchain.com",
};
const clients = new Map<number, PublicClient>();
const client = (id: number): PublicClient | undefined => {
  if (!RPC[id]) return undefined;
  if (!clients.has(id)) clients.set(id, createPublicClient({ transport: http(RPC[id], { timeout: 8_000, retryCount: 1 }) }) as PublicClient);
  return clients.get(id);
};
const NATIVE = "0x0000000000000000000000000000000000000000";
const ERC20 = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }] as const;

/** The balance, in the token's smallest unit, or undefined when it can't be read (no RPC, timeout, not an EVM token). */
export async function sourceBalance(chainId: number, token: { address: string; decimals: number }, owner: Address): Promise<bigint | undefined> {
  const c = client(chainId);
  if (!c || !/^0x[0-9a-fA-F]{40}$/.test(token.address)) return undefined;
  try {
    return token.address.toLowerCase() === NATIVE ? await c.getBalance({ address: owner }) : await c.readContract({ address: token.address as Address, abi: ERC20, functionName: "balanceOf", args: [owner] });
  } catch {
    return undefined;
  }
}

/** A balance for display: up to 6 significant digits, no trailing zeros. */
export const showBalance = (v: bigint, decimals: number): string => {
  const n = Number(formatUnits(v, decimals));
  return n === 0 ? "0" : n < 0.000001 ? "<0.000001" : Number(n.toPrecision(6)).toLocaleString(undefined, { maximumFractionDigits: 6 });
};
