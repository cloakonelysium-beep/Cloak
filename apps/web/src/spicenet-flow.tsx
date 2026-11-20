/**
 * Spicenet's deposit window (Spice Flow), loaded only when a user starts or resumes a Spicenet deposit: Privy, wagmi
 * and the Spice Flow UI never weigh on any other page. Spice Flow UI 5.0.2, core 0.10.3.
 *
 * One action, as Spicenet instructed (Matt, Nov 19):
 *  1. PrivyProvider with Spicenet's app id and embedded Ethereum wallets; SpiceFlowProvider inside it, provider "privy",
 *     mode "7702", network "mainnet". A guest session when the deposit starts (no Privy login screen); an existing
 *     session is reused, and nothing renders until its embedded wallet is ready.
 *  2. A single SpiceDeposit: skipRecovery={false}, destinationChainId 99901, destinationTokenAddress Elysium USDC,
 *     depositActionLabel "Delivery to Cloak on Elysium". Its depositBatches callback asks the SDK for the delivery:
 *     quoteSpicenetWithdrawalBatches with context.destinationAmount (the confirmed escrow credit), this deposit's Cloak
 *     receive address as recipient, Elysium USDC, chain 99901, the guest embedded address and useSpiceExecution's
 *     estimate. The SDK owns the amounts and fees; Cloak only checks the destination (spicenet-lock.ts, check-only:
 *     it throws if anything would pay another token, chain or recipient than Elysium USDC to this receive address or
 *     Spicenet's own fee addresses, and never changes the plan). There is no separate SpiceWithdraw step any more.
 *     Before quoting, the delivery must be within Cloak's fixed cap (500 USDC); a larger one is refused before anything is
 *     submitted. The escrow's balance isn't a limit: Spicenet's rebalancer refills it from other chains (Matt, Nov 20).
 *  3. onDepositSuccess (type "deposit") reports detail.txHash, the Elysium delivery. Credit happens elsewhere and only on proof:
 *     spicenet.tsx reads that receipt for USDC from Spicenet's escrow to the receive address and records the amount the
 *     receipt shows (never the callback's amount, which is the escrow credit before fees).
 *  4. Interrupted deposits reopen this same window (resume): the same guest session, the same receive address, the same
 *     depositBatches, with skipRecovery={false} so Spice Flow finds the funded balance and nobody pays again. If an
 *     action was already submitted, Spicenet's record of the guest wallet's actions is checked first: while a pending one
 *     can still be paid (its request lives an hour) nothing reopens. Past that hour Spicenet's backend cancels an unpaid
 *     request (reopening doesn't, and the pending list can lag), so its recovery status decides: settling (wait),
 *     delivered, or cancelled with the credit back, and only then does the window reopen (Matt, Nov 20).
 *     This deposit's Spicenet action ids are kept for support.
 *
 * Limits (Cloak's, for now): card checkout only, at most CARD_CAP (500 USDC), at least CARD_MIN,
 * set in the card widget itself (cardOnly) and checked again before any delivery. Spicenet's window still lists its
 * wallet and exchange routes; Cloak supports card here, and the cap applies to every route at confirm.
 *
 * The embedded wallet is Spicenet's execution wallet, kept apart from the user's own wallet: Cloak never reads its key
 * and nothing here holds Cloak funds.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { PrivyProvider, useCreateWallet, useGuestAccounts, usePrivy, useWallets } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { arbitrum, base, bsc, mainnet, optimism, polygon } from "viem/chains";
import { decodeFunctionData, formatUnits, type Address, type Hex } from "viem";
import {
  SPICE_COMBINED_FEE_RECIPIENT,
  SPICE_GAS_FEE_RECIPIENT,
  SPICE_PLATFORM_FEE_RECIPIENT,
  SpiceDeposit,
  SpiceFlowProvider,
  quoteSpicenetWithdrawalBatches,
  relayerService,
  useSpiceExecution,
  type PostDepositContext,
} from "@spicenet-io/spiceflow-ui";
import { spicenetAbi } from "@spicenet-io/spiceflow-core";
import { SPICENET } from "@cloakely/sdk";
import { RPC_URL, chain } from "./config";
import { checkDelivery } from "./spicenet-lock";
import { SpiceWait } from "./spicenetWait";
import { CARD_CAP, CARD_MIN, actionsSince, resumeStep, type Recovery, type ResumeStep } from "./spicenet-state";
import type { SwapperEmbedFactory } from "@spicenet-io/spiceflow-ui";

const NET = SPICENET[99901];
const ELYSIUM = { ...chain, id: 99901 } as typeof chain;
const CHAINS = [ELYSIUM, mainnet, arbitrum, base, optimism, polygon, bsc] as const;
const wagmiConfig = createConfig({ chains: CHAINS, transports: Object.fromEntries(CHAINS.map((c) => [c.id, c.id === 99901 ? http(RPC_URL) : http()])) as never });
const queryClient = new QueryClient();

/** Spicenet's own fee addresses (spiceflow-core): the only recipients a delivery may have besides the receive address. */
const FEE_TO = [SPICE_GAS_FEE_RECIPIENT, SPICE_PLATFORM_FEE_RECIPIENT, SPICE_COMBINED_FEE_RECIPIENT];
const decode = (data: Hex) => decodeFunctionData({ abi: spicenetAbi, data });
/** Fee sanity: Spicenet's fees in a delivery may be at most 1 USDC plus 2% of what reaches the receive address (real
 *  fees are a few cents plus 0.1%). Catches a plan that would send most of a payment to fees. */
const FEE_LIMIT = { fixed: 1_000_000n, bps: 200n };

export interface SpiceFundingProps {
  /** The Cloak receive address on Elysium mainnet for this deposit only (the same one on every resume). */
  to: Address;
  /** When this deposit started: Spicenet actions from then on are this deposit's. */
  since: number;
  /** This deposit's Spicenet action ids, as they appear (kept for support). */
  onActions: (ids: string[]) => void;
  /** Spicenet's own window is opening (the waiting panel can go). */
  onReady: () => void;
  /** Resuming an interrupted deposit: the guest wallet it ran in, and whether an action may already be on its way. */
  resume?: { guest?: Address; checkFirst: boolean };
  /** The guest embedded wallet this deposit runs in (stored with the deposit, so a resume uses the same one). */
  onGuest: (address: Address) => void;
  /** The deposit was confirmed in the window: money may move from here on. */
  onSubmitted: () => void;
  /** Spice Flow reported the delivery to Cloak complete, with its Elysium transaction. Not a credit. */
  onDelivered: (detail: { txHash?: string }) => void;
  onError: (message: string) => void;
  onClose: () => void;
}

/** Inside the providers: a guest session, its embedded wallet, then the one SpiceDeposit. */
function Inner({ to, since, onActions, onReady, resume, onGuest, onSubmitted, onDelivered, onError, onClose }: SpiceFundingProps) {
  const { ready, authenticated } = usePrivy();
  const { createGuestAccount } = useGuestAccounts();
  const { wallets, ready: walletsReady } = useWallets();
  const execution = useSpiceExecution();
  const asked = useRef(false);
  const [err, setErr] = useState("");
  // a resume of a deposit whose action may be running first asks Spicenet ("check")
  const [step, setStep] = useState<"check" | "deposit" | Exclude<ResumeStep["kind"], "open">>(resume?.checkFirst ? "check" : "deposit");
  const [waitUntil, setWaitUntil] = useState<number | null>(null);
  useEffect(() => {
    if (!ready || authenticated || asked.current) return;
    asked.current = true;
    createGuestAccount().catch((e) => setErr(e instanceof Error ? e.message : "Couldn't start a Spicenet session."));
  }, [ready, authenticated, createGuestAccount]);
  const embedded = walletsReady ? wallets.find((w) => w.walletClientType === "privy") : undefined;
  // The guest's wallet is made here, once Privy's wallets are ready, rather than by Privy at login: made at login,
  // before Privy's wallet frame is up, Privy shows its own "Creating your wallet" and "Welcome" screens over the page.
  const { createWallet } = useCreateWallet();
  const creating = useRef(false);
  useEffect(() => {
    if (!ready || !authenticated || !walletsReady || embedded || creating.current) return;
    creating.current = true;
    createWallet().catch((e) => setErr(e instanceof Error ? e.message : "Couldn't make a Spicenet wallet."));
  }, [ready, authenticated, walletsReady, embedded]);
  const guest = embedded?.address as Address | undefined;
  const otherGuest = !!(resume?.guest && guest && resume.guest.toLowerCase() !== guest.toLowerCase());

  useEffect(() => {
    if (guest && !otherGuest) onGuest(guest);
  }, [guest, otherGuest]);

  // Before resuming, Spicenet decides (Matt, Nov 20). While a pending request can still be paid (its hour), nothing
  // reopens: never resend one that may still complete. Past its hour, reopening doesn't cancel it (Spicenet's backend
  // does) and the pending list can lag, so each expired action's recovery status decides (spicenet-state.ts
  // resumeStep): still settling, delivered, or cancelled with the credit back, in which case the window reopens.
  useEffect(() => {
    if (step !== "check" || !guest || otherGuest) return;
    let live = true;
    (async () => {
      const pending = await relayerService.getWalletActions(guest, { pendingOnly: true });
      onActions(actionsSince(pending, since));
      const recovery: Record<string, Recovery[]> = {};
      for (const a of pending) {
        if (Date.now() - (Date.parse(a.createdAt) || 0) < 60 * 60_000) continue; // still within its hour: no need to ask
        const n = Math.max(1, a.intents?.length ?? 0);
        recovery[a.actionId] = await Promise.all(Array.from({ length: n }, (_, i) => relayerService.getIntentRecoveryStatus(a.actionId, i).catch(() => "unresolved" as const)));
      }
      if (!live) return;
      const next = resumeStep(pending, recovery);
      setWaitUntil(next.kind === "wait" ? next.until : null);
      setStep(next.kind === "open" ? "deposit" : next.kind);
    })().catch(() => live && setErr("Couldn't reach Spicenet to check this payment. Try again in a moment."));
    return () => {
      live = false;
    };
  }, [step, guest, otherGuest]);

  // This deposit's Spicenet action ids, for support: read once it is confirmed, and again when it ends either way
  const [submitted, setSubmitted] = useState(false);
  const readActions = useCallback(() => {
    if (!guest) return;
    relayerService.getWalletActions(guest).then((all) => onActions(actionsSince(all, since)), () => {});
  }, [guest, since]);
  useEffect(() => {
    if (!submitted) return;
    readActions();
    const t = setInterval(readActions, 15_000);
    return () => clearInterval(t);
  }, [submitted, readActions]);

  // The delivery, as Spicenet instructed: the SDK's own quote for the confirmed escrow credit, to this deposit's receive
  // address, checked (never changed) before Spice Flow submits it.
  const deliveryBatches = useCallback(
    async (context: PostDepositContext) => {
      if (!guest || context.destinationAmount === undefined) throw new Error("Wallet and confirmed deposit credit are required");
      // Cloak's fixed cap for now, on every route the window offers (the card widget is capped too, below). Not the
      // escrow's balance: Spicenet's rebalancer refills it from other chains (Matt, Nov 20)
      if (context.destinationAmount > CARD_CAP) throw new Error(`Deposits through Spicenet are limited to ${formatUnits(CARD_CAP, NET.usdcDecimals)} USDC for now. Enter a smaller amount.`);
      const plan = await quoteSpicenetWithdrawalBatches({ amount: context.destinationAmount, recipient: to, token: NET.usdc, chainId: 99901, userAddress: guest, estimate: execution.estimate });
      return checkDelivery(plan, { to, usdc: NET.usdc, feeRecipients: FEE_TO, decode, feeLimit: FEE_LIMIT }) as typeof plan;
    },
    [guest, to, execution.estimate],
  );

  const opening = !err && !otherGuest && step === "deposit" && ready && authenticated && !!guest;
  useEffect(() => {
    if (opening) onReady();
  }, [opening]);

  // every state before Spicenet's own window shows in the same waiting panel, so nothing lands below the page unseen
  if (err) return <SpiceWait busy={false} text={err} onClose={onClose} />;
  if (!ready || !authenticated || !guest) return <SpiceWait text="Starting a private session" onClose={onClose} />;
  if (otherGuest) return <SpiceWait busy={false} text="This payment was started in another Spicenet session, which this browser no longer has. Its funds stay with that session, and nothing new was charged." onClose={onClose} />;
  if (step === "check") return <SpiceWait text="Checking your payment with Spicenet" onClose={onClose} />;
  if (step === "wait")
    return (
      <SpiceWait
        busy={false}
        text={`Spicenet is still delivering this payment, so there's nothing to resume yet. ${waitUntil ? `If it hasn't arrived by ${new Date(waitUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}, come back and resume.` : "Check back in a little while."}`}
        onClose={onClose}
      />
    );
  if (step === "settling")
    return <SpiceWait busy={false} text="Spicenet is settling an expired delivery for this payment. Its money goes back to your Spicenet balance, then you can resume here. If this lasts more than a day, copy the payment's support details and send them to us." onClose={onClose} />;
  if (step === "delivered")
    return <SpiceWait busy={false} text="Spicenet says this payment was delivered. It shows here as soon as it reaches your receive address." onClose={onClose} />;
  return (
    <>
    {/* the waiting panel fades out as Spicenet's window opens over it */}
    <SpiceWait text="Opening the checkout" onClose={onClose} fading />
    <SpiceDeposit
      isOpen
      onClose={onClose}
      skipRecovery={false}
      destinationChainId={99901}
      destinationTokenAddress={NET.usdc}
      depositBatches={deliveryBatches}
      depositActionLabel="Delivery to Cloak on Elysium"
      onSubmit={() => {
        setSubmitted(true);
        onSubmitted();
      }}
      // "deposit" is the delivery to Cloak; "wallet-funding" (a card or exchange payment reaching an external wallet)
      // only means money moved, not that it was delivered
      onDepositSuccess={(detail) => {
        if (detail.type === "deposit") onDelivered({ txHash: detail.txHash });
        else onSubmitted();
        readActions();
      }}
      onDepositError={(e) => {
        readActions();
        onError(e);
      }}
    />
    </>
  );
}

/**
 * The card checkout (Swapper, inside Spicenet's window), made by Cloak instead of Spice Flow's default so Cloak sets its
 * limits: card only (no crypto transfer from an exchange, whose amount nobody can cap), at most Cloak's fixed cap and
 * at least CARD_MIN. Everything else is Spice Flow's own config.
 */
const cardOnly: SwapperEmbedFactory = async (options) => {
  const { SwapperEmbed } = await import("@swapper-finance/deposit-sdk");
  const usd = (x: bigint) => Math.floor(Number(formatUnits(x, NET.usdcDecimals)));
  return new SwapperEmbed({ ...options, supportedDepositOptions: ["depositWithCash"], maxDepositUsd: usd(CARD_CAP), minDepositUsd: usd(CARD_MIN) });
};

/** Spicenet's deposit window, mounted when a deposit starts or resumes. Elysium mainnet only (the caller checks). */
export default function SpiceFunding(props: SpiceFundingProps) {
  return (
    <PrivyProvider appId={NET.privyAppId} config={{ embeddedWallets: { ethereum: { createOnLogin: "off" }, showWalletUIs: false }, supportedChains: [...CHAINS], defaultChain: ELYSIUM }}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <SpiceFlowProvider provider="privy" mode="7702" network="mainnet" privyAppId={NET.privyAppId} appName="Cloak" rpcOverrides={{ 99901: RPC_URL }} swapper={{ enabled: true, embedFactory: cardOnly }}>
            <Inner {...props} />
          </SpiceFlowProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
