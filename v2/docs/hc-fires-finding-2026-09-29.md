# HC fires finding — 2026-09-29

Wave 4.3. **Docs / FINDING only.** No engine, dial, `docs/baselines.json`,
or `scripts/` edits. Report-never-tune until Matt signs a mechanism.

Studio panel (`gate:full:serial`, 5 seeds, tip `b2e22ea`, HANDOFF
2026-09-29): `drift.hcFiresPerSeason` **1.68** (1.45 / 1.5 / 1.6 / 1.85 / 2).
Signed expect **6–8 / year** (Wave 3.7 Packet 3b / Wave 4.0 Packet 3).
Pre-#111 the same emit was **0.00** because headless leagues had no
owners. Owners are seeded now. The counter is live. The rate is the gate.

`docs/nfl-reference.md` has **no** head-coach firing rate. The 6–8
figure is a signed product expect in `HANDOFF.md`. `docs/front-office-design-2026-07-28.md`
§1.3 records head-coach **tenure** of 3.2–3.9 years (a different
statistic). Invariant 7: an untraced rate stays ungated.

---

## Verdict

`drift.hcFiresPerSeason` counts owner-heat CPU head-coach dismissals.
On a drift-shaped 20-season run of panel seed 1 (`GG_SEED=1` →
`seedFor(12345)` = **506939785**) the mean is **1.450**, the same 1.45
that leads the Studio series. A reconstruction of the recap gate matched
`seasonCounters.hcFires` in all 20 seasons (**0 mismatches**). The
harness is reading the fire site.

The rate sits near 1.5–2 because two filters stack, and the first one
does most of the work:

1. **Heat rarely clears the signed line, and the clubs with the worst
   records almost never do.** Across 620 CPU team-seasons (31 clubs ×
   20 years), **62 (10.0%)** had heat at or above
   `62 + 28×patience`. Median heat was **10.4**. Rebuild clubs (mean
   **5.91** wins, target **6**) were hot **0 / 162**. Contend clubs
   (mean **11.16** wins, target **10**) were hot **45 / 165 (27%)**.
   Retool (mean **8.60** wins, target **8**) were hot **17 / 293 (6%)**.
   `teamOutlook` drops the win target as the record drops, so a 3–6 win
   club is judged against 6, not against 10. The miss that would trip
   the line does not accumulate.

2. **Of the seats that are hot, about half do not increment the
   counter.** 29 of 62 hot team-seasons fired. **25** were inside the
   two-season look (`hcTenureSeasons < 2`). **7** had a legal tenure and
   a hot seat, and `tickCoachContracts` expired the deal before
   `fireCpuHeadCoaches` ran. **1** was both. Clearing every block on
   this seed would raise the mean from **1.45 to 3.10** fires/year.
   That is still under 6–8.

The planted unit path still fires. `##M people.cpuHcFiresPlanted` is
**15** when half the league is forced contend and planted at 3 wins
(`peopleTeeth.test.ts`). That plant is the gate working. Organic 3-win
clubs are rebuild, so the plant is not the live win/posture pair.

---

## What the harness counts

`scripts/drift.ts` averages `seasonCounters.hcFiresLast` (the live
`hcFires` field if rollover has not copied it yet) across every simulated
season, including the early years.

| piece | where | what it does |
|---|---|---|
| Increment | `fireCpuHeadCoaches` (`lib/core/coaches.ts`) | `hcFires += 1` only after `releaseCoach(..., "fired")` succeeds |
| Rollover | `rolloverTradeCounter` (`lib/core/trades.ts`) | `hcFiresLast = hcFires`, then `hcFires = 0`, at the end of `finalizeOffseason` |
| Emit | `drift.hcFiresPerSeason` | mean of those closed-year counts |

`releaseCoach(..., "expired")` does not touch `hcFires`. User-GM
`forcedMove` does not touch it. The user club is skipped inside
`fireCpuHeadCoaches`. `firingEnabled` is not read on this path (the
comment in `fireCpuHeadCoaches` says settings must not change the sim).
The function draws no random number. Owner patience and coach-contract
length come off the coaches/owner child streams; the fire decision
itself is a comparison.

On this seed, contract expiries averaged **7.70** CPU head coaches per
year (series below). They are real exits. They are a different event
from the emit.

---

## The gate, in order

`runRecap` (`lib/core/offseason/index.ts`) after `state.history.push`:

1. `tickCoachContracts` — every chair’s `yearsRemaining` drops by 1.
   At 0 the coach is released as **expired** and the chair is empty.
2. `fireCpuHeadCoaches` — CPU clubs only. Skip if there is no HC. Skip
   if `hcTenureSeasons < OWNER_MIN_SEASONS` (2). Skip if
   `ownerJobView` is missing or `heat < threshold`. Otherwise fire and
   increment `hcFires`.
3. `runCoachCarousel` — fills the empty chair. A recap hire’s
   `hiredSeason` is `state.season + 1` (`firstSeasonCoaching`).

Tenure is completed history rows with `season >= hiredSeason`
(`hcTenureSeasons`). It is the coach’s time in the chair. Heat is not.

### Heat

`heatFromSeasons` walks **every** franchise season in `state.history`,
under **today’s** `teamOutlook` posture, through `ownerHeatFor`:

- Targets (`OWNER_WIN_TARGET`): contend **10**, retool **8**, rebuild **6**.
- Patience band 0.35–0.80, mean 0.55. `foPatience = 1.2 − patience×0.6`.
  `cool = 0.4 + patience×0.4`.
- A miss adds `(target − wins) × foPatience × 8`, except a rebuild
  miss in history index `i <= 1`, which uses **3** instead of 8.
- A make (wins at or above the target) subtracts
  `(wins − target + 1) × cool × 6`.
- Clamp to 0–100 after each season. Heat does not reset when the HC
  changes.

Threshold (`fireHeatThreshold`): `62 + patience×28`. Impatient 0.35 →
**71.8**. Typical 0.55 → **77.4**. Patient 0.80 → **84.4**.

`teamOutlook` sets posture from last year’s wins, roster quality, age,
and `winNow`. Score above 0.75 is contend; below −0.75 is rebuild. A
3-win club’s win term alone is `(3 − 8.5) × 0.30 = −1.65`, which is
already rebuild before the other terms. The live probe’s 3-win
team-seasons were rebuild **15 / 15**.

Constant-win streaks at patience 0.55 (call `ownerHeatFor`, threshold
77.4). “Cross” is the first year heat reaches the line:

| posture | wins | heat after 2 years | crosses at |
|---|---:|---:|---|
| contend | 4 | 84 | year 2 |
| contend | 8 | 28 | year 6 |
| contend | 9 | 14 | year 12 |
| contend | 10+ | 0 | never |
| retool | 4 | 56 | year 3 |
| retool | 7 | 14 | year 12 |
| retool | 8+ | 0 | never |
| rebuild | 3 | 16 | year 5 |
| rebuild | 5 | 5 | never in 12 years (year 12 = 75) |
| rebuild | 6+ | 0 | never |

A typical-patience rebuild at 5 wins never fires inside a 12-year
streak. The probe’s rebuild mean is 5.91 wins and mean heat **7.5**.

One good year does not clear a pegged seat. A 12-win retool season
cools by about `(12 − 8 + 1) × cool × 6` ≈ 18 points. From the cap of
100 that still sits over a ~77 line. The logged WAS firing on this seed
is that shape: retool, **12 wins**, patience 0.53, heat **81.4** /
threshold **76.8**, tenure 2.

### Contracts, and why tick runs first

`contractFor` draws the term uniformly from 4–6 years, then draws
`yearsRemaining` uniformly from **1 through that term**. It does not
hand out a full term. Census of `newGame` across 400 seeds (12,400 CPU
HCs): mean `yearsRemaining` **3.007**, **P(R ≤ 2) = 0.405**,
**P(R ≥ 3) = 0.595**.

Because tick runs before the fire check:

- R = 1 expires at the first recap (tenure 1). No fire window.
- R = 2 expires at the second recap, the first recap where tenure
  would have allowed a fire. The chair is already empty.
- R ≥ 3 can be fired at the end of year 2, and expires at year R if
  heat never trips.

Carousel hires keep the market coach’s `yearsRemaining` when it is at
least 1 (`fillCpuChair`). Market coaches are built with the same
`contractFor` draw. A replacement is not handed a fresh 4–6 year term.

Desk bound, not a second sim: if every chair were hot every year, the
measured opening draw plus the two-season look plus tick-before-fire
produces about **0.33 fires per team-year**, or about **10 fires/year**
across 31 CPU clubs. The live league is hot on **10%** of team-seasons,
and only **47%** of those hot seats get through the tenure/expiry
filter: `0.10 × 0.47 × 31 ≈ 1.45`.

---

## Probe (one panel seed, not a re-lock)

Local read-only loop, same shape as `scripts/drift.ts`: `newGame`,
advance to `offseason-recap`, reconstruct heat with `ownerHeatFor` +
`teamOutlook` + this year’s standings appended to history, then
`advanceOffseason`. Not committed. Not a `scripts/` edit.

Seed **506939785**, 20 seasons, user club excluded.

Fires: `0,0,0,0,1,0,0,1,0,4,2,5,0,3,2,3,4,1,2,1` — mean **1.450**.

Expiries (HC id changed and `yearsRemaining` entering the recap was 1):
`8,7,7,10,5,9,6,10,6,9,5,7,6,12,8,7,4,9,10,9` — mean **7.70**.

Predicted fires equalled `seasonCounters.hcFires` every season.

| bucket | team-seasons | per year |
|---|---:|---:|
| Fired (counter) | 29 | 1.45 |
| Hot, blocked by tenure &lt; 2 | 25 | 1.25 |
| Hot, blocked by expiry the same recap | 7 | 0.35 |
| Hot, blocked by both | 1 | 0.05 |
| Eligible and under the line | 248 | 12.40 |
| Ineligible and under the line | 310 | 15.50 |
| CPU team-seasons | 620 | 31 |

Heat, all 620: mean **24.1**, p50 **10.4**, p90 **76.1**, p99 **100**,
max **100**. Among the 277 eligible windows, **13.0%** had heat ≥ 70
and **29 / 277 (10.5%)** were actually over that coach’s threshold.

| posture | n | hot | mean wins | mean heat | target |
|---|---:|---:|---:|---:|---:|
| contend | 165 | 45 (27.3%) | 11.16 | 42.7 | 10 |
| retool | 293 | 17 (5.8%) | 8.60 | 22.8 | 8 |
| rebuild | 162 | 0 (0%) | 5.91 | 7.5 | 6 |

The first four recaps fired nobody (tenure, and heat still under the
line). Seasons 10–20 of this seed (11 years) averaged **2.45**. That
mature slice is still under 6–8. Waiting for the league to age does not
close the gap on this seed.

Tenure entering the recap, after the season just played: 204 clubs at
1 year, 177 at 2, 124 at 3, 107 at 4, **6 at 5, 2 at 6**. The 4–6 year
band on `COACH_CONTRACT.hc` is the drawn term, not the served tenure.

Fires are not “a bad year just ended.” Logged examples from the same run:

| season | club | posture | wins | heat / line | tenure | years left |
|---|---|---|---:|---|---:|---:|
| 2035 | GB | contend | 11 | 92.0 / 80.4 | 3 | 2 |
| 2037 | WAS | retool | 12 | 81.4 / 76.8 | 2 | 3 |
| 2037 | DEN | contend | 11 | 92.9 / 75.3 | 2 | 3 |
| 2035 | LV | retool | 6 | 75.1 / 74.3 | 2 | 3 |

Blocked the same way, including a 14-win club: 2033 LA, contend,
**14 wins**, heat 85.4 / 71.8, tenure **1**, years left 4. The seat was
hot. The new coach was inside the two-season look.

Low-win team-seasons (6 wins or fewer) were rebuild or, less often,
retool. None were contend. Worst records and the contend target do not
meet in this league unless something forces `winNow` and roster quality
the way the plant does.

---

## Hypotheses checked

| hypothesis | result |
|---|---|
| Counter / rollover bug, or drift reading the wrong field | **Rejected.** Predicted gate matches `hcFires` 20/20. This seed’s 1.450 is the Studio series’ 1.45. Rollover copies the closed year onto `hcFiresLast` the same way as trades. |
| Owners still missing after #111 | **Rejected.** Fires are non-zero. The plant still returns 15. Pre-#111 0.00 was the null `ownerJobView` path; that path is closed. |
| `firingEnabled` or an RNG roll inside the fire | **Rejected.** CPU fires do not read the setting and do not draw. |
| User club excluded, so the league is 31/32 of the expect | **Too small.** One club does not turn 1.68 into 6–8. |
| Early-season zeros are the whole gap | **Partial, small.** Four leading zeros, then a mature slice at **2.45** on this seed. The published mean includes those zeros. The mature rate is still under 6–8. |
| Two-season cooldown and tick-before-fire | **Confirmed as the second filter.** 33 of 62 hot team-seasons do not increment the counter. Removing them yields **3.10/yr** here, still under 6–8. |
| Short `yearsRemaining` draw (1..term, not a full term) | **Confirmed as why many deals never open a window.** 40.5% of opening CPU HCs have R ≤ 2. Those expire before a heat fire is legal. |
| Heat threshold too high for organic misses, because posture lowers the target on bad clubs | **Confirmed as the volume constraint.** Rebuild 0/162 hot. Median heat 10.4 against lines of 72–84. Each posture’s mean wins sit about one win above its own target. |
| Heat is the current coach’s record | **Rejected.** Heat is the whole franchise history, re-scored under today’s posture, not reset on hire. Firings at 11 and 12 wins are in the log. |
| 6–8 is a traced NFL firing rate the sim is missing | **No such block.** `nfl-reference.md` does not state it. Tenure 3.2–3.9 years in the design note implies on the order of 9 coaching *changes* a year across 32 clubs, which is a different count. |
| The emit should already include expiries, and that hidden total is the 6–8 | **Open, and it is a definition choice.** Expiries on this seed are **7.70/yr**. Fires + expiries = **9.15/yr**. Packet 3b attached 6–8 to the heat-fire counter (“target ~6–8. Do not invent a fire-rate knob”) beside the planted heat-fire measure. Counting expiries as fires would be a lead change to what `drift` measures. |

---

## What this note does not do

- No change to `ownerHeatFor`, `fireHeatThreshold`, `OWNER_WIN_TARGET`,
  `OWNER_MIN_SEASONS`, `OWNER_PATIENCE`, `COACH_CONTRACT`,
  `contractFor`, `teamOutlook`, `tickCoachContracts`, or
  `fireCpuHeadCoaches`.
- No `docs/baselines.json` row. No band on `drift.hcFiresPerSeason`.
- No `scripts/` edit. The probe stayed outside the repo.
- No recommended number for a threshold, a target, or a contract draw.

---

## Mechanism options (for Matt to sign later)

No dial value is proposed. Options 4–6 are signed-dial territory. Option
2 is a lead measurement change. None of them is implemented here.

1. **Keep the dials and treat 1.68 as the measured heat-fire rate.**
   The expect is untraced. The gate is doing what the signed constants
   specify on organic posture. A later panel can keep printing the emit
   with no band, the same way this packet’s GATE table already does.

2. **Retarget the emit if “HC fires” was meant as coaching changes.**
   Add expiries (and say so), or publish a second emit next to
   `drift.hcFiresPerSeason`. On this seed expiries are 7.70/yr and
   fires + expiries are 9.15/yr, in the neighborhood of the design
   note’s 3.2–3.9 year tenure (~9 changes/year on 32 clubs). This does
   not make the heat path produce 6–8 dismissals. It changes the
   question the number answers. `scripts/` is lead-owned.

3. **Score the coach, not the franchise.** Reset heat on hire, or walk
   only the seasons since `hiredSeason`. That stops a new coach
   inheriting a pegged seat and being fired after an 11–14 win year.
   Inherited heat is a large share of the fires that happen now, so a
   reset can **lower** the rate unless it is paired with another
   signed change. Volume after a reset is unmeasured.

4. **Keep a high target when the record is bad.** Rebuild’s target of 6
   sits on the wins rebuild clubs actually post (~5.9 here), which is
   why 0/162 rebuild team-seasons were hot. The heat function already
   fires when the target stays high: the plant (contend, 3 and 3) is
   15 fires. Decoupling `OWNER_WIN_TARGET` from `teamOutlook`, or
   judging a missed season against a floor that does not fall with the
   record, is a design change to signed dials. No replacement table is
   proposed.

5. **Open a fire window the contract currently closes.** Two separate
   levers: run the heat check before the expiry tick, and/or stop
   drawing `yearsRemaining` from 1..term so a new HC actually serves
   the 4–6 year band. On this seed the tenure and expiry blocks are
   worth **+1.65/yr** (1.45 → 3.10) if every currently hot seat fired.
   The desk bound for an always-hot league under today’s draw is about
   **10/yr**. Neither lever, alone, turns 10% hot into a 6–8 rate.

6. **Move the line or the miss multiplier** (`62 + 28×patience`, the ×8
   / ×3 weights, the cool term). Median heat is 10.4 and p90 is 76.1,
   so the line sits on the shoulder of the distribution. A small move
   catches the shoulder; a large move reaches the median. That is a
   rate Matt would be choosing. This note does not pick one. Any such
   change is a signed dial, and `baselines.json` still does not get a
   band until a later lead packet says so.
