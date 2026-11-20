// The Spicenet destination check (src/spicenet-lock.ts): node scripts/spicenet-lock.test.mjs
// Run against the real plan: Spice Flow UI 5.0.2's own quoteSpicenetWithdrawalBatches, with only the fee estimate mocked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { transformWithEsbuild } from "vite";
import { readFileSync } from "node:fs";
import { decodeFunctionData, encodeFunctionData, getAddress } from "viem";
import { spicenetAbi, SPICE_GAS_FEE_RECIPIENT, SPICE_PLATFORM_FEE_RECIPIENT, SPICE_COMBINED_FEE_RECIPIENT, ZERO_ADDRESS } from "@spicenet-io/spiceflow-core";

// the module has only type imports, so stripping the types is enough to run it
const src = readFileSync(new URL("../src/spicenet-lock.ts", import.meta.url), "utf8");
const { code } = await transformWithEsbuild(src, "spicenet-lock.ts", { format: "esm" });
const { checkDelivery } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
const { quoteSpicenetWithdrawalBatches } = await import("@spicenet-io/spiceflow-ui");

const USDC = "0xb47c4C8F73F009CC0C0d3f92B388d13E293F0B65";
const TO = getAddress("0x00000000000000000000000000000000000c10ac");
const GUEST = "0x1111111111111111111111111111111111111111";
const ATTACKER = "0x2222222222222222222222222222222222222222";
const FEES = [SPICE_GAS_FEE_RECIPIENT, SPICE_PLATFORM_FEE_RECIPIENT, SPICE_COMBINED_FEE_RECIPIENT];
const decode = (data) => decodeFunctionData({ abi: spicenetAbi, data });
const opts = { to: TO, usdc: USDC, feeRecipients: FEES, decode };
const fees = { spicenetFee: "5000", gasFee: "7000", bridgeFee: "1000" };
const estimate = async () => ({ intents: [{ batches: [{ chainId: 99901, quotedAmount: "1000000", totalDebit: "1000000", feeBreakdown: fees }] }] });
const quote = (o = {}) => quoteSpicenetWithdrawalBatches({ amount: 1_000_000n, recipient: TO, token: USDC, chainId: 99901, userAddress: GUEST, estimate, ...o });
const snap = (x) => JSON.stringify(x, (_, v) => (typeof v === "bigint" ? `${v}n` : v));

/** Re-encodes the plan's withdrawal request with its transfers changed (what a wrong plan would look like). */
function tamper(plan, edit) {
  return plan.map((b) => {
    if (b.domain !== "spicenet") return { ...b, tokenTransfers: b.tokenTransfers.map((t) => ({ ...t })) };
    return {
      ...b,
      calls: b.calls.map((c) => {
        const { args } = decode(c.data);
        const req = edit({ ...args[0], transfers: args[0].transfers.map((t) => ({ ...t })) });
        return { ...c, data: encodeFunctionData({ abi: spicenetAbi, functionName: "createWithdrawalRequest", args: [req] }) };
      }),
    };
  });
}

test("the SDK's real plan: a spicenet withdrawal request and an Elysium escrow transfer, net plus Spicenet's fees", async () => {
  const plan = await quote();
  assert.equal(plan.length, 2);
  const [req, ely] = plan;
  assert.equal(req.domain, "spicenet");
  assert.equal(req.calls.length, 1);
  assert.equal(req.calls[0].to, ZERO_ADDRESS);
  const { functionName, args } = decode(req.calls[0].data);
  assert.equal(functionName, "createWithdrawalRequest");
  assert.equal(args[0].chainId, "evm:99901");
  assert.deepEqual(args[0].transfers.map((t) => [t.to, t.amount]), [[TO.toLowerCase(), 987_000n], [SPICE_GAS_FEE_RECIPIENT.toLowerCase(), 8_000n], [SPICE_PLATFORM_FEE_RECIPIENT.toLowerCase(), 5_000n]]);
  assert.equal(ely.chainId, 99901);
  assert.equal(ely.calls.length, 0);
  assert.deepEqual(ely.tokenTransfers.map((t) => [t.from, t.to, t.amount]), [["escrow", TO, 987_000n], ["escrow", SPICE_GAS_FEE_RECIPIENT, 8_000n], ["escrow", SPICE_PLATFORM_FEE_RECIPIENT, 5_000n]]);
});

test("a legitimate plan passes, and is returned as the same, untouched array", async () => {
  for (const f of [fees, { spicenetFee: "0", gasFee: "7000", bridgeFee: "0" }, { spicenetFee: "0", gasFee: "0", bridgeFee: "0" }, { spicenetFee: "123456", gasFee: "1", bridgeFee: "999" }]) {
    const plan = await quoteSpicenetWithdrawalBatches({ amount: 1_000_000n, recipient: TO, token: USDC, chainId: 99901, userAddress: GUEST, estimate: async () => ({ intents: [{ batches: [{ chainId: 99901, quotedAmount: "1000000", totalDebit: "1000000", feeBreakdown: f }] }] }) });
    const before = snap(plan);
    assert.equal(checkDelivery(plan, opts), plan);
    assert.equal(snap(plan), before, "nothing mutated");
  }
});

test("a lowercase or checksummed receive address both pass (the SDK lowercases inside the request)", async () => {
  const plan = await quote({ recipient: TO.toLowerCase() });
  assert.equal(checkDelivery(plan, { ...opts, to: TO }), plan);
});

test("a wrong recipient is refused, in either batch, and nothing is mutated", async () => {
  const plan = await quote();
  const before = snap(plan);
  assert.throws(() => checkDelivery(tamper(plan, (r) => (r.transfers[0].to = ATTACKER.toLowerCase(), r)), opts), /other than your Cloak receive address/);
  const ely = tamper(plan, (r) => r);
  ely[1].tokenTransfers[0].to = ATTACKER;
  assert.throws(() => checkDelivery(ely, opts), /other than your Cloak receive address/);
  assert.throws(() => checkDelivery(plan, { ...opts, to: ATTACKER }), /other than your Cloak receive address/);
  assert.equal(snap(plan), before);
});

test("the SDK asked for another recipient: refused", async () => {
  await assert.rejects(async () => checkDelivery(await quote({ recipient: ATTACKER }), opts), /other than your Cloak receive address/);
});

test("a wrong token is refused", async () => {
  const plan = await quote();
  assert.throws(() => checkDelivery(tamper(plan, (r) => (r.transfers[1].token = ATTACKER.toLowerCase(), r)), opts), /other than Elysium USDC/);
  const ely = tamper(plan, (r) => r);
  ely[1].tokenTransfers[2].token = ATTACKER;
  assert.throws(() => checkDelivery(ely, opts), /other than Elysium USDC/);
  await assert.rejects(async () => checkDelivery(await quote({ token: ATTACKER }), opts), /other than Elysium USDC/);
});

test("a wrong chain is refused", async () => {
  const plan = await quote();
  assert.throws(() => checkDelivery(tamper(plan, (r) => (r.chainId = "evm:8453", r)), opts), /chain other than Elysium/);
  const ely = tamper(plan, (r) => r);
  ely[1].chainId = 8453;
  assert.throws(() => checkDelivery(ely, opts), /chain other than Elysium/);
});

test("what the check can't read is refused: an unknown spicenet call, a call on Elysium, an empty plan, a fees-only plan", async () => {
  const plan = await quote();
  const bad = tamper(plan, (r) => r);
  bad[0].calls[0].data = "0xdeadbeef";
  assert.throws(() => checkDelivery(bad, opts), /can't read/);
  const call = tamper(plan, (r) => r);
  call[1].calls = [{ to: USDC, value: 0n, data: "0xa9059cbb" }];
  assert.throws(() => checkDelivery(call, opts), /call on Elysium/);
  assert.throws(() => checkDelivery([], opts), /no delivery plan/);
  const feesOnly = tamper(plan, (r) => (r.transfers = r.transfers.slice(1), r));
  feesOnly[1].tokenTransfers = feesOnly[1].tokenTransfers.slice(1);
  assert.throws(() => checkDelivery(feesOnly, opts), /nothing for your Cloak receive address/);
});

test("fees: real ones pass the limit, a plan sending most of the payment to fees is refused", async () => {
  const limit = { fixed: 1_000_000n, bps: 200n };
  // the SDK's real plan with real-sized fees passes
  assert.ok(checkDelivery(await quote(), { ...opts, feeLimit: limit }));
  // a plan where Spicenet's gas fee takes 0.9 of the 1 USDC: refused (under the 1 USDC floor alone it would pass, so
  // the floor is lowered here to prove the percentage bites)
  const greedy = await quote({ estimate: async () => ({ intents: [{ batches: [{ chainId: 99901, quotedAmount: "1000000", totalDebit: "1000000", feeBreakdown: { spicenetFee: "0", gasFee: "900000", bridgeFee: "0" } }] }] }) });
  assert.throws(() => checkDelivery(greedy, { ...opts, feeLimit: { fixed: 10_000n, bps: 200n }, format: (x) => (Number(x) / 1e6).toString() }), /Fee too high: Spicenet quoted 0\.9 USDC in fees for this delivery, and Cloak allows at most 0\.012 USDC/);
  // without a limit the same plan only has to pay the receive address something
  assert.ok(checkDelivery(greedy, opts));
});
test("fees: the percentage is applied exactly, batch by batch", async () => {
  // each batch pays 987,000 to the receive address and 13,000 in fees (8,000 gas, 5,000 platform)
  const plan = await quote();
  assert.ok(checkDelivery(plan, { ...opts, feeLimit: { fixed: 0n, bps: 140n } })); // 1.4% of 987,000 = 13,818 >= 13,000
  assert.throws(() => checkDelivery(plan, { ...opts, feeLimit: { fixed: 0n, bps: 130n } }), /Fee too high/); // 12,831 < 13,000
});
