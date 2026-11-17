import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { formatUnits, type Address, type Hex } from "viem";
import { SPICENET, spicenetDeliveries, spicenetServes } from "@cloakely/sdk";
import { CHAIN_ID, txLink } from "./config";
import { publicClient } from "./wallet";
import { More } from "./ui";
import { every } from "./every";
import { friendly } from "./errors";
const SpiceFunding = lazy(() => import("./spicenet-flow"));

/** Spicenet's window can fail (its SDK, Privy, the network): it shows a message there and never takes the page down. */
class Contained extends Component<{ children: ReactNode; onError: (m: string) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    this.props.onError(e instanceof Error && e.message ? `Spicenet couldn't start: ${e.message}` : "Spicenet couldn't start. Try again later.");
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Card, exchange or wallet into the private balance, through Spicenet (docs/BRIDGES.md). Each deposit gets a fresh
 * receive address; Spicenet's escrow pays USDC there; the Receive page moves what arrives into the private balance.
 *
 * Off unless VITE_SPICENET_99901=1, and never on any network but Elysium mainnet (a testnet receive address can't be
 * collected on mainnet). Turned on only once Spicenet's Elysium payouts are live and checked.
 */
const NET = SPICENET[CHAIN_ID];
const ENV = import.meta.env as unknown as Record<string, string | undefined>;
export const SPICENET_ON = spicenetServes(CHAIN_ID) && ENV[`VITE_SPICENET_${CHAIN_ID}`] === "1";

type Stage = "funding" | "waiting" | "landing" | "arrived" | "failed";
/** A Spicenet deposit followed on this device (the receive address and block it started at; nothing secret). */
interface Deposit {
  id: string;
  to: Address;
  amount?: string; // Spicenet's quoted net USDC, in its smallest unit (a quote, never a credit)
  at: number;
  fromBlock: string;
  stage: Stage;
  received?: string; // USDC that arrived, in its smallest unit
  sent?: boolean; // the delivery to Elysium was submitted (not just the Spicenet balance funded)
  tx?: Hex;
  note?: string;
}
const KEY = `cloak.spicenet.v1.${CHAIN_ID}`;
const load = (): Deposit[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Deposit[];
  } catch {
    return [];
  }
};
const save = (x: Deposit[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(x.slice(-20)));
  } catch {}
};
const LABEL: Record<Stage, string> = { funding: "Funding", waiting: "On its way", landing: "Arriving", arrived: "Arrived", failed: "Didn't start" };
/** After this long without a payout the deposit offers a check: Spicenet says whether its payout is still running, and
 *  only if it no longer is can the balance be sent again (spicenet-flow.tsx, mode "resend"). */
const RESEND_AFTER_MS = 30 * 60_000;
const usdc = (x: string | bigint) => Number(formatUnits(BigInt(x), NET?.usdcDecimals ?? 6)).toLocaleString(undefined, { maximumFractionDigits: 2 });

export function SpiceBridge({ newAddress, onArrived }: { newAddress: () => Promise<Address>; onArrived: () => void }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Deposit | null>(null);
  const [resend, setResend] = useState(false);
  const [err, setErr] = useState("");
  const [list, setList] = useState<Deposit[]>(load);
  const update = (id: string, patch: Partial<Deposit>) =>
    setList((cur) => {
      const next = cur.map((d) => (d.id === id ? { ...d, ...patch } : d));
      save(next);
      return next;
    });

  // a deposit counts only when USDC from Spicenet's escrow is at its receive address (never a card or source callback)
  useEffect(() => {
    if (!SPICENET_ON) return;
    const go = async () => {
      let arrived = false;
      for (const d of load().filter((x) => x.stage === "funding" || x.stage === "waiting" || x.stage === "landing")) {
        const got = await spicenetDeliveries(publicClient, { chainId: CHAIN_ID, to: d.to, fromBlock: BigInt(d.fromBlock) }).catch(() => null);
        if (!got?.length) continue;
        const total = got.reduce((a, x) => a + x.amount, 0n);
        // complete only once every payout's block is finalized (about an hour on Elysium); until then "Arriving"
        const final = got.every((x) => x.final);
        update(d.id, { stage: final ? "arrived" : "landing", received: total.toString(), tx: got[got.length - 1].txHash });
        arrived = true; // the USDC is at the address either way: moving it in can start (a reorg would undo both)
      }
      if (arrived) onArrived();
    };
    go();
    return every(go, 20_000);
  }, []);

  if (!SPICENET_ON || !NET) return null;

  async function start() {
    setBusy(true);
    setErr("");
    try {
      // a fresh receive address for this deposit only, and the block to look for its payout from
      const [to, block] = await Promise.all([newAddress(), publicClient.getBlockNumber()]);
      const d: Deposit = { id: `${Date.now()}-${to.slice(2, 10)}`, to, at: Date.now(), fromBlock: (block > 5n ? block - 5n : 0n).toString(), stage: "funding" };
      setList((cur) => {
        const next = [...cur, d];
        save(next);
        return next;
      });
      setResend(false);
      setOpen(d);
    } catch (e) {
      setErr(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="swap bridge" style={{ marginTop: 16 }}>
      <div className="k" style={{ marginBottom: 10 }}><b>Card, exchange or wallet</b><span className="xs mute">through Spicenet</span></div>
      <p className="small soft" style={{ margin: "0 0 10px" }}>Pay by card, from an exchange, or from a wallet on another chain. Spicenet delivers USDC on Elysium to a fresh receive address, and Cloak moves it into your private balance.</p>
      <div className="bridge-cta">
        <button className="btn btn-ink btn-lg" disabled={busy || !!open} onClick={start}>{busy ? "Starting…" : "Add funds with Spicenet"}</button>
      </div>
      {open && (
        <Contained onError={(m) => { setErr(m); setList((cur) => { const next = cur.map((x) => (x.id === open.id && x.stage === "funding" ? { ...x, stage: "failed" as Stage, note: "Spicenet didn't start" } : x)); save(next); return next; }); setOpen(null); }}>
        <Suspense fallback={<p className="small mute">Loading Spicenet…</p>}>
          <SpiceFunding
            to={open.to}
            mode={resend ? "resend" : "deposit"}
            onStarted={(q) => update(open.id, { stage: "waiting", sent: true, ...(q ? { amount: q.toString() } : {}) })}
            onFunded={(f) => update(open.id, { stage: "waiting", ...(f.stage === "sent" ? { sent: true } : {}) })}
            onError={(m) => setErr(m)}
            onClose={() => {
              // closed before Spicenet accepted anything: nothing is on its way
              setList((cur) => {
                const next = cur.map((x) => (x.id === open.id && x.stage === "funding" ? { ...x, stage: "failed" as Stage, note: "Closed before paying" } : x));
                save(next);
                return next;
              });
              setOpen(null);
              setResend(false);
            }}
          />
        </Suspense>
        </Contained>
      )}
      {err && <div className="err">{err}</div>}
      {list.length > 0 && (
        <div className="asset-list" style={{ marginTop: 12 }}>
          {[...list].reverse().slice(0, 5).map((d) => (
            <div key={d.id} className="asset-row">
              <div className="nm">
                <b className="small">{d.received ? `${usdc(d.received)} USDC` : d.amount ? `About ${usdc(d.amount)} USDC` : "USDC"} through Spicenet</b>
                <span className="xs mute">to {d.to.slice(0, 8)}…{d.to.slice(-6)} · {new Date(d.at).toLocaleString()}</span>
                {d.note && <span className="xs mute">{d.note}</span>}
                {d.stage === "landing" && <span className="xs mute">At your receive address; final in about an hour.</span>}
                {d.stage === "waiting" && !d.sent && (
                  <span className="xs mute">
                    Funded on Spicenet, not sent to Cloak yet.{" "}
                    <button className="link" disabled={!!open} onClick={() => { setErr(""); setResend(true); setOpen(d); }}>Send to Cloak</button>
                  </span>
                )}
                {d.stage === "waiting" && d.sent && Date.now() - d.at > RESEND_AFTER_MS && (
                  <span className="xs mute">
                    Taking longer than usual. Spicenet retries a payout on its own.{" "}
                    <button className="link" disabled={!!open} onClick={() => { setErr(""); setResend(true); setOpen(d); }}>Check with Spicenet</button>
                  </span>
                )}
              </div>
              <div className="amt">
                {d.tx && txLink(d.tx) ? <a className="pill ok" href={txLink(d.tx)} target="_blank" rel="noreferrer">{d.stage === "waiting" && !d.sent ? "Not sent" : LABEL[d.stage]}</a> : <span className={d.stage === "arrived" ? "pill ok" : "pill"}>{d.stage === "waiting" && !d.sent ? "Not sent" : LABEL[d.stage]}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="more-list">
        <More title="What is public and what isn't">Spicenet's escrow pays USDC to a fresh receive address on Elysium, never to your wallet, and Cloak moves it into your private balance. On Elysium the payment comes from Spicenet, not from you. Spicenet sees both ends (where the money came from and the receive address), as any bridge does, and amounts and timing can be matched. Waiting a while before you trade helps.</More>
        <More title="When it counts">Only when the USDC is at your receive address on Elysium. A card payment going through, or a deposit on another chain, isn't the money arriving.</More>
      </div>
    </div>
  );
}
