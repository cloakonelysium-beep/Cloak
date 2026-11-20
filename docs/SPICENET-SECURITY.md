# Spicenet integration: security review and what to do next

Reviewed Nov 19 to 20, 2026, on the `spicenet` branch. Versions pinned exactly: `@spicenet-io/spiceflow-ui` 5.0.2,
`@spicenet-io/spiceflow-core` 0.10.3, `@swapper-finance/deposit-sdk` 0.3.2, `@privy-io/react-auth` 3.51.0. Anything
here applies to those versions only: every upgrade gets the review in "Checking an SDK upgrade" below before it is
pinned. How the integration works is in `docs/BRIDGES.md` (Spicenet section).

**Why this exists:** Spicenet is a third party we know little about. We assume it, or something it depends on, could
be malicious or compromised, and keep what it can reach as small as we can.

## Status at a glance

| # | Item | Status |
|---|---|---|
| 1 | Run Spicenet on its own subdomain (isolation) | **Not done. The most important item** |
| 2 | Live test of one real card payment end to end | **Not done. Card payments are already on in production** |
| 3 | Cap per payment (500 USDC, 10 minimum), in the card widget itself | Done |
| 4 | Card route only (no exchange or wallet routes supported) | Done |
| 5 | One card payment at a time, no new address while one is on its way | Done |
| 6 | Credit only from the Elysium receipt, never a callback | Done |
| 7 | Check-only destination guard on Spicenet's delivery plan | Done (limits below) |
| 8 | Support details kept per payment (action ids, wallets, transactions) | Done |
| 9 | Exact version pins, review before every upgrade | Ongoing |
| 10 | Spicenet to verify the escrow's source and say who can upgrade it | Not asked yet |
| 11 | Drop `'unsafe-eval'` from the site's CSP | Not done (predates Spicenet) |
| 12 | "Find my funds" scan of the first receive addresses on a new device | Not done (nice to have) |
| 13 | Matt's open questions: cancelling an expired withdrawal, the card provider's reference | Waiting on Spicenet |

## What the review found

### No backdoor found

Checked in the shipped code of all three packages (minified, about 850 KB for the UI):
- No `eval`, `new Function`, remote script loading or code downloaded at runtime. The only dynamic imports load
  bundled packages (Swapper's SDK, viem).
- No access to cookies, `crypto.subtle`, React internals, `fetch` or `XMLHttpRequest` patching. Storage is limited
  to their own keys (`spiceflow:*`, `spiceflow-mode`, pending deposits).
- The customer's own wallet is never asked to sign a message or typed data. The EIP-7702 delegation is signed only by
  Spicenet's guest (embedded) wallet, never the customer's wallet.
- Token approvals are for the exact amount, never unlimited. No permit to arbitrary spenders.
- Wallet deposits go to the escrow address hard-coded in `spiceflow-core`. The escrow address their server returns is
  checked against it, so their server can't redirect deposits.
- Swapper's iframe messages are checked by origin. Its "ask a wallet to send a transaction" bridge exists in the SDK
  but Spicenet doesn't switch it on.
- No install scripts run from npm (only `prepare`, which doesn't run for registry installs). Lockfile has integrity
  hashes; pnpm blocks dependency build scripts.

Limits of this review: a targeted read, not a line-by-line audit. Privy (closed source, large) and the ~420
transitive packages weren't reviewed line by line. Spicenet's servers and its escrow contract (unverified source on
Nov 15) can't be inspected from our side.

### Risks, most serious first

1. **High. Their code runs inside our page.** Once someone opens Pay by card, Spicenet's SDK, Privy and their
   dependencies run on oncloak.xyz, in the same tab where the private account is unlocked, until the page reloads.
   Malicious code there could ask the customer's wallet to sign Cloak's unlock message (the prompt would show
   oncloak.xyz and look exactly like ours), read the page, or hook network calls. Our CSP already allows
   `'unsafe-eval'`, so it could also run downloaded code. Fix: item 1 below.
2. **High. Spicenet holds the money in flight.** Between payment and delivery the money sits in a guest wallet in
   Spicenet's own Privy app, delegated to Spicenet's contract and signing without asking, or in their upgradeable
   escrow. They (or whoever compromises them) could keep it. We can't prevent that, only keep it small: the 500 cap,
   one payment at a time, and crediting only what arrives on Elysium.
3. **Medium. Our destination guard isn't the final word.** `spicenet-lock.ts` checks the plan our callback returns
   (Elysium USDC, only to the receive address or Spicenet's fee addresses). The SDK can still add transfers after it
   (it does for non-USDC payments, crediting the guest wallet), and Spicenet's servers and escrow do the actual
   payout. The guard protects against SDK bugs and tampering in the browser, not against Spicenet itself.
4. **Medium. The card checkout is a Firebase-hosted page** (`swapper-deposit-sdk.web.app`), not a swapper.finance
   address. Whoever controls that Firebase project controls the card form.
5. **Low. Swaps run 1inch's calldata as returned.** When the source token needs swapping, the guest wallet executes
   1inch API responses. A compromised 1inch API could drain the guest wallet. Doesn't apply to the card route.
6. **Low. Privacy.** The window talks to `tx-submission-api.spicenet.io`, `portal-api.spicenet.io`, Privy, CoinGecko,
   Alchemy prices, 1inch, Metric and Google Fonts (the visitor's IP). Spicenet sees the payment side and the receive
   address, as any on-ramp does.

### Cloak's footprint

- Spicenet code lives in `apps/web/src/spicenet.tsx`, `spicenet-flow.tsx` (loaded only when the card window opens),
  `spicenet-lock.ts`, `spicenet-state.ts`, `cloakCard.tsx`, and `packages/sdk/src/bridge/spicenet.ts`.
- Outside those: `pages/Receive.tsx` (the Deposit pages), `gloam.ts` and `collection.ts` (collection now rotates
  through older receive addresses, a change for every user), `bridge.tsx`, `ui.tsx` (`Powered`).
- Site-wide: `vercel.json` CSP `frame-src` now allows `auth.privy.io`, `deposit.swapper.finance` and
  `swapper-deposit-sdk.web.app` on every page. Root `package.json` overrides `@solana/kit` to 8.6.0 (for Privy).
- With the flag off the Spicenet code never loads. With it on, it loads only after "Continue to payment".

## Recommendations, in order

### 1. Run Spicenet on its own subdomain (most important)

Host the card window on `pay.oncloak.xyz` (a separate origin), opened in a popup or iframe from the Deposit page:
- Cloak sends in only the receive address (and the resume details). It gets back only the delivery transaction hash
  and action ids, by `postMessage` with origin checks both ways.
- The private account is never unlocked on that origin, so Cloak's keys, the unlock signature and the page never
  meet Spicenet's code. A compromised Spicenet could then reach only money already in flight with Spicenet.
- Crediting doesn't change: the main site already credits only from the Elysium receipt and collects what is at the
  address.
- The `frame-src` and Privy allowances move to that subdomain's own CSP; oncloak.xyz loses them.
- Privy's app must allow the new origin (Spicenet's app id, so Spicenet adds it).

### 2. Run the live test now

Card payments are on in production before the one check Spicenet asked for. One payment of 10 to 20 USDC: the card
window refuses more than 500 as it is typed, the row shows "On its way", then "Arrived, confirming" with the amount
from the Elysium receipt, then "Arrived", and the USDC reaches the private balance. If anything fails, unset
`VITE_SPICENET_99901` in Vercel and redeploy (a redeploy of the live commit builds, see `apps/web/scripts/vercel-ignore.sh`).

### 3. Keep the limits

- 500 USDC per payment, 10 minimum (`CARD_CAP`, `CARD_MIN` in `spicenet-state.ts`), set in the card widget through
  Cloak's own `embedFactory` (`maxDepositUsd`, `minDepositUsd`, `supportedDepositOptions: ["depositWithCash"]`) and
  checked again before delivery. Raise only after Spicenet's Elysium payouts have a track record.
- One payment at a time. Card route only.

### 4. Ask Spicenet about the escrow

Ask them to verify the escrow (`0x7839287eAc1Db87b53aF06Be2A704f25F2186102`) and its implementation on the Elysium
explorer, and to say who can upgrade it (a multisig? a timelock?). It is an ERC-1967 proxy with an unverified 16 KB
implementation.

### 5. Drop `'unsafe-eval'` from the CSP

Predates Spicenet, but it widens what any injected code could do. Check what needs it (likely a prover or a library)
and remove it if possible.

### 6. "Find my funds" scan (nice to have)

The list of receive addresses handed out lives in the browser. On a new device it starts again from address #1, so an
address with money waiting is found only as new ones are handed out. Money is never lost (only the account can move
it), but a scan of the first ~20 addresses on unlock would find it at once. Until then, support can trace it from a
customer's support details.

## Checking an SDK upgrade

Before pinning any new version of `spiceflow-ui`, `spiceflow-core` or `@swapper-finance/deposit-sdk`:

1. Read the changelog and diff the published `dist/` against the pinned version (`npm pack` both, unpack, diff).
2. `package.json`: no new `preinstall`, `install` or `postinstall` scripts; new dependencies are known and pinned.
3. Search the shipped code for: `eval(`, `new Function`, `import(` of anything not bundled, `createElement("script")`,
   `document.cookie`, `localStorage` keys outside `spiceflow`, `addEventListener("message"` without an origin check,
   `window.ethereum`, `personal_sign`, `signTypedData`, `signAuthorization` (must stay on the embedded wallet),
   unlimited approvals (`maxUint256`), new hosts in `https://` strings.
4. Confirm the escrow address in `spiceflow-core` (`getEscrowContractAddress(99901)`) is unchanged, and the server
   check against it is still there.
5. Run `apps/web/scripts/spicenet-lock.test.mjs`: it calls the SDK's real `quoteSpicenetWithdrawalBatches` and must
   pass unchanged (a legitimate plan passes, a wrong recipient, token or chain is refused).
6. Open the card window locally and check the Swapper iframe URL still carries `maxDepositUsd=500`,
   `minDepositUsd=10` and `supportedDepositOptions=["depositWithCash"]`, and that typing more than 500 is refused.
7. Typecheck, site and SDK tests, production build, then pin the exact version.

## Open questions for Spicenet

- When a withdrawal expires unpaid, does reopening the same SpiceDeposit with `skipRecovery={false}` let the user
  cancel it, or is there a call to make? (Cloak's Resume reopens the window once a request is past its hour.)
- Can the SDK expose the card provider's payment reference after a card payment, for support?
- Will they verify the escrow's source and say who can upgrade it (item 4)?
