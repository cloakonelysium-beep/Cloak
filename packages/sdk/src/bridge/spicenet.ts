/**
 * Money in through Spicenet (Spice Flow): the user funds Spicenet from a wallet, a card or an exchange, and Spicenet's
 * escrow on Elysium pays canonical USDC, as a plain transfer, to a fresh Cloak receive address. The app then moves it
 * into the private balance as it does any payment there (`collectReceived`). Spicenet's handoff, Nov 15; our checks and
 * a mainnet-fork simulation of the payout, Nov 16: docs/BRIDGES.md.
 *
 * Elysium MAINNET only. A testnet receive address means nothing on mainnet (testnet's receive contract has no code
 * there), so USDC Spicenet paid to one could never be collected: `spicenetServes` is false everywhere else.
 *
 * Nothing here holds money or a key. The two checks that matter credit nothing themselves: `spicenetDelivery` reads the
 * Elysium receipt Spice Flow reports (5.0.2's onDepositSuccess txHash, Spicenet's instructions of Nov 19) and
 * `spicenetDeliveries` scans for the same thing by address (the fallback). Both count only USDC Transfers from
 * Spicenet's escrow to the address in successful transactions. Never treat a card success, a source-chain deposit or
 * a callback amount as delivery.
 */
import { decodeEventLog, parseAbiItem, type Address, type Hex, type PublicClient } from "viem";

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
    packages: { ui: "5.0.2", core: "0.10.3" },
  },
};

/** Whether Spicenet can pay into receive addresses on this chain (only Elysium mainnet). */
export function spicenetServes(chainId: number): boolean {
  return Object.prototype.hasOwnProperty.call(SPICENET, chainId);
}

export interface SpicenetDelivery {
  txHash: Hex;
  blockNumber: bigint;
  /** In a finalized block (Elysium settles to HyperEVM, so finality trails the head by about an hour). Only a final
   *  delivery counts as complete (Spicenet's review, Nov 17). */
  final: boolean;
  /** USDC, in its smallest unit (6 decimals). */
  amount: bigint;
}

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

/**
 * Spicenet's payouts to `to` since `fromBlock`: canonical USDC Transfers from Spicenet's escrow to exactly that address.
 * Logs exist only for successful transactions, so each one is a delivery; `final` says whether its block is finalized.
 * Read in chunks (public RPCs cap log ranges).
 */
export async function spicenetDeliveries(
  client: Pick<PublicClient, "getLogs" | "getBlockNumber" | "getBlock">,
  { chainId, to, fromBlock, chunk = 50_000n }: { chainId: number; to: Address; fromBlock: bigint; chunk?: bigint },
): Promise<SpicenetDelivery[]> {
  const net = SPICENET[chainId];
  if (!net) throw new Error(`Spicenet doesn't pay out on chain ${chainId}`);
  const [head, finalized] = await Promise.all([client.getBlockNumber(), client.getBlock({ blockTag: "finalized" }).then((b) => b.number ?? -1n).catch(() => -1n)]);
  const out: SpicenetDelivery[] = [];
  for (let a = fromBlock; a <= head; a += chunk) {
    const b = a + chunk - 1n < head ? a + chunk - 1n : head;
    const logs = await client.getLogs({ address: net.usdc, event: TRANSFER, args: { from: net.escrow, to }, fromBlock: a, toBlock: b });
    for (const l of logs) {
      // belt and braces: the filter asked for these, but a misbehaving RPC must not credit anything else
      if (l.address.toLowerCase() !== net.usdc.toLowerCase()) continue;
      if (String(l.args.from).toLowerCase() !== net.escrow.toLowerCase() || String(l.args.to).toLowerCase() !== to.toLowerCase()) continue;
      if (!l.transactionHash || l.blockNumber == null) continue;
      out.push({ txHash: l.transactionHash, blockNumber: l.blockNumber, amount: l.args.value as bigint, final: l.blockNumber <= finalized });
    }
  }
  return out;
}

/**
 * The delivery in one Elysium transaction (the txHash Spice Flow 5.0.2 reports when its delivery to Cloak completes):
 * null unless the receipt exists, succeeded, and holds at least one canonical USDC Transfer from Spicenet's escrow to
 * exactly `to`. The amount is what those Transfers moved, read from the receipt (never the callback's amount, which is
 * the escrow credit before Spicenet's fees). `final` as in `spicenetDeliveries`.
 */
export async function spicenetDelivery(
  client: Pick<PublicClient, "getTransactionReceipt" | "getBlock">,
  { chainId, to, txHash }: { chainId: number; to: Address; txHash: Hex },
): Promise<SpicenetDelivery | null> {
  const net = SPICENET[chainId];
  if (!net) throw new Error(`Spicenet doesn't pay out on chain ${chainId}`);
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return null;
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  if (!receipt || receipt.status !== "success" || receipt.blockNumber == null) return null;
  let amount = 0n;
  for (const l of receipt.logs) {
    if (l.address.toLowerCase() !== net.usdc.toLowerCase()) continue;
    let ev: { eventName: string; args: { from: Address; to: Address; value: bigint } };
    try {
      ev = decodeEventLog({ abi: [TRANSFER], data: l.data, topics: l.topics }) as typeof ev;
    } catch {
      continue;
    }
    if (ev.eventName !== "Transfer") continue;
    if (ev.args.from.toLowerCase() !== net.escrow.toLowerCase() || ev.args.to.toLowerCase() !== to.toLowerCase()) continue;
    amount += ev.args.value;
  }
  if (amount <= 0n) return null;
  const finalized = await client.getBlock({ blockTag: "finalized" }).then((b) => b.number ?? -1n).catch(() => -1n);
  return { txHash, blockNumber: receipt.blockNumber, amount, final: receipt.blockNumber <= finalized };
}

const BALANCE_OF = parseAbiItem("function balanceOf(address) view returns (uint256)");

/**
 * What Spicenet's escrow on Elysium can pay out right now: its canonical USDC balance, in the smallest unit. Every
 * delivery (the net payment and Spicenet's fee transfers) comes out of it, so a deposit whose escrow credit is larger
 * can't be delivered until Spicenet tops it up. A snapshot only: other deliveries draw on the same balance.
 */
export async function spicenetCapacity(client: Pick<PublicClient, "readContract">, chainId: number): Promise<bigint> {
  const net = SPICENET[chainId];
  if (!net) throw new Error(`Spicenet doesn't pay out on chain ${chainId}`);
  return client.readContract({ address: net.usdc, abi: [BALANCE_OF], functionName: "balanceOf", args: [net.escrow] }) as Promise<bigint>;
}
