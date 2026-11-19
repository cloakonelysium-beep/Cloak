// The Spicenet deposit record rules (src/spicenet-state.ts): node scripts/spicenet-state.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { transformWithEsbuild } from "vite";
import { readFileSync } from "node:fs";

const { code } = await transformWithEsbuild(readFileSync(new URL("../src/spicenet-state.ts", import.meta.url), "utf8"), "spicenet-state.ts", { format: "esm" });
const S = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));

const H1 = "0x" + "ab".repeat(32);
const H2 = "0x" + "cd".repeat(32);
const base = { id: "1", to: "0x1111111111111111111111111111111111111111", at: 1_000, fromBlock: "1", stage: "funding" };

test("closing before anything was confirmed: didn't start", () => {
  assert.equal(S.closed(base).stage, "failed");
});
test("closing after the deposit was confirmed or reported is never 'didn't start'", () => {
  assert.equal(S.closed({ ...base, submitted: true }).stage, "funding");
  assert.equal(S.closed({ ...base, stage: "waiting", submitted: true }).stage, "waiting");
  assert.equal(S.closed({ ...base, stage: "waiting", sent: true }).stage, "waiting");
  assert.equal(S.closed({ ...base, stage: "landing" }).stage, "landing");
});
test("resume: offered for a confirmed, undelivered deposit; for a reported one only after a while; never once arrived", () => {
  assert.equal(S.resumable({ ...base, stage: "waiting", submitted: true }, 2_000), true);
  assert.equal(S.resumable({ ...base, stage: "waiting", sent: true }, 2_000), false);
  assert.equal(S.resumable({ ...base, stage: "waiting", sent: true }, 1_000 + S.RESUME_SENT_AFTER_MS + 1), true);
  assert.equal(S.resumable({ ...base, stage: "landing", received: "1" }, 1e12), false);
  assert.equal(S.resumable({ ...base, stage: "arrived", received: "1" }, 1e12), false);
  assert.equal(S.resumable(base, 1e12), false);
  // closed before confirming: resumable for a week (a card payment can reach Spicenet before the confirm)
  assert.equal(S.resumable(S.closed(base), 2_000), true);
  assert.equal(S.resumable(S.closed(base), 1_000 + S.RESUME_CLOSED_FOR_MS + 1), false);
});
test("resume asks Spicenet first once an action may have been submitted", () => {
  assert.equal(S.checkFirst(base), false);
  assert.equal(S.checkFirst({ ...base, submitted: true }), true);
  assert.equal(S.checkFirst({ ...base, sent: true }), true);
  assert.equal(S.checkFirst({ ...base, stage: "waiting" }), true, "a 5.0.1 record funded on Spicenet");
});
test("credit comes from the receipt first, the address scan second, and finality decides arrived", () => {
  assert.deepEqual(S.arrived({ txHash: H1, amount: 987_000n, final: false }, [{ txHash: H2, amount: 5n, final: true }]), { stage: "landing", received: "987000", tx: H1 });
  assert.deepEqual(S.arrived({ txHash: H1, amount: 987_000n, final: true }, null), { stage: "arrived", received: "987000", tx: H1 });
  assert.deepEqual(S.arrived(null, [{ txHash: H1, amount: 1n, final: true }, { txHash: H2, amount: 2n, final: false }]), { stage: "landing", received: "3", tx: H2 });
  assert.equal(S.arrived(null, []), null);
  assert.equal(S.arrived(null, null), null);
});
test("only a real transaction hash is kept from a callback", () => {
  assert.equal(S.txHashOf(H1), H1);
  assert.equal(S.txHashOf("0x1234"), undefined);
  assert.equal(S.txHashOf(undefined), undefined);
});

test("a deposit on its way blocks a new one; arrived, closed or still-open ones don't", () => {
  assert.equal(S.pendingDeposit([]), undefined);
  assert.equal(S.pendingDeposit([{ ...base, stage: "failed" }, { ...base, id: "2", stage: "funding" }, { ...base, id: "3", stage: "landing", received: "5" }, { ...base, id: "4", stage: "arrived", received: "5" }]), undefined);
  assert.equal(S.pendingDeposit([{ ...base, stage: "waiting", submitted: true }, { ...base, id: "2", stage: "arrived", received: "1" }]).id, "1");
});
test("escrow capacity: a delivery must fit; an unknown capacity doesn't block", () => {
  assert.equal(S.fits(100n, 100n), true);
  assert.equal(S.fits(101n, 100n), false);
  assert.equal(S.fits(10n ** 12n, null), true);
});

test("deposit limit: Cloak's 500 USDC cap, or less when the escrow holds less", () => {
  assert.equal(S.depositLimit(null), S.CARD_CAP);
  assert.equal(S.depositLimit(10n ** 12n), S.CARD_CAP);
  assert.equal(S.depositLimit(187_210_354n), 187_210_354n);
  assert.equal(S.CARD_CAP, 500_000_000n);
});
