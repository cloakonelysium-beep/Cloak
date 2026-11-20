import { useEffect, useRef, useState } from "react";
import { formatEther, formatUnits, type Address, type Hex } from "viem";
import type { GloamPrivate } from "@cloakely/sdk";
import { ASSETS, GLOAM, txLink } from "../config";
import { collectIssued, gloamDelivered } from "../gloam";
import { openBox, sealBox } from "../deviceBox";
import { publicClient } from "../wallet";
import { useApp } from "../state";
import { usePrivateBalances } from "../balances";
import { Link, useRoute } from "../router";
import { Icon } from "../ui";
import { QR } from "../qr";
import { every } from "../every";
import { BridgeIn } from "../bridge";
import { SpiceBridge, SpicenetDocs, useCardLimit } from "../spicenet";
import { CloakCard } from "../cloakCard";
import { Gate } from "../gate";
import { friendly } from "../errors";

/** The receive-address contract (CloakGloamReceive). */
const RECEIVE = GLOAM?.receive;

/** The receive addresses this account has handed out (only their numbers matter: each is derived again from the keys). */
interface Issued {
  n: number;
  address: Address;
  at: number;
}

const load = async (p: GloamPrivate): Promise<Issued[]> => {
  try {
    return JSON.parse((await openBox(p, "receive")) ?? "[]") as Issued[];
  } catch {
    return [];
  }
};

export type DepositView = "menu" | "receive" | "bridge" | "card";

const ICO = {
  qr: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" /></svg>,
  card: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h4" /></svg>,
  chev: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>,
};

/** The Deposit menu: one card per way in. No account needed to see it. */
function DepositMenu() {
  const card = useCardLimit();
  return (
    <>
      <div className="page-head"><div><h1>Deposit</h1><p>Three ways in. Each one lands in your private balance.</p></div></div>
      <div className="dep-list">
        <Link to="/app/deposit/receive" className="dep-opt">
          <span className="dep-ico">{ICO.qr}</span>
          <span><b>Receive address</b><span className="d">An Elysium address anyone can pay, from a wallet or an exchange.</span><span className="by">By Cloak</span></span>
          <span className="meta"><span className="pill ok">No fee</span></span><span className="chev">{ICO.chev}</span>
        </Link>
        <Link to="/app/deposit/bridge" className="dep-opt">
          <span className="dep-ico"><Icon.bridge size={22} /></span>
          <span><b>Bridge</b><span className="d">Move HYPE or USDC over from 20 chains with your wallet.</span><span className="by"><img src="/partners/relay.png" alt="" />Powered by Relay</span></span>
          <span className="meta"><span className="pill">Relay fee</span></span><span className="chev">{ICO.chev}</span>
        </Link>
        <Link to="/app/deposit/card" className="dep-opt">
          <span className="dep-ico">{ICO.card}</span>
          <span><b>Pay by card</b><span className="d">Buy USDC with a debit or credit card.</span><span className="by"><img src="/partners/spicenet-mark.svg" alt="" />Powered by Spicenet</span></span>
          <span className="meta"><span className="pill">{card.on ? card.range : "Soon"}</span></span><span className="chev">{ICO.chev}</span>
        </Link>
      </div>
      <p className="dep-foot"><Icon.lock size={13} />Nobody can see which private balance a deposit joins.</p>
    </>
  );
}

/** The Deposit page: a menu of three ways in, and each one's page. Every way lands at one of the account's receive
 *  addresses, and what arrives moves into the private balance. */
export function Receive({ view = "menu" }: { view?: DepositView }) {
  if (view === "menu") return <DepositMenu />;
  return <DepositWay view={view} />;
}

function DepositWay({ view }: { view: Exclude<DepositView, "menu"> }) {
  const { query } = useRoute();
  const { priv } = useApp();
  const [issued, setIssued] = useState<Issued[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [state, setState] = useState<Record<string, { waiting: string[]; delivered: { amount: string; tx: Hex }[] }>>({});
  const [copied, setCopied] = useState(false);
  const { refresh } = usePrivateBalances();
  const delivered = useRef(-1);

  async function fresh(p: GloamPrivate, list: Issued[]): Promise<Address | undefined> {
    setBusy(true);
    setErr("");
    try {
      const n = list.reduce((m, x) => Math.max(m, x.n + 1), 0);
      const address = await p.receiveAddress(n);
      const next = [...list, { n, address, at: Math.floor(Date.now() / 1000) }];
      await sealBox(p, "receive", JSON.stringify(next));
      setIssued(next);
      return address;
    } catch (e) {
      setErr(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!priv || !RECEIVE) return;
    (async () => {
      const list = await load(priv);
      if (!list.length) return fresh(priv, list);
      setIssued(list);
    })();
  }, [priv]);

  // while this page is open, the app moves what arrives itself (it holds the key the deposit needs), every 20 seconds
  useEffect(() => {
    if (!priv || !issued?.length) return;
    const go = () => collectIssued(priv, issued).then((n) => void (n && refresh())).catch(() => {});
    go();
    return every(go, 20_000);
  }, [priv, issued]);

  // what each address holds now (on its way in) and what the relayer has delivered
  useEffect(() => {
    if (!issued?.length) return;
    let live = true;
    const go = async () => {
      const addrs = issued.slice(-12).map((x) => x.address);
      const [del, bals] = await Promise.all([
        priv ? gloamDelivered(priv, addrs) : ({} as Record<string, never[]>),
        Promise.all(addrs.map((a) => publicClient.getBalance({ address: a }).catch(() => 0n))),
      ]);
      const out: typeof state = {};
      addrs.forEach((a, i) => {
        const symbolOf = (t: string) => (/^0x0+$/.test(t) ? "HYPE" : ASSETS.find((x) => x.token.toLowerCase() === t.toLowerCase())?.symbol ?? "tokens");
        const decOf = (t: string) => (/^0x0+$/.test(t) ? 18 : ASSETS.find((x) => x.token.toLowerCase() === t.toLowerCase())?.decimals ?? 18);
        out[a] = {
          waiting: bals[i] > 0n ? [`${formatEther(bals[i])} HYPE`] : [],
          delivered: ((del as Record<string, { token: string; amount: string; fee: string; txHash: Hex }[]>)[a] ?? []).map((d) => ({ amount: `${formatUnits(BigInt(d.amount) - BigInt(d.fee), decOf(d.token))} ${symbolOf(d.token)}`, tx: d.txHash })),
        };
      });
      if (!live) return;
      setState(out);
      // something just landed: show it in the private balance now, not at the next refresh
      const n = Object.values(out).reduce((m, x) => m + x.delivered.length, 0);
      if (delivered.current >= 0 && n > delivered.current) refresh();
      delivered.current = n;
    };
    go();
    const stop = every(go, 10_000);
    return () => {
      live = false;
      stop();
    };
  }, [issued, priv]);

  const TITLE: Record<typeof view, [string, string]> = {
    receive: ["Receive address", "Anyone can pay it. What arrives moves into your private balance."],
    bridge: ["Bridge", "Bring HYPE or USDC over from another chain."],
    card: ["Pay by card", "Buy USDC with a debit or credit card. It lands in your private balance."],
  };
  const head = (
    <>
      <Link to="/app/deposit" className="back-btn"><span aria-hidden>←</span>Deposit</Link>
      <div className="page-head"><div><h1>{TITLE[view][0]}</h1><p>{TITLE[view][1]}</p></div></div>
    </>
  );
  if (!RECEIVE) return <>{head}<div className="empty">Receive addresses aren't available on this network yet.</div></>;
  if (!priv)
    return (
      <>
        {head}
        {/* the card page shows Cloak's card before a wallet is connected too */}
        {view === "card" && (
          <div className="card" style={{ padding: 24, maxWidth: 460, marginBottom: 16 }}>
            <CloakCard />
            <SpicenetDocs />
          </div>
        )}
        <Gate what={view === "card" ? "pay by card into your private balance" : view === "bridge" ? "bridge funds into your private balance" : "get a receive address"} />
      </>
    );
  const cur = issued?.at(-1);
  const curState = cur ? state[cur.address] : undefined;
  const curUsed = !!curState && (curState.waiting.length > 0 || curState.delivered.length > 0);
  const copy = () => {
    if (!cur) return;
    navigator.clipboard?.writeText(cur.address).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const collect = () => priv && load(priv).then((l) => collectIssued(priv, l)).then(() => refresh()).catch(() => {});

  if (view === "bridge")
    return (
      <>
        {head}
        <div style={{ maxWidth: 640 }}>
          <BridgeIn to={cur?.address} viaAddress={query.get("via") === "address"} onArrived={collect} />
        </div>
      </>
    );
  if (view === "card")
    return (
      <>
        {head}
        <SpiceBridge
          newAddress={async () => {
            if (!priv) throw new Error("Unlock your private account first.");
            const a = await fresh(priv, await load(priv));
            if (!a) throw new Error("Couldn't make a receive address. Try again.");
            return a;
          }}
          onArrived={collect}
        />
      </>
    );

  const older = issued ? [...issued].reverse().slice(1, 12) : [];
  return (
    <>
      {head}
      <div className="grid">
        <div className="card">
          {!cur ? (
            <div className="empty" style={{ padding: "36px 20px" }}>{busy ? "Making your address…" : err || "…"}</div>
          ) : (
            <div style={{ display: "grid", gap: 16, justifyItems: "center", textAlign: "center" }}>
              <QR text={cur.address} size={196} label="Your receive address" />
              <div className="mono" style={{ wordBreak: "break-all", fontSize: 15 }}>{cur.address}</div>
              <div className="row-flex" style={{ gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                <button className="btn btn-ink" onClick={copy}><Icon.copy size={16} />{copied ? "Copied" : "Copy address"}</button>
                <button className="btn btn-ghost" disabled={busy} onClick={() => priv && issued && fresh(priv, issued)}>{busy ? "Making…" : "New address"}</button>
              </div>
              {err && <div className="err">{err}</div>}
            </div>
          )}
          <div className="kv" style={{ marginTop: 18 }}>
            <div className="r"><span>Network</span><span>Elysium</span></div>
            <div className="r"><span>Tokens</span><span>HYPE or USDC</span></div>
            <div className="r"><span>Fee</span><span>None, the relayer pays gas</span></div>
          </div>
          <div className="warnbox" style={{ marginTop: 12 }}>Send on Elysium only. Anything sent on another network, or any other token, can't be recovered.</div>
          <div className="infobox" style={{ marginTop: 10 }}>
            <b>Exchange doesn't list Elysium?</b><br />Get a one-time deposit address on a network it supports, and Relay brings it here.{" "}
            <Link to="/app/deposit/bridge?via=address" className="link">Get a deposit address</Link>
          </div>
          <p className="by" style={{ marginTop: 16 }}>By Cloak's receive contract on Elysium</p>
        </div>
        <div className="col">
          <div className="card">
            <div className="card-head" style={{ marginBottom: 4 }}><h3>Payments to this address</h3>{cur && <span className="xs mute">#{cur.n + 1}</span>}</div>
            {!curUsed ? (
              <p className="small mute" style={{ margin: "8px 0 0" }}>Nothing yet. Payments show here as they arrive.</p>
            ) : (
              <>
                {curState!.waiting.map((w) => <div key={w} className="pay-row"><div><b>{w}</b><span className="xs mute">At the address</span></div><span className="pill">Arriving</span></div>)}
                {curState!.delivered.map((d) => (
                  <div key={d.tx} className="pay-row"><div><b>{d.amount}</b>{txLink(d.tx) && <a className="xs" href={txLink(d.tx)} target="_blank" rel="noreferrer">View transaction ↗</a>}</div><span className="pill ok">In your balance</span></div>
                ))}
                <p className="xs mute" style={{ margin: "12px 0 0" }}>Used already. Make a new address for the next payment so the two can't be linked.</p>
              </>
            )}
          </div>
          {older.length > 0 && (
            <div className="card flat">
              <div className="card-head" style={{ marginBottom: 4 }}><h3>Older addresses</h3><span className="xs mute">{older.length}</span></div>
              {older.map((x) => {
                const st = state[x.address];
                return (
                  <div key={x.n} className="pay-row">
                    <div><b className="mono">{x.address.slice(0, 8)}…{x.address.slice(-6)}</b><span className="xs mute">#{x.n + 1} · {new Date(x.at * 1000).toLocaleDateString()}</span></div>
                    {st?.waiting.length ? <span className="pill">Arriving</span> : st?.delivered.length ? <span className="pill ok">{st.delivered.length === 1 ? st.delivered[0].amount : `${st.delivered.length} payments`}</span> : <span className="xs mute">Nothing yet</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
