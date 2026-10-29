# Staff page false "fired" — playtest 1028, finding 1

**Finding only.** This PR adds this note. It does not change the sim, the card, `docs/baselines.json`, or a canary. Matt signs any fix. No re-lock, no dial retune, no panel.

Source: career playtest on `main` `8747e25` (same code as `ddc62bd`), save `GM Playtest career5 1028`, Kansas City Stampede, 2026–2030. Shots `s5/02`–`s5/06`, `s4/02`, `s3/08`, `s3/09`. Repro: sim to about 5–3 around week 8–10 and open `/staff`.

The Hub never warns and the week keeps advancing. The fire on `/staff` is a card read. The season is not over, and `applyUserGmFiring` has not run.

## What the card showed

Same owner the whole career (screenshot: Ivan Whitlock, patience **0.50**). While the club is a contend target the bar is **8.7**:

`ownerBar` (`lib/core/owner.ts` 143–149) takes 8.5 once expected wins are at least 10, then `−4 × (patience − 0.55)`. Patience 0.50 moves that by `+0.2`. The 2030 week-8 shot says "contending club · expects about 10 wins" and prints bar 8.7.

| Window | Record | Games | Prior year | Raw 60/40 | Raw margin | Card seat | Pace | Pace 60/40 |
|---|---|---:|---:|---:|---:|---|---:|---:|
| 2028 W10 | 5–3 | 8 | 9 (2027, 9–8) | 6.6 | −2.1 | fired | 10.625 | 9.975 → **10.0** |
| 2029 W10 | 6–3 | 9 | 10 (2028, 10–7) | 7.6 | −1.1 | fired | 11.333 | **10.8** |
| 2029 W11 | 6–4 | 10 | 10 | 7.6 | −1.1 | fired | 10.2 | **10.1** |
| 2030 W8 | 5–2 | 7 | 13 (2029, 13–4) | 8.2 | −0.5 | fired | 12.143 | **12.5** |
| 2030 W10 | 5–3 | 8 | 13 | 8.2 | −0.5 | fired | 10.625 | **11.6** |
| 2030, six wins | 6–x | — | 13 | 8.8 | +0.1 | hot | — | clear of the bar |

Raw weight is `newer × 0.6 + older × 0.4` (`weightedWins`, `owner.ts` 152–160) with `newer` equal to the partial win total. Pace weight replaces that partial with `wins × 17 / games` inside the same 60/40 (`ownerCardPace`, `lib/view/ownerPace.ts` 72–74). The report's "weighted wins 10–12.5 against an 8.7 bar" is the **pace** column. The seat is the **raw** column.

2030 week 8 is the shot. Header `2030 · Regular Season · Week 8 · 5–2`. The owner card prints:

- Weighted wins **12.5**, sub `bar 8.7 · margin 3.8 · on pace for 12.1`
- Last season **5**, sub `5 seasons in the chair`
- Would fire **yes**
- Job security **fired**
- `Ivan Whitlock has seen enough. He is counting the last two seasons, weighted 60/40. The season is over — take an open chair or retire the save.`

Check on that shot, prior year 13:

- Raw: `5 × 0.6 + 13 × 0.4 = 8.2`. Margin `8.2 − 8.7 = −0.5`. Five wins is not a winning season (`wins > 17/2`, `owner.ts` 170–172) and `5 − 13` is not a gain of 3 (`recordKeepsJob`, `owner.ts` 180–187), so `wouldFire` is true and the seat is `fired`.
- Pace: `5 × 17 / 7 = 12.142…` → label `on pace for 12.1`. Displayed weight `8.2 + (12.142… − 5) × 0.6 = 12.485…` → **12.5**. Margin `3.785…` → **3.8**.

Six wins against that same 13 is the "6 = hot" reading: `6 × 0.6 + 13 × 0.4 = 8.8`, margin `+0.1`, seat `hot`, `wouldFire` false. The Last season box is showing the partial (5, then 6), not 2029's 13. Against a prior of 10 (2029's window) six wins is still a raw fire (`7.6`, margin `−1.1`). "5 = fired, 6 = hot" is the 2030 prior. The other two seasons stay fired at six wins. By week 11–15 the partial itself climbs through the bar, so the card drifts to hot or watched on its own. That is the same formula catching up, not a second rule.

## Root cause

`/staff` prints one owner view and then a second, pace-only layer on top of two of its four stats. The firing words come from the first layer. That layer treats this year's partial wins as a completed season, and the Last season stat prints those same partial wins.

1. During the regular season, `viewRows` (`owner.ts` 321–328) appends `liveSeasonRow` (`owner.ts` 301–319). That row's `wins` is `rec.w + rec.t × 0.5` for `state.season` — games played so far, not a 17-game year. `ownerJobView` (`owner.ts` 361–372) feeds every row, including that one, to `ownerJudgment`.

2. `recentWins` is the newest row (`owner.ts` 377). The staff page labels it **Last season** (`app/staff/page.tsx` 209–212). In week 8 of 2030 that value is 5. It is this season. Last season is the newest `state.history` row (13).

3. `seasonsWithGm` is `judged.seasons`, the row count including the live year (`owner.ts` 411). Four archived seasons plus 2030 is why the sub says "5 seasons in the chair" in the fifth season. The count is the same inclusion. The false number is the 5 in the value, not the chair count. Leave the count.

4. `wouldFire`, `seat`, and `line` are `ownerJudgment` on those rows (`owner.ts` 367–372, 392–405, 417–418). Two or more rows take the 60/40 bar. The fired sentence is `owner.ts` 395–396, and `counted` for two or more seasons is "He is counting the last two seasons, weighted 60/40." (`owner.ts` 380–385). One of those two "seasons" is the partial.

5. The page does not print `job.wouldFire`. It prints `ownerCardVerdict` (`app/staff/page.tsx` 136, 148, 188–192, 214–221). That function (`ownerPace.ts` 115–131) returns `job.wouldFire`, `job.seat`, and `job.line` unchanged once `earlySeasonSample` is false. The early sample is `played > 0 && played <= 5` (`EARLY_VERDICT_GAMES`, `ownerPace.ts` 96–104). Week 8 at 5–2 is 7 games. Week 10 at 5–3 is 8. Both are past the gate, so the raw fire is what the card prints.

6. Weighted wins on the same card are `pace.weightedWins` (`app/staff/page.tsx` 204–207), from `ownerCardPace` (`ownerPace.ts` 54–80). That helper does not call `ownerJudgment` and does not write `job.wouldFire`. It assumes `job.recentWins` is already the partial inside `job.weightedWins`, then swaps the partial for the pace: `job.weightedWins + (pace − job.recentWins) × 0.6`. The 12.5 and the "fired" are both honest to their inputs. They are different inputs.

`lib/view/ownerPace.test.ts` 275–282 locks the bad sentence. Six games at 1–5 must print `wouldFire` `"yes"`, seat `"fired"`, and a line matching `/The season is over/`. The comment on 310 says the card withholds the verdict only while the sample is early, and the decision stays on the raw wins. A 5–2 club takes that same path. The suite is green because the test requires the playtest's bug once the club has played six games.

`owner.test.ts` 809–812 and 840–845 lock the same raw read on `ownerJobView` itself ("the view counts the current wins", "8 then 2 at a retool club is a fire on the card"). Those assertions are the view, not the sim. The page is not allowed to print them during the regular season (`ownerPace.test.ts` 220 already forbids `job.wouldFire ? "yes"` in `app/staff/page.tsx`).

## What keeps running

Nothing in the week loop reads this card.

- `applyUserGmFiring` (`owner.ts` 462–479) is called from `runRecap` (`lib/core/offseason/index.ts` 86–94) after `recordSeasonHistory` has pushed the year. `viewRows` then sees `state.season` already in `tenureRows` and does not append a second copy (`owner.ts` 324). The real fire is the archived 17-game year.
- `fireCpuHeadCoaches` (`lib/core/coaches.ts` 579–601) calls `tenureRows` (`owner.ts` 273–288), which is history only. The comment at `owner.ts` 291–295 says the sim fires from the archive. `owner.test.ts` 846–851: a mid-season read fires nobody, draws nothing, and leaves `hcFires` at 0.
- `openGmChairs` (`owner.ts` 446–454) uses `ownerJobView`, and its only caller is `applyUserGmFiring`. It does not run in the regular season.
- The Hub (`app/page.tsx`) does not call `ownerJobView`. Its only "fired" copy is the offseason coaching carousel. There is no job-security warning to show, and no `forcedMove`, so Play is still there.

A winning 13–4 season still ends safe. The playtest's 2026, 2028, 2029, and 2030 chairs held. The mid-season card is the part that is wrong.

## Proposed fix

Card only. `ownerJudgment`, `liveSeasonRow`, `viewRows`, `tenureRows`, `applyUserGmFiring`, and `fireCpuHeadCoaches` stay. `ownerCardPace` needs the live partial to already sit in `job.recentWins` and `job.weightedWins`. Pulling the live row out of `ownerJobView` during the regular season would blank the 12.5, which is the number that is already right, and it would turn `owner.test.ts` 809–845 red for a display bug.

During `phase === "regular"`, with this season absent from `history` and at least one game played:

- **Last season** prints the newest archived row (`tenureRows`, `season < state.season`), not `job.recentWins`. No archived row (year 1) prints "—". Playoffs and Season Review keep `job.recentWins`, which is the finished year.
- **Would fire, job security, and the line** follow the pace margin against `job.bar`, which already includes patience and a rebuild runway. Seat bands stay `seatFor` (`owner.ts` 189–194): `≤ 0` fired, `≤ 1` hot, `≤ 2.5` watched, otherwise safe. A margin at or under 0 that a keep blocks becomes `hot`, same as `viewSeat` (`owner.ts` 336–340).
- The keep is the signed one (Matt, 2026-10-09), applied to the pace: pace `> 17/2`, or pace at least three wins above the archived prior. A rebuild-target first season still does not fire (`expectedWins === OWNER_WIN_TARGET.rebuild` and `seasonsWithGm <= 1`).
- The ≤5-game early withhold stays when the raw view **or** the pace would fire. Week 2 at 0–1 and week 5 at 1–3 still read `early`. A 5–2 in seven games is past that gate.
- The regular-season line does not use `job.line` when that line says the season is over. A pace that clears the bar says the owner is counting this season at its pace. A pace that misses, after five games, says he would fire at this pace and names the bar and the pace label. It does not say the season is over and it does not offer an open chair. Playoffs and Season Review still return `job.line`, including that sentence, because that is the finished year `runRecap` is about to judge.
- Firing off falls through to today's "chair is guaranteed" line.

On the playtest rows that is:

| Window | Pace margin vs 8.7 | Seat | Would fire |
|---|---:|---|---|
| 2028 W10 (5–3, prior 9) | +1.3 | watched | no |
| 2029 W10 (6–3, prior 10) | +2.1 | watched | no |
| 2029 W11 (6–4, prior 10) | +1.4 | watched | no |
| 2030 W8 (5–2, prior 13) | +3.8 | safe | no |
| 2030 W10 (5–3, prior 13) | +2.9 | safe | no |
| 2030, six wins, prior 13 | clear | safe | no |

None of them stay `fired` / `yes`. 2028 and 2029 land on `watched` because a ~10-win pace against 8.7 is inside the 2.5 watched band. 2030 week 8 lands on `safe`.

```diff
--- a/v2/lib/view/ownerPace.ts
+++ b/v2/lib/view/ownerPace.ts
@@ -1,5 +1,5 @@
-import { OwnerJobView, OwnerSeat } from "../core/owner";
+import { OWNER_WIN_TARGET, OwnerJobView, OwnerSeat, tenureRows } from "../core/owner";
 import { computeRecords } from "../core/select";
 import { GAMES_PER_TEAM, GameState } from "../core/types";

+/** Newest archived season under this GM. History only, so a live partial is not last season. */
+export function archivedPriorWins(state: GameState, teamId: number): number | null {
+  const hired = state.teams[teamId]?.gmHiredSeason ?? state.season;
+  const rows = tenureRows(state, teamId, hired).filter((r) => r.season < state.season);
+  return rows.length ? rows[rows.length - 1].wins : null;
+}
+
+function marginSeat(margin: number): OwnerSeat {
+  if (margin <= 0) return "fired";
+  if (margin <= 1) return "hot";
+  if (margin <= 2.5) return "watched";
+  return "safe";
+}
+
 export function ownerCardVerdict(
   state: GameState,
   teamId: number,
   job: OwnerJobView,
 ): OwnerCardVerdict {
+  const regular =
+    state.phase === "regular" &&
+    !state.history.some((h) => h.season === state.season);
+  if (job.firingEnabled && regular) {
+    const pace = ownerCardPace(state, teamId, job);
+    if (pace.pace != null) {
+      const prior = archivedPriorWins(state, teamId);
+      const keep =
+        pace.pace > GAMES_PER_TEAM / 2 ||
+        (prior != null && pace.pace - prior >= 3);
+      const rebuildYear =
+        job.seasonsWithGm <= 1 && job.expectedWins === OWNER_WIN_TARGET.rebuild;
+      const paceFires = pace.margin <= 0 && !keep && !rebuildYear;
+      if (earlySeasonSample(state, teamId) && (job.wouldFire || paceFires)) {
+        return {
+          wouldFire: "early",
+          seat: "early",
+          line: `${job.owner.name} reads a firing verdict after more than five games. This sample is still early.`,
+        };
+      }
+      const band = marginSeat(pace.margin);
+      const seat: OwnerSeat = paceFires ? "fired" : band === "fired" ? "hot" : band;
+      const wouldFire = paceFires ? "yes" as const : "no" as const;
+      const agrees =
+        wouldFire === (job.wouldFire ? "yes" : "no") &&
+        seat === job.seat &&
+        wouldFire !== "yes";
+      if (agrees) return { wouldFire, seat, line: job.line };
+      const line = paceFires
+        ? `${job.owner.name} would fire at this pace. The bar is ${job.bar.toFixed(1)}. ${paceLabel(pace.pace)}.`
+        : `${job.owner.name} is counting this season at its pace. The bar is ${job.bar.toFixed(1)}. ${paceLabel(pace.pace)}.`;
+      return { wouldFire, seat, line };
+    }
+  }
   if (!job.wouldFire || !earlySeasonSample(state, teamId)) {
     return {
       wouldFire: job.wouldFire ? "yes" : "no",
```

```diff
--- a/v2/app/staff/page.tsx
+++ b/v2/app/staff/page.tsx
@@ -17,7 +17,7 @@ import {
 } from "@/lib/core/coaches";
 import { ensureOwners, isPendingForcedMove, ownerJobView, patienceScaleLabel } from "@/lib/core/owner";
-import { ownerCardPace, ownerCardVerdict, ownerMarginSub } from "@/lib/view/ownerPace";
+import { archivedPriorWins, ownerCardPace, ownerCardVerdict, ownerMarginSub } from "@/lib/view/ownerPace";
@@ -145,6 +145,9 @@ export default function StaffPage() {
   if (!state || !team) return null;
   void rev;
+  const lastSeasonWins =
+    state.phase === "regular" ? archivedPriorWins(state, teamId) : job?.recentWins ?? null;
@@ -209,7 +212,7 @@ export default function StaffPage() {
             <Stat
               label="Last season"
-              value={job.recentWins == null ? "—" : job.recentWins.toFixed(job.recentWins % 1 ? 1 : 0)}
+              value={lastSeasonWins == null ? "—" : lastSeasonWins.toFixed(lastSeasonWins % 1 ? 1 : 0)}
               sub={`${job.seasonsWithGm} season${job.seasonsWithGm === 1 ? "" : "s"} in the chair`}
             />
```

`marginSeat` is the three cuts in `seatFor`. Keeping a private copy in the view file avoids exporting the sim helper. If the bands ever move, they move together; the regression below pins safe / watched / hot / fired to today's cuts.

## Regression

No new test file. `lib/view/ownerPace.test.ts` is already on the `package.json` `test` script and on both tiers in `scripts/gate.ts` (`ownerpace` at lines 99 and 180). `owner.test.ts` is `ownercheck` (lines 126 and 207). Do not edit `scripts/gate.ts` or `package.json` for this.

Add one case next to the early-verdict block. `plantYear` / `plantLive` are already in that file. The raw `ownerJobView` stays a fire; the card must not print it. Assert the parent RNG is unchanged.

```ts
{
  // Playtest 1028 finding 1. 2030 W8 at 5-2, patience 0.50, prior 13, bar 8.7.
  const st = newGame({ seed: 509 });
  st.settings = { ...(st.settings!), firingEnabled: true };
  const team = st.teams[st.userTeamId];
  team.owner!.patience = 0.50;
  team.gmHiredSeason = st.season - 1;
  team.seasonExpectedWins = 10;
  plantYear(st, st.season - 1, 13, 10);
  st.phase = "regular";
  st.week = 8;
  plantLive(st, st.userTeamId, 5, 2);
  const parent = st.rngState;
  const job = ownerJobView(st, st.userTeamId)!;
  assert.equal(job.recentWins, 5, "the view still holds the partial");
  assert.equal(job.wouldFire, true, "the raw completed-season read still fires");
  assert.match(job.line, /The season is over/);
  const pace = ownerCardPace(st, st.userTeamId, job);
  close(pace.pace!, (5 * 17) / 7, "5-2 is on pace for 12.1");
  const card = ownerCardVerdict(st, st.userTeamId, job);
  assert.equal(card.wouldFire, "no");
  assert.equal(card.seat, "safe");
  assert.equal(card.line.includes("The season is over"), false);
  assert.equal(card.line.includes("open chair"), false);
  assert.equal(archivedPriorWins(st, st.userTeamId), 13);
  assert.equal(st.rngState, parent, "the card read does not draw");

  // Prior 10, 6-3: the 2029 window. Pace margin is about +2.1, so watched, not fired.
  const y2029 = newGame({ seed: 510 });
  y2029.settings = { ...(y2029.settings!), firingEnabled: true };
  const club = y2029.teams[y2029.userTeamId];
  club.owner!.patience = 0.50;
  club.gmHiredSeason = y2029.season - 1;
  club.seasonExpectedWins = 10;
  plantYear(y2029, y2029.season - 1, 10, 10);
  y2029.phase = "regular";
  plantLive(y2029, y2029.userTeamId, 6, 3);
  const job2029 = ownerJobView(y2029, y2029.userTeamId)!;
  assert.equal(job2029.wouldFire, true);
  const card2029 = ownerCardVerdict(y2029, y2029.userTeamId, job2029);
  assert.equal(card2029.wouldFire, "no");
  assert.equal(card2029.seat, "watched");
  assert.equal(archivedPriorWins(y2029, y2029.userTeamId), 10);

  // Six wins against a 13-win prior: raw seat is hot; the pace is safe.
  const six = newGame({ seed: 511 });
  six.settings = { ...(six.settings!), firingEnabled: true };
  const hot = six.teams[six.userTeamId];
  hot.owner!.patience = 0.50;
  hot.gmHiredSeason = six.season - 1;
  hot.seasonExpectedWins = 10;
  plantYear(six, six.season - 1, 13, 10);
  six.phase = "regular";
  plantLive(six, six.userTeamId, 6, 2);
  const jobSixWins = ownerJobView(six, six.userTeamId)!;
  assert.equal(jobSixWins.recentWins, 6);
  assert.equal(jobSixWins.wouldFire, false);
  assert.equal(jobSixWins.seat, "hot");
  const cardSixWins = ownerCardVerdict(six, six.userTeamId, jobSixWins);
  assert.equal(cardSixWins.wouldFire, "no");
  assert.equal(cardSixWins.seat, "safe");
}
```

`plantLive` appends games. Each of those three blocks uses its own state.

Change the assertion at `ownerPace.test.ts` 280–282. Six games at 1–5, year 1, patience 0.55, is a real pace miss (pace `17/6 ≈ 2.83` under the one-and-done bar of 4), so `wouldFire` `"yes"` and seat `"fired"` stay. The line must not:

```ts
assert.equal(cardSix.wouldFire, "yes", "the sixth game prints the pace verdict");
assert.equal(cardSix.seat, "fired");
assert.equal(cardSix.line.includes("The season is over"), false);
assert.equal(cardSix.line.includes("open chair"), false);
```

Leave these alone:

- Week 2 at 0–1, week 5 at 1–3, and five games at 0–5 still return `early` and do not contain "The season is over" (`ownerPace.test.ts` 242–273).
- Playoffs at 1–3 and Season Review at 3–14 still print the raw verdict, and the playoff line still matches `/The season is over/` (`ownerPace.test.ts` 298–309).
- `owner.test.ts` 840–851: the sim still fires nobody off the live table.
- `owner.test.ts` 854–906: Season Review and Continue still match `ownerJudgment`, and a real fire still comes from `applyUserGmFiring` after the archive.
- A source check that the Last season stat is `lastSeasonWins` / `archivedPriorWins`, and that the slice of `app/staff/page.tsx` from `label="Last season"` to `label="Would fire"` does not read `job.recentWins`. Year 1 in the regular season: `archivedPriorWins` is `null`.

Run, when the fix is actually made:

```bash
npx tsx lib/view/ownerPace.test.ts
npx tsx lib/core/owner.test.ts
npx tsx lib/core/userOffers.test.ts
```

## Gate, canaries, and this PR

The card reads state and returns a string. `ownerCardPace` and `ownerCardVerdict` already assert they do not move `rngState` (`ownerPace.test.ts` 130, 252). `archivedPriorWins` is a filter over `state.history`. None of that is on the season advance.

`fireCpuHeadCoaches` is what increments `seasonCounters.hcFires` and `hcFiredLastSeasonWins`, from `tenureRows`. `drift.hcFiresPerSeason` and `drift.hcFiredLastSeasonWins` read those counters. This fix does not enter that function. User-GM `forcedMove` does not increment them either. No other gated metric is computed from `ownerCardVerdict`.

The seed-42 user-offer canary walks `advance` / `advanceOffseason` to the tag window and then free agency. It asserts the parent stream, not a card:

- `lib/core/userOffers.test.ts` 125–126: at `offseason-tag`, `rngState === 1777473079`
- `lib/core/userOffers.test.ts` 128–130: after the step into `offseason-fa`, `rngState === 3280841901`

That pair is the fingerprint Matt signed (comment at `userOffers.test.ts` 12–14: measured after the rebase onto `#201`, equal to the `86e7716` value plus the empty-room change). `/staff` is not on that walk. Leaving `ownerJobView` and the recap fire where they are keeps the walk byte-identical. An implementation that only lands the diff above must leave the pair at tag `1777473079`, FA `3280841901`.

Do not re-lock `userOffers`. Do not edit `docs/baselines.json`. Do not retune an owner, coach, or staff dial. Do not run a gate panel for this finding. A red `useroffers` after the fix means the diff went outside the card and into the season stream; revert that part rather than writing the new RNG into the test.

This PR is the note. The code above is a proposal for Matt to sign.
