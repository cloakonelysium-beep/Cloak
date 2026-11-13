import { useEffect, useRef, useState, type ReactNode } from "react";
import { addrLink, FACTORY, GLOAM } from "../config";
import { Link } from "../router";
import { GITHUB, Icon, LINKEDIN, Logo, Nav, TELEGRAM } from "../ui";

const SLIDES = ["Cloak", "Problem", "Insight", "Product", "Launch", "Different", "Live", "Distribution", "GLOAK", "Model", "Roadmap", "Team", "Close"];

function Slide({ i, dark, children, className = "" }: { i: number; dark?: boolean; children: ReactNode; className?: string }) {
  return (
    <section className={`slide ${dark ? "slide-dark" : ""} ${className}`} id={`s${i + 1}`} data-slide={i}>
      <div className="slide-in">
        <div className="slide-n">{String(i + 1).padStart(2, "0")} / {SLIDES.length} · {SLIDES[i]}</div>
        {children}
      </div>
    </section>
  );
}

function Contract({ name, addr }: { name: string; addr?: string }) {
  if (!addr) return null;
  return (
    <a className="p-contract" href={addrLink(addr)} target="_blank" rel="noreferrer">
      <span>{name}</span>
      <span className="mono">{addr.slice(0, 8)}…{addr.slice(-6)} ↗</span>
    </a>
  );
}

export function Pitch() {
  const [cur, setCur] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "Cloak · Pitch";
    document.documentElement.classList.add("snap");
    const els = [...(root.current?.querySelectorAll<HTMLElement>("[data-slide]") ?? [])];
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setCur(Number((e.target as HTMLElement).dataset.slide))), { threshold: 0.55 });
    els.forEach((el) => io.observe(el));
    const go = (d: number) => {
      const now = els.findIndex((el) => Math.abs(el.getBoundingClientRect().top - 68) < innerHeight / 2);
      els[Math.max(0, Math.min(els.length - 1, (now < 0 ? 0 : now) + d))]?.scrollIntoView({ behavior: "smooth" });
    };
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea")) return;
      if (["ArrowDown", "PageDown", " "].includes(e.key)) { e.preventDefault(); go(1); }
      if (["ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); go(-1); }
    };
    addEventListener("keydown", key);
    return () => {
      io.disconnect();
      removeEventListener("keydown", key);
      document.documentElement.classList.remove("snap");
      document.title = "Cloak · Fair launches and private trading on Elysium";
    };
  }, []);

  return (
    <>
      <Nav />
      <div className="pitch" ref={root}>
        <nav className="pitch-rail" aria-label="Slides">
          {SLIDES.map((s, i) => <a key={s} href={`#s${i + 1}`} className={i === cur ? "on" : ""} aria-label={s} title={s} onClick={(e) => { e.preventDefault(); document.getElementById(`s${i + 1}`)?.scrollIntoView({ behavior: "smooth" }); }} />)}
        </nav>

        <Slide i={0} dark className="slide-cover">
          <img className="cover-art" src="/hero/crowd.webp" alt="" />
          <div className="cover-copy">
            <div className="brand" style={{ fontSize: 22 }}><Logo inverse size={34} />Cloak</div>
            <h1 className="p-title">Private launches and trades for Elysium.</h1>
            <p className="p-lede">Sealed-bid launches nobody can snipe, and private trading nobody can trace. Built by Bob Labs.</p>
            <div className="hero-actions"><Link to="/app" className="btn btn-primary btn-lg">Try it on testnet</Link><span className="xs" style={{ color: "var(--deep-soft)" }}>Press ↓ or scroll</span></div>
          </div>
        </Slide>

        <Slide i={1}>
          <h2 className="p-h">On Elysium, speed wins and everything shows.</h2>
          <div className="p-two">
            <div className="p-card">
              <div className="p-big">~0.15 s</div>
              <h3>Launches are a race</h3>
              <p>One sequencer orders transactions first come, first served, a block every ~0.15 s. The fastest bot buys the first block of every launch, and real buyers pay the markup.</p>
            </div>
            <div className="p-card">
              <div className="p-big">100%</div>
              <h3>Every trade is a postcard</h3>
              <p>Every buy, sell and balance is public forever and tied to a wallet. Holders get tracked, sizes get copied, and big positions become targets.</p>
            </div>
          </div>
        </Slide>

        <Slide i={2}>
          <h2 className="p-h" style={{ maxWidth: 900 }}>Privacy has to start at the launch, not after it.</h2>
          <p className="p-lede" style={{ maxWidth: 720 }}>By the time a token trades, the snipe has already happened and every buyer's wallet is already linked to it. A mixer added later can't undo either. Cloak seals the bid, then keeps the holder private from the first trade on.</p>
        </Slide>

        <Slide i={3}>
          <h2 className="p-h">One layer, three parts</h2>
          <div className="p-three">
            <div className="p-card"><Icon.rocket /><h3>Sealed-bid launch</h3><p>Bids are sealed until bidding ends, then open themselves. Everyone pays one clearing price, and the token opens on Uniswap at that price with its liquidity locked.</p></div>
            <div className="p-card"><Icon.lock /><h3>Private vault</h3><p>Hold, swap and send launch tokens from a private balance. A relayer submits for you, so your wallet never appears.</p></div>
            <div className="p-card"><Icon.layers /><h3>Batch auctions</h3><p>Orders in standard sizes, crossed at the fair price every round. Nobody can tell how much you traded.</p></div>
          </div>
        </Slide>

        <Slide i={4}>
          <h2 className="p-h">A launch where speed buys nothing</h2>
          <div className="steps" style={{ marginTop: 34 }}>
            <div className="step"><span className="n">01</span><h3>Seal</h3><p>Price and size are hashed and timelock-encrypted to a future drand round. The chain only stores the fingerprint.</p></div>
            <div className="step"><span className="n">02</span><h3>Auto-reveal</h3><p>When bidding closes, the public drand beacon releases the key. Anyone can open every bid, nobody can change one.</p></div>
            <div className="step"><span className="n">03</span><h3>One price</h3><p>Demand is walked from the top until supply runs out. That's the price every winner pays.</p></div>
            <div className="step"><span className="n">04</span><h3>Locked LP</h3><p>Part of the raise opens a Uniswap pool at that price. The liquidity is locked forever and the creator earns its trading fees, so nobody can pull it.</p></div>
          </div>
        </Slide>

        <Slide i={5}>
          <h2 className="p-h" style={{ maxWidth: 860 }}>No committee, no operator, no new chain</h2>
          <div className="compare" style={{ marginTop: 34 }}>
            <div className="cmp">
              <span className="eyebrow">Other sealed or private designs</span>
              <h3>Someone else holds the key.</h3>
              <p>FHE or MPC networks, trusted hardware, or an off-chain operator who sees bids first. None of them run on Elysium today.</p>
            </div>
            <div className="cmp us">
              <span className="eyebrow">Cloak</span>
              <h3>A public clock opens the bids. Your device makes the proofs.</h3>
              <p>drand timelock for bids, zero-knowledge proofs made in the browser for the vault. Plain EVM contracts that nobody can withdraw from. Loosening any rule waits a public 3-day delay.</p>
            </div>
          </div>
        </Slide>

        <Slide i={6}>
          <h2 className="p-h">It's live on Elysium testnet</h2>
          <div className="p-stats">
            <div><b>360+</b><span>contract tests passing, fuzzing included</span></div>
            <div><b>~4 s</b><span>to prove a private trade in the browser</span></div>
            <div><b>0</b><span>people needed to run a launch: the keeper reveals, settles and lists it</span></div>
            <div><b>Nov 12</b><span>redeployed on the final contracts, every role on a fresh owner wallet</span></div>
          </div>
          <div className="p-contracts">
            <Contract name="Launch factory" addr={FACTORY} />
            <Contract name="Cloak's launch vault (run by Cloak)" addr={GLOAM?.launchVault} />
            <Contract name="Batch rounds" addr={GLOAM?.batcherV4} />
          </div>
        </Slide>

        <Slide i={7}>
          <h2 className="p-h" style={{ maxWidth: 860 }}>Distribution: plug into launchpads, don't compete with them</h2>
          <div className="p-three">
            <div className="p-card"><Icon.code /><h3>One SDK</h3><p><code>createLaunch()</code> gives any Elysium launchpad a sealed, fair-launch mode. <code>GloamPrivate</code> gives its users private balances on Gloam.</p></div>
            <div className="p-card"><Icon.users /><h3>Launchpads first</h3><p>A fair-launch mode any Elysium launchpad can add: projects keep their launchpad, buyers get one price and no snipers.</p></div>
            <div className="p-card"><Icon.shield /><h3>Wallets, DEXes and agents</h3><p>Every launch is a standard Uniswap pool and appears in a public token list. An MCP server lets AI agents launch and trade privately too.</p></div>
          </div>
        </Slide>

        <Slide i={8}>
          <h2 className="p-h" style={{ maxWidth: 860 }}>GLOAK: a token that only lives in private</h2>
          <div className="p-three">
            <div className="p-card"><Icon.lock /><h3>Free inside, 10% outside</h3><p>Shielding and trading privately cost nothing. Every move to a public address burns 10%, a rate that can be lowered, never raised.</p></div>
            <div className="p-card"><Icon.layers /><h3>One private pool</h3><p>Its only Uniswap pool trades through approved private routers, so it can't be bought or sold in public.</p></div>
            <div className="p-card"><Icon.rocket /><h3>Born in one sealed launch</h3><p>500,000 supply, no team share, no minting after launch. 70% of the raise goes into the pool, locked forever.</p></div>
          </div>
          <p className="p-tag" style={{ marginTop: 22 }}><Link to="/gloak" className="arrow">Live supply, privacy and pool stats</Link></p>
        </Slide>

        <Slide i={9}>
          <h2 className="p-h">Business model</h2>
          <p className="p-tag">Built into the contracts · hard caps written into the code · relaying is free for users: Cloak pays the gas from fee income</p>
          <div className="p-three">
            <div className="p-card"><div className="p-big">1.5%</div><h3>Launch fee</h3><p>Of each raise at settlement, only when the launch fills. Nothing if it doesn't. Capped at 3%.</p></div>
            <div className="p-card"><div className="p-big">20%</div><h3>Of pool trading fees</h3><p>Every trade in a launch's Uniswap pool pays 0.3% (more in the first 5 minutes). Cloak keeps 20% of it, the creator 80%.</p></div>
            <div className="p-card"><div className="p-big">0.25%</div><h3>On private sales</h3><p>Of what a private sale out of Cloak's vaults brings, in HYPE or USDC (capped at 1%). Plus half of Gloam's 0.5% exit fee on Cloak's flow, shared monthly.</p></div>
          </div>
        </Slide>

        <Slide i={10}>
          <h2 className="p-h">Roadmap</h2>
          <div className="p-road">
            <div className="on"><span className="eyebrow">Now · testnet</span><h3>Launches, vault, SDK</h3><p>Sealed bids, one price, Uniswap pools with liquidity locked forever and creator fees. Private balances, swaps, sends, payment links, batch auctions and bids from a private balance. SDK and MCP server on npm. One site for testnet and mainnet.</p></div>
            <div><span className="eyebrow">Next · mainnet</span><h3>Mainnet on Elysium</h3><p>On Gloam's live vault and final keys, with one memo board shared by Cloak and Gloam and deposit caps that grow with Gloam. Then GLOAK's launch, an audit of Cloak's own contracts and higher caps.</p></div>
            <div><span className="eyebrow">After</span><h3>Grow</h3><p>$CLOAK with buyback and burn from revenue, private xStocks, partner launchpads in Cloak's ecosystem vault, and more chains on one site.</p></div>
          </div>
        </Slide>

        <Slide i={11}>
          <h2 className="p-h">Team</h2>
          <div className="p-team">
            <div className="p-card">
              <div className="brand" style={{ fontSize: 22 }}>Bob Labs</div>
              <p style={{ marginTop: 14 }}>We build privacy tools for public chains. Cloak is our launch and trading product on Elysium: sealed-bid auctions, a private vault and batch trading, all open source.</p>
              <div className="row-flex" style={{ gap: 14, marginTop: 18, flexWrap: "wrap" }}>
                <a className="arrow" href="https://oncloak.xyz" target="_blank" rel="noreferrer">oncloak.xyz</a>
                <a className="arrow" href="https://gloam.trade" target="_blank" rel="noreferrer">In partnership with Gloam</a>
                <a className="arrow" href={GITHUB} target="_blank" rel="noreferrer">GitHub</a>
                <a className="arrow" href={TELEGRAM} target="_blank" rel="noreferrer">Telegram</a>
                <a className="arrow" href={LINKEDIN} target="_blank" rel="noreferrer">LinkedIn</a>
              </div>
            </div>
          </div>
        </Slide>

        <Slide i={12} dark className="slide-close">
          <img className="close-art" src="/hero/cloaked.webp" alt="" />
          <div className="close-copy">
            <h2 className="p-title">Launch sealed.<br />Trade unseen.</h2>
            <p className="p-lede">Try a sealed bid, a private swap and a batch order on Elysium testnet. It takes about two minutes.</p>
            <div className="hero-actions" style={{ justifyContent: "center" }}>
              <Link to="/app" className="btn btn-primary btn-lg">Open the app</Link>
              <Link to="/docs" className="btn btn-ghost btn-lg">Read the docs</Link>
            </div>
          </div>
        </Slide>
      </div>
    </>
  );
}
