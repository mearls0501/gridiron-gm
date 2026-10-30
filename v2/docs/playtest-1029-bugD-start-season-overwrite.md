# Start the Season overwrites star contracts — playtest 1029, BUG-D

**SIGNED and implemented.** Matt signed the fix proposed below. The user seat skips cap releases and the one-year minimum rewrite. Start the Season is blocked while that club is over the cap, and the message names the overage. The 53-man trim stays. CPU `enforceCap` is unchanged. No re-lock, no dial change, no `docs/baselines.json` edit.

Source: 30-season playtest on production `main` `8747e25` (same code as `ddc62bd`), save `GM Playtest career30 1029`, San Francisco, 2051 cutdown → 2052 preseason. Report section B1. M1, M2, and M4 are the context. Shots `qa-career30-1029/s26-30/bug-D-2052-finances-dead-378M.webp` and `bug-D-2052-roster-895K-overwrite-your-waive.webp`. The dollars below were reproduced on this tree by calling `makeContract`, `capHit`, `deadMoney`, `enforceCap`, and `reconcileRoster`. No save file was loaded. `contracts.ts`, `index.ts`, `generate.ts`, `page.tsx`, and `roster/page.tsx` are unchanged since `8747e25`.

## What the page showed

`/finances` prints `teamCap` (`app/finances/page.tsx` 127–148). Committed is cap hits plus dead money plus base already paid (`select.ts` 252–271), and the percent under it is `committed / cap`. Dead Money is `Team.deadCap`. The 2052 preseason shot, after the button:

| Box | Figure | Sub |
|---|---:|---|
| Salary Cap | $1160.1M | 2052 season |
| Carryover | $13.7M | Unused room from last year |
| Committed | $1166.8M | 101% of the cap |
| Dead Money | $378.4M | Paid to players no longer here |
| Cap Space | $6.97M | under contract |

The cap integer is `salaryCap(2052, 2026)` = `round(255_000_000 × 1.06^26)` = `1,160,092,656`. `formatMoney` (`select.ts` 430–435) prints that as `$1160.1M`. The same integer is what the cutdown button enforces. `runRecap` has already pushed 2051 onto `history` while `state.season` is still 2051, so `startSeason` is 2025 and `salaryCap(2051, 2025)` is the same `1,160,092,656`. The button does not charge a smaller 2051 in-season cap.

The report's pre-button book is the same cap with committed **$2,009.4M**, 173% (`2,009.4 / 1,160.1`). Dead money on that book was **$60.0M**. After the button, committed is **$1,166.8M** and dead is **$378.4M**. The 101% on the shot is the result, not the book that was over.

`/roster` on that same preseason is 53/53, cap space `$6.97M` of `$1160.1M`, committed `$1166.8M`, dead `$378.4M` (`app/roster/page.tsx` 219–236). The wire is still open. SF rows say "Your waive — if unclaimed, this club may stash him on the PS". Other clubs' rows say "Release someone to claim". The window copy is "Resolves when the season starts." (`waivers.ts` 38–40). Hunter Dabney's row is a `$51.6M` cap hit and Isaiah Moore III's is `$91.2M`. Those are the hits after `cutPlayer` zeroes the signing bonus. The report's `$80M` and `$134M` are the deals those two were on before the cut.

Five starters stayed on the roster and their deals became **$895K × 1**: EDGE Anderson (`$112.2M`), CB Tillman (`$139.2M`), OT Fitzgibbon (`$160.0M`), S Gatlin (`$109M`), QB Clark (`$120.8M`). Clark was still the 2052 passer, so the body was not released. The same button in 2053, 2054, and 2055, with commitments around 101%, did not do this again.

## Root cause

Start the Season, once the three preseason weeks are done, is `advanceOffseason` → `finalizeOffseason` (`lib/core/offseason/index.ts` 400–405). That function legalizes every roster, then rolls the calendar. The user call is the same one the CPU clubs just took, with the 53-man limit (`index.ts` 280): `reconcileRoster(state, state.userTeamId, rng, ROSTER_LIMIT, true)`.

`reconcileRoster` (`lib/core/offseason/contracts.ts` 1976–2011) does three things, in this order, up to eight times:

1. `enforceCap` (`contracts.ts` 1944–1964) releases bodies while `teamCap.space < 0`.
2. `fillRoster` trims to the limit and refills holes (`contracts.ts` 1302–1361). The trim is `cutWorstSurplus` (`contracts.ts` 1669–1679), ranked by `surplusWorth` (`contracts.ts` 1642–1646): `evaluate` plus draft-capital hold plus camp nudge. Lowest worth goes.
3. If space is non-negative and the count is in range, it returns (`contracts.ts` 1986).

If those eight passes are still illegal, the last resort runs (`contracts.ts` 1989–2009). It does not release. It keeps the body and replaces the contract. The target is the largest `capHit` still above `LEAGUE_MINIMUM * 2` (`contracts.ts` 1996–1998). The assignment is `makeContract(rng, LEAGUE_MINIMUM, 1, state.season, 0)` (`contracts.ts` 2004). The log line is `{abbr} restructured {name} ({pos}) to the league minimum — forced by the cap, was ${hit}M` (`contracts.ts` 2005–2008).

`LEAGUE_MINIMUM` is `795_000` (`types.ts` 1573). `makeContract` of that APY for one year with zero guarantees (`generate.ts` 178–220, bonus at `generate.ts` 169–176):

- Bonus percent `0.14 + (795_000 / 30_000_000) × 0.14` = `0.14371`, rounded to the `$50,000` grid → signing bonus **`100_000`**.
- Base total is `695_000`. The base clamp (`generate.ts` 199–207) then forces the only year up to `795_000`.
- `capHit` (`select.ts` 139–142) is base plus the one bonus slice: **`895_000`**.

`formatMoney(895_000)` is `$895K`. Years remaining is 1. That is the shot. It is not `udfaContract` (`draft.ts` 811–813), which is three years at the same APY and a cap hit of `911_667` (`$912K`). `startContractNow` (`select.ts` 209–215) does not prorate in the offseason, so the new deal charges the full `895_000`.

The replacement does not call `addDeadCap`. The old signing bonus and the old guarantees are dropped. `cutPlayer` (`contracts.ts` 638–677) is the path that books money: the unamortized bonus at the cut (`contracts.ts` 654–657), the remaining guaranteed base when the player clears (`waivers.ts` 258–259). Anderson, Tillman, Fitzgibbon, Gatlin, and Clark stayed, so their old deals are not inside the `$378.4M`. The dead-money jump from `$60.0M` is the group that was released.

`enforceCap` is why that group is the expensive surplus and not the camp minimums. The comment on `contracts.ts` 1951 says it protects minimums. The filter under that comment is the position count (`contracts.ts` 1953): an active body at `POSITION_MIN` is skipped. QB is 2, EDGE 4, OT 4, CB 5, S 3 (`types.ts` 38–41). Salary minimums are not protected. The rank (`contracts.ts` 1956–1960) is `savings / cost`, with `savings = capHit − deadMoney` and `cost = (ovr − 45) ^ 1.6`, and only `savings > 0` is eligible. Highest ratio is released first.

A cut with `savings <= 0` is never chosen. A year-1 megadeal is in that bucket: dead money is the whole bonus plus two guaranteed bases, and that exceeds the cap hit (playtest 1028, `deadMoney` at `select.ts` 223–232). Those bodies survive `enforceCap`. If the club is still over, the hatch rewrites the largest cap hit, with no position check and no savings check. The floor `capHit > LEAGUE_MINIMUM * 2` (`1_590_000`) means a `$895K` deal cannot be the target. The hatch can only pick someone expensive. It stops when space is non-negative or eighty bodies have been rewritten (`contracts.ts` 1992).

That split is the 2052 shot. Surplus with positive savings, Dabney and Moore included, go out through `cutPlayer` and land on the wire as SF. The largest deals `enforceCap` could not release, Clark included, stay on the roster at `$895K` × 1. At about 101% the eight passes reach `space >= 0` and the hatch does not run. A seed-7 roster pushed to `1.010` of the cap with a dead-cap bump took **zero** "to the league minimum" lines and finished at `+$2,839,168`. It did still release a C 86, along with four bodies at 52 OVR and below. The overwrite is the part that stops near the cap. The release does not.

The wire is still full on the preseason shot because the releases that are sitting there happened after the window closed. `finalizeOffseason` calls `settleWaivers` (`index.ts` 335), then, if any club including the user is over, calls `reconcileRoster` again (`index.ts` 338–341). `cutPlayer` puts the new releases on a fresh `state.waivers` (`contracts.ts` 663–666). Nothing settles that second window. The preseason label is the one on the shot. A first-pass release would already have been claimed or cleared.

Hub Auto-fix is the same function. The button calls `reconcileRoster(s, s.userTeamId, rng)` with no limit argument (`app/page.tsx` 700–704), so in camp the limit is 90 (`rosterLimit`, `types.ts` 1607–1608). It can rewrite a star before Start the Season is pressed. The playtest pressed Start the Season. Both doors use the hatch.

M4 is how the book got to 173% without the button firing sooner. `teamCap.space` adds `capCarryover` (`select.ts` 263–270). While the chair-change carryover was larger than the overage, space stayed non-negative and both the release loop and the hatch stay idle. `captureCapCarryover` (`select.ts` 281–283) stores `max(0, space)`, so an over-cap cutdown carries `0`. This note does not re-open the carryover formula.

## Why there is no notice

The hatch's own comment says the haircut must never happen silently (`contracts.ts` 2000–2002). The only write is the log line above. Three surfaces miss it.

- The Confirm control is the word Confirm (`app/page.tsx` 202–205). It lists no player and no cap figure.
- `canAdvance` blocks only in preseason (`app/page.tsx` 165–166). Cutdown (`offseason-final`) advances while `rosterIssues` still says over the cap (`select.ts` 415–420). The "Needs attention" card is on the hub, and it is not a block.
- The toast is the string `advanceOffseason` returns, `` `${state.season} preseason begins` `` (`index.ts` 405). The hub feed and `/league` each render `state.log.slice(-40)` (`app/page.tsx` 1016, `app/league/page.tsx` 51). The hatch logs during the user `reconcileRoster`. `settleWaivers` logs after that, one line per claim and one per clear, for every club's camp cuts. The last 40 are the tail of that window. `trimLog` keeps the hatch line in the save (`housekeeping.ts` 50–64, ceiling 4000). No screen shows it after the button.

A real restructure from `/finances` is a different call, `applyRestructure`, and its toast names the savings (`app/finances/page.tsx` 106–112). The hatch borrows the verb "restructured" for a replacement the player did not agree to.

## M1, M2, and the phantom waive

**M2 and the phantom "Your waive" are this release, on this button.** `cutPlayer` always sets `originalTeamId` to the club that held him (`contracts.ts` 663–666) and always logs "waived". The desk treats `originalTeamId === userTeamId` as `own` (`lib/view/waiverDesk.ts` 73). The roster page prints "Your waive" for every own row (`app/roster/page.tsx` 311–314). A Release the GM clicked and a release `enforceCap` made are the same row. There is no flag for who asked. The 2047 backup QB on the wire at cutdown is that row. BUG-D is that row pointed at starters, plus the hatch behind it once positive-savings releases cannot cover the hole.

The rank is why a star goes before an `$895K` camp body. Cost is `(ovr − 45) ^ 1.6`. Savings of `$20,000,000` on an 88 OVR is ratio `48,695`. Savings of `$795,000` on a 62 OVR is ratio `8,544`. A `$25,000,000` save on a 93 OVR (`51,045`) still beats a 60 OVR minimum (`10,438`) and a 55 OVR minimum (`19,969`). The 53-man trim would have cut the cheap body: `surplusWorth` ranks the low OVR last in value, so he leaves first, and draft capital holds a pick the club drafted. `enforceCap` runs before that trim, and it does not read `evaluate` or `draftCapitalHold`. One star whose cut saves more than about `$5M` clears a `$22M` hole by himself, and the minimums never come up. That is the 2035–36 cutdown (Hawthorne 93, Nelson 89, Rodriguez `$45M`, Wetzel, Flores) and the hand-cut of 37 UDFAs that kept the button from doing it.

**M1 at Tag is a different function.** Continue on Season Review is `runRecap` (`index.ts` 82–114). `runProgression` (`progression.ts` 265–270) retires on `retirementChance` (`progression.ts` 179–184), charges `deadMoney` through `chargeRetirementAcceleration` (`progression.ts` 203–213), and nulls the contract. Years remaining are not an input. A deal with two years left can retire. The review page does not preview that list; the empty state says retirements are written when you continue (`components/SeasonReview.tsx` 64–68). After continue, `/recap` shows the first 16 retirement lines, logged highest-OVR first (`seasonReview.ts` 204–224, `SeasonReview.tsx` 73). The hub feed is the last 40, which is the other end of that batch. A starter can leave between the review the GM already read and the Tag page, with dead money booked, and the feed he is looking at does not name him.

That is not the hatch. The hatch keeps the body and drops the old deal on the floor. Retirement removes the body and books `deadMoney`. `reconcileRoster` is not on the recap → tag path. The in-season waiver backstop skips the user (`waivers.ts` 306–308). CPU trades do not take his players (`trades.ts` builds offers to him; he accepts them). The report's repro — the review 53 against the Tag 53, expirations excluded — is this retirement step. Garcia (`$110.7M` × 4, gone by Tag), Mayfield, and the 2048 group with two years left (Yeager, Anderson, Lambert, Dax Johnson; dead `$157.8M` → `$283.4M`) sit on it.

A name that is already gone when the review opens has not been retired yet. `runRecap` has not run. The matching earlier event is a previous cutdown's `enforceCap`, whose dead money is still on the closing book. Hill III, gone by the 2028 preseason, covers both steps; the report has no shot, and a rewrite would have left him on the roster.

The Tag dead-money spike that then falls at FA open (M5) is the wipe, not this hatch. `runFreeAgencyOpen` calls `clearDeadCap` and then `reapplyRetirementDead` (`index.ts` 121–127). In-season and cutdown dead stay on the book through Tag and come off at FA. Only the retirement charge comes back. The 2045 figures `$302.6M` → `$345.3M` → `$42.7M` and the 2052 figures `$378.4M` → `$497.8M` → `$119.3M` are that shape: the FA number is the Tag-minus-Review increase. The `$378.4M` itself is the cutdown releases, sitting on the 2052 book until that wipe.

## Repro

No save is required. The test below is the repro. It is not part of this PR. Register it only with the fix, the way AGENTS.md says: the `package.json` `test` script, and a named step in `scripts/gate.ts` in both `FAST` and `FULL`.

`makeContract` ignores its `Rng` (`generate.ts` 210), so the deal integers do not move with the seed. The roster walk uses seed 7 because that `newGame` is the one the numbers below were read from. The user club on that seed is BOS.

```ts
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { Rng } from "./rng";
import { defaultGuaranteedYears, makeContract } from "./generate";
import { LEAGUE_MINIMUM, ROSTER_LIMIT } from "./types";
import { capHit, capSavingsFromCut, deadMoney, teamCap } from "./select";
import { enforceCap, reconcileRoster } from "./offseason/contracts";
import { udfaContract } from "./offseason/draft";

// The shot's "$895K x 1" is the hatch deal. A UDFA is three years, cap hit $912K.
{
  const rng = new Rng(1);
  const deal = makeContract(rng, LEAGUE_MINIMUM, 1, 2051, 0);
  assert.equal(deal.years, 1);
  assert.deepEqual(deal.baseSalary, [795_000]);
  assert.equal(deal.signingBonus, 100_000);
  assert.equal(capHit(deal), 895_000);
  const udfa = udfaContract(newGame({ seed: 1 }), rng);
  assert.equal(udfa.years, 3);
  assert.equal(capHit(udfa), 911_667);
}

// M2. An 88 OVR whose cut saves $20M goes. A 62 OVR at $895K stays.
// Hole is $5M, less than the star's savings and more than the minimum's.
{
  const st = newGame({ seed: 7 });
  const uid = st.userTeamId;
  const roster = st.players.filter((p) => p.teamId === uid && p.contract && !p.retired);
  const star = roster.slice().sort((a, b) => b.ovr - a.ovr)[0];
  const camp = roster.slice().sort((a, b) => a.ovr - b.ovr)[0];
  star.contract = {
    years: 3, yearsRemaining: 3,
    baseSalary: [20_000_000, 20_000_000, 20_000_000],
    signingBonus: 0, bonusProrationYears: 0,
    signedSeason: st.season, guaranteedYears: 0,
  };
  camp.ovr = 62;
  camp.contract = makeContract(new Rng(1), LEAGUE_MINIMUM, 1, st.season, 0);
  assert.equal(capHit(camp.contract), 895_000);
  assert.ok(capSavingsFromCut(star.contract) / Math.pow(star.ovr - 45, 1.6)
    > capSavingsFromCut(camp.contract) / Math.pow(62 - 45, 1.6));
  const room = teamCap(st, uid).space;
  st.teams[uid].deadCap = (st.teams[uid].deadCap ?? 0) + Math.max(0, room) + 5_000_000;
  enforceCap(st, uid);
  assert.equal(star.teamId, null);
  assert.equal(camp.teamId, uid);
  assert.ok((st.waivers ?? []).some((w) => w.playerId === star.id && w.originalTeamId === uid));
}

// BUG-D. Five negative-savings megadeals, club still over after the release pass.
// They stay on the roster at $895K x 1. Their old dead money is not booked.
// A minimum body with positive savings is the one who is waived.
{
  const st = newGame({ seed: 7 });
  const uid = st.userTeamId;
  const roster = st.players.filter((p) => p.teamId === uid && p.contract && !p.retired);
  const stars = roster.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 5);
  const camp = roster.filter((p) => p.ovr < 62)[0];
  const r = new Rng(99);
  for (const p of stars) {
    p.contract = makeContract(r, 40_000_000, 5, st.season, defaultGuaranteedYears(40_000_000, 5));
    assert.equal(capHit(p.contract), 37_870_000);
    assert.equal(deadMoney(p.contract), 115_200_000);
    assert.ok(capSavingsFromCut(p.contract) < 0);
  }
  camp.contract = makeContract(r, LEAGUE_MINIMUM, 1, st.season, 0);
  const room = teamCap(st, uid).space;
  st.teams[uid].deadCap = (st.teams[uid].deadCap ?? 0) + Math.max(0, room) + 900_000_000;
  const deadBefore = st.teams[uid].deadCap ?? 0;
  reconcileRoster(st, uid, new Rng(st.rngState), ROSTER_LIMIT, true);
  for (const p of stars) {
    assert.equal(p.teamId, uid);
    assert.equal(p.contract?.years, 1);
    assert.equal(p.contract?.yearsRemaining, 1);
    assert.equal(capHit(p.contract), 895_000);
    assert.equal(p.contract?.baseSalary[0], 795_000);
    assert.equal(p.contract?.signingBonus, 100_000);
  }
  assert.equal(camp.teamId, null);
  assert.ok((st.teams[uid].deadCap ?? 0) - deadBefore < 115_200_000);
  assert.ok(st.log.some((e) => e.text.includes("to the league minimum")));
}
```

Read on this tree, seed 7, before any fix: the ordering case waives the 88 OVR TE and keeps the 62 OVR CB, and space finishes positive (`+$16,220,000`). The hatch case rewrites all five (Rivera Jr. QB, Stallworth TE, Ingersoll C, Scott DT, Underwood P). The log line for the quarterback is `BOS restructured Rowan Rivera Jr. (QB) to the league minimum — forced by the cap, was $37.9M`. Dead cap rises by `$31,518,334` from the releases. It does not rise by `5 × $115,200,000`.

The 101% check is the same `reconcileRoster` after a dead-cap bump to `1.010` of the cap and no planted megadeals. Zero user lines contain "to the league minimum". Space finishes at `+$2,839,168`. A C 86 is released anyway.

## Proposed fix

**SIGNED.** User seat only. Leave the CPU hatch where it is. `verify` requires every club under the cap at season start (`scripts/verify.ts` 182–191), and the CPU clubs get there through this function. Changing `enforceCap`'s sort for every club changes who the in-season waiver backstop releases (`waivers.ts` 306–308) during the season the canary plays.

```diff
--- a/v2/lib/core/offseason/contracts.ts
+++ b/v2/lib/core/offseason/contracts.ts
@@ -1977,13 +1977,16 @@ export function reconcileRoster(
   state: GameState, teamId: number, rng: Rng,
   limit = rosterLimit(state.phase), stashPs = false,
 ): void {
+  const userSeat = teamId === state.userTeamId;
   for (let pass = 0; pass < 8; pass++) {
-    enforceCap(state, teamId);
+    if (!userSeat) enforceCap(state, teamId);
     fillRoster(state, teamId, rng, limit, stashPs);

     const cap = teamCap(state, teamId);
     const count = rosterCount(state, teamId);
     if (cap.space >= 0 && count >= ROSTER_LIMIT && count <= limit) return;
   }
+  // The GM cuts his own cap. Rewriting a deal he signed is the 2052 hatch.
+  if (userSeat) return;

   // Last resort: replace the most expensive cuttable contracts with minimum
```

`fillRoster` still trims the user club to the limit. That trim is `surplusWorth`, so the bodies who leave are the low-worth camp surplus, which is the cut the 53-man lock already claims to make (`app/roster/page.tsx` 353). They will still read "Your waive", because `cutPlayer` has no other label. A star with positive savings is no longer ahead of them, and a star `enforceCap` could not release keeps the deal he signed.

The button has to stop before that call when the books are already illegal. Preseason already refuses. Cutdown does not.

```diff
--- a/v2/app/page.tsx
+++ b/v2/app/page.tsx
@@ -163,7 +163,8 @@ export default function HubPage() {
   })();

   const blocking = issues.filter((i) => i.kind !== "underLimit" || state.phase === "preseason");
-  const canAdvance = !(state.phase === "preseason" && blocking.length > 0);
+  const capGate = state.phase === "preseason" || state.phase === "offseason-final";
+  const canAdvance = !(capGate && blocking.length > 0);
```

Auto-fix calls the same `reconcileRoster`. After the guard above it can no longer rewrite, and it can no longer release for cap. Its toast still says "Roster and cap brought back into compliance" (`app/page.tsx` 704). That string has to follow the result: when `teamCap.space < 0` after the call, say the club is still over and name `/finances`. Do not leave the success toast on a book that did not move.

Headless `advanceOffseason` does not read `canAdvance`. Seed 42 at the cutdown door, this tree, stopped with `preseasonWeeksLeft === 0`: user roster **69**, space **`+$68,087,501`**, committed **`$202,212,499`** against the `$270.3M` cap (74.8%), dead `$7,820,000`. The release loop and the hatch do not run on that book, because space is already positive. A later headless season that actually is over the cap would reach season start over the cap and fail `verify`'s "no team is over the salary cap" and `sweep`'s over-cap count. That failure is the guard working. Do not put the hatch back to quiet it, and do not edit the check.

## Canary and the gate

**SIGNED. Not re-locked. Nothing in `docs/baselines.json` moves.**

| Check | What this fix does to it |
|---|---|
| Seed-42 `userOffers` canary, tag `1777473079` / FA `3280841901` (`lib/core/userOffers.test.ts` 125–130) | The literals are the parent RNG at `offseason-tag` and one `advanceOffseason` later at `offseason-fa`. Camp and `finalizeOffseason` are after both. `makeContract` draws nothing. Seed-42 `newGame` writes **zero** "league minimum" lines and **zero** "waived" lines, and no club is over the cap, so the opening `reconcileRoster` never takes the release loop or the hatch. The year-1 cutdown door is `+$68.1M`, so it does not take them either. A user-seat guard that only changes the over-cap branches is a no-op on that walk. |
| `drift`, `careers`, the rest of the gate | CPU `enforceCap` and the CPU hatch stay. The in-season backstop already skips the user. Those harnesses move only if a headless user club is over the cap and the skipped releases change a later draw. Year 1 of seed 42 does not. Do not run a panel for this note. |
| `verify` / `sweep` "nobody over the cap" | Holds on the seed-42 cutdown door measured above. Fails in a season where the user club is over and nobody has cut him. That is the case this fix is for. |

The sort change that would move the canary is editing `enforceCap` for every club. `resolveWaivers` calls it on CPU clubs during the season the canary plays. Who gets released changes the roster, the games, and the parent stream before Tag. This note does not do that. If a signed implementation draws before FA, or the canary prints anything other than tag `1777473079` and FA `3280841901`, revert that part. Do not write the new RNG into the test.

Before Matt signs the implementation: `npx tsx lib/core/userOffers.test.ts` must still print that pair, and one seed of `npx tsx scripts/verify.ts 1` is the cap check. No `gate:full`, no Mac Studio panel, no baseline edit.
