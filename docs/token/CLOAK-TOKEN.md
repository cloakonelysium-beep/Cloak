# $CLOAK: the complete sketch

Nov 27. This is the one page that says what $CLOAK is, for the X article (`docs/token/X-ARTICLE.md`) and the token page (`apps/web/public/token.html`, served at `/token`). It's on branch `ccr-b99b9c56-dyp6m2` and **not merged to main**. Nothing here is live until Bob merges it.

The reasoning, the comparisons and the alternatives we didn't take are in `docs/CLOAK-TOKENOMICS.md`. This page is the result.

**Before anything goes public, Bob confirms every value marked ☐ in section 9.** The article and the page use the recommended values.

---

## 1. In one paragraph

$CLOAK is the token of Cloak, the privacy layer for Elysium. It launches on Montra, where Elysium's launch crowd already is. It can be bought, held and sold without showing your wallet from its first trade, through Cloak's own private Montra page. Its value comes from use, not from holding: Cloak's revenue buys $CLOAK in the market and burns most of it, and $CLOAK holders get first and cheaper access to Cloak's auctions. It pays no yield and no share of revenue.

## 2. The token

| | |
|---|---|
| Name and symbol | Cloak, $CLOAK |
| Chain | Elysium (chain 99901) |
| Supply | 1,000,000,000, fixed. Montra's minimum. Nothing can mint more, and burns lower `totalSupply` |
| Contract | Montra's `LaunchToken`: an EIP-1167 clone with no owner, no mint, no proxy, no pause, no blacklist and no transfer tax |
| Pair | Native HYPE |
| Liquidity | The whole supply goes into one Uniswap v4 position from the opening price up, inside Montra's hook. The hook has no function that removes it, so it's locked for good |
| Team allocation | None (Montra has none) |
| Presale, private round, airdrop | None |

## 3. The launch

| ☐ | Setting | Value |
|---|---|---|
| ☐ | Launchpad | Montra (montramarkets.xyz) |
| ☐ | Fee tier | **2%**: Montra 0.4%, creator side 1.6% (1.3% once the LP line is passed). Lowered to **1.1%** on day 30 and locked with `lockFee`. A fee can only ever be lowered |
| ☐ | Anti-snipe | **15 minutes**, falling from 99% to the base fee. Anything paid above the base fee goes to the creator side, which means into burns |
| ☐ | Creator | A fresh Cloak seat, launched through Privacy on Elysium (`launchFromMine`) with Montra builder code `cloak`. The seat's address is published on launch day |
| ☐ | Builder rebate | 25% of Montra's 0.4% on $CLOAK volume for 90 days, to Cloak |
| ☐ | Fee recipient | `CloakMontraSink` (section 5.2). Only the current recipient can call the hook's `updateRecipient`, and the sink can't call it, so nobody can ever redirect $CLOAK's fees, Cloak included |
| ☐ | Cloak's first buy | **2% of supply** (20,000,000) from the treasury, in the launch transaction (Montra exempts the creator's first buy from the anti-snipe fee). It goes straight into a public 12-month lock, for ecosystem use only (the private pool, grants, the genesis drop), never the team. **Alternative: 0%** |
| ☐ | Montra's holders fee route | **Not used.** It pays holders from revenue, and it would leave privately held $CLOAK unpaid, since Gloam's vault can't claim rewards |

The team is paid from Cloak's operating revenue, never from $CLOAK.

## 4. How $CLOAK gains value over time

Two engines, both tied to use.

### 4.1 The burn engine: using Cloak burns $CLOAK

Everything Cloak earns goes to the buyback:

| Source | Rate | Status |
|---|---|---|
| $CLOAK's own pool | the creator side, 1.6% then about 0.6% | from the first trade |
| Builder rebate on $CLOAK | 0.1% of volume, 90 days | from the first trade |
| Launches on Cloak | 1.5% of every successful raise | live |
| Launch pools' trades | 20% of the 0.3% pool fee | live |
| Private buys and bids | 0.25% (Cloak's half of Gloam's 0.5%) | live, paid by Gloam monthly |
| Private sales out of Cloak's vaults | 0.25% | live |
| NFT drops, Montra and other integrations | their fees, and Cloak's builder slots | live |

How each dollar is used:

```
                  all of Cloak's revenue
                           │
                     the buyback
            ┌──────────────┴──────────────┐
          40%                            60%
     runs Cloak                  buys $CLOAK in its pool
 (audits, gas, team)      ┌──────────────┴─────────────┐
                         75%                          25%
                   burned (burn())           ecosystem reserve
                                       (the private pool, grants, drops)
```

- **45% of everything Cloak earns becomes burned $CLOAK.**
- The $CLOAK side of $CLOAK's own pool fees is burned at once, 100%.
- Fees in other tokens are sold for HYPE first. Cloak never holds other projects' tokens.
- Buys come in small pieces, only within 1% of the 30-minute average price, at a random time each day, so nobody can trade ahead of them.
- Every buy and burn is on chain and listed on the token page.

### 4.2 The demand engine: $CLOAK holders get access

Holders get first and cheaper access to the auctions on Cloak (section 6). The more and better launches and drops Cloak hosts, the more that access is worth.

### 4.3 What it depends on

Burns follow Cloak's use. Launch fees are most of Cloak's income, so the token does best when Cloak is where Elysium launches. For every $1M traded in $CLOAK's own pool in the first 90 days, about $17,000 goes to the engine, of which about $7,650 is burned. Scenarios are in `docs/CLOAK-TOKENOMICS.md` section 5.3. They're assumptions, not forecasts, and they don't go in public copy.

## 5. What has to exist on launch day

Nothing already deployed changes. Two small new contracts, plus app and site work.

### 5.1 Already live and used as they are

- **Montra**: the token, the pool and the hook.
- **Privacy on Elysium's Montra page** (`projects/montra`, elysium.oncloak.xyz): private buys, holdings and sales from one-time seats, tested on a mainnet fork.
- **`CloakDrop`** (mainnet factory `0x6b10a7c9873a99d69a68456bfc34b204b85c0ca3`, no owner): each drop takes a GTD list and a WL list as Merkle roots.
- **Cloak's relay**, Gloam's vault, and Cloak's fee sources.

### 5.2 New (about a week, each with forge tests on a fork of mainnet)

- **`CloakMontraSink`** (about 40 lines, no owner):
  - claims $CLOAK's creator fees from Montra's hook;
  - burns the $CLOAK side with `burn()`;
  - sends the HYPE side to `CloakConfig.feeRecipient()`, read live.
  - It never calls `updateRecipient`.
- **`CloakBuyback`** (no owner, fixed splits): the 40 / 60 and 75 / 25 splits, small buys within 1% of the 30-minute average, anyone can trigger it, and the keeper does daily. CloakConfig's `feeRecipient` is pointed at it (a 3-day public change, queued before launch).
- **Fallback** if either isn't reviewed in time:
  - the seat stays the fee recipient;
  - Cloak claims, buys and burns by hand, every round published, as Gloam does;
  - the seat hands the route to the sink once it's ready.
  - The article and page wording changes then (section 9).

### 5.3 App and site work

- The **weekly holder snapshot** and its Merkle roots (6.2).
- The **"$CLOAK holders" preset** on the create-drop form.
- **Seats bidding in drops** through the escrow's `ownerCall`, so private holders can use their WL.
- The **vote page** and counting script (6.3).
- The **token page** (`/token`): facts, contracts, the burn log, and supply in public, in seats, in the pool and burned.

## 6. Utility

### 6.1 On launch day

**Private from the first trade.**
- Buy, hold and sell $CLOAK without your wallet appearing, through elysium.oncloak.xyz.
- Each holding is a one-time address funded from Gloam's vault, sent by Cloak's relay.
- What stays visible: each trade's size on the pool, and the one-time address's balance.

### 6.2 From launch week: holder access to Cloak's NFT auctions

Cloak publishes a $CLOAK holder list every week, from a snapshot at a random block in the past week, announced afterwards. It counts public wallets and Privacy on Elysium seats.

| ☐ | Tier | Holding | What it gives in a drop |
|---|---|---|---|
| ☐ | GTD | at least 1,000,000 $CLOAK (0.1%) | Guaranteed spots at a fixed price, minted before bidding opens |
| ☐ | WL | at least 100,000 $CLOAK (0.01%) | Bids rank as price × (1 + boost) and pay the clearing price ÷ (1 + boost). With the 30% maximum, that's up to 23% less, and WL wins ties against public bids |

- **Every creator on Cloak** can pick the holder list on the create-drop form, so the access covers every drop on Cloak, not only Cloak's own.
- ☐ **Cloak's genesis NFT drop** in launch week, with GTD and WL for holders. Its proceeds go to the buyback.

### 6.3 From day 7: the holder vote

- An open vote with no contract:
  - each holder signs a message (EIP-712);
  - the weight is their $CLOAK at a snapshot block;
  - a public script anyone can rerun counts the result.
- A seat signs with its own key, so private holders vote without showing their main wallet.
- What votes decide (within powers the Safe already has):
  - the day-30 fee cut;
  - the drop thresholds and boost;
  - the genesis drop's terms;
  - which launchpads Cloak's ecosystem vault vets next;
  - how the ecosystem reserve is used;
  - whether to burn Cloak's 2% lock early.
- No vote can pay holders.
- First vote: the day-30 fee cut.

### 6.4 Roadmap

| | What | What it takes |
|---|---|---|
| R1 | **Pay the launch fee in $CLOAK.** 1.0% of the raise in $CLOAK, bought on the market and burned, instead of 1.5% in HYPE | A new escrow, `CloakLaunchBoost`, with the buyback paying the HYPE fee back. No change to the factory or auction |
| R2 | **Premium sealed-bid launches for holders.** Holder bids rank with a boost and pay less, and creators can reserve part of a sale for a holders-only round | A new auction version |
| R3 | **Private holder lists.** Prove you hold enough $CLOAK with a zero-knowledge proof instead of a public snapshot, for drops and launches | `CloakFundsGate` is live. It needs $CLOAK in Gloam's main vault |
| R4 | **Private voting.** The day-7 vote with zero-knowledge proofs | `CloakVote` (small, on Gloam's existing circuit). Needs $CLOAK in Gloam's main vault |

## 7. Making $CLOAK fully shielded

Montra's pool has its own hook, so Cloak's router can't trade it, and Cloak's vaults can't take it. The launch vault takes only Cloak launches, and the ecosystem vault needs a pool with no hook and caps a token at 1% of its supply.

1. **Launch day: seats** (6.1).
2. ☐ **Weeks 1 to 4: a plain pool owned by Cloak.** A native-HYPE v4 pool with no hook, seeded from the ecosystem reserve and treasury HYPE. Arbitrage keeps it at Montra's price, and its fees go to the engine.
3. **Then Gloam's main vault.** Gloam said they'd look at listing $CLOAK once it has a market, with starting caps and their 3-day timelock. That brings shielded notes, private swaps through `CloakRouterV4`, private sends, payment links, R3 and R4. **Public copy calls Gloam's vault the goal, not a promise.**

## 8. What $CLOAK will never do

- Pay yield, staking rewards or a share of revenue. $CLOAK isn't a share in Cloak.
- Mint, rebase, reflect or tax transfers.
- Have an owner, a proxy, or a buyback anyone can switch off or redirect.
- Ask a trader to show their wallet to get a perk.
- Top up burns from the team's pocket, so the burns show only what Cloak really earns.

## 9. To confirm before anything goes public (Bob)

1. ☐ **Montra** (or Ascend; then section 3 and the copy change).
2. ☐ **The 2% tier**, lowered to 1.1% on day 30 (or a flat 1%).
3. ☐ **Anti-snipe of 15 minutes.**
4. ☐ **Cloak's first buy: 2% into a 12-month lock** (or 0%; then the article's and page's "Cloak's own $CLOAK" line changes).
5. ☐ **The split:** 40% to running Cloak, 60% to buying $CLOAK, of which 75% is burned.
6. ☐ **The drop tiers:** 1,000,000 for GTD and 100,000 for WL, with a 30% boost.
7. ☐ **The genesis NFT drop** in launch week.
8. ☐ **The plain pool** in weeks 1 to 4.
9. ☐ **`CloakMontraSink` and `CloakBuyback` ready for launch**, or the by-hand fallback (5.2). If it's the fallback, change the article's "Where the fees go" paragraph and the page's "Burns" card to say "Cloak claims, buys and burns by hand, and publishes every round, until the contracts take over".
10. ☐ **Launch date, opening market cap, and contract addresses** go into the page's "Contracts" card on the day.
11. ☐ **Gloam first.** Any announcement goes to Gloam first so it goes out together (decisions H5). Send them the article before posting.
12. ☐ **A lawyer's read** of the article and page wording.

Copy rule for the article and the page: no em dashes, no colons, no semicolons.
