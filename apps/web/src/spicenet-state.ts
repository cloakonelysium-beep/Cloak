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
  /** When it was confirmed in the window. */
  submittedAt?: number;
  /** Spicenet's action ids for this deposit, for support (Spicenet asks for them to trace a payment). */
  actions?: string[];
  /** Older records (5.0.1's two steps): Spicenet's quoted net, display only. */
  amount?: string;
}

/** Still to be delivered (or confirmed final): the page follows it on Elysium. */
export const open = (d: Deposit) => d.stage === "funding" || d.stage === "waiting" || d.stage === "landing";

/** The window closed. Only a deposit closed before anything was confirmed counts as not started; once it was confirmed
 *  (or Spice Flow reported anything), it stays open for delivery and resume. */
export function closed(d: Deposit, note = "Closed before confirming"): Deposit {
  return d.stage === "funding" && !d.submitted && !d.sent ? { ...d, stage: "failed", note } : d;
}

/** How long a deposit closed before confirming can still be resumed: a card or exchange payment can reach Spicenet
 *  before the user confirms the delivery, and Spice Flow picks it up again when the same window reopens. */
export const RESUME_CLOSED_FOR_MS = 7 * 86_400_000;

/** After this long a reported delivery that Elysium doesn't show yet may be resumed too. */
export const RESUME_SENT_AFTER_MS = 30 * 60_000;

/** Whether "Resume delivery" is offered: confirmed (or reported) but not delivered on Elysium. */
export function resumable(d: Deposit, now = Date.now()): boolean {
  if (d.received) return false;
  if (d.stage === "failed") return now - d.at < RESUME_CLOSED_FOR_MS;
  if (d.stage !== "waiting") return false;
  return !d.sent || now - d.at > RESUME_SENT_AFTER_MS;
}

/** A deposit whose money is on its way but hasn't reached its receive address. While there is one, no new Spicenet
 *  deposit starts (and so no new receive address): the customer resumes it or contacts the team. */
export function pendingDeposit(list: readonly Deposit[]): Deposit | undefined {
  return [...list].reverse().find((d) => d.stage === "waiting" && !d.received);
}

/** Below this, Spicenet's escrow is empty: new card payments pause until it is refilled. (1 USDC) */
export const MIN_CAPACITY = 1_000_000n;

/** Cloak's own limits on a card deposit through Spicenet, for now: at most 500 USDC, at least 10 (smaller ones may not
 *  cover the delivery fee). A fixed cap: Spicenet's rebalancer refills the escrow from other chains (Matt, Nov 20), so
 *  its balance at any moment isn't a ceiling. Raised once Spicenet's Elysium payouts have a track record. */
export const CARD_CAP = 500_000_000n;
export const CARD_MIN = 10_000_000n;

/** How long a delivery request can still be paid: the SDK's withdrawal request expires an hour after it is made. After
 *  that it can't complete, and its money comes back only once it is cancelled (Matt, Nov 20). */
export const REQUEST_TTL_MS = 60 * 60_000;
type Action = { actionId: string; createdAt: string };
const made = (a: Action) => Date.parse(a.createdAt) || 0;
/** While a pending action could still be paid, resuming waits (never resend one that may still complete). Once every
 *  pending action is past its hour, Resume reopens the window, whose own recovery completes or cancels it. Returns
 *  when the wait ends, or null to open now. */
export function resumeWaitsUntil(pending: readonly Action[], now = Date.now()): number | null {
  const live = pending.map(made).filter((t) => now - t < REQUEST_TTL_MS);
  return live.length ? Math.max(...live) + REQUEST_TTL_MS : null;
}
/** This deposit's actions among the guest wallet's: those made since it started (a minute's slack for clocks). */
export function actionsSince(actions: readonly Action[], since: number): string[] {
  return actions.filter((a) => made(a) >= since - 60_000).map((a) => a.actionId);
}
export const addActions = (d: Deposit, ids: readonly string[]): Deposit => {
  const all = [...new Set([...(d.actions ?? []), ...ids])];
  return all.length === (d.actions?.length ?? 0) ? d : { ...d, actions: all };
};

/** Everything Spicenet's support asks for to trace a payment (Matt, Nov 20), as text to copy. The payment provider's
 *  own reference isn't available to Cloak: it is in the card provider's receipt email. */
export function supportDetails(d: Deposit, fmt: (raw: string) => string): string {
  return [
    "Cloak card payment through Spicenet",
    `Started ${new Date(d.at).toISOString()}`,
    d.received ? `Received ${fmt(d.received)} USDC` : d.amount ? `Quoted ${fmt(d.amount)} USDC` : "",
    `Status ${d.stage}${d.sent ? ", delivery reported" : d.submitted ? ", confirmed" : ""}`,
    `Cloak receive address ${d.to}`,
    d.guest ? `Spicenet wallet ${d.guest}` : "",
    d.actions?.length ? `Spicenet action ${d.actions.join(", ")}` : "",
    d.deliveryTx ? `Delivery transaction ${d.deliveryTx}` : "",
    d.tx && d.tx !== d.deliveryTx ? `Elysium transaction ${d.tx}` : "",
    "Card provider reference, from its receipt email",
  ].filter(Boolean).join("\n");
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
