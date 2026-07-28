# Draft outcome research — 2018–2022 NFL classes

Date: 2026-07-28  
Scope: NFL draft classes 2018–2022, drafted players rounds 1–7, plus UDFA entrants observable in public nflverse data.  
Primary artifact: Google Sheet — https://docs.google.com/spreadsheets/d/1IIh87vX7sNPbxZi0r4yICNOPK3d6Qx968pKmhvbFCIM/edit

This document captures the research, key findings, and tuning opinions for Gridiron GM's draft, rookie development, and UDFA systems.

---

## Executive summary

The current Gridiron GM draft model should not treat the draft as seven equal rounds plus leftover free agents. The real NFL curve is sharper and more nuanced:

- Round 1 produces most of the reliable high-end outcomes, but even Round 1 is not a guaranteed star pipeline.
- Round 2 still produces real starters/stars, but is materially worse than Round 1.
- Round 3 is the transition zone: meaningful upside remains, but below-average outcomes become common.
- Rounds 4–5 are depth/contributor rounds with occasional spikes.
- Rounds 6–7 are mostly fringe roster/depth/special teams outcomes with rare hits.
- UDFAs are not garbage; the NFL signs a huge UDFA population, and a meaningful minority become contributors. But core-starter UDFA outcomes are rare.

Design implication: the sim needs separate calibration curves for:

1. Pick band
2. Position
3. Drafted vs. UDFA entry
4. Scouting uncertainty / hidden potential
5. Roster opportunity and development environment

Do not use one generic rookie talent curve.

---

## Data sources and method

### Main data sources

- `nflverse` draft picks CSV: `https://github.com/nflverse/nflverse-data/releases/download/draft_picks/draft_picks.csv`
  - Used for drafted players, positions, draft round/pick, games, starts, Approximate Value fields, Pro Bowl counts, and All-Pro counts.
- `nflverse` players CSV: `https://github.com/nflverse/nflverse-data/releases/download/players/players.csv`
  - Used to identify likely UDFA entrants: `rookie_season` 2018–2022 and no draft year/round/pick.
- `nflverse` weekly rosters and snap counts, 2018–2025
  - Used to separate UDFAs who merely entered the data ecosystem from those who made active rosters or played snaps.
- Wikipedia player pages and Pro Bowl / All-Pro roster pages
  - Used only for hand-enriched Round 1 Pro Bowl years and first-/second-team All-Pro timing.

### Caveats

- There is no clean public canonical database for every UDFA contract, camp invite, tryout, and transaction.
- UDFA findings here mean: players who entered the public NFL data ecosystem with a rookie season from 2018–2022 and no draft record.
- Pro Bowl is popularity/reputation-biased. It is useful as a star-recognition signal, but it should not be the main performance metric.
- All-Pro is stricter but sparse. It is a good elite-performance signal, not enough by itself to classify the whole population.
- Approximate Value is imperfect, but it is public, position-spanning, and gives every player a numeric career-value baseline.

---

## Round 1 research

### First-round sample

- 160 players: every first-round pick from 2018–2022.
- 32 first-rounders per class.

### Pro Bowl outcomes

| Metric | Count | Share |
|---|---:|---:|
| Total first-round picks | 160 | 100.0% |
| Never made a Pro Bowl | 102 | 63.7% |
| Made at least one Pro Bowl | 58 | 36.2% |

Time to first Pro Bowl:

| Time to first Pro Bowl | Count | Share of all R1 | Share of Pro Bowlers |
|---|---:|---:|---:|
| Rookie year | 16 | 10.0% | 27.6% |
| Second year | 17 | 10.6% | 29.3% |
| Third year | 9 | 5.6% | 15.5% |
| Year 4 | 9 | 5.6% | 15.5% |
| Year 5 | 4 | 2.5% | 6.9% |
| Year 6 | 2 | 1.2% | 3.4% |
| Year 7 | 1 | 0.6% | 1.7% |

Interpretation:

- If a first-rounder becomes a Pro Bowler, it usually shows up fast.
- 72.4% of Round 1 Pro Bowlers made it by year 3.
- 87.9% made it by year 4.
- Late first-time Pro Bowl breakouts should exist, but be rare.

### Pro Bowl by position group

| Position group | First-rounders | Made Pro Bowl | Never made PB | Hit rate | Rookie-year PB | By year 2 | By year 3 | Avg years to first PB |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| QB | 18 | 10 | 8 | 55.6% | 1 | 5 | 7 | 3.20 |
| Skill: RB/WR/TE | 32 | 9 | 23 | 28.1% | 5 | 8 | 8 | 1.78 |
| OL | 33 | 8 | 25 | 24.2% | 2 | 6 | 7 | 2.12 |
| DL/Edge | 31 | 12 | 19 | 38.7% | 2 | 3 | 6 | 3.25 |
| LB | 19 | 10 | 9 | 52.6% | 3 | 5 | 6 | 2.90 |
| DB | 27 | 9 | 18 | 33.3% | 3 | 6 | 8 | 2.11 |

Interpretation:

- QB and LB had the highest first-round Pro Bowl rates in this sample.
- OL and skill players had the lowest Pro Bowl rates.
- Skill-position hits reveal early; 8 of 9 skill Pro Bowlers made it by year 2.
- DL/Edge reveals slower; only 3 of 12 DL/Edge Pro Bowlers made it by year 2.

### All-Pro outcomes

All-Pro is a stricter performance marker than Pro Bowl.

| Metric | Count | Share |
|---|---:|---:|
| Total first-round picks | 160 | 100.0% |
| Never made first- or second-team All-Pro | 119 | 74.4% |
| Made any first- or second-team All-Pro | 41 | 25.6% |
| Made first-team All-Pro at least once | 22 | 13.8% |
| Second-team only, never first-team | 19 | 11.9% |

Time to first All-Pro:

| Time to first All-Pro | Count | Share of all R1 | Share of All-Pro players |
|---|---:|---:|---:|
| Rookie year | 8 | 5.0% | 19.5% |
| Second year | 9 | 5.6% | 22.0% |
| Third year | 10 | 6.2% | 24.4% |
| Year 4 | 10 | 6.2% | 24.4% |
| Year 5 | 1 | 0.6% | 2.4% |
| Year 6 | 1 | 0.6% | 2.4% |
| Year 7 | 2 | 1.2% | 4.9% |

Position influence:

| Position group | First-rounders | Any All-Pro | Hit rate | First-team AP | Second-team only |
|---|---:|---:|---:|---:|---:|
| QB | 18 | 2 | 11.1% | 1 | 1 |
| Skill: RB/WR/TE | 32 | 9 | 28.1% | 5 | 4 |
| OL | 33 | 8 | 24.2% | 3 | 5 |
| DL/Edge | 31 | 6 | 19.4% | 3 | 3 |
| LB | 19 | 7 | 36.8% | 3 | 4 |
| DB | 27 | 9 | 33.3% | 7 | 2 |

Interpretation:

- All-Pro should be the game's elite marker, not Pro Bowl.
- Any first-/second-team All-Pro outcome among first-rounders should be rare: about 25.6%.
- First-team All-Pro should be very rare: about 13.8%.
- QB Pro Bowl rate looks high, but QB All-Pro rate is low because All-Pro QB slots are brutally scarce.
- DB and LB had the strongest All-Pro hit rates in this sample.
- Most All-Pro players reveal by year 4: 37 of 41, or 90.2%.

---

## AV-based outcome model

The better baseline model uses public value/role data, then treats awards as modifiers.

Recommended conceptual weighting:

| Component | Weight | Why |
|---|---:|---|
| Position-normalized AV | 50% | Best public cross-position career-value baseline |
| Role/durability | 25% | Games, starts, snap participation; separates real contributors from paper talent |
| Awards | 15% | All-Pro / Pro Bowl signal true league recognition |
| Draft-team value / market validation | 10% | Captures whether the player produced for the drafting team; contract data can improve this later |

Round 1 AV/year distribution from the 2018–2022 set:

| Percentile | AV/year |
|---:|---:|
| 10th | 1.66 |
| 25th | 3.15 |
| Median | 5.31 |
| 75th | 7.58 |
| 90th | 9.45 |
| 95th | 10.67 |

Rough global AV/year interpretation:

| Bucket | AV/year |
|---|---:|
| Bust / non-factor | < 1 |
| Below average | 1–3 |
| Average starter | 3–5 |
| Above average | 5–7 |
| Star | 7–9 |
| Elite | 9+ |

Caveat: do not hard-code global AV/year thresholds alone. Convert to position percentiles because positional baselines differ.

### Outcome bucket definitions

| Tier | Definition |
|---|---|
| Elite | Multiple first-team All-Pro, top positional AV percentile, or game-warping franchise player |
| Star | First-team All-Pro once, multiple second-team All-Pros, or high position-normalized AV percentile |
| Above average | Long-term good starter, strong AV, maybe Pro Bowl but no All-Pro; valuable core player |
| Average | Regular starter / rotation starter; useful but replaceable |
| Below average | Meaningful snaps but failed to become a reliable starter; backup / low-end starter |
| Bust | Minimal value relative to draft slot; low games, low AV, no meaningful role |

### Round 1 outcome model result

| Tier | Count | Share |
|---|---:|---:|
| Elite | 19 | 11.9% |
| Star | 15 | 9.4% |
| Above average | 34 | 21.2% |
| Average | 15 | 9.4% |
| Below average | 55 | 34.4% |
| Bust | 22 | 13.8% |

Interpretation:

- Round 1 `Above average or better`: 68 of 160 — 42.5%.
- Round 1 `Star or Elite`: 34 of 160 — 21.3%.
- Round 1 `Elite`: 19 of 160 — 11.9%.
- Round 1 `Bust + below average`: 77 of 160 — 48.1%.

Opinion: for the game, "good first-round pick" should not mean Pro Bowl. A player can be a strong successful Round 1 pick without a Pro Bowl. Conversely, some Pro Bowls are reputation outcomes and should not automatically imply elite ability.

---

## All drafted players, rounds 1–7

The all-round model used nflverse-only fields for broad calibration:

- `w_av`
- `dr_av`
- games
- seasons started
- Pro Bowl count
- All-Pro count
- position-normalized AV
- role/durability score
- award score
- outcome tier

### Outcome by round

| Round | Players | Elite | Star | Above avg | Average | Below avg | Bust | Star+ | Above avg+ | Bust |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 160 | 13 | 56 | 50 | 13 | 24 | 4 | 43.1% | 74.4% | 2.5% |
| 2 | 160 | 2 | 40 | 48 | 14 | 52 | 4 | 26.2% | 56.2% | 2.5% |
| 3 | 198 | 2 | 20 | 57 | 16 | 90 | 13 | 11.1% | 39.9% | 6.6% |
| 4 | 190 | 1 | 6 | 42 | 10 | 101 | 30 | 3.7% | 25.8% | 15.8% |
| 5 | 181 | 0 | 11 | 26 | 12 | 96 | 36 | 6.1% | 20.4% | 19.9% |
| 6 | 206 | 0 | 3 | 17 | 13 | 114 | 59 | 1.5% | 9.7% | 28.6% |
| 7 | 191 | 0 | 5 | 11 | 7 | 89 | 79 | 2.6% | 8.4% | 41.4% |

Interpretation:

- Round 2 remains valuable, but it is not Round 1.
- Round 3 is where the failure rate begins to dominate.
- Rounds 4–5 need hidden-gem logic, not reliable-starter logic.
- Rounds 6–7 are mostly roster fringe/depth; elite outcomes should be extremely rare.

### Pick-range curve

Pick range is more useful than round alone.

| Pick range | Players | Star+ | Above avg+ | Bust | Median AV/yr |
|---|---:|---:|---:|---:|---:|
| 1–16 | 80 | 58.8% | 83.8% | 0.0% | 6.39 |
| 17–32 | 80 | 27.5% | 65.0% | 5.0% | 4.00 |
| 33–64 | 160 | 26.2% | 56.2% | 2.5% | 3.54 |
| 65–100 | 180 | 11.1% | 40.6% | 5.6% | 2.31 |
| 101–150 | 250 | 4.8% | 26.8% | 14.8% | 1.25 |
| 151–200 | 250 | 3.6% | 15.2% | 24.0% | 0.69 |
| 201+ | 284 | 2.1% | 7.7% | 38.4% | 0.27 |

Opinion: the engine should use pick bands under the hood, not only round labels.

Recommended pick bands:

- 1–16
- 17–32
- 33–64
- 65–100
- 101–150
- 151–200
- 201+
- UDFA

---

## UDFA research

### UDFA funnel

| Outcome | Count | Share |
|---|---:|---:|
| NFL-system UDFA entrants | 1,515 | 100.0% |
| Made active roster at least once | 964 | 63.6% |
| Played regular-season snaps | 904 | 59.7% |
| Contributor / special teams or better | 474 | 31.3% |
| Starter / rotation hit or better | 234 | 15.4% |
| Core starter / major hit | 38 | 2.5% |
| No regular-season roster/snap evidence | 551 | 36.4% |

### UDFA outcome tiers

| UDFA outcome tier | Count | Share |
|---|---:|---:|
| Core starter / major hit | 38 | 2.5% |
| Starter / rotation hit | 196 | 12.9% |
| Contributor / special teams | 240 | 15.8% |
| Cup of coffee | 490 | 32.3% |
| No regular-season roster/snap evidence | 551 | 36.4% |

### By rookie class

| Rookie year | UDFAs | Active roster | Played snaps | Contributor+ | Starter+ |
|---|---:|---:|---:|---:|---:|
| 2018 | 321 | 65.7% | 60.4% | 36.4% | 23.1% |
| 2019 | 356 | 61.0% | 57.9% | 35.4% | 18.3% |
| 2020 | 314 | 70.1% | 65.9% | 28.7% | 11.5% |
| 2021 | 213 | 56.3% | 51.6% | 22.1% | 10.3% |
| 2022 | 311 | 63.0% | 60.1% | 30.2% | 11.9% |
| Total | 1,515 | 63.6% | 59.7% | 31.3% | 15.4% |

Example UDFA hits from the sample:

- Terence Steele
- Charvarius Ward
- Frankie Luvu
- T.J. Edwards
- Darious Williams
- Jakobi Meyers
- Robert Spillane
- Patrick Mekari
- Aaron Brewer
- Poona Ford
- Allen Lazard

Interpretation:

- UDFAs should not be pure garbage.
- A lot of them get some NFL opportunity.
- The real hit rate is still narrow: roughly 31% contributor+, 15% starter/rotation+, and 2.5% major-hit.
- The sim should create many UDFA/camp players, but most should be cheap, low-floor, uncertain, and cuttable.

Opinion: UDFA design should not be "random starter generator." It should be:

- hidden potential
- poor initial scouting certainty
- low floor
- low cost
- high churn
- opportunity-dependent development
- occasional big spike if development and roster opportunity line up

---

## Current Gridiron GM comparison

### Current v2 files checked

- `v2/lib/core/offseason/draft.ts`
- `v2/scripts/careers.ts`
- `v2/lib/core/outcomes.ts`

Command run:

```bash
cd /Users/mearls/Projects/gridiron-gm/v2
npx tsx scripts/careers.ts 25 12345
```

### Current v2 gaps

| Area | Current v2 | Research / target | Diagnosis |
|---|---:|---:|---|
| Draft class size | `224 + rng.int(-10, 20)` | ~257 drafted plus ~303 UDFA entrants per class | Too few total prospects and almost no UDFA pool |
| Mature careers in harness | 2,893 drafted / 111 undrafted | UDFAs should be more numerous than drafted players | UDFA volume is massively under-modeled |
| R1 QB share | 39.2% | 11.3% in 2018–2022 sample | CPU board/position weighting still over-drafts QBs |
| R4 rostered Y3 | 84.9% | 42.6% target in harness | Late rounds are too sticky |
| R5 rostered Y3 | 75.5% | 42.6% target in harness | Late rounds are too sticky |
| R6 rostered Y3 | 63.7% | 42.6% target in harness | Late rounds are too sticky |
| R7 rostered Y3 | 60.2% | 42.6% target in harness | Late rounds are too sticky |
| UDFA 4+ year starter | 24.3% | Research starter/rotation+ 15.4%; core hit 2.5% | Too few UDFAs, and the ones that exist are too strong |

### Current v2 career harness output by round

| Round | 4+ yr starter sim | Real target in code | Rostered Y3 sim | Real target in code |
|---|---:|---:|---:|---:|
| 1 | 51.7% | 70.6% | 92.8% | 85.0% |
| 2 | 50.5% | 49.0% | 92.1% | 68.8% |
| 3 | 40.1% | 28.8% | 85.6% | 68.8% |
| 4 | 36.8% | 20.1% | 84.9% | 42.6% |
| 5 | 32.5% | 14.9% | 75.5% | 42.6% |
| 6 | 17.5% | 8.7% | 63.7% | 42.6% |
| 7 | 14.4% | 5.9% | 60.2% | 42.6% |
| UDFA | 24.3% | — | 74.8% | — |

Read: late-round and UDFA outcomes are too generous, while Round 1 star output is under-shaped.

### Legacy/Supabase generator checked

Files:

- `app/api/offseason/advance-to-season/route.ts`
- `lib/player-generator.ts`
- `supabase/migrations/20240101000060_create_undrafted_prospects_table.sql`

Current legacy class generator:

```text
350 prospects:
- 42 elite
- 123 mid
- 133 late
- 52 bust
```

Current legacy rating bands:

```text
Elite: OVR 80–90, POT 85–99
Mid:   OVR 70–79, POT 75–89
Late:  OVR 60–69, POT 70–84
Bust:  OVR 55–59, POT 60–74
```

Diagnosis:

- This creates 165 players at 70+ OVR before development.
- That is far too many starter-quality rookies.
- The post-draft leftover pool is also too good, making UDFAs too strong.

---

## Recommended calibration changes

### 1. Split draftable prospects from UDFA/camp pool

Do not generate one 224-ish pool and draft nearly all of it.

Recommended annual population:

| Pool | Count | Purpose |
|---|---:|---|
| Draft-board pool | 260–270 | Supports 7 rounds plus comp-pick style variance |
| UDFA/camp pool | 250–350 | Cheap, noisy, mostly low-floor post-draft population |

### 2. Generate by pick-band outcome curves

Replace generic `elite / mid / late / bust` class counts with outcome curves by pick band.

Recommended bands:

| Band | Expected design feel |
|---|---|
| 1–16 | High floor, real star ceiling, still missable |
| 17–32 | Good player more likely than star; more variance |
| 33–64 | Legit starter chance, lower star ceiling |
| 65–100 | Transition zone; many below-average outcomes |
| 101–150 | Depth/contributor baseline, rare starter hits |
| 151–200 | Fringe/depth baseline, rare gems |
| 201+ | Mostly roster fringe, special teams, practice squad |
| UDFA | Many entrants, heavy churn, rare major hits |

### 3. Lower late-round and UDFA rating floors

Current late/bust bands are too generous.

Recommended late-round/UDFA ranges should include many players like:

- OVR 45–58
- POT 55–70
- rare hidden POT 75–85 spikes
- very rare 85+ spikes

The exact scale should be calibrated against the career harness, not copied blindly.

### 4. Fix position distribution and CPU board value

Round 1 should not be 39% QBs.

2018–2022 first-round position distribution:

| Group | Share |
|---|---:|
| QB | 11.3% |
| OL | 20.6% |
| Skill: RB/WR/TE | 20.0% |
| DL/Edge | 19.4% |
| DB | 16.9% |
| LB | 11.9% |

Implementation opinion:

- Keep QB value high, but cap/shape how often draft classes create first-round-grade QBs.
- CPU draft value should use ability above replacement and need, but should not double-count positional value so hard that QBs dominate Round 1.
- QB should have a steep pick cliff: first-round QBs can be worth the swing; second-/third-round QBs should be close to lottery tickets.

### 5. Tune roster churn, not just rookie generation

The late-round problem is not only generation. Players are also sticking too long.

Needed mechanics:

- More aggressive year-2/year-3 cuts for low-performing Day 3 picks.
- Practice squad / fringe roster churn.
- CPU roster management that prefers replacement-level veterans over stalled late picks where appropriate.
- Opportunity bottlenecks: not every late-round potential spike gets snaps.

---

## Game design opinions

### Draft pick slot should change the floor more than the ceiling

Early picks should not guarantee elite outcomes. The main advantage is fewer total washouts and more above-average outcomes.

### Scouting/development randomness should mostly change the ceiling

The fun is finding the player whose true ceiling was mispriced — not having pick 7 automatically become a star.

### Hidden potential is mandatory

Without hidden potential, the draft becomes sorting. The game needs:

- public consensus board
- team-specific scouting estimates
- error bands
- true hidden ability/potential
- evaluator bias by scout/front office/personality

### UDFAs should be plentiful and cheap, but not mostly good

The offseason should produce enough UDFA names for camp battles and depth decisions. Most should churn. A few should become meaningful contributors. A tiny number should become major hits.

### Position curves should differ

Examples:

- Skill-position stars usually reveal early.
- DL/Edge and QB need longer tails.
- Interior OL can have a higher late-round usefulness rate.
- QB after Round 1 should be a low-probability, high-impact lottery ticket.

---

## Implementation sequence

1. Add a draft calibration config file.
   - pick-band probabilities
   - position distribution by band
   - UDFA outcome probabilities
   - late-round/UDFA rating ranges
2. Replace hardcoded legacy tier counts and v2 one-pool generation.
3. Generate separate draft-board and UDFA/camp populations.
4. Fix Round 1 position distribution, especially QB volume.
5. Lower late-round and UDFA floors.
6. Add/tune roster churn for late picks and UDFAs.
7. Re-run career harness:

```bash
cd /Users/mearls/Projects/gridiron-gm/v2
npx tsx scripts/careers.ts 25 12345
```

8. Compare against the Google Sheet tabs:
   - `Outcome by round`
   - `Outcome round x position`
   - `Pick range curve`
   - `Draft model probabilities`
   - `UDFA class summary`
   - `UDFA outcome tiers`
   - `UDFA by position`

---

## Bottom line

The research supports a more realistic and more fun draft model:

- High picks are safer, not automatic.
- Round 2 matters.
- Round 3 is the hinge.
- Day 3 is mostly depth with rare gems.
- UDFAs are a large, noisy, cheap talent market.
- Position and opportunity matter as much as raw talent.

Current Gridiron GM is not calibrated to that yet. The next draft-system pass should make the engine match these curves before adding more UI around draft day.
