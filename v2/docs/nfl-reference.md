# NFL reference — the numbers this game is calibrated against

Every figure here was computed from a primary dataset in this session, not
quoted from an article. The computation is reproducible: the source files and
the exact aggregation are named for each block. Where a number does not exist
in public data it says so and the game is left uncalibrated on that axis rather
than tuned toward an invention.

**Why this file exists.** Three targets in `scripts/careers.ts` and one in
`docs/baselines.json` were wrong by 2x–30x, and the sim had been tuned toward
them. A number with no provenance is worse than no number, because it
manufactures confidence. Nothing may be added to `baselines.json` that does not
trace back to a block in this file.

Locked 2026-07-29.

---

## Sources

| id | dataset | what it is |
|---|---|---|
| **T** | [nflverse/nfldata `trades.csv`](https://github.com/nflverse/nfldata) | every NFL trade 2002-03-04 → 2026-04-17, one row per asset, grouped by `trade_id`. 4,975 rows / 1,675 trades. |
| **D** | [nflverse `draft_picks`](https://github.com/nflverse/nflverse-data/releases/tag/draft_picks) | a direct scrape of Pro Football Reference draft tables, 1980–2026, with career AV, games, Pro Bowls, All-Pros and seasons-as-primary-starter per pick. |
| **S** | [nflverse `snap_counts`](https://github.com/nflverse/nflverse-data) | PFR snap counts 2013–2025, used for snap-share starter definitions. |
| **P** | [nflverse `players.csv`](https://github.com/nflverse/nflverse-data/releases/download/players/players.csv) | player metadata, used to attach positions and ages to traded players. |

**Validation.** The trade pipeline reproduces independently reported figures
exactly: 43 draft-weekend trades in 2023 (record), 40 in 2019, 4 first-round
trades in 2025, and the in-season series 8/11/13/19/15 for 2017/18/20/22/23.
The draft pipeline reproduces known PFR rows exactly (Brady 21 seasons started
/ 15 PB / 335 G; Ryan Leaf 25 G / 1 season started).

**A trap worth naming.** In dataset T, `pfr_id` and `pfr_name` are populated on
*pick* rows too — they name whoever was eventually drafted with that pick.
Counting rows with a `pfr_id` to get "players traded" overcounts by ~3x. The
correct rule is: **an asset is a pick if `pick_round` or `pick_season` is set,
otherwise it is a veteran player.**

---

## 1. Trades

### 1.1 Annual volume — source T, confidence HIGH

A "trade" is one `trade_id`. Assets are the rows under it.

| league year | trades | picks moved | veterans moved | assets |
|---|---|---|---|---|
| 2015 | 52 | 124 | 36 | 160 |
| 2016 | 50 | 127 | 29 | 156 |
| 2017 | 81 | 177 | 55 | 232 |
| 2018 | 93 | 214 | 66 | 280 |
| 2019 | 102 | 223 | 79 | 302 |
| 2020 | 71 | 158 | 53 | 211 |
| 2021 | 91 | 211 | 69 | 280 |
| 2022 | 93 | 235 | 68 | 303 |
| 2023 | 90 | 218 | 53 | 271 |
| 2024 | 86 | 203 | 62 | 265 |
| 2025 | 96 | 242 | 75 | 317 |

**Modern-era baseline: 90.2 trades per league year, sd 9.1, range 71–102**
(2018–2025). 2020 is the COVID outlier. There is a real regime change around
2017 — 2015–16 ran at ~50 — so do not pool the older years.

Per trade: **~3.2 assets, ~2.4 picks, ~0.75 veterans.** Most trades move no
veteran at all.

31–32 of 32 clubs trade at least once every year. Mean ~5.6 trades per club per
year; the busiest club makes 11–17.

### 1.2 When trades happen — source T, confidence HIGH on the draft window

Peak 3-day window (the draft) as a share of the year's trades:

| year | draft weekend | share of annual |
|---|---|---|
| 2021 | 28 | 31% |
| 2022 | 37 | 40% |
| 2023 | 43 | 48% |
| 2024 | 29 | 34% |
| 2025 | 35 | 36% |

Approximate full-year shape, pooled 2018–2025:

| window | share | trades/yr |
|---|---|---|
| new league year / March | ~17% | ~15 |
| pre-draft April | ~3% | ~3 |
| **draft weekend** | **~38%** | **~34** |
| post-draft → camp | ~7% | ~6 |
| final cutdowns (late Aug) | ~17% | ~16 |
| in-season → deadline | ~18% | ~16 |

Day 3 of the draft is consistently the busiest single day.

### 1.3 In-season trend — source T, confidence HIGH from 2017

| 2010 | 2011 | 2012 | 2013 | 2014 | 2015 | 2016 | 2017 |
|---|---|---|---|---|---|---|---|
| 8 | 3 | 2 | 6 | 1 | 6 | 5 | 8 |

| 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 |
|---|---|---|---|---|---|---|---|
| 11 | 18 | 13 | 13 | 19 | 15 | 18 | 21 |

2010–2017 mean **4.9**; 2018–2025 mean **16.0**. A 3.3x regime change. The
deadline also moved from after week 8 to **after week 9 effective 2024**.

### 1.3b Within-season timing — source T, confidence HIGH

Distinct in-season trades by NFL week, pooled 2018–2025 (n=128). Computed
from `trades.csv`: distinct `trade_id`s dated between each season's opener
(first Thursday after Labor Day) and the end of November, week =
`(trade_date − opener) // 7 + 1`.

| week | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| trades | 4 | 5 | 5 | 5 | 8 | 13 | 20 | 49 | 19 |
| share | 3.1% | 3.9% | 3.9% | 3.9% | 6.2% | 10.2% | 15.6% | 38.3% | 14.8% |

The week-8 spike is the deadline week for 2018–2023; the deadline moved to
after week 9 in 2024, so the pooled weeks 8–9 together (53%) are "deadline
week plus the week before." Expressed as distance from the deadline:
**~40% in the deadline week, ~18% the week before, ~10% two weeks out, and
a September floor of ~3–4% per week.** A real week 1 sees about half a
trade league-wide. `TRADE_WEEK_WEIGHTS` in `lib/core/season/engine.ts`
encodes this shape.

### 1.4 What actually moves — source T, confidence HIGH

Trade composition, 2018–2025 (n=722):

| shape | share |
|---|---|
| pick-for-pick | **36.6%** |
| player-for-pick | 32.1% |
| mixed bundles | 27.6% |
| **player-for-player** | **3.5%** |

Of 1,704 picks moved: 63.6% current-year, 36.4% future, 10.8% conditional.

**Round distribution of traded picks** — the opposite of the media narrative:

| R1 | R2 | R3 | R4 | R5 | R6 | R7 |
|---|---|---|---|---|---|---|
| 8.0% | 10.4% | 12.3% | 13.8% | 17.3% | 19.9% | 18.3% |

**Rounds 5–7 are 55% of every pick that changes hands. Round 1 is 8%.**

**What a traded veteran fetches** — best pick the selling club received, across
394 single-veteran trades:

| R1 | R2 | R3 | R4 | R5 | R6 | R7 |
|---|---|---|---|---|---|---|
| 4.8% | 5.6% | 9.1% | 9.4% | 16.2% | 31.7% | 22.1% |

**70% of traded veterans fetch a fifth-rounder or worse.** The median NFL
player trade is a scrap-heap move. This is probably the single most important
calibration fact in this file, and the one a sim is most likely to get wrong by
modelling trades as blockbusters.

**Position of traded veterans** (n=519, source T joined to P):

WR 17.0% · CB 12.7% · QB 10.4% · DE 8.3% · OT 7.1% · LB 6.7% · G 5.8% ·
RB 5.0% · TE 4.8% · DT 4.6% · then everything else under 3%.

**WR + CB + QB is 40% of all traded players.** Centres, safeties and
specialists barely move.

**Age and experience at the trade** (n=519): mean age **27.1**, median 26.4;
p10 23.9, p90 31.2. Median **4 seasons** of experience, modal bucket **year 3**
(23.9%) — the season before the fourth-year option decision.

### 1.4b In-season composition — source T, confidence HIGH

Of the 128 distinct in-season trades 2018–2025 (the §1.3b set), **128
involved at least one player and 0 were pure pick-for-pick swaps.**
Computed by grouping `trades.csv` rows by `trade_id` and checking for any
row with a `pfr_id`. Pick-for-pick trading is a draft-window phenomenon;
an in-season trade is a veteran moving for picks (or, rarely, players).
`runCpuTrades` sets its pick-swap proposal share to zero during the
regular season on this basis. Independent cross-check available against
Spotrac's dated trade ledger (2011–present).

### 1.5 Draft-day pick trading — source T, confidence HIGH

| draft | trades | picks moved | R1 trades | clubs involved |
|---|---|---|---|---|
| 2018 | 39 | 120 | 7 | 27 |
| 2019 | 40 | 132 | 6 | 30 |
| 2020 | 29 | 92 | 4 | 24 |
| 2021 | 28 | 100 | 3 | 31 |
| 2022 | 37 | 121 | 9 | 28 |
| 2023 | 43 | 139 | 6 | 30 |
| 2024 | 29 | 104 | 5 | 24 |
| 2025 | 35 | 132 | 4 | 26 |

**Typical draft: ~35 trades moving ~115 picks with 24–30 of 32 clubs
participating, of which ~5 involve a first-round pick.**

### 1.6 Not found

- Salary-dump vs talent-acquisition split. Nobody publishes it. Proxy: in 40.9%
  of single-veteran trades the *selling* club also sent a pick out, which is the
  salary-offset signature.
- Contract status (years remaining, cap hit, guarantees) at the trade date.
  Not in T; would need an Over The Cap join.

---

## 2. The draft

All figures from source D, classes **2011–2019** (n=2,289) unless stated.
Post-2011 only, on purpose: the rookie wage scale changed top-of-draft
behaviour, and pooling 2000–2010 inflates every bust rate. Career figures for
2019 are right-censored, so long-career numbers are floors.

### 2.1 Outcomes by pick band — confidence HIGH

`St` is PFR's seasons-as-primary-starter.

| band | n | St≥2 | St≥4 | St=0 | never played | ≥1 Pro Bowl | mean G | median G |
|---|---|---|---|---|---|---|---|---|
| picks 1–5 | 45 | 95.6% | — | 2.2% | 0.0% | 71.1% | 112.6 | 106 |
| picks 6–10 | 45 | 86.7% | — | 4.4% | 0.0% | 51.1% | 106.3 | 107 |
| picks 11–16 | 54 | 94.4% | — | 3.7% | 0.0% | 51.9% | 107.8 | 112 |
| picks 17–32 | 143 | 79.0% | — | 9.1% | 0.0% | 32.2% | 95.4 | 96 |
| **round 1** | 287 | — | **69.3%** | **6.3%** | 0.0% | 44.9% | — | — |
| round 2 | 285 | 67.0% | 47.4% | 21.1% | 0.7% | 21.1% | 86.5 | 88 |
| round 3 | 323 | 49.8% | 32.5% | 34.4% | 2.5% | 14.2% | 74.2 | 73 |
| round 4 | 338 | 35.5% | 19.5% | 47.9% | 4.4% | 6.8% | 61.9 | 55 |
| round 5 | 328 | 30.2% | 16.2% | 58.8% | 8.5% | 7.6% | 54.9 | 42 |
| round 6 | 358 | 15.6% | 8.1% | 74.0% | 15.1% | 3.6% | 40.5 | 26 |
| round 7 | 370 | 10.8% | 5.4% | 81.6% | 24.9% | 1.4% | 29.1 | 12 |

**Bust rate is not monotonic at the top.** Picks 6–10 bust at 13.3% (St≤1)
against 4.4% for picks 1–5 and 5.6% for picks 11–16. With n=45 per cell this is
noise, not signal — do not build a dip into the model.

**Era warning.** Published bust rates for picks 1–10 range 8.8% (The Hog Sty,
2000–2024) to 17% (RotoWire, picks 1–5, 2000–2024) against 8.9% here for
2011–2019. The spread is almost entirely 2000–2010 being worse. For a modern
sim, use this table.

### 2.2 Survival — confidence HIGH

Share still playing in season index *k*, where k=0 is the rookie year. This is
the definition `rosteredInYear(c, k)` uses. Censored so each column only uses
classes with enough elapsed seasons.

| rd | k=0 | k=1 | k=2 | k=3 | k=4 | k=5 | k=6 |
|---|---|---|---|---|---|---|---|
| 1 | 100.0% | 100.0% | 97.9% | 94.4% | 89.5% | 85.4% | 76.7% |
| 2 | 99.3% | 98.6% | 94.0% | 89.5% | 82.8% | 73.7% | 64.9% |
| 3 | 97.5% | 95.7% | 89.8% | 79.6% | 67.8% | 61.3% | 50.5% |
| 4 | 95.6% | 88.8% | 80.8% | 70.7% | 60.4% | 47.6% | 41.4% |
| 5 | 91.5% | 84.8% | 77.1% | 65.2% | 55.5% | 42.7% | 36.3% |
| 6 | 84.9% | 76.0% | 65.9% | 53.6% | 41.9% | 33.2% | 26.0% |
| 7 | 75.4% | 63.8% | 48.6% | 38.1% | 28.6% | 21.6% | 15.4% |

Independently corroborated by [Over The Cap's draft lifecycle
study](https://overthecap.com/the-football-lifecycle-of-an-nfl-draft-pick):
"63% of 7th-rounders are gone by year 4" (this table: 61.9%) and 25.7% never
play (this table: 24.9%).

**Career span in seasons** (0 for never played):

| rd | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| median | 8 | 7 | 7 | 5 | 5 | 4 | 2 |
| mean | 8.10 | 7.20 | 6.28 | 5.50 | 5.13 | 4.23 | 3.16 |

### 2.3 Second contract with the drafting club — confidence MEDIUM

No source publishes a full round-by-round series. What exists:

- Round 1: **31%** ([Daily Norseman](https://www.dailynorseman.com/2022/4/26/23042105/nfl-draft-pick-bust-rate-remains-very-high), 2010–2017) or **40%** (ESPN via
  [JoeBucsFan](https://www.joebucsfan.com/2023/05/hit-rate-of-first-round-draft-picks-getting-second-contracts-with-team/), 2009–2018). The two disagree; they probably
  differ on whether a fifth-year option counts.
- Retention with the original club through year 6, 2011–2013 classes
  ([Optimum Scouting](http://www.optimumscouting.com/news/nfl-draft-study-player-retention), n=749): picks 1–16 **40%**, picks 17–32 **46%**,
  mid-R2 to R3 **14%**, R4 to mid-R6 **8.9%**, mid-R6 to R7 **1.5%**.
- ~32 players per class, all rounds, re-sign with their drafting club — about
  **12.5% league-wide**.

Use ~40% R1, ~14% R2–3, ~9% R4–6, ~2% R7, and treat the tolerance as wide.

### 2.4 Round 1 composition — confidence HIGH

15 drafts, 2011–2025, 478 picks. PFR collapses to generic OL/DL from ~2021, so
this is the coarse grouping that is valid across all 15 years.

| group | mean per draft | sd | min | max | share of R1 |
|---|---|---|---|---|---|
| DL incl. edge | 7.80 | 2.68 | 3 | 12 | 24.5% |
| OL | 6.47 | 2.03 | 2 | 9 | 20.3% |
| DB | 5.33 | 2.06 | 2 | 9 | 16.7% |
| WR | 4.27 | 1.53 | 2 | 7 | 13.4% |
| **QB** | **3.27** | **1.44** | **1** | **6** | **10.3%** |
| LB | 2.47 | 1.55 | 0 | 6 | 7.7% |
| RB | 1.33 | 1.05 | 0 | 3 | 4.2% |
| TE | 0.87 | 0.92 | 0 | 3 | 2.7% |

**Quarterbacks are 10.3% of round 1, or 3.27 per draft.** The spread matters as
much as the mean: RB and TE are near-zero-inflated and should not be modelled
as normal.

### 2.5 Outcomes by position within round 1 — confidence MEDIUM (small cells)

| pos | n | St≥2 | ≥4-season starter | ≥1 Pro Bowl | never primary starter |
|---|---|---|---|---|---|
| OT | 34 | 91.2% | 82.4% | 38.2% | 2.9% |
| interior DL | 29 | 93.1% | 79.3% | 41.4% | 6.9% |
| S | 11 | 100.0% | 81.8% | 36.4% | 0.0% |
| interior OL | 20 | 90.0% | 70.0% | 55.0% | 0.0% |
| edge | 37 | 83.8% | 59.5% | 51.4% | 8.1% |
| CB | 18 | 77.8% | 66.7% | 44.4% | 5.6% |
| LB | 19 | 89.5% | 63.2% | 63.2% | 5.3% |
| RB | 13 | 84.6% | 69.2% | 61.5% | 15.4% |
| **QB** | 28 | 75.0% | 64.3% | 57.1% | 10.7% |
| WR | 32 | 75.0% | 59.4% | 21.9% | 9.4% |

The structural fact, agreed by this data and by
[PFF](https://www.pff.com/news/draft-what-historical-hit-rates-reveal-about-positional-success):
**offensive and interior linemen bust least; QB, WR and RB bust most.** The
levels differ between sources by 10–17 points because PFF's bar is snap share
inside four seasons; the ordering is robust, the levels are not.

Day 2 inverts part of this: round 2–3 **edge (42.3% St≥2, 44.2% never start)**
and **QB (38.1%)** are the worst cells in the draft, while interior OL holds up
best at 81.2%.

### 2.6 Round 1 quarterbacks — the most contested number in football analytics

2000–2019, n=56, source D:

| never a primary starter | 5.4% |
| ≤1 season as primary starter | 21.4% |
| ≥2 seasons as primary starter | 78.6% |
| ≥4 seasons as primary starter | 67.9% |
| ≥1 Pro Bowl | 50.0% |
| ≥1 first-team All-Pro | 10.7% |

Pick position dominates:

| | n | ≥4-season starter | ≥1 Pro Bowl | ≤1 season starter |
|---|---|---|---|---|
| top-10 QBs | 34 | 79.4% | 61.8% | 8.8% |
| picks 11–32 | 22 | 50.0% | 31.8% | 40.9% |

Published "hit rates" range from **24.5%** ("franchise QB",
[Big Blue View](https://www.bigblueview.com/2025/4/7/24400529/how-successful-are-quarterbacks-drafted-in-round-1-2025-edition)) to **67.9%** (four-year starter, here). That is a definitional
spread, not a data dispute. **The game needs both tiers**: "held the job" and
"became the franchise."

### 2.7 Late emergence — confidence MEDIUM, and it contradicts folklore

Source S, 2013–2019 classes, n=1,782, all observed through year 7. A
quality-starter season is ≥8 games at ≥50% snap share; "bust through year 3" is
zero such seasons in years 1–3.

| group | n | bust thru y3 | of those, ≥1 QS season in y4–7 |
|---|---|---|---|
| all picks | 1,782 | 56.5% | **14.5%** |
| round 1 | 223 | 8.5% | **42.1%** |
| round 2 | 222 | 29.3% | 27.7% |
| round 3 | 258 | 40.7% | 16.2% |
| round 4 | 264 | 61.4% | 25.9% |
| round 5 | 259 | 68.3% | 9.6% |
| round 6 | 283 | 83.7% | 10.5% |
| round 7 | 273 | 88.6% | 7.9% |

By position, rounds 1–3: **TE 50.0%** (the strongest late-development signal in
football), edge 29.7%, LB 27.3%, interior DL 26.1%, OT 21.4%, WR 21.1%,
CB 16.7%, RB 14.3%, **QB 10.0%**.

**Quarterbacks are the *worst* position for late emergence, not the best** —
but read the caveat. This measures men who never got on the field. A QB who has
not played by year 3 essentially never comes back (1 of 10 in this sample:
Garoppolo). The folk belief about late-blooming quarterbacks — Allen, Goff,
Tannehill, Darnold, Mayfield — is about men who **played badly and improved**,
and every one of them cleared the snap threshold as a rookie or sophomore, so
none of them are in this sample.

**The game must model these as two separate paths:**

1. *never played → became a starter*: use the table. QB is the worst position.
2. *played badly → became good*: **not quantified anywhere.** This is the
   largest gap in this document, and it is exactly the Darnold case the design
   is built around.

### 2.8 Undrafted free agents — confidence MEDIUM

- **369 UDFAs signed league-wide in 2025**, 6–20 per club, mean 11.5
  ([PFF tracker](https://www.pff.com/news/draft-2025-udfa-tracker-undrafted-free-agent-signings-all-32-nfl-teams)). nflverse rosters show 340–576 undrafted rookies touching a
  roster per year 2019–2023, which brackets it.
- **29.7%** of undrafted rookies who touched a roster played a regular-season
  game as a rookie (594 of 1,999, 2019–2023, source S). **8.7%** played a game
  at ≥50% snap share.
- **UDFAs are 11–12% of all NFL starters** — 429 starter-seasons across
  2019–2023, more than round 4 produced (363) and close to round 3 (521)
  ([Yahoo Sports](https://sports.yahoo.com/the-nfl-drafts-secret-round-170012115.html)). From a pool ~15x larger.
- Only **11 undrafted rookies started a week 1 game across all of 2019–2023** —
  about 2 a year out of ~370 signings.
- The widely repeated "~20% of UDFAs make an opening-day roster" traces to no
  methodology I could find. Treat as LOW confidence.
- Lifetime "% of UDFAs who ever start" is **not published and not computable**
  from public data — no dataset enumerates historical UDFA signings.

### 2.9 Poisoned sources — do not cite

At least two top Google results for "NFL draft pick survival rate by round"
contain **Gemini-generated statistics carrying the author's own "verify these
against primary sources" disclaimer**. They rank highly and read
authoritatively. This is the likely origin of the flat **42.6%** year-3 survival
figure that was in `scripts/careers.ts` for rounds 4–7 and that the roster
churn model was tuned against; the real values are 70.7% / 65.2% / 53.6% /
38.1%.

---

## 3. Corrections this file forces

| where | was | is | effect |
|---|---|---|---|
| `careers.ts TARGET_ROSTERED_Y3` | 85/68.8/68.8/42.6/42.6/42.6/42.6 | 94.4/89.5/79.6/70.7/65.2/53.6/38.1 | churn was tuned ~2x too harsh in rounds 4–6 |
| `careers.ts TARGET_CAREER_LEN` | 8/4/3/5/4/3/3 | 8/7/7/5/5/4/2 | R2 and R3 were 3–4 seasons too short, and the series was non-monotonic |
| `baselines.json drift.tradesPerSeason` | target 1.44, `nfl: 3` | ~90 | off by 30x; the sim by 60x |
| `careers.ts TARGET_MULTIYEAR` | 70.6/49.0/28.8/20.1/14.9/8.7/5.9 | 69.3/47.4/32.5/19.5/16.2/8.1/5.4 | **was already right** — keep |
| round 1 QB share | tuned toward 17% | 10.3% (3.27/draft, sd 1.44) | too QB-heavy |

## 4. What remains uncalibrated, on purpose

- The *played badly → improved* development path (§2.7). No public data.
- Salary dumps as a share of trades (§1.6).
- Contract status of traded players (§1.6).
- Lifetime UDFA start rate (§2.8).
- **Specialist in-game injury frequency.** Added 2026-08-02 with the K/P path
  (`kickExposure`, `sim/game.ts`). Nothing here measures how often a kicker or
  punter is hurt on a kick; the snap-count and injury-report sources of §6 both
  drop specialists (§6.3's ST row is 17 players at 1.53 mean weeks, which is the
  report artefact, not the absence). The exposure weights are sized to be rare —
  about three league-wide in-game events a season, over half costing no time —
  rather than tuned toward a figure. The MECHANISM was the gap worth closing;
  the rate is a guess and is labelled one.
- **Training-camp roster cap (90).** Added 2026-09-02. Not in T/D/S/P. The
  published NFL training-camp holding limit is 90 before the single cut to 53
  (`docs/front-office-design-2026-07-28.md`). No dataset here enumerates camp
  headcount. Ungated; the number is the published rule, not a computed target.
- **Practice squad (16) and IR (8 return designations, min 4 games, 3
  elevations).** Added 2026-09-02. Not in T/D/S/P. Same calendar source as the
  90-man camp note (`docs/front-office-design-2026-07-28.md` Part 5). Skip the
  +1 international PS slot. Elevations are 3 per player everywhere, including
  playoffs. The 6-vested-veteran PS cap is omitted: `yearsPro` is not an
  accrued-season count, and inventing one would be a new career-accrual system.
  Ungated published rules. CPU clubs fill the opened 53 slot after
  Designate IR (elevate from that club's PS, else street FA) on a child
  RNG stream; the user club still signs its own replacement. Not a new
  measured rate. CPU clubs fill the opened 53 slot after
  Designate IR (elevate from that club's PS, else street FA) on a child
  RNG stream; the user club still signs its own replacement. Not a new
  measured rate.
- **Waiver wire.** Added 2026-09-02. Not in T/D/S/P — there is no waiver
  table in those datasets. Design doc Part 5
  (`docs/front-office-design-2026-07-28.md`): everyone cut passes through
  waivers before you can stash him. The NFL does not bid cash on waivers;
  priority is the cost. Claim order is inverse standings (worse record
  first), using the existing `leagueStandings` / `compareTeamsCore` sort —
  no Super Bowl exception, no invented 24-hour clock. The game has no
  wall-clock; Play Week is one claim window. Start the Season (cutdown)
  and the preseason→season advance close the current window and keep
  resolving claim-cut windows in that same advance until the chain
  settles or the remaining names cannot be claimed, stashed, or released
  without putting a club over the cap — leftover stays on the desk
  rather than blowing the books. The desk is not the whole camp dump
  (~32 clubs × extras). Cutdown extras still pass waivers before PS or
  FA. Unclaimed: original club may PS-stash if under 16 and the hit
  fits, else FA if the dead money fits, else leftover on the next
  window. Claiming club gets the contract as-is. Ungated.
- **Gameday actives (47, or 48 with 8 OL).** Added 2026-09-02. Not in T/D/S/P.
  Same calendar source as the 90-man camp and PS 16 notes
  (`docs/front-office-design-2026-07-28.md` Part 5). Regular-season and
  playoff clubs dress at most 47, or 48 when the 53 includes 8 offensive
  linemen (OT/OG/C). Inactive count is 53 minus that cap. Ungated published
  rule.
- **Franchise tag (exclusive, one per club per year).** Added 2026-09-03.
  Not in T/D/S/P. Same calendar source as camp 90 / PS 16 / IR / waivers
  (`docs/front-office-design-2026-07-28.md` Part 5): ~Feb 17–Mar 3, one
  tag per club per year.   Exclusive only — non-exclusive and transition are omitted so they
  do not widen the cluster. The July 15 extension is a separate
  camp-desk packet (see the July 15 block below). Tender is the
  published CBA shape: greater of the average of
  the top five cap hits at that position (existing `capHit` machinery)
  or 120% of last year's hit. Must fit the cap; Tag is blocked with a
  reason, same as Sign. One window, then FA opens — the game has no
  wall-clock. Ungated published rule.
- **Fifth-year option (first-rounders only).** Added 2026-09-03. Not in
  T/D/S/P. Same calendar source as the franchise tag
  (`docs/front-office-design-2026-07-28.md` Part 5): post-draft, May 1
  of the player's fourth season. The game has no wall-clock; the desk
  sits on the existing camp / cutdown Hub (`offseason-final`), not on
  the tag window and not as a sixth phase. Eligibility is
  `draftedRound === 1`, still on the original 4-year rookie deal
  (`years === 4`, `signedSeason === draftClassSeason`), one year
  remaining. `yearsPro` is seasons elapsed, not accrued — no vest is
  invented. Rounds 2–7 and UDFAs have no option. Pick up appends a
  guaranteed 5th year; Decline / skip leaves the 4-year path so he
  hits FA after year 4. One decision per eligible player per window.
  Tender uses existing `capHit` averages, not a hardcoded fantasy APY
  and not the exclusive franchise tag: picks 1–10 average the top ten
  at the position (transition-shaped); picks 11–32 average the 3rd
  through 20th. Pro Bowl escalators are omitted — the repo has
  `draftedPick` but no Pro Bowl flag. Must fit the cap; Pick up is
  blocked with a Sign-shaped reason. CPU clubs may pick up the
  eligible R1s they can afford via evaluate / cap / posture; the user
  club is not auto-picked. Ungated published rule.
- **July 15 extension (tagged player, camp desk).** Added 2026-09-03.
  Not in T/D/S/P. Same calendar source as the franchise tag
  (`docs/front-office-design-2026-07-28.md` Part 5): tag in Feb, FA
  in March, draft late April, tagged-player extension deadline July 15
  (camp / OTAs). The game has no wall-clock; the desk sits on the
  existing camp / cutdown Hub (`offseason-final`), next to the
  fifth-year option, not on the tag window and not as a sixth phase.
  Eligibility is a player in `franchiseTags` for this `season` still
  on that club on the 1-year tender. Not a fifth-year option and not
  an untagged veteran. Extend replaces the tender with a multi-year
  deal via existing `negotiatedApy` / `makeContract` (true OVR; no
  invert). Skip / Continue: he plays the tag year. One attempt per
  tagged player. CPU clubs may extend via evaluate / cap / posture;
  the user club is not auto-extended. Must fit the cap; Extend is
  blocked with a Sign-shaped reason. Ungated published rule.
- **Rookie slot scale (per-pick APY).** Added 2026-09-05. Not in T/D/S/P.
  The 2011 CBA replaced negotiated rookie deals with a slotted wage scale.
  Over The Cap publishes the yearly chart
  (https://overthecap.com/rookie-wage-scale). 2024 shares of that year's
  $255.4M cap, used as the *shape*: pick 1 ≈ 3.864%, pick 32 ≈ 1.294%,
  pick 33 ≈ 0.854%, tail ≈ 0.312% (league minimum / cap). Each 32-pick
  band is then mean-preserving against the inherited round flats
  (`5.2 / 2.4 / 1.5 / 1.15 / 1.0 / 0.95 / 0.9 × LEAGUE_MINIMUM`) so
  league rookie spend stays in the old economy, and deviations from
  that mean are compressed (`ROOKIE_SLOT_AMPLITUDE` 0.32) so year-0
  cutdown leftover stays inside the inherited waiver-settlement band
  (`rostercap` / `waivers` wire < 120). Full OTC dollars on pick 1
  (~1.8× the old R1 flat) left the clubs that hold picks 1–16 —
  already the tightest — with more veterans cap-stuck on the wire.
  Four-year term unchanged. Pick 1 is no longer pick 32. Ungated
  published rule — not a careers composition target.
- **Compensatory draft picks (UFA net / tiers).** Added 2026-09-05. Not
  in T/D/S/P. The NFL awards extra Day-3 slots to clubs that lose more
  qualifying unrestricted free agents than they sign. Over The Cap's
  published reconstruction
  (https://overthecap.com/nfl-compensatory-picks) is the formula: APY
  tiers as a share of the cap (3rd ≥4.5%, 4th ≥3.0%, 5th ≥2.0%,
  6th ≥1.15%, 7th ≥0.66%); a signing cancels a loss of equal or worse
  tier; max four per club; order by lost-player APY. Playing-time drop
  uses last season's games (the real formula waits a year for new-club
  snaps; FA and the draft share one offseason here). Cuts, re-signs,
  and this class's rookies do not count. Assignment is deterministic —
  zero draws. Regular inventory stays 32×7 so future classes remain
  tradeable before their FA; comps are awarded onto `pickOwners` when
  the draft is built. Ungated published rule. Do not chase
  `careers.r1QbSharePct` or survival MAE against the extra Day-3 names.
- **This-week play-calling (call sheet / Play-the-Game).** Added 2026-09-02.
  Not in T/D/S/P. The GM override uses the same units as coach `passBias`
  (−1 run … +1 pass) and `aggression` (0–100) already in `simulateGame`.
  It is a player control, not a measured league rate. No new mix target
  and no formation tree — the play loop has down / toGo / yardLine /
  passBias / aggression and a victory kneel, nothing else. Ungated.

These stay ungated. A guard on a number nobody knows is worse than no guard.

---

## 5. Individual season volume — the shape of the top of each leaderboard

Added 2026-08-02 for `task/304-stat-tails`. The league MEANS were already
calibrated (`calibrate.passYds` +4%); what was ungated was the *distribution*
of individual seasons, and it was fat at the top and thin in the middle.

**Dataset.** nflverse `player_stats_YYYY.csv.gz`, 2018-2024, from
<https://github.com/nflverse/nflverse-data/releases/download/player_stats/>.
Weekly rows filtered to `season_type == "REG"`, summed per `player_id` per
season, then ranked. n = 7 seasons, 224 team-seasons.

**Validation.** The pipeline was checked against independently computed figures
for 2019 / 2021 / 2023 before use and reproduced every one exactly: passing #1
5109 / 5316 / 4624, #10 4031 / 4115 / 4016, #20 3271 / 3245 / 2877; rushing #1
1540 / 1811 / 1459; 1700+ rushers 0 / 1 / 0; receiving #1 1725 / 1947 / 1799.

**Caveat.** 2018-2020 are 16-game seasons, 2021-2024 are 17. The sim plays 17.
The 17-game subset was computed separately and agrees within 2-3% at every rank
(e.g. passing #1 5027 vs 5024 pooled, #10 3924 vs 4028), so the pooled figure is
used and the era mix is not load-bearing.

### 5.1 Rank table, per season (mean +/- sd across the 7 seasons)

| rank | passing yds | rushing yds | receiving yds | pass attempts | carries |
|---|---|---|---|---|---|
| #1 | 5024 +/- 247 | 1704 +/- 248 | 1743 +/- 128 | 663 +/- 48 | 327 +/- 34 |
| #5 | 4497 +/- 176 | 1191 +/- 125 | 1365 +/- 96 | — | — |
| #10 | 4028 +/- 198 | — | 1208 +/- 65 | 547 +/- 10 | 230 +/- 18 |
| #20 | 3046 +/- 190 | — | — | — | — |

### 5.2 Threshold counts, per season

| threshold | mean per season | range |
|---|---|---|
| rushers >= 1500 yds | 1.43 | 0-3 |
| rushers >= 1700 yds | 0.57 | 0-2 |
| passers >= 4500 yds | 4.29 | 3-6 |
| passers >= 4800 yds | 1.86 | 0-5 |
| passers >= 5000 yds | 0.86 | 0-2 |

### 5.3 Workload concentration — why the tail is fat

The rank table alone does not say WHERE excess individual volume comes from.
These are the same 224 team-seasons, aggregated by `recent_team`:

| measure | mean | p10 | median | p90 | max |
|---|---|---|---|---|---|
| leading passer's share of team pass attempts | **82.3%** | 52.0% | 89.4% | 99.6% | 100% |
| team pass attempts | 564 | 494 | 570 | 635 | 751 |
| leading rusher's share of team carries | **47.4%** | 30.9% | 46.7% | 63.1% | 79.4% |
| team carries | 442 | 380 | 439 | 521 | 621 |

Two figures carry the whole explanation, and both are about AVAILABILITY rather
than in-game usage:

- Only **45%** of leading passers appear in 16 or more games.
- **53%** of team-seasons have their leading passer taking under 90% of the
  team's attempts.

**§5.3's rushing row is a share of TEAM carries, and team carries are not RB
carries.** Read the denominator before comparing anything to the 47.4%: see
§5.5, added 2026-08-03, which measures the same quantity on the denominator the
engine's backfield dials actually control and gets 58.3%.

A real NFL starting quarterback misses time — injury, benching, a lost job —
often enough that the average one throws 82% of his club's passes, not ~100%.
That is the mechanism behind the real #10 and #20 passing figures being far
below what a full-season starter accumulates, and it is what a simulation whose
starters never miss a snap cannot reproduce. See `docs/HANDOFF.md` for the
measured sim comparison.

### 5.4 Where a passing season's attempts come from — task/307, 2026-08-02

Added for `task/307-qb-volume`, to aim the residual on
`statcheck.qb20PassYds` (3,413 against 3,046 ±244) at a mechanism rather than
at a multiplier. §5.1 and §5.3 say WHAT the leaderboard looks like; this block
says which of the three factors behind an individual season — team volume, the
starter's share of it, and yards per attempt — is the one that is wrong.

**Dataset.** As §5.3: nflverse `player_stats_YYYY.csv.gz` 2018-2024, REG only.
Joined for the margin table to nflverse/nfldata
[`games.csv`](https://github.com/nflverse/nfldata) for final scores (32 of
3,709 team-games unmatched on relocation aliases and dropped).

**Validation.** The pipeline reproduces §5.3 exactly on the pooled years —
team attempts mean 564, p10 494, median 570, p90 635, max 751; QB1 season
attempt share mean 82.3%, median 89.4%, p10 52.0% — before any of the figures
below were taken from it.

**The era split matters here, and it did not in §5.1.** §5.1 records that the
17-game subset agrees with the pooled rank table within 2-3%, so the era mix
was declared not load-bearing. That holds for RANKS. It does not hold for
anything per-season or per-share: a 17-game season is 6% more attempts and one
more week in which the starter can be unavailable. **The sim plays 17 games, so
the 17-game column is the one to fit.** Recording both, and the direction of
the error if the wrong one is used:

| measure | 16-game 2018-20 | **17-game 2021-24** | pooled |
|---|---|---|---|
| team pass attempts, mean | 558 | **570** | 564 |
| team pass attempts, sd | 59 | **60** | 60 |
| p10 / median / p90 / max | 479 / 563 / 630 / 689 | **495 / 571 / 647 / 751** | 494 / 570 / 635 / 751 |
| team carries, mean / sd | — | **457 / 51** | 442 / 54 |
| corr(team attempts, team carries) | — | **−0.64** | −0.53 |
| scrimmage plays per team-game | 63.59 | **62.89** | 63.19 |
| dropback share of scrimmage plays | 58.6% | **57.2%** | 57.8% |
| QB1 season attempt share, mean | 84.8% | **80.4%** | 82.3% |
| QB1 season attempt share, median | 92.6% | **85.8%** | 89.4% |
| QB1 season attempt share, sd | — | **18.5pp** | — |
| QB1 games with an attempt | — | **14.23 of 17 (83.7%)** | 14.2 of 16.6 |
| #20 passing season | 3,145 | **2,971** | 3,046 |
| #20 by ATTEMPTS | 447 | **418** | 431 |

The pooled QB1 share median of 89.4% is 3.6 points ABOVE the 17-game figure,
and the pooled mean is 1.9 above. **A share checked against the pooled column
is being graded generously**: measured against the 17-game era the sim's 86.3%
mean share is 5.9 points high, and its QB1 plays 15.0 of 17 games against a
real 14.23. This is §6.6's error in the other direction — it flatters the sim
rather than over-injuring it, which is the harder version to notice. Any
availability work must be graded against the 17-game column.

Scrimmage plays are attempts + carries + sacks, all three from the same rows;
`carries` in this dataset includes scrambles and kneels, matching what the sim
counts as a rush attempt.

**Yards per attempt by rank** — the efficiency axis, pooled (ranks are stable
across the era split):

| rank | 1 | 5 | 10 | 15 | 20 | 25 | ranks 11-20 |
|---|---|---|---|---|---|---|---|
| yards | 5024 | 4497 | 4028 | 3687 | 3046 | 2559 | 3591 |
| attempts | 632 | 578 | 520 | 516 | 439 | 380 | 499 |
| **YPA** | 7.99 | 7.86 | 7.79 | 7.19 | 7.04 | 6.79 | **7.23** |

A mid-table passing season is a volume season, not an efficient one: ranks
11-20 average 7.23 yards an attempt against 7.69 for the top ten. **Any
simulation whose ranks 11-20 read near 7.2 is not producing those yards through
efficiency**, and the lever is attempts.

### 5.4b Within-game relief — when a real starter stops throwing

The share in §5.3 is a SEASON share, and it folds together two different
things: the games the starter missed entirely, and the attempts he did not take
in the games he played. Split, over the same rows:

| | pooled | 17-game era |
|---|---|---|
| team-games with more than one passer | 20.8% | 21.4% |
| the game leader's share of that game's attempts | **97.2%** | **97.0%** |
| the season primary passer's share in games he appeared | 96.0% | 95.6% |

So a real season share of 80.4% is roughly 83.7% availability × 95.6%
within-game, not availability alone. Neither factor is small.

**And the within-game half runs the opposite way to the obvious model.** By
final margin, the leading passer's share of his club's attempts that day:

| final margin | n | leader's share | games under 95% | team attempts |
|---|---|---|---|---|
| win by 25+ | 184 | 95.6% | 31.0% | 29.3 |
| win by 17-24 | 283 | 98.5% | 8.1% | 30.1 |
| win by 9-16 | 399 | 98.4% | 7.3% | 30.5 |
| win by 1-8 | 970 | 98.9% | 3.9% | 33.2 |
| lose by 1-8 | 989 | 97.3% | 8.4% | 36.4 |
| lose by 9-16 | 396 | 96.1% | 12.1% | 37.7 |
| lose by 17-24 | 276 | **93.9%** | 22.5% | 36.3 |
| lose by 25+ | 180 | **91.1%** | 37.8% | 33.9 |
| all | 3,677 | 97.2% | 11.1% | — |

**A real club goes to its backup more readily when it is being beaten than when
it is winning** — 91.1% in a 25-point loss against 95.6% in a 25-point win.
Weighted by how often each bucket occurs, the trailing side carries **72%** of
all the attempts the league's starters do not take, and **86%** of everything
above the one-score-win floor of 1.1%. "Garbage time" as a rule that rests the
side which is AHEAD therefore describes the smaller half of the effect. The
one-score buckets (98.9% winning, 97.3% losing) are the floor this mechanism
cannot go below: injuries, a wildcat snap, a trick play, one series to a
backup — and a sim with in-game injuries and nothing else should land there.

Team attempts by margin also confirm the game-script direction that is already
in the engine: a club losing by 9-16 throws 37.7 times, one winning by 25+
throws 29.3.

### 5.5 The backfield split, on the denominator the engine actually sets

Added 2026-08-03 for `task/306-carry-share`, which was opened to cut the sim's
lead-back share from 58.1% to §5.3's 47.4%. **It should not be cut.** §5.3's
47.4% is the leading rusher's share of TEAM carries; `CARRY_SHARE` and
`script.leadBackShare` divide RB carries among the backs, and RBs take only
about four fifths of a real club's carries.

**Dataset.** As §5.3/§5.4: nflverse `player_stats_YYYY.csv.gz`, REG only,
grouped by `recent_team`. `position in (RB, FB, HB)` is the RB group.

**Validation.** The pipeline reproduces §5.3's rushing row exactly on the pooled
years — leading rusher 47.4% mean, 46.7% median, 30.9% p10, 63.1% p90 — before
the RB-only figures below were taken from it.

| denominator | mean | median | p10 | p90 |
|---|---|---|---|---|
| leading rusher / TEAM carries, pooled (**this is §5.3's row**) | 47.4% | 46.7% | 30.9% | 63.1% |
| leading rusher / TEAM carries, 17-game era | 47.3% | 46.8% | 34.7% | 61.0% |
| **leading RB / RB-ONLY carries, pooled** | **57.9%** | 57.2% | 40.3% | 77.4% |
| **leading RB / RB-ONLY carries, 17-game era** | **58.3%** | 58.5% | 43.1% | 75.6% |
| **lead RB / RB carries, WITHIN ONE GAME, 17-game era** | **70.4%** | 69.6% | 50.0% | 92.3% |

The last row is the one the dials set, because they are per-play weights: over
2,163 team-games with at least 8 RB carries, the lead back takes **70.4%** of
them, and one back takes every RB carry in only 4.0% of games.

**Who takes the other carries** — 17-game era, per team-game (n = 2,174):

| group | carries | share | ypc | yards |
|---|---|---|---|---|
| RB | 21.74 | **80.7%** | 4.29 | 93.2 |
| QB | 4.24 | **15.7%** | 4.42 | 18.7 |
| WR | 0.83 | 3.1% | 5.86 | 4.8 |
| TE | 0.11 | 0.4% | 4.15 | 0.4 |

So the season share on the two denominators composes exactly:
0.583 × 0.807 = **47.2%**, which is §5.3's 47.3%. Any comparison that puts a
sim RB-only share next to §5.3's 47.4% is off by the RB share of team carries,
about eleven points.

Note also that a real quarterback rushes for **18.7 yards a game** here, against
the `nfl: 13` recorded on `calibrate.qbRushYds`. That baseline's informational
figure looks low against this dataset; it is lead-owned and untouched.

### 5.6 The play economy — how many plays, and the clock that produces them

Added 2026-08-03 for `task/309-play-economy`, to aim the two defects §5.4 and
§5.5 left open: the league ran 2.2% too many scrimmage plays, and its carry mix
was wrong because the engine had no receiver carries and no kneel-downs.

**Dataset.** nflverse **play-by-play** 2021-2024, REG only, from
<https://github.com/nflverse/nflverse-data/releases/download/pbp/>. A scrimmage
play is `rush_attempt | pass_attempt | sack | qb_kneel | qb_spike`, excluding
two-point plays — the same set the sim counts in `stats.plays`.

**Validation, and it is a strong one.** This is a completely different file from
the weekly `player_stats` used in §5.3-§5.5, and the two reconcile exactly:

| | pbp | weekly (§5.5) |
|---|---|---|
| scrimmage plays / team-game | **62.90** | 62.89 |
| rushes + kneels | 26.17 + 0.761 = **26.93** | 26.93 |
| passes + spikes | 33.41 + 0.126 = **33.54** | 33.54 |
| sacks | 2.42 | 2.42 |

n = 1,087 games, 2,174 team-games, 136,738 scrimmage plays.

**The structural figures.**

| measure | real |
|---|---|
| scrimmage plays / team-game | **62.90** |
| drives / team-game | **10.87** |
| plays / drive | **5.79** |
| QB kneels / team-game | **0.761**, mean **−1.09** yards |
| QB spikes / team-game | 0.126 |
| QB carries excluding kneels | 3.48 (of 4.24 total, §5.5) |
| non-kneel rush YPC | 4.51 |

**Clock runoff by play type** — seconds from one snap to the next, measured on
consecutive plays inside the same drive and quarter, which is exactly what the
engine's `timeUsed` models:

| play type | n | mean | median | p10 | p90 | engine before | engine after |
|---|---|---|---|---|---|---|---|
| run | 51,440 | **35.7** | 38 | 23 | 44 | 23-38 (30.5) | 25-40 (32.5) |
| pass, complete | 43,574 | **31.7** | 36 | 7 | 44 | 25-39 (32.0) | unchanged |
| pass, incomplete | 22,094 | **5.0** | 5 | 3 | 7 | 5-9 (7.0) | **3-7 (5.0)** |
| sack | 4,164 | **38.1** | 41 | 25 | 46 | 29-39 (34.0) | **31-45 (38.0)** |
| kneel | 1,185 | **31.9** | 35 | 17 | 42 | — | **26-38 (32.0)** |
| spike | 220 | 1.0 | 1 | 1 | 1 | — | not modelled |

Two transition gaps the engine does not separate out at all:

| gap | n | mean | median |
|---|---|---|---|
| last snap of a drive → the punt snap | 8,473 | 21.4 | 9 |
| last snap of a drive → the FG snap | 4,232 | 19.2 | 7 |
| punt/FG snap → next drive's first snap | 12,687 | 9.2 | 8 |

**Why the completed-pass and run rows are not simply transplanted.** The engine
charges one bundled number per play and nothing for the gap before a punt or
field goal, and it models no clock stoppage for going out of bounds, for the
two-minute warning, or for a timeout. Applying the measured in-drive runoffs to
every play — including the drive-ending ones, whose real successor gap is the
21.4-second row above rather than another 35.7-second snap — overshoots badly:
it lands the sim at 60.0 plays a game against the 62.90 target. The
incompletion and sack rows ARE transplanted exactly, because both are
unambiguous and neither is a common drive-ender. **The run row is the free
parameter, fitted to the aggregate:** 25-40 (mean 32.5) lands scrimmage plays on
62.9, and it sits 3.2 seconds below the measured in-drive 35.7 because the
engine is not charging the pre-punt play clock. That residual is a known
structural difference, written here so the next reader does not "fix" the run
row to 35.7 and lose three plays a game.

---

### 5.7 The top of the leaderboard is an EFFICIENCY problem, not a volume one

Added 2026-08-03 for `task/310-top-spread`. Once real play volume landed
(§5.6), the individual leaderboards came in flat at the top: `qb5PassYds`
4,057 against a floor of 4,137, `qb10PassYds` 3,678 against 3,706,
`wr10RecYds` 1,081 against 1,111. This block decomposes that shortfall.

**Dataset.** nflverse weekly `player_stats` 2018-2024, REG only, ranked per
season. Receiving targets and yards-per-target are new here; the passing rank
table is §5.4's.

**Real receiving by season yards rank** (mean over 7 seasons):

| rank | yards | targets | yds/target | rec | yds/rec |
|---|---|---|---|---|---|
| 1 | 1,743 | 177 | **9.82** | 130 | 13.52 |
| 3 | 1,447 | 152 | **9.62** | 102 | 14.39 |
| 5 | 1,365 | 145 | **9.47** | 101 | 13.96 |
| 10 | 1,208 | 137 | **8.93** | 90 | 13.71 |
| pooled 1-5 | — | — | **9.72** | — | — |
| pooled 6-10 | — | — | **9.20** | — | — |

**The decomposition, sim against real** (3 seeds x 3 seasons, REG only):

| | sim | real | verdict |
|---|---|---|---|
| passing #10 attempts | 520 | 520 | **exact** |
| passing #10 YPA | 7.29 | 7.79 | −6.4% |
| passing #20 attempts / YPA | 440 / 7.02 | 439 / 7.04 | **exact** |
| passing #5 attempts | 562 | 578 | −2.8% |
| passing #5 YPA | 7.26 | 7.86 | −7.6% |
| receiving #1 targets | 179 | 177 | **exact** |
| receiving #1 yds/target | 8.43 | 9.82 | −14.2% |
| receiving #5 / #10 targets | 144 / 136 | 145 / 137 | **exact** |
| receiving #5 / #10 yds/target | 8.38 / 8.16 | 9.47 / 8.93 | −11.5% / −8.6% |

**Volume is exonerated at every rank the guards care about, for both
positions.** Attempts and targets are exact at ranks 5, 10 and 20; the middle
of each board is exact in yards as well. The entire shortfall is per-play
production, and it grows with rank — receiving is −8.6% at #10 and −14.2% at
#1 — which is the signature of a gradient that is too flat rather than a level
that is too low.

| gradient | sim | real |
|---|---|---|
| passing YPA, pooled 1-5 → 11-20 | 7.49 → 7.20 (4.0% span) | 7.90 → 7.23 (**9.3% span**) |
| passing #5 / #20 yards | 1.326 | **1.476** |
| receiving #1 / #10 yards | 1.357 | **1.443** |

**One mechanism found and fixed, and it is not the whole of it.** Air yards
depended on the passer's arm and on nothing whatever about the man catching the
ball, so a receiver who beat his corner all day was thrown the same route as
one who could not get open. `sepEdge` in `passPlay` now scales air yards by the
receiver's separation against the coverage he faces, centred on a neutral
matchup so no league mean moves (`calibrate.passYds` 234.05 → 234.59 across 24
and 6 seeds respectively). Measured at 60 seeds it is worth **+22 on
`wr10RecYds`** and moves the receiving gradient 1.357 → 1.413 against a real
1.443 — real, and far short of closing the gap.

**What is left, measured, for the packet that finishes this.** Two components,
and neither is the receiver:

1. **The passer's own gradient.** `armQuality` spans 0.865 + q/520, which is
   about **5% across the entire QB population** — a 90-rated arm throws for 5%
   more air than a 60-rated one. That is why `sepEdge` moved receiving and left
   `qb5PassYds` and `qb10PassYds` where they were (4,057 → 4,037 and 3,678 →
   3,683 at 60 seeds). Steepening it must be re-centred on the population mean,
   the same way `sepEdge` was, or league passing yards move with it.
2. **Team pass volume at the very top.** The sim's top-5 passers throw 538-562
   times against a real 578-596, because team pass attempts have sd 34-39
   against a real 60 (§5.4). This is the spread task/309 tested and correctly
   reverted: widening `coach.passBias` widens run concentration through the
   same mix lever and inflated `rushers1700` 0.8 → 1.4. A mechanism that widens
   PASS volume without widening the run share has not been found, and it is
   required for `qb5PassYds` specifically — efficiency alone cannot reach a
   −10% gap at that rank.

### 5.8 Do run-heavy clubs spread their carries? No — and that closes a door

Added 2026-08-03 for `task/310b-top-finish`. task/309 showed that widening
`coach.passBias` to give the league a realistic spread of team PASS volume also
widens the spread of team RUSH volume through the same mix lever, and inflated
`rushers1700` 0.8 -> 1.4 against a real 0.57. The proposed escape was that real
run-heavy clubs might SPREAD the extra carries across their backfield, so the
marginal carries on a run-heavy team would not all land on its lead back.

**They do not.** nflverse weekly `player_stats`, 17-game era 2021-2024, REG
only, n = 128 team-seasons, quintiles by team carries:

| quintile | team carries | lead RB's share of RB carries | RB carries | team pass att |
|---|---|---|---|---|
| Q1 (fewest runs) | 391 | 57.8% | 330 | 620 |
| Q2 | 425 | 59.4% | 348 | 597 |
| Q3 | 450 | 58.1% | 371 | 567 |
| Q4 | 481 | 60.2% | 386 | 548 |
| Q5 (most runs) | 531 | **56.3%** | 406 | 522 |

**corr(team carries, lead-back share) = −0.015**, slope **−0.36 points per +100
team carries.** The curve is flat: a club that runs 140 more times a year gives
its lead back the same ~58% of the carries, he simply gets more of them.

**Consequence, and it is a closing door.** There is no measured coupling to
implement, so the run-share inflation that follows a pass-volume widening
cannot be decoupled by redistributing the marginal carries — reality does not
redistribute them either. Widening team pass spread toward its real sd of 60
through the pass/run mix therefore costs a rushing tail the sim cannot afford,
and the honest position is to leave team pass-volume spread short (sd 34-39
against a real 60) and accept that the very top of the passing leaderboard
under-produces on VOLUME. `statcheck.qb5PassYds` is the metric that pays for
it: its passers throw 538-562 against a real 578-596.

A mechanism that widens pass volume WITHOUT touching the mix — schedule-driven
pace, or a pass-rate identity that is not the same dial as the run-rate
identity — would reopen this. None is implemented and none is measured.

### 5.9 The passer gradient, steepened — the fix that cleared the floors

Added 2026-08-03 for `task/310b-top-finish`, completing §5.7's component 1.

`armQuality` was `0.865 + q/520` with `q = (tha + thp)/2` — a span of about
**5% across the entire quarterback population**, so a 90-rated arm threw for 5%
more air yards than a 60-rated one. Real yards per attempt spans **9.3%** from
the top five passers to ranks 11-20 (§5.7); the sim spanned 4.0%.

It now carries an extra slope centred on the middle of the starting population:

    armQuality = 0.865 + q/520 + (q - 70) * 0.0040

Centring is what makes it a redistribution — an elite arm gains what a
replacement arm sheds — and it is the same discipline `sepEdge` uses. Measured
at 60 seeds, with `sepEdge` already in place:

| metric | before §5.7's fix | + `sepEdge` | + gradient | band |
|---|---|---|---|---|
| `qb5PassYds` | 4,057 | 4,037 | **4,156** | floor 4,137 ✓ |
| `qb10PassYds` | 3,678 | 3,683 | **3,754** | floor 3,706 ✓ |
| `wr10RecYds` | 1,081 | 1,103 | **1,115** | floor 1,111 ✓ |
| `qb20PassYds` | 3,040 | 3,089 | **3,076** | real 3,046 ✓ |
| `leadPassYds` | 4,604 | 4,609 | **4,742** | real 5,024 |
| `rushers1700` | 0.2 | 0.45 | **0.28** | real 0.57 ✓ |

**One honest deviation.** The brief asked for a steepening under which
`calibrate.passYds` does not move; it moved **234.59 -> 237.98** (+1.4%). The
cause is attempt-weighting: a gradient centred on the unweighted mean arm is
still net-positive across the league, because better quarterbacks take more of
the attempts. Holding the league mean exactly would require centring on the
ATTEMPT-weighted mean, about 72.5, and that costs roughly 1.4% off every rank —
which puts `qb5PassYds` back under its floor. The value sits comfortably inside
its lock (240.29 ±12) and is in fact CLOSER to the locked target than the 234.59
it replaced, though further from the `nfl: 230` note. Recorded rather than
hidden, because the next person tuning this will meet the same trade-off.

### 5.10 Do the biggest workloads go to the most efficient backs? Yes, weakly

Added 2026-08-10 to unblock `statcheck.rb5RushYds`; the sim change landed
2026-08-31. `docs/statcheck-noise-2026-08-06.md` §7 (on
`task/312-statcheck-panel-guards` @ b8a8982, not on main) diagnosed the sim's
rushing tail as a positive carries↔ypc coupling and proposed introducing a
NEGATIVE coupling. **That assertion is not supported by the data.** The real
coupling is positive. This block is the primary-source computation invariant 7
requires before that call could be made, and it reverses the proposed fix.

**Dataset.** nflverse `player_stats_YYYY.csv.gz`, 2021-2024 (17-game era), from
<https://github.com/nflverse/nflverse-data/releases/download/player_stats/>.
Weekly rows filtered to `season_type == "REG"`, summed per `player_id` per
season. The RB group is `position in (RB, FB, HB)`, as §5.5. **Qualified = 100+
carries in the season**, which yields 46.8 backs a year — the same population
the sim measurement uses.

A player's season line is summed across every club he appeared for. That is
correct here and is **not** the trade trap of `statcheck-noise-2026-08-06.md`
§6: that trap is about attributing a season line to a TEAM, and no team key is
read anywhere in this block.

**Validation.** The same loader reproduces §5.5's carry-composition table
exactly — RB 80.7% at 4.29 ypc, QB 15.7% at 4.42, WR 3.1% at 5.86, TE 0.4% at
4.15 — and reproduces §5's cited rushing leaders: 2021 Jonathan Taylor 1,811 on
332, 2023 Christian McCaffrey 1,459 on 272, 2024 Saquon Barkley 2,005 on 345.

**The two numbers.**

| quantity | 17-game era 2021-2024 | pooled 2018-2024 |
|---|---|---|
| n player-seasons | 187 | 326 |
| **corr(carries, ypc)** | **+0.129** | **+0.126** |
| 95% CI (Fisher z) | −0.014 .. +0.268 | +0.018 .. +0.232 |
| Spearman | +0.136 | — |
| **ypc sd** | **0.642** | 0.636 |
| ypc mean, unweighted | 4.334 | 4.360 |
| ypc mean, carry-weighted | 4.360 | 4.386 |
| ypc p10 / p50 / p90 / p99 / max | 3.64 / 4.27 / 5.13 / 5.96 / 7.77 | — |
| carries mean / sd | 189.7 / 59.4 | 184.1 / 59.3 |

The coupling is **positive and weak**, and it is not an artifact: Spearman
agrees with Pearson, so it is not driven by the 7.77 outlier, and the 16-game
era reads **+0.137** on the same definition. Per season it runs −0.030 / +0.184
/ −0.043 / +0.393 for 2021-2024, so a single season cannot resolve it.

It is sensitive to the qualifying cut — **+0.187 at 50 carries, +0.129 at 100,
+0.263 at 150, +0.215 at 200** — so always state the cut when quoting it.

**ypc dispersion is not flat across workload.** Real mid-volume backs are
tightly clustered; the spread lives at the two ends, and the 100-149 band's
0.841 is small-sample noise on ~7 games' worth of carries rather than talent.

| carries | n | ypc mean | sd | p90 | max |
|---|---|---|---|---|---|
| 100-149 | 58 | 4.302 | 0.841 | 5.34 | 7.77 |
| 150-199 | 43 | 4.215 | **0.504** | 4.88 | 5.22 |
| 200-249 | 55 | 4.376 | **0.477** | 4.95 | 5.52 |
| 250+ | 31 | 4.486 | 0.633 | 5.45 | 5.91 |

**The rushing leaderboard, decomposed** — ranked by rushing yards within each
season, all positions, which is what `statcheck`'s `rb5RushYds` reads:

| rank | yards | carries | ypc |
|---|---|---|---|
| #1 | 1732 +/- 232 | 322 +/- 34 | 5.37 |
| #3 | 1332 +/- 186 | 282 +/- 36 | 4.75 |
| #5 | **1222 +/- 155** | **247 +/- 13** | **4.95** |
| #10 | 1046 +/- 94 | 208 +/- 5 | 5.03 |
| #20 | 879 +/- 51 | 197 +/- 44 | 4.67 |

§5.1's pooled #5 of 1191 +/- 125 and this 17-game 1222 agree inside the era
caveat §5 already carries.

**A denominator correction, and it changes the diagnosis.** §7 compared the
sim's qualified-RB ypc of 4.498 against §5.6's non-kneel **4.51** and concluded
the means were correct. **§5.6's 4.51 is ALL POSITIONS**, lifted by receiver
carries at 5.86 ypc and by non-kneel quarterback scrambles at about 5.6. It is
not the comparator for a population of 100+-carry running backs. The four
figures, so this cannot happen again:

| population | real ypc |
|---|---|
| all rushers, including kneels | 4.355 |
| all rushers, non-kneel (**this is §5.6's 4.51**) | 4.51 |
| RB group, all volumes (§5.5) | 4.29 |
| **RB group, 100+ carries, carry-weighted** | **4.36** |

**What this leaves for the sim.** Measured on the matched population at
`43b9303` (engine byte-identical to `190cbd0`), 8 seeds, n = 387: the sim's
`corr(carries, ypc)` is **+0.159** against this block's **+0.129** — a
difference of z = 0.34, p = 0.73, statistically indistinguishable. **There is
no coupling defect and nothing to decouple.** Two quantities are genuinely
wrong, and both are about efficiency spread and level rather than its
correlation with volume:

| quantity | sim | real | |
|---|---|---|---|
| ypc sd, qualified RBs | **0.747** | **0.642** | +16%, F = 1.35, p ≈ 0.007 |
| ypc mean, carry-weighted | **4.532** | **4.360** | +3.9% |
| ypc sd, 150-249 carries | 0.72-0.81 | 0.48-0.50 | where the excess lives |
| carries, rank 5 | 255 | 247 | correct |
| ypc, rank 5 | 5.29 | 4.95 | +6.9% — the whole gap |

The sim's rank-5 rushing season divided by that 6.9% is 1,230 against a real
1,222, so top-end ypc accounts for the entire `rb5RushYds` overage on its own.

**Design call, 2026-08-31.** `runPlay` levered yards and breakout chance around
a hardcoded 60. That is replacement-level, not the middle of the starting
population. The hypothesized centre of ~70 is the QB-arm middle (§5.9); this
blend (`elu 0.4 + acc 0.25 + spd 0.2 + agi 0.15`) on the 32 depth-chart lead
backs measures **~78** on a fresh league (76.9 / 77.9 / 78.2 / 78.9 across four
seeds). A hardcoded 70 would have been an 8-point level shift dressed as
compression. A generation-time freeze of the year-0 mean would become a level
shift as ratings age, new classes enter, and veterans decline — and it would
need a stored field plus a drift-guard.

So the centre is **recomputed each game from the current depth-chart RB1s**.
That stays a redistribution as the franchise ages: a back at today's population
mean produces the same expected yards the old formula gave him, and an elite
back sheds what a replacement back gains. Slope 0.049 → **0.024** on RB
carries only (jet sweeps and keepers keep the old lever — the sim's jet YPC is
already short of the real 5.86). `CARRY_SHARE` is not touched. `calibrate.ypc`
4.41 (band 4.46 ±0.35) and `calibrate.rushYds` 117.6 (band 119.8 ±10) held.

Panel `statcheck.rb5RushYds` **1357 → 1254** (1460/1342/1365/1273/1344 →
1269/1205/1328/1267/1203) against 1191 ±95. Stream moved; the 5-seed panel is
the verdict.

## 6. Starter availability — how much time a real starter misses

Added 2026-08-02 for `task/305-availability`. **PARTIAL: skill positions only.**
The OL and defensive cross-check from the nflverse injuries dataset is not yet
computed; those rows must be filled before any per-position rate outside
QB/RB/WR/TE is changed.

**Dataset.** nflverse `player_stats_YYYY.csv.gz`, 2018-2024, REG only
(<https://github.com/nflverse/nflverse-data/releases/download/player_stats/>).
The primary starter for a team-season is the leader in attempts (QB), carries
(RB) or targets (WR, TE); games appeared is the count of weeks with a stat row
for that player. n = 224 team-seasons per group.

**Validation.** Leading passers appearing in 16+ games reproduces at **45%**,
matching the independently computed anchor, as does the QB1 attempt-share
median of 89.4% in §5.3.

### 6.1 Games appeared, primary starter

| group | mean games | played 17 | 16+ | 14+ | under 14 |
|---|---|---|---|---|---|
| QB | 14.1 | 18% | 45% | 66% | 34% |
| RB | 14.7 | 19% | 43% | 75% | 25% |
| WR | 15.4 | 28% | 62% | 87% | 13% |
| TE | 14.2 | 13% | 35% | 69% | 31% |

**Caveat.** 2018-2020 are 16-game seasons, so the "played 17" column is
structurally impossible for three of the seven years and understates the true
17-game rate. The 16+ and 14+ columns and the mean are the load-bearing
figures; the 17 column is indicative only.

The headline is that a real primary starter misses roughly **three games a
season** — and a third of quarterbacks and tight ends miss four or more. This is
the mechanism behind §5's fat middle: a simulation whose starters play every
snap of every week hands ranks #5 through #20 a full season's volume that their
real counterparts never accumulate.

### 6.2 What the sim does instead

`rollWeeklyInjuries` (`lib/core/season/injuries.ts`) prices a week of exposure
as `0.0205 x workload x POSITION_RISK[pos] x durability x age x staff`, clamped
to [0.0008, 0.09]. For a healthy 25-year-old starting quarterback at typical
snap load that is about **0.018 per week**, so over a 17-week season the
expected number of injuries is ~0.31 and roughly **73% of starting quarterbacks
finish the season having missed nothing** — against a real 18%.

`POSITION_RISK` is the legitimate per-position lever and already exists:

    QB 0.75  RB 1.35  WR 1.20  TE 1.05  OT/OG 1.00  C 0.90
    EDGE 1.15  DT 1.10  LB 1.10  CB 1.20  S 1.00  K/P 0.15

Quarterback is the LOWEST-risk non-specialist entry in that table, which is
correct for in-play contact exposure and wrong for availability: the real QB
availability distribution (mean 14.1, the worst of the four groups measured) is
driven by the severity and knock-on cost of the injuries quarterbacks do get,
not by how often they are touched. Whether the repair belongs in incidence, in
duration (`WEEKLY_TABLE` ranges), or in both is the open design question, and it
must be settled against §6.1 rather than by moving one multiplier until a stat
line looks right.

### 6.3 OL and defence — attempted, and why the rows are still empty

The nflverse **injuries** dataset (weekly injury reports,
<https://github.com/nflverse/nflverse-data/releases/download/injuries/>) was
fetched for 2023 and 2024 (2021 and 2022 returned empty from the release
endpoint) and aggregated by counting weeks where `report_status == "Out"`,
grouped by position:

| group | players ever Out | mean weeks Out | median | 4+ weeks |
|---|---|---|---|---|
| QB | 27 | 1.81 | 1 | 7% |
| RB | 92 | 1.65 | 1 | 3% |
| WR | 147 | 1.73 | 1 | 7% |
| TE | 76 | 1.87 | 2 | 9% |
| OL | 195 | 1.86 | 2 | 7% |
| DL | 151 | 1.75 | 1 | 8% |
| LB | 159 | 1.78 | 1 | 8% |
| DB | 291 | 1.85 | 1 | 11% |
| ST | 17 | 1.53 | 1 | 0% |

**These figures must not be used as availability targets.** Every group lands
between 1.53 and 1.87 mean weeks out, which is not a plausible description of
real football: §6.1 measures genuine spread across positions (QB 14.1 games
against WR 15.4, 34% of QBs under 14 games against 13% of WRs). A source that
reports all nine groups within a third of a week of each other is measuring the
REPORT, not the ABSENCE.

The cause is structural. A weekly injury report lists players ruled out for
*that week's game*. A player placed on injured reserve generally stops appearing
on it, so exactly the long absences that drive the §6.1 distribution are the
ones this dataset drops. The league-wide total it yields — about 1,036
player-weeks a season — is therefore a FLOOR, not the real figure, and must not
be compared against `drift.playerWeeksLost` (~2,200) as though the sim were
twice as harsh as reality.

So the OL and defensive rows of §6.1 remain **unmeasured**, and the rule stated
when §6 was opened still stands: no per-position availability rate outside
QB/RB/WR/TE moves until it is measured. A correct source needs either snap
counts (nflverse `snap_counts`, games with zero snaps for an established
starter) or a transactions/IR feed. That is the next piece of work, and it is
cheap — it is one dataset and one aggregation, not a design question.

### 6.4 The tail floor — do not overcorrect

Recorded here so it outlives the task that found it. Availability has more
leverage on the record tail than its size suggests: in `task/304`, garbage-time
quarterback rotation moved only ~1.5% of pass attempts yet moved
`drift.passRecordSeasons` from 12.6 to 9.4 of 20 seasons. A full availability
pass targets roughly ten times that share of attempts, so it can plausibly
overshoot and make the tail too THIN.

The middle of the league is what should come down. The top must not deflate:

- `drift.passRecordSeasons` lands in **1-3 of 20 seasons, never 0.** Zero means
  the 5,477-yard record has become unreachable, which is as wrong as it falling
  every other year.
- `tails.bestSeasonPassYds` stays inside its existing band (5392 ±500).
- `statcheck.qb5PassYds` stays inside 4497 ±360 (§5.1).

If a fit lands `passRecordSeasons` at 0 across the panel, it has overcorrected.
Report that and reduce the availability change — do not compensate by inflating
production elsewhere, which would trade a measured error for an unmeasured one.

### 6.5 Established-starter availability — the fit targets

Computed from nflverse **snap_counts** 2018-2024, REG only
(<https://github.com/nflverse/nflverse-data/releases/download/snap_counts/>).
An established starter is a player taking >= 50% of his club's offensive or
defensive snaps in at least 8 appearances in that season; games missed is the
club's REG games minus his appearances. Note that `offense_pct` / `defense_pct`
in that file are FRACTIONS on 0-1, not percentages — reading them as percents
silently selects nobody.

This is the source §6.3 said was needed, and it closes the gap §6.1 left open.

**Method validation.** Run against the skill groups it reproduces §6.1's
quarterback row exactly (14.1 mean games, 45% at 16+, 34% under 14) and the
running-back row within 0.2 games.

**Why WR and TE read higher here than in §6.1, and which table to fit.** §6.1
measures the single statistical LEADER at each position — the one man who
accumulated the most targets, and therefore the one who was available to
accumulate them, which is a survivorship-selected population. §6.5 measures
every established starter. The injury model applies to all of them, so **§6.5 is
the fit target and §6.1's leader rows are the validation anchors.** Fitting to
§6.1 would over-injure, because it would treat a survivor's availability as the
average starter's.

| group | n | mean games | 17 (17-game era) | 16+ | 14+ | under 14 |
|---|---|---|---|---|---|---|
| QB | 227 | 14.1 | 34% | 45% | 66% | 34% |
| RB | 190 | 14.9 | 36% | 50% | 79% | 21% |
| WR | 629 | 14.8 | 40% | 54% | 76% | 24% |
| TE | 264 | 15.1 | 43% | 57% | 81% | 19% |
| OL | 1146 | 14.8 | 42% | 54% | 77% | 23% |
| DL | 711 | 15.3 | 49% | 63% | 86% | 14% |
| LB | 657 | 15.1 | 45% | 61% | 82% | 18% |
| DB | 1141 | 14.7 | 35% | 48% | 76% | 24% |

Quarterback is the worst group in the league on both moments — lowest mean
games and the largest share missing four or more — while taking the fewest hits.
That is the shape the joint fit has to reproduce: **hurt rarely, out long.**
Raising QB incidence alone would hit the mean through the wrong mechanism and
would show up as too many one-week absences and too few multi-week ones, so the
duration mix in `WEEKLY_TABLE` is the lever that has to carry the quarterback
row.

**League totals.** 709 established starters a season, 22.2 per club — a starting
lineup. Those starters lose **1,184 player-weeks a season**.

**Do not compare 1,184 against `drift.playerWeeksLost` (~2,200).** That metric
counts the entire rotation; 1,184 counts established starters only. The
comparable sim measurement is weeks missed by week-1 starters alone, and it has
to be measured that way before the two numbers mean anything next to each other.
This is the same class of mistake §6.3 caught with the injury-report floor, and
it points the same direction: it would read as the sim being roughly twice as
harsh as reality when it is in fact far too lenient (§6.2 — about 73% of
starting quarterbacks finish a season having missed nothing, against a real 34%
missing four games or more).

### 6.6 The 17-game equivalent — §6.5's table cannot be compared to the sim as printed

Added 2026-08-02. Nothing new was fetched for this; it is arithmetic on §6.5's
own figures, and it needed doing because the first fit against §6.5 aimed at the
wrong number and over-injured every starter by about a fifth of a game.

§6.5 spans 2018-2024. **2018, 2019 and 2020 were 16-game seasons.** Its "mean
games" column is therefore an average over clubs that played 16 games and clubs
that played 17, and the sim plays 17. Comparing the two directly asks the sim to
reproduce an attendance figure that a 17-game league structurally cannot.

The mix does not have to be assumed — §6.5 pins it twice over, from two figures
already in the table:

    n-weighted mean games, eight groups   = 14.88
    league total 1,184 weeks / 709 starters = 1.67 games missed per starter
    => mean club REG games = 14.88 + 1.67  = 16.55

which is what a 3-to-4 split of 16- and 17-game seasons gives ((3x16+4x17)/7 =
16.57). The two agree to within a rounding step, so the era mix is confirmed,
not inferred.

The era-invariant quantity is the **missed-game RATE**, not the game count:

    rate_g   = (16.55 - meanGames_g) / 16.55
    games17_g = 17 x (1 - rate_g)

| group | §6.5 mean | missed rate | **17-game target** |
|---|---|---|---|
| QB | 14.1 | 14.80% | **14.48** |
| RB | 14.9 |  9.97% | **15.31** |
| WR | 14.8 | 10.57% | **15.20** |
| TE | 15.1 |  8.76% | **15.51** |
| OL | 14.8 | 10.57% | **15.20** |
| DL | 15.3 |  7.55% | **15.72** |
| LB | 15.1 |  8.76% | **15.51** |
| DB | 14.7 | 11.18% | **15.10** |

n-weighted, that is 15.28 games and 1.72 missed per starter against the printed
14.88 and 1.67 — the sim has to be **0.4 games a season more available** than
§6.5's column reads, per starter, or it is over-injuring.

The same conversion carries the league total:

    1,184 x 17 / 16.55 = **1,216 established-starter weeks lost a season**

That figure is the fit target for the sim's week-1 starter population, scaled by
that population's size (the sim fields ~21 offensive and defensive starters a
club against §6.5's 22.2, so ~1,170 at the sim's own headcount).

**The 16+ column is NOT convertible and must not be era-corrected.** "16 or more
of 16" is perfect attendance; "16 or more of 17" allows one absence. A 17-game
sim reproducing the real missed-game rate will read HIGH on that column by
construction, and it does — roughly +8 points. It stays in the table as a shape
check on the often-and-brief against rare-and-long split, not as a target.

**What this does not fix.** `drift.playerWeeksLost` is a different population
and a different question; see §6.7.

### 6.7 `drift.playerWeeksLost` is about half roster churn, not absence

Added 2026-08-02, measured while fitting §6.5. Recorded because the metric reads
as an injury guard and is not one, and anyone tuning availability against it
will be misled the way this task was.

The metric is, verbatim: for every player with more than 100 snaps in the
season, `17 - games`, summed. But a player earns a box-score row only when he is
credited a snap at his depth-chart slot, and `SNAP_SHARE` credits roughly the
top four at each position. So a fifth receiver who covers five weeks of injuries
finishes with ~190 snaps, five games, and **twelve "weeks lost" without ever
having been hurt.** A late signing and a mid-season cut read the same way.

Measured over 20 league-seasons (5 seeds x 4 seasons), splitting the total into
`min(weeks lost, weeks actually carrying an injury)` and the remainder:

| | injury-explained | roster churn | total |
|---|---|---|---|
| before the availability pass | 1,205 | 1,355 | 2,560 |
| after | 1,466 | 1,402 | 2,868 |

Churn is **~49% of the metric**, and it scales with starter absence at roughly
1.2 churn-weeks per extra starter-week, because every starter who goes down
promotes a fringe player into the >100-snap population carrying his own bench
weeks with him. The metric therefore amplifies a real availability change by
about 2.2x.

Two consequences:

- The baseline (2,158 ±700) is self-consistent as a **regression guard** — it
  was measured with the same overcount — and it is not a statement about real
  football. The real-league comparison in its `nfl` field (~2,200) is not
  measuring the same thing and should not be treated as a target.
- A correct §6.5 fit sits near the top of that band, not in the middle. There is
  no setting of the injury model that puts starter availability at §6.5 and this
  metric at 2,158; the arithmetic floor with backups made perfectly injury-proof
  is about 2,890.

The honest repair, when someone takes it on, is to credit a box-score row to
every dressed player rather than only to those who take a scrimmage snap — which
is a change to what `games` MEANS across `statcheck`, `careers` and the player
pages, so it is a design pass, not a tuning step. Until then the metric is a
churn-plus-absence composite and should be read as one.
### 6.8 The record guard, reconditioned — and the era-matched QB refit

Added 2026-08-03 for `task/308-qb-close`. Two numbers, both computed here
before either was acted on.

**A. `drift.passRecordSeasons` was counting the wrong yards.** The harness read
each season's stat line after advancing to `offseason-recap`, and `playoffs.ts`
calls `applyGameStats` into that same row — so it compared REG + POST passing
yards against Manning's 5,477, which is a REGULAR-SEASON record. Measured on
twelve matched sim seasons, the best passing season reads **5,316 with the
playoffs in it and 4,735 without**: the guard was inflated by roughly 580 yards
at rank 1. The harness now snapshots the three single-season marks at the end of
the regular season and takes everything else, `playerWeeksLost` included, where
it always took it.

**The reading, and it is the finding.** 5 seeds x 20 seasons, reconditioned:
**0 of 20 on every seed**, before and after the QB refit below.

| | inflated (REG+POST) | reconditioned (REG only) |
|---|---|---|
| `drift.passRecordSeasons`, 5-seed panel | 5.0 of 20 | **0.0 of 20** |

§6.4 requires 1-3 of 20 and says explicitly that **zero is as wrong as the
record falling every other year** — it means the 5,477-yard season has become
unreachable. It has. The sim's best REGULAR-SEASON passing year runs about
4,600-4,700, roughly four standard deviations short of the record, and that is
the same defect that has `statcheck.qb5PassYds` and `qb10PassYds` under their
floors: elite per-play production is too flat, top-to-mid ratio 1.23x against a
real 1.48x. It is assigned to its own packet and is NOT an availability
problem.

**The guard's max is therefore set from §6.4's discipline, not from today's
reading**: `max: 3` of 20, down from the 10 that was locked against the
inflated measurement. The floor (`min: 1`) is deliberately NOT added yet,
because it would red-gate a defect that already has an owner; it should be
added the moment elite production is fixed, and until then this guard passes
for the wrong reason. That is written down here so the next reader does not
mistake a green line for a healthy tail.

**B. The QB availability refit, era-matched.** §6.6 established that §6.5's
blended column understates a 17-game target. Computed directly on the 17-game
era (nflverse weekly, 2021-2024, QB1 = his club's leader in attempts, n = 128
team-seasons):

| | real 17-game era | sim before | sim after |
|---|---|---|---|
| mean games of 17 | **14.23** | 15.11 | **14.27** |
| games missed | **2.77** | 1.89 | **2.73** |
| played all 17 | **32%** | 50% | **36%** |
| 16+ games | 46% | 59% | 41% |
| under 14 games | 35% | 27% | 42% |

Fitted jointly on the two moments §6.5 prescribes, QB group only:
`POSITION_RISK.QB` 0.98 -> **1.62** (incidence, which is what moves the
played-all-17 share) and `POSITION_DURATION.QB` 2.0 -> **1.78** (duration,
trimmed so the mean lands with the extra incidence). The mean and the all-17
share both land; the 16+ share comes in 5 points light and under-14 7 points
heavy, because `WEEKLY_TABLE` is shared across positions and only scales, so a
QB-specific bimodality — hurt rarely, out long — cannot be expressed without a
per-position table. That residual is recorded, not tuned around.

**C. `statcheck.qb20PassYds` cannot be resolved by a 5-seed panel.** Its
per-seed spread is large: 60-seed sd **154**, paired sd across a code change
**194**, so the panel's standard error is about +/-70 and two panels of the same
code can differ by 150 yards. Read it at 60 seeds — `statcheck` simulates one
season and a 60-seed sweep costs about fifteen seconds — and treat any panel
movement smaller than ~170 as noise.

