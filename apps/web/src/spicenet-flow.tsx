/**
 * Spicenet's funding step (Spice Flow), loaded only when a user starts a Spicenet deposit: Privy, wagmi and the Spice
 * Flow UI never weigh on any other page. Spicenet's integration steps (Nov 17), in order:
 *  1. PrivyProvider with Spicenet's app id and embedded Ethereum wallets; SpiceFlowProvider inside it, provider "privy",
 *     mode "7702", network "mainnet".
 *  2. A guest session when the deposit starts: no Privy login screen, no session key to save. An existing session is
 *     reused, and nothing continues until its embedded wallet is ready.
 *  3. The fresh one-time receive address on Elysium mainnet comes from the caller (Receive's newAddress), made before
 *     this mounts.
 *  4. SpiceDeposit funds the user's Spicenet balance from the wallet, card or exchange route they pick; the SDK owns
 *     routes, quotes and fees.
 *  5. SpiceWithdraw then delivers it, with the SDK's complete payout plan (Spicenet's review, Nov 17): the net payment
 *     and its separate fee transfers, as the SDK quotes them. Cloak only locks the destination (lockedBatch): Elysium
 *     mainnet, canonical USDC, and every transfer either to this deposit's receive address or to one of Spicenet's own
 *     fee addresses. Anything else is refused before signing.
 *  Retry (Spicenet, Nov 17): a payout Spicenet can't complete after its own automatic retries stays as USDC in the
 *  user's embedded wallet. mode "resend" opens the same locked SpiceWithdraw for it.
 *  6. Credit happens elsewhere and only on proof: spicenet.tsx waits for a USDC transfer from Spicenet's escrow to the
 *     receive address in a successful Elysium transaction and records the amount that arrived, once per transaction.
 *     A funding success or callback here moves nothing.
 *
 * The embedded wallet is Spicenet's execution wallet, kept apart from the user's own wallet: Cloak never reads its key
 * and nothing here holds Cloak funds.
 */
import { useEffect, useRef, useState } from "react";
import { PrivyProvider, useGuestAccounts, usePrivy, useWallets } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { arbitrum, base, bsc, mainnet, optimism, polygon } from "viem/chains";
import {
  SPICE_COMBINED_FEE_RECIPIENT,
  SPICE_GAS_FEE_RECIPIENT,
  SPICE_PLATFORM_FEE_RECIPIENT,
  SpiceDeposit,
  SpiceFlowProvider,
  SpiceWithdraw,
  buildSpicenetWithdrawalBatch,
} from "@spicenet-io/spiceflow-ui";
import { SPICENET } from "@cloakely/sdk";
import type { Address } from "viem";
import { RPC_URL, chain } from "./config";
import { lockDelivery } from "./spicenet-lock";

const NET = SPICENET[99901];
const ELYSIUM = { ...chain, id: 99901 } as typeof chain;
const CHAINS = [ELYSIUM, mainnet, arbitrum, base, optimism, polygon, bsc] as const;
const wagmiConfig = createConfig({ chains: CHAINS, transports: Object.fromEntries(CHAINS.map((c) => [c.id, c.id === 99901 ? http(RPC_URL) : http()])) as never });
const queryClient = new QueryClient();

export interface SpiceFundingProps {
  /** The fresh receive address on Elysium mainnet for this deposit only. */
  to: Address;
  /** "deposit" (default): fund, then deliver. "resend": deliver what is waiting in the Spicenet wallet again. */
  mode?: "deposit" | "resend";
  /** Spicenet accepted the delivery to Elysium (before any wallet prompt). */
  onStarted: (quotedNet?: bigint) => void;
  /** The SDK reports the funding done. Not delivery: only the escrow's transfer on Elysium counts. */
  onFunded: (detail: { txHash?: string }) => void;
  onError: (message: string) => void;
  onClose: () => void;
}

/** Spicenet's own fee addresses (spiceflow-core): the only recipients a payout may have besides the receive address. */
const FEE_TO = [SPICE_GAS_FEE_RECIPIENT, SPICE_PLATFORM_FEE_RECIPIENT, SPICE_COMBINED_FEE_RECIPIENT];
const lockedBatch = (to: Address) => lockDelivery({ to, usdc: NET.usdc, feeRecipients: FEE_TO, build: buildSpicenetWithdrawalBatch });

/** Steps 2 to 5 inside the providers: a guest session, its embedded wallet, then SpiceDeposit with the withdrawal batch. */
function Inner({ to, mode = "deposit", onStarted, onFunded, onError, onClose }: SpiceFundingProps) {
  const { ready, authenticated } = usePrivy();
  const { createGuestAccount } = useGuestAccounts();
  const { wallets, ready: walletsReady } = useWallets();
  const asked = useRef(false);
  const [err, setErr] = useState("");
  // after funding, the same window moves on to delivery
  const [step, setStep] = useState<"deposit" | "deliver">(mode === "resend" ? "deliver" : "deposit");
  useEffect(() => {
    if (!ready || authenticated || asked.current) return;
    asked.current = true;
    createGuestAccount().catch((e) => setErr(e instanceof Error ? e.message : "Couldn't start a Spicenet session."));
  }, [ready, authenticated, createGuestAccount]);
  const embedded = walletsReady ? wallets.find((w) => w.walletClientType === "privy") : undefined;

  if (err) return <div className="err">{err}</div>;
  if (!ready || !authenticated || !embedded) return <p className="small mute">Starting Spicenet…</p>;
  if (step === "deliver")
    return (
      <SpiceWithdraw
        isOpen
        onClose={onClose}
        availableTokens={{ 99901: [{ address: NET.usdc, symbol: "USDC", name: "USD Coin", decimals: NET.usdcDecimals }] }}
        buildSpicenetBatch={lockedBatch(to)}
        onWithdrawExecute={() => onStarted()}
        onWithdrawSuccess={() => onFunded({})}
        onWithdrawError={(e) => onError(e)}
      />
    );
  return (
    <SpiceDeposit
      isOpen
      onClose={onClose}
      destinationChainId={99901}
      destinationTokenAddress={NET.usdc}
      depositActionLabel="Add to Spicenet"
      onDepositSuccess={() => setStep("deliver")}
      onDepositError={(e) => onError(e)}
    />
  );
}

/** Spicenet's funding, mounted when a deposit starts. Elysium mainnet only (the caller checks). */
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
