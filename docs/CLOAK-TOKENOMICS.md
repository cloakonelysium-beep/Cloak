# $CLOAK tokenomics: the proposal

Nov 27. A full design for $CLOAK, built on what Cloak already runs on mainnet. It extends `docs/CLOAK.md` and changes two decisions there (the buyback split, and where $CLOAK launches). **Those changes need Bob's yes before anything is built.**

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
| **Utility** | Pay launch fees in $CLOAK (burned), the sealed-bid Spotlight (burned), Cloak Names (burned yearly), $CLOAK-gated launch rounds (proved privately, already built), private voting, and bonds for relayers |
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
| Ecosystem: relayer bonds to start, grants, integrations (Eloscape, Montra, launchpads), rewards for early private users | 25,000 | 5% |
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
                                         relayer bonds, grants, liquidity
```

- **45% of all revenue is burned as $CLOAK.** The current plan (Gloam's split) burns 25%.
- **Separately, $CLOAK's own pool fees:** the $CLOAK side is burned at once (100%). The HYPE side goes into the engine above.
- **Other tokens' fees** (launch tokens from the 20% share, Montra's) are sold for HYPE through the router first. Cloak never holds other projects' tokens.
- **How it buys** (as already decided, with one addition): in small pieces, only when the price is within 1% of its 30-minute average, and with a per-day limit that grows with the pool's depth. The caller gets its gas back, capped. The addition is that **it runs at a random time each day**, so nobody can trade ahead of it on a schedule.
- **Changing the splits** means deploying a new `CloakBuyback` and pointing CloakConfig at it. That waits 3 days in public, and once voting is live (section 6.5), it also needs a holder vote.

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

## 6. Utility: real reasons to buy, burn or lock $CLOAK

The privacy rule (section 2, lesson 3) decides where utility goes. **Utility goes where people are already public:** launch creators, listed projects and relayers. Where a holder needs to show they hold $CLOAK, **they prove it with a zero-knowledge proof and never show the wallet.**

### 6.1 Pay the launch fee in $CLOAK, and it's burned (biggest sink, small build)

- A creator can pay **1.0% in $CLOAK instead of 1.5% in HYPE**.
- How: before bidding closes, the creator deposits $CLOAK in a small `CloakLaunchBoost` escrow for their auction. At settlement it burns $CLOAK worth 1.0% of the raise (priced at the pool's 30-minute average), returns the rest, and `CloakBuyback` pays the creator back the HYPE launch fee for that auction.
- **No change to the factory or the auction.** The fee already flows to `CloakBuyback`, so it can pay it back.
- What it does: every launch that uses it has to **buy $CLOAK on the market (1% of its raise) and burn all of it**. That's about 1.5 times what the engine would have burned from that fee (45% of 1.5%, about 0.68%). It's BNB's model on a launchpad, and creators save a third of the fee.
- Risk: a creator could push the price up to burn fewer tokens. The 30-minute average and the pool's depth make that expensive, and there's a cap on how far the price can be off.

### 6.2 The Spotlight: sealed bids for the front page (burned)

- Each week, the featured spots on oncloak.xyz (homepage, Telegram bot posts, the launch feed) go to the highest sealed bids, **paid in $CLOAK and 100% burned**.
- It uses Cloak's own sealed-bid code (CloakAuction or CloakDrop), so creators can't snipe each other and there's one clearing price.
- The site reads the winners from the chain. No new contract holds money, and nobody can buy a spot outside the auction.

### 6.3 $CLOAK-gated launch rounds (already built)

- `CloakFundsGate` already lets a creator gate a launch to people who **privately hold at least X of an asset**, using Gloam's funds circuit, without showing any balance or notes.
- Day one: creators can open a round to "$CLOAK holders, at least 250" with nothing new built. Holders keep $CLOAK private (it's in the launch vault), and the app shows the option on the create form.
- This is the earlier idea of "launch priority for holders", done **without** linking a wallet to trades. The one thing it shows is the notes' nullifiers (when those notes are later spent). The site already explains that.

### 6.4 Cloak Names (burned every year)

- Readable private addresses: `cloak:bob` points to a receive address and payment links (both already built).
- Register a name by burning $CLOAK, and burn again each year to keep it. Short names cost more (for example 3 letters 500, 4 letters 100, 5+ letters 25 a year, set by governance).
- A name points to a receive box, which is public anyway. It never points to a wallet.

### 6.5 Private voting (a small new contract, no circuit change)

- Holders vote on the things that should be theirs to decide: fee rates within the hard limits already in the contracts, the buyback's splits, which launchpads the ecosystem vault approves, the market rules (C2) above their floors, and grants from the ecosystem share.
- **The vote is private:** each vote is a funds proof of "at least 100 $CLOAK", one vote per 100, cast from a fresh address through the relay. A new contract, `CloakVote`, reuses `CloakFundsGate`'s verifier and context checks, but tracks nullifiers per **proposal** rather than per gate, so the same notes can't vote yes and no. That makes it, as far as we know, the first private token vote on Elysium. Gloam lists private voting as "Next".
- Holders can't vote themselves money. There's no option to pay holders.

### 6.6 Relayer bonds (later, once others run relays)

- Anyone can already run a relay. Once others do, the app lists relays that have **bonded 2,500 $CLOAK**, which is burned if a relay is proven to misbehave (for example, going over the revert cap or failing to deliver a paid relay).
- Relays are **paid for the work** (gas plus a fee from Cloak's 40%), not for holding. More relays also means no single operator sees everyone's IP, which makes Cloak more private.
- The ecosystem share pays for the first bonds.

### 6.7 Ecosystem listing review fee (burned)

- A launchpad that wants its tokens privately tradable in `CloakEcosystemVault` pays a **review fee in $CLOAK, burned**, for Cloak to vet its code (C1). The fee doesn't guarantee a listing, and the market rules (C2) still apply.

### 6.8 Already there

- **Pay with $CLOAK** in the trade picker (it routes through HYPE).
- **Graduation** to Gloam's main vault, where the biggest private crowd is.

---

## 7. Things we won't do, and why

| Idea | Why not |
|---|---|
| Yield, revenue share or "real yield" staking | Paying holders from revenue looks like a security. Burning does the same job without the promise. Gloam and Cloak's own decisions say the same |
| Emissions or "staking rewards" | They dilute holders to pay holders. Aztec and Hyperliquid both show the burn being offset |
| A transfer tax (like VOID's "trading tax") | Aggregators and wallets flag it, CloakToken's clean listing story is lost, and private routing gets harder. GLOAK is where Cloak tests special token rules |
| Fee discounts for proving you hold $CLOAK when trading | The proof would tie your trades together. We only use private proofs (6.3, 6.5) where linking doesn't matter |
| Pairing every launch with $CLOAK instead of HYPE | That's how Virtuals did it. It makes demand, but every launch's liquidity would fall with $CLOAK, it adds a hop to every private route, and it means new contracts. If anything, it's for a far later version |
| Founder top-ups to the buyback (like Gloam) | They make the burns look bigger than the fees really pay for. We report only what the contract does |
| An upgradeable buyback or token (VoidCash's risk) | One key with no delay could change everything. Ours have no owner and no proxy |

---

## 8. The order of things

**Phase 0, now until the audit**
- Keep revenue in the treasury (as now).
- Build and test `CloakBuyback` (forge, plus a fork run like part 22), `CloakLaunchBoost` and the Spotlight. All three hold little or nothing, and none touches the factory, the auction or the vaults.
- Run GLOAK (it's ready, and only the owner's door call is left). It shows the sealed-bid machine working with real money before $CLOAK.
- Publish this design so people can comment on it.

**Phase 1, genesis (after the audit)**
- Raise or lift the per-launch cap (3 days in public), and queue the CloakConfig `feeRecipient` change to `CloakBuyback` (3 days).
- $CLOAK's sealed-bid launch: 250,000 for sale, 175,000 pool reserve, 75,000 streamed, `minRaise` about 4,000 HYPE.
- At settlement: leftovers burned, the pool locked, the buyback live, the team-share burn done if needed (4.3).
- Announce together with Gloam (H5).

**Phase 2, the first 90 days**
- Launch fee in $CLOAK, the Spotlight, $CLOAK-gated rounds on the create form, a burn and privacy dashboard (burned, in vaults, in the pool, in public, like GLOAK's privacy meter).
- Ask Gloam to list $CLOAK (H4).

**Phase 3**
- Cloak Names, `CloakVote` with the Safe acting on passed votes, relayer bonds, and graduation into Gloam's vault.

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
5. **Which utilities to build first:** recommended in this order: the launch fee in $CLOAK (6.1), the Spotlight (6.2), gated rounds on the form (6.3), Names (6.4), voting (6.5), bonds (6.6).
6. **For $CLOAK's launch:** lift or raise the total cap, a minimum price around 0.024 HYPE (about $875k market cap), and `minRaise` around 4,000 HYPE.

## Sources

- Gloam's token page and buyback log: https://gloam.trade/token, and gloamtrade/gloam pull requests [#240](https://github.com/gloamtrade/gloam/pull/240), [#249](https://github.com/gloamtrade/gloam/pull/249), [#351](https://github.com/gloamtrade/gloam/pull/351)
- VoidCash: https://voidcash.io, https://docs.voidcash.io (the VOID, fees and deployments pages)
- Railgun: https://docs.railgun.org (RAIL tokenomics, security rewards, deductions)
- Hyperliquid: https://hyperliquid.gitbook.io/hyperliquid-docs (fees, staking)
- Aztec: https://www.techflowpost.com/en-US/article/34324
- Cloak: `docs/CLOAK.md`, `docs/MAINNET-DECISIONS.md`, `docs/GLOAK.md`, `contracts/src/CloakAuction.sol` (settlement burns), `contracts/src/CloakFactory.sol` (20% cap, 30-day minimum stream), `contracts-v4/src/CloakV4Hook.sol` (20% share), `contracts-gloam/src/CloakFundsGate.sol`
