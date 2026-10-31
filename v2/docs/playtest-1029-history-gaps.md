# /history blanks awards and drops earlier championships — playtest 1029

**UNSIGNED.** Diagnosis only. No engine change, no page change, no `docs/baselines.json` edit, no re-lock. Matt signs any fix.

Source: 30-season playtest on production `main` `8747e25` (same history code as this tree: `hallOfFame.ts`, `app/history/page.tsx`, `offseason/progression.ts`, `owner.ts`, `housekeeping.ts`, `season/stats.ts`, and `store/save.ts` are untouched since `8747e25`). Save `GM Playtest career30 1029`. KC 2026–28, fired at the 2028 tag, BAL 2029–49, fired at the 2049 tag, SF 2050–55. Stopped on the 2055 Season Review. Report sections 2 and m8. Shot `qa-career30-1029/s01-05/05-history-franchise.webp`.

The production save was not loaded. The mechanism was reproduced on this tree with a headless seed-42 league (KC, then `acceptGmChair` to BAL, then to SF) and with one planted 2026 row passed through the same presenter the page calls.

## Verdict

The archive is written and kept. `recordSeasonHistory` stores a champion, a runner-up, four award ids, and four leader ids for every completed season. Nothing caps `state.history`, and housekeeping does not touch it. Save migration does not strip those fields.

`/history` then throws most of that away at render time. Every row is presented as the club in `state.userTeamId` right now. An award or a league leader is drawn only when that winner's season stat line says he played for that current club. A Champion pill, a Runner-up pill, the record, and the division finish are the current club's, including for years the GM spent somewhere else. After a chair change the previous club's title leaves the Championships count, the pill, and the timeline. The old season's record is replaced by the new club's record for that same year.

One season is absent for a different reason. The row is appended in `runRecap`, which is Continue off the Season Review, not the review itself. Stopped on the 2055 review, the page has 29 rows (2026–2054). CLE's 2055 title is already known and is not on the page. `/records` says "through 2055" because that string is `state.season`.

## What the playtest saw

On `/history`, the Awards column was "—" on every row, and Leaders was "—" on most rows. The page header followed the chair: after the moves it read as the current club, and the 2026 KC title (15-2, won the championship) was no longer on the franchise page. The save at the 2055 review reported 29 archived seasons. `/records` still said the book ran through 2055.

The same career's champion list is complete, 2026 through 2055, 21 different champions. That list was compiled from the season notes and the champion/runner-up surface, not from the franchise Awards column. `/league` Season History reads `history.awards.mvp` and `history.awards.roy` with no club filter (`app/league/page.tsx` 168–218). A blank Awards cell on `/history` is not a blank archive. `/league` has no OPOY or DPOY column. Those two ids are on the history row and only `/history` is supposed to show them.

## What gets written

Continue on Season Review is `advanceOffseason` → `runRecap` (`lib/core/offseason/index.ts` 364–370). `runRecap` calls `recordSeasonHistory` and pushes the row before it fires anyone (`index.ts` 86–87, then `applyUserGmFiring` at 94). The phase becomes `offseason-tag` (`index.ts` 113). The calendar does not roll here. `state.games = []` waits until `finalizeOffseason` (`index.ts` 298), so the championship game is still on the save when the row is built.

`recordSeasonHistory` (`lib/core/offseason/progression.ts` 297–375) writes:

- `championId` from `state.playoffs.championId`, or `-1` if that is null (`progression.ts` 300). The id is set when the championship game is played (`lib/core/season/playoffs.ts` 258–262). `advance` moves to `offseason-recap` only after `playoffs.complete` (`lib/core/season/engine.ts` 218–221).
- `runnerUpId` from that same game's loser (`progression.ts` 302–307).
- `standings`, one row per club (`progression.ts` 315–318).
- `awards.mvp`, `opoy`, `dpoy`, `roy` (`progression.ts` 319–346).
- `leaders.passYds`, `rushYds`, `recYds`, `sacks` (`progression.ts` 347–354).

The same call stamps `careerAwards` on the winners and on the champion's roster (`progression.ts` 357–373). `SeasonHistory` has no field for which club the GM held (`lib/core/types.ts` 1187–1194).

## Why Awards and Leaders are "—"

The page calls `presentFranchiseHistory(state)` (`app/history/page.tsx` 54). The default team is `state.userTeamId` (`lib/core/hallOfFame.ts` 375–377). `presentYear` walks the four award ids and the four leader ids and keeps a winner only when `playedFor` says his season line is the current club (`hallOfFame.ts` 324–334). `playedFor` (`hallOfFame.ts` 168–170) requires the season line's `teamId` to equal the club being presented, and `games > 0`. The page prints "—" when the filtered list is empty (`app/history/page.tsx` 212–240). The ids are still on the row. `/league` does not apply this test, which is why MVP and ROY can be named there while `/history` shows a dash for the same season.

A dash on this column means "that winner did not play for the club I hold today." It does not mean the award was never given. Across a long career the user's club is one of 32, so the column is usually empty. The playtest's "always —" for awards and "mostly —" for leaders is that filter. A leader appears only in a year the current club happened to lead the league.

The filter follows the chair, not the year. Seed 42, still on BAL, drew the 2032 receiving leader (player `1000264`, 1,438 yards, season line BAL). `acceptGmChair` to SF left the row untouched and the cell went back to "—". The same move made the 2026 OPOY appear (Malik Torres, id `1783`, season line SF, 16 games). The GM was KC in 2026. The cell is SF's old award, shown because SF is the chair now.

`playedFor` reads one season line. `seasonLine` keeps a single row per player per season and overwrites `teamId` with the last game's club (`lib/core/season/stats.ts` 68–75). A midseason trade credits the award to the last club only. That did not produce the blank column in this run: every stored winner still had a line, a club, and `games > 0`. It is a hole in any fix that attributes a winner by that one `teamId`.

## Why some championships disappear

`presentYear` sets `champion` and `runnerUp` by comparing the stored ids to the same current club (`hallOfFame.ts` 348–349). The Championships stat counts those pills (`hallOfFame.ts` 394). The record and the finish come from that club's row in `standings` (`hallOfFame.ts` 322, 182–194). The timeline is built from those flags (`hallOfFame.ts` 357–372).

`acceptGmChair` assigns `state.userTeamId` and does not read or write `state.history` (`lib/core/owner.ts` 498–502). The next paint rebinds every archived year to the new club.

What the playtest lost, once the chair was no longer KC:

- The Championships count no longer includes 2026.
- The 2026 row is no longer a Champion pill, and the timeline no longer says the championship was won.
- The 2026 record is no longer 15-2. It is whatever the current club did in 2026, with that club's division finish.

The Title cell does not go blank for 2026. When the current club is neither champion nor runner-up, the page still draws `state.teams[championId]` (`app/history/page.tsx` 198–210). KC's abbreviation remains, sitting on the new club's 2026 record. The franchise fact "we won it, 15-2" is gone. The league fact "KC won" is a logo on someone else's row.

The same comparison drops a Runner-up pill. BAL lost the 2035 and 2036 championships (report: HOU, then LV). Those pills exist only while `userTeamId` is BAL. On SF the Title cells show HOU and LV, and the records are SF's.

2053 is the title that should still be a pill. The GM still holds SF, and 2053 was archived at the 2053 tag, before the 2055 review. "Some" championships: 2026 (and the two BAL runner-up years) leave; 2053 stays; 2055 was never a row.

`gmHiredSeason` cannot repair an old save. `ensureOwners` sets it to the league's first season on every club that lacks it (`owner.ts` 88). `acceptGmChair` overwrites it on the club just taken (`owner.ts` 499) and does not record the departure. After KC → BAL → SF, KC's value is still the league start, which is also every untouched club's value. The opening "You are the GM of …" line is `kind: "system"` (`lib/core/generate.ts` 655–658). `trimLog` keeps `system` rows for two seasons (`lib/core/housekeeping.ts` 17–18, 50–52). The fire and hire lines are `kind: "milestone"` (`owner.ts` 473–477 and 508–513), and milestones are permanent (`housekeeping.ts` 29–33). A parser could rebuild tenure from those sentences. This note does not propose that parser.

The Records → Franchise tab is the same retarget, one sentence: `franchiseCareerRecords(state, state.userTeamId, …)` (`app/records/page.tsx` 301–303, `lib/core/season/records.ts` 163–174) sums only lines whose `teamId` is the current club. The header "through {season}" is `state.season` (`app/records/page.tsx` 243), which is why the book says 2055 while `/history` stops at 2054.

## What this is not

Not a cap. Checkpoints on the seed-42 run: 1, 2, 3, 4, 5, 6, 7, 8, 9 rows after 1 through 9 completed seasons. The presenter dropped zero rows. The playtest's 29 at the 2055 review is 2026–2054, which is every season `runRecap` had already been asked to archive.

Not housekeeping. The comment on `runHousekeeping` says stat rows are kept forever for the record book (`housekeeping.ts` 6–10). The function trims the log, drops retirees who never played, and shrinks old prospect profiles (`housekeeping.ts` 114–118). A retiree with a stat line or a `careerAwards` entry stays (`housekeeping.ts` 80–83). Award winners are stamped before `runProgression` retires anyone.

Not migration. `encodeSave` copies `history` through unchanged (`lib/store/codec.ts` 33–35, 120–128). `migrate` calls `rebuildRegularSeasonStats` (`lib/store/save.ts` 171). That rebuild runs only for a season whose playoff boxes and full regular-season boxes are still in `state.games` (`lib/core/season/stats.ts` 122–148). It rewrites the four leader ids from the rebuilt lines. It does not touch `awards` or `championId`. After the rollover, `state.games` is empty, so older seasons are not rebuilt. On the seed-42 save, parked in the 2035 preseason, `migrate(decode(encode(state)))` left the champion ids, award ids, and leader ids identical.

Not the firing itself deleting a year. `recordSeasonHistory` runs before `applyUserGmFiring`. The year you are fired for is archived under the club you still hold. The rebind happens later, when `acceptGmChair` changes `userTeamId`.

## Seed 42

`newGame({ seed: 42, userTeamId: 15, startSeason: 2026, settings: { firingEnabled: false } })`. KC is team 15, BAL is 19, SF is 28. Firing was off so the chair changes are explicit `acceptGmChair` calls, the same function the forced-move desk uses. No production save. Nothing was written back into the repo by the probe.

Stopped on the 2026 Season Review, before Continue: `phase` `offseason-recap`, `history.length` 0, `playoffs.complete` true, champion PHX. The page showed 0 seasons and Championships 0. One Continue (`runRecap`): `history.length` 1, phase `offseason-tag`, champion still PHX. The new row had all four award ids and all four leader ids. The page showed title PHX, record 11-6, finish 1st in AFC West, Awards "—", Leaders "—".

Four KC seasons (2026–2029), then `acceptGmChair` to BAL with no new season. The history signature (season, champion, runner-up, awards, leaders, standings length) was unchanged. The header became Baltimore Blackbirds. The same four rows:

| Season | Champion stored | KC record, while the chair was KC | Same row, the moment the chair was BAL |
|---|---|---|---|
| 2026 | PHX | 11-6, 1st in AFC West | 10-7, 3rd in NFC East |
| 2027 | CAR | 12-5, 1st in AFC West | 9-8, 3rd in NFC East |
| 2028 | NYS | 6-10-1, 3rd in AFC West | 5-12, 4th in NFC East |
| 2029 | NO | 3-13-1, 4th in AFC West | 10-7, 2nd in NFC East |

Awards stayed "—" on all four. Every standings array was length 32. No champion id pointed at a missing team.

Three more seasons as BAL (2030–2032). 2032 was the one Leaders hit: receiving yards, player `1000264`, line club BAL, value 1,438. Awards still "—". `acceptGmChair` to SF, signature unchanged again. That 2032 leader cell became "—". The 2026 Awards cell became OPOY, Malik Torres of SF.

Two more seasons as SF (2033–2034). Nine rows, nine view years, zero rows dropped, Championships 0. Final view, chair SF:

| Season | Stored champion | Page title | Page awards | Page leaders |
|---|---|---|---|---|
| 2026 | PHX | PHX | OPOY | — |
| 2027 | CAR | CAR | — | — |
| 2028 | NYS | NYS | — | — |
| 2029 | NO | NO | — | — |
| 2030 | CHI | CHI | — | — |
| 2031 | TB | TB | — | — |
| 2032 | CHI | CHI | — | — |
| 2033 | CHI | CHI | — | — |
| 2034 | KC | KC | — | — |

36 of 36 award ids were non-null. 36 of 36 leader ids were non-null. The page, as SF, showed an award on 1 of 9 seasons and a leader on 0 of 9. Calling `presentFranchiseHistory(state, winner's line club)` showed every one of those 36 awards. 2034's champion is KC, the club the GM had left; the cell is the abbreviation KC on SF's 5-12 row, not a Champion pill. KC did not win a title during the four seasons the GM actually held KC, so this organic run did not itself drop a pill. The next section is that case, on the same presenter.

`encode` / `decode` / `migrate` at the 2035 preseason matched the history signature. Championships stayed 0.

## Planted 2026 KC title

Same `presentFranchiseHistory`, no season simulated. One history row: champion KC, runner-up PHX, KC 15-2, MVP and passing leader on a KC quarterback with a 2026 line of 17 games. `userTeamId` starts at KC, then is set to BAL, then to SF. The history JSON does not change.

| Chair | Championships | Title cell | Record | Awards | Leaders | Timeline |
|---|---|---|---|---|---|---|
| KC | 1 | Champion pill | 15-2, 1st in AFC West | MVP | Passing yards | Won the championship · 15-2 · 1st in AFC West · MVP · passing leader |
| BAL | 0 | KC | 6-11, 1st in NFC East | — | — | 6-11 · 1st in NFC East |
| SF | 0 | KC | 4-13, 2nd in NFC West | — | — | 4-13 · 2nd in NFC West |

That is the playtest's 2026 row after the chair left KC. The abbreviation KC is still in the Title cell. The championship, the 15-2, the award, and the leader are not.

## Playtest seasons and fields

Applied to the report's own season table. This is the mechanism above, not a dump of the 1029 save.

At the 2055 Season Review, chair SF, before Continue:

- **2055, whole row.** Not in `state.history`. Champion CLE is already on `state.playoffs`. Record, finish, awards, leaders, and the title are all absent. This is the gap against `/records` "through 2055".
- **2026.** Stored champion should still be KC. The page shows SF's 2026 record and finish. The Champion pill, the Championships count, and "Won the championship" are gone. Awards and leaders for KC's players are hidden. The Title cell should still show KC's mark, on SF's record.
- **2027 and 2028.** KC's records (8-9, 5-12) are replaced by SF's. Those years' champions were DEN and ATL, so the Title cell was already another club's mark. The lost fields are record and finish, plus any KC leader.
- **2029–2049.** BAL's records are replaced by SF's. **2035 and 2036** lose the Runner-up pill (lost the championship to HOU, then LV). The Title cells show HOU and LV. Any BAL award or leader from those 21 seasons goes blank.
- **2050–2054.** These years are SF, so the record, the finish, and the **2053 Champion pill** stay. Awards stay "—" unless an SF player's id is the archived winner. The playtest saw no such award. Leaders stay "—" except a year an SF player led one of the four categories.

No season in the seed-42 archive was missing its champion id. The playtest's missing championships are the unarchived current year and the pills from clubs the GM no longer holds.

## Proposed fix

**UNSIGNED.** Not implemented in this PR.

1. In `recordSeasonHistory`, store `gmTeamId: state.userTeamId` on the new row. That is the club the year was played under, and it is still `userTeamId` when `runRecap` archives the year, including the year a firing is about to open.

2. In `presentYear`, use `h.gmTeamId` when it is present for the record, the finish, the Champion pill, the Runner-up pill, and the Championships count. Awards and leaders: render every non-null id on the row, with the winner's name and the club on his season line. Do not require `playedFor` against the chair held today. A dash remains only when the archived id is null or the player body is gone. The column subtitle already says the figures come from that year's history row.

3. Rows already on disk have no `gmTeamId`. Do not infer one from `gmHiredSeason`. For those rows, keep today's current-club record and pills, and still show the league awards and leaders from the ids that are stored. The 1029 career's 2026 15-2 will not come back from this change alone. The fire and hire milestones are still in the log if a later, separate backfill is wanted. This proposal does not include it.

4. While `phase === "offseason-recap"` and `history` has no row for `state.season`, show one pending year. `presentSeasonReview` already derives awards without writing when that is the case (`lib/view/seasonReview.ts` 284–290). The champion is `state.playoffs.championId`. Do not call `recordSeasonHistory` for that pending row. That function stamps `careerAwards` and must keep running once, on Continue.

Out of scope unless the same change is wanted there: the Records → Franchise tab, which retargets the same way. The one-line `teamId` overwrite on a traded player's season stat line is a separate hole in club attribution, not the reason the column is blank.
