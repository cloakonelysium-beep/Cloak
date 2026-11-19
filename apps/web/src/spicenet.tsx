import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { formatUnits, type Address } from "viem";
import { SPICENET, spicenetCapacity, spicenetDeliveries, spicenetDelivery, spicenetServes } from "@cloakely/sdk";
import { CHAIN_ID, txLink } from "./config";
import { publicClient } from "./wallet";
import { Powered, TELEGRAM } from "./ui";
import { CloakCard, Mastercard, Visa } from "./cloakCard";
import { every } from "./every";
import { friendly } from "./errors";
import { CARD_CAP, CARD_MIN, MIN_CAPACITY, arrived, depositLimit, checkFirst, closed, open as following, pendingDeposit, resumable, txHashOf, type Deposit, type Stage } from "./spicenet-state";
const SpiceFunding = lazy(() => import("./spicenet-flow"));
const CARD_ICON = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h4" /></svg>;

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
 * Card, exchange or wallet into the private balance, through Spicenet (docs/BRIDGES.md). Spice Flow UI 5.0.2, one
 * action (Spicenet's instructions, Nov 19): each deposit gets a fresh Cloak receive address and a single SpiceDeposit
 * that funds Spicenet and delivers USDC on Elysium to that address (spicenet-flow.tsx). The Receive page then moves what
 * is actually at the address into the private balance (collectReceived), as for any payment there.
 *
 * What counts: only Elysium. When Spice Flow reports the delivery (onDepositSuccess detail.txHash), that receipt is read
 * for a USDC Transfer from Spicenet's escrow to the receive address, and the amount the receipt shows is recorded
 * (spicenetDelivery). If there is no hash (or the page was reloaded) the address is scanned for the same Transfers
 * (spicenetDeliveries). "Arriving" until the block is finalized (about an hour), then "Arrived". A callback amount is
 * never a credit.
 *
 * Interrupted deposits (confirmed in the window but not delivered): "Resume delivery" reopens the same SpiceDeposit with
 * the same guest session, receive address and delivery callback, skipRecovery={false}, so Spice Flow confirms the funded
 * balance and nobody pays again. If an action was already submitted, Spicenet is asked first and nothing reopens while
 * it is still pending. A window closed before anything was confirmed is "Not confirmed", and can still be resumed for a
 * week (a card or exchange payment can reach Spicenet before the confirm).
 *
 * One deposit at a time: while one is on its way and hasn't reached its receive address, no new Spicenet deposit (and
 * so no new receive address) starts. The customer resumes it or contacts the team with its receive address. Spicenet's
 * guest session lives in this browser, so money that never left Spicenet can be resumed only here.
 *
 * Escrow capacity: Spicenet's escrow on Elysium pays every delivery. Its USDC balance is shown before a deposit starts,
 * new deposits wait while it is nearly empty, and a delivery larger than it holds is refused before anything is
 * submitted (spicenet-flow.tsx).
 *
 * Off unless VITE_SPICENET_99901=1, and never on any network but Elysium mainnet (a testnet receive address can't be
 * collected on mainnet). Turned on only once Spicenet's Elysium payouts are live and checked.
 */
const NET = SPICENET[CHAIN_ID];
const ENV = import.meta.env as unknown as Record<string, string | undefined>;
export const SPICENET_ON = spicenetServes(CHAIN_ID) && ENV[`VITE_SPICENET_${CHAIN_ID}`] === "1";

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
const LABEL: Record<Stage, string> = { funding: "Funding", waiting: "On its way", landing: "Arrived, confirming", arrived: "Arrived", failed: "Not confirmed" };
const label = (d: Deposit) => LABEL[d.stage];
const usdc = (x: string | bigint) => Number(formatUnits(BigInt(x), NET?.usdcDecimals ?? 6)).toLocaleString(undefined, { maximumFractionDigits: 2 });

/** What Elysium shows for a deposit: the reported transaction's receipt first, else the escrow's transfers to the address. */
async function check(d: Deposit) {
  const byReceipt = d.deliveryTx ? await spicenetDelivery(publicClient, { chainId: CHAIN_ID, to: d.to, txHash: d.deliveryTx }).catch(() => null) : null;
  const byScan = byReceipt ? null : await spicenetDeliveries(publicClient, { chainId: CHAIN_ID, to: d.to, fromBlock: BigInt(d.fromBlock) }).catch(() => null);
  return arrived(byReceipt, byScan);
}

export function SpiceBridge({ newAddress, onArrived }: { newAddress: () => Promise<Address>; onArrived: () => void }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<{ d: Deposit; resume: boolean } | null>(null);
  const [err, setErr] = useState("");
  const [list, setList] = useState<Deposit[]>(load);
  // what Spicenet's escrow on Elysium can deliver now (null: unknown)
  const [capacity, setCapacity] = useState<bigint | null>(null);
  const change = (id: string, f: (d: Deposit) => Deposit) =>
    setList((cur) => {
      const next = cur.map((d) => (d.id === id ? f(d) : d));
      save(next);
      return next;
    });
  const update = (id: string, patch: Partial<Deposit>) => change(id, (d) => ({ ...d, ...patch }));

  // a deposit counts only when USDC from Spicenet's escrow is at its receive address (never a card or source callback)
  const follow = async (only?: string) => {
    let moved = false;
    for (const d of load().filter((x) => following(x) && (!only || x.id === only))) {
      const seen = await check(d);
      if (!seen) continue;
      update(d.id, seen);
      moved = true; // the USDC is at the address either way: moving it in can start (a reorg would undo both)
    }
    if (moved) onArrived();
  };
  useEffect(() => {
    if (!SPICENET_ON) return;
    follow();
    const stop = every(() => follow(), 20_000);
    const cap = () => spicenetCapacity(publicClient, CHAIN_ID).then(setCapacity, () => setCapacity(null));
    cap();
    const stopCap = every(cap, 60_000);
    return () => {
      stop();
      stopCap();
    };
  }, []);

  const on = SPICENET_ON && !!NET;
  const pending = on ? pendingDeposit(list) : undefined;
  const dry = capacity !== null && capacity < MIN_CAPACITY;
  const limit = depositLimit(capacity);

  async function start() {
    if (pendingDeposit(load())) return; // one at a time (the button is hidden then too)
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
      setOpen({ d, resume: false });
    } catch (e) {
      setErr(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  const shut = (id: string, note?: string) => {
    // only a deposit closed before anything was confirmed "didn't start"; a funded or submitted one stays resumable
    change(id, (d) => closed(d, note));
    setOpen(null);
    follow(id);
  };

  const shown = [...list].reverse().filter((d) => d.stage !== "funding" && (d.stage !== "failed" || resumable(d))).slice(0, 6);
  const canResume = !!pending && resumable(pending);
  const resume = (d: Deposit) => { setErr(""); setOpen({ d, resume: true }); };

  return (
    <div className="dep-grid">
      <div className="card" style={{ padding: 24 }}>
        <CloakCard />
        <div className="kv" style={{ marginTop: 18 }}>
          <div className="r"><span>Per payment</span><span><b>{on ? `${usdc(CARD_MIN)} to ${usdc(limit)} USDC` : "Opens soon"}</b></span></div>
          {on && limit < CARD_CAP && (
            <div className="r" style={{ display: "block" }}>
              <div className="meter"><i style={{ width: `${Math.max(3, Math.min(100, Number((limit * 100n) / CARD_CAP)))}%` }} /></div>
              <div className="row-flex xs mute" style={{ justifyContent: "space-between", marginTop: 6 }}><span>Available now {usdc(limit)}</span><span>Cloak's cap {usdc(CARD_CAP)}</span></div>
            </div>
          )}
          <div className="r"><span>Arrives</span><span>Usually within minutes</span></div>
          <div className="r"><span>Fees</span><span>Shown in checkout before you pay</span></div>
          <div className="r"><span>Pay with</span><span className="netlogos"><Visa h={13} color="var(--visa)" /><Mastercard h={20} /></span></div>
        </div>
        {!on ? (
          <button className="btn btn-ink btn-lg btn-block" style={{ marginTop: 16 }} disabled>{CARD_ICON}Opening soon</button>
        ) : dry ? (
          <>
            <div className="warnbox" style={{ marginTop: 16 }}>Card payments are paused. Spicenet's payout balance on Elysium is empty right now. Try again later.</div>
            <button className="btn btn-ink btn-lg btn-block" style={{ marginTop: 10 }} disabled>{CARD_ICON}Continue to payment</button>
          </>
        ) : pending && !open ? (
          <>
            <button className="btn btn-ink btn-lg btn-block" style={{ marginTop: 16 }} disabled={!canResume} onClick={() => resume(pending)}>{canResume ? "Resume delivery" : "Your payment is on its way"}</button>
            <p className="xs mute" style={{ margin: "10px 0 0", textAlign: "center" }}>One payment at a time. Resume never charges you twice.</p>
          </>
        ) : (
          <>
            <button className="btn btn-ink btn-lg btn-block" style={{ marginTop: 16 }} disabled={busy || !!open} onClick={start}>{CARD_ICON}{busy ? "Starting…" : "Continue to payment"}</button>
            <p className="xs mute" style={{ margin: "10px 0 0", textAlign: "center" }}>Opens Spicenet's checkout. Choose <b>With Card</b>.</p>
          </>
        )}
        {err && <div className="err">{err}</div>}
        <Powered by="Spicenet" logo="/partners/spicenet-mark.svg" extra="Card checkout by Swapper" />
      </div>

      <div className="col">
        <div className="card">
          <div className="card-head" style={{ marginBottom: 4 }}><h3>Your card payments</h3>{shown.length > 0 && <span className="xs mute">{shown.length}</span>}</div>
          {shown.length === 0 ? (
            <p className="small mute" style={{ margin: "8px 0 0" }}>None yet. Payments and their status show here.</p>
          ) : (
            shown.map((d) => (
              <div key={d.id} className="pay-row">
                <div>
                  <b>{d.received ? `${usdc(d.received)} USDC` : d.amount ? `About ${usdc(d.amount)} USDC` : "Card payment"}</b>
                  <span className="xs mute">{new Date(d.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}{d.stage === "landing" ? " · final in about an hour" : ""}</span>
                  {resumable(d) && d !== pending && <button className="link xs" disabled={!!open} onClick={() => resume(d)}>Resume delivery</button>}
                </div>
                {d.tx && txLink(d.tx) ? <a className="pill ok" href={txLink(d.tx)} target="_blank" rel="noreferrer">{label(d)}</a> : <span className={d.stage === "arrived" ? "pill ok" : d.stage === "waiting" ? "pill warn" : "pill"}>{label(d)}</span>}
              </div>
            ))
          )}
          {pending && (
            <p className="xs mute" style={{ margin: "12px 0 0" }}>
              Not there after an hour? <a className="link" href={TELEGRAM} target="_blank" rel="noreferrer">Contact us</a> with its receive address <span className="mono">{pending.to.slice(0, 6)}…{pending.to.slice(-4)}</span>
            </p>
          )}
        </div>
        <div className="card">
          <h3 style={{ marginBottom: 6 }}>How it works</h3>
          <div className="kv steps-kv">
            <div className="r"><span><i className="n">1</i>Pay</span><span>Card checkout by Swapper</span></div>
            <div className="r"><span><i className="n">2</i>Deliver</span><span>USDC to a fresh address</span></div>
            <div className="r"><span><i className="n">3</i>Private</span><span>Cloak moves it into your balance</span></div>
          </div>
        </div>
        <div className="card flat">
          <h3 style={{ marginBottom: 10 }}>Before you pay</h3>
          <ul className="dep-dots">
            <li>Fees and any ID check are set by the card partner</li>
            <li>One payment at a time, within the limit</li>
            <li>Finish in this browser. An unfinished payment can only resume here</li>
            <li>Cloak can't refund a card payment. Until the USDC arrives, only Spicenet and its card partner can</li>
            <li>Spicenet sees the payment and the receive address, like any card on-ramp</li>
          </ul>
        </div>
      </div>

      {open && (
        <Contained onError={(m) => { setErr(m); shut(open.d.id, "Spicenet didn't start"); }}>
          <Suspense fallback={null}>
            <SpiceFunding
              to={open.d.to}
              resume={open.resume ? { guest: open.d.guest, checkFirst: checkFirst(open.d) } : undefined}
              onGuest={(g) => change(open.d.id, (d) => (d.guest ? d : { ...d, guest: g }))}
              onSubmitted={() => change(open.d.id, (d) => ({ ...d, submitted: true, stage: d.stage === "funding" || d.stage === "failed" ? "waiting" : d.stage, note: undefined }))}
              onDelivered={({ txHash }) => {
                const tx = txHashOf(txHash);
                change(open.d.id, (d) => ({ ...d, submitted: true, sent: true, stage: d.stage === "funding" || d.stage === "failed" ? "waiting" : d.stage, note: undefined, ...(tx ? { deliveryTx: tx } : {}) }));
                // read the receipt now; the 20-second follow keeps going until it is final
                setTimeout(() => follow(open.d.id), 0);
              }}
              onError={(m) => setErr(m)}
              onClose={() => shut(open.d.id)}
            />
          </Suspense>
        </Contained>
      )}
    </div>
  );
}

/** The card limit for the Deposit menu: off, or "10 to N USDC" with N the lower of Cloak's cap and the escrow. */
export function useCardLimit(): { on: boolean; range: string } {
  const [capacity, setCapacity] = useState<bigint | null>(null);
  useEffect(() => {
    if (!SPICENET_ON) return;
    spicenetCapacity(publicClient, CHAIN_ID).then(setCapacity, () => setCapacity(null));
  }, []);
  return { on: SPICENET_ON, range: `${usdc(CARD_MIN)} to ${usdc(depositLimit(capacity))} USDC` };
}
