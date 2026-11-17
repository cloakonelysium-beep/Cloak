/**
 * The destination lock for Spicenet payouts (Spicenet's review, Nov 17), kept apart from the SDK so it can be tested
 * on its own (scripts/spicenet-lock.test.mjs). Every SpiceWithdraw path, first try and retries alike, builds its payout
 * through this. It keeps the SDK's payout plan as quoted, the net payment and its separate fee transfers, and refuses
 * it unless it is on Elysium mainnet (99901), in canonical USDC, and every transfer goes to the deposit's receive
 * address or to one of Spicenet's own fee addresses. The net payment's recipient becomes the receive address: the
 * window offers the user's own wallet by default, and a custom address field, and a Cloak deposit may land only at
 * its receive address.
 */
import type { Address } from "viem";

export type Transfer = { token: Address; recipient: Address; amount: bigint };
export type PayoutParams = {
  destinationChainId: number;
  deliveryToken: Address;
  deliveryAmount: bigint;
  withdrawalAmount?: bigint;
  deliveryRecipient: Address;
  deliveryTransfers?: Transfer[];
  requestTimestampMs?: number;
};
type Build<B> = (p: {
  destinationChainId: number;
  deliveryToken: Address;
  deliveryAmount: bigint;
  withdrawalAmount?: bigint;
  deliveryRecipient: Address;
  deliveryTransfers?: Transfer[];
  requestTimestampMs?: number;
}) => B | null;

const lc = (a: string) => a.toLowerCase();

export function lockDelivery<B>({ to, usdc, feeRecipients, build }: { to: Address; usdc: Address; feeRecipients: readonly string[]; build: Build<B> }) {
  const fees = new Set(feeRecipients.map(lc));
  return (p: PayoutParams): B => {
    if (p.destinationChainId !== 99901) throw new Error("Cloak deposits go to Elysium only.");
    if (lc(p.deliveryToken) !== lc(usdc)) throw new Error("Cloak deposits arrive as USDC on Elysium only.");
    const plan = p.deliveryTransfers?.length ? p.deliveryTransfers : [{ token: p.deliveryToken, recipient: p.deliveryRecipient, amount: p.withdrawalAmount ?? p.deliveryAmount }];
    const transfers = plan.map((t) => {
      if (lc(t.token) !== lc(usdc)) throw new Error("Spicenet's payout plan includes a token other than Elysium USDC.");
      if (t.amount <= 0n) throw new Error("Spicenet's payout plan includes an empty transfer.");
      return fees.has(lc(t.recipient)) ? t : { ...t, recipient: to };
    });
    const net = transfers.filter((t) => lc(t.recipient) === lc(to)).reduce((a, t) => a + t.amount, 0n);
    if (net <= 0n) throw new Error("Spicenet's payout plan has nothing for your Cloak address.");
    const batch = build({ destinationChainId: 99901, deliveryToken: usdc, deliveryAmount: net, withdrawalAmount: p.withdrawalAmount, deliveryRecipient: to, deliveryTransfers: transfers, requestTimestampMs: p.requestTimestampMs });
    if (!batch) throw new Error("Spicenet couldn't build the delivery to Elysium.");
    return batch;
  };
}
