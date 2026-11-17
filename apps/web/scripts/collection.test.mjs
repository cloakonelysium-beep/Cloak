// Which receive addresses a collection pass checks (src/collection.ts): node scripts/collection.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { transformWithEsbuild } from "vite";
import { readFileSync } from "node:fs";

const { code } = await transformWithEsbuild(readFileSync(new URL("../src/collection.ts", import.meta.url), "utf8"), "collection.ts", { format: "esm" });
const { collectionPass } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
const issued = Array.from({ length: 40 }, (_, n) => ({ n, address: "0x" + n.toString(16).padStart(40, "0") }));

test("12 addresses or fewer: all of them, every pass", () => {
  assert.equal(collectionPass(issued.slice(0, 7)).pick.length, 7);
});
test("the latest 12 every pass, and every older address within a few passes", () => {
  const seen = new Set();
  let turn = 0;
  for (let i = 0; i < 3; i++) {
    const { pick, nextTurn } = collectionPass(issued, [], turn);
    turn = nextTurn;
    for (let n = 28; n < 40; n++) assert.ok(pick.some((x) => x.n === n), `latest ${n} in pass ${i}`);
    pick.forEach((x) => seen.add(x.n));
  }
  assert.equal(seen.size, 40, "28 older addresses covered in 3 passes of 12");
});
test("a pending Spicenet address is checked every pass, however old", () => {
  for (let turn = 0; turn < 28; turn++) assert.ok(collectionPass(issued, [issued[3].address.toUpperCase().replace("0X", "0x")], turn).pick.some((x) => x.n === 3));
});
test("no address twice in one pass", () => {
  const { pick } = collectionPass(issued, [issued[30].address, issued[0].address], 0);
  assert.equal(new Set(pick.map((x) => x.n)).size, pick.length);
});
