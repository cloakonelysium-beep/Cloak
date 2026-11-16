import { useEffect, useState } from "react";
import { formatEther, type Address } from "viem";
import { CHAIN_ID } from "./config";
import { TESTNET } from "../api/_net.js";
import { publicClient } from "./wallet";
import { useApp } from "./state";
import { usePrivateBalances } from "./balances";
import { openBox, sealBox } from "./deviceBox";
import { collectIssued, gloamDelivered } from "./gloam";
import { every } from "./every";
import { friendly } from "./errors";
import { QR } from "./qr";
import { Icon } from "./ui";

/**
 * Moving HYPE from Cloak v1 (testnet only). v1 keeps running at cloak.boblabs.tech with its own relayer, and its
 * withdraw sends plain HYPE to any address. So the move is: this card hands out a fresh v2 receive address, the user
 * withdraws their v1 HYPE to it on v1's site, and v2 moves what arrives into the private balance like any payment
 * (here while the card is open, and on every unlock). No v1 code or signature on this site: each site asks only for its
 * own signature. Plan and simulation: docs/MIGRATION-V1.md.
 */
export const V1 = {
  site: "https://cloak.boblabs.tech",
  /** v1's router: its unshieldHype pays the plain HYPE out. */
  router: "0x343ab9a7aac93cee28321410510ea24417cc6386" as Address,
  /** v1's HYPE pool (WHYPE notes), on Elysium testnet. */
  hypePool: "0x3ACB22829bb422446caaDd8546e65ab530A53031" as Address,
};
export const V1_MOVE = CHAIN_ID === TESTNET;

const HIDE = `cloak.v1move.hidden.${CHAIN_ID}`;
interface Issued {
  n: number;
  address: Address;
  at: number;
}

export function V1Move() {
  const { priv, toast } = useApp();
  const { refresh } = usePrivateBalances();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HIDE) === "1";
    } catch {
      return false;
    }
  });
  const [box, setBox] = useState<Issued | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [waiting, setWaiting] = useState(0n);
  const [moved, setMoved] = useState(0n);

  // the address this account already made for the move, if any
  useEffect(() => {
    if (!V1_MOVE || !priv) return;
    openBox(priv, "v1move").then((s) => s && setBox(JSON.parse(s) as Issued)).catch(() => {});
  }, [priv]);

  // while open: what waits at the address, move it in, and what has arrived so far
  useEffect(() => {
    if (!V1_MOVE || !priv || !box) return;
    let live = true;
    const go = async () => {
      const [bal, n] = await Promise.all([publicClient.getBalance({ address: box.address }).catch(() => 0n), collectIssued(priv, [box]).catch(() => 0)]);
      const del = (await gloamDelivered(priv, [box.address]).catch(() => ({}))) as Record<string, { amount: string; fee: string }[]>;
      if (!live) return;
      setWaiting(n ? 0n : bal);
      setMoved((del[box.address] ?? []).reduce((a, d) => a + BigInt(d.amount) - BigInt(d.fee), 0n));
      if (n) refresh();
    };
    go();
    const stop = every(go, 20_000);
    return () => {
      live = false;
      stop();
    };
  }, [priv, box]);

  if (!V1_MOVE || hidden || !priv) return null;

  async function start() {
    if (!priv) return;
    setBusy(true);
    setErr("");
    try {
      // a fresh receive address, added to this account's list so every unlock moves in what arrives there
      const list = JSON.parse((await openBox(priv, "receive")) ?? "[]") as Issued[];
      const n = list.reduce((m, x) => Math.max(m, x.n + 1), 0);
      const next: Issued = { n, address: await priv.receiveAddress(n), at: Math.floor(Date.now() / 1000) };
      await sealBox(priv, "receive", JSON.stringify([...list, next]));
      await sealBox(priv, "v1move", JSON.stringify(next));
      setBox(next);
    } catch (e) {
      setErr(friendly(e));
    } finally {
      setBusy(false);
    }
  }
  const hide = () => {
    try {
      localStorage.setItem(HIDE, "1");
    } catch {}
    setHidden(true);
  };
  const copy = () => box && navigator.clipboard?.writeText(box.address).then(() => toast("Address copied")).catch(() => {});

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head">
        <h3>Have HYPE in Cloak v1?</h3>
        <button className="btn btn-ghost btn-sm" onClick={hide} aria-label="Hide this">Hide</button>
      </div>
      {!box ? (
        <>
          <p className="small soft" style={{ margin: "0 0 12px" }}>Cloak v1 still runs at cloak.boblabs.tech, and your HYPE there is safe. Move it here in three steps: get a fresh address below, withdraw your v1 HYPE to it on v1's site, and it lands in your private balance here.</p>
          <button className="btn btn-ink" disabled={busy} onClick={start}>{busy ? "Making your address…" : "Get my move address"}</button>
        </>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <ol className="small soft" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
            <li>Copy this address. It's yours alone, made for this move.</li>
            <li>Open <a className="link" href={`${V1.site}/app`} target="_blank" rel="noreferrer">Cloak v1 ↗</a>, unlock with the same wallet, and <b>withdraw your HYPE</b> to this address. v1's relayer sends it, so your wallet stays out of it.</li>
            <li>Come back here. It moves into your private balance on its own within a minute.</li>
          </ol>
          <div style={{ display: "grid", gap: 10, justifyItems: "center", textAlign: "center" }}>
            <QR text={box.address} size={150} label="Your move address" />
            <div className="mono small" style={{ wordBreak: "break-all" }}>{box.address}</div>
            <button className="btn btn-ghost btn-sm" onClick={copy}><Icon.copy size={14} />Copy address</button>
          </div>
          {waiting > 0n && <div className="summary small"><span className="dot live" style={{ marginRight: 8 }} />{formatEther(waiting)} HYPE arrived from v1. Moving it into your private balance…</div>}
          {moved > 0n && <div className="summary small"><span className="pill ok" style={{ marginRight: 8 }}>Moved</span>{formatEther(moved)} HYPE from Cloak v1 is in your private balance.</div>}
          <p className="xs mute" style={{ margin: 0 }}>Use HYPE only. Testnet only: Cloak v1 never ran on mainnet.</p>
        </div>
      )}
      {err && <div className="err">{err}</div>}
    </div>
  );
}
