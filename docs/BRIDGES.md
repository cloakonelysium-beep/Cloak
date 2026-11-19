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

## Spicenet (Spice Flow): built on the `spicenet` branch, off until checked live (see Nov 19 below)

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


### Update, Nov 19: one action, Spice Flow UI 5.0.2 (Spicenet's final instructions). Built, off

Built on the `spicenet` branch (`apps/web/src/spicenet-flow.tsx`, `spicenet.tsx`, `spicenet-lock.ts`,
`spicenet-state.ts`; `packages/sdk/src/bridge/spicenet.ts`). Off unless `VITE_SPICENET_99901=1`, which is set nowhere.
Packages pinned exactly: `@spicenet-io/spiceflow-ui@5.0.2`, `@spicenet-io/spiceflow-core@0.10.3`; Privy, wagmi and viem
unchanged. This replaces 5.0.1's two steps (SpiceDeposit into the Spicenet balance, then a separate SpiceWithdraw).

**Spicenet's four points (Matt, Nov 19) and how they are met:**
1. **One SpiceDeposit**, `skipRecovery={false}` (the SDK's default is `true`), `destinationChainId={99901}`,
   `destinationTokenAddress` Elysium USDC, `depositActionLabel="Delivery to Cloak on Elysium"`. Inside
   `PrivyProvider` → `SpiceFlowProvider` (provider `privy`, mode `7702`, network `mainnet`), with a Privy guest
   session (no login screen); nothing renders until the guest's embedded wallet is ready.
2. **`depositBatches`** calls `quoteSpicenetWithdrawalBatches` with `context.destinationAmount`, this deposit's Cloak
   receive address as recipient, Elysium USDC, chain 99901, the guest embedded address as `userAddress`, and
   `useSpiceExecution().estimate`. No SpiceWithdraw. Fees come from the SDK's quote; none are hard-coded.
3. **Credit from the receipt.** `onDepositSuccess` gives `detail.txHash`, the Elysium delivery. The page reads that
   receipt (`spicenetDelivery`): it must have succeeded and hold a canonical USDC Transfer from Spicenet's escrow
   (`0x7839…6102`) to the receive address, and the amount recorded is what the receipt shows. The callback's `amount` is
   the escrow credit before fees and is never used as a credit. "Arriving" until that block is finalized, then
   "Arrived". With no hash (or after a reload) the address is scanned for the same Transfers (`spicenetDeliveries`).
   The move into the private balance is still `collectReceived` of what is actually at the address.
4. **Interrupted deposits** show "Resume delivery", which reopens the same SpiceDeposit with the same guest session,
   receive address and `depositBatches` (`skipRecovery={false}`, so Spice Flow confirms the funded balance instead of
   charging again). Once the deposit was confirmed in the window (`onSubmit`), a resume first asks Spicenet
   (`relayerService.getWalletActions(guest, { pendingOnly: true })`); while an action is pending nothing reopens. A
   resume from a different guest wallet is refused. Only a window closed before anything was confirmed counts as
   "Didn't start". `escrowRecovery` is not used.

**The plan, as 5.0.2 builds it** (its source, and its own output in `apps/web/scripts/spicenet-lock.test.mjs`): a
`spicenet`-domain batch (chain 4321) with one `createWithdrawalRequest` call to Spicenet's system address, chain
`evm:99901`, whose transfers are the net payment to the receive address plus Spicenet's gas/bridge fee (to
`SPICE_GAS_FEE_RECIPIENT`) and platform fee (to `SPICE_PLATFORM_FEE_RECIPIENT`); and an Elysium batch with no calls and
the same transfers as `tokenTransfers` from `escrow`.

**Destination check** (`spicenet-lock.ts`, Jack's rule: Elysium USDC and the original Cloak address stay fixed). Check
only: it reads both batches and returns the same array untouched. It throws if any transfer is in a token other than
Elysium USDC, on a chain other than Elysium, or to anyone other than the receive address and Spicenet's fee addresses
(`SPICE_GAS/PLATFORM/COMBINED_FEE_RECIPIENT`), if a call can't be read, or if nothing goes to the receive address. Tested
against the SDK's real plan with several fee splits (passes, nothing mutated) and with wrong recipient, token or chain
(refused).

**What a customer can and can't recover (Nov 19, after review):**
- *Money at a Cloak receive address* is the customer's: only their Cloak account can produce or empty it, from any
  browser. But the list of addresses handed out lives in the browser, and a new browser counts them again from the
  first, so it finds older ones only as it hands them out. Hence the next rule.
- *One Spicenet deposit at a time.* While one is on its way and hasn't reached its receive address, the page shows
  "You have a deposit on its way. Please don't start a new one", offers Resume delivery, and after an hour points to
  the Cloak team (Telegram, cloakdesk) with that receive address. No new receive address is made meanwhile.
- *Money that never left Spicenet* sits with Spicenet's guest session, which lives in the browser that started the
  deposit. Resume works there (and for a week after a window closed before confirming, since a card or exchange
  payment can reach Spicenet before the confirm). From another browser, or after clearing site data, only Spicenet's
  team can help; the customer should contact us with the receive address and we take it to Spicenet.
- *Escrow capacity.* Spicenet's escrow on Elysium pays every delivery (about 187 USDC on Nov 19). The page shows what it
  can deliver now, new deposits wait while it holds under 1 USDC, and a delivery larger than its balance is refused
  with a clear message before anything is submitted. The amount box is Spicenet's own, so the check runs when the
  customer confirms, not as they type.
- `onDepositSuccess` also fires with type `wallet-funding` (a card or exchange payment reaching an external wallet);
  only type `deposit` counts as the delivery.

**Still to do before switching on (the user's live test):** one real deposit on mainnet, confirming the Elysium transfer
reaches the receive address, the receipt check records the delivered amount, and it lands in the Cloak private
balance; and one interrupted deposit resumed without paying again.