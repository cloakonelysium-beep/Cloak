import { useEffect, useState } from "react";
import { formatUnits, parseUnits, type Address, type Hex } from "viem";
import { SPICENET, spicenetDeliveries, spicenetServes } from "@cloakely/sdk";
import { CHAIN_ID, txLink } from "./config";
import { publicClient } from "./wallet";
import { More } from "./ui";
import { every } from "./every";
import { friendly } from "./errors";
import type { SpiceSource } from "./spicenet-flow";

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

type Stage = "funding" | "waiting" | "arrived" | "failed";
/** A Spicenet deposit followed on this device (the receive address and block it started at; nothing secret). */
interface Deposit {
  id: string;
  to: Address;
  amount: string; // USDC asked for, in its smallest unit
  source: SpiceSource;
  at: number;
  fromBlock: string;
  stage: Stage;
  actionId?: string;
  received?: string; // USDC that arrived, in its smallest unit
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
const LABEL: Record<Stage, string> = { funding: "Funding", waiting: "On its way", arrived: "Arrived", failed: "Didn't start" };
const SOURCES: [SpiceSource, string][] = [["card", "Card"], ["exchange", "Exchange"], ["wallet", "Wallet"]];
const usdc = (x: string | bigint) => Number(formatUnits(BigInt(x), NET?.usdcDecimals ?? 6)).toLocaleString(undefined, { maximumFractionDigits: 2 });

export function SpiceBridge({ newAddress, onArrived }: { newAddress: () => Promise<Address>; onArrived: () => void }) {
  const [source, setSource] = useState<SpiceSource>("card");
  const [amt, setAmt] = useState("");
  const [busy, setBusy] = useState(false);
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
      for (const d of load().filter((x) => x.stage === "funding" || x.stage === "waiting")) {
        const got = await spicenetDeliveries(publicClient, { chainId: CHAIN_ID, to: d.to, fromBlock: BigInt(d.fromBlock) }).catch(() => null);
        if (!got?.length) continue;
        const total = got.reduce((a, x) => a + x.amount, 0n);
        update(d.id, { stage: "arrived", received: total.toString(), tx: got[got.length - 1].txHash });
        arrived = true;
      }
      if (arrived) onArrived();
    };
    go();
    return every(go, 20_000);
  }, []);

  if (!SPICENET_ON || !NET) return null;

  let amount = 0n;
  try {
    amount = parseUnits(amt.trim() || "0", NET.usdcDecimals);
  } catch {}

  async function start() {
    setBusy(true);
    setErr("");
    try {
      // a fresh receive address for this deposit only, and the block to look for its payout from
      const [to, block] = await Promise.all([newAddress(), publicClient.getBlockNumber()]);
      const d: Deposit = { id: `${Date.now()}-${to.slice(2, 10)}`, to, amount: amount.toString(), source, at: Date.now(), fromBlock: (block > 5n ? block - 5n : 0n).toString(), stage: "funding" };
      setList((cur) => {
        const next = [...cur, d];
        save(next);
        return next;
      });
      try {
        const { startSpiceFunding } = await import("./spicenet-flow");
        const { actionId } = await startSpiceFunding({ to, amount, source });
        update(d.id, { stage: "waiting", actionId });
      } catch (e) {
        update(d.id, { stage: "failed", note: friendly(e) });
        throw e;
      }
    } catch (e) {
      setErr(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="swap bridge" style={{ marginTop: 16 }}>
      <div className="k" style={{ marginBottom: 10 }}><b>Card, exchange or wallet</b><span className="xs mute">through Spicenet</span></div>
      <div className="seg" role="tablist" aria-label="Pay with" style={{ marginBottom: 10 }}>
        {SOURCES.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={source === k} className={source === k ? "on" : ""} onClick={() => setSource(k)}>{label}</button>
        ))}
      </div>
      <div className="swap-box">
        <div className="k"><span>You get privately</span><span>USDC on Elysium</span></div>
        <div className="amt"><input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" placeholder="0" aria-label="USDC amount" /></div>
      </div>
      <div className="bridge-cta">
        <button className="btn btn-ink btn-lg" disabled={busy || amount <= 0n} onClick={start}>{busy ? "Starting…" : amount <= 0n ? "Enter an amount" : "Continue with Spicenet"}</button>
      </div>
      {err && <div className="err">{err}</div>}
      {list.length > 0 && (
        <div className="asset-list" style={{ marginTop: 12 }}>
          {[...list].reverse().slice(0, 5).map((d) => (
            <div key={d.id} className="asset-row">
              <div className="nm">
                <b className="small">{usdc(d.received ?? d.amount)} USDC by {d.source}</b>
                <span className="xs mute">to {d.to.slice(0, 8)}…{d.to.slice(-6)} · {new Date(d.at).toLocaleString()}{d.actionId ? ` · Spicenet ${d.actionId.slice(0, 10)}` : ""}</span>
                {d.note && <span className="xs mute">{d.note}</span>}
              </div>
              <div className="amt">
                {d.tx && txLink(d.tx) ? <a className="pill ok" href={txLink(d.tx)} target="_blank" rel="noreferrer">{LABEL[d.stage]}</a> : <span className={d.stage === "arrived" ? "pill ok" : "pill"}>{LABEL[d.stage]}</span>}
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
