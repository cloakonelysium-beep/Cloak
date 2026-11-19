// The Spicenet delivery check (bridge/spicenet.ts), offline: only USDC from Spicenet's escrow to the exact address counts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SPICENET, spicenetDeliveries, spicenetServes } from "../dist/index.js";

const NET = SPICENET[99901];
const BOX = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const log = (o) => ({ address: NET.usdc, transactionHash: "0x" + "ab".repeat(32), blockNumber: 6_400_000n, args: { from: NET.escrow, to: BOX, value: 600_000_000n }, ...o });

function client(logs, head = 6_500_000n, finalized = 6_450_000n) {
  const asked = [];
  return { asked, getBlockNumber: async () => head, getBlock: async ({ blockTag }) => ({ number: blockTag === "finalized" ? finalized : head }), getLogs: async (q) => (asked.push(q), logs.filter((l) => l.blockNumber >= q.fromBlock && l.blockNumber <= q.toBlock)) };
}

test("mainnet only: testnet and anything else are refused", () => {
  assert.equal(spicenetServes(99901), true);
  assert.equal(spicenetServes(99801), false);
  assert.equal(spicenetServes(1), false);
});

test("asks for canonical USDC Transfers from the escrow to the address, in chunks", async () => {
  const c = client([log()]);
  const d = await spicenetDeliveries(c, { chainId: 99901, to: BOX, fromBlock: 6_380_000n, chunk: 50_000n });
  assert.equal(d.length, 1);
  assert.equal(d[0].amount, 600_000_000n);
  assert.ok(c.asked.length >= 3, "120,001 blocks read in chunks of 50,000");
  for (const q of c.asked) {
    assert.equal(q.address, NET.usdc);
    assert.equal(q.args.from, NET.escrow);
    assert.equal(q.args.to, BOX);
  }
});

test("a delivery is final only once its block is finalized", async () => {
  const d = await spicenetDeliveries(client([log({ blockNumber: 6_440_000n }), log({ blockNumber: 6_460_000n, transactionHash: "0x" + "cd".repeat(32) })]), { chainId: 99901, to: BOX, fromBlock: 6_430_000n });
  assert.deepEqual(d.map((x) => x.final), [true, false]);
});

test("an RPC without the finalized tag counts nothing as final", async () => {
  const c = client([log()]);
  c.getBlock = async () => { throw new Error("unsupported block tag"); };
  const d = await spicenetDeliveries(c, { chainId: 99901, to: BOX, fromBlock: 6_399_000n });
  assert.equal(d.length, 1);
  assert.equal(d[0].final, false);
});

test("ignores anything else a misbehaving RPC returns", async () => {
  const bad = [
    log({ address: "0x9999999999999999999999999999999999999999" }), // another token
    log({ args: { from: OTHER, to: BOX, value: 1n } }), // not from the escrow
    log({ args: { from: NET.escrow, to: OTHER, value: 1n } }), // to someone else
    log({ transactionHash: undefined }),
  ];
  const d = await spicenetDeliveries(client(bad), { chainId: 99901, to: BOX, fromBlock: 6_399_000n });
  assert.equal(d.length, 0);
});

test("refuses a chain Spicenet doesn't serve", async () => {
  await assert.rejects(spicenetDeliveries(client([]), { chainId: 99801, to: BOX, fromBlock: 0n }), /doesn't pay out on chain 99801/);
});

// spicenetDelivery: the Elysium receipt Spice Flow 5.0.2 reports (onDepositSuccess txHash)
import { encodeAbiParameters, pad } from "viem";
import { spicenetDelivery } from "../dist/index.js";
const TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const HASH = "0x" + "ef".repeat(32);
const xfer = (from, to, value, address = NET.usdc) => ({ address, topics: [TOPIC, pad(from), pad(to)], data: encodeAbiParameters([{ type: "uint256" }], [value]) });
const GAS = "0x718dE8f0A0DC14D5BC6c560C192F02AE6Af036c7";
function rclient(receipt, finalized = 6_450_000n) {
  return { getTransactionReceipt: async () => receipt, getBlock: async () => ({ number: finalized }) };
}
const receipt = (logs, o = {}) => ({ status: "success", blockNumber: 6_440_000n, logs, ...o });

test("receipt: the escrow's USDC to the receive address counts, fee transfers don't", async () => {
  const d = await spicenetDelivery(rclient(receipt([xfer(NET.escrow, BOX, 987_000n), xfer(NET.escrow, GAS, 13_000n)])), { chainId: 99901, to: BOX, txHash: HASH });
  assert.equal(d.amount, 987_000n);
  assert.equal(d.final, true);
  assert.equal(d.txHash, HASH);
});
test("receipt: not final until its block is finalized", async () => {
  const d = await spicenetDelivery(rclient(receipt([xfer(NET.escrow, BOX, 1n)]), 6_439_999n), { chainId: 99901, to: BOX, txHash: HASH });
  assert.equal(d.final, false);
});
test("receipt: a reverted transaction, another sender, another token or another recipient is no delivery", async () => {
  const q = { chainId: 99901, to: BOX, txHash: HASH };
  assert.equal(await spicenetDelivery(rclient(receipt([xfer(NET.escrow, BOX, 1n)], { status: "reverted" })), q), null);
  assert.equal(await spicenetDelivery(rclient(receipt([xfer(OTHER, BOX, 1n)])), q), null);
  assert.equal(await spicenetDelivery(rclient(receipt([xfer(NET.escrow, BOX, 1n, OTHER)])), q), null);
  assert.equal(await spicenetDelivery(rclient(receipt([xfer(NET.escrow, OTHER, 1n)])), q), null);
  assert.equal(await spicenetDelivery(rclient(receipt([])), { ...q, txHash: "0x1234" }), null);
});

// spicenetCapacity: the escrow's USDC balance
import { spicenetCapacity } from "../dist/index.js";
test("capacity: reads the escrow's canonical USDC balance", async () => {
  let q;
  const c = await spicenetCapacity({ readContract: async (x) => ((q = x), 187_210_354n) }, 99901);
  assert.equal(c, 187_210_354n);
  assert.equal(q.address, NET.usdc);
  assert.deepEqual(q.args, [NET.escrow]);
  await assert.rejects(spicenetCapacity({ readContract: async () => 0n }, 99801), /doesn't pay out/);
});
