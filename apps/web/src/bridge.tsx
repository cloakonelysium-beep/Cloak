import { useEffect, useMemo, useState } from "react";
import { formatUnits, numberToHex, parseUnits, type Address, type Hex } from "viem";
import { RELAY_DESTINATIONS, RELAY_SOURCES, relayQuote, relayServes, relayStatus, validRefundAddress, type RelayQuote, type RelayStage } from "@cloakely/sdk";
import { ASSETS, CHAIN_ID } from "./config";
import { ensureElysium, publicClient, type Eip1193 } from "./wallet";
import { useApp } from "./state";
import { QR } from "./qr";
import { Icon, More, Powered, TokenIcon } from "./ui";
import { TokenSheet, type SheetToken } from "./tokenPicker";
import { every } from "./every";
import { showBalance, sourceBalance } from "./bridgeBalances";
import { friendly } from "./errors";

/** Shown on Elysium mainnet (Relay doesn't serve the testnet), or anywhere with VITE_BRIDGE_PREVIEW=1 to review it. */
const PREVIEW = import.meta.env.VITE_BRIDGE_PREVIEW === "1";
/** Where a preview quotes into (Relay prices it, nothing is sent from here). */
const DEST = relayServes(CHAIN_ID) ? CHAIN_ID : 99901;
const LIVE = relayServes(CHAIN_ID);

/** Network logos (Relay's chain icons, kept in /chains), and Elysium's own mark. */
const CHAIN_LOGOS = new Set([42161, 8453, 1, 56, 10, 137, 43114, 143, 130, 59144, 480, 146, 5000, 80094, 324, 534352, 57073]);
export const ELYSIUM_LOGO = "/brand/elysium.svg";
export const chainLogo = (id: number): string | undefined => (id === 99901 || id === 99801 ? ELYSIUM_LOGO : id === 999 ? "/tokens/hype.svg" : CHAIN_LOGOS.has(id) ? `/chains/${id}.png` : undefined);

/** A bridge on its way, kept on this device so a reload keeps following it. */
interface Pending {
  requestId: string;
  to: Address;
  line: string;
  at: number;
  stage: RelayStage;
}
const KEY = "cloak.bridges";
const loadPending = (): Pending[] => {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? "[]") as Pending[]).filter((p) => Date.now() - p.at < 3 * 86_400_000);
  } catch {
    return [];
  }
};
const savePending = (x: Pending[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(x.slice(-20)));
  } catch {}
};

const STAGE: Record<RelayStage | "in", string> = {
  waiting: "Waiting for your deposit",
  moving: "On its way to Elysium",
  done: "Arrived. Moving into your private balance",
  // shown once the receive address is empty again: the payment is in the private balance
  in: "In your private balance",
  failed: "Failed. Relay refunds it to your refund address",
  refunded: "Refunded to your refund address",
};

/** Wait for a transaction on whatever chain the wallet is on, asking the wallet's own node. */
async function mined(eth: Eip1193, hash: string) {
  for (let i = 0; i < 120; i++) {
    const r = (await eth.request({ method: "eth_getTransactionReceipt", params: [hash] }).catch(() => null)) as { status?: string } | null;
    if (r?.status) {
      if (r.status !== "0x1") throw new Error("The transaction failed on the source chain.");
      return;
    }
    await new Promise((s) => setTimeout(s, 2000));
  }
  throw new Error("The transaction is taking long to confirm. Check your wallet.");
}

/**
 * Money in from another chain or an exchange, through Relay, landing at one of the account's receive addresses.
 * `recipient` gives that address when a route is asked for: an unused one, never one another bridge still delivers to
 * (`avoid`), so two payments can't be linked. The Receive page moves what arrives into the private balance;
 * `onArrived` asks it to do so at once.
 */
export function BridgeIn({ recipient, onArrived }: { recipient: (avoid: string[]) => Promise<Address | undefined>; onArrived: () => void }) {
  const { wallet, provider } = useApp();
  const [chainId, setChainId] = useState(999);
  const src = RELAY_SOURCES.find((c) => c.id === chainId)!;
  const [symbol, setSymbol] = useState(src.tokens[0].symbol);
  const token = src.tokens.find((t) => t.symbol === symbol) ?? src.tokens[0];
  const dests = RELAY_DESTINATIONS[DEST];
  const [dest, setDest] = useState(dests[0].symbol);
  const [amt, setAmt] = useState("");
  const [refund, setRefund] = useState("");
  const [q, setQ] = useState<RelayQuote | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [pending, setPending] = useState<Pending[]>(loadPending);
  const [copied, setCopied] = useState(false);
  const [sheet, setSheet] = useState<"from" | "to" | null>(null);
  // the connected wallet's balances on the source chains (EVM only): the chosen token's, and every token's while the list is open
  const owner = src.kind === "evm" || sheet === "from" ? (wallet?.account?.address as Address | undefined) : undefined;
  const [bal, setBal] = useState<bigint | undefined>();
  useEffect(() => {
    setBal(undefined);
    if (!owner || src.kind !== "evm") return;
    let live = true;
    const go = () => sourceBalance(chainId, token, owner).then((b) => live && setBal(b));
    go();
    const stop = every(go, 30_000);
    return () => {
      live = false;
      stop();
    };
  }, [chainId, symbol, owner]);
  const [bals, setBals] = useState<Record<string, string>>({});
  useEffect(() => {
    if (sheet !== "from" || !owner) return;
    let live = true;
    for (const c of RELAY_SOURCES.filter((x) => x.kind === "evm"))
      for (const t of c.tokens)
        sourceBalance(c.id, t, owner).then((b) => live && b !== undefined && setBals((cur) => ({ ...cur, [`${c.id}:${t.symbol}`]: showBalance(b, t.decimals) })));
    return () => {
      live = false;
    };
  }, [sheet, owner]);

  // receive addresses an arrived bridge left empty again: its money has moved into the private balance
  const [emptied, setEmptied] = useState<Set<string>>(new Set());
  useEffect(() => {
    const done = [...new Set(pending.filter((p) => p.stage === "done").map((p) => p.to.toLowerCase()))];
    if (!done.length) return;
    let live = true;
    const ERC = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }] as const;
    const go = async () => {
      const out = new Set<string>();
      for (const a of done) {
        const bals = await Promise.all([publicClient.getBalance({ address: a as Address }), ...ASSETS.map((t) => publicClient.readContract({ address: t.token, abi: ERC, functionName: "balanceOf", args: [a as Address] }))]).catch(() => null);
        if (bals && bals.every((b) => b === 0n)) out.add(a);
      }
      if (live) setEmptied(out);
    };
    go();
    const stop = every(go, 20_000);
    return () => {
      live = false;
      stop();
    };
  }, [pending]);

  // refunds go back to the connected wallet on EVM chains unless another address is given
  const refundTo = refund.trim() || (src.kind === "evm" && wallet?.account ? wallet.account.address : "");
  const amount = useMemo(() => {
    try {
      return parseUnits(amt || "0", token.decimals);
    } catch {
      return 0n;
    }
  }, [amt, token]);
  useEffect(() => setQ(null), [chainId, symbol, dest, amt, refund]);

  // follow every bridge on its way; when one arrives, collect at once
  useEffect(() => {
    const open = pending.filter((p) => p.stage === "waiting" || p.stage === "moving");
    if (!open.length) return;
    const go = async () => {
      let arrived = false;
      const next = await Promise.all(
        pending.map(async (p) => {
          if (p.stage !== "waiting" && p.stage !== "moving") return p;
          const s = await relayStatus(p.requestId).catch(() => null);
          if (s?.stage === "done") arrived = true;
          return s ? { ...p, stage: s.stage } : p;
        }),
      );
      setPending(next);
      savePending(next);
      if (arrived) onArrived();
    };
    go();
    return every(go, 6_000);
  }, [pending.map((p) => p.stage).join()]);

  const track = (x: RelayQuote) => {
    const p: Pending = { requestId: x.requestId, to: x.recipient, line: `${x.send.formatted} ${x.send.token.symbol} on ${x.send.chain} to about ${Number(x.receive.formatted).toPrecision(4)} ${x.receive.token.symbol}`, at: Date.now(), stage: "waiting" };
    const next = [...pending.filter((y) => y.requestId !== p.requestId), p];
    setPending(next);
    savePending(next);
  };

  async function quote(fromWallet: boolean) {
    setErr("");
    setQ(null);
    setBusy(fromWallet ? "Pricing the route" : "Making a deposit address");
    try {
      const to = await recipient(pending.filter((p) => p.stage !== "failed" && p.stage !== "refunded").map((p) => p.to.toLowerCase()));
      if (!to) throw new Error("Couldn't make a receive address. Try again.");
      const x = await relayQuote({ from: { chainId, symbol: token.symbol }, to: { chainId: DEST, symbol: dest }, amount, recipient: to, refundTo, wallet: fromWallet ? wallet?.account?.address : undefined });
      setQ(x);
      if (!fromWallet && LIVE) track(x);
      if (fromWallet) await pay(x);
    } catch (e) {
      setErr(friendly(e));
    } finally {
      setBusy("");
    }
  }

  /** The wallet signs Relay's transactions on the source chain, then goes back to Elysium. */
  async function pay(x: RelayQuote) {
    if (!provider || !wallet?.account || !x.txs) return;
    if (!LIVE) throw new Error("Bridging opens on Elysium mainnet. This preview only prices the route.");
    setBusy(`Switch your wallet to ${x.send.chain}`);
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: numberToHex(x.send.chainId) }] });
    } catch {
      throw new Error(`Add ${x.send.chain} to your wallet and switch to it, then try again.`);
    }
    try {
      for (const [i, t] of x.txs.entries()) {
        setBusy(x.txs.length > 1 ? `Confirm ${i + 1} of ${x.txs.length} in your wallet` : "Confirm in your wallet");
        const h = (await provider.request({ method: "eth_sendTransaction", params: [{ from: wallet.account.address, to: t.to, data: t.data, value: numberToHex(t.value) }] })) as Hex;
        setBusy("Waiting for it to confirm");
        await mined(provider, h);
      }
      track(x);
    } finally {
      await ensureElysium(provider).catch(() => {});
    }
  }

  const copy = (s: string) => {
    navigator.clipboard?.writeText(s).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!LIVE && !PREVIEW) {
    return (
      <div className="card flat">
        <h3>From another chain or an exchange</h3>
        <p className="small soft" style={{ margin: "8px 0 0" }}>Opens on Elysium mainnet. Send from 20 chains or straight from an exchange through Relay, and it lands in your private balance.</p>
      </div>
    );
  }

  const refundOk = validRefundAddress(src.kind, refundTo);
  const canWallet = src.kind === "evm" && !!wallet?.account && !!provider;
  const ready = amount > 0n && refundOk && !busy;
  const srcKey = `${chainId}:${token.symbol}`;
  const sources: SheetToken[] = RELAY_SOURCES.filter((c) => !c.needsKey).flatMap((c) => c.tokens.map((t) => ({ key: `${c.id}:${t.symbol}`, symbol: t.symbol, name: `on ${c.name}`, chain: chainLogo(c.id), bal: bals[`${c.id}:${t.symbol}`] })));
  const needRefund = !(src.kind === "evm" && wallet?.account);
  const refundField = (
    <div className="field" style={{ margin: needRefund ? "10px 0 0" : 0 }}><label><span>Refund address on {src.name}{!needRefund ? ", your wallet unless you change it" : ""}</span></label>
      <input className="input mono" value={refund} onChange={(e) => setRefund(e.target.value)} placeholder={src.kind === "evm" ? wallet?.account?.address ?? "0x…" : src.kind === "tvm" ? "T…" : "bc1…"} aria-label="Refund address" />
    </div>
  );
  return (
    <div className="swap bridge">
      {sheet === "from" && <TokenSheet title="Send from" tokens={sources} value={srcKey} placeholder="Search a token or a network" filters={RELAY_SOURCES.filter((c) => !c.needsKey).slice(0, 6).map((c) => c.name)} onPick={(k) => { const [c, sym] = k.split(":"); setChainId(Number(c)); setSymbol(sym); }} onClose={() => setSheet(null)} />}
      {sheet === "to" && <TokenSheet title="Receive privately as" tokens={dests.map((t) => ({ key: t.symbol, symbol: t.symbol, name: "Private balance on Elysium", chain: ELYSIUM_LOGO }))} value={dest} onPick={setDest} onClose={() => setSheet(null)} />}
      {!LIVE && <div className="summary small" style={{ margin: "0 0 10px" }}>Preview. Quotes are live from Relay into Elysium mainnet, and nothing is sent from this network.</div>}
      <div className="swap-box">
        <div className="k"><span>You send</span><span>{bal !== undefined ? <>Balance {showBalance(bal, token.decimals)}{bal > 0n && token.address !== "0x0000000000000000000000000000000000000000" && <button className="link" style={{ marginLeft: 8, background: "none", border: 0, padding: 0, font: "inherit", cursor: "pointer" }} onClick={() => setAmt(formatUnits(bal, token.decimals))}>Max</button>}</> : src.name}</span></div>
        <div className="amt">
          <input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" placeholder="0" aria-label="Amount" />
          <button className="token-sel two" onClick={() => setSheet("from")} aria-haspopup="dialog"><TokenIcon symbol={token.symbol} chain={chainLogo(src.id)} /><span>{token.symbol}<small>{src.name}</small></span><Icon.chev size={14} /></button>
        </div>
      </div>
      <div className="flip still" aria-hidden="true"><Icon.arrowDown /></div>
      <div className="swap-box">
        <div className="k"><span>You receive</span><span>Private balance</span></div>
        <div className="amt">
          <input value={q ? Number(q.receive.formatted).toPrecision(5).replace(/\.?0+$/, "") : ""} readOnly placeholder="0" aria-label="Estimated amount received" />
          <button className="token-sel two" onClick={() => dests.length > 1 && setSheet("to")} style={dests.length > 1 ? undefined : { cursor: "default" }}><TokenIcon symbol={dest} chain={ELYSIUM_LOGO} /><span>{dest}<small>Elysium</small></span>{dests.length > 1 && <Icon.chev size={14} />}</button>
        </div>
      </div>
      {needRefund && refundField}
      {refundTo && !refundOk && <div className="err">That isn't a {src.name} address.</div>}
      <div className="bridge-cta">
        {canWallet ? (
          <button className="btn btn-ink btn-lg" disabled={!ready} onClick={() => quote(true)}>{busy && !q ? busy : amount <= 0n ? "Enter an amount" : !refundOk ? "Add a refund address" : "Bridge from my wallet"}</button>
        ) : (
          // Bitcoin, Solana, Tron and the like: no wallet here signs for them, so Relay's one-time deposit address
          <button className="btn btn-ink btn-lg" disabled={!ready} onClick={() => quote(false)}>{busy && !q ? busy : amount <= 0n ? "Enter an amount" : !refundOk ? "Add a refund address" : "Get a deposit address"}</button>
        )}
      </div>
      {busy && q && <div className="summary small" style={{ marginTop: 10 }}><span className="dot live" style={{ marginRight: 8 }} />{busy}</div>}
      {err && <div className="err">{err}</div>}
      {q && q.depositAddress && (
        <div style={{ display: "grid", gap: 10, justifyItems: "center", textAlign: "center", marginTop: 14 }}>
          <div className="small">Send exactly <b>{q.send.formatted} {q.send.token.symbol}</b> on <b>{q.send.chain}</b> to</div>
          <QR text={q.depositAddress} size={168} label="Deposit address" />
          <div className="mono" style={{ wordBreak: "break-all" }}>{q.depositAddress}</div>
          <button className="btn btn-ghost" onClick={() => copy(q.depositAddress!)}><Icon.copy size={16} />{copied ? "Copied" : "Copy deposit address"}</button>
          <p className="note" style={{ margin: 0 }}>From an exchange, withdraw on the {q.send.chain} network to this address. It's for this one transfer only.</p>
        </div>
      )}
      {q && (
        <div className="summary" style={{ marginTop: 12 }}>
          <div className="row"><span className="mute">You get privately</span><span className="mono">about {Number(q.receive.formatted).toPrecision(5)} {q.receive.token.symbol}</span></div>
          <div className="row"><span className="mute">At least</span><span className="mono">{Number(formatUnits(q.receive.minimum, q.receive.token.decimals)).toPrecision(5)} {q.receive.token.symbol}</span></div>
          <div className="row"><span className="mute">Relay's fee</span><span className="mono">${q.feeUsd.toFixed(2)}</span></div>
          <div className="row"><span className="mute">Time</span><span>{q.timeSec <= 60 ? "Under a minute" : `About ${Math.ceil(q.timeSec / 60)} min`}{q.send.chainId === 8253038 ? " plus Bitcoin confirmations" : ""}</span></div>
        </div>
      )}
      {pending.length > 0 && (
        <div className="asset-list" style={{ marginTop: 12 }}>
          {[...pending].reverse().slice(0, 5).map((p) => (
            <div key={p.requestId} className="asset-row">
              <div className="nm"><b className="small">{p.line}</b><span className="xs mute">to {p.to.slice(0, 8)}…{p.to.slice(-6)} · {new Date(p.at).toLocaleString()}</span></div>
              <div className="amt"><span className={p.stage === "done" ? "pill ok" : "pill"}>{STAGE[p.stage === "done" && emptied.has(p.to.toLowerCase()) ? "in" : p.stage]}</span></div>
            </div>
          ))}
        </div>
      )}
      <Powered by="Relay" logo="/partners/relay.png" />
      <div className="more-list">
        {!needRefund && <More title="Refund address">{refundField}</More>}
        <More title="Risks">Relay runs the bridge, not Cloak. While your funds are with Relay, Cloak can't move, speed up or recover them. If a bridge fails, Relay refunds it to your refund address. Quotes, fees and networks are Relay's. Send exactly the quoted amount on the quoted network, or it may not arrive.</More>
        <More title="What is public and what isn't">Relay delivers to your receive address on Elysium, never to your wallet, and Cloak moves it into your private balance. Like any deposit, what was sent and from where is public. A deposit address from an exchange keeps your wallet out of it. Paying from your wallet links that wallet to this receive address, so use a new address afterwards.</More>
      </div>
    </div>
  );
}

/**
 * The Receive page's "another network": a Relay one-time deposit address on an EVM chain (for an exchange that doesn't
 * list Elysium), delivering to a fresh receive address. Separate from the Bridge page, which pays from the wallet.
 */
export function RelayDepositAddress({ recipient, onArrived }: { recipient: (avoid: string[]) => Promise<Address | undefined>; onArrived: () => void }) {
  const { wallet } = useApp();
  const evm = RELAY_SOURCES.filter((c) => c.kind === "evm" && !c.needsKey);
  const [srcKey, setSrcKey] = useState("42161:USDC");
  const [cid, sym] = srcKey.split(":");
  const src = evm.find((c) => c.id === Number(cid)) ?? evm[0];
  const token = src.tokens.find((t) => t.symbol === sym) ?? src.tokens[0];
  const dests = RELAY_DESTINATIONS[DEST];
  // same coin in as out where Elysium has it (USDC to USDC), else USDC
  const sameOut = (s: string) => (dests.some((d) => d.symbol === s) ? s : dests.some((d) => d.symbol === "USDC") ? "USDC" : dests[0].symbol);
  const [dest, setDest] = useState(sameOut(token.symbol));
  const [amt, setAmt] = useState("");
  const [refund, setRefund] = useState("");
  const [q, setQ] = useState<RelayQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [sheet, setSheet] = useState<"from" | "to" | null>(null);
  const [pending, setPending] = useState<Pending[]>(loadPending);
  const amount = useMemo(() => {
    try {
      return parseUnits(amt || "0", token.decimals);
    } catch {
      return 0n;
    }
  }, [amt, token]);
  const refundTo = refund.trim() || (wallet?.account?.address ?? "");
  const refundOk = validRefundAddress("evm", refundTo);
  useEffect(() => setQ(null), [srcKey, dest, amt, refund]);

  // follow each one; when one arrives, collect at once
  useEffect(() => {
    if (!pending.some((p) => p.stage === "waiting" || p.stage === "moving")) return;
    const go = async () => {
      let arrived = false;
      const next = await Promise.all(
        pending.map(async (p) => {
          if (p.stage !== "waiting" && p.stage !== "moving") return p;
          const st = await relayStatus(p.requestId).catch(() => null);
          if (st?.stage === "done") arrived = true;
          return st ? { ...p, stage: st.stage } : p;
        }),
      );
      setPending(next);
      savePending(next);
      if (arrived) onArrived();
    };
    go();
    return every(go, 6_000);
  }, [pending.map((p) => p.stage).join()]);

  async function make() {
    setErr("");
    setQ(null);
    setBusy(true);
    try {
      const to = await recipient(pending.filter((p) => p.stage !== "failed" && p.stage !== "refunded").map((p) => p.to.toLowerCase()));
      if (!to) throw new Error("Couldn't make a receive address. Try again.");
      const x = await relayQuote({ from: { chainId: src.id, symbol: token.symbol }, to: { chainId: DEST, symbol: dest }, amount, recipient: to, refundTo });
      setQ(x);
      if (LIVE) {
        const p: Pending = { requestId: x.requestId, to: x.recipient, line: `${x.send.formatted} ${x.send.token.symbol} on ${x.send.chain} to about ${Number(x.receive.formatted).toPrecision(4)} ${x.receive.token.symbol}`, at: Date.now(), stage: "waiting" };
        const next = [...pending.filter((y) => y.requestId !== p.requestId), p];
        setPending(next);
        savePending(next);
      }
    } catch (e) {
      setErr(friendly(e));
    } finally {
      setBusy(false);
    }
  }
  const copy = (t: string) => {
    navigator.clipboard?.writeText(t).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const sources: SheetToken[] = evm.flatMap((c) => c.tokens.map((t) => ({ key: `${c.id}:${t.symbol}`, symbol: t.symbol, name: `on ${c.name}`, chain: chainLogo(c.id) })));
  const ready = amount > 0n && refundOk && !busy;

  return (
    <div className="bridge">
      {sheet === "from" && <TokenSheet title="Coin and network" tokens={sources} value={srcKey} placeholder="Search a coin or a network" filters={evm.slice(0, 6).map((c) => c.name)} onPick={(k) => { setSrcKey(k); setDest(sameOut(k.split(":")[1])); }} onClose={() => setSheet(null)} />}
      {sheet === "to" && <TokenSheet title="Receive privately as" tokens={dests.map((t) => ({ key: t.symbol, symbol: t.symbol, name: "Private balance on Elysium", chain: ELYSIUM_LOGO }))} value={dest} onPick={setDest} onClose={() => setSheet(null)} />}
      <div className="swap-box">
        <div className="k"><span>About how much</span><span>for the estimate</span></div>
        <div className="amt">
          <input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" placeholder="0" aria-label="Amount to send" />
          <button className="token-sel two" onClick={() => setSheet("from")} aria-haspopup="dialog"><TokenIcon symbol={token.symbol} chain={chainLogo(src.id)} /><span>{token.symbol}<small>{src.name}</small></span><Icon.chev size={14} /></button>
        </div>
      </div>
      <div className="flip still" aria-hidden="true"><Icon.arrowDown /></div>
      <div className="swap-box">
        <div className="k"><span>You receive</span><span>Private balance</span></div>
        <div className="amt">
          <input value={q ? Number(q.receive.formatted).toPrecision(5).replace(/\.?0+$/, "") : ""} readOnly placeholder="0" aria-label="Estimated amount received" />
          <button className="token-sel two" onClick={() => dests.length > 1 && setSheet("to")} style={dests.length > 1 ? undefined : { cursor: "default" }}><TokenIcon symbol={dest} chain={ELYSIUM_LOGO} /><span>{dest}<small>Elysium</small></span>{dests.length > 1 && <Icon.chev size={14} />}</button>
        </div>
      </div>
      <div className="field" style={{ margin: "10px 0 0" }}><label><span>Refund address on {src.name}, a wallet you control{wallet?.account && !refund ? " (yours unless you change it)" : ""}</span></label>
        <input className="input mono" value={refund} onChange={(e) => setRefund(e.target.value)} placeholder={wallet?.account?.address ?? "0x…"} aria-label="Refund address" />
      </div>
      {refundTo && !refundOk && <div className="err">That isn't an address on {src.name}.</div>}
      <div className="bridge-cta">
        <button className="btn btn-ink btn-lg" disabled={!ready} onClick={make}>{busy ? "Making your address" : amount <= 0n ? "Enter an amount" : !refundOk ? "Add a refund address" : `Get an address on ${src.name}`}</button>
      </div>
      {err && <div className="err">{err}</div>}
      {q && q.depositAddress && (
        <div style={{ display: "grid", gap: 10, justifyItems: "center", textAlign: "center", marginTop: 14 }}>
          <div className="small">Send <b>{q.send.token.symbol}</b> on <b>{q.send.chain}</b> to</div>
          <QR text={q.depositAddress} size={168} label="Deposit address" />
          <div className="mono" style={{ wordBreak: "break-all" }}>{q.depositAddress}</div>
          <button className="btn btn-ghost" onClick={() => copy(q.depositAddress!)}><Icon.copy size={16} />{copied ? "Copied" : "Copy address"}</button>
          <div className="warnbox" style={{ textAlign: "left" }}>Send on <b>{q.send.chain}</b> only. Any amount works: Relay prices what actually arrives, so more or less than {q.send.formatted} {q.send.token.symbol} is fine. An amount too small to cover Relay's fee is refunded to your refund address. The address keeps working for later deposits, all landing in your private balance.</div>
          <div className="summary" style={{ width: "100%" }}>
            <div className="row"><span className="mute">For {q.send.formatted} {q.send.token.symbol} you get</span><span className="mono">about {Number(q.receive.formatted).toPrecision(5)} {q.receive.token.symbol}</span></div>
            <div className="row"><span className="mute">Relay's fee</span><span className="mono">${q.feeUsd.toFixed(2)}</span></div>
            <div className="row"><span className="mute">Time after it's sent</span><span>{q.timeSec <= 60 ? "About a minute" : `About ${Math.ceil(q.timeSec / 60)} min`}</span></div>
          </div>
        </div>
      )}
      {pending.length > 0 && (
        <div className="asset-list" style={{ marginTop: 12 }}>
          {[...pending].reverse().slice(0, 5).map((p) => (
            <div key={p.requestId} className="asset-row">
              <div className="nm"><b className="small">{p.line}</b><span className="xs mute">to {p.to.slice(0, 8)}…{p.to.slice(-6)} · {new Date(p.at).toLocaleString()}</span></div>
              <div className="amt"><span className={p.stage === "done" ? "pill ok" : "pill"}>{STAGE[p.stage]}</span></div>
            </div>
          ))}
        </div>
      )}
      <Powered by="Relay" logo="/partners/relay.png" />
      <div className="more-list">
        <More title="Risks">Relay runs this, not Cloak. While your funds are with Relay, Cloak can't move, speed up or recover them. If it fails, Relay refunds to your refund address, so use a wallet you control there, never an exchange deposit address. Coins Relay doesn't support on that network aren't processed.</More>
        <More title="What is public and what isn't">Relay delivers to a new receive address on Elysium, and Cloak moves it into your private balance. The exchange withdrawal is public, but it isn't tied to your wallet. Later deposits to the same address land at the same receive address, so they can be linked to each other.</More>
        <More title="If you close this page">Nothing is lost. Relay delivers on its own once the deposit lands. The money waits at your receive address and moves into your private balance the next time you open Cloak on this device.</More>
      </div>
    </div>
  );
}
