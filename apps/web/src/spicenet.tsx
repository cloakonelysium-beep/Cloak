import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { formatUnits, type Address } from "viem";
import { SPICENET, spicenetCapacity, spicenetDeliveries, spicenetDelivery, spicenetServes } from "@cloakely/sdk";
import { CHAIN_ID, txLink } from "./config";
import { publicClient } from "./wallet";
import { More, TELEGRAM } from "./ui";
import { every } from "./every";
import { friendly } from "./errors";
import { MIN_CAPACITY, arrived, checkFirst, closed, open as following, pendingDeposit, resumable, txHashOf, type Deposit, type Stage } from "./spicenet-state";
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
const label = (d: Deposit) => (d.stage === "waiting" && !d.sent ? "Not delivered" : LABEL[d.stage]);
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

  if (!SPICENET_ON || !NET) return null;
  const pending = pendingDeposit(list);
  const dry = capacity !== null && capacity < MIN_CAPACITY;

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

  return (
    <div className="swap bridge" style={{ marginTop: 16 }}>
      <div className="k" style={{ marginBottom: 10 }}><b>Card, exchange or wallet</b><span className="xs mute">through Spicenet</span></div>
      <p className="small soft" style={{ margin: "0 0 10px" }}>Pay by card, from an exchange, or from a wallet on another chain. Spicenet delivers USDC on Elysium to a fresh receive address, and Cloak moves it into your private balance.</p>
      {pending && !open ? (
        <div className="small soft" style={{ margin: "0 0 10px" }}>
          <b>You have a deposit on its way. Please don't start a new one.</b> Use <b>Resume delivery</b> below; it never charges you again. If it still hasn't
          arrived after an hour, <a href={TELEGRAM} target="_blank" rel="noreferrer">contact the Cloak team</a> with its receive address:{" "}
          <span className="mono" style={{ wordBreak: "break-all" }}>{pending.to}</span>
        </div>
      ) : (
        <>
          {capacity !== null && (
            <p className="xs mute" style={{ margin: "0 0 8px" }}>
              {dry ? "Spicenet's escrow on Elysium is out of USDC right now, so new deposits can't be delivered. Try again later." : `Spicenet can deliver up to ${usdc(capacity)} USDC right now. Larger deposits are refused before you pay.`}
            </p>
          )}
          <div className="bridge-cta">
            <button className="btn btn-ink btn-lg" disabled={busy || !!open || dry} onClick={start}>{busy ? "Starting…" : "Add funds with Spicenet"}</button>
          </div>
        </>
      )}
      {open && (
        <Contained onError={(m) => { setErr(m); shut(open.d.id, "Spicenet didn't start"); }}>
        <Suspense fallback={<p className="small mute">Loading Spicenet…</p>}>
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
                {resumable(d) && (
                  <span className="xs mute">
                    {d.stage === "failed" ? "Paid by card or exchange and closed the window?" : d.sent ? "Taking longer than usual." : "Not delivered to Cloak yet."} Nothing is charged again.{" "}
                    <button className="link" disabled={!!open} onClick={() => { setErr(""); setOpen({ d, resume: true }); }}>Resume delivery</button>
                  </span>
                )}
              </div>
              <div className="amt">
                {d.tx && txLink(d.tx) ? <a className="pill ok" href={txLink(d.tx)} target="_blank" rel="noreferrer">{label(d)}</a> : <span className={d.stage === "arrived" ? "pill ok" : "pill"}>{label(d)}</span>}
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
