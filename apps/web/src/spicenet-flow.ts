/**
 * Spicenet's funding step: the part that waits on Spicenet. Loaded only when a user starts a Spicenet deposit, so
 * Privy, wagmi and the Spice Flow UI never weigh on any other page.
 *
 * STUB (Nov 16). To wire once Spicenet has (1) funded its Elysium escrow and made a live payout there, (2) verified the
 * escrow on the explorer, and (3) shared the reference flow for signing into the embedded wallet without a visible
 * login (docs/BRIDGES.md). Then, with @spicenet-io/spiceflow-ui@4.24.0 and @spicenet-io/spiceflow-core@0.10.1 pinned:
 *   - PrivyProvider with SPICENET[99901].privyAppId, the embedded wallet kept apart from the user's own wallet;
 *   - funding from the source the user picked (wallet, card or exchange; card and exchange arrive as Arbitrum USDC);
 *   - buildSpicenetWithdrawalBatch({ deliveryRecipient: to, deliveryToken: USDC, deliveryAmount: quoted net, ... }) with
 *     the SDK's own estimation, signing and execution (no fee maths here);
 *   - return Spicenet's action id, for status and support.
 * Delivery is never taken from here: the app credits only what arrives at `to` (spicenetDeliveries, collectReceived).
 */
import type { Address } from "viem";

export type SpiceSource = "wallet" | "card" | "exchange";

export class SpicenetNotReady extends Error {
  constructor() {
    super("Spicenet deposits open once Spicenet's payouts on Elysium are live.");
    this.name = "SpicenetNotReady";
  }
}

/** Starts Spicenet's funding for a payout of about `amount` USDC (6 decimals) to `to`. Resolves with Spicenet's action id. */
export async function startSpiceFunding(_opts: { to: Address; amount: bigint; source: SpiceSource }): Promise<{ actionId: string }> {
  throw new SpicenetNotReady();
}
