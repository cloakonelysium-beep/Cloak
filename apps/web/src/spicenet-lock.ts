/**
 * The destination check for Spicenet's delivery plan (Spice Flow UI 5.0.2, Spicenet's instructions of Nov 19), kept
 * apart so it can be tested on its own, against the SDK's real output (scripts/spicenet-lock.test.mjs).
 *
 * CHECK ONLY. It reads the plan quoteSpicenetWithdrawalBatches returned and hands back the very same array, untouched:
 * no amount, recipient or fee is ever changed (the SDK owns those). It throws only if the plan would pay anything other
 * than Elysium USDC, on any chain other than Elysium, or to anyone other than this deposit's Cloak receive address and
 * Spicenet's own fee addresses (Jack's rule: Elysium USDC and the original Cloak address stay fixed on every path).
 *
 * The plan, as 5.0.2 builds it (read from the SDK source and from its output):
 *  - a "spicenet"-domain batch with one createWithdrawalRequest call, whose transfers (token and recipient as address
 *    strings, chain "evm:99901") are what Spicenet's escrow will pay;
 *  - an Elysium (99901) batch with no calls and the same transfers as tokenTransfers from "escrow".
 * Both are checked. Anything the check can't read (another call, a call on Elysium) is refused rather than trusted.
 *
 * Fee sanity (optional `feeLimit`): within each batch, what goes to Spicenet's fee addresses may be at most
 * `fixed` plus `bps` of what that batch pays the receive address. Real fees are a few cents plus 0.1%; the limit only
 * catches a plan that would send most of a payment to fees.
 */
export type Hex = `0x${string}`;
export type PlanTransfer = { token: string; to: string; amount: bigint | string | number };
export type PlanBatch = {
  chainId: number;
  domain?: "evm" | "spicenet";
  calls: readonly { to: string; value?: bigint; data?: Hex }[];
  tokenTransfers?: readonly { from?: string; to: string; token: string; amount?: bigint | string | number }[];
};
/** Decodes a spicenet-domain call (viem's decodeFunctionData with spiceflow-core's spicenetAbi); throws if it can't. */
export type Decode = (data: Hex) => { functionName: string; args?: readonly unknown[] };

const ELYSIUM = 99901;
const lc = (a: string) => String(a).toLowerCase();

export function checkDelivery<B extends PlanBatch>(
  plan: readonly B[],
  { to, usdc, feeRecipients, decode, feeLimit }: { to: string; usdc: string; feeRecipients: readonly string[]; decode: Decode; feeLimit?: { fixed: bigint; bps: bigint } },
): readonly B[] {
  const allowed = new Set([lc(to), ...feeRecipients.map(lc)]);
  let toReceive = 0n;
  // per batch: what it pays the receive address and what it pays Spicenet's fee addresses
  let net = 0n;
  let fee = 0n;
  const pay = (t: PlanTransfer, where: string) => {
    if (lc(t.token) !== lc(usdc)) throw new Error(`Spicenet's delivery plan pays a token other than Elysium USDC (${where}).`);
    if (!allowed.has(lc(t.to))) throw new Error(`Spicenet's delivery plan pays an address other than your Cloak receive address (${where}).`);
    const amount = BigInt(t.amount ?? 0);
    if (lc(t.to) === lc(to)) {
      toReceive += amount;
      net += amount;
    } else fee += amount;
  };
  const settle = () => {
    if (feeLimit && fee > feeLimit.fixed + (net * feeLimit.bps) / 10_000n) throw new Error("Spicenet's delivery plan sends more to fees than Cloak allows. Nothing was submitted.");
    net = 0n;
    fee = 0n;
  };
  if (!Array.isArray(plan) || plan.length === 0) throw new Error("Spicenet returned no delivery plan.");
  for (const b of plan) {
    if (b.domain === "spicenet") {
      for (const c of b.calls) {
        let call: ReturnType<Decode>;
        try {
          call = decode((c.data ?? "0x") as Hex);
        } catch {
          throw new Error("Spicenet's delivery plan has a call Cloak can't read.");
        }
        if (call.functionName !== "createWithdrawalRequest") throw new Error(`Spicenet's delivery plan has an unexpected call (${call.functionName}).`);
        const req = call.args?.[0] as { chainId?: string; transfers?: readonly PlanTransfer[] } | undefined;
        if (req?.chainId !== `evm:${ELYSIUM}`) throw new Error("Spicenet's delivery plan pays out on a chain other than Elysium.");
        for (const t of req.transfers ?? []) pay(t, "withdrawal request");
        settle();
      }
      for (const t of b.tokenTransfers ?? []) pay(t, "Spicenet transfer");
      settle();
      continue;
    }
    if (b.chainId !== ELYSIUM) throw new Error("Spicenet's delivery plan pays out on a chain other than Elysium.");
    if (b.calls.length) throw new Error("Spicenet's delivery plan has a call on Elysium Cloak can't check.");
    for (const t of b.tokenTransfers ?? []) pay({ token: t.token, to: t.to, amount: t.amount ?? 0 }, "Elysium transfer");
    settle();
  }
  if (toReceive <= 0n) throw new Error("Spicenet's delivery plan has nothing for your Cloak receive address.");
  return plan;
}
