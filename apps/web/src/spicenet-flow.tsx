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
 *     Before quoting, the delivery must fit what Spicenet's escrow on Elysium holds (it pays the whole delivery); a larger
 *     one is refused with a clear message before anything is submitted.
 *  3. onDepositSuccess (type "deposit") reports detail.txHash, the Elysium delivery. Credit happens elsewhere and only on proof:
 *     spicenet.tsx reads that receipt for USDC from Spicenet's escrow to the receive address and records the amount the
 *     receipt shows (never the callback's amount, which is the escrow credit before fees).
 *  4. Interrupted deposits reopen this same window (resume): the same guest session, the same receive address, the same
 *     depositBatches, with skipRecovery={false} so Spice Flow finds the funded balance and nobody pays again. If an
 *     action was already submitted, Spicenet's record of the guest wallet's actions is checked first, and while one is
 *     still pending nothing reopens.
 *
 * The embedded wallet is Spicenet's execution wallet, kept apart from the user's own wallet: Cloak never reads its key
 * and nothing here holds Cloak funds.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { PrivyProvider, useGuestAccounts, usePrivy, useWallets } from "@privy-io/react-auth";
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
import { SPICENET, spicenetCapacity } from "@cloakely/sdk";
import { RPC_URL, chain } from "./config";
import { publicClient } from "./wallet";
import { checkDelivery } from "./spicenet-lock";
import { fits } from "./spicenet-state";

const NET = SPICENET[99901];
const ELYSIUM = { ...chain, id: 99901 } as typeof chain;
const CHAINS = [ELYSIUM, mainnet, arbitrum, base, optimism, polygon, bsc] as const;
const wagmiConfig = createConfig({ chains: CHAINS, transports: Object.fromEntries(CHAINS.map((c) => [c.id, c.id === 99901 ? http(RPC_URL) : http()])) as never });
const queryClient = new QueryClient();

/** Spicenet's own fee addresses (spiceflow-core): the only recipients a delivery may have besides the receive address. */
const FEE_TO = [SPICE_GAS_FEE_RECIPIENT, SPICE_PLATFORM_FEE_RECIPIENT, SPICE_COMBINED_FEE_RECIPIENT];
const decode = (data: Hex) => decodeFunctionData({ abi: spicenetAbi, data });

export interface SpiceFundingProps {
  /** The Cloak receive address on Elysium mainnet for this deposit only (the same one on every resume). */
  to: Address;
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
function Inner({ to, resume, onGuest, onSubmitted, onDelivered, onError, onClose }: SpiceFundingProps) {
  const { ready, authenticated } = usePrivy();
  const { createGuestAccount } = useGuestAccounts();
  const { wallets, ready: walletsReady } = useWallets();
  const execution = useSpiceExecution();
  const asked = useRef(false);
  const [err, setErr] = useState("");
  // a resume of a deposit whose action may be running first asks Spicenet ("check")
  const [step, setStep] = useState<"check" | "busy" | "deposit">(resume?.checkFirst ? "check" : "deposit");
  useEffect(() => {
    if (!ready || authenticated || asked.current) return;
    asked.current = true;
    createGuestAccount().catch((e) => setErr(e instanceof Error ? e.message : "Couldn't start a Spicenet session."));
  }, [ready, authenticated, createGuestAccount]);
  const embedded = walletsReady ? wallets.find((w) => w.walletClientType === "privy") : undefined;
  const guest = embedded?.address as Address | undefined;
  const otherGuest = !!(resume?.guest && guest && resume.guest.toLowerCase() !== guest.toLowerCase());

  useEffect(() => {
    if (guest && !otherGuest) onGuest(guest);
  }, [guest, otherGuest]);

  // Before resuming, Spicenet's own record of the guest wallet's actions decides: while one is still pending, nothing
  // reopens (never resend an action that may still complete).
  useEffect(() => {
    if (step !== "check" || !guest || otherGuest) return;
    let live = true;
    relayerService
      .getWalletActions(guest, { pendingOnly: true })
      .then((pending: unknown[]) => live && setStep(pending.length ? "busy" : "deposit"))
      .catch(() => live && setErr("Couldn't reach Spicenet to check this deposit. Try again in a moment."));
    return () => {
      live = false;
    };
  }, [step, guest, otherGuest]);

  // The delivery, as Spicenet instructed: the SDK's own quote for the confirmed escrow credit, to this deposit's receive
  // address, checked (never changed) before Spice Flow submits it.
  const deliveryBatches = useCallback(
    async (context: PostDepositContext) => {
      if (!guest || context.destinationAmount === undefined) throw new Error("Wallet and confirmed deposit credit are required");
      // Spicenet's escrow pays the whole delivery (net and fees): one larger than it holds can't land, so say so before
      // anything is submitted. A failed read doesn't block (Spicenet's own checks still apply).
      const capacity = await spicenetCapacity(publicClient, 99901).catch(() => null);
      if (!fits(context.destinationAmount, capacity))
        throw new Error(`Not enough USDC in Spicenet's escrow on Elysium right now: it can deliver up to ${formatUnits(capacity!, NET.usdcDecimals)} USDC. Enter a smaller amount, or try again later.`);
      const plan = await quoteSpicenetWithdrawalBatches({ amount: context.destinationAmount, recipient: to, token: NET.usdc, chainId: 99901, userAddress: guest, estimate: execution.estimate });
      return checkDelivery(plan, { to, usdc: NET.usdc, feeRecipients: FEE_TO, decode }) as typeof plan;
    },
    [guest, to, execution.estimate],
  );

  if (err) return <div className="err">{err}</div>;
  if (!ready || !authenticated || !guest) return <p className="small mute">Starting Spicenet…</p>;
  if (otherGuest)
    return (
      <p className="small soft">
        This deposit was started in another Spicenet session, which this browser no longer has. Its funds stay with that session; nothing new was charged.{" "}
        <button className="link" onClick={onClose}>OK</button>
      </p>
    );
  if (step === "check") return <p className="small mute">Checking with Spicenet…</p>;
  if (step === "busy")
    return (
      <p className="small soft">
        Spicenet is still delivering this deposit, so there's nothing to resume yet. Check back in a little while.{" "}
        <button className="link" onClick={onClose}>OK</button>
      </p>
    );
  return (
    <SpiceDeposit
      isOpen
      onClose={onClose}
      skipRecovery={false}
      destinationChainId={99901}
      destinationTokenAddress={NET.usdc}
      depositBatches={deliveryBatches}
      depositActionLabel="Delivery to Cloak on Elysium"
      onSubmit={() => onSubmitted()}
      // "deposit" is the delivery to Cloak; "wallet-funding" (a card or exchange payment reaching an external wallet)
      // only means money moved, not that it was delivered
      onDepositSuccess={(detail) => (detail.type === "deposit" ? onDelivered({ txHash: detail.txHash }) : onSubmitted())}
      onDepositError={(e) => onError(e)}
    />
  );
}

/** Spicenet's deposit window, mounted when a deposit starts or resumes. Elysium mainnet only (the caller checks). */
export default function SpiceFunding(props: SpiceFundingProps) {
  return (
    <PrivyProvider appId={NET.privyAppId} config={{ embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } }, supportedChains: [...CHAINS], defaultChain: ELYSIUM }}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <SpiceFlowProvider provider="privy" mode="7702" network="mainnet" privyAppId={NET.privyAppId} appName="Cloak" rpcOverrides={{ 99901: RPC_URL }} swapper={{ enabled: true }}>
            <Inner {...props} />
          </SpiceFlowProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
