import { useEffect, useState } from "react";
import type { Address } from "viem";
import { findGloak, readGloak, gloakArrives, type GloakInfo } from "@cloakely/sdk";
import { publicClient } from "./wallet";
import { CHAIN_ID, FACTORY } from "./config";
import { tokens } from "./format";

/**
 * GLOAK, the one private-only token (docs/GLOAK.md): free to shield and trade privately, 10% burned on every move to a
 * public address. The app finds it through the launch factory's one-time door and warns before anything would burn.
 */

/**
 * How often the site asks the chain whether GLOAK exists yet: once a day, after this hour (UTC). Until GLOAK is made, a
 * "not yet" answer is kept (in memory and in this browser) until the next check time, so visitors don't keep reading the
 * chain for a launch that isn't scheduled. Once GLOAK's launch is announced, shorten this (docs/GLOAK.md, "The site").
 */
export const GLOAK_CHECK_HOUR_UTC = 8;

/** The latest daily check time at or before now: today's check hour, or yesterday's if it hasn't come yet. */
export function lastGloakCheck(now = Date.now()): number {
  const d = new Date(now);
  d.setUTCHours(GLOAK_CHECK_HOUR_UTC, 0, 0, 0);
  if (d.getTime() > now) d.setUTCDate(d.getUTCDate() - 1);
  return d.getTime();
}

/** Remembers an answer for this network only until the next daily check (the key carries the chain id). */
export function dailyCache<T>(name: string) {
  const key = `cloak.gloak.${name}.${CHAIN_ID}`;
  return {
    get(): { v: T } | null {
      try {
        const r = JSON.parse(localStorage.getItem(key) ?? "null") as { at: number; v: T } | null;
        return r && r.at >= lastGloakCheck() ? { v: r.v } : null;
      } catch {
        return null;
      }
    },
    set(v: T) {
      try {
        localStorage.setItem(key, JSON.stringify({ at: Date.now(), v }));
      } catch {
        // storage blocked: the answer lives in memory for this visit only
      }
    },
  };
}

const tokenCache = dailyCache<Address | null>("token");
let lookup: { at: number; p: Promise<Address | null> } | null = null;

/** The GLOAK token on this deployment, or null. Found is final; "not yet" is asked again at the next daily check. */
export function gloakAddress(): Promise<Address | null> {
  if (!lookup || lookup.at < lastGloakCheck()) {
    const kept = tokenCache.get();
    const p = kept
      ? Promise.resolve(kept.v)
      : FACTORY
        ? findGloak(publicClient, FACTORY).then((t) => (tokenCache.set(t), t), () => null)
        : Promise.resolve(null);
    lookup = { at: Date.now(), p };
  }
  return lookup.p;
}

/** GLOAK's address and its live rules and meter: read when a page opens, then once a day (GLOAK_CHECK_HOUR_UTC). */
export function useGloak(): { token: Address | null; info: GloakInfo | null; is: (a?: string | null) => boolean } {
  const [token, setToken] = useState<Address | null>(null);
  const [info, setInfo] = useState<GloakInfo | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const t = await gloakAddress();
      if (!alive) return;
      setToken(t);
      if (t) readGloak(publicClient, t).then((i) => alive && setInfo(i)).catch(() => {});
    };
    load();
    const id = setInterval(() => lookup && lookup.at < lastGloakCheck() && load(), 15 * 60_000); // an open tab picks up the next daily check
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return { token, info, is: (a) => !!token && !!a && a.toLowerCase() === token.toLowerCase() };
}

const pct = (bps: number) => `${(bps / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;

/** Under a GLOAK withdrawal: what burns and what arrives. */
export function GloakWithdrawNote({ amount, info }: { amount: bigint; info: GloakInfo | null }) {
  const bps = info?.surchargeBps ?? 1000;
  return (
    <div className="summary small" role="note" style={{ marginBottom: 12 }}>
      <b>GLOAK burns {pct(bps)} when it leaves for a wallet.</b>{" "}
      {amount > 0n ? <>{tokens(amount)} out means <b className="mono">{tokens(gloakArrives(amount, bps))}</b> arrives and {tokens(amount - gloakArrives(amount, bps))} is burned. </> : null}
      Moving it on from that wallet burns {pct(bps)} again. Trading privately and shielding back in are free.
    </div>
  );
}

/** The launch page's card for GLOAK: its rules and where it is right now. */
export function GloakCard({ info }: { info: GloakInfo | null }) {
  const bps = info?.surchargeBps ?? 1000;
  const m = info?.meter;
  const live = info && m ? info.totalSupply - m.atDead : 0n;
  const share = (x: bigint) => (live > 0n ? Number((x * 10_000n) / live) / 100 : 0);
  const rows: [string, bigint][] = m ? [["In private vaults", m.inVaults], ["In the pool", m.inPool], ["In Cloak's contracts", m.inContracts], ["In public wallets", m.inPublic]] : [];
  return (
    <div className="card">
      <div className="card-head"><h3>A private-only token</h3><span className="pill ok">GLOAK</span></div>
      <ul className="small soft" style={{ margin: "0 0 12px", paddingLeft: 18 }}>
        <li>Bidding and claiming are free, from a private balance or a wallet.</li>
        <li>Shielding into your private balance and trading privately are free.</li>
        <li>Withdrawing to a wallet, or sending between wallets, burns {pct(bps)}.</li>
        <li>Its pool only trades through private routers, so it can't be bought or sold in public.</li>
      </ul>
      {m && (
        <>
          <div className="progress" aria-label={`${pct(m.privateBps)} of GLOAK is private`}><i style={{ width: `${m.privateBps / 100}%` }} /></div>
          <p className="small" style={{ margin: "8px 0 12px" }}><b>{pct(m.privateBps)}</b> of GLOAK is in private vaults.</p>
          <div className="swap-facts">
            {rows.map(([k, v]) => (
              <div key={k} className="row"><span>{k}</span><span className="mono">{tokens(v)} · {share(v)}%</span></div>
            ))}
            <div className="row"><span>Burned by the surcharge</span><span className="mono">{tokens(info!.surchargeBurned)}</span></div>
            <div className="row"><span>Locked at 0x…dEaD</span><span className="mono">{tokens(m.atDead)}</span></div>
          </div>
        </>
      )}
    </div>
  );
}
