import { Link } from "../router";
import { GITHUB } from "../ui";
import { chain } from "../config";
import { useGloak } from "../gloak";
import { hype, tokens } from "../format";
import { useMarkets } from "./markets";

/**
 * The GLOAK experiment (docs/GLOAK.md): a token that only lives in private vaults. Before the launch factory's one-time
 * door is used the page shows the plan; after it, the token's own meter() and its pool, read live from the chain.
 */

const pct = (bps: number) => `${(bps / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
const share = (x: bigint, of: bigint) => (of > 0n ? pct(Number((x * 10_000n) / of)) : "0%");

function Stat({ k, v, unit, sub }: { k: string; v: string; unit?: string; sub?: string }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v">{v} {unit && <span className="small mute">{unit}</span>}</div>
      {sub && <div className="xs mute" style={{ marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

// the launch plan (deployments/elysium-mainnet-gloak.input.json, docs/GLOAK.md)
const PLAN: [string, string, string?][] = [
  ["Total supply", "500,000", "GLOAK"],
  ["For sale", "294,000", "GLOAK"],
  ["Paired with HYPE in the pool", "206,000", "GLOAK"],
  ["Team share", "None"],
  ["Raise into the pool", "70%", ""],
  ["Price range", "0.0002 to 0.01", "HYPE"],
  ["Surcharge to a public address", "10%", ""],
  ["Minting after launch", "None"],
];

const RULES = [
  "Shielding into a private balance is free, and so is trading privately.",
  "Withdrawing to a wallet, or sending between wallets, burns 10%. The rate can be lowered, never raised.",
  "Its only pool trades through approved private routers, so it can't be bought or sold in public.",
  "Bidding in its launch and claiming are free. The app only offers private bids for it.",
  "No team share, no minting after launch, no proxy. The admin can approve vaults and routers (3 days in public), remove approvals, lower the surcharge or renounce. It can't move anyone's GLOAK.",
];

export function Gloak() {
  const { token, info } = useGloak();
  const { markets } = useMarkets();
  const m = info?.meter;
  const market = token ? markets?.find((x) => x.token.toLowerCase() === token.toLowerCase()) : undefined;
  const live = info && m ? info.totalSupply - m.atDead : 0n;
  const price = market?.price ?? 0n; // HYPE (wei) per whole GLOAK
  const cap = (price * live) / 10n ** 18n;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">The GLOAK experiment</div>
          <h1>A token that only lives in private</h1>
          <p>GLOAK is free to hold and trade inside private vaults, and burns 10% every time it moves to a public address. These numbers come straight from the token's own meter on {chain.name}.</p>
        </div>
        {token ? <span className="pill"><span className="dot live" />Live · refreshes every minute</span> : <span className="pill">Not launched yet</span>}
      </div>

      {!token && (
        <>
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-head"><h3>Not launched yet on {chain.name}</h3></div>
            <p className="small soft" style={{ margin: 0 }}>GLOAK is born in one sealed-bid launch, through a one-time door only Cloak's owner wallet can use. Until then, this is the plan. The live numbers appear here the moment it launches.</p>
          </div>
          <div className="stats">
            {PLAN.map(([k, v, u]) => <Stat key={k} k={k} v={v} unit={u} />)}
          </div>
        </>
      )}

      {token && !info && <div className="empty">Reading GLOAK on {chain.name}…</div>}

      {token && info && m && (
        <>
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-head"><h3>How private is GLOAK right now?</h3><span className="pill ok">{pct(m.privateBps)} private</span></div>
            <div className="progress" aria-label={`${pct(m.privateBps)} of GLOAK is in private vaults`}><i style={{ width: `${m.privateBps / 100}%` }} /></div>
            <p className="xs mute" style={{ margin: "8px 0 0" }}>The share of GLOAK in private vaults, out of everything not locked at 0x…dEaD.</p>
          </div>

          <div className="stats">
            <Stat k="Total supply" v={tokens(info.totalSupply)} unit="GLOAK" sub="500,000 at launch, less what the surcharge burned" />
            <Stat k="Burned by the surcharge" v={tokens(info.surchargeBurned)} unit="GLOAK" sub={`${pct(info.surchargeBps)} of every move to a public address`} />
            <Stat k="Locked at 0x…dEaD" v={tokens(m.atDead)} unit="GLOAK" sub="Never moves again" />
            <Stat k="Circulating" v={tokens(live)} unit="GLOAK" />
          </div>

          <div className="stats">
            <Stat k="Private (in vaults)" v={tokens(m.inVaults)} unit="GLOAK" sub={share(m.inVaults, live)} />
            <Stat k="Public (in wallets)" v={tokens(m.inPublic)} unit="GLOAK" sub={share(m.inPublic, live)} />
            <Stat k="In the pool" v={tokens(m.inPool)} unit="GLOAK" sub={share(m.inPool, live)} />
            <Stat k="In Cloak's contracts" v={tokens(m.inContracts)} unit="GLOAK" sub={`${share(m.inContracts, live)} · auction, routers, private bids`} />
          </div>

          <div className="stats">
            <Stat k="Pool liquidity" v={market ? hype(market.reserveHype, 4) : "…"} unit="HYPE" sub={market ? `and ${tokens(market.reserveToken)} GLOAK, locked forever` : "Opens when the launch settles"} />
            <Stat k="Price" v={market ? hype(price, 8) : "…"} unit="HYPE" sub="Per GLOAK, from the pool" />
            <Stat k="Market cap" v={market ? hype(cap, 2) : "…"} unit="HYPE" sub="Price × circulating supply" />
            <Stat k="Surcharge" v={pct(info.surchargeBps)} sub={info.setupMode ? "Setup: approvals are still being made" : "Setup ended: new approvals wait 3 days in public"} />
          </div>
        </>
      )}

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-head"><h3>The rules</h3><span className="xs mute">Written into the token. Nobody can change them to move your GLOAK.</span></div>
        <ul className="small soft" style={{ margin: 0, paddingLeft: 18 }}>
          {RULES.map((r) => <li key={r} style={{ marginBottom: 6 }}>{r}</li>)}
        </ul>
      </div>

      <div className="row-flex" style={{ gap: 12, marginTop: 18, flexWrap: "wrap" }}>
        {token && <Link to="/app/trade" className="btn btn-ink">Trade GLOAK privately</Link>}
        <Link to="/docs#gloak" className="btn btn-ghost">How it works</Link>
        <a className="btn btn-ghost" href={`${GITHUB}/blob/main/docs/GLOAK.md`} target="_blank" rel="noreferrer">Full write-up ↗</a>
      </div>
      <p className="xs mute" style={{ marginTop: 14 }}>An experiment. GLOAK has no team share and no promises attached. Hold only what you're happy to lose.</p>
    </>
  );
}
