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

A real NFL starting quarterback misses time — injury, benching, a lost job —
often enough that the average one throws 82% of his club's passes, not ~100%.
That is the mechanism behind the real #10 and #20 passing figures being far
below what a full-season starter accumulates, and it is what a simulation whose
starters never miss a snap cannot reproduce. See `docs/HANDOFF.md` for the
measured sim comparison.

---

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
