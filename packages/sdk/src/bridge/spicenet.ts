/**
 * Money in through Spicenet (Spice Flow): the user funds Spicenet from a wallet, a card or an exchange, and Spicenet's
 * escrow on Elysium pays canonical USDC, as a plain transfer, to a fresh Cloak receive address. The app then moves it
 * into the private balance as it does any payment there (`collectReceived`). Spicenet's handoff, Nov 15; our checks and
 * a mainnet-fork simulation of the payout, Nov 16: docs/BRIDGES.md.
 *
 * Elysium MAINNET only. A testnet receive address means nothing on mainnet (testnet's receive contract has no code
 * there), so USDC Spicenet paid to one could never be collected: `spicenetServes` is false everywhere else.
 *
 * Nothing here holds money or a key. The one check that matters, `spicenetDeliveries`, credits nothing itself: it finds
 * USDC Transfers from Spicenet's escrow to the address, which only successful transactions log. Never treat a card
 * success or a source-chain deposit as delivery.
 */
import { parseAbiItem, type Address, type Hex, type PublicClient } from "viem";

export interface SpicenetNetwork {
  /** Spicenet's escrow on this chain: every payout is a transfer from it. */
  escrow: Address;
  /** The token it pays: canonical USDC on Elysium. */
  usdc: Address;
  usdcDecimals: number;
  /** Spice Flow's Privy app id (Spicenet's, for the embedded execution wallet only; never the user's own wallet). */
  privyAppId: string;
  /** The package versions this was checked against (pin exactly). */
  packages: { ui: string; core: string };
}

/** Where Spicenet pays out. Elysium mainnet only (see above). */
export const SPICENET: Readonly<Record<number, SpicenetNetwork>> = {
  99901: {
    escrow: "0x7839287eAc1Db87b53aF06Be2A704f25F2186102",
    usdc: "0xb47c4C8F73F009CC0C0d3f92B388d13E293F0B65",
    usdcDecimals: 6,
    privyAppId: "cmltzt02300i20cl8zqgzgho8",
    packages: { ui: "4.24.0", core: "0.10.1" },
  },
};

/** Whether Spicenet can pay into receive addresses on this chain (only Elysium mainnet). */
export function spicenetServes(chainId: number): boolean {
  return Object.prototype.hasOwnProperty.call(SPICENET, chainId);
}

export interface SpicenetDelivery {
  txHash: Hex;
  blockNumber: bigint;
  /** USDC, in its smallest unit (6 decimals). */
  amount: bigint;
}

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

/**
 * Spicenet's payouts to `to` since `fromBlock`: canonical USDC Transfers from Spicenet's escrow to exactly that address.
 * Logs exist only for successful transactions, so each one is a delivery. Read in chunks (public RPCs cap log ranges).
 */
export async function spicenetDeliveries(
  client: Pick<PublicClient, "getLogs" | "getBlockNumber">,
  { chainId, to, fromBlock, chunk = 50_000n }: { chainId: number; to: Address; fromBlock: bigint; chunk?: bigint },
): Promise<SpicenetDelivery[]> {
  const net = SPICENET[chainId];
  if (!net) throw new Error(`Spicenet doesn't pay out on chain ${chainId}`);
  const head = await client.getBlockNumber();
  const out: SpicenetDelivery[] = [];
  for (let a = fromBlock; a <= head; a += chunk) {
    const b = a + chunk - 1n < head ? a + chunk - 1n : head;
    const logs = await client.getLogs({ address: net.usdc, event: TRANSFER, args: { from: net.escrow, to }, fromBlock: a, toBlock: b });
    for (const l of logs) {
      // belt and braces: the filter asked for these, but a misbehaving RPC must not credit anything else
      if (l.address.toLowerCase() !== net.usdc.toLowerCase()) continue;
      if (String(l.args.from).toLowerCase() !== net.escrow.toLowerCase() || String(l.args.to).toLowerCase() !== to.toLowerCase()) continue;
      if (!l.transactionHash || l.blockNumber == null) continue;
      out.push({ txHash: l.transactionHash, blockNumber: l.blockNumber, amount: l.args.value as bigint });
    }
  }
  return out;
}
