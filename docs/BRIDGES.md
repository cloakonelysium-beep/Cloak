# Money in from other chains and exchanges

Everything lands at one of the account's **receive addresses** (CloakGloamReceive) on Elysium, never at the wallet.
The app moves what arrives there into the private balance, as with any payment to a receive address. So one landing
spot serves every way in: an exchange withdrawal, a bridge, or someone paying you.

## Relay (live on Elysium mainnet, built Nov 10)

Relay serves Elysium mainnet (chain 99901) with HYPE and USDC. It doesn't serve the testnet, so on testnet the panel
shows a short "opens on mainnet" card (`VITE_BRIDGE_PREVIEW=1` shows the full panel with live mainnet quotes, sending
nothing).

- **From an exchange or any wallet:** a one-time Relay deposit address on the source chain. The user withdraws there
  from the exchange on that network. No wallet connection needed, and the wallet never appears.
- **From a connected wallet (EVM chains):** the wallet signs Relay's transactions on the source chain (an exact
  approve, then the deposit; or one transaction for the chain's own coin), then switches back to Elysium. This links
  that wallet to the receive address, so the app suggests a new address afterwards.
- **Checked before anything is shown or signed** (`packages/sdk/src/bridge/relay.ts`): source chain, token and amount;
  destination chain and token; that Relay's recipient is exactly the receive address; in wallet mode, that every
  transaction is on the source chain from that wallet, and that an approve is exact and only to the deposit contract.
  Anything else is refused. 9 offline tests (`packages/sdk/test/relay.test.mjs`), and live quotes checked on Nov 10.
- **Sources** (live deposit-address quotes into Elysium HYPE on Nov 10): HyperEVM (HYPE, USDC), Arbitrum, Base,
  Ethereum, BNB Chain, Tron, Optimism, Polygon, Avalanche, Monad, Unichain, Linea, World Chain, Sonic, Mantle,
  Berachain, zkSync Era, Scroll, Ink, and Bitcoin (to recheck with a real refund address). Relay's fee was $0.08 to
  $0.30 on $20 from most chains; Tron about $2.50.
- **Solana** deposit addresses need a Relay API key, which a public site can't hold. Off until we have one and a small
  server route (the keeper could proxy it).
- **Tracking:** the panel follows each transfer through Relay's status API (kept on the device for 3 days) and moves
  the money in as soon as it arrives.
- **No Cloak fee on bridging.** Relay can add an app fee (`appFees`); not set.

## Spicenet (Spice Flow): partnership, waiting on their Elysium release

From their docs (spiceflow-docs.spicenet.io, read Nov 10):

- **What it is:** a React SDK (`@spicenet-io/spiceflow-ui` 4.23.1, core 0.10.0). The app defines destination calls;
  the SDK funds them from the user's assets on any supported chain, through EIP-7702 delegation of the user's own
  wallet, and runs them on the destination chain from that wallet.
- **Elysium:** prepared but not live. Core `0.10.1-elysium.0` (npm tag `release-elysium`) has Elysium mainnet's
  metadata (HYPE, WHYPE `0xbA87…5E81`, USDC `0xb47c…0B65`, their delegate `0x8AA0…299f`, escrow `0x7839…6102`), but
  the stable UI doesn't include it, UI 4.23.2 and core 0.10.1 aren't published, and their service activation on
  Elysium is pending. Testnet 99801 is out of their integration.
- **Exchanges and cards:** their `swapper` deposits land only on Base or Arbitrum, so exchanges into Elysium go
  through Relay's deposit addresses either way.
- **Needs:** Privy (`@privy-io/react-auth`, a Privy app id from privy.io), wagmi and react-query in the site. Our site
  is React 18 as required.
- **The integration once it's live:** `SpiceSupply` with `destinationToken` Elysium USDC (or HYPE) and
  `buildActionCalls` returning one call, a transfer of the amount to the user's receive address. The rest of the flow
  is the same as Relay's. Loaded only on the Receive page, so the Privy and wagmi weight stays out of every other page.
- **Privacy:** like Relay's wallet mode, the call runs from the user's own wallet, so it links that wallet to the
  receive address. The 7702 delegation stays on the wallet until cleared.

### Update, Nov 16: the escrow flow (Spicenet's handoff of Nov 15). Planned, simulated, not built

**Their flow.** The user funds a Spice Flow embedded wallet (Privy, Spicenet's app id `cmltzt02300i20cl8zqgzgho8`) from
a wallet, a card or an exchange. Card and exchange funding arrive as Arbitrum USDC first. An intent then has Spicenet's
escrow on Elysium (`0x7839287eAc1Db87b53aF06Be2A704f25F2186102`) transfer canonical USDC (`0xb47c…0B65`) to the address
we give: a fresh Cloak receive address per deposit. Packages: `@spicenet-io/spiceflow-ui@4.24.0` and
`@spicenet-io/spiceflow-core@0.10.1` (both published, Elysium mainnet in core, no install scripts), helper
`buildSpicenetWithdrawalBatch`. This replaces the 7702 plan above, and is better for privacy: on Elysium the money comes
from Spicenet's escrow, not the user's wallet.

**Checked on chain (Nov 15).** The escrow is a 268-byte ERC-1967 proxy to an unverified 16 KB implementation
(`0xbb10…66f1`), with no proxy admin set (so upgrades, if any, go through the implementation). It holds 0 USDC and has
never sent a transaction on Elysium: their Elysium payout hasn't run live yet, matching their note that the reference
flow still needs validating. Their SDK reads Elysium through `rpc.eleos.fun` (answers as chain 99901) and links
`elysiumexplore.com`, neither of them Kinetiq's.

**Simulated (Nov 16), on a fork of mainnet with Cloak's live contracts and Gloam's real vault, real proofs:** a fresh
receive address per deposit; 600 USDC transferred from Spicenet's escrow address to it; the delivery check (a successful
Elysium receipt with a USDC Transfer escrow to our address for the amount) passes; `collectReceived` moves it into the
private balance as 500 + 100 USDC within Gloam's cap in about 19 s; collecting again moves nothing (no double credit);
the shields come from the relay, not the user's wallet. Our side needs no new contract and no SDK change.

**Must-haves when we build it:**
- **Mainnet only.** Their handoff suggests testnet.oncloak.xyz could use the mainnet config. It can't: the testnet site
  makes testnet receive addresses, and testnet's receive contract has no code on mainnet (checked), so mainnet USDC sent
  there could never be collected. The Spicenet option shows on oncloak.xyz only.
- **Credit only what arrives.** Our receive flow already does: it moves what is at the address, nothing from callbacks.
  Show the user Spicenet's status until then, and keep their action id and the Elysium tx hash for support.
- **Lazy-load** Privy, wagmi and the Spice Flow UI on the Bridge page only.
- **Pin exact versions,** and review what the SDK sends where before shipping.
- **Privacy note in the UI:** Spicenet sees both ends (the funding wallet or card, and the receive address), as Relay
  does; amounts and timing can be matched. Same wording as the Relay option.

**Ask Spicenet before we build:** verify the escrow and its implementation on the Elysium explorer; fund it with USDC
(it holds none); run one live payout on Elysium; say how the user signs into Privy without a visible login (their
remaining item); and what happens to the user's money if a payout fails after funding (refund path, time limits).
