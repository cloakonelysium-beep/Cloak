# $CLOAK tokenomics: the proposal

> **The settled sketch is `docs/token/CLOAK-TOKEN.md`** (Nov 27), with the X article and the token page. This file keeps the reasoning and the alternatives. Where they differ, the sketch wins.

Nov 27. A full design for $CLOAK, built on what Cloak already runs on mainnet. It extends `docs/CLOAK.md` and changes two decisions there (the buyback split, and where $CLOAK launches). **Those changes need Bob's yes before anything is built.**

> **Update (Nov 27, later): Bob may launch $CLOAK on a launchpad (Montra or Ascend) for the crowd.** That plan is section 11. It replaces sections 3 and 4 (supply and genesis). The engine (section 5), the utility (section 6) and the things we won't do (section 7) still apply, with the changes listed in 11.7.

Prices use 1 HYPE = $73, the figure the mainnet decisions used. Every number in the scenarios is an assumption, not a forecast.

---

## 1. The short version

| | |
|---|---|
| **Supply** | **500,000 $CLOAK.** Fixed, 18 decimals, plain `CloakToken`: no mint, no owner, no tax, no proxy. Supply can only go down |
| **Launch** | **On Cloak, in its own sealed-bid auction**, after the audit. Every buyer pays one clearing price, nobody can snipe it, and the token is private from its first block |
| **Genesis split** | 50% auction (250,000). 35% pool reserve (175,000), locked forever. 15% Cloak, streamed over 24 months (75,000) |
| **Genesis burn** | Every unsold token and every unused pool token is burned at settlement. Supply is set by real demand on day one |
| **The engine** | All of Cloak's revenue goes to `CloakBuyback`, a contract with no owner. **60% buys $CLOAK** (75% of that is burned, 25% is kept for the ecosystem). **40% runs Cloak** |
| **$CLOAK's own pool** | Cloak is the creator, so it gets 100% of its trading fees. The $CLOAK side is burned and the HYPE side goes to the buyback |
| **Utility** | Launch day, no contract changes: private buying and holding, WL and guaranteed spots in Cloak's NFT auctions for holders, and a holder vote from day 7. Roadmap: pay the launch fee in $CLOAK, premium sealed-bid launches for holders, private holder lists, private voting |
| **Never** | Yield, revenue share, emissions, a transfer tax, reflections, rebases, or any perk that makes you show your wallet |

The idea in one line: **every product Cloak ships either earns revenue that burns $CLOAK, or needs $CLOAK to be burned or locked to use it.** No part of it depends on people simply holding.

---

## 2. What the others do, and what we take from it

| | Supply | How value flows to the token | Who runs the buyback | Weak spot |
|---|---|---|---|---|
| **Gloam ($GLOAM)** | 500,000, fixed. No team share, no presale, all in the pool (Orynth, Robinhood Chain) | Half of protocol fees (0.5% cash-out) buy $GLOAM. The rule is half burned and half to the treasury, but every logged round so far was 100% burned. 2,039 burned in 5 rounds (Oct 31 to Nov 27) | The team, by hand, "when fees are worth it", with founder top-ups every round | It's at the team's discretion and "can change or stop". The founder's top-ups hide how much the fees really pay for |
| **VoidCash ($VOID)** | 1,000,000,000. Launched on Volta (Elysium), Nov 4 | 50% of the 1% HYPE exit fee buys and burns VOID. The OTC desk's fees buy and burn too. 35% of Volta's 1% swap fee buys and burns | A fee collector anyone can call, capped at 0.5 HYPE per buy and **10 HYPE a day** | One admin key can upgrade the vault and the collector with no delay. Team allocation isn't disclosed. The token has no use beyond the burn. Its "trading tax" is really Volta's fee, 35% of which goes to the team |
| **Railgun ($RAIL)** | 100M, fixed | 0.25% on every shield and unshield goes to the treasury. Locked stakers get 4.2% of it every two weeks. No buyback or burn | Governance | Paying fees to holders is the model regulators watch most closely. The token isn't needed to use Railgun |
| **Hyperliquid ($HYPE)** | Large, with emissions | Trading fees buy HYPE automatically through the Assistance Fund, and that HYPE is burned. Staking pays fee discounts of up to 40% | Automatic, in the protocol | Staking rewards come from emissions, not fees, so "burn" and "yield" are separate numbers |
| **Aztec ($AZTEC)** | Large, about 2.4% inflation in year one | Staking for sequencers (200,000 a node). Fee burns are planned | None | No buybacks. Deflation is "merely theoretical" at today's usage |

**Lessons for $CLOAK:**
1. **The buyback must be code, not a promise.** Gloam's and Void's both rely on a person: Gloam runs its own, and Void's collector can be upgraded by one key with no delay. Cloak's should be a contract with no owner, fixed splits, and buys anyone can trigger and anyone can check. That alone puts Cloak ahead of both.
2. **Burns need volume, so the token has to sit in the path of volume.** VOID's burn is capped at 10 HYPE a day, and Aztec's needs usage it doesn't have. $CLOAK's burns come from launches (Cloak's biggest income by far), trades and its own pool.
3. **Utility can't cost you your privacy.** Railgun and Gloam both say holding the token gives nothing you'd need to show your wallet for. We keep that rule: anything that needs proof of holding is proved privately, or it's only for people who are already public (creators, listed projects, relayers).
4. **Don't pay holders.** Gloam: "holding it gives no right to Gloam's fees". We use the same line.
5. **Say what the team gets.** Gloam has no team share and Void doesn't say. Cloak's is small, streamed in public by a contract, and capped (section 4.3).

---

## 3. Supply: 500,000 is right

Supply on its own doesn't change value: the market cap does. But it shapes three real things, and 500,000 wins on each.
- **Burns you can read.** Burning 500 $CLOAK is 0.1% of supply, which people can follow round by round. At 1B (VOID) a burn is a nine-digit number nobody can picture.
- **A sensible price.** At a $1M to $5M market cap, the price is $2 to $10 a token. That's easy to quote in HYPE and in dollars, and room for private notes of round sizes (1, 10, 100) that hide amounts well.
- **The genesis burn makes it smaller anyway.** A sale that isn't fully covered burns its leftovers, so the real supply after day one will probably be 400,000 to 500,000.

The one downside: $GLOAM and GLOAK are both 500,000 too, so expect "Cloak copied Gloam". Answer it with the facts: GLOAM's supply sat in a pool from day one, while $CLOAK's real supply is set at its auction by demand, and everything unsold is burned.

---

## 4. Genesis: launching $CLOAK on Cloak

### 4.1 Why on Cloak, not elsewhere

`docs/CLOAK.md` left this open. **On Cloak is clearly better:**
- **The best demo possible.** The privacy launchpad launches its own token in its own sealed-bid auction, with no snipers, one price, and private bids from the private balance.
- **Private from block one.** Every Cloak launch is admitted to the launch vault when it settles. There's no 3-day wait and no need for anyone else to agree.
- **All the pool's fees come back.** As creator, Cloak gets 80% of the pool's trading fees, and its 20% treasury share on top. That's 100% of $CLOAK's pool fees going into the engine. On another launchpad, that launchpad keeps part of it.
- **A pool our router can always trade.** It's a Cloak launch pool, which is one of the two kinds `CloakRouterV4` routes.
- **Leftovers are burned by code.** `CloakAuction.settle` already sends unsold tokens and the unused pool reserve to `0x…dEaD`.

Gloam's main vault is still the end goal. The existing graduation path (`CloakGraduation`) moves holders across once Gloam lists it, as Gloam said they'd consider after the audit.

### 4.2 The allocation

| Bucket | $CLOAK | % | Where it goes |
|---|---|---|---|
| Sealed-bid auction | 250,000 | 50% | Bidders, at one clearing price |
| Pool reserve | 175,000 | 35% | Paired with 70% of the net raise in $CLOAK's v4 pool, **locked forever**. What isn't needed is burned |
| Cloak (creator share) | 75,000 | 15% | `CloakVesting`, streamed every second for 24 months from the end of the reveal window (under the factory's 20% cap) |

Launch parameters:
- `lpBps = 7000`: 70% of the net raise goes into the pool. The contract requires `lpReserve ≥ saleSupply × lpBps`, and 175,000 = 250,000 × 70% exactly.
- `lpLockUntil = max`: locked forever, with the creator earning the fees.
- `noRevealPenaltyBps = 2000` (the floor).
- A **`minRaise`** of about 4,000 HYPE. Below that the launch fails and every deposit comes back (see 4.3).
- A **meaningful minimum price** (see 4.4).

How the creator's 75,000 is used. It's one stream to one address, the 2-of-3 Safe, and the split is published:

| Use | $CLOAK | % of supply |
|---|---|---|
| Team | 40,000 | 8% |
| Ecosystem: grants, integrations (Eloscape, Montra, launchpads), rewards for early private users | 25,000 | 5% |
| Partners and security (Gloam, Elysium, auditors, bug bounties) | 10,000 | 2% |

There's **no airdrop pot**. The sale is the distribution. Early users can be rewarded later from the ecosystem share, proved privately with `CloakReceiptCheck` (proof you made private payments), never with a snapshot of wallets.

### 4.3 The trap in an undersubscribed sale, and the fix

The factory checks the creator's 20% against the **planned** supply. If the sale isn't fully covered, the leftovers are burned, so the creator's share of the **real** supply goes up:

| Sold | Supply after the burn | The 75,000's real share |
|---|---|---|
| 100% | 497,375 | 15.1% |
| 80% | 412,900 | 18.2% |
| 60% | 328,425 | 22.8% |
| 40% | 243,950 | 30.7% |

The fix has three parts:
1. **`minRaise` of about 4,000 HYPE.** Below that, the launch fails and everyone gets their deposit back. A weak launch is better retried than kept.
2. **A written commitment: the team's share follows the market.** After settlement, Cloak burns from its stream whatever brings the 75,000 down to **15% of the real supply**. At 60% sold, it would burn 30,278 of the first tokens it receives (75,000 less the burn equals 15% of the smaller supply). Anyone can check this on chain.
3. **Show it in the launch page's "before you bid" card**, so bidders see the rule before they bid.

### 4.4 Whale lockout (W-01) at $CLOAK's own launch

The known issue: with a 10,000 HYPE total cap, someone using 100 wallets can fill the cap at the minimum price and buy the whole sale. For Cloak's own token, this is the one launch where it matters most. Two defences, which both exist already:
- **Lift the total cap for this launch.** After the audit, raise or drop `total` and keep the 100 HYPE per-bid cap. The decisions file already notes that without the cap the lockout can't happen, and the 3-day public wait on the change works as an announcement.
- **Set the minimum price at a real floor** (for example 0.024 HYPE, about a $875k market cap). With `minRaise` at 4,000 HYPE, that also means at least two thirds of the sale must sell, so even a lockout pays a fair price.

### 4.5 What day one looks like (at a 10,000 HYPE raise, fully sold)

- Clearing price 0.04 HYPE ($2.92). Supply 497,375. Market cap $1.45M.
- **The pool holds 6,895 HYPE ($503k) and 172,375 $CLOAK, locked forever.** That's liquidity worth about 69% of the market cap, deeper than nearly any launch. It also means the buyback's purchases move the price little, and it can't be rugged.
- Cloak keeps 2,955 HYPE ($216k). **It's earmarked first for the outside audit and the next review**, then runway. This money is why the engine can send more to buybacks than Gloam's can (section 5).
- `CloakBuyback` is live from the first block. Queue the CloakConfig `feeRecipient` change 3 days before settlement, so it switches over at launch.

---

## 5. The engine: revenue into burns

### 5.1 Where the money comes from (all built, mainnet numbers)

| Source | Rate | Paid in |
|---|---|---|
| Launch fee | 1.5% of every successful raise | HYPE |
| Launch pools' trading share | 20% of the 0.3% fee (and of the anti-snipe fee) | HYPE and the token |
| Gloam's share | 0.25% of every private buy and bid (half of Gloam's 0.5%) | Paid monthly by Gloam |
| Cloak's trade fee | 0.25% of every private sale out of Cloak's vaults | HYPE or USDC |
| **$CLOAK's own pool** | **100% of its trading fees** (80% as creator plus the 20% share) | HYPE and $CLOAK |
| NFT drops (`CloakDrop`) | its protocol fee | HYPE |
| Integrations (the Privacy on Elysium apps) | e.g. Cloak's builder slot in Montra fee splits (up to 20% of the creator side) | HYPE and the token |
| Later | a bridge fee (Relay), off for now | HYPE |

In every scenario, launch fees are most of the income. **$CLOAK's value comes mostly from Cloak being Elysium's launchpad.** Privacy trading adds to it, but launches carry it.

### 5.2 `CloakBuyback`: what it does

It has no owner, and the splits are fixed in the code.

```
            all revenue (HYPE, USDC, launch-token fees)
                         │
                  CloakBuyback  (anyone can run it, the keeper does daily)
           ┌─────────────┴──────────────┐
         40%                            60%
     Treasury (Safe)            buys $CLOAK in its pool
  audits, relay gas, ops     ┌───────────┴───────────┐
                            75%                     25%
                    burned (0x…dEaD)     Ecosystem reserve ($CLOAK, Safe)
                                         grants, the plain pool, drops
```

- **45% of all revenue is burned as $CLOAK.** The current plan (Gloam's split) burns 25%.
- **Separately, $CLOAK's own pool fees:** the $CLOAK side is burned at once (100%). The HYPE side goes into the engine above.
- **Other tokens' fees** (launch tokens from the 20% share, Montra's) are sold for HYPE through the router first. Cloak never holds other projects' tokens.
- **How it buys** (as already decided, with one addition): in small pieces, only when the price is within 1% of its 30-minute average, and with a per-day limit that grows with the pool's depth. The caller gets its gas back, capped. The addition is that **it runs at a random time each day**, so nobody can trade ahead of it on a schedule.
- **Changing the splits** means deploying a new `CloakBuyback` and pointing CloakConfig at it. That waits 3 days in public, and once the holder vote is live (6.3), it also goes to a vote first.

**Why we can burn more than Gloam:** Cloak's costs are close to zero. Hosting is on free plans, and the relay's gas is covered about 30 times by fees (decisions H6). The audit is paid from the genesis raise. So 40% is plenty for running Cloak, and the rest can go to buybacks.

### 5.3 What the burns could be

These are monthly scenarios. Each assumes a level of activity, not a prediction.

| | Quiet | Steady | Strong |
|---|---|---|---|
| Launches a month × average raise | 4 × 800 HYPE | 12 × 2,000 HYPE | 30 × 4,000 HYPE |
| Private buys + bids / sales | $350k / $200k | $2M / $1.2M | $8M / $5M |
| Launch pool volume / $CLOAK pool volume | $1.5M / $0.3M | $8M / $1.5M | $30M / $6M |
| **Revenue a month** | **$6.5k** | **$42.7k** | **$196k** |
| Burned a month (45%) | $2.9k | $19.2k | $88k |
| **Supply burned a year at a $1.5M market cap** | 2.3% | 15.4% | 70.7% |
| …at a $5M market cap | 0.7% | 4.6% | 21.2% |
| …at a $15M market cap | 0.2% | 1.5% | 7.1% |
| (with the current 25% split, at $5M) | 0.4% | 2.6% | 11.8% |

How to read it: **the lower the price compared with revenue, the faster supply shrinks.** That pull is what holds a price up. This counts revenue burns only, not the utility burns in section 6.

---

## 6. Utility (revised Nov 27: nothing that changes Cloak's contracts for now)

Bob's rules for utility:
- launch day uses **only contracts that are already live** on mainnet;
- anything that needs contract work goes on the **roadmap**, with three items: paying the launch fee in $CLOAK, premium sealed-bid launches for holders, and private holder lists for NFT auctions.

The Spotlight, Cloak Names, the listing review fee and relayer bonds are dropped.

### What Gloam's token does (for comparison)

$GLOAM's utility is:
- **governance**: holders vote on new assets, new chains, deposit limits and fees. The first vote ran in the open from Oct 29 to Nov 1, and private voting is "Next";
- **first access** to new features;
- **private holding** in Gloam's vault;
- **later**, relayers staking it.

Value comes from buybacks, which are "a treasury decision", plus the vote. That's the bar. $CLOAK matches it on day one and goes further with real access to auctions.

### On launch day (no contract changes)

**6.1 Private from the first trade.**
- Buy, hold and sell $CLOAK without showing your wallet, through Privacy on Elysium's Montra page (one-time seats funded from the private balance, sent by the relay). It's built and tested on a mainnet fork.
- No other token on Elysium can say that on its first day.

**6.2 Holder access to Cloak's NFT auctions.**
- `CloakDrop` is live on mainnet (factory `0x6b10…ca3`, no owner) and every drop already takes two lists, both Merkle roots:
  - **GTD**: guaranteed spots at a fixed price, minted before bidding opens;
  - **WL**: WL bids rank as price × (1 + boost) and pay the clearing price ÷ (1 + boost). The boost is up to 30%, so a WL winner pays up to 23% less and wins ties against public bids.
- **Cloak publishes a "$CLOAK holders" list every week** (a snapshot at a random block in the past week, announced after the fact, so you can't buy the day before and sell the day after):
  - holders of at least 1,000,000 $CLOAK (0.1%) go on the GTD list;
  - holders of at least 100,000 go on the WL list;
  - the snapshot counts public wallets and Privacy on Elysium seats.
- **The create-drop form offers that list as a preset**, so every NFT creator on Cloak can give $CLOAK holders WL or GTD with one click. Creators get a crowd that's ready to buy, and holders get access across every drop, not just Cloak's own.
- **Cloak's first drop** is a genesis NFT collection in launch week, with GTD and WL for holders. Its proceeds go to the treasury and the buyback.
- App work only:
  - the snapshot script;
  - the preset on the form;
  - letting a seat bid in a drop (it calls the drop through its escrow's `ownerCall`, as it already calls Montra). Until that's done, WL bids come from public wallets.

**6.3 The holder vote, from day 7.**
- **An open, signed vote with no contract**, the way Gloam ran its first one:
  - each holder signs a message (EIP-712) for a choice;
  - the weight is their $CLOAK balance at a snapshot block;
  - a public script anyone can rerun counts the result.
- **Private holders vote too:** a seat signs with its own key, so they vote without showing their main wallet.
- **What the Safe does with a result:** it carries out what passes, within powers it already has:
  - lowering $CLOAK's fee tier on day 30;
  - the first drop's terms and the holder thresholds in 6.2;
  - which launchpads the ecosystem vault vets next;
  - how the ecosystem reserve is used (grants, the plain pool in 11.5);
  - whether to burn Cloak's 2% lock early.
- No vote can pay holders.
- Build: a page on the site, the counting script and a weekly snapshot. **Ready a week after the token: yes.**

**6.4 Burns from day one.** $CLOAK's pool fees go to `CloakMontraSink` (11.3). That's a new 40-line contract, but it changes nothing that's already deployed. If even that should wait, the fee recipient starts as Cloak's launch seat. Cloak claims and burns by hand, with every round published as Gloam does. Then the seat hands the route to the sink with `updateRecipient`, which only the current recipient can call. The buyback runs the same way (by hand, logged) until `CloakBuyback` is reviewed.

### Roadmap (needs contract work, after the audit)

**R1. Pay the launch fee in $CLOAK.**
- A creator pays 1.0% of the raise in $CLOAK, bought on the market and burned, instead of 1.5% in HYPE.
- A new `CloakLaunchBoost` escrow plus `CloakBuyback`, which pays the HYPE fee back. The factory and the auction stay as they are.

**R2. Premium sealed-bid launches for holders.**
- A new auction version that brings `CloakDrop`'s WL rules to token launches: holder bids rank with a boost and pay clearing ÷ (1 + boost), and a creator can set aside part of the sale for a holders-only round.
- It's a new factory and auction, so it waits for the audit.
- Creators choose it, holders get first and cheaper access to the best launches, and it's one more reason to launch on Cloak.

**R3. Private holder lists for NFT auctions and launches.**
- Once Gloam lists $CLOAK (11.5), replace the snapshot with a zero-knowledge proof: `CloakFundsGate`, already live, confirms wallets that privately hold at least the threshold, and its confirmed list becomes the drop's or launch's WL.
- Holders get access without their holdings ever being public. That's the privacy version of 6.2.

**R4. Private voting** (`CloakVote`, reusing Gloam's funds circuit), replacing the open vote in 6.3 once $CLOAK is shielded.

---

## 7. Things we won't do, and why

| Idea | Why not |
|---|---|
| Yield, revenue share or "real yield" staking | Paying holders from revenue looks like a security. Burning does the same job without the promise. Gloam and Cloak's own decisions say the same |
| Emissions or "staking rewards" | They dilute holders to pay holders. Aztec and Hyperliquid both show the burn being offset |
| A transfer tax (like VOID's "trading tax") | Aggregators and wallets flag it, CloakToken's clean listing story is lost, and private routing gets harder. GLOAK is where Cloak tests special token rules |
| Fee discounts for proving you hold $CLOAK when trading | The proof would tie your trades together. We only use private proofs (R3, R4) where linking doesn't matter |
| Pairing every launch with $CLOAK instead of HYPE | That's how Virtuals did it. It makes demand, but every launch's liquidity would fall with $CLOAK, it adds a hop to every private route, and it means new contracts. If anything, it's for a far later version |
| Founder top-ups to the buyback (like Gloam) | They make the burns look bigger than the fees really pay for. We report only what the contract does |
| An upgradeable buyback or token (VoidCash's risk) | One key with no delay could change everything. Ours have no owner and no proxy |

---

## 8. The order of things

**Phase 0, now until the audit**
- Keep revenue in the treasury (as now).
- Build and test `CloakBuyback` and `CloakMontraSink` (forge, plus fork runs). Neither touches a deployed contract. Roadmap contracts (R1, R2) come after the audit.
- Run GLOAK (it's ready, and only the owner's door call is left). It shows the sealed-bid machine working with real money before $CLOAK.
- Publish this design so people can comment on it.

**Phase 1, genesis (after the audit)**
- Raise or lift the per-launch cap (3 days in public), and queue the CloakConfig `feeRecipient` change to `CloakBuyback` (3 days).
- $CLOAK's sealed-bid launch: 250,000 for sale, 175,000 pool reserve, 75,000 streamed, `minRaise` about 4,000 HYPE.
- At settlement: leftovers burned, the pool locked, the buyback live, the team-share burn done if needed (4.3).
- Announce together with Gloam (H5).

**Phase 2, the first 90 days**
- Launch week: the first weekly holder list and Cloak's genesis NFT drop with GTD and WL for holders (6.2), and a burn and privacy dashboard (burned, in vaults, in the pool, in public, like GLOAK's privacy meter).
- Day 7: the first holder vote (6.3).
- Ask Gloam to list $CLOAK (H4), and seed the plain pool (11.5).

**Phase 3 (roadmap, after the audit)**
- R1 the launch fee in $CLOAK, R2 premium sealed-bid launches for holders, R3 private holder lists, R4 private voting, and graduation into Gloam's vault.

---

## 9. Risks, stated plainly

- **Burns depend on launches.** If launches slow down, so do the burns. The scenarios show how much.
- **The buyback buys in public.** Its size and timing show on the pool. Small pieces, a random time and the average-price check keep the cost low, but they don't hide it.
- **The team and ecosystem stream (15%) will sell some.** It's streamed every second, published, and sized to the market (4.3).
- **The pool's 30-minute average can be pushed** by someone with enough money. That's limited by the pool's depth and the price check.
- **The engine is only as safe as `CloakBuyback`.** It needs its own outside review before revenue goes through it.
- **This isn't legal advice.** The wording follows Gloam's and Cloak's: "half of Cloak's revenue buys back $CLOAK" as a fact about the protocol, never a promise of price or returns. Get a lawyer to read it before genesis.

---

## 10. Decisions for Bob

1. **Supply 500,000:** keep it (recommended).
2. **Launch on Cloak:** yes (recommended), replacing "open" in `docs/CLOAK.md`.
3. **Split 50 / 35 / 15** (auction / pool / Cloak), streamed over 24 months, with the team share following the market (4.3).
4. **The buyback split: 40% ops and 60% buyback, 75% of that burned**, replacing the current 50/50 with half burned. If that's too much, a 50/50 split with 75% burned still burns 37.5% of revenue.
5. **Utility:** launch day 6.1 to 6.4, then the roadmap R1 to R4 (section 6, revised Nov 27).
6. **For $CLOAK's launch:** lift or raise the total cap, a minimum price around 0.024 HYPE (about $875k market cap), and `minRaise` around 4,000 HYPE.

## 11. If $CLOAK launches on a launchpad (Montra or Ascend)

Going where the crowd already is makes sense. A launch nobody watches is worse than a fair one. This section is the plan for that case. Montra's numbers were read from its contracts on Elysium mainnet (Nov 27, through its registry `0xF1E2…2aa7`) and from its docs. Ascend's come from its GitBook docs and weren't checked on chain.

### 11.1 What a launchpad changes

| | Cloak's sealed-bid auction | Montra | Ascend |
|---|---|---|---|
| Supply | Any (500,000) | **1 billion to 1 quadrillion** (every one of its 405 live options defaults to 1B) | **1 billion, fixed** |
| How the price is found | Sealed bids, one clearing price | One-sided Uniswap v4 position from the opening price up. Half the supply is bought by 4× the opening price | v4 pool on Ascend's hook. No bonding curve |
| Team allocation | Up to 20%, streamed | **None.** The creator can make a first buy in the launch transaction | Not stated |
| Anti-snipe | 10% falling to 0.3% over 5 minutes | **99% falling to the base fee over up to 30 minutes.** The creator's first buy doesn't pay it | None documented |
| Trading fee | 0.3% (80% creator, 20% Cloak) | **1, 2, 3, 5 or 10%.** Montra takes 0.4% on every tier, an LP fee (0.1% to 1%) starts past the "LP line" at 142.6×, and the creator side gets the rest. The fee can only be lowered, and can be locked | 1% base, with the creator choosing up to 10%. At the 1% base, the creator side gets 0.35% to 0.75% by market cap band. Under a $40k market cap, 90% of creator fees are held, and lost if it doesn't reach $40k within 14 days |
| Builder rebate | n/a | **25% of Montra's 0.4% for 90 days** to a builder code. Cloak already has one, `cloak` | Not found |
| Liquidity | Locked forever | Locked by the hook (no function removes it). Others can add LP | "Permanently locked" |
| Admin | Cloak's rules | The token is a clone with no owner, mint or proxy. The factory is upgradeable and owned by Montra's Safe | 3-of-5 Safe, no proxies (as stated) |
| Activity | | Much bigger (one count: 371 pools vs Ascend's 13, unverified) | Kinetiq's flagship. Staking-funded buybacks of "Ascended" tokens are planned, **not live** |

**What we lose:**
- the genesis burn;
- 500,000;
- a team share;
- privacy from the first block. A Montra or Ascend pool has its own hook, so Cloak's router can't trade it and Cloak's vaults can't take it (see 11.5).

**What we gain:**
- the crowd and the trending lists;
- **a large creator fee on $CLOAK's own trading, which can feed the engine from day one.**

### 11.2 Recommendation: Montra

1. **Cloak already integrates Montra privately.** Privacy on Elysium (`projects/montra`) launches Montra tokens from one-time seats, holds them, claims their fees and sells them back into the private balance. People can buy $CLOAK without showing their wallet **on launch day**, before any vault lists it. That's the story: "the privacy protocol's token, bought privately on day one."
2. **The builder rebate:** launched with the code `cloak`, Cloak gets 0.1% of all $CLOAK volume for 90 days on top of the creator side.
3. **The creator fee is paid at once,** not held behind Ascend's $40k threshold.
4. **Anti-snipe up to 30 minutes at 99%,** and anything paid above the base fee goes to the creator side, which means into the buyback.
5. **Much more activity,** which is the reason for using a launchpad at all.

Ascend is worth it only if its "Ascended" buyback support goes live and is big, or the Kinetiq relationship is worth more than Montra's crowd. The rest of this section assumes Montra. On Ascend, the same plan works with its fee bands.

### 11.3 The token on Montra

- **Supply: 1,000,000,000** (Montra's minimum). Nothing in section 3 survives except the reasoning that the number is cosmetic. 1B is the norm on launchpads, which helps there, and burns read as big numbers ("2.4M burned").
- **The pair: HYPE** (Cloak's revenue, routes and vaults are all in HYPE).
- **The fee tier: 2% at launch**:
  - Montra 0.4%, creator side 1.6% (1.3% past the LP line);
  - after 30 days, lower it to the 2% tier's floor of 1.1% and call `lockFee`;
  - the high fee is paid while trading is hottest, then it drops for good.
  - If 2% looks greedy for the crowd, take the 1% tier (0.6% creator side) instead.
- **Anti-snipe: 15 minutes** (99% falling to 2%). It's long enough to beat the bots and short enough for real buyers. What bots pay goes to the buyback.
- **The creator: a fresh seat, launched through Privacy on Elysium with the builder code.** Publish the seat's address on launch day.
- **The fee recipient: `CloakMontraSink`, a small contract with no owner** (to build, about 40 lines). It does three things:
  - calls the hook's `claim` for $CLOAK's pool;
  - burns the $CLOAK side with the token's own `burn` (a real burn, `totalSupply` goes down);
  - sends the HYPE side to `CloakConfig.feeRecipient()`, read live. That's the treasury now, and `CloakBuyback` once it exists, so moving the treasury never needs a new sink.

  Only the current recipient can call `updateRecipient` (`NotRecipient` otherwise), and the sink has no function that calls it. **So once it's set at launch, nobody can ever redirect $CLOAK's fees, Cloak included.** Anyone can check that.
- **Don't use Montra's "holders" fee route.** There are two reasons:
  1. It pays holders from revenue, which is the security problem section 7 avoids.
  2. **It punishes privacy.** Rewards build up for every holder in proportion to its balance, contracts included, and a contract has to call `claimRewards` itself. Gloam's vault can't. So the rewards of every privately held $CLOAK would sit in the vault forever, and only public holders would get paid.

### 11.4 Cloak's own $CLOAK, without a team share

Montra has no allocation, so Cloak only owns what it buys.

**The cost is tiny.** On a one-sided position, buying a fraction f of the supply costs the opening market cap × f / (1 − f). At Montra's example opening of about $3.5k:

| Share bought | Cost |
|---|---|
| 1% | about $35 |
| 2% | about $71 |
| 5% | about $184 |
| 10% | about $389 |

That's exactly why a big first buy looks bad: the crowd will call it an insider grab, fairly.

**Recommendation: a first buy of 2% (20,000,000 $CLOAK) from the treasury, put straight into a public 12-month lock**, for ecosystem use only (grants, the private pool in 11.5, the first NFT drop), never for the team.
- The team is paid from the 40% operating share of revenue, not from tokens.
- Announce the 2% and the lock before launch.
- The stricter alternative is to buy nothing at launch. The ecosystem reserve then fills from the buyback's 25% instead. It's the cleaner story (Gloam did 0%), and it costs the ecosystem a few weeks.

### 11.5 Making $CLOAK private (Montra pools have a hook)

Cloak's router trades only plain HYPE v4 pools with no hook, or Cloak's own launch pools. Cloak's vaults have rules too:
- the launch vault takes only Cloak launches;
- the ecosystem vault needs a pool with no hook, and lets at most **1% of a token's supply** be private (fixed at deploy).

So $CLOAK can't use either of Cloak's vaults. The plan has three stages:
1. **Launch day: seats.** Private buys, holdings and sales through Privacy on Elysium's Montra page. Each holding is a one-time address funded from Gloam's vault and driven by the relay, so the holder's wallet never shows. It's private in the sense that matters (who), but the tokens sit in public one-time addresses, not shielded notes.
2. **Week 1 to 4: a plain pool owned by Cloak.** Seed a native-HYPE v4 pool with no hook, using the ecosystem reserve's $CLOAK and treasury HYPE. Arbitrage keeps it at the Montra price. Its LP fees go to the engine. This is the pool Cloak's router and Gloam's router can trade. The ecosystem reserve exists for exactly this.
3. **After that: Gloam's main vault.** Ask Gloam to list $CLOAK (they said they'd look once it has a market, with starting caps and their 3-day timelock).
   - Then $CLOAK becomes a shielded asset: private swaps through `CloakRouterV4` on the plain pool, private sends, payment links, and the funds proofs that private holder lists (R3) and private voting (R4) need.
   - `CloakFundsGate` reads only Gloam's vault and Cloak's launch vault, so those two utilities wait for this stage.

### 11.6 What the engine gets from $CLOAK's own pool

$CLOAK's trading is now a big revenue line of its own. For every $1M of $CLOAK volume:

| Stage | Creator side | Builder rebate | Cloak gets |
|---|---|---|---|
| 2% tier, below the LP line, first 90 days | 1.6% | 0.1% | **$17,000** |
| 2% tier, past the LP line, first 90 days | 1.3% | 0.1% | $14,000 |
| Lowered to 1.1% | about 0.6% | after 90 days, none | about $6,000 |

Anti-snipe fees paid by bots in the first 15 minutes come on top.

A launch-week volume of $3M on Montra would bring Cloak about $50k. At 60% to the buyback and 75% of that burned, that's about $23k of $CLOAK burned, plus the $CLOAK side of the fees, which `CloakMontraSink` burns straight away.

### 11.7 What changes in sections 4 to 9

- **Section 4 (genesis)** is replaced by 11.3 to 11.5. No `minRaise`, cap lift or team-share burn is needed, since there's no auction and no allocation.
- **Section 5 (the engine)** stays as it is. Add two revenue lines: `CloakMontraSink` (the HYPE side of $CLOAK's pool) and the builder rebate. The buyback buys on the Montra pool through Montra's router, and most of the 2% fee it pays comes back to itself through the sink. It burns with `burn()` rather than sending to `0x…dEaD`.
- **Section 6 (utility):**
  - revised Nov 27: launch day is 6.1 to 6.4 (private buying, NFT holder lists, the day-7 vote, burns), with no contract changes;
  - the roadmap is R1 to R4. R3 and R4 also wait for Gloam's listing (11.5).
- **Section 7 (won't do):** add Montra's holders route (11.3).
- **GLOAK keeps the sealed-bid story.** Cloak's own auction is still the thing to show the world, and GLOAK shows it: "Cloak launches GLOAK on Cloak, and $CLOAK goes where the crowd is."

### 11.8 Decisions for Bob (launchpad version)

1. **Montra or Ascend:** Montra (recommended), for the reasons in 11.2.
2. **The fee tier:** 2%, lowered to 1.1% and locked after 30 days (recommended), or a flat 1%.
3. **Cloak's first buy:** 2% into a 12-month public lock (recommended), or 0%.
4. **The fee route:** 100% to `CloakMontraSink` (no holders route). I'd treat this one as non-negotiable.
5. **Anti-snipe:** 15 minutes.
6. **The plain pool for private trading:** seeded in week 1 to 4 from the ecosystem reserve and treasury HYPE, then ask Gloam to list.

To build before launch day: `CloakMontraSink` (with forge tests on a fork of Montra's real hook), a check on a fork that only the recipient can call `updateRecipient` and that `claim` pays the sink, and the launch through Privacy on Elysium's existing `launchFromMine` with the builder code.

## Sources

- Gloam's token page and buyback log: https://gloam.trade/token, and gloamtrade/gloam pull requests [#240](https://github.com/gloamtrade/gloam/pull/240), [#249](https://github.com/gloamtrade/gloam/pull/249), [#351](https://github.com/gloamtrade/gloam/pull/351)
- VoidCash: https://voidcash.io, https://docs.voidcash.io (the VOID, fees and deployments pages)
- Railgun: https://docs.railgun.org (RAIL tokenomics, security rewards, deductions)
- Hyperliquid: https://hyperliquid.gitbook.io/hyperliquid-docs (fees, staking)
- Aztec: https://www.techflowpost.com/en-US/article/34324
- Montra: https://montramarkets.xyz/docs (launching, fees, holders, anti-snipe, reference, builders), and its live configs read on chain through its registry `0xF1E2FA75422F889e565F3142bdbf60B28dce2aa7`
- Ascend: https://ascendlaunch.gitbook.io/docs (fees, Ascended status, staking, contracts)
- Cloak: `docs/CLOAK.md`, `docs/MAINNET-DECISIONS.md`, `docs/GLOAK.md`, `contracts/src/CloakAuction.sol` (settlement burns), `contracts/src/CloakFactory.sol` (20% cap, 30-day minimum stream), `contracts-v4/src/CloakV4Hook.sol` (20% share), `contracts-gloam/src/CloakFundsGate.sol`
