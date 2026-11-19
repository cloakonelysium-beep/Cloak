/**
 * Which receive addresses one collection pass checks (gloam.ts collectIssued). Every address ever handed out stays
 * eligible: a payment can reach an old address at any time, and a Spicenet payout lands whenever it lands (Spicenet's
 * review, Nov 17). Kept apart so it can be tested on its own (scripts/collection.test.mjs).
 */
/** The addresses one pass checks: the latest 12, the next 12 of the older ones in turn (so every address handed out is
 *  checked again within a few passes, however many there are), and every pending Spicenet deposit's address. */
export function collectionPass<T extends { n: number; address: string }>(issued: T[], pending: string[] = [], turn = 0): { pick: T[]; nextTurn: number } {
  const recent = issued.slice(-12);
  const older = issued.slice(0, -12);
  const start = older.length ? turn % older.length : 0;
  const rota = Array.from({ length: Math.min(12, older.length) }, (_, i) => older[(start + i) % older.length]);
  const want = new Set(pending.map((a) => a.toLowerCase()));
  const pick = new Map<number, T>();
  for (const x of [...recent, ...rota, ...issued.filter((y) => want.has(y.address.toLowerCase()))]) pick.set(x.n, x);
  return { pick: [...pick.values()], nextTurn: older.length ? (start + rota.length) % older.length : 0 };
}

