// The Spicenet destination lock (src/spicenet-lock.ts): node scripts/spicenet-lock.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { transformWithEsbuild } from "vite";
import { readFileSync } from "node:fs";

// the module has only a type import, so stripping the types is enough to run it
const src = readFileSync(new URL("../src/spicenet-lock.ts", import.meta.url), "utf8");
const { code } = await transformWithEsbuild(src, "spicenet-lock.ts", { format: "esm" });
const { lockDelivery } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));

const USDC = "0xb47c4C8F73F009CC0C0d3f92B388d13E293F0B65";
const TO = "0x00000000000000000000000000000000000C10AC";
const GAS = "0x718dE8f0A0DC14D5BC6c560C192F02AE6Af036c7";
const USER = "0x1111111111111111111111111111111111111111";
const ATTACKER = "0x2222222222222222222222222222222222222222";
let built;
const lock = lockDelivery({ to: TO, usdc: USDC, feeRecipients: [GAS], build: (p) => (built = p, { ok: true }) });
const base = { destinationChainId: 99901, deliveryToken: USDC, deliveryAmount: 990_000n, deliveryRecipient: USER };

test("keeps the SDK's net payment and fee transfer, net to the receive address", () => {
  lock({ ...base, deliveryTransfers: [{ token: USDC, recipient: USER, amount: 990_000n }, { token: USDC, recipient: GAS, amount: 10_000n }] });
  assert.equal(built.deliveryRecipient, TO);
  assert.equal(built.deliveryAmount, 990_000n);
  assert.deepEqual(built.deliveryTransfers.map((t) => [t.recipient, t.amount]), [[TO, 990_000n], [GAS, 10_000n]]);
});
test("a custom recipient typed in the window still lands at the receive address", () => {
  lock({ ...base, deliveryRecipient: ATTACKER, deliveryTransfers: [{ token: USDC, recipient: ATTACKER, amount: 990_000n }, { token: USDC, recipient: GAS, amount: 10_000n }] });
  assert.ok(built.deliveryTransfers.every((t) => t.recipient === TO || t.recipient === GAS));
});
test("no transfer list: one transfer of the delivery amount to the receive address", () => {
  lock(base);
  assert.deepEqual(built.deliveryTransfers.map((t) => [t.recipient, t.amount]), [[TO, 990_000n]]);
});
test("another chain is refused", () => assert.throws(() => lock({ ...base, destinationChainId: 8453 }), /Elysium only/));
test("another delivery token is refused", () => assert.throws(() => lock({ ...base, deliveryToken: ATTACKER }), /USDC on Elysium only/));
test("a plan with another token inside is refused", () => assert.throws(() => lock({ ...base, deliveryTransfers: [{ token: ATTACKER, recipient: USER, amount: 1n }] }), /other than Elysium USDC/));
test("a plan that pays only fees is refused", () => assert.throws(() => lock({ ...base, deliveryTransfers: [{ token: USDC, recipient: GAS, amount: 10_000n }] }), /nothing for your Cloak address/));
