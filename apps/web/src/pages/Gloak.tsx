import { useEffect, useState } from "react";
import { parseAbi, type Address } from "viem";
import type { AuctionState } from "@cloakely/sdk";
import { Link } from "../router";
import { Icon } from "../ui";
import { FACTORY, addrLink } from "../config";
import { dailyCache, gloakAddress, lastGloakCheck, useGloak } from "../gloak";
import { hype, short, tokens } from "../format";
import { useApp } from "../state";
import { publicClient, readCloak } from "../wallet";
import { useMarkets } from "./markets";

/**
 * The GLOAK experiment (docs/GLOAK.md): a token that only lives in private vaults. Before its launch the page shows the
 * token, the thesis and "Coming soon"; while bidding is open, a Bid button; after it, the numbers from its pool and its
 * own meter(). It asks the chain once a day (GLOAK_CHECK_HOUR_UTC in ../gloak.tsx); shorten that when the launch is near.
 *
 * Every state is read from the chain of the network this site serves (FACTORY and publicClient come from config, which
 * picks the network by hostname), so mainnet and testnet never affect each other: a launch on testnet opens bidding on
 * testnet.oncloak.xyz only, and mainnet shows "Coming soon" until GLOAK's launch exists on mainnet's own factory.
 */

const DESCRIPTION =
  "An experiment from Cloak: a token made to live in private. Holding and trading it inside Cloak's private vaults is free, and 10% of it is burned every time it moves to a public address.";

const LAUNCHES = parseAbi([
  "function launchesCount() view returns (uint256)",
  "function launches(uint256) view returns (address auction, address token, address creator, address launchpad, uint256 creatorAlloc, address vesting)",
]);

const auctionCache = dailyCache<Address | null>("auction");

/** GLOAK's launch (the door's one launch): the newest launch of the factory whose token is GLOAK. Found is final; a
 * miss is kept until the next daily check, like the token lookup. */
async function findAuction(token: Address): Promise<Address | null> {
  const kept = auctionCache.get();
  if (kept?.v) return kept.v;
  if (kept) return null;
  const a = await searchAuction(token);
  auctionCache.set(a);
  return a;
}

async function searchAuction(token: Address): Promise<Address | null> {
  if (!FACTORY) return null;
  const n = Number(await publicClient.readContract({ address: FACTORY, abi: LAUNCHES, functionName: "launchesCount" }));
  for (let i = n - 1; i >= 0 && i >= n - 200; i--) {
    const [auction, t] = await publicClient.readContract({ address: FACTORY, abi: LAUNCHES, functionName: "launches", args: [BigInt(i)] });
    if (t.toLowerCase() === token.toLowerCase()) return auction;
  }
  return null;
}

const pct = (bps: number) => `${(bps / 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
const shareBps = (x: bigint, of: bigint) => (of > 0n ? Number((x * 10_000n) / of) : 0);
const compact = (wei: bigint) => {
  const n = Number(wei / 10n ** 14n) / 10_000;
  return n >= 1000 ? `${(n / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}K` : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

/** A ring of ticks: either the first `bps` lit in one colour, or split into coloured parts. */
function Ring({ size = 150, bps, color, parts, children }: { size?: number; bps?: number; color?: string; parts?: [bigint, string][]; children: React.ReactNode }) {
  const n = 72;
  const total = parts ? parts.reduce((a, [v]) => a + v, 0n) : 0n;
  const colorAt = (i: number): string => {
    if (!parts) return i < Math.round(((bps ?? 0) / 10_000) * n) ? color! : "var(--gk-off)";
    if (total === 0n) return "var(--gk-off)";
    let acc = 0n;
    const at = ((BigInt(i) * 2n + 1n) * total) / BigInt(2 * n);
    for (const [v, c] of parts) {
      acc += v;
      if (at < acc) return c;
    }
    return parts[parts.length - 1][1];
  };
  return (
    <div className="gk-ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 150 150" width={size} height={size} aria-hidden>
        {Array.from({ length: n }, (_, i) => {
          const a = (i / n) * 2 * Math.PI - Math.PI / 2;
          const c = colorAt(i);
          const r2 = c === "var(--gk-off)" ? 66 : 70;
          return <line key={i} x1={75 + 56 * Math.cos(a)} y1={75 + 56 * Math.sin(a)} x2={75 + r2 * Math.cos(a)} y2={75 + r2 * Math.sin(a)} stroke={c} strokeWidth="2.4" strokeLinecap="round" />;
        })}
      </svg>
      <div className="gk-ring-label">{children}</div>
    </div>
  );
}

function Tile({ title, sub, children, foot }: { title: string; sub: string; children: React.ReactNode; foot: [string, string][] }) {
  return (
    <div className="gk-tile">
      <h3>{title}</h3>
      <div className="gk-sub">{sub}</div>
      {children}
      <div className="gk-foot">
        {foot.map(([k, v]) => (
          <div key={k}>
            <div className="k">{k}</div>
            <div className="v">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const STEPS: [string, string][] = [
  ["Born in one sealed launch", "Sealed bids, one clearing price for every winner, then a Uniswap pool at that price with 70% of the raise locked in it forever. No team share."],
  ["Free inside", "Shielding GLOAK into a private balance and trading it privately cost nothing. Winning bids are paid out without a surcharge."],
  ["10% to leave", "Every move to a public address burns 10%: a withdrawal to a wallet, or a send between wallets."],
  ["A pool only private routers can use", "Before every swap, the pool asks the token who's trading. Cloak's private routers pass; Uniswap's own router, aggregators and bots are refused."],
];

const RULES = [
  "500,000 GLOAK, all made at launch. No minting after, no team share, no proxy.",
  "The 10% surcharge can be lowered, never raised.",
  "The admin can approve vaults and routers (3 days in public), remove approvals, lower the surcharge or give up the role. It can't move anyone's GLOAK.",
];

export function Gloak() {
  const { toast } = useApp();
  const { token, info } = useGloak();
  const { markets } = useMarkets();
  const market = token ? markets?.find((x) => x.token.toLowerCase() === token.toLowerCase()) : undefined;
  const [auction, setAuction] = useState<Address | null>(null);
  const [launch, setLaunch] = useState<AuctionState | null>(null);
  const [checked, setChecked] = useState(false); // the first look for GLOAK's launch has finished

  // GLOAK's launch on this network: the Bid button opens it while bidding is open, and its Uniswap pool is linked once it
  // trades. Read when the page opens, then at the daily check (GLOAK_CHECK_HOUR_UTC) if the tab stays open.
  useEffect(() => {
    let alive = true;
    let at = 0;
    const load = async () => {
      at = Date.now();
      try {
        const t = token ?? (await gloakAddress());
        const a = t ? await findAuction(t) : null;
        const s = a ? await readCloak.getAuction(a) : null;
        if (!alive) return;
        setAuction(a);
        setLaunch(s);
      } catch {
        // a failed read keeps what was shown
      } finally {
        if (alive) setChecked(true);
      }
    };
    load();
    const id = setInterval(() => at < lastGloakCheck() && load(), 15 * 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [token]);

  const m = info?.meter;
  const live = info && m ? info.totalSupply - m.atDead : 0n; // circulating
  const price = market?.price ?? 0n; // HYPE (wei) per whole GLOAK
  const cap = (price * live) / 10n ** 18n;
  const trading = !!market && !!info && !!m;
  const bidOpen = !!auction && launch?.phase === "commit";
  const settling = !!auction && !!launch && !trading && launch.phase !== "commit"; // bids closed, not trading yet

  return (
    <>
      <div className="card token-card">
        <img className="token-icon" src="/tokens/gloak.svg" alt="GLOAK" width={64} height={64} />
        <div className="token-card-main">
          <div className="token-card-title">
            <h1>GLOAK</h1>
            <span className="tc-ticker">$GLOAK</span>
          </div>
          {trading && token && (
            <div className="token-card-ca">
              <button className="ca-btn mono" onClick={() => { navigator.clipboard?.writeText(token).catch(() => {}); toast("Contract address copied"); }} title="Copy GLOAK's contract address">
                {short(token)} <Icon.copy size={13} />
              </button>
              {addrLink(token) && <a href={addrLink(token)} target="_blank" rel="noreferrer" className="link">Explorer ↗</a>}
              {launch?.uniPair && addrLink(launch.uniPair) && <a href={addrLink(launch.uniPair)} target="_blank" rel="noreferrer" className="link">Uniswap v4 pool ↗</a>}
            </div>
          )}
          <p className="token-card-desc">{DESCRIPTION}</p>
        </div>
        <div className="token-card-share">
          {trading ? (
            <Link to={`/app/trade?token=${token}`} className="btn btn-ink">Get GLOAK privately</Link>
          ) : bidOpen ? (
            <Link to={`/app/launch/${auction}`} className="btn btn-ink">Bid</Link>
          ) : settling ? (
            <Link to={`/app/launch/${auction}`} className="btn btn-ghost">Bidding closed · see results</Link>
          ) : checked ? (
            <span className="pill gk-soon" title="GLOAK's sealed-bid launch hasn't opened yet">Coming soon</span>
          ) : null}
        </div>
      </div>

      {trading && (
        <>
          <div className="stats">
            <div className="stat"><div className="k">Price</div><div className="v">{hype(price, 8)} <span className="small mute">HYPE</span></div></div>
            <div className="stat"><div className="k">Market cap</div><div className="v">{hype(cap, 2)} <span className="small mute">HYPE</span></div></div>
            <div className="stat"><div className="k">Liquidity</div><div className="v">{hype(market!.reserveHype, 2)} <span className="small mute">HYPE</span></div><div className="xs mute" style={{ marginTop: 4 }}>Locked forever</div></div>
            <div className="stat"><div className="k">GLOAK in the pool</div><div className="v">{tokens(market!.reserveToken)}</div><div className="xs mute" style={{ marginTop: 4 }}>Alongside the HYPE</div></div>
          </div>

          <div className="eyebrow" style={{ margin: "28px 0 12px" }}>Statistics</div>
          <div className="gk-tiles">
            <Tile title="How private" sub="GLOAK in private vaults, now" foot={[["In vaults", compact(m!.inVaults)], ["In wallets", compact(m!.inPublic)]]}>
              <Ring bps={m!.privateBps} color="var(--gk-private)">
                <div className="k">Private</div>
                <div className="v">{pct(m!.privateBps)}</div>
              </Ring>
            </Tile>
            <Tile title="Where GLOAK is" sub="Every GLOAK in circulation" foot={[]}>
              <Ring parts={[[m!.inVaults, "var(--gk-private)"], [m!.inPool, "var(--gk-pool)"], [m!.inContracts, "var(--gk-contracts)"], [m!.inPublic, "var(--gk-public)"]]}>
                <div className="k">Circulating</div>
                <div className="v">{compact(live)}</div>
              </Ring>
              <div className="gk-legend">
                {([["Vaults", m!.inVaults, "--gk-private"], ["Pool", m!.inPool, "--gk-pool"], ["Contracts", m!.inContracts, "--gk-contracts"], ["Wallets", m!.inPublic, "--gk-public"]] as const).map(([k, v, c]) => (
                  <span key={k}><span><i style={{ background: `var(${c})` }} />{k}</span>{pct(shareBps(v, live))}</span>
                ))}
              </div>
            </Tile>
            <Tile title="Burned" sub="By the 10% surcharge" foot={[["Burned", compact(info!.surchargeBurned)], ["Supply now", compact(info!.totalSupply)]]}>
              <Ring bps={shareBps(info!.surchargeBurned, info!.surchargeBurned + info!.totalSupply)} color="var(--gk-burn)">
                <div className="k">Burned</div>
                <div className="v">{pct(shareBps(info!.surchargeBurned, info!.surchargeBurned + info!.totalSupply))}</div>
              </Ring>
            </Tile>
            <Tile title="The pool" sub="Private routers only" foot={[["HYPE", compact(market!.reserveHype)], ["GLOAK", compact(market!.reserveToken)]]}>
              <Ring parts={[[1n, "var(--gk-pool)"]]}>
                <div className="k">Locked</div>
                <div className="v">∞</div>
              </Ring>
            </Tile>
          </div>
        </>
      )}

      {market && !info && <div className="empty">Reading GLOAK…</div>}

      <div className="card gk-thesis">
        <h2>Thesis</h2>
        <p>GLOAK is, first of all, an experimental token. On a public chain, privacy is opt-in: the few who go private stand out, and everyone else can be tracked, copied or targeted. GLOAK tests the opposite. Its rules make private the cheap place to be and public the expensive one, so holding it privately is the normal case and the private crowd is everyone who holds it. Its price is public, as for any Uniswap pool. Who holds GLOAK, and how much, is not.</p>
        <h4>How it works</h4>
        <ol>
          {STEPS.map(([h, t]) => <li key={h}><b>{h}.</b> {t}</li>)}
        </ol>
        <h4>Rules</h4>
        <ul>
          {RULES.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </div>

      <p className="xs mute gk-disclaimer">
        <b>Disclaimer.</b> GLOAK is Cloak's token. It isn't Gloam's and has nothing to do with $GLOAM. It is a launch experiment, not an investment. Nothing on this page is financial advice. It has no team share, no roadmap and no promises attached. Moving it to a public address burns 10%. Check that holding it is allowed where you live.
      </p>
    </>
  );
}
