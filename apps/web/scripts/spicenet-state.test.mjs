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
test("the cap is a fixed 500 USDC, at least 10", () => {
  assert.equal(S.CARD_CAP, 500_000_000n);
  assert.equal(S.CARD_MIN, 10_000_000n);
});
const iso = (t) => new Date(t).toISOString();
test("resume waits while a pending request can still be paid, and opens once every one is past its hour", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");
  assert.equal(S.resumeWaitsUntil([], now), null);
  assert.equal(S.resumeWaitsUntil([{ actionId: "a", createdAt: iso(now - 20 * 60_000) }], now), now + 40 * 60_000);
  assert.equal(S.resumeWaitsUntil([{ actionId: "a", createdAt: iso(now - 61 * 60_000) }], now), null, "expired: reopen, recovery cancels or completes it");
  assert.equal(S.resumeWaitsUntil([{ actionId: "a", createdAt: iso(now - 90 * 60_000) }, { actionId: "b", createdAt: iso(now - 5 * 60_000) }], now), now + 55 * 60_000);
  assert.equal(S.resumeWaitsUntil([{ actionId: "a", createdAt: "garbage" }], now), null);
});
test("a deposit's actions are the guest wallet's actions since it started, kept once each", () => {
  const since = Date.parse("2026-11-20T12:00:00Z");
  const acts = [{ actionId: "old", createdAt: iso(since - 3600_000) }, { actionId: "a1", createdAt: iso(since + 30_000) }, { actionId: "a2", createdAt: iso(since - 30_000) }];
  assert.deepEqual(S.actionsSince(acts, since), ["a1", "a2"]);
  const d = S.addActions(base, ["a1"]);
  assert.deepEqual(S.addActions(d, ["a1", "a2"]).actions, ["a1", "a2"]);
  assert.equal(S.addActions(d, ["a1"]), d, "nothing new: the same record");
});
test("support details hold what Spicenet's support asks for, and no secrets", () => {
  const d = { ...base, stage: "waiting", submitted: true, guest: "0x2222222222222222222222222222222222222222", actions: ["act_1"], deliveryTx: H1 };
  const t = S.supportDetails(d, (x) => (Number(x) / 1e6).toString());
  for (const want of [base.to, d.guest, "act_1", H1, "Started", "Card provider reference"]) assert.ok(t.includes(want), want);
  assert.ok(!/[:;—]/.test(t.replace(/0x[0-9a-fA-F]+|\d{4}-\d\d-\d\dT[\d:.]+Z/g, "")), "no colons or semicolons in the words");
});

test("resume after an expired request follows Spicenet's recovery status, never the stale pending list alone", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");
  const old = { actionId: "x", createdAt: iso(now - 2 * 3600_000) };
  const live = { actionId: "y", createdAt: iso(now - 10 * 60_000) };
  assert.deepEqual(S.resumeStep([], {}, now), { kind: "open" });
  assert.deepEqual(S.resumeStep([live], {}, now), { kind: "wait", until: now + 50 * 60_000 });
  assert.deepEqual(S.resumeStep([old, live], { x: ["cancelled"] }, now).kind, "wait", "a live one still waits");
  assert.deepEqual(S.resumeStep([old], { x: ["unresolved"] }, now), { kind: "settling" });
  assert.deepEqual(S.resumeStep([old], {}, now), { kind: "settling" }, "status unknown: don't reopen");
  assert.deepEqual(S.resumeStep([old], { x: [] }, now), { kind: "settling" });
  assert.deepEqual(S.resumeStep([old], { x: ["completed"] }, now), { kind: "delivered" });
  assert.deepEqual(S.resumeStep([old], { x: ["cancelled"] }, now), { kind: "open" }, "cancelled: the credit is back, deliver again");
  assert.deepEqual(S.resumeStep([old], { x: ["completed", "cancelled"] }, now), { kind: "open" });
  assert.deepEqual(S.resumeStep([old], { x: ["completed", "unresolved"] }, now), { kind: "settling" });
});
