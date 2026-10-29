# Dead if cut — playtest 1028, findings 3 and 4

**Finding only.** This PR adds this note. It does not change the sim, a test, `docs/baselines.json`, or a canary. Matt signs any fix. No re-lock, no dial retune, no panel.

Source: career playtest on `main` `8747e25` (same code as `ddc62bd`), save `GM Playtest career5 1028`, Kansas City Stampede, 2026–2030. Finding 3 shots `s5/01`, `s3/02`. Finding 4 shots `s3/21`, `s4/10`. The dollars below were reproduced on `8747e25` by calling `makeContract`, `deadMoney`, `capHit`, and `rookieSlotApy`. No save file was loaded. `6088d50` adds the staff-page note only; these line numbers are unchanged.

## What the page showed

`/finances` prints `deadMoney` and `capHit − deadMoney` (`app/finances/page.tsx` 257–289). The Bonus column is one year of proration, `signingBonus / bonusProrationYears` (`app/finances/page.tsx` 55–58), not the dead figure.

2030 preseason, cap **$321.9M** (`salaryCap(2030, 2026)` = `round(255e6 × 1.06^4)` = 321,931,625). Committed **$325.4M** is 101% of that cap. Carryover **$6.65M** leaves about **$3.14M** of room. The Dead row on that page is **$12.6M** of `Team.deadCap` already booked. That is not the Dead if cut column.

| Player | Deal that prints the row | Cap hit | Base | Bonus (one slice) | Yrs left | Dead if cut | Save |
|---|---|---:|---:|---:|---:|---:|---:|
| Cam Ramirez | `$47.0M` × 5, year 1, guarantees 2 | $44.5M | $29.4M | $15.0M | 5 | $135.4M | −$90.9M |
| Jaylen Young | `$16.6M` × 5, year 1, guarantees 2 | $15.6M | $12.0M | $3.61M | 5 | $42.5M | −$26.9M |
| Omar Xiong II, 2028 | `$23.3M` × 5, year 1, guarantees 2 | — | — | — | 5 | $61.9M | — |
| Omar Xiong II, 2030 | same deal, two expirations later | $23.3M | $17.5M | $5.80M | 3 | $17.4M | +$5.90M |
| R6–R7 rookie | 4 years at the minimum, guarantees **2** | $908K | $795K | $112.5K | 4 | $2.04M | −$1.13M |

Raw integers, same rows:

- Ramirez: cap `44,490,000`, base `[29,450,000, 30,710,000, …]`, signing bonus `75,200,000`, annual slice `15,040,000`, dead `135,360,000`, save `−90,870,000`. Whole contract `47e6 × 5 = 235,000,000`.
- Young: cap `15,580,000`, base `[11,970,000, 12,480,000, …]`, signing bonus `18,050,000`, annual slice `3,610,000`, dead `42,500,000`, save `−26,920,000`. Whole contract `16.6e6 × 5 = 83,000,000`.
- Xiong year 1: dead `61,940,000` = signing bonus `29,000,000` + the two guaranteed bases. Year 3: guarantees `0`, dead `17,400,000` = `3 × 5,800,000`.
- Rookie: every base clamped to `LEAGUE_MINIMUM` (`795,000`), signing bonus `450,000`, annual slice `112,500`, cap `907,500`, dead `2,040,000`, save `−1,132,500`. Whole contract `3,180,000`.

`formatMoney` (`select.ts` 430–433) prints one decimal at or above $10M and two below, which is why `15,040,000` shows as `$15.0M`, `11,970,000` as `$12.0M`, and `15,580,000` as `$15.6M`.

## Root cause

Dead if cut is the unamortized signing bonus plus every remaining guaranteed base year. It is not the whole contract, and the proration term is not being applied twice.

`deadMoney` (`lib/core/select.ts` 218–233):

```ts
export function deadMoney(c: Contract | null): number {
  if (!c || c.yearsRemaining <= 0) return 0;
  let guaranteed = 0;
  for (let i = 0; i < Math.min(c.guaranteedYears, c.yearsRemaining); i++) {
    const share = i === 0 && !c.startsNextLeagueYear ? holderShare(c) : 1;
    guaranteed += (c.baseSalary[i] ?? 0) * share;
  }
  return Math.round(remainingBonusProration(c) + guaranteed);
}
```

`remainingBonusProration` (`select.ts` 113–121) is `annual × uncharged years`. Annual is `signingBonus / bonusProrationYears`, fixed at signing (`select.ts` 100–102). Uncharged years are `bonusProrationYears − (years − yearsRemaining)`, including a void-year remainder (`select.ts` 108–114). On a deal `makeContract` just built, elapsed is 0 and `bonusProrationYears` is `min(years, 5)` (`generate.ts` 183), so the entire signing bonus is still unamortized.

`capHit` (`select.ts` 139–143) is this year's base plus **one** slice, and only when some proration is left. `capSavingsFromCut` (`select.ts` 235–238) is `capHit − deadMoney`. Year-1 base sits in both numbers, so it contributes 0 to the save. The negative save is the other unamortized slices plus the later guaranteed bases.

`defaultGuaranteedYears` (`generate.ts` 155–158) is 2 when APY is above $12M, 1 above $4M, else 0. Extensions, re-signs, tags, and free-agent deals all pass that helper into `makeContract` (`contracts.ts` 499, 714, 918, 1297; `freeAgency.ts` 104–107, 541–542). A fresh deal above $12M therefore accelerates five bonus slices and two base years. That is the extended / re-signed / big-FA row.

`signingBonusFor` (`generate.ts` 169–176) caps the bonus at 32% of total value. The comment there says a 45% bonus made a new star carry three times his cap hit in dead money and left him uncuttable. At 32% the star is still there:

- Ramirez is `135,360,000 / 44,490,000 = 3.04×`. Bonus share is the 0.32 clamp: `0.32 × $235M = $75.2M`, plus bases `$29.45M + $30.71M`.
- Young is `42,500,000 / 15,580,000 = 2.73×`. Bonus share is 0.2175 (`$18.05M`), plus bases `$11.97M + $12.48M`.
- Xiong year 1 is `$61.94M`. By 2030 the two guarantees have been decremented (`expireContracts`, `contracts.ts` 581–587) and dead money is only the three slices still uncharged. Same function, later year. The 2028 number was not a second bug.

The whole-contract reading does not fit. Ramirez's deal is `$235M` and the column is `$135.4M`. Young's is `$83M` and the column is `$42.5M`. Dropping the guaranteed bases and keeping only the bonus still leaves Ramirez uncuttable: `$75.2M` of bonus against a `$44.5M` hit is a `−$30.7M` save, because four of the five slices have not been charged yet. There is no June-1 split anywhere in the sim (`nfl-reference.md` §4, trade block, "Not modelled: the post-June 1 split").

### Finding 4 is the same adder with the guarantee length hardcoded

`rookieContract` (`lib/core/offseason/draft.ts` 326–331) calls `makeContract(..., 2)` for every round. It does not call `defaultGuaranteedYears`.

`generate.ts` 418–421 already records why that helper exists: handing every contract two guaranteed years made a cut cost more than keeping the player and took roster churn out of the game. Drafted rookies are the path that still does it. A UDFA does not: `udfaContract` (`draft.ts` 810–812) passes `0`.

A 4-year minimum deal (`LEAGUE_MINIMUM` is `795_000`, `types.ts` 1573) gets signing bonus `round(795_000 × 4 × 0.14 / 50_000) × 50_000 = 450_000`. The base total cannot clear the minimum, so all four bases clamp to `795_000` (`generate.ts` 199–201). With guarantees forced to 2:

- cap = `795_000 + 112_500` = `907_500` → `$908K`
- dead = `450_000 + 795_000 + 795_000` = `2_040_000` → `$2.04M`
- save = `907_500 − 2_040_000` = `−1_132_500` → `−$1.13M`

`defaultGuaranteedYears(795_000, 4)` is 0. Dead money is then the `$450,000` bonus alone, and the save is `+$457,500`.

`cutAffordable` (`contracts.ts` 612–623) allows a negative save only when `space + savings >= 0`. A `−$1.13M` save needs at least `$1.13M` of room. Over the cap, the release is refused and `cutRefusal` (`contracts.ts` 625–630) names the dead money. The roster page prints that string (`app/roster/page.tsx` 495–497). The 2030 finances shot still has about `$3.14M` of room, so this same rookie would still clear `cutAffordable` there. The block in the report is the 2028 and 2029 cutdowns, where the club was actually over.

`enforceCap` (`contracts.ts` 1944–1964) only releases bodies with `savings > 0`. A CPU club over the cap will not choose this rookie either. `firstAffordable` (`contracts.ts` 633–635) skips him whenever any surplus body does save room.

On the 2026 cap the slot scale (`rookieSlotApy`) puts the $4M guarantee step at pick 18:

| Picks | APY | `defaultGuaranteedYears` | Save in year 1 |
|---|---:|---:|---:|
| 1–17 | $5.19M down to just over $4M | 1 (today: 2) | still negative (pick 1: `−$2.55M`, today `−$6.80M`) |
| 18–224 | $3.98M down to $795K | 0 (today: 2) | positive (pick 224: `+$458K`; pick 32: `+$1.17M`) |

No current rookie slot is above $12M, so the helper never returns 2 for a draftee. Picks 1–17 stay a negative-save cut in year 1. Picks 18 through 224, which is the R6–R7 row and a lot of earlier picks, become cuts that create room.

## Checked against `nfl-reference.md`

The formula matches the signed rule. It is not a mis-count of the bonus.

- **Proration and void years** (`nfl-reference.md` §4, void-years block): CBA Article 13 §§6–7. A signing bonus is prorated in equal amounts over the term, including years that void. When the deal ends or the player is cut, the unamortized remainder accelerates. `deadMoney` is that acceleration. N is capped at 4. No June-1 split.
- **Retirement** (same section): the sim charges `deadMoney` — remaining proration, void remainder included, plus remaining guaranteed base — the figure a waiver clear already uses.
- **Trade and waivers** (same section, and the waiver block at the "Changed 2026-10-23" paragraph): Article 13 §6(b)(ii). On or before June 1 the assigning club counts the unamortized signing bonus in that year's team salary. The acquiring club takes base and the guarantees on it. A cut must save room or fit its dead money (`docs/waiver-clearing-design-2026-10-23.md`). The post-June 1 split is not modelled.
- **Rookie slots** (same section): the 2011 scale sets APY and keeps a four-year term. It does not set `guaranteedYears`. The `2` in `rookieContract` is not traced there.

So a year-1 megadeal showing dead money well above the cap hit is what this rule prints: the whole bonus is still unamortized, and two base years are guaranteed. The rookie block is the guarantee length, not a second reading of the bonus.

## Proposed fix

One argument. Do not change `deadMoney`, `signingBonusFor`, `defaultGuaranteedYears`, or the 0.32 clamp. Those are the signed rule and the dials. Retuning them to make a $47M deal cuttable in year 1 is a different decision, and the bonus alone still exceeds the year-1 hit.

```diff
--- a/v2/lib/core/offseason/draft.ts
+++ b/v2/lib/core/offseason/draft.ts
@@ -1,5 +1,5 @@
 import { Rng, clamp } from "../rng";
-import { makeContract, makePlayer } from "../generate";
+import { defaultGuaranteedYears, makeContract, makePlayer } from "../generate";
@@ -326,7 +326,8 @@
 export function rookieContract(
   state: GameState, round: number, rng: Rng, overallPick?: number
 ) {
   const slot = overallPick ?? midRoundOverall(round);
   const apy = rookieSlotApy(state, slot, round);
-  return makeContract(rng, apy, 4, state.season, 2);
+  return makeContract(rng, apy, 4, state.season, defaultGuaranteedYears(apy, 4));
 }
```

`udfaContract` already passes 0. Leave it.

If Matt wants picks 1–17 to keep two guaranteed years, the argument is `apy > 4_000_000 ? 2 : defaultGuaranteedYears(apy, 4)` instead. That still fixes the $908K row. The diff above is the smaller rule: one helper, the one `generate.ts` already uses so cheap deals stay cuttable. Real first-round deals are often guaranteed for all four years. This note does not add that. `nfl-reference.md` does not state it.

## Regression

New file `lib/core/deadIfCut.test.ts`, added with the fix, not in this PR. Register it the way AGENTS.md says: the `package.json` `test` script, and a named step in `scripts/gate.ts` in both `FAST` and `FULL`. That pair is the only `scripts/` edit the fix may make. Do not touch `docs/baselines.json`.

The star rows lock the current arithmetic so a later edit cannot swap in the whole contract or drop the guaranteed bases. The rookie row locks the fix: `rookieContract` on pick 224 must save room. `makeContract(..., 2)` stays in the file as the shape the playtest actually ran, so the `$2.04M` figure does not get lost.

```ts
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { Rng } from "./rng";
import { defaultGuaranteedYears, makeContract } from "./generate";
import { capHit, capSavingsFromCut, deadMoney, remainingBonusProration, teamCap } from "./select";
import { LEAGUE_MINIMUM } from "./types";
import { rookieContract } from "./offseason/draft";
import { cutAffordable } from "./offseason/contracts";

function ok(label: string) { console.log("ok   ", label); }

// Playtest 1028 finding 3. Year-1 dead is the unamortized bonus plus two bases.
{
  const rng = new Rng(1);
  const ramirez = makeContract(rng, 47_000_000, 5, 2030, defaultGuaranteedYears(47_000_000, 5));
  assert.equal(ramirez.guaranteedYears, 2);
  assert.equal(ramirez.yearsRemaining, 5);
  assert.equal(capHit(ramirez), 44_490_000);
  assert.equal(deadMoney(ramirez), 135_360_000);
  assert.equal(capSavingsFromCut(ramirez), -90_870_000);
  assert.equal(
    deadMoney(ramirez),
    Math.round(remainingBonusProration(ramirez) + ramirez.baseSalary[0] + ramirez.baseSalary[1]),
  );
  assert.notEqual(deadMoney(ramirez), 47_000_000 * 5);

  const young = makeContract(rng, 16_600_000, 5, 2030, defaultGuaranteedYears(16_600_000, 5));
  assert.equal(capHit(young), 15_580_000);
  assert.equal(deadMoney(young), 42_500_000);
  assert.equal(capSavingsFromCut(young), -26_920_000);

  let xiong = makeContract(rng, 23_300_000, 5, 2028, defaultGuaranteedYears(23_300_000, 5));
  assert.equal(deadMoney(xiong), 61_940_000);
  for (let i = 0; i < 2; i++) {
    xiong = {
      ...xiong,
      yearsRemaining: xiong.yearsRemaining - 1,
      baseSalary: xiong.baseSalary.slice(1),
      guaranteedYears: Math.max(0, xiong.guaranteedYears - 1),
    };
  }
  assert.equal(xiong.yearsRemaining, 3);
  assert.equal(xiong.guaranteedYears, 0);
  assert.equal(deadMoney(xiong), 17_400_000);
  assert.ok(capSavingsFromCut(xiong) > 0);
  ok("year-1 dead is bonus plus two bases; year 3 of Xiong is proration only");
}

// Playtest 1028 finding 4. The forced-2 shape is the bug. The drafted deal must not use it.
{
  const rng = new Rng(1);
  const forced = makeContract(rng, LEAGUE_MINIMUM, 4, 2028, 2);
  assert.equal(capHit(forced), 907_500);
  assert.equal(deadMoney(forced), 2_040_000);
  assert.equal(capSavingsFromCut(forced), -1_132_500);

  const st = newGame({ seed: 42 });
  const drafted = rookieContract(st, 7, new Rng(1), 224);
  assert.equal(drafted.guaranteedYears, 0);
  assert.equal(capHit(drafted), 907_500);
  assert.equal(deadMoney(drafted), 450_000);
  assert.equal(capSavingsFromCut(drafted), 457_500);

  const me = st.userTeamId;
  const p = st.players.find((x) => x.teamId === me && x.contract && !x.retired)!;
  p.contract = drafted;
  const parent = st.rngState;
  // Same squeeze as waiverClearing.test.ts: park the club over the cap.
  st.teams[me].deadCap = (st.teams[me].deadCap ?? 0) + teamCap(st, me).space - (-1_000_000);
  assert.ok(teamCap(st, me).space < 0, "the club is over the cap");
  assert.equal(cutAffordable(st, p), true, "a positive save is allowed while over the cap");
  assert.equal(st.rngState, parent, "the read does not draw");
  ok("a minimum rookie saves room and is not on the forced two-year guarantee");
}
```

The squeeze is the one in `waiverClearing.test.ts` (`squeeze`): add `space − room` onto `deadCap`, here with `room = −1_000_000`. `makeContract` voids its `Rng` (`generate.ts` 210) and `defaultGuaranteedYears` does not draw, so `rngState` stays put.

Leave `draftRules.test.ts` as it is. It checks four-year length and pick-1 APY above pick 32. It does not assert `guaranteedYears`.

Run, when the fix is actually made:

```bash
npx tsx lib/core/deadIfCut.test.ts
npx tsx lib/core/draftRules.test.ts
npx tsx lib/core/capMechanics.test.ts
npx tsx lib/core/waiverClearing.test.ts
npx tsx lib/core/userOffers.test.ts
```

## Gate, canaries, and this PR

`deadMoney` stays. Retirement (`chargeRetirementAcceleration`), waiver clears, trades (`checkTrade` / `moveAsset`), and `enforceCap` keep the same figure. The only production change is the guarantee argument on a drafted contract. `makeContract` does not draw. The first draft is after free agency opens.

The seed-42 user-offer canary walks `advance` / `advanceOffseason` to the tag window and then free agency. It asserts the parent stream:

- `lib/core/userOffers.test.ts` 125–126: at `offseason-tag`, `rngState === 1777473079`
- `lib/core/userOffers.test.ts` 128–130: after the step into `offseason-fa`, `rngState === 3280841901`

That pair is the fingerprint Matt signed (comment at `userOffers.test.ts` 12–14: measured after the rebase onto `#201`, equal to the `86e7716` value plus the empty-room change). `rookieContract` runs from `makePick` (`draft.ts` 686), which is the draft phase, after that FA open. Season-1 tag and FA are veteran contracts from `generate.ts`, which already uses `defaultGuaranteedYears`. An implementation that only lands the diff above must leave the pair at tag `1777473079`, FA `3280841901`.

Do not re-lock `userOffers`. A red `useroffers` after the fix means the diff drew, or it changed a veteran path before FA. Revert that part. Do not write the new RNG into the test.

After the draft, the league does change. Picks 18–224 save money on a cut, so `cutAffordable`, `firstAffordable`, and `enforceCap` will release bodies they skip today, and a clear books `$450K` of bonus instead of `$2.04M` of bonus-plus-two-bases when a minimum rookie does get waived. Expect movement, and do not retune toward it:

| Metric | Lock | Why it can move |
|---|---|---|
| `drift.deadMoneyPct` | none (OTC note ~5–8%, `nfl-reference.md` §4) | More small bonus accelerations, fewer $2M rookie guarantees booked on a clear. Direction is not signed. Do not add a band. Do not chase 5–8%. |
| `drift.capBustSeasons` | max 0 | Cap enforcement can shed a different body. A rookie hit is not a 28% contract. |
| `drift.minPayrollSeasonsUnder55` | max 0 | Cutting a cheap rookie and refilling at the minimum can lower a payroll. |
| `drift.medianPayrollPct` | 90.602 ±6 | Same payroll path. |
| `drift.topCapPctMean` | 20.3 ±3 | A rookie is not the top hit. Indirect only, through who stays. |
| `drift.franchiseTagsPerSeason` | 14 ±4 | Later seasons only, if the roster under the tag changes. |
| `drift.tradesPerSeason` | min 30, target 60–120 | Same. Do not retune volume. |
| `careers.survivalMae` / `careers.careerLenMae` | max 11 / the known-open career-length row | Late picks that were sticky because a cut cost cap can now be cut. That is camp churn, and it can move the late-round survival the careers harness grades. |

`calibrate` and `statcheck` read the players who stay on the field. A different cutdown changes that. Treat a red line there as the roster change, not as a reason to edit a baseline.

No row in `docs/baselines.json` moves. No re-lock. No new band. The signed locks this note sits next to (`topCapPctMean` 20.3 ±3, `medianPayrollPct` 90.602 ±6, `minPayrollSeasonsUnder55` max 0, `capBustSeasons` max 0, `franchiseTagsPerSeason` 14 ±4, `tradesPerSeason` min 30) stay as signed. `drift.deadMoneyPct` stays an ungated emit.

This PR is the note. The diff above is a proposal for Matt to sign. Studio `gate:full:serial` is his panel after that, not this packet's.
