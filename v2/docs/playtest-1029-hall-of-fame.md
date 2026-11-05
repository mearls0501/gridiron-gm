# Hall of Fame classes are a filled cap — playtest 1029

**UNSIGNED.** This note is the finding and a proposed rule. It does not change `lib/core/hallOfFame.ts`, `lib/core/outcomes.ts`, `lib/core/hofInduction.test.ts`, `scripts/careers.ts`, or `docs/baselines.json`. No re-lock, no dial retune. Matt signs any constant before it moves. `nfl-reference.md` §4 is the place a signed number has to land first (invariant 7). The kicker and punter rate below is not in that file today.

Source: 30-season playtest on production `main` `8747e25` (same induction code as `ddc62bd`), save `GM Playtest career30 1029`, report section 3. The league Hall showed **154 inductees in 21 classes (2034–2054)**, then **8 every year from 2038 through 2054**, with **7 kickers and 7 punters**. The 2055 class is written when Season Review is continued, and that save stopped on the review.

The same induction functions were measured here on a headless 30-season league, `newGame({ seed: 42 })`, seasons 2026–2055, every offseason continued through the 2055 class. That run is `0679a1a`. `#216` (`81bb316`) changes the franchise-history presenter only. `runHofInduction`, the bars, and the score are the same text. Nothing was run on the Mac Studio.

## What the two runs did

| | Playtest save | Seed 42, headless |
|---|---:|---:|
| Seasons played | 2026–2055, stopped on the 2055 review | 2026–2055, 2055 class included |
| Classes | 21 (2034–2054) | 22 (2034–2055) |
| Inductees | 154 | 164 (156 through 2054) |
| Mean per class that had anyone | 7.33 | 7.45 |
| Years at the cap of 8 | 17 (2038–2054) | 19 (2037–2055) |
| K + P | 14 (7 and 7), 9.1% | 15 (6 and 9), 9.1% |
| QB | 9 (5.8%) | 10 (6.1%) |

Seed 42 through 2054 is 156 inductees. The playtest's 154 is the same rule on another league, with a human GM. The shape matches: a short ramp, then a full class of 8 every year, and specialists at about 9% of the busts.

`careers.hofInducteesPerClass` (`hallOfFame.ts` 607–614) averages only the seasons that inducted someone. On seed 42 that average is **7.45**, which sits inside the 5–8 band written in `nfl-reference.md` §4. The nineteen mature classes are **8.00**. The 2, the 5, and the 5 in 2034–2036 pull the mean down. A 24-season careers run has been reading about 7.1–7.3 for the same reason (HANDOFF, Wave 3.9). The metric cannot see a cap that is binding, and it cannot see position.

## How a class is chosen

League induction is `runHofInduction` (`hallOfFame.ts` 582–605), called from `runRecap` before the calendar rolls. One class per season. The wait is five seasons after `retiredSeason` (`HOF_WAIT_SEASONS`, line 39). That wait matches the published rule. Everything after it is local.

A retired player is a candidate when both gates pass (`isLeagueHofCandidate`, 506–517):

1. **Franchise gate** (`isHofEligible`, 277–283). Four seasons with one club (`MIN_FRANCHISE_SEASONS`), and at least one of: MVP / OPOY / DPOY with that club, a championship with that club, a league lead in pass yards / rush yards / rec yards / sacks with that club, or eight seasons with that club (`LONGEVITY_SEASONS`). ROY does not count. Eight seasons alone opens this gate. Longevity adds nothing to the score below.
2. **League bar** (`meetsLeagueHofBar`, 492–498). Any one of:
   - `starSeasons >= 3` (`HOF_STAR_BAR`)
   - `eliteSeasons >= 1` (`HOF_ELITE_BAR`)
   - one championship as a starter (`championshipsAsStarter`, 481–490): `gamesStarted >= 9` on the title club that year (`STARTER_GAMES` in `outcomes.ts`)

The class is a sort, then a slice (`hallOfFame.ts` 586–590):

```
eligible.sort(compareHofCandidates)
eligible.slice(0, HOF_CLASS_MAX)   // HOF_CLASS_MAX = 8
```

There is no score floor, no finalist list, and no 80% vote. If ten players clear the bar, eight go in. If two hundred clear it, eight go in.

The score (`leagueHofScore`, 529–536) is:

```
eliteSeasons * 100 + starSeasons * 10 + starterRings * 30 + bestFranchiseReasonWeight
```

Reason weight (`reasonWeight`, 285–293) is 3 per championship, 2 per MVP/OPOY/DPOY, 1 per counted league lead, on the best club. Longevity is 0. Ties break on starter rings, then career length, then last name, then player id (`compareHofCandidates`, 538–546).

**There is no position weight.** K and P use the same formula as quarterbacks. The only position-shaped input is which seasons count as star or elite, and that input is an overall-rating rank, not production.

## Where the star and elite labels come from

`tickHofCareerLabels` (`hallOfFame.ts` 554–565) runs in the same recap, before aging, and copies `snapshot` from `outcomes.ts`. The comment in that file says the labels are overall rating on purpose, because a 17-game stat line is noisy (`outcomes.ts` 25–29).

```
starRank(pos)  = max(4, round(STARTERS[pos] * 32 * 0.15))
eliteRank(pos) = max(1, round(STARTERS[pos] * 32 * 0.05))
```

A player with snaps that season, still active, is a star when his overall ranks inside `starRank` at his position, and elite when it ranks inside `eliteRank` (`outcomes.ts` 47–53 and 163–166). The floor of 4 does not bind for any current position. The slots the formula actually mints each year:

| Pos | Starter jobs | Star slots | Elite slots |
|---|---:|---:|---:|
| QB, RB, TE, C, K, P | 1 | 5 | 2 |
| OT, OG, EDGE, DT, LB, S | 2 | 10 | 3 |
| WR, CB | 3 | 14 | 5 |

Kickers and punters are one job per club (`STARTERS` in `types.ts`). The formula still names **five star kickers and two elite kickers every year**, and the same for punters, out of the men who took a snap. A kicker gets those snaps on field goals and extra points. A punter gets them on punts. Both are in the opening lineup, so `gamesStarted` counts (`sim/game.ts` openers, and the snap increments on the kick and punt plays). A specialist who plays the year is a starter for the ring test. `gamesStarted >= 9` is the ordinary season, not a bar he has to clear.

Real Pro Bowl rosters are about two kickers and two punters, one per conference. Real first-team All-Pro is one of each. The 15% / 5% rates were written for positions where a Pro Bowl is about 15% of the starter jobs (`outcomes.ts` 38–46). On a one-deep position, 15% is five labels and 5% is two.

Those labels are also the careers harness. Moving `starRank` / `eliteRank` would move draft calibration. The Hall is reading a Pro Bowl stand-in as a Hall vote.

The franchise gate does not ask for a kicking lead. The counted leaderboards are pass, rush, rec, and sacks. A specialist's franchise path is eight seasons with one club, or four seasons plus a ring. Eight years in one building is a normal specialist career. One ring while he is the opener is enough for the league bar even when `starSeasons` and `eliteSeasons` are both 0.

## Why the cap fills, and then never empties

Seed 42, eligible players waiting at the recap, and the class that recap wrote. "Margin" is the score of the last player who got in. "Next" is the best player who waited. A gap of 0 means the cut fell between two equal scores and the last-name / id tie-break decided the bust.

| Year | Eligible | Class | Left out | Margin | Next | Gap | K+P in |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 2026–2033 | 0 | 0 | 0 | — | — | — | 0 |
| 2034 | 2 | 2 | 0 | 36 | — | — | 0 |
| 2035 | 5 | 5 | 0 | 33 | — | — | 0 |
| 2036 | 5 | 5 | 0 | 33 | — | — | 0 |
| 2037 | 10 | 8 | 2 | 33 | 33 | 0 | 1 |
| 2038 | 12 | 8 | 4 | 33 | 33 | 0 | 0 |
| 2039 | 13 | 8 | 5 | 33 | 33 | 0 | 0 |
| 2040 | 26 | 8 | 18 | 471 | 370 | 101 | 0 |
| 2041 | 40 | 8 | 32 | 150 | 106 | 44 | 3 |
| 2042 | 58 | 8 | 50 | 103 | 103 | 0 | 2 |
| 2043 | 74 | 8 | 66 | 93 | 93 | 0 | 2 |
| 2044 | 97 | 8 | 89 | 270 | 270 | 0 | 0 |
| 2045 | 116 | 8 | 108 | 233 | 123 | 110 | 1 |
| 2046 | 124 | 8 | 116 | 123 | 116 | 7 | 1 |
| 2047 | 142 | 8 | 134 | 100 | 93 | 7 | 0 |
| 2048 | 154 | 8 | 146 | 93 | 93 | 0 | 2 |
| 2049 | 169 | 8 | 161 | 90 | 86 | 4 | 0 |
| 2050 | 187 | 8 | 179 | 86 | 83 | 3 | 1 |
| 2051 | 193 | 8 | 185 | 83 | 83 | 0 | 1 |
| 2052 | 208 | 8 | 200 | 83 | 81 | 2 | 0 |
| 2053 | 224 | 8 | 216 | 133 | 116 | 17 | 0 |
| 2054 | 236 | 8 | 228 | 96 | 81 | 15 | 1 |
| 2055 | 246 | 8 | 238 | 80 | 80 | 0 | 0 |

The first year anyone can clear a five-year wait on a career that started in 2026 is 2034. That class is two players. Their tier is a starter ring: one ring is `30` on the score and one champion reason is `3`, which is **33**. The 2035 and 2036 classes end at 33. The playtest's 2034 class was the same shape, two short careers (Xavier Harris and Preston Pemberton, spans shown as 2026–2029).

From 2037 the eligible list is longer than 8, and it stays longer. It grows from 10 to **246** by the 2055 recap. Eight leave each year. More than eight arrive. After the 2055 class, **238** qualified players are still waiting. Nine of the nineteen full classes cut between equal scores, including 2037–2039, where both sides of the cut score 33. The bust in those years is a tie-break among one-ring starters.

2040 is the original generation coming off the wait. The margin jumps to 471, then the queue of ordinary qualifiers stretches and the margin falls back to **80** in 2055, with 238 players behind that line. Eighty is the neighborhood of eight star seasons, or five star seasons plus one ring. The Hall is still taking that tier in year 30.

Paths of the 164 inductees, from the labels on the player at induction:

| Path | Inductees | Share |
|---|---:|---:|
| Elite and 3+ star seasons, no starter ring | 57 | 35% |
| Elite, 3+ star seasons, and a starter ring | 48 | 29% |
| 3+ star seasons and a starter ring, no elite season | 26 | 16% |
| Starter ring only | 28 | 17% |
| 3+ star seasons only | 5 | 3% |

**28 of 164 got in on a starter ring and nothing else.** The league bar treats that ring as sufficient, and the early classes show the score of that path is 33, which was enough to fill the cap. One elite season did not appear as a path by itself among the inducted. Elite is a subset of the star rank (top 2 is inside top 5), so a player who was elite once was a star that year. The players who actually got busts had already banked three star seasons, or a ring, by the time the wait ended. The bar still allows the single elite season. `hofInduction.test.ts` asserts that one elite season inducts, and that twelve planted candidates yield a class of 8 and a leftover class of 4.

## Kickers and punters

Seed 42 inducted **6 kickers and 9 punters**. Fifteen of 164 is 9.1%, the same share as the playtest's 14 of 154. Ten of the twenty-two classes contain at least one. The class of 2041 contains three.

They clear the gates the same way everyone else does. Among retired players at the end of the run:

| | Played | Retired | 3+ star years | 1+ elite year | Starter ring | Any league bar | Full candidate | Inducted |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| K | 180 | 146 | 17 | 11 | 21 | 34 | 14 | 6 |
| P | 232 | 188 | 19 | 9 | 23 | 34 | 18 | 9 |
| QB | 520 | 424 | 20 | 12 | 20 | 30 | 27 | 10 |

"Full candidate" is the franchise gate plus the league bar. It does not include the five-year wait, so some of the non-inducted candidates are still inside the wait and the rest are in the queue of 238. The bar has already named **14 kickers and 18 punters**. Fifteen of those thirty-two have busts. Quarterbacks who clear the same bar are 27 retired candidates and 10 busts. The Hall has more punters than quarterbacks.

`POSITION_TARGET` carries two punters and one kicker, so more punter bodies exist (232 played against 180 kickers). The star and elite slots are still five and two per year for each position. The extra punters are supply. The bar is the same.

The fifteen, with the score the sort used:

| Year | Pos | Player | Stars | Elites | Rings | Path | Score | Franchise reasons |
|---:|---|---|---:|---:|---:|---|---:|---|
| 2037 | P | Evan Wright | 4 | 0 | 2 | stars + ring | 106 | champion |
| 2041 | P | Jaylen Gonzalez | 8 | 7 | 0 | elite + stars | 780 | longevity |
| 2041 | K | Blake Jones | 7 | 3 | 0 | elite + stars | 370 | longevity |
| 2041 | K | Wyatt Wilson | 5 | 1 | 0 | elite + stars | 150 | longevity |
| 2042 | P | Michael Yeager | 9 | 5 | 1 | elite + stars + ring | 623 | champion, longevity |
| 2042 | K | Darnell Carter | 1 | 0 | 3 | ring | 106 | champion |
| 2043 | K | Andre Rivera | 5 | 0 | 2 | stars + ring | 116 | champion, longevity |
| 2043 | P | Quinn Prescott | 6 | 0 | 1 | stars + ring | 93 | champion |
| 2045 | P | Carlos Sanchez | 8 | 4 | 0 | elite + stars | 480 | longevity |
| 2046 | P | Jalen Radcliffe Jr. | 7 | 6 | 0 | elite + stars | 670 | longevity |
| 2048 | P | Rashad Kirkland II | 6 | 5 | 1 | elite + stars + ring | 596 | champion, longevity |
| 2048 | P | Brandon Okafor Jr. | 8 | 3 | 0 | elite + stars | 380 | longevity |
| 2050 | K | Demarcus Fitzgibbon | 7 | 3 | 0 | elite + stars | 370 | longevity |
| 2051 | K | Diego Nguyen | 5 | 0 | 1 | stars + ring | 83 | champion |
| 2054 | P | Rashad Kendrick | 0 | 0 | 3 | ring | 96 | champion |

Two of those paths are enough to explain the 9%.

Jaylen Gonzalez scores **780**: seven elite seasons times 100, plus eight star seasons times 10. No ring. The franchise reason is longevity, which adds 0. He was a top-2 punter by overall rating for seven seasons, in a position that mints two elite labels a year. That score ranks him ahead of a quarterback with five elite seasons. Rashad Kirkland II (596), Jalen Radcliffe Jr. (670), and Michael Yeager (623) are the same machine. The class of 2041 spent three of its eight seats on specialists because this term has no position coefficient.

Rashad Kendrick scores **96** with **0 star seasons and 0 elite seasons**. Three starter rings. Darnell Carter has one star season, which is short of the star bar, and three rings. The ring-only bar is how a punter who never ranked in the top five by overall still gets a bust. Diego Nguyen is the ordinary mixed case: five star seasons, one ring, score 83, inducted in 2051 while 185 qualified players waited.

## What the published Hall actually does

`nfl-reference.md` §4 already has the class-size sources, added with Wave 3.9 Packet 3. It does not have a kicker or punter induction rate. The kicker block later in that section is average-per-year only.

The Athletic, 6 Feb 2025, as cited there: modern-era player classes sat at the **maximum of 5** for 17 consecutive years. Over the forty years before that, the modern-era average was **4.1**. Total enshrinement, counting seniors, coaches, and contributors, averaged **about 7.8 a year since 2015**, excluding the 20-member 2020 Centennial class. The same article is why `HOF_CLASS_MAX` is 8. The comment on lines 40–44 says the modern-era player max has been 5, the combined ceremony runs about 5–8, and the sim inducts players only, at most eight. The 5–8 band is then what `careers.hofInducteesPerClass` is aimed at. That aim uses the combined ceremony as the players-only ceiling, and the slice above turns the ceiling into the class.

The Hall's own Class of 2025 release elected four modern-era players (Eric Allen, Jared Allen, Antonio Gates, Sterling Sharpe) and put membership at 382. That cycle's modern-era pool was cut from 167 nominees to 50, to 25 semifinalists, to 15 finalists, then to 10, then to 7. Selectors could vote for five of the seven. Each inductee needed 80%. The bylaws for that cycle allowed a modern-era class of 3 to 5. The selection-process page, read for this note, says the current bylaws elect **between 3 and 7 new members a year**, still at 80%, and that a player must be retired five seasons, have played five seasons, and have at least one postseason honor. The class of 2027 ballot described there is 13 players, one coach, and one contributor.

The five-season wait in the sim is that rule. The rest of the selector is not. The sim has no seniors, no coaches, and no contributors, so a players-only class of 8 is the combined ceremony with the 80% cut and the finalist reduction taken out.

Specialists, from the Pro-Football-Reference player table fetched for this note (323 player rows, Class of 2024 at the top of that scrape):

| Player | Tag on that table | Class |
|---|---|---|
| Jan Stenerud | K | 1991 |
| Ray Guy | P | 2014 |
| Morten Andersen | K | 2017 |
| George Blanda | QB | 1981 |
| Lou Groza | T | 1974 |

Three of 323 are tagged K or P. Blanda and Groza kicked and played another position, and the table tags the other position. Sporting News and Yahoo, August 2026, report Adam Vinatieri as a Class of 2026 placekicker and still name Guy as the only punter. Counting that report, exclusive specialists are three placekickers and one punter across the Canton era. That is on the order of one specialist every 15 to 20 classes. Seed 42 inducted 15 specialists in 22 classes.

The playtest's own comparison is the right one for the rate. A real modern-era class of about 4 or 5 is taken from a century of history. This league inducted **164 players across 30 seasons**, 5.5 per season the league has existed, and from 2037 onward it inducted 8 per season out of a queue that was still growing in year 30.

## Proposed fix — UNSIGNED

Matt has not signed this. The numbers are a proposal so a later change has a target. They are not a traced rate, and they do not belong in `baselines.json` until §4 says so.

Keep the five-season wait. Keep the sort. Keep star and elite labels in `outcomes.ts` where the careers harness reads them.

**1. The cap stays a cap.** `runHofInduction` may leave seats empty. A class of two stays a class of two. The test in `hofInduction.test.ts` that plants twelve candidates and expects 8 then 4 is the current rule working. It changes when this rule changes. Not in this note.

**2. The player maximum is 5.** `HOF_CLASS_MAX` moves from 8 to 5 because this sim inducts players only. The ~7.8 figure is the ceremony that also enshrines seniors, coaches, and contributors. Before that constant is locked, split the §4 bullet into those two series: modern-era players, maximum 5, with the Class of 2025 at 4; full ceremony, about 7.8 since 2015 excluding the Centennial class. `careers.hofInducteesPerClass` stays report-only. On this run it would still have read 7.45 under the old cap, which is why a mean inside 5–8 is not a clean class.

**3. The league bar moves off a single Pro Bowl stand-in and off a single ring.** Unsigned replacement for `meetsLeagueHofBar`, using counts the save already stores:

- `eliteSeasons >= 3`, or
- `starSeasons >= 8` and `eliteSeasons >= 1`

A starter ring stays in the score and in the tie-break. It stops being a way in by itself. On this run that path is 28 of 164, including Rashad Kendrick (P, 0 and 0, three rings, class of 2054). Three star seasons alone are 5 of 164, and three star seasons plus a ring are another 26. One elite season is the ordinary way a specialist scores 100 points for a single top-2 overall year.

**4. Kickers and punters leave the ordinary ballot.** Unsigned specialist rule, Hall only:

- K and P do not clear `meetsLeagueHofBar` on the ordinary counts.
- A specialist candidate needs `eliteSeasons >= 8` and eight seasons with one club.
- At most one specialist in a class, and only inside the five seats.

On this run the highest specialist elite count among the inducted is 7 (Jaylen Gonzalez). A bar of 8 would have inducted none of the fifteen. The one-per-class cap is the backstop if the signed elite count is lower. The real rate to write into §4, with the table above and the Hall's own list, is about one exclusive specialist every 15 to 20 classes. A 30-year league under that rate usually inducts one, sometimes none, sometimes two. It does not induct fifteen.

The franchise ring (`franchiseHallOfFame`, `isHofEligible`) is a different list. The playtest's San Francisco ring of 16 is that presenter. This proposal does not tighten it. Clubs can still honor an eight-year player locally. The league class is the list that reached 154.

Position quotas for receiver and corner are not part of this proposal. Their star slots (14 and 5) are why seed 42 inducted 20 receivers and 15 corners, and the raised bar in step 3 is what cuts that volume. A per-position quota would be a second rule.

## What a signed change would touch, later

`HOF_CLASS_MAX`, `HOF_STAR_BAR`, `HOF_ELITE_BAR`, `meetsLeagueHofBar`, and the slice in `runHofInduction`. A specialist branch in `isLeagueHofCandidate`. The class-cap assertion in `hofInduction.test.ts`. A new paragraph in `nfl-reference.md` §4 for the specialist rate and the split between modern-era players and the full ceremony. No `baselines.json` row until that paragraph exists and Matt signs a guard. No change to `starRank` or `eliteRank`.
