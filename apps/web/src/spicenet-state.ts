/**
 * The rules for a Spicenet deposit record on this device (spicenet.tsx), kept apart so they can be tested on their own
 * (scripts/spicenet-state.test.mjs). Nothing here credits anything: `received` only ever comes from an Elysium receipt
 * or log (the SDK's spicenetDelivery / spicenetDeliveries), never from a Spice Flow callback amount.
 */
import type { Address, Hex } from "viem";

export type Stage = "funding" | "waiting" | "landing" | "arrived" | "failed";
/** A Spicenet deposit followed on this device (the receive address, the block it started at, Spicenet's guest wallet;
 *  nothing secret). */
export interface Deposit {
  id: string;
  to: Address;
  at: number;
  fromBlock: string;
  stage: Stage;
  /** Spicenet's guest (embedded) wallet this deposit runs in. A resume must use the same one. */
  guest?: Address;
  /** The deposit was confirmed in the window (Spice Flow's onSubmit): from here on money may have moved, so closing
   *  the window never marks it "Didn't start", and a resume first asks Spicenet whether its action is still running. */
  submitted?: boolean;
  /** Spice Flow reported the delivery to Cloak complete (onDepositSuccess). Not a credit. */
  sent?: boolean;
  /** The Elysium transaction Spice Flow reported for the delivery (onDepositSuccess detail.txHash). */
  deliveryTx?: Hex;
  /** USDC that arrived at the receive address, in its smallest unit, read from Elysium. */
  received?: string;
  /** The Elysium transaction that delivered it (verified). */
  tx?: Hex;
  note?: string;
  /** Older records (5.0.1's two steps): Spicenet's quoted net, display only. */
  amount?: string;
}

/** Still to be delivered (or confirmed final): the page follows it on Elysium. */
export const open = (d: Deposit) => d.stage === "funding" || d.stage === "waiting" || d.stage === "landing";

/** The window closed. Only a deposit closed before anything was confirmed "didn't start"; once it was confirmed (or
 *  Spice Flow reported anything), it stays open for delivery and resume. */
export function closed(d: Deposit, note = "Closed before paying"): Deposit {
  return d.stage === "funding" && !d.submitted && !d.sent ? { ...d, stage: "failed", note } : d;
}

/** After this long a reported delivery that Elysium doesn't show yet may be resumed too. */
export const RESUME_SENT_AFTER_MS = 30 * 60_000;

/** Whether "Resume delivery" is offered: confirmed (or reported) but not delivered on Elysium. */
export function resumable(d: Deposit, now = Date.now()): boolean {
  if (d.stage !== "waiting" || d.received) return false;
  return !d.sent || now - d.at > RESUME_SENT_AFTER_MS;
}

/** A resume asks Spicenet first when an action may already be on its way (never resend one that may still complete).
 *  "waiting" alone counts too: a 5.0.1 record in that stage had its funding or payout submitted. */
export const checkFirst = (d: Deposit) => !!(d.submitted || d.sent || d.stage === "waiting");

export type Seen = { txHash: Hex; amount: bigint; final: boolean };
/** What Elysium shows for the deposit: the verified receipt of the reported transaction, else the address scan. */
export function arrived(byReceipt: Seen | null, byScan: readonly Seen[] | null): Partial<Deposit> | null {
  if (byReceipt) return { stage: byReceipt.final ? "arrived" : "landing", received: byReceipt.amount.toString(), tx: byReceipt.txHash };
  if (!byScan?.length) return null;
  const total = byScan.reduce((a, x) => a + x.amount, 0n);
  // complete only once every payout's block is finalized (about an hour on Elysium); until then "Arriving"
  return { stage: byScan.every((x) => x.final) ? "arrived" : "landing", received: total.toString(), tx: byScan[byScan.length - 1].txHash };
}

/** A valid transaction hash from a callback, or nothing. */
export const txHashOf = (x: unknown): Hex | undefined => (typeof x === "string" && /^0x[0-9a-fA-F]{64}$/.test(x) ? (x as Hex) : undefined);
