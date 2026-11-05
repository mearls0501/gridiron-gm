# League records blow past the NFL marks — playtest 1029

**UNSIGNED.** Finding only. This note does not change the sim, a test, `docs/baselines.json`, or a guard. Matt signs any fix. No re-lock, no dial retune. Calibration freeze stands.

Source: the 30-season production playtest (`GM Playtest career30 1029`, production `main` `8747e25`, report section 2 and section 4, minor m1) and a headless 30-season run of the same stat path on seed 42. `lib/core/sim/game.ts`, `lib/core/season/stats.ts`, and `lib/core/season/records.ts` are unchanged since `8747e25`. The seed-42 run is `newGame({ seed: 42 })` advanced 2026–2055. The user club is unmanaged, the same bias `scripts/drift.ts` already documents. Boxes were summed at the end of each regular season, before `state.games` is cleared.

## Cause

The absurd marks are the play engine handing one player too large a share of a real game. Season lines are the sum of those regular-season boxes. The record book stores that sum, and the single-game list stores the box.

League overall does not inflate. The mean yearly receiving leader is already on the traced NFL mean. The spread of that leader is about twice the traced spread, so a 30-year maximum lands hundreds of yards past Calvin Johnson. A single regular-season week inside that season is 27 catches and 347 yards. Tackles are the same shape on defense: one player is credited with the whole stop, and a hot week is 39 tackles.

## Outliers

NFL single-season marks below are the ones the playtest used (Manning 5,477 / 55, Dickerson 2,105, L.T. 28, C. Johnson 1,964, M. Thomas 149, Moss 23, Strahan/Watt 22.5, Lane 14). Tackle totals have no official NFL record; the playtest's own next-best of 201, and a modern combined-tackle leader around 180, are the comparison. Akers's 44 field goals (2011) is the season kicking mark. Single-game marks are the playtest's (554, 7, 296, 6, 336, 21, 5, 7, 4, 8).

### Production save, through 2055

| Scope | Mark | Holder | NFL | |
|---|---|---|---|---|
| Season | 2,461 rec yds | Emmett Hill, PHX, 2055 | 1,964 | over |
| Season | 191 receptions | Emmett Hill, PHX, 2055 | 149 | over |
| Season | 273 tackles | Vince Thompson, MEM, 2052 | — | over; next best in that save was 201 |
| Season | 5,186 pass yds | Lucas Perez II, GB, 2043 | 5,477 | under |
| Season | 1,790 rush yds | William Nguyen, CHI, 2032 | 2,105 | under |
| Season | 22 rec TD | Hawthorne, CIN, 2029 | 23 | under |
| Season | 22 sacks | two players, 2052–53 | 22.5 | on the mark |
| Game | 24 receptions | Deion Nguyen, DEN, 2047 Wk13 | 21 | over |
| Game | 32 tackles | Vince Thompson, MEM, 2052 Wk11 | — | over |
| Game | 309 rec yds | Rowan Garcia, NYS, 2052 Wk4 | 336 | under |
| Game | 9/9 FG | Keegan Martin, KC, 2036 | 8 | one over |
| Game | 67-yard FG | DeShawn Thompson, ATL, 2028 | 66 | one over |

Other 2,000-yard receiving seasons in that save: 2,211 (2028), 2,147 (2042), 2,063 (2044), 2,093 (2047), 2,058 (2054), 2,461 (2055). Career leaders in the same save sit under the real all-time marks (passing about half of Brady, receiving yards 77% of Rice).

### Seed 42, 2026–2055, regular season

Every row below matched the sum of that player's regular-season box scores. `seasonRecords()` returns the same numbers. Games played is the box count.

| Mark | Holder | GP | NFL | |
|---|---|---|---|---|
| 2,404 rec yds / 179 rec / 206 tgt | Isiah Zeller Jr., WR, LV, 2044 | 17 | 1,964 / 149 | over / over |
| 2,288 / 170 / 229 tgt | Finn Sinclair, WR, JAX, 2049 | 17 | 1,964 / 149 | over / over |
| 2,144 / 161 / 195 tgt | Sean Ulrich, WR, NYS, 2047 | 17 | 1,964 / 149 | over / over |
| 2,089 / 165 / 206 tgt | Vince Osgood, WR, TB, 2040 | 17 | 1,964 / 149 | over / over |
| 1,995 / 153 / 200 tgt | Lucas King II, WR, DEN, 2053 | 17 | 1,964 / 149 | over / over |
| 1,963 / 162 / 201 tgt | Nathan Rodriguez, WR, ATL, 2052 | 17 | 1,964 / 149 | under / over |
| 215 tackles | Kyle Flores, EDGE, PIT, 2043 | 14 | — | 39 in one game |
| 212 tackles | Kyle Flores, EDGE, PIT, 2044 | 14 | — | |
| 26 sacks | Kion Anderson, EDGE, CAR, 2049 | 14 | 22.5 | over |
| 24 sacks | Finn Nelson, EDGE, SEA, 2055 | 17 | 22.5 | over |
| 45 FG | Ira Taylor, SF, 2026; Derrick Clark Jr., HAR, 2030 | 17 | 44 | one over |
| 5,245 pass yds | Diego Boseman, QB, HAR, 2026 | 17 | 5,477 | under |
| 1,633 rush yds | Miguel Thomas, RB, DEN, 2027 | 17 | 2,105 | under |
| 22 rec TD | Zeller, 2044; Isiah Lee III, NO, 2053 | 17 | 23 | under |
| 9 INT | two players | 17 | 14 | under |
| 44 pass TD | Tevin Sanchez, TB, 2054 | 17 | 55 | under |

Single games, regular season, from the boxes:

| Mark | Holder | Game shape | NFL |
|---|---|---|---|
| 27 rec, 334 yds | Zeller, LV, 2044 Wk13 | 33 targets, team threw 45, not overtime | 21 rec |
| 23 rec, 347 yds | Zeller, LV, 2044 Wk9 | 26 targets, team threw 54, not overtime | 21 rec / 336 yds |
| 25 rec, 276 yds | Lucas King II, DEN, 2055 Wk14 | 31 targets, team threw 48 | 21 rec |
| 39 tackles | Flores, PIT, 2043 Wk15 | 65 team tackles, 71 opponent plays | — |
| 532 pass yds | two games | under 554 | 554 |
| 289 rush yds | Rashad Voss, SD, 2027 Wk14 | under 296 | 296 |
| 7 sacks | Tevin Flores, BUF, 2044 Wk11 | on the mark | 7 |
| 67-yard FG | Trey Anderson II, 2027 Wk4 | one yard over | 66 |

The record book's single-game passing lead is 548 by Elias Kendrick, 2047 week 20. Week 20 is a playoff game. It is in `state.records` and it is not in any season line. 548 is still under 554.

Career leaders at the end of seed 42, regular-season lines only: passing 49,865, rushing 13,384, receiving 16,224, sacks 180, games 270. Same shape as the production save. Careers end before the all-time marks. The single season does not.

## Accounting, on all 16,320 team-games

30 seasons × 32 clubs × 17 games. A team-game failed a check only if the box disagreed with itself or with the season line.

| Check | Result |
|---|---|
| Sum of receiving yards vs team pass yards + sack yards | 0 |
| Sum of quarterback pass yards vs sum of receiving yards | 0 |
| Pass attempts vs targets | 0 |
| A player listed twice in one box | 0 |
| Team tackles above the opponent's play count | 0 |
| Season line vs the sum of that player's regular-season boxes | 0 |
| A club playing a number other than 17 | 0 |
| Season line changed after the playoffs were played | 0 of 30 |

`applyGameStats` returns before it folds a box when `playoffRound !== null` (`lib/core/season/stats.ts` 112–119). Playoff snaps are stored on `postseasonUsage` and are not added to the season line. Preseason games never enter `state.games` (`lib/core/preseason.ts` 13–15); they fold into camp lines that are deleted at kickoff. Zeller's 2,404 is seventeen regulation weeks. The 347-yard week is a 54-attempt game with no overtime.

142 player-seasons had more than 17 regular-season appearances. Each of those lines still matched that player's boxes, no club played more than 17, and no box listed anyone twice. The calendar is 18 weeks with one bye per club, so a player who changes clubs can play the week each of his clubs is off and finish on 18. None of the record rows above are in that set. Zeller played 17. Flores played 14 and still made 215 tackles.

Active-roster overall on seed 42 moved 67.68 (2026) to 65.53 (2055), correlation with year −0.91. Age stayed about 26. This is the same stability the playtest measured (about 26 years, 65–67 overall). The records are not a league getting better.

## The boxes

### Isiah Zeller Jr., LV, 2044 — 2,404 yards, 179 catches

WR, age 26, overall 95, Timing and Rhythm. Routes 98, hands 91, speed 99. The season line equals the boxes: 17 games, 17 starts, 206 targets, 179 catches, 2,404 yards, 13.43 yards per catch, 11.67 yards per target. Las Vegas threw 541 times and gained 4,631 receiving yards in his games. He caught 38.1% of the attempts and 51.9% of the yards.

| Wk | Opp | Rec/Tgt | Yds | Team att | Team rec yds |
|---|---|---|---|---|---|
| 1 | KC | 2/2 | 20 | 28 | 223 |
| 3 | CLE | 2/4 | 39 | 27 | 286 |
| 4 | CIN | 4/5 | 45 | 38 | 262 |
| 5 | SD | 10/12 | 137 | 28 | 221 |
| 6 | KC | 9/9 | 112 | 35 | 266 |
| 7 | WAS | 11/12 | 226 | 32 | 330 |
| 8 | DEN | 14/16 | 171 | 24 | 190 |
| 9 | MEM | 23/26 | 347 | 54 | 516 |
| 10 | SD | 10/12 | 99 | 27 | 237 |
| 11 | CMB | 12/13 | 160 | 25 | 242 |
| 12 | BAL | 9/10 | 75 | 26 | 161 |
| 13 | DEN | 27/33 | 334 | 45 | 429 |
| 14 | PHI | 8/8 | 142 | 30 | 242 |
| 15 | HOU | 7/8 | 108 | 28 | 291 |
| 16 | NYS | 13/15 | 125 | 43 | 313 |
| 17 | PIT | 4/5 | 53 | 29 | 174 |
| 18 | NSH | 14/16 | 211 | 22 | 248 |

Week 9 and week 13 are ordinary attempt totals (54 and 45). Week 13 is 33 of 45 attempts, 78% of the team's receiving yards, no overtime. The season record is those weeks added up. Halving it does not produce a normal season: 2,404 on 206 targets is 11.67 yards per target, and 206 is already a target total.

### Finn Sinclair, JAX, 2049 — 2,288 yards on a run identity

WR, age 26, overall 86, Downhill Run. 17 starts, 229 targets, 170 catches, 9.99 yards per target, 38.7% of Jacksonville's 591 attempts, 48.2% of the receiving yards. Yards per target sit on the traced #1 rate of 9.82 (`docs/nfl-reference.md` §5.7). The yards record here is the target count. Scheme is not required. His biggest week was 20 catches on 24 targets for 333 yards (week 12, 38 team attempts).

### Kyle Flores, PIT, 2043 — 215 tackles in 14 games

EDGE, age 27, overall 90, Two-Gap Front. Tackle 95, pursuit 94. 215 of Pittsburgh's 716 tackles in his games (30.0%), across 845 opponent plays. The season line equals the boxes.

| Wk | Opp | Tackles | Team tackles | Opp plays |
|---|---|---|---|---|
| 4 | CIN | 4 | 43 | 58 |
| 5 | CLE | 15 | 53 | 58 |
| 6 | BKN | 13 | 47 | 56 |
| 8 | DEN | 8 | 57 | 70 |
| 9 | CHI | 20 | 56 | 62 |
| 10 | CMB | 8 | 57 | 73 |
| 11 | CIN | 12 | 48 | 55 |
| 12 | BUF | 17 | 46 | 53 |
| 13 | LV | 17 | 56 | 66 |
| 14 | BOS | 15 | 46 | 55 |
| 15 | HAR | 39 | 65 | 71 |
| 16 | DET | 23 | 49 | 62 |
| 17 | CLE | 16 | 42 | 46 |
| 18 | MIN | 8 | 51 | 60 |

Week 15 is 39 of 65 tackles, 71 opponent plays, no overtime. Team tackles stayed under the opponent's play count in every team-game of the run, so the 39 is a share of real plays. The production 32-tackle game and the 273-tackle season are this draw on another seed. Seed 42's season max is 215; its game max is 39.

## Why the mean can be right and the record wrong

`docs/nfl-reference.md` §5.1 puts the yearly receiving leader at 1,743 ± 128. Seed 42's yearly leader averaged **1,735**, standard deviation **283**. Passing leaders averaged 4,635 against a traced #1 of 5,024. Rushing leaders averaged 1,346 against 1,704. Those two tails are thin, which is the accepted passing-record limitation in `AGENTS.md`. Receiving is the one leaderboard whose center is already on the NFL number and whose width is not.

| | 2026–35 | 2036–45 | 2046–55 |
|---|---|---|---|
| Mean overall | 67.13 | 65.91 | 65.61 |
| Mean receiving leader | 1,591 | 1,750 | 1,863 |
| Seasons with a 1,964-yard receiver | 0 | 2 | 3 |
| Seasons with a 1,900-yard receiver | 0 | 3 | 4 |
| Mean targets of the yards leader | 170 | 177 | 195 |
| Mean yard share of the yards leader | 38.4% | 39.3% | 41.4% |

Correlation of the receiving leader with year is +0.36. Correlation of his receptions with year is +0.46. Correlation of the tackle leader with year is −0.22. The far tail shows up more often later. It does not need the later years to exist: 2026 already produced a 1,891-yard leader on 179 targets and a 35.9% yard share, in a 67.7-overall league.

The current milestone table (`docs/milestone-reference.json`) counts one 1,900-yard receiver in four recent NFL seasons. Seed 42 had seven in thirty seasons, 0.23 per season against that 0.25. Clearing 1,900 is not the failure. Clearing 1,964 five times and 149 catches eight times is the failure, as is every one of the five biggest receiving games of the run (27, 25, 24, 23, and 22 catches). The old pooled note that 1,900-yard seasons were 2.25× too common used an earlier NFL rate of 0.05; the audited 2021–24 table does not.

A fifth of a team's stops is what the tackle weights were written to produce (`lib/core/sim/game.ts` 1300–1302). The yearly tackle leader's share of his team's tackles averaged 20.4%, and his total averaged 171. The record is the week that share jumps to 60%.

## Where the share comes from

Target choice multiplies three large factors, then the red-zone bonus, on every throw (`lib/core/sim/game.ts` 1416–1427):

```ts
const roleBonus = i === 0 ? 16 : i === 1 ? 11 : i === 2 ? 5 : 1;
const boost = o.script.targetBoost.get(p.id) ?? 1;
const rzBonus = yardLine >= 80 ? (i === 0 ? 37 : i === 1 ? 18 : i === 2 ? 5 : 0) : 0;
const matchup = clamp(1 + (sepOf(p) - covOf(p)) / 68, 0.40, 1.75);
return Math.max(1, (base - 30 + roleBonus + rzBonus) * boost * matchup);
```

`targetBoost` is drawn once a game, `normal(1, 0.36)` clamped to 0.28–2.1 for receivers and 0.30–2.3 for defenders (`game.ts` 335–342). The first receiver in the route list is the WR1. A week where the boost, the matchup, and the role bonus all point at him is week 13: 33 of 45 throws.

The same separation then lengthens the throw and raises the completion rate. `sepEdge` scales air yards (`game.ts` 1618), and `completionP` adds separation over coverage (`game.ts` 1463–1471). That is why Zeller's yard share (51.9%) is wider than his target share (38.1%), and why 206 targets became 11.67 yards per target against the traced #1 rate of 9.82. Sinclair, on an identity that does not emphasize receivers, still took 38.7% of the throws and stopped at 9.99 yards per target. Volume alone clears the record. The separation terms make the hot weeks hotter.

Traced comparison, not a new measurement of weekly shares: §5.7's receiving #1 averages 177 targets, and §5.3's team averages 564 attempts. That is about 31% of the throws for a typical league leader. Zeller took 38% for a whole season. The weekly ceiling is not in `nfl-reference.md`. It has to be traced before anyone locks a number.

Tackles are one credit per run, completion, or sack. The draw is `pow(skill, 1.52 or 1.54) * TACKLE_SHARE[pos] * targetBoost` (`game.ts` 1303–1309 and 1652–1656). There is no assist. EDGE `TACKLE_SHARE` is 1.00 and LB is 1.20 (`game.ts` 185–188). Flores at 95 tackle and 94 pursuit, with a boost that can reach 2.3, won 39 of 65 credits in a 71-play game.

A kept fumble credits the forcer and then the ordinary tackler also gets one (`game.ts` 1259–1266, then 1309). Across 16,320 team-games the defense's tackle total never exceeded the opponent's plays, so those extra credits sit inside the incompletions and are not the 215. They are still two credits for one play.

Sacks use the same defender boost. Anderson's 26 in 14 games is that tail. The production save happened to stop at 22, which looks like the NFL mark and hid it. Seed 42 had four seasons of 23 or more, all in 2046–2055. The milestone table's 23+ count for 2021–24 is 0/0/0/0.

`/records` is doing what it was built to do. Single-game marks are inserted from the box as the game finishes (`lib/core/season/records.ts` 36–62) because old boxes are discarded. Season and career marks are read back off `player.stats` (`records.ts` 130–144). Those lines matched the boxes, and `seasonRecords()` matched the table above. The page is not the bug.

## Proposed fix — UNSIGNED

Do not move a league-mean dial. Do not edit `docs/baselines.json`. Do not retune pass bias, `armQuality`, or the neutral point of `sepEdge`. The yearly receiving leader is already at 1,735 against 1,743. A mean nudge would miss the weeks of 27 catches and would push the calibrated center off the NFL number.

1. Cap one player's share of a game's targets. Role bonus, the weekly boost, and the matchup currently multiply, and the red-zone bonus is inside that product. The cap should come from the nflverse weekly target-share distribution, written into `docs/nfl-reference.md` with the dataset and the URL, before any guard is locked. The weekly boost can stay as a small tilt under that cap. Seventeen capped weeks cannot sum to 2,404, and a 45-attempt game cannot contain 33 targets for one man.
2. Cap one player's share of a game's tackles, or split the credit so the draw is not winner-take-all. The 2.3 boost on top of a 1.54 power is the 39-tackle week. The same cap pulls the 26-sack seasons, which ride the same defender boost.
3. On a kept fumble, credit one tackle. The second credit did not create the season record in this run. It is the one place a single play writes two.
4. Re-measure, and stop there. The number that is wrong is the standard deviation of the yearly receiving leader (283 against the traced ±128), the count of seasons past 1,964, the count of games past 21 receptions, and the single-game tackle maximum. Leave `baselines.json` unchanged until that measurement is signed. The 1,900-yard milestone rate is not the thing to chase.

No code in this note. Calibration freeze stands.
