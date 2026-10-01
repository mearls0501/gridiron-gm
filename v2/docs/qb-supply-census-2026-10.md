# QB supply census — 2026-10-01

Census only. No dial change, no `baselines.json` edit, no Packet 4 work. The probes used to read `cpuBoardValue` and the cutdown were removed after the run.

Matt **SIGNED** 2026-10-01: the CPU drafts and rosters quarterbacks at the NFL rate, about 12 a class and 2–3 on the 53. Census first, then the fix it names. Packet 4 (second-scene mechanism) stays **HOLD** until that fix is in and path 2 is re-run.

`repo-docs/diag-qb-supply-2026-10-01.md` is not in this checkout. The quoted Claude reading was a hypothesis: about 19–30 quarterbacks a class, and about 3.1 rising to about 5.0 bodies a club by season 4, against a real ~3.5 including the practice squad. The traced draft count behind "11.6 a class" is `nfl-reference.md` §2.7: 116 drafted quarterbacks in the 2010–2019 classes. Round 1 is a different number, §2.4: **3.27 a draft** (10.3% of the round).

## Run

One process, one seed, 12 seasons, tip `7bd497e` (`7bd497e5b368ca49480588f47e400dbad3a8ffd3`).

The season loop is the careers loop: `newGame({ seed: 12345 })`, `seedFor(12345)` with `GG_SEED` unset, play to `offseason-recap`, then `advanceOffseason` through the draft and `finalizeOffseason`, twelve times. Headless `runFullDraft` calls `cpuPick` for every club, including the user club. Spring is the preseason after `settleWaivers`. CPU roster means are the 31 clubs whose cutdown also runs `spendToFloor` and `upgradeRoster`. The user club is reconciled and can stash, and is marked in the pick table. The read-only probe that recorded board terms and cutdown events was discarded with this write-up.

Opening rosters are generated at `POSITION_TARGET` (QB 3). Those targets sum to 53, so opening is exactly 3 on the 53 and 0 on the practice squad. That is the generator, not the cutdown.

## What the terms are

`cpuBoardValue` (`lib/core/offseason/draft.ts`) returns:

```text
above * sqrt(POSITION_VALUE[pos]) * startsHere * bias * rebuildUpside
  * (1 + need * needWeight) * riskDiscount
```

`need = clamp(marginal + thin, -0.6, 1)`.

| code name | definition |
|---|---|
| `thin` | `0.35` when `positionCount < POSITION_TARGET[pos]`, else `0`. QB target is 3. Practice-squad bodies are excluded (`positionCount` is the active 53). |
| `marginal` | `clamp((view.ovr - incumbent) / 20, -0.6, 1)`. `incumbent` is `startersAt`: the starter's OVR, or replacement 58 if the club has none. |
| position value | `Math.sqrt(POSITION_VALUE[pos])`. QB is √3.4 ≈ 1.844. Contracts, trades, and `evaluate` keep the raw 3.4. |
| `startsHere` | `clamp((view.ovr - incumbent + 6) / 12, 0.25, 1)`. The 0.25 floor is inside the same product as the positional premium. |

A term **carries** the pick when the quarterback's full value beats the best non-quarterback in the pool, and zeroing that one term drops him to or under that alternative. `top4-noise` means he lost that comparison and `rng.weighted` on the top four still took him (weights `1`, `0.72`, `0.44`, `0.16`).

Cutdown worth in `moveWorstSurplus` is `evaluate(...) + draftCapitalHold`. `evaluate` multiplies by raw `POSITION_VALUE`. `POSITION_MIN.QB` is 2, so QB #3 and #4 are eligible to be waived. The `"ps"` argument on `moveWorstSurplus` does not park anyone: every surplus cut calls `cutPlayer`. The practice-squad landing is `stashOrFreeAgent` in `waivers.ts` (`placeOnPs`), for an unclaimed waiver when the squad is under 16 and the cap hit fits.

Depth order for "#3 / #4" is `autoSortDepthChart`: healthy active by OVR, then injured active, then IR and PS.

## Result

**The draft takes 36.7 quarterbacks a class on this seed (range 19–49). Round 1 is already at the traced rate (3.17 vs 3.27). The extra bodies are rounds 3–7, and round 7 alone is 12.9 a class.** The term that carries a quarterback past the best non-quarterback is the positional premium, `sqrt(POSITION_VALUE)`, kept alive for non-starters by the `startsHere` floor of 0.25. `thin` and `marginal` are not that term.

**CPU clubs open at 3.00 on the 53. By the preseason of calendar year 4 (spring 2029) they are at 3.58 on the 53 and 4.97 total. They keep climbing: spring 2038 is 5.13 on the 53, 2.81 on the practice squad, 8.10 total.** QB #3 and #4 stay on the 53 because `evaluate` prices them at 3.4×. The practice squad then keeps the ones who lose that cut, with no quarterback cap.

### Draft, 12 classes, seed 12345

| | this run | signed / traced |
|---|---:|---:|
| Quarterbacks drafted per class | **36.7** (440 / 12; CPU clubs 35.8) | ~12 (Matt); 11.6 = 116 / 10 classes, §2.7 |
| Round 1 per class | **3.17** (38) | 3.27, §2.4 |
| Round 7 per class | **12.9** (155) | — |
| Rounds 3–7 per class | **31.8** (381) | — |
| QB prospects in the pool | 49.8 mean | supply is not the constraint: 37 of ~50 are selected |
| Priority UDFA quarterbacks | 31 across 12 classes | same board (`cpuTopOfBoard` / `cpuBoardValue`) |

`thin` was on for 48 of 440 picks, and only when the club had 1 or 2 active quarterbacks. It is a necessary carrier inside 8 joint picks. `marginal` is positive on 78 of 440 picks. Of the 218 picks carried by position value alone, 169 have a negative `marginal` (the prospect grades behind the incumbent) and 200 happen with 3 or more quarterbacks already active. Mean active count at a position-value carry is 5.2. Mean true OVR of a drafted quarterback is 56.5; round 1 is 71.2; round 7 is 50.1.

`startsHere` is on the 0.25 floor for **343 of 440** drafted quarterbacks, including **209 of 210** from rounds 6 and 7. All **38** round-1 quarterbacks are above the floor.

| carrier | picks | share |
|---|---:|---:|
| `positionValue` | 218 | 49.5% |
| `top4-noise` | 195 | 44.3% |
| `joint:marginal+positionValue` | 7 | 1.6% |
| `joint:thin+marginal+positionValue` | 6 | 1.4% |
| `joint:thin+positionValue` | 2 | 0.5% |
| `other` (still beats the alternative with thin, marginal, and the positional premium removed) | 12 | 2.7% |

`top4-noise` is the same premium one step earlier. Those 195 quarterbacks lost to a non-quarterback, by a median of 0.49 against a median board value of 1.76, and the weighted draw took them from rank 2 (89), rank 3 (88), or rank 4 (18). 175 of the 195 clubs already had at least 3 active quarterbacks.

### Spring, 31 CPU clubs

| roster | mean on 53 | mean on PS | mean total | ≥3 on the 53 | ≥4 on the 53 | ≥5 total |
|---|---:|---:|---:|---:|---:|---:|
| opening 2026 | 3.00 | 0.00 | 3.00 | 31/31 | 0/31 | 0/31 |
| spring 2027 (class 2026) | 2.68 | 1.23 | 4.00 | 15/31 | 5/31 | 10/31 |
| spring 2028 (class 2027) | 3.26 | 0.87 | 4.19 | 13/31 | 11/31 | 10/31 |
| spring 2029 (class 2028) — preseason of year 4 | 3.58 | 1.26 | 4.97 | 22/31 | 12/31 | 18/31 |
| spring 2030 (class 2029) | 4.32 | 1.84 | 6.32 | 26/31 | 19/31 | 23/31 |
| spring 2031 | 4.13 | 2.39 | 6.74 | 24/31 | 14/31 | 22/31 |
| spring 2032 | 4.48 | 2.23 | 6.87 | 29/31 | 23/31 | 24/31 |
| spring 2033 | 4.94 | 1.94 | 7.00 | 31/31 | 24/31 | 22/31 |
| spring 2034 | 4.81 | 2.10 | 7.19 | 30/31 | 22/31 | 23/31 |
| spring 2035 | 5.03 | 2.39 | 7.68 | 30/31 | 27/31 | 25/31 |
| spring 2036 | 4.90 | 2.61 | 7.87 | 28/31 | 27/31 | 30/31 |
| spring 2037 | 4.90 | 2.84 | 7.90 | 30/31 | 24/31 | 29/31 |
| spring 2038 (class 2037) | 5.13 | 2.81 | 8.10 | 30/31 | 23/31 | 26/31 |

Calendar year 1 is 2026. "By season 4" in the hypothesis lines up with spring 2029 if the count is every body on the club (4.97). The 53 at that snapshot is 3.58. The signed bar is 2–3 on the 53. This seed is past that bar by spring 2030 and is still adding bodies at season 12.

### Who kept #3 and #4

347 CPU club-springs had a third quarterback and 307 had a fourth, out of 372. Slot 3 was on the 53 in 308 of those, on the PS in 29, on IR in 10. Slot 4 was on the 53 in 231, on the PS in 59, on IR in 17.

| slot | where | rule | club-springs |
|---|---|---|---:|
| #3 | 53 | `evaluate` | 280 |
| #3 | 53 | `worseSurplus` | 26 |
| #3 | 53 | `draftCapitalHold` | 1 |
| #3 | 53 | `no-surplus-trim` | 1 |
| #3 | PS | `stashOrFreeAgent` | 29 |
| #4 | 53 | `evaluate` | 196 |
| #4 | 53 | `worseSurplus` | 27 |
| #4 | 53 | `draftCapitalHold` | 8 |
| #4 | PS | `stashOrFreeAgent` | 59 |

`draftCapitalHold` is 9 of the 53-man keeps. `fill-to-53`, `POSITION_MIN`, `upgradeRoster`, and `spendToFloor` do not appear as the rule that left a #3 or #4 in place. The 53-man rule is `evaluate` at raw 3.4. The practice-squad rule is `stashOrFreeAgent`.

## Recommended fix for Matt to sign

One packet, three levers, in this order. Then re-run this census on seed 12345 for 12 seasons, and re-run path 2. Packet 4 stays **HOLD** until that re-run. Do not move `docs/baselines.json`, `POSITION_VALUE`, `POSITION_TARGET`, `POSITION_MIN`, `ELITE_QB_SUPPRESSION`, or the round-1 share lock. Round 1 on this seed is already on the §2.4 rate, and every round-1 quarterback projected to start.

**1. Draft — `startsHere` floor in `cpuBoardValue` (`lib/core/offseason/draft.ts`).** For quarterbacks, change the floor of `startsHere` from `0.25` to `0`. A man whose view sits under the incumbent loses the `sqrt(POSITION_VALUE)` premium and sorts on `above` with the other backups. A man who projects to start keeps the premium, which is this run's entire round 1. `runUdfaChase` reads the same function, so priority UDFA follows. Leave `thin` and `marginal` as they are.

**2. Cutdown — `moveWorstSurplus` (`lib/core/offseason/contracts.ts`).** When the candidate is a quarterback and `positionCount > POSITION_MIN.QB` (2), price that candidate at positional value `1` instead of `3.4`, then add `draftCapitalHold` as today. `evaluate` itself stays on the raw table, so free agency, trades, and re-signs keep the starter premium. The camp rope stays; it stops being a 3.4× rope on QB #3 and #4.

**3. Practice squad — `stashOrFreeAgent` (`lib/core/waivers.ts`).** Do not `placeOnPs` a quarterback when that club already has 2 on the 53 and 1 on the practice squad. One developmental backup past the minimum, three bodies, inside the signed 2–3 on the 53.

`moveWorstSurplus`'s `"ps"` destination is not a fourth lever. It waives the player. The squad decision is only `stashOrFreeAgent`.

## Flag against the quoted hypothesis

Built as written. This seed does not sit in the quoted 19–30 drafts-per-class band: the classes are 35, 38, 35, 49, 43, 28, 36, 19, 39, 39, 41, 38. The direction is the same finding, and it is larger. The roster climb does not stop near 5.0 after season 4. Spring 2029 totals 4.97; spring 2038 totals 8.10, with 5.13 of that on the 53.

## Tables

The pick table is every drafted quarterback. The spring table is every CPU club-spring that had a third or fourth quarterback, with that club's 53 and practice-squad counts on the same row. Twenty-five CPU club-springs had two or fewer and are only in the means above.

## Draft classes

Headless `runFullDraft` calls `cpuPick` for all 32 clubs, including the user club. `draftedQbCpu` drops those user-club picks. Prospect count is every QB still in the pool when the draft opened (draft board plus camp pool).

| class | prospects | drafted | CPU drafted | R1 | R2 | R3 | R4 | R5 | R6 | R7 | thin on | mean active | mean starter |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2026 | 43 | 35 | 35 | 3 | 2 | 3 | 6 | 1 | 6 | 14 | 14 | 2.83 | 73.7 |
| 2027 | 43 | 38 | 38 | 4 | 1 | 11 | 5 | 4 | 2 | 11 | 8 | 3.68 | 74.7 |
| 2028 | 48 | 35 | 35 | 6 | 1 | 5 | 5 | 4 | 2 | 12 | 6 | 4.26 | 77.3 |
| 2029 | 57 | 49 | 47 | 1 | 3 | 7 | 9 | 3 | 4 | 22 | 4 | 4.96 | 79.6 |
| 2030 | 58 | 43 | 43 | 1 | 1 | 5 | 6 | 3 | 10 | 17 | 0 | 5.49 | 79.5 |
| 2031 | 56 | 28 | 27 | 3 | 4 | 10 | 3 | 4 | 2 | 2 | 6 | 3.54 | 71.6 |
| 2032 | 57 | 36 | 35 | 3 | 1 | 9 | 6 | 3 | 4 | 10 | 1 | 4.64 | 75.5 |
| 2033 | 45 | 19 | 19 | 2 | 1 | 2 | 3 | 3 | 5 | 3 | 1 | 4.89 | 78.2 |
| 2034 | 47 | 39 | 38 | 3 | 1 | 5 | 6 | 4 | 4 | 16 | 2 | 7.13 | 77.0 |
| 2035 | 65 | 39 | 39 | 3 | 2 | 4 | 4 | 7 | 5 | 14 | 0 | 4.95 | 79.1 |
| 2036 | 39 | 41 | 38 | 4 | 2 | 5 | 6 | 1 | 5 | 18 | 4 | 4.68 | 77.1 |
| 2037 | 39 | 38 | 36 | 5 | 2 | 3 | 3 | 3 | 6 | 16 | 2 | 5.16 | 79.3 |

Twelve classes, **440** quarterbacks drafted (**36.7** a class). CPU clubs drafted **430** (**35.8** a class). The user club, on the same `cpuPick`, took **10**.

## Every quarterback drafted

`active` / `ps` are the club's quarterbacks at the pick (`positionCount` ignores the practice squad; `thin` reads `active` only). `starter` is `startersAt`: the incumbent starter's OVR, or replacement 58 if the club has none. `sh` is `startsHere`: `floor` means the 0.25 clamp.

| class | rd | pick | club | active | ps | starter | thin | marginal | sh | carrier |
|---|---:|---:|---|---:|---:|---:|---:|---:|---|---|
| 2026 | 1 | 6 | NYS | 2 | 0 | 57.0 | 0.35 | 1.00 | high | `joint:thin+marginal+positionValue` |
| 2026 | 1 | 8 | CMB | 2 | 0 | 66.0 | 0.35 | 0.44 | high | `positionValue` |
| 2026 | 1 | 19 | BUF | 3 | 0 | 58.0 | 0.00 | 0.50 | high | `joint:marginal+positionValue` |
| 2026 | 2 | 41 | BUF | 4 | 0 | 62.0 | 0.00 | 0.29 | high | `positionValue` |
| 2026 | 2 | 62 | BKN | 1 | 0 | 60.0 | 0.35 | 0.45 | high | `positionValue` |
| 2026 | 3 | 72 | SF | 1 | 1 | 60.0 | 0.35 | 0.37 | high | `joint:thin+marginal+positionValue` |
| 2026 | 3 | 73 | BUF | 5 | 0 | 62.0 | 0.00 | 0.13 | high | `positionValue` |
| 2026 | 3 | 104 | MIN | 3 | 1 | 72.0 | 0.00 | -0.29 | floor | `top4-noise` |
| 2026 | 4 | 131 | JAX | 2 | 0 | 76.0 | 0.35 | -0.58 | floor | `top4-noise` |
| 2026 | 4 | 133 | SF | 2 | 1 | 60.0 | 0.35 | 0.10 | high | `other` |
| 2026 | 4 | 135 | DEN | 3 | 0 | 80.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2026 | 4 | 137 | PHX | 2 | 0 | 86.0 | 0.35 | -0.60 | floor | `top4-noise` |
| 2026 | 4 | 146 | BAL | 2 | 2 | 88.0 | 0.35 | -0.60 | floor | `positionValue` |
| 2026 | 4 | 152 | SF | 3 | 1 | 60.0 | 0.00 | 0.15 | high | `other` |
| 2026 | 5 | 181 | LV | 2 | 0 | 81.0 | 0.35 | -0.60 | floor | `top4-noise` |
| 2026 | 6 | 202 | SEA | 2 | 0 | 79.0 | 0.35 | -0.60 | floor | `positionValue` |
| 2026 | 6 | 213 | CIN | 2 | 0 | 76.0 | 0.35 | -0.60 | floor | `top4-noise` |
| 2026 | 6 | 215 | DEN | 4 | 0 | 80.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2026 | 6 | 218 | DET | 3 | 0 | 85.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2026 | 6 | 221 | BKN | 2 | 0 | 61.0 | 0.35 | -0.14 | mid | `positionValue` |
| 2026 | 6 | 223 | BAL | 3 | 2 | 88.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2026 | 7 | 237 | SD | 2 | 0 | 86.0 | 0.35 | -0.60 | floor | `top4-noise` |
| 2026 | 7 | 239 | SEA | 3 | 0 | 79.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2026 | 7 | 242 | BAL | 4 | 2 | 88.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2026 | 7 | 247 | SF | 4 | 1 | 60.0 | 0.00 | -0.16 | floor | `top4-noise` |
| 2026 | 7 | 248 | CHI | 2 | 0 | 69.0 | 0.35 | -0.60 | floor | `top4-noise` |
| 2026 | 7 | 249 | DEN | 5 | 0 | 80.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2026 | 7 | 250 | CIN | 3 | 0 | 76.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2026 | 7 | 251 | PHX | 3 | 0 | 86.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2026 | 7 | 252 | HAR | 3 | 0 | 77.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2026 | 7 | 253 | LV | 3 | 0 | 81.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2026 | 7 | 256 | CHI | 3 | 0 | 69.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2026 | 7 | 258 | BKN | 3 | 0 | 61.0 | 0.00 | -0.53 | floor | `positionValue` |
| 2026 | 7 | 260 | SEA | 4 | 0 | 79.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2026 | 7 | 261 | TB | 4 | 0 | 93.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2027 | 1 | 2 | JAX | 3 | 0 | 73.0 | 0.00 | 0.47 | high | `positionValue` |
| 2027 | 1 | 17 | PHX | 1 | 1 | 67.0 | 0.35 | 0.36 | high | `joint:thin+marginal+positionValue` |
| 2027 | 1 | 18 | LA | 3 | 0 | 67.0 | 0.00 | 0.40 | high | `positionValue` |
| 2027 | 1 | 22 | NO | 1 | 0 | 59.0 | 0.35 | 0.42 | high | `joint:thin+marginal+positionValue` |
| 2027 | 2 | 48 | BKN | 3 | 1 | 65.0 | 0.00 | 0.42 | high | `positionValue` |
| 2027 | 3 | 71 | SF | 5 | 1 | 65.0 | 0.00 | 0.08 | high | `positionValue` |
| 2027 | 3 | 77 | BAL | 3 | 1 | 86.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2027 | 3 | 79 | PIT | 1 | 0 | 65.0 | 0.35 | -0.01 | mid | `top4-noise` |
| 2027 | 3 | 87 | MIN | 2 | 0 | 71.0 | 0.35 | -0.21 | floor | `top4-noise` |
| 2027 | 3 | 94 | PHI | 3 | 0 | 97.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2027 | 3 | 96 | CHI | 3 | 1 | 71.0 | 0.00 | -0.20 | floor | `positionValue` |
| 2027 | 3 | 97 | BAL | 4 | 1 | 86.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2027 | 3 | 99 | DEN | 3 | 2 | 81.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2027 | 3 | 100 | DEN | 4 | 2 | 81.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2027 | 3 | 108 | DEN | 5 | 2 | 81.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2027 | 3 | 116 | PIT | 2 | 0 | 67.0 | 0.35 | -0.03 | mid | `other` |
| 2027 | 4 | 119 | KC | 1 | 0 | 72.0 | 0.35 | -0.20 | floor | `joint:thin+positionValue` |
| 2027 | 4 | 121 | SEA | 3 | 1 | 77.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2027 | 4 | 124 | BKN | 4 | 1 | 70.0 | 0.00 | -0.32 | floor | `positionValue` |
| 2027 | 4 | 142 | LV | 1 | 0 | 79.0 | 0.35 | -0.60 | floor | `top4-noise` |
| 2027 | 4 | 152 | CHI | 4 | 1 | 71.0 | 0.00 | -0.46 | floor | `positionValue` |
| 2027 | 5 | 157 | LA | 4 | 0 | 68.0 | 0.00 | -0.53 | floor | `top4-noise` |
| 2027 | 5 | 165 | BUF | 7 | 0 | 89.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2027 | 5 | 168 | PIT | 3 | 0 | 67.0 | 0.00 | -0.37 | floor | `positionValue` |
| 2027 | 5 | 169 | BKN | 5 | 1 | 70.0 | 0.00 | -0.44 | floor | `top4-noise` |
| 2027 | 6 | 195 | SF | 6 | 1 | 65.0 | 0.00 | -0.21 | floor | `positionValue` |
| 2027 | 6 | 208 | NYS | 2 | 0 | 80.0 | 0.35 | -0.60 | floor | `top4-noise` |
| 2027 | 7 | 223 | HAR | 3 | 1 | 79.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2027 | 7 | 224 | NYS | 3 | 0 | 80.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2027 | 7 | 230 | NYS | 4 | 0 | 80.0 | 0.00 | -0.60 | floor | `other` |
| 2027 | 7 | 237 | HAR | 4 | 1 | 79.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2027 | 7 | 239 | HAR | 5 | 1 | 79.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2027 | 7 | 241 | NYS | 5 | 0 | 80.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2027 | 7 | 251 | HAR | 6 | 1 | 79.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2027 | 7 | 253 | DEN | 6 | 2 | 81.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2027 | 7 | 254 | CHI | 5 | 1 | 71.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2027 | 7 | 255 | BKN | 6 | 1 | 70.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2027 | 7 | 257 | BKN | 7 | 1 | 70.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2028 | 1 | 2 | KC | 2 | 0 | 68.0 | 0.35 | 0.63 | high | `positionValue` |
| 2028 | 1 | 4 | MEM | 2 | 0 | 77.0 | 0.35 | 0.12 | high | `joint:thin+marginal+positionValue` |
| 2028 | 1 | 7 | SF | 4 | 1 | 62.0 | 0.00 | 0.94 | high | `positionValue` |
| 2028 | 1 | 13 | WAS | 2 | 0 | 63.0 | 0.35 | 0.37 | high | `positionValue` |
| 2028 | 1 | 20 | PIT | 6 | 0 | 68.0 | 0.00 | 0.23 | high | `positionValue` |
| 2028 | 1 | 25 | CIN | 2 | 0 | 77.0 | 0.35 | 0.13 | high | `top4-noise` |
| 2028 | 2 | 33 | PIT | 7 | 0 | 68.0 | 0.00 | 0.10 | high | `positionValue` |
| 2028 | 3 | 74 | LA | 6 | 0 | 73.0 | 0.00 | -0.40 | floor | `top4-noise` |
| 2028 | 3 | 81 | DET | 3 | 0 | 85.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2028 | 3 | 90 | CLE | 2 | 0 | 74.0 | 0.35 | -0.05 | mid | `positionValue` |
| 2028 | 3 | 92 | SF | 5 | 1 | 81.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2028 | 3 | 99 | SEA | 3 | 1 | 78.0 | 0.00 | -0.57 | floor | `top4-noise` |
| 2028 | 4 | 118 | LA | 7 | 0 | 73.0 | 0.00 | -0.34 | floor | `top4-noise` |
| 2028 | 4 | 122 | NO | 3 | 0 | 78.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2028 | 4 | 125 | DET | 4 | 0 | 85.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2028 | 4 | 131 | MIN | 3 | 0 | 71.0 | 0.00 | -0.36 | floor | `top4-noise` |
| 2028 | 4 | 135 | NSH | 3 | 2 | 83.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2028 | 5 | 145 | KC | 3 | 0 | 76.0 | 0.00 | -0.47 | floor | `other` |
| 2028 | 5 | 157 | NO | 4 | 0 | 78.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2028 | 5 | 158 | KC | 4 | 0 | 76.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2028 | 5 | 171 | BUF | 6 | 0 | 88.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2028 | 6 | 187 | DEN | 7 | 1 | 82.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2028 | 6 | 200 | CMB | 3 | 0 | 79.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2028 | 7 | 221 | SEA | 4 | 1 | 78.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2028 | 7 | 226 | KC | 5 | 0 | 76.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2028 | 7 | 229 | SEA | 5 | 1 | 78.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2028 | 7 | 233 | HAR | 2 | 2 | 79.0 | 0.35 | -0.60 | floor | `top4-noise` |
| 2028 | 7 | 239 | NSH | 4 | 2 | 83.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2028 | 7 | 241 | NO | 5 | 0 | 78.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2028 | 7 | 242 | DET | 5 | 0 | 85.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2028 | 7 | 245 | SF | 6 | 1 | 81.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2028 | 7 | 249 | SEA | 6 | 1 | 78.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2028 | 7 | 250 | NO | 6 | 0 | 78.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2028 | 7 | 251 | NYS | 3 | 2 | 79.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2028 | 7 | 253 | BUF | 7 | 0 | 88.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2029 | 1 | 21 | BKN | 3 | 2 | 64.0 | 0.00 | 0.38 | high | `positionValue` |
| 2029 | 2 | 33 | ATL | 3 | 0 | 69.0 | 0.00 | 0.08 | high | `top4-noise` |
| 2029 | 2 | 56 | LV | 3 | 0 | 70.0 | 0.00 | 0.19 | high | `positionValue` |
| 2029 | 2 | 61 | ATL | 4 | 0 | 71.0 | 0.00 | -0.12 | mid | `top4-noise` |
| 2029 | 3 | 71 | CLE | 3 | 0 | 71.0 | 0.00 | -0.20 | floor | `positionValue` |
| 2029 | 3 | 72 | BKN | 4 | 2 | 67.0 | 0.00 | -0.04 | mid | `positionValue` |
| 2029 | 3 | 76 | CLE | 4 | 0 | 71.0 | 0.00 | -0.17 | floor | `positionValue` |
| 2029 | 3 | 82 | PIT | 7 | 0 | 84.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2029 | 3 | 85 | SEA | 5 | 5 | 77.0 | 0.00 | -0.56 | floor | `positionValue` |
| 2029 | 3 | 95 | CLE | 5 | 0 | 73.0 | 0.00 | -0.35 | floor | `positionValue` |
| 2029 | 3 | 99 | DET | 3 | 0 | 83.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2029 | 4 | 112 | WAS | 3 | 0 | 74.0 | 0.00 | -0.43 | floor | `top4-noise` |
| 2029 | 4 | 115 | BKN | 5 | 2 | 67.0 | 0.00 | -0.12 | mid | `top4-noise` |
| 2029 | 4 | 116 | CHI | 4 | 0 | 77.0 | 0.00 | -0.53 | floor | `top4-noise` |
| 2029 | 4 | 117 | TB | 2 | 1 | 96.0 | 0.35 | -0.60 | floor | `top4-noise` |
| 2029 | 4 | 122 | DET | 4 | 0 | 83.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2029 | 4 | 123 | KC | 3 | 0 | 78.0 | 0.00 | -0.55 | floor | `top4-noise` |
| 2029 | 4 | 128 | SEA | 6 | 5 | 77.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2029 | 4 | 131 | LA | 8 | 0 | 79.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2029 | 4 | 137 | ATL | 5 | 0 | 71.0 | 0.00 | -0.33 | floor | `top4-noise` |
| 2029 | 5 | 155 | TB | 3 | 1 | 96.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2029 | 5 | 165 | SF | 3 | 3 | 83.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2029 | 5 | 167 | BUF | 6 | 0 | 89.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2029 | 6 | 185 | BAL | 4 | 0 | 82.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2029 | 6 | 207 | CIN | 4 | 2 | 80.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2029 | 6 | 211 | HAR | 2 | 1 | 79.0 | 0.35 | -0.60 | floor | `positionValue` |
| 2029 | 6 | 213 | PHI | 3 | 0 | 95.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2029 | 7 | 225 | NYS | 5 | 2 | 78.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2029 | 7 | 226 | SEA | 7 | 5 | 77.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2029 | 7 | 228 | NYS | 6 | 2 | 78.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2029 | 7 | 233 | PHI | 4 | 0 | 95.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2029 | 7 | 235 | DET | 5 | 0 | 83.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2029 | 7 | 236 | SEA | 8 | 5 | 77.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2029 | 7 | 238 | PHI | 5 | 0 | 95.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2029 | 7 | 239 | SEA | 9 | 5 | 77.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2029 | 7 | 240 | SEA | 10 | 5 | 77.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2029 | 7 | 241 | SEA | 11 | 5 | 77.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2029 | 7 | 243 | DET | 6 | 0 | 83.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2029 | 7 | 244 | SEA | 12 | 5 | 77.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2029 | 7 | 245 | PHI | 6 | 0 | 95.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2029 | 7 | 248 | BOS* | 1 | 0 | 73.0 | 0.35 | -0.60 | floor | `positionValue` |
| 2029 | 7 | 249 | NO | 3 | 1 | 79.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2029 | 7 | 252 | JAX | 3 | 0 | 83.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2029 | 7 | 254 | PHI | 7 | 0 | 95.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2029 | 7 | 257 | MEM | 3 | 1 | 75.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2029 | 7 | 258 | BOS* | 2 | 0 | 73.0 | 0.35 | -0.60 | floor | `top4-noise` |
| 2029 | 7 | 260 | BUF | 7 | 0 | 89.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2029 | 7 | 261 | DEN | 7 | 0 | 77.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2029 | 7 | 262 | DET | 7 | 0 | 83.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2030 | 1 | 4 | SEA | 5 | 10 | 78.0 | 0.00 | 0.20 | high | `positionValue` |
| 2030 | 2 | 48 | BAL | 4 | 0 | 68.0 | 0.00 | 0.28 | high | `positionValue` |
| 2030 | 3 | 71 | NO | 3 | 1 | 81.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2030 | 3 | 78 | BKN | 4 | 2 | 67.0 | 0.00 | -0.11 | mid | `top4-noise` |
| 2030 | 3 | 82 | LA | 4 | 0 | 79.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2030 | 3 | 89 | BAL | 5 | 0 | 68.0 | 0.00 | 0.09 | high | `positionValue` |
| 2030 | 3 | 113 | LA | 5 | 0 | 79.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2030 | 4 | 118 | BAL | 6 | 0 | 68.0 | 0.00 | -0.22 | floor | `top4-noise` |
| 2030 | 4 | 130 | ATL | 6 | 0 | 75.0 | 0.00 | -0.46 | floor | `positionValue` |
| 2030 | 4 | 137 | SEA | 6 | 10 | 83.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2030 | 4 | 139 | BAL | 7 | 0 | 68.0 | 0.00 | -0.43 | floor | `top4-noise` |
| 2030 | 4 | 142 | PIT | 7 | 0 | 87.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2030 | 4 | 148 | CHI | 3 | 0 | 78.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2030 | 5 | 168 | DEN | 5 | 0 | 70.0 | 0.00 | -0.54 | floor | `top4-noise` |
| 2030 | 5 | 188 | PHX | 3 | 0 | 69.0 | 0.00 | -0.23 | floor | `other` |
| 2030 | 5 | 199 | TB | 3 | 0 | 97.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2030 | 6 | 200 | SF | 3 | 2 | 85.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2030 | 6 | 203 | PIT | 8 | 0 | 87.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2030 | 6 | 204 | SEA | 7 | 10 | 83.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2030 | 6 | 208 | DET | 6 | 2 | 79.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2030 | 6 | 212 | SF | 4 | 2 | 85.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2030 | 6 | 213 | NO | 4 | 1 | 81.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2030 | 6 | 217 | BKN | 5 | 2 | 67.0 | 0.00 | -0.31 | floor | `top4-noise` |
| 2030 | 6 | 223 | NO | 5 | 1 | 81.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2030 | 6 | 231 | TB | 4 | 0 | 97.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2030 | 6 | 232 | CIN | 3 | 0 | 79.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2030 | 7 | 239 | TB | 5 | 0 | 97.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2030 | 7 | 243 | SEA | 8 | 10 | 83.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2030 | 7 | 249 | SEA | 9 | 10 | 83.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2030 | 7 | 252 | NSH | 4 | 0 | 84.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2030 | 7 | 253 | SEA | 10 | 10 | 83.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2030 | 7 | 255 | LV | 3 | 0 | 67.0 | 0.00 | -0.54 | floor | `top4-noise` |
| 2030 | 7 | 256 | SEA | 11 | 10 | 83.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2030 | 7 | 258 | KC | 3 | 0 | 82.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2030 | 7 | 259 | NYS | 3 | 2 | 77.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2030 | 7 | 260 | SEA | 12 | 10 | 83.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2030 | 7 | 261 | SEA | 13 | 10 | 83.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2030 | 7 | 263 | NO | 6 | 1 | 81.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2030 | 7 | 264 | LV | 4 | 0 | 67.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2030 | 7 | 269 | TB | 6 | 0 | 97.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2030 | 7 | 270 | KC | 4 | 0 | 82.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2030 | 7 | 271 | NYS | 4 | 2 | 77.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2030 | 7 | 275 | DEN | 6 | 0 | 70.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2031 | 1 | 3 | BOS* | 1 | 1 | 73.0 | 0.35 | 0.25 | high | `positionValue` |
| 2031 | 1 | 7 | BAL | 5 | 0 | 62.0 | 0.00 | 1.00 | high | `other` |
| 2031 | 1 | 32 | GB | 3 | 0 | 68.0 | 0.00 | 0.18 | high | `top4-noise` |
| 2031 | 2 | 34 | PHX | 2 | 0 | 64.0 | 0.35 | 0.36 | high | `positionValue` |
| 2031 | 2 | 36 | LV | 2 | 1 | 68.0 | 0.35 | 0.21 | high | `positionValue` |
| 2031 | 2 | 44 | PHX | 3 | 0 | 64.0 | 0.00 | 0.47 | high | `positionValue` |
| 2031 | 2 | 56 | HAR | 2 | 0 | 62.0 | 0.35 | 0.41 | high | `positionValue` |
| 2031 | 3 | 65 | HAR | 3 | 0 | 62.0 | 0.00 | 0.34 | high | `joint:marginal+positionValue` |
| 2031 | 3 | 69 | BKN | 3 | 1 | 67.0 | 0.00 | 0.23 | high | `positionValue` |
| 2031 | 3 | 73 | HOU | 6 | 0 | 74.0 | 0.00 | -0.18 | floor | `top4-noise` |
| 2031 | 3 | 76 | PHX | 4 | 0 | 64.0 | 0.00 | 0.11 | high | `top4-noise` |
| 2031 | 3 | 78 | NYS | 3 | 0 | 75.0 | 0.00 | -0.22 | floor | `top4-noise` |
| 2031 | 3 | 86 | PIT | 4 | 0 | 88.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2031 | 3 | 93 | HAR | 4 | 0 | 62.0 | 0.00 | 0.28 | high | `positionValue` |
| 2031 | 3 | 100 | HAR | 5 | 0 | 62.0 | 0.00 | 0.18 | high | `positionValue` |
| 2031 | 3 | 104 | PIT | 5 | 0 | 88.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2031 | 3 | 105 | HAR | 6 | 0 | 62.0 | 0.00 | 0.06 | mid | `top4-noise` |
| 2031 | 4 | 116 | NYS | 4 | 0 | 75.0 | 0.00 | -0.50 | floor | `top4-noise` |
| 2031 | 4 | 122 | DEN | 4 | 0 | 63.0 | 0.00 | -0.07 | mid | `top4-noise` |
| 2031 | 4 | 145 | JAX | 3 | 5 | 79.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2031 | 5 | 161 | LV | 3 | 1 | 68.0 | 0.00 | -0.09 | mid | `top4-noise` |
| 2031 | 5 | 164 | PHX | 5 | 0 | 64.0 | 0.00 | -0.07 | mid | `top4-noise` |
| 2031 | 5 | 182 | PHI | 2 | 0 | 87.0 | 0.35 | -0.60 | floor | `top4-noise` |
| 2031 | 5 | 185 | MIN | 1 | 0 | 62.0 | 0.35 | -0.03 | mid | `top4-noise` |
| 2031 | 6 | 212 | PHI | 3 | 0 | 87.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2031 | 6 | 218 | PHI | 4 | 0 | 87.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2031 | 7 | 252 | SF | 4 | 3 | 85.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2031 | 7 | 255 | NO | 5 | 1 | 82.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2032 | 1 | 8 | DEN | 6 | 3 | 64.0 | 0.00 | 0.32 | high | `positionValue` |
| 2032 | 1 | 11 | DET | 4 | 4 | 70.0 | 0.00 | 0.34 | high | `positionValue` |
| 2032 | 1 | 28 | HOU | 4 | 0 | 73.0 | 0.00 | 0.21 | high | `positionValue` |
| 2032 | 2 | 44 | PHX | 5 | 0 | 64.0 | 0.00 | 0.40 | high | `positionValue` |
| 2032 | 3 | 70 | GB | 4 | 0 | 68.0 | 0.00 | 0.15 | high | `positionValue` |
| 2032 | 3 | 76 | PHX | 6 | 0 | 69.0 | 0.00 | 0.21 | high | `top4-noise` |
| 2032 | 3 | 77 | CAR | 3 | 0 | 84.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2032 | 3 | 80 | DET | 5 | 4 | 75.0 | 0.00 | -0.42 | floor | `positionValue` |
| 2032 | 3 | 99 | BKN | 5 | 0 | 65.0 | 0.00 | -0.06 | mid | `positionValue` |
| 2032 | 3 | 103 | BKN | 6 | 0 | 67.0 | 0.00 | -0.15 | floor | `positionValue` |
| 2032 | 3 | 107 | LV | 3 | 2 | 66.0 | 0.00 | -0.12 | mid | `top4-noise` |
| 2032 | 3 | 112 | MEM | 3 | 0 | 82.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2032 | 3 | 115 | BKN | 7 | 0 | 67.0 | 0.00 | -0.18 | floor | `top4-noise` |
| 2032 | 4 | 121 | LV | 4 | 2 | 66.0 | 0.00 | -0.11 | mid | `positionValue` |
| 2032 | 4 | 126 | ATL | 4 | 0 | 80.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2032 | 4 | 134 | ATL | 5 | 0 | 80.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2032 | 4 | 138 | BKN | 8 | 0 | 67.0 | 0.00 | -0.13 | mid | `top4-noise` |
| 2032 | 4 | 145 | BUF | 3 | 0 | 85.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2032 | 4 | 154 | BUF | 4 | 0 | 85.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2032 | 5 | 158 | LV | 5 | 2 | 69.0 | 0.00 | -0.27 | floor | `top4-noise` |
| 2032 | 5 | 182 | PHX | 7 | 0 | 69.0 | 0.00 | -0.32 | floor | `top4-noise` |
| 2032 | 5 | 188 | KC | 3 | 1 | 84.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2032 | 6 | 194 | GB | 5 | 0 | 68.0 | 0.00 | -0.21 | floor | `other` |
| 2032 | 6 | 202 | DEN | 7 | 3 | 73.0 | 0.00 | -0.47 | floor | `positionValue` |
| 2032 | 6 | 204 | DET | 6 | 4 | 75.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2032 | 6 | 209 | MEM | 4 | 0 | 82.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2032 | 7 | 233 | BOS* | 1 | 1 | 77.0 | 0.35 | -0.60 | floor | `top4-noise` |
| 2032 | 7 | 240 | TB | 3 | 1 | 69.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2032 | 7 | 242 | CHI | 5 | 1 | 89.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2032 | 7 | 243 | NO | 3 | 0 | 82.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2032 | 7 | 250 | SEA | 6 | 8 | 88.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2032 | 7 | 251 | NO | 4 | 0 | 82.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2032 | 7 | 252 | NO | 5 | 0 | 82.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2032 | 7 | 254 | PHI | 3 | 0 | 82.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2032 | 7 | 256 | PHI | 4 | 0 | 82.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2032 | 7 | 259 | SEA | 7 | 8 | 88.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2033 | 1 | 10 | NYS | 6 | 1 | 68.0 | 0.00 | 0.34 | high | `positionValue` |
| 2033 | 1 | 12 | PHI | 2 | 0 | 63.0 | 0.35 | 0.47 | high | `joint:thin+marginal+positionValue` |
| 2033 | 2 | 49 | LV | 3 | 2 | 64.0 | 0.00 | 0.19 | high | `positionValue` |
| 2033 | 3 | 79 | PIT | 5 | 0 | 81.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2033 | 3 | 81 | LV | 4 | 2 | 64.0 | 0.00 | -0.01 | mid | `top4-noise` |
| 2033 | 4 | 113 | SEA | 9 | 5 | 91.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2033 | 4 | 124 | PIT | 6 | 0 | 81.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2033 | 4 | 146 | DEN | 3 | 2 | 80.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2033 | 5 | 151 | SEA | 10 | 5 | 91.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2033 | 5 | 156 | DET | 3 | 2 | 76.0 | 0.00 | -0.59 | floor | `positionValue` |
| 2033 | 5 | 170 | SF | 3 | 1 | 85.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2033 | 6 | 188 | BKN | 5 | 0 | 76.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2033 | 6 | 192 | DET | 4 | 2 | 76.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2033 | 6 | 194 | CHI | 4 | 0 | 89.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2033 | 6 | 195 | PIT | 7 | 0 | 81.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2033 | 6 | 200 | SD | 5 | 0 | 72.0 | 0.00 | -0.46 | floor | `positionValue` |
| 2033 | 7 | 240 | BAL | 5 | 0 | 90.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2033 | 7 | 246 | BKN | 6 | 0 | 76.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2033 | 7 | 256 | CIN | 3 | 0 | 82.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2034 | 1 | 6 | BOS* | 2 | 0 | 81.0 | 0.35 | 0.17 | high | `positionValue` |
| 2034 | 1 | 19 | MIN | 4 | 3 | 76.0 | 0.00 | 0.12 | high | `joint:marginal+positionValue` |
| 2034 | 1 | 32 | HAR | 3 | 0 | 63.0 | 0.00 | 0.43 | high | `top4-noise` |
| 2034 | 2 | 43 | CLE | 3 | 0 | 68.0 | 0.00 | 0.30 | high | `positionValue` |
| 2034 | 3 | 66 | CLE | 4 | 0 | 68.0 | 0.00 | 0.18 | high | `positionValue` |
| 2034 | 3 | 78 | HAR | 4 | 0 | 64.0 | 0.00 | 0.29 | high | `positionValue` |
| 2034 | 3 | 82 | DEN | 4 | 2 | 67.0 | 0.00 | 0.05 | mid | `positionValue` |
| 2034 | 3 | 87 | DET | 3 | 2 | 75.0 | 0.00 | -0.48 | floor | `positionValue` |
| 2034 | 3 | 92 | PHX | 4 | 0 | 85.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2034 | 4 | 113 | BKN | 6 | 0 | 79.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2034 | 4 | 118 | LA | 3 | 0 | 80.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2034 | 4 | 122 | LV | 5 | 0 | 68.0 | 0.00 | 0.05 | mid | `other` |
| 2034 | 4 | 131 | CHI | 2 | 1 | 88.0 | 0.35 | -0.60 | floor | `positionValue` |
| 2034 | 4 | 142 | NYS | 6 | 1 | 76.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2034 | 4 | 146 | SEA | 6 | 0 | 91.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2034 | 5 | 153 | TB | 4 | 2 | 83.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2034 | 5 | 161 | CHI | 3 | 1 | 88.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2034 | 5 | 163 | WAS | 3 | 1 | 79.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2034 | 5 | 166 | NYS | 7 | 1 | 76.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2034 | 6 | 199 | NYS | 8 | 1 | 76.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2034 | 6 | 205 | NYS | 9 | 1 | 76.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2034 | 6 | 212 | NYS | 10 | 1 | 76.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2034 | 6 | 223 | DET | 4 | 2 | 75.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2034 | 7 | 232 | NYS | 11 | 1 | 76.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2034 | 7 | 235 | NYS | 12 | 1 | 76.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2034 | 7 | 237 | NYS | 13 | 1 | 76.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2034 | 7 | 242 | NYS | 14 | 1 | 76.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2034 | 7 | 244 | NYS | 15 | 1 | 76.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2034 | 7 | 245 | BAL | 5 | 1 | 91.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2034 | 7 | 247 | NYS | 16 | 1 | 76.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2034 | 7 | 251 | NYS | 17 | 1 | 76.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2034 | 7 | 252 | NYS | 18 | 1 | 76.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2034 | 7 | 253 | DEN | 5 | 2 | 70.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2034 | 7 | 257 | BAL | 6 | 1 | 91.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2034 | 7 | 258 | WAS | 4 | 1 | 79.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2034 | 7 | 259 | NYS | 19 | 1 | 76.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2034 | 7 | 261 | DET | 5 | 2 | 75.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2034 | 7 | 263 | WAS | 5 | 1 | 79.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2034 | 7 | 265 | DET | 6 | 2 | 75.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2035 | 1 | 9 | HAR | 5 | 0 | 65.0 | 0.00 | 0.74 | high | `joint:marginal+positionValue` |
| 2035 | 1 | 12 | GB | 4 | 0 | 70.0 | 0.00 | 0.35 | high | `positionValue` |
| 2035 | 1 | 19 | MIN | 3 | 0 | 64.0 | 0.00 | 0.62 | high | `positionValue` |
| 2035 | 2 | 57 | LA | 4 | 0 | 81.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2035 | 2 | 58 | BUF | 3 | 0 | 74.0 | 0.00 | 0.03 | mid | `top4-noise` |
| 2035 | 3 | 66 | BKN | 6 | 0 | 80.0 | 0.00 | -0.57 | floor | `top4-noise` |
| 2035 | 3 | 81 | SD | 4 | 1 | 72.0 | 0.00 | -0.02 | mid | `positionValue` |
| 2035 | 3 | 88 | MEM | 4 | 1 | 81.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2035 | 3 | 105 | BKN | 7 | 0 | 80.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2035 | 4 | 119 | NO | 5 | 0 | 84.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2035 | 4 | 125 | CMB | 4 | 0 | 72.0 | 0.00 | -0.38 | floor | `top4-noise` |
| 2035 | 4 | 131 | DET | 3 | 0 | 74.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2035 | 4 | 145 | BUF | 4 | 0 | 74.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2035 | 5 | 150 | BKN | 8 | 0 | 80.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2035 | 5 | 154 | SF | 3 | 1 | 73.0 | 0.00 | -0.54 | floor | `top4-noise` |
| 2035 | 5 | 156 | PHI | 5 | 0 | 86.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2035 | 5 | 166 | TB | 5 | 1 | 85.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2035 | 5 | 180 | SEA | 6 | 0 | 92.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2035 | 5 | 183 | SF | 4 | 1 | 73.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2035 | 5 | 184 | LA | 5 | 0 | 81.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2035 | 6 | 193 | DET | 4 | 0 | 74.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2035 | 6 | 206 | MEM | 5 | 1 | 81.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2035 | 6 | 214 | MEM | 6 | 1 | 81.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2035 | 6 | 219 | BAL | 4 | 0 | 90.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2035 | 6 | 227 | BAL | 5 | 0 | 90.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2035 | 7 | 230 | KC | 7 | 5 | 84.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2035 | 7 | 231 | CIN | 3 | 0 | 81.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2035 | 7 | 234 | NYS | 3 | 7 | 77.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2035 | 7 | 236 | CIN | 4 | 0 | 81.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2035 | 7 | 238 | CIN | 5 | 0 | 81.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2035 | 7 | 239 | NYS | 4 | 7 | 77.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2035 | 7 | 248 | NYS | 5 | 7 | 77.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2035 | 7 | 253 | PHI | 6 | 0 | 86.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2035 | 7 | 256 | PHI | 7 | 0 | 86.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2035 | 7 | 257 | NYS | 6 | 7 | 77.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2035 | 7 | 259 | NYS | 7 | 7 | 77.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2035 | 7 | 262 | NYS | 8 | 7 | 77.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2035 | 7 | 265 | NYS | 9 | 7 | 77.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2035 | 7 | 269 | CHI | 3 | 0 | 90.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2036 | 1 | 1 | LA | 5 | 0 | 80.0 | 0.00 | 0.29 | high | `positionValue` |
| 2036 | 1 | 2 | WAS | 3 | 0 | 67.0 | 0.00 | 0.30 | high | `positionValue` |
| 2036 | 1 | 5 | CLE | 5 | 0 | 66.0 | 0.00 | 0.65 | high | `joint:marginal+positionValue` |
| 2036 | 1 | 7 | BUF | 3 | 1 | 64.0 | 0.00 | 0.40 | high | `joint:marginal+positionValue` |
| 2036 | 2 | 51 | CMB | 5 | 0 | 71.0 | 0.00 | 0.06 | high | `top4-noise` |
| 2036 | 2 | 56 | CAR | 3 | 0 | 65.0 | 0.00 | 0.22 | high | `joint:marginal+positionValue` |
| 2036 | 3 | 80 | BUF | 4 | 1 | 64.0 | 0.00 | 0.08 | high | `positionValue` |
| 2036 | 3 | 88 | PIT | 4 | 0 | 83.0 | 0.00 | -0.56 | floor | `top4-noise` |
| 2036 | 3 | 93 | SEA | 5 | 1 | 92.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2036 | 3 | 111 | NYS | 3 | 8 | 77.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2036 | 3 | 115 | BAL | 4 | 0 | 91.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2036 | 4 | 118 | DEN | 3 | 4 | 68.0 | 0.00 | 0.00 | mid | `other` |
| 2036 | 4 | 119 | DET | 6 | 0 | 73.0 | 0.00 | -0.46 | floor | `top4-noise` |
| 2036 | 4 | 132 | CAR | 4 | 0 | 65.0 | 0.00 | -0.05 | mid | `top4-noise` |
| 2036 | 4 | 137 | HOU | 5 | 0 | 89.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2036 | 4 | 147 | SF | 4 | 4 | 71.0 | 0.00 | -0.42 | floor | `positionValue` |
| 2036 | 4 | 149 | PIT | 5 | 0 | 83.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2036 | 5 | 180 | BAL | 5 | 0 | 91.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2036 | 6 | 209 | PHI | 6 | 0 | 84.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2036 | 6 | 217 | DEN | 4 | 4 | 68.0 | 0.00 | -0.42 | floor | `positionValue` |
| 2036 | 6 | 221 | DEN | 5 | 4 | 68.0 | 0.00 | -0.44 | floor | `positionValue` |
| 2036 | 6 | 223 | NYS | 4 | 8 | 77.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2036 | 6 | 229 | BKN | 6 | 0 | 80.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2036 | 7 | 234 | BKN | 7 | 0 | 80.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2036 | 7 | 235 | DEN | 6 | 4 | 68.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2036 | 7 | 243 | BOS* | 1 | 0 | 88.0 | 0.35 | -0.60 | floor | `top4-noise` |
| 2036 | 7 | 245 | NYS | 5 | 8 | 77.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2036 | 7 | 252 | DEN | 7 | 4 | 68.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2036 | 7 | 255 | NSH | 3 | 0 | 70.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2036 | 7 | 257 | DEN | 8 | 4 | 68.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2036 | 7 | 259 | DEN | 9 | 4 | 68.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2036 | 7 | 262 | PHI | 7 | 0 | 84.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2036 | 7 | 263 | WAS | 4 | 0 | 68.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2036 | 7 | 264 | SEA | 6 | 1 | 92.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2036 | 7 | 265 | CIN | 2 | 3 | 79.0 | 0.35 | -0.60 | floor | `top4-noise` |
| 2036 | 7 | 266 | TB | 5 | 0 | 86.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2036 | 7 | 269 | BOS* | 2 | 0 | 88.0 | 0.35 | -0.60 | floor | `joint:thin+positionValue` |
| 2036 | 7 | 271 | BKN | 8 | 0 | 80.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2036 | 7 | 272 | LA | 6 | 0 | 85.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2036 | 7 | 273 | CHI | 2 | 0 | 89.0 | 0.35 | -0.60 | floor | `top4-noise` |
| 2036 | 7 | 274 | BOS* | 3 | 0 | 88.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2037 | 1 | 1 | SF | 5 | 2 | 69.0 | 0.00 | 0.60 | high | `positionValue` |
| 2037 | 1 | 2 | KC | 3 | 5 | 70.0 | 0.00 | 0.34 | high | `positionValue` |
| 2037 | 1 | 7 | DEN | 6 | 4 | 65.0 | 0.00 | 0.48 | high | `positionValue` |
| 2037 | 1 | 11 | CMB | 4 | 0 | 69.0 | 0.00 | 0.33 | high | `positionValue` |
| 2037 | 1 | 31 | BUF | 3 | 0 | 65.0 | 0.00 | 0.23 | high | `positionValue` |
| 2037 | 2 | 33 | SF | 6 | 2 | 69.0 | 0.00 | 0.04 | mid | `top4-noise` |
| 2037 | 2 | 55 | SF | 7 | 2 | 69.0 | 0.00 | 0.28 | high | `other` |
| 2037 | 3 | 75 | BUF | 4 | 0 | 65.0 | 0.00 | 0.21 | high | `positionValue` |
| 2037 | 3 | 104 | SEA | 4 | 1 | 92.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2037 | 3 | 110 | LV | 3 | 0 | 82.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2037 | 4 | 118 | DEN | 7 | 4 | 71.0 | 0.00 | -0.51 | floor | `top4-noise` |
| 2037 | 4 | 129 | CIN | 3 | 4 | 78.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2037 | 4 | 153 | GB | 3 | 0 | 71.0 | 0.00 | -0.39 | floor | `positionValue` |
| 2037 | 5 | 159 | MEM | 4 | 1 | 70.0 | 0.00 | -0.35 | floor | `positionValue` |
| 2037 | 5 | 164 | MEM | 5 | 1 | 70.0 | 0.00 | -0.56 | floor | `top4-noise` |
| 2037 | 5 | 165 | SEA | 5 | 1 | 92.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2037 | 6 | 215 | TB | 3 | 1 | 86.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2037 | 6 | 219 | TB | 4 | 1 | 86.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2037 | 6 | 227 | SF | 8 | 2 | 69.0 | 0.00 | -0.38 | floor | `other` |
| 2037 | 6 | 230 | CLE | 5 | 0 | 82.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2037 | 6 | 231 | NO | 4 | 0 | 83.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2037 | 6 | 238 | BKN | 6 | 0 | 82.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2037 | 7 | 245 | DEN | 8 | 4 | 71.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2037 | 7 | 246 | SEA | 6 | 1 | 92.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2037 | 7 | 250 | TB | 5 | 1 | 86.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2037 | 7 | 251 | NYS | 7 | 9 | 77.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2037 | 7 | 253 | SEA | 7 | 1 | 92.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2037 | 7 | 257 | NYS | 8 | 9 | 77.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2037 | 7 | 262 | BOS* | 1 | 2 | 91.0 | 0.35 | -0.60 | floor | `positionValue` |
| 2037 | 7 | 264 | TB | 6 | 1 | 86.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2037 | 7 | 266 | PHI | 3 | 0 | 83.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2037 | 7 | 268 | SEA | 8 | 1 | 92.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2037 | 7 | 269 | TB | 7 | 1 | 86.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2037 | 7 | 270 | PHI | 4 | 0 | 83.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2037 | 7 | 271 | BOS* | 2 | 2 | 91.0 | 0.35 | -0.60 | floor | `positionValue` |
| 2037 | 7 | 273 | BAL | 5 | 0 | 90.0 | 0.00 | -0.60 | floor | `top4-noise` |
| 2037 | 7 | 275 | NYS | 9 | 9 | 77.0 | 0.00 | -0.60 | floor | `positionValue` |
| 2037 | 7 | 276 | TB | 8 | 1 | 86.0 | 0.00 | -0.60 | floor | `positionValue` |

\* user club, simmed by the same `cpuPick`.

## Every spring, QB #3 and QB #4 (CPU)

| spring | club | on 53 | on PS | slot | where | ovr | rule |
|---|---|---:|---:|---:|---|---:|---|
| 2027 | BKN | 2 | 2 | 3 | ps | 53 | `stashOrFreeAgent` |
| 2027 | BKN | 2 | 2 | 4 | ps | 48 | `stashOrFreeAgent` |
| 2027 | BUF | 5 | 2 | 3 | 53 | 58 | `evaluate` |
| 2027 | BUF | 5 | 2 | 4 | 53 | 57 | `evaluate` |
| 2027 | HAR | 2 | 2 | 3 | ps | 47 | `stashOrFreeAgent` |
| 2027 | HAR | 2 | 2 | 4 | ps | 45 | `stashOrFreeAgent` |
| 2027 | CLE | 3 | 0 | 3 | 53 | 71 | `evaluate` |
| 2027 | CIN | 3 | 2 | 3 | 53 | 60 | `evaluate` |
| 2027 | CIN | 3 | 2 | 4 | ps | 50 | `stashOrFreeAgent` |
| 2027 | CMB | 3 | 2 | 3 | 53 | 66 | `evaluate` |
| 2027 | CMB | 3 | 2 | 4 | ps | 55 | `stashOrFreeAgent` |
| 2027 | NSH | 2 | 1 | 3 | ir | 64 | `evaluate` |
| 2027 | NSH | 2 | 1 | 4 | ps | 49 | `stashOrFreeAgent` |
| 2027 | JAX | 3 | 0 | 3 | 53 | 62 | `evaluate` |
| 2027 | MEM | 4 | 2 | 3 | 53 | 66 | `evaluate` |
| 2027 | MEM | 4 | 2 | 4 | 53 | 52 | `worseSurplus` |
| 2027 | DEN | 3 | 2 | 3 | 53 | 59 | `evaluate` |
| 2027 | DEN | 3 | 2 | 4 | ps | 50 | `stashOrFreeAgent` |
| 2027 | LV | 2 | 1 | 3 | ps | 50 | `stashOrFreeAgent` |
| 2027 | SD | 2 | 1 | 3 | ps | 48 | `stashOrFreeAgent` |
| 2027 | KC | 2 | 0 | 3 | ir | 73 | `evaluate` |
| 2027 | NYS | 3 | 1 | 3 | 53 | 57 | `evaluate` |
| 2027 | NYS | 3 | 1 | 4 | ps | 43 | `stashOrFreeAgent` |
| 2027 | PHI | 4 | 0 | 3 | 53 | 65 | `evaluate` |
| 2027 | PHI | 4 | 0 | 4 | 53 | 61 | `evaluate` |
| 2027 | BAL | 2 | 4 | 3 | ps | 52 | `stashOrFreeAgent` |
| 2027 | BAL | 2 | 4 | 4 | ps | 51 | `stashOrFreeAgent` |
| 2027 | CHI | 3 | 3 | 3 | 53 | 69 | `evaluate` |
| 2027 | CHI | 3 | 3 | 4 | ps | 49 | `stashOrFreeAgent` |
| 2027 | GB | 3 | 2 | 3 | 53 | 73 | `worseSurplus` |
| 2027 | GB | 3 | 2 | 4 | ps | 52 | `stashOrFreeAgent` |
| 2027 | DET | 2 | 1 | 3 | ps | 51 | `stashOrFreeAgent` |
| 2027 | MIN | 3 | 1 | 3 | 53 | 55 | `evaluate` |
| 2027 | MIN | 3 | 1 | 4 | ps | 51 | `stashOrFreeAgent` |
| 2027 | ATL | 4 | 0 | 3 | 53 | 68 | `evaluate` |
| 2027 | ATL | 4 | 0 | 4 | 53 | 54 | `worseSurplus` |
| 2027 | TB | 2 | 1 | 3 | ir | 93 | `evaluate` |
| 2027 | TB | 2 | 1 | 4 | ps | 43 | `stashOrFreeAgent` |
| 2027 | CAR | 2 | 1 | 3 | ps | 46 | `stashOrFreeAgent` |
| 2027 | SF | 4 | 2 | 3 | 53 | 55 | `evaluate` |
| 2027 | SF | 4 | 2 | 4 | 53 | 54 | `evaluate` |
| 2027 | SEA | 3 | 2 | 3 | 53 | 66 | `worseSurplus` |
| 2027 | SEA | 3 | 2 | 4 | ps | 52 | `stashOrFreeAgent` |
| 2027 | LA | 2 | 1 | 3 | ps | 51 | `stashOrFreeAgent` |
| 2027 | PHX | 2 | 2 | 3 | ps | 49 | `stashOrFreeAgent` |
| 2027 | PHX | 2 | 2 | 4 | ps | 49 | `stashOrFreeAgent` |
| 2028 | BKN | 6 | 3 | 3 | 53 | 62 | `evaluate` |
| 2028 | BKN | 6 | 3 | 4 | 53 | 61 | `evaluate` |
| 2028 | BUF | 8 | 0 | 3 | 53 | 65 | `evaluate` |
| 2028 | BUF | 8 | 0 | 4 | 53 | 62 | `evaluate` |
| 2028 | HAR | 2 | 1 | 3 | ps | 50 | `stashOrFreeAgent` |
| 2028 | CLE | 3 | 0 | 3 | 53 | 73 | `evaluate` |
| 2028 | PIT | 4 | 0 | 3 | 53 | 62 | `evaluate` |
| 2028 | PIT | 4 | 0 | 4 | 53 | 56 | `evaluate` |
| 2028 | NSH | 2 | 2 | 3 | ps | 51 | `stashOrFreeAgent` |
| 2028 | NSH | 2 | 2 | 4 | ps | 49 | `stashOrFreeAgent` |
| 2028 | JAX | 4 | 0 | 3 | 53 | 73 | `evaluate` |
| 2028 | JAX | 4 | 0 | 4 | 53 | 69 | `evaluate` |
| 2028 | MEM | 3 | 0 | 3 | 53 | 67 | `evaluate` |
| 2028 | DEN | 8 | 1 | 3 | 53 | 62 | `evaluate` |
| 2028 | DEN | 8 | 1 | 4 | 53 | 61 | `evaluate` |
| 2028 | LV | 2 | 1 | 3 | ps | 53 | `stashOrFreeAgent` |
| 2028 | KC | 2 | 1 | 3 | ps | 42 | `stashOrFreeAgent` |
| 2028 | NYS | 2 | 4 | 3 | ps | 51 | `stashOrFreeAgent` |
| 2028 | NYS | 2 | 4 | 4 | ps | 50 | `stashOrFreeAgent` |
| 2028 | PHI | 4 | 3 | 3 | 53 | 62 | `evaluate` |
| 2028 | PHI | 4 | 3 | 4 | 53 | 59 | `evaluate` |
| 2028 | BAL | 5 | 0 | 3 | 53 | 63 | `evaluate` |
| 2028 | BAL | 5 | 0 | 4 | 53 | 59 | `evaluate` |
| 2028 | CHI | 6 | 2 | 3 | 53 | 68 | `evaluate` |
| 2028 | CHI | 6 | 2 | 4 | 53 | 66 | `evaluate` |
| 2028 | GB | 2 | 1 | 3 | ps | 41 | `stashOrFreeAgent` |
| 2028 | TB | 2 | 2 | 3 | ps | 48 | `stashOrFreeAgent` |
| 2028 | TB | 2 | 2 | 4 | ps | 45 | `stashOrFreeAgent` |
| 2028 | SF | 5 | 3 | 3 | 53 | 59 | `evaluate` |
| 2028 | SF | 5 | 3 | 4 | 53 | 59 | `evaluate` |
| 2028 | SEA | 4 | 1 | 3 | 53 | 57 | `worseSurplus` |
| 2028 | SEA | 4 | 1 | 4 | 53 | 57 | `evaluate` |
| 2028 | LA | 5 | 2 | 3 | 53 | 64 | `evaluate` |
| 2028 | LA | 5 | 2 | 4 | 53 | 61 | `worseSurplus` |
| 2029 | BKN | 6 | 2 | 3 | 53 | 63 | `evaluate` |
| 2029 | BKN | 6 | 2 | 4 | 53 | 61 | `evaluate` |
| 2029 | BUF | 5 | 0 | 3 | 53 | 62 | `evaluate` |
| 2029 | BUF | 5 | 0 | 4 | 53 | 59 | `evaluate` |
| 2029 | HAR | 2 | 3 | 3 | ir | 79 | `evaluate` |
| 2029 | HAR | 2 | 3 | 4 | ps | 52 | `stashOrFreeAgent` |
| 2029 | CLE | 3 | 1 | 3 | 53 | 66 | `evaluate` |
| 2029 | CLE | 3 | 1 | 4 | ps | 47 | `stashOrFreeAgent` |
| 2029 | PIT | 7 | 0 | 3 | 53 | 67 | `evaluate` |
| 2029 | PIT | 7 | 0 | 4 | 53 | 63 | `evaluate` |
| 2029 | CIN | 3 | 2 | 3 | 53 | 59 | `evaluate` |
| 2029 | CIN | 3 | 2 | 4 | ps | 50 | `stashOrFreeAgent` |
| 2029 | JAX | 3 | 0 | 3 | 53 | 69 | `evaluate` |
| 2029 | MEM | 2 | 2 | 3 | ir | 77 | `evaluate` |
| 2029 | MEM | 2 | 2 | 4 | ps | 51 | `stashOrFreeAgent` |
| 2029 | DEN | 6 | 1 | 3 | 53 | 64 | `evaluate` |
| 2029 | DEN | 6 | 1 | 4 | 53 | 60 | `evaluate` |
| 2029 | LV | 2 | 1 | 3 | ir | 57 | `below-surplus-line` |
| 2029 | LV | 2 | 1 | 4 | ps | 49 | `stashOrFreeAgent` |
| 2029 | KC | 3 | 3 | 3 | 53 | 62 | `evaluate` |
| 2029 | KC | 3 | 3 | 4 | ps | 51 | `stashOrFreeAgent` |
| 2029 | NYS | 4 | 4 | 3 | 53 | 57 | `worseSurplus` |
| 2029 | NYS | 4 | 4 | 4 | 53 | 56 | `evaluate` |
| 2029 | PHI | 4 | 1 | 3 | 53 | 66 | `evaluate` |
| 2029 | PHI | 4 | 1 | 4 | 53 | 60 | `evaluate` |
| 2029 | WAS | 3 | 0 | 3 | 53 | 62 | `evaluate` |
| 2029 | BAL | 5 | 1 | 3 | 53 | 64 | `evaluate` |
| 2029 | BAL | 5 | 1 | 4 | 53 | 61 | `evaluate` |
| 2029 | CHI | 4 | 3 | 3 | 53 | 61 | `evaluate` |
| 2029 | CHI | 4 | 3 | 4 | 53 | 60 | `evaluate` |
| 2029 | DET | 3 | 1 | 3 | 53 | 57 | `evaluate` |
| 2029 | DET | 3 | 1 | 4 | ps | 53 | `stashOrFreeAgent` |
| 2029 | MIN | 4 | 1 | 3 | 53 | 60 | `evaluate` |
| 2029 | MIN | 4 | 1 | 4 | 53 | 58 | `evaluate` |
| 2029 | ATL | 3 | 2 | 3 | 53 | 62 | `evaluate` |
| 2029 | ATL | 3 | 2 | 4 | ps | 45 | `stashOrFreeAgent` |
| 2029 | NO | 3 | 0 | 3 | 53 | 59 | `evaluate` |
| 2029 | TB | 3 | 2 | 3 | 53 | 64 | `evaluate` |
| 2029 | TB | 3 | 2 | 4 | ps | 54 | `stashOrFreeAgent` |
| 2029 | CAR | 3 | 0 | 3 | 53 | 61 | `worseSurplus` |
| 2029 | SF | 6 | 3 | 3 | 53 | 60 | `evaluate` |
| 2029 | SF | 6 | 3 | 4 | 53 | 60 | `evaluate` |
| 2029 | SEA | 5 | 5 | 3 | 53 | 66 | `evaluate` |
| 2029 | SEA | 5 | 5 | 4 | 53 | 59 | `evaluate` |
| 2029 | LA | 7 | 1 | 3 | 53 | 63 | `evaluate` |
| 2029 | LA | 7 | 1 | 4 | 53 | 62 | `evaluate` |
| 2030 | BKN | 6 | 4 | 3 | 53 | 64 | `evaluate` |
| 2030 | BKN | 6 | 4 | 4 | 53 | 61 | `evaluate` |
| 2030 | BUF | 6 | 0 | 3 | 53 | 62 | `evaluate` |
| 2030 | BUF | 6 | 0 | 4 | 53 | 62 | `evaluate` |
| 2030 | CLE | 6 | 1 | 3 | 53 | 66 | `evaluate` |
| 2030 | CLE | 6 | 1 | 4 | 53 | 66 | `evaluate` |
| 2030 | PIT | 7 | 0 | 3 | 53 | 71 | `evaluate` |
| 2030 | PIT | 7 | 0 | 4 | 53 | 68 | `evaluate` |
| 2030 | CIN | 3 | 4 | 3 | 53 | 59 | `evaluate` |
| 2030 | CIN | 3 | 4 | 4 | ps | 54 | `stashOrFreeAgent` |
| 2030 | HOU | 4 | 1 | 3 | 53 | 57 | `evaluate` |
| 2030 | HOU | 4 | 1 | 4 | 53 | 52 | `worseSurplus` |
| 2030 | NSH | 2 | 2 | 3 | ir | 85 | `evaluate` |
| 2030 | NSH | 2 | 2 | 4 | ir | 59 | `below-surplus-line` |
| 2030 | JAX | 3 | 2 | 3 | 53 | 66 | `evaluate` |
| 2030 | JAX | 3 | 2 | 4 | ps | 51 | `stashOrFreeAgent` |
| 2030 | MEM | 3 | 2 | 3 | 53 | 57 | `evaluate` |
| 2030 | MEM | 3 | 2 | 4 | ps | 52 | `stashOrFreeAgent` |
| 2030 | DEN | 7 | 1 | 3 | 53 | 61 | `evaluate` |
| 2030 | DEN | 7 | 1 | 4 | 53 | 60 | `evaluate` |
| 2030 | LV | 4 | 1 | 3 | 53 | 64 | `evaluate` |
| 2030 | LV | 4 | 1 | 4 | 53 | 61 | `evaluate` |
| 2030 | KC | 3 | 0 | 3 | 53 | 58 | `evaluate` |
| 2030 | KC | 3 | 0 | 4 | ir | 78 | `evaluate` |
| 2030 | NYS | 7 | 2 | 3 | 53 | 58 | `worseSurplus` |
| 2030 | NYS | 7 | 2 | 4 | 53 | 58 | `evaluate` |
| 2030 | PHI | 4 | 0 | 3 | 53 | 59 | `evaluate` |
| 2030 | PHI | 4 | 0 | 4 | 53 | 58 | `evaluate` |
| 2030 | WAS | 4 | 2 | 3 | 53 | 59 | `evaluate` |
| 2030 | WAS | 4 | 2 | 4 | 53 | 58 | `evaluate` |
| 2030 | BAL | 4 | 2 | 3 | 53 | 64 | `evaluate` |
| 2030 | BAL | 4 | 2 | 4 | 53 | 62 | `evaluate` |
| 2030 | CHI | 5 | 1 | 3 | 53 | 62 | `evaluate` |
| 2030 | CHI | 5 | 1 | 4 | 53 | 60 | `evaluate` |
| 2030 | GB | 2 | 1 | 3 | ps | 50 | `stashOrFreeAgent` |
| 2030 | DET | 6 | 7 | 3 | 53 | 63 | `evaluate` |
| 2030 | DET | 6 | 7 | 4 | 53 | 57 | `evaluate` |
| 2030 | MIN | 5 | 1 | 3 | 53 | 58 | `evaluate` |
| 2030 | MIN | 5 | 1 | 4 | 53 | 57 | `worseSurplus` |
| 2030 | ATL | 6 | 0 | 3 | 53 | 68 | `evaluate` |
| 2030 | ATL | 6 | 0 | 4 | 53 | 64 | `evaluate` |
| 2030 | NO | 3 | 2 | 3 | 53 | 59 | `evaluate` |
| 2030 | NO | 3 | 2 | 4 | ps | 53 | `stashOrFreeAgent` |
| 2030 | TB | 4 | 3 | 3 | 53 | 62 | `evaluate` |
| 2030 | TB | 4 | 3 | 4 | 53 | 61 | `evaluate` |
| 2030 | CAR | 3 | 0 | 3 | 53 | 59 | `worseSurplus` |
| 2030 | SF | 4 | 4 | 3 | 53 | 59 | `evaluate` |
| 2030 | SF | 4 | 4 | 4 | 53 | 56 | `evaluate` |
| 2030 | SEA | 6 | 13 | 3 | 53 | 68 | `evaluate` |
| 2030 | SEA | 6 | 13 | 4 | 53 | 63 | `evaluate` |
| 2030 | LA | 8 | 1 | 3 | 53 | 67 | `evaluate` |
| 2030 | LA | 8 | 1 | 4 | 53 | 67 | `evaluate` |
| 2030 | PHX | 3 | 0 | 3 | 53 | 59 | `evaluate` |
| 2031 | BKN | 6 | 0 | 3 | 53 | 62 | `evaluate` |
| 2031 | BKN | 6 | 0 | 4 | 53 | 62 | `evaluate` |
| 2031 | BUF | 3 | 0 | 3 | 53 | 59 | `evaluate` |
| 2031 | BUF | 3 | 0 | 4 | ir | 88 | `evaluate` |
| 2031 | HAR | 2 | 2 | 3 | ps | 50 | `stashOrFreeAgent` |
| 2031 | HAR | 2 | 2 | 4 | ps | 48 | `stashOrFreeAgent` |
| 2031 | CLE | 6 | 2 | 3 | 53 | 68 | `evaluate` |
| 2031 | CLE | 6 | 2 | 4 | 53 | 66 | `evaluate` |
| 2031 | PIT | 8 | 0 | 3 | 53 | 72 | `evaluate` |
| 2031 | PIT | 8 | 0 | 4 | 53 | 68 | `evaluate` |
| 2031 | CIN | 3 | 3 | 3 | 53 | 72 | `evaluate` |
| 2031 | CIN | 3 | 3 | 4 | ps | 52 | `stashOrFreeAgent` |
| 2031 | CMB | 3 | 0 | 3 | 53 | 63 | `evaluate` |
| 2031 | HOU | 2 | 2 | 3 | ps | 53 | `stashOrFreeAgent` |
| 2031 | HOU | 2 | 2 | 4 | ps | 52 | `stashOrFreeAgent` |
| 2031 | NSH | 4 | 1 | 3 | 53 | 57 | `evaluate` |
| 2031 | NSH | 4 | 1 | 4 | 53 | 56 | `evaluate` |
| 2031 | JAX | 2 | 8 | 3 | ps | 53 | `stashOrFreeAgent` |
| 2031 | JAX | 2 | 8 | 4 | ps | 53 | `stashOrFreeAgent` |
| 2031 | MEM | 3 | 4 | 3 | 53 | 59 | `evaluate` |
| 2031 | MEM | 3 | 4 | 4 | ir | 75 | `evaluate` |
| 2031 | DEN | 8 | 0 | 3 | 53 | 61 | `evaluate` |
| 2031 | DEN | 8 | 0 | 4 | 53 | 59 | `evaluate` |
| 2031 | LV | 3 | 3 | 3 | 53 | 61 | `evaluate` |
| 2031 | LV | 3 | 3 | 4 | ps | 54 | `stashOrFreeAgent` |
| 2031 | SD | 3 | 1 | 3 | 53 | 62 | `evaluate` |
| 2031 | SD | 3 | 1 | 4 | ps | 51 | `stashOrFreeAgent` |
| 2031 | KC | 2 | 3 | 3 | ps | 59 | `stashOrFreeAgent` |
| 2031 | KC | 2 | 3 | 4 | ps | 53 | `stashOrFreeAgent` |
| 2031 | NYS | 6 | 4 | 3 | 53 | 58 | `worseSurplus` |
| 2031 | NYS | 6 | 4 | 4 | 53 | 57 | `evaluate` |
| 2031 | PHI | 4 | 0 | 3 | 53 | 59 | `evaluate` |
| 2031 | PHI | 4 | 0 | 4 | 53 | 57 | `draftCapitalHold` |
| 2031 | WAS | 3 | 2 | 3 | 53 | 59 | `evaluate` |
| 2031 | WAS | 3 | 2 | 4 | ps | 59 | `stashOrFreeAgent` |
| 2031 | BAL | 7 | 3 | 3 | 53 | 62 | `evaluate` |
| 2031 | BAL | 7 | 3 | 4 | 53 | 60 | `evaluate` |
| 2031 | CHI | 3 | 2 | 3 | 53 | 55 | `worseSurplus` |
| 2031 | CHI | 3 | 2 | 4 | ir | 78 | `evaluate` |
| 2031 | GB | 2 | 1 | 3 | ps | 54 | `stashOrFreeAgent` |
| 2031 | DET | 6 | 2 | 3 | 53 | 64 | `evaluate` |
| 2031 | DET | 6 | 2 | 4 | 53 | 59 | `evaluate` |
| 2031 | MIN | 2 | 1 | 3 | ps | 47 | `stashOrFreeAgent` |
| 2031 | ATL | 5 | 0 | 3 | 53 | 68 | `evaluate` |
| 2031 | ATL | 5 | 0 | 4 | 53 | 63 | `evaluate` |
| 2031 | NO | 4 | 3 | 3 | 53 | 60 | `evaluate` |
| 2031 | NO | 4 | 3 | 4 | 53 | 58 | `evaluate` |
| 2031 | TB | 4 | 4 | 3 | 53 | 65 | `evaluate` |
| 2031 | TB | 4 | 4 | 4 | 53 | 59 | `evaluate` |
| 2031 | CAR | 2 | 0 | 3 | ir | 84 | `evaluate` |
| 2031 | SF | 3 | 5 | 3 | 53 | 58 | `evaluate` |
| 2031 | SF | 3 | 5 | 4 | ps | 52 | `stashOrFreeAgent` |
| 2031 | SEA | 9 | 15 | 3 | 53 | 69 | `evaluate` |
| 2031 | SEA | 9 | 15 | 4 | 53 | 67 | `evaluate` |
| 2031 | LA | 7 | 2 | 3 | 53 | 65 | `evaluate` |
| 2031 | LA | 7 | 2 | 4 | 53 | 61 | `evaluate` |
| 2031 | PHX | 3 | 1 | 3 | 53 | 58 | `evaluate` |
| 2031 | PHX | 3 | 1 | 4 | ir | 69 | `evaluate` |
| 2032 | BKN | 4 | 0 | 3 | 53 | 61 | `evaluate` |
| 2032 | BKN | 4 | 0 | 4 | 53 | 60 | `evaluate` |
| 2032 | BUF | 3 | 2 | 3 | 53 | 60 | `evaluate` |
| 2032 | BUF | 3 | 2 | 4 | ps | 51 | `stashOrFreeAgent` |
| 2032 | HAR | 5 | 1 | 3 | 53 | 60 | `evaluate` |
| 2032 | HAR | 5 | 1 | 4 | 53 | 57 | `worseSurplus` |
| 2032 | CLE | 6 | 0 | 3 | 53 | 68 | `evaluate` |
| 2032 | CLE | 6 | 0 | 4 | 53 | 68 | `evaluate` |
| 2032 | PIT | 4 | 0 | 3 | 53 | 60 | `evaluate` |
| 2032 | PIT | 4 | 0 | 4 | 53 | 56 | `draftCapitalHold` |
| 2032 | CIN | 2 | 1 | 3 | ps | 48 | `stashOrFreeAgent` |
| 2032 | CMB | 4 | 0 | 3 | 53 | 72 | `no-surplus-trim` |
| 2032 | CMB | 4 | 0 | 4 | 53 | 56 | `worseSurplus` |
| 2032 | HOU | 6 | 1 | 3 | 53 | 70 | `evaluate` |
| 2032 | HOU | 6 | 1 | 4 | 53 | 69 | `evaluate` |
| 2032 | NSH | 3 | 4 | 3 | 53 | 58 | `evaluate` |
| 2032 | NSH | 3 | 4 | 4 | ir | 84 | `evaluate` |
| 2032 | JAX | 5 | 6 | 3 | 53 | 61 | `evaluate` |
| 2032 | JAX | 5 | 6 | 4 | 53 | 59 | `evaluate` |
| 2032 | MEM | 3 | 1 | 3 | 53 | 58 | `evaluate` |
| 2032 | MEM | 3 | 1 | 4 | ps | 46 | `stashOrFreeAgent` |
| 2032 | DEN | 6 | 7 | 3 | 53 | 59 | `evaluate` |
| 2032 | DEN | 6 | 7 | 4 | 53 | 56 | `worseSurplus` |
| 2032 | LV | 3 | 1 | 3 | 53 | 60 | `evaluate` |
| 2032 | LV | 3 | 1 | 4 | ps | 48 | `stashOrFreeAgent` |
| 2032 | SD | 3 | 2 | 3 | 53 | 64 | `evaluate` |
| 2032 | SD | 3 | 2 | 4 | ps | 47 | `stashOrFreeAgent` |
| 2032 | KC | 6 | 2 | 3 | 53 | 65 | `evaluate` |
| 2032 | KC | 6 | 2 | 4 | 53 | 64 | `evaluate` |
| 2032 | NYS | 5 | 1 | 3 | 53 | 61 | `worseSurplus` |
| 2032 | NYS | 5 | 1 | 4 | 53 | 56 | `worseSurplus` |
| 2032 | PHI | 4 | 1 | 3 | 53 | 61 | `evaluate` |
| 2032 | PHI | 4 | 1 | 4 | 53 | 57 | `evaluate` |
| 2032 | WAS | 4 | 4 | 3 | 53 | 60 | `evaluate` |
| 2032 | WAS | 4 | 4 | 4 | 53 | 57 | `worseSurplus` |
| 2032 | BAL | 7 | 4 | 3 | 53 | 61 | `worseSurplus` |
| 2032 | BAL | 7 | 4 | 4 | 53 | 60 | `evaluate` |
| 2032 | CHI | 4 | 2 | 3 | 53 | 59 | `evaluate` |
| 2032 | CHI | 4 | 2 | 4 | 53 | 57 | `worseSurplus` |
| 2032 | GB | 4 | 0 | 3 | 53 | 61 | `evaluate` |
| 2032 | GB | 4 | 0 | 4 | 53 | 56 | `evaluate` |
| 2032 | DET | 7 | 5 | 3 | 53 | 65 | `evaluate` |
| 2032 | DET | 7 | 5 | 4 | 53 | 62 | `evaluate` |
| 2032 | MIN | 4 | 1 | 3 | 53 | 57 | `worseSurplus` |
| 2032 | MIN | 4 | 1 | 4 | 53 | 55 | `evaluate` |
| 2032 | ATL | 3 | 0 | 3 | 53 | 62 | `evaluate` |
| 2032 | NO | 5 | 4 | 3 | 53 | 63 | `evaluate` |
| 2032 | NO | 5 | 4 | 4 | 53 | 60 | `evaluate` |
| 2032 | TB | 5 | 1 | 3 | 53 | 64 | `evaluate` |
| 2032 | TB | 5 | 1 | 4 | 53 | 58 | `evaluate` |
| 2032 | SF | 4 | 4 | 3 | 53 | 61 | `evaluate` |
| 2032 | SF | 4 | 4 | 4 | 53 | 61 | `evaluate` |
| 2032 | SEA | 7 | 11 | 3 | 53 | 70 | `evaluate` |
| 2032 | SEA | 7 | 11 | 4 | 53 | 67 | `evaluate` |
| 2032 | LA | 6 | 0 | 3 | 53 | 71 | `evaluate` |
| 2032 | LA | 6 | 0 | 4 | 53 | 68 | `evaluate` |
| 2032 | PHX | 5 | 3 | 3 | 53 | 62 | `evaluate` |
| 2032 | PHX | 5 | 3 | 4 | 53 | 61 | `evaluate` |
| 2033 | BKN | 9 | 2 | 3 | 53 | 63 | `evaluate` |
| 2033 | BKN | 9 | 2 | 4 | 53 | 63 | `evaluate` |
| 2033 | BUF | 4 | 0 | 3 | 53 | 63 | `evaluate` |
| 2033 | BUF | 4 | 0 | 4 | 53 | 62 | `evaluate` |
| 2033 | HAR | 4 | 0 | 3 | 53 | 61 | `evaluate` |
| 2033 | HAR | 4 | 0 | 4 | 53 | 60 | `evaluate` |
| 2033 | CLE | 4 | 0 | 3 | 53 | 69 | `evaluate` |
| 2033 | CLE | 4 | 0 | 4 | 53 | 57 | `evaluate` |
| 2033 | PIT | 3 | 1 | 3 | 53 | 61 | `evaluate` |
| 2033 | PIT | 3 | 1 | 4 | ps | 48 | `stashOrFreeAgent` |
| 2033 | CIN | 3 | 5 | 3 | 53 | 60 | `evaluate` |
| 2033 | CIN | 3 | 5 | 4 | ir | 81 | `evaluate` |
| 2033 | CMB | 3 | 0 | 3 | 53 | 70 | `evaluate` |
| 2033 | HOU | 5 | 0 | 3 | 53 | 69 | `evaluate` |
| 2033 | HOU | 5 | 0 | 4 | 53 | 68 | `evaluate` |
| 2033 | NSH | 3 | 0 | 3 | 53 | 58 | `evaluate` |
| 2033 | JAX | 5 | 0 | 3 | 53 | 73 | `evaluate` |
| 2033 | JAX | 5 | 0 | 4 | 53 | 62 | `evaluate` |
| 2033 | MEM | 5 | 0 | 3 | 53 | 63 | `evaluate` |
| 2033 | MEM | 5 | 0 | 4 | 53 | 57 | `evaluate` |
| 2033 | DEN | 9 | 3 | 3 | 53 | 64 | `evaluate` |
| 2033 | DEN | 9 | 3 | 4 | 53 | 59 | `evaluate` |
| 2033 | LV | 5 | 3 | 3 | 53 | 63 | `evaluate` |
| 2033 | LV | 5 | 3 | 4 | 53 | 61 | `evaluate` |
| 2033 | SD | 4 | 0 | 3 | 53 | 61 | `worseSurplus` |
| 2033 | SD | 4 | 0 | 4 | 53 | 59 | `evaluate` |
| 2033 | KC | 3 | 1 | 3 | 53 | 54 | `evaluate` |
| 2033 | KC | 3 | 1 | 4 | ps | 46 | `stashOrFreeAgent` |
| 2033 | NYS | 6 | 1 | 3 | 53 | 62 | `evaluate` |
| 2033 | NYS | 6 | 1 | 4 | 53 | 59 | `evaluate` |
| 2033 | PHI | 3 | 2 | 3 | 53 | 58 | `evaluate` |
| 2033 | PHI | 3 | 2 | 4 | ps | 50 | `stashOrFreeAgent` |
| 2033 | WAS | 3 | 0 | 3 | 53 | 59 | `evaluate` |
| 2033 | BAL | 6 | 1 | 3 | 53 | 61 | `evaluate` |
| 2033 | BAL | 6 | 1 | 4 | 53 | 60 | `evaluate` |
| 2033 | CHI | 5 | 3 | 3 | 53 | 62 | `evaluate` |
| 2033 | CHI | 5 | 3 | 4 | 53 | 57 | `draftCapitalHold` |
| 2033 | GB | 5 | 3 | 3 | 53 | 61 | `evaluate` |
| 2033 | GB | 5 | 3 | 4 | 53 | 60 | `evaluate` |
| 2033 | DET | 7 | 7 | 3 | 53 | 67 | `evaluate` |
| 2033 | DET | 7 | 7 | 4 | 53 | 67 | `evaluate` |
| 2033 | MIN | 5 | 2 | 3 | 53 | 62 | `evaluate` |
| 2033 | MIN | 5 | 2 | 4 | 53 | 58 | `evaluate` |
| 2033 | ATL | 5 | 1 | 3 | 53 | 63 | `evaluate` |
| 2033 | ATL | 5 | 1 | 4 | 53 | 60 | `evaluate` |
| 2033 | NO | 4 | 2 | 3 | 53 | 60 | `evaluate` |
| 2033 | NO | 4 | 2 | 4 | 53 | 57 | `worseSurplus` |
| 2033 | TB | 4 | 8 | 3 | 53 | 56 | `worseSurplus` |
| 2033 | TB | 4 | 8 | 4 | 53 | 55 | `evaluate` |
| 2033 | CAR | 5 | 1 | 3 | 53 | 64 | `evaluate` |
| 2033 | CAR | 5 | 1 | 4 | 53 | 62 | `evaluate` |
| 2033 | SF | 5 | 4 | 3 | 53 | 61 | `evaluate` |
| 2033 | SF | 5 | 4 | 4 | 53 | 58 | `evaluate` |
| 2033 | SEA | 8 | 9 | 3 | 53 | 65 | `evaluate` |
| 2033 | SEA | 8 | 9 | 4 | 53 | 65 | `evaluate` |
| 2033 | LA | 6 | 0 | 3 | 53 | 70 | `evaluate` |
| 2033 | LA | 6 | 0 | 4 | 53 | 62 | `evaluate` |
| 2033 | PHX | 7 | 1 | 3 | 53 | 64 | `evaluate` |
| 2033 | PHX | 7 | 1 | 4 | 53 | 63 | `evaluate` |
| 2034 | BKN | 8 | 2 | 3 | 53 | 66 | `evaluate` |
| 2034 | BKN | 8 | 2 | 4 | 53 | 64 | `evaluate` |
| 2034 | BUF | 5 | 0 | 3 | 53 | 62 | `evaluate` |
| 2034 | BUF | 5 | 0 | 4 | 53 | 62 | `evaluate` |
| 2034 | HAR | 4 | 0 | 3 | 53 | 59 | `evaluate` |
| 2034 | HAR | 4 | 0 | 4 | 53 | 58 | `evaluate` |
| 2034 | CLE | 4 | 0 | 3 | 53 | 58 | `evaluate` |
| 2034 | CLE | 4 | 0 | 4 | 53 | 58 | `evaluate` |
| 2034 | PIT | 8 | 0 | 3 | 53 | 63 | `evaluate` |
| 2034 | PIT | 8 | 0 | 4 | 53 | 62 | `evaluate` |
| 2034 | CIN | 4 | 4 | 3 | 53 | 60 | `evaluate` |
| 2034 | CIN | 4 | 4 | 4 | 53 | 58 | `evaluate` |
| 2034 | CMB | 3 | 0 | 3 | 53 | 68 | `evaluate` |
| 2034 | HOU | 2 | 1 | 3 | ps | 53 | `stashOrFreeAgent` |
| 2034 | NSH | 5 | 3 | 3 | 53 | 61 | `evaluate` |
| 2034 | NSH | 5 | 3 | 4 | 53 | 60 | `evaluate` |
| 2034 | JAX | 5 | 0 | 3 | 53 | 72 | `evaluate` |
| 2034 | JAX | 5 | 0 | 4 | 53 | 62 | `evaluate` |
| 2034 | MEM | 3 | 0 | 3 | 53 | 63 | `evaluate` |
| 2034 | MEM | 3 | 0 | 4 | ir | 82 | `evaluate` |
| 2034 | DEN | 3 | 3 | 3 | 53 | 58 | `evaluate` |
| 2034 | DEN | 3 | 3 | 4 | ps | 53 | `stashOrFreeAgent` |
| 2034 | LV | 5 | 4 | 3 | 53 | 64 | `evaluate` |
| 2034 | LV | 5 | 4 | 4 | 53 | 64 | `evaluate` |
| 2034 | SD | 5 | 2 | 3 | 53 | 66 | `evaluate` |
| 2034 | SD | 5 | 2 | 4 | 53 | 63 | `evaluate` |
| 2034 | KC | 8 | 5 | 3 | 53 | 68 | `evaluate` |
| 2034 | KC | 8 | 5 | 4 | 53 | 66 | `evaluate` |
| 2034 | NYS | 7 | 4 | 3 | 53 | 68 | `evaluate` |
| 2034 | NYS | 7 | 4 | 4 | 53 | 62 | `evaluate` |
| 2034 | PHI | 4 | 0 | 3 | 53 | 59 | `worseSurplus` |
| 2034 | PHI | 4 | 0 | 4 | 53 | 59 | `evaluate` |
| 2034 | WAS | 3 | 6 | 3 | 53 | 55 | `evaluate` |
| 2034 | WAS | 3 | 6 | 4 | ir | 81 | `evaluate` |
| 2034 | BAL | 5 | 2 | 3 | 53 | 60 | `evaluate` |
| 2034 | BAL | 5 | 2 | 4 | 53 | 60 | `evaluate` |
| 2034 | CHI | 6 | 6 | 3 | 53 | 68 | `evaluate` |
| 2034 | CHI | 6 | 6 | 4 | 53 | 63 | `worseSurplus` |
| 2034 | GB | 4 | 2 | 3 | 53 | 61 | `evaluate` |
| 2034 | GB | 4 | 2 | 4 | 53 | 59 | `evaluate` |
| 2034 | DET | 4 | 0 | 3 | 53 | 58 | `evaluate` |
| 2034 | DET | 4 | 0 | 4 | 53 | 57 | `draftCapitalHold` |
| 2034 | MIN | 4 | 3 | 3 | 53 | 59 | `evaluate` |
| 2034 | MIN | 4 | 3 | 4 | 53 | 58 | `worseSurplus` |
| 2034 | ATL | 3 | 0 | 3 | 53 | 60 | `evaluate` |
| 2034 | NO | 9 | 1 | 3 | 53 | 70 | `evaluate` |
| 2034 | NO | 9 | 1 | 4 | 53 | 66 | `evaluate` |
| 2034 | TB | 3 | 7 | 3 | 53 | 56 | `worseSurplus` |
| 2034 | TB | 3 | 7 | 4 | ir | 80 | `evaluate` |
| 2034 | CAR | 5 | 0 | 3 | 53 | 63 | `evaluate` |
| 2034 | CAR | 5 | 0 | 4 | 53 | 58 | `evaluate` |
| 2034 | SF | 4 | 2 | 3 | 53 | 59 | `evaluate` |
| 2034 | SF | 4 | 2 | 4 | 53 | 57 | `evaluate` |
| 2034 | SEA | 10 | 6 | 3 | 53 | 66 | `evaluate` |
| 2034 | SEA | 10 | 6 | 4 | 53 | 63 | `evaluate` |
| 2034 | LA | 3 | 2 | 3 | 53 | 59 | `evaluate` |
| 2034 | LA | 3 | 2 | 4 | ir | 73 | `evaluate` |
| 2034 | PHX | 3 | 0 | 3 | 53 | 61 | `evaluate` |
| 2034 | PHX | 3 | 0 | 4 | ir | 79 | `evaluate` |
| 2035 | BKN | 7 | 1 | 3 | 53 | 72 | `evaluate` |
| 2035 | BKN | 7 | 1 | 4 | 53 | 67 | `evaluate` |
| 2035 | BUF | 5 | 1 | 3 | 53 | 62 | `evaluate` |
| 2035 | BUF | 5 | 1 | 4 | 53 | 62 | `evaluate` |
| 2035 | HAR | 7 | 3 | 3 | 53 | 63 | `evaluate` |
| 2035 | HAR | 7 | 3 | 4 | 53 | 62 | `evaluate` |
| 2035 | CLE | 6 | 0 | 3 | 53 | 63 | `worseSurplus` |
| 2035 | CLE | 6 | 0 | 4 | 53 | 62 | `evaluate` |
| 2035 | PIT | 7 | 2 | 3 | 53 | 64 | `evaluate` |
| 2035 | PIT | 7 | 2 | 4 | 53 | 63 | `evaluate` |
| 2035 | CIN | 4 | 0 | 3 | 53 | 60 | `evaluate` |
| 2035 | CIN | 4 | 0 | 4 | 53 | 57 | `draftCapitalHold` |
| 2035 | CMB | 5 | 0 | 3 | 53 | 65 | `evaluate` |
| 2035 | CMB | 5 | 0 | 4 | 53 | 56 | `evaluate` |
| 2035 | HOU | 2 | 1 | 3 | ps | 53 | `stashOrFreeAgent` |
| 2035 | NSH | 3 | 0 | 3 | 53 | 60 | `evaluate` |
| 2035 | JAX | 3 | 3 | 3 | 53 | 59 | `evaluate` |
| 2035 | JAX | 3 | 3 | 4 | ir | 84 | `evaluate` |
| 2035 | MEM | 4 | 2 | 3 | 53 | 63 | `evaluate` |
| 2035 | MEM | 4 | 2 | 4 | 53 | 61 | `worseSurplus` |
| 2035 | DEN | 4 | 10 | 3 | 53 | 66 | `evaluate` |
| 2035 | DEN | 4 | 10 | 4 | 53 | 54 | `worseSurplus` |
| 2035 | LV | 5 | 0 | 3 | 53 | 64 | `evaluate` |
| 2035 | LV | 5 | 0 | 4 | 53 | 62 | `evaluate` |
| 2035 | SD | 4 | 4 | 3 | 53 | 63 | `evaluate` |
| 2035 | SD | 4 | 4 | 4 | 53 | 62 | `evaluate` |
| 2035 | KC | 6 | 10 | 3 | 53 | 65 | `evaluate` |
| 2035 | KC | 6 | 10 | 4 | 53 | 64 | `evaluate` |
| 2035 | NYS | 8 | 9 | 3 | 53 | 65 | `evaluate` |
| 2035 | NYS | 8 | 9 | 4 | 53 | 62 | `evaluate` |
| 2035 | PHI | 7 | 0 | 3 | 53 | 64 | `evaluate` |
| 2035 | PHI | 7 | 0 | 4 | 53 | 61 | `evaluate` |
| 2035 | WAS | 4 | 0 | 3 | 53 | 58 | `evaluate` |
| 2035 | WAS | 4 | 0 | 4 | 53 | 56 | `evaluate` |
| 2035 | BAL | 5 | 1 | 3 | 53 | 71 | `evaluate` |
| 2035 | BAL | 5 | 1 | 4 | 53 | 70 | `evaluate` |
| 2035 | CHI | 3 | 1 | 3 | 53 | 56 | `evaluate` |
| 2035 | CHI | 3 | 1 | 4 | ps | 45 | `stashOrFreeAgent` |
| 2035 | GB | 5 | 2 | 3 | 53 | 68 | `worseSurplus` |
| 2035 | GB | 5 | 2 | 4 | 53 | 62 | `evaluate` |
| 2035 | DET | 5 | 3 | 3 | 53 | 64 | `evaluate` |
| 2035 | DET | 5 | 3 | 4 | 53 | 59 | `worseSurplus` |
| 2035 | MIN | 7 | 7 | 3 | 53 | 62 | `evaluate` |
| 2035 | MIN | 7 | 7 | 4 | 53 | 62 | `evaluate` |
| 2035 | ATL | 5 | 0 | 3 | 53 | 63 | `evaluate` |
| 2035 | ATL | 5 | 0 | 4 | 53 | 60 | `evaluate` |
| 2035 | NO | 6 | 2 | 3 | 53 | 64 | `evaluate` |
| 2035 | NO | 6 | 2 | 4 | 53 | 63 | `evaluate` |
| 2035 | TB | 4 | 4 | 3 | 53 | 62 | `evaluate` |
| 2035 | TB | 4 | 4 | 4 | 53 | 58 | `evaluate` |
| 2035 | CAR | 4 | 0 | 3 | 53 | 65 | `evaluate` |
| 2035 | CAR | 4 | 0 | 4 | 53 | 64 | `evaluate` |
| 2035 | SF | 4 | 3 | 3 | 53 | 58 | `worseSurplus` |
| 2035 | SF | 4 | 3 | 4 | 53 | 56 | `evaluate` |
| 2035 | SEA | 6 | 3 | 3 | 53 | 61 | `evaluate` |
| 2035 | SEA | 6 | 3 | 4 | 53 | 59 | `evaluate` |
| 2035 | LA | 5 | 1 | 3 | 53 | 60 | `evaluate` |
| 2035 | LA | 5 | 1 | 4 | 53 | 59 | `worseSurplus` |
| 2035 | PHX | 6 | 1 | 3 | 53 | 68 | `evaluate` |
| 2035 | PHX | 6 | 1 | 4 | 53 | 66 | `worseSurplus` |
| 2036 | BKN | 9 | 0 | 3 | 53 | 69 | `evaluate` |
| 2036 | BKN | 9 | 0 | 4 | 53 | 67 | `evaluate` |
| 2036 | BUF | 5 | 5 | 3 | 53 | 64 | `evaluate` |
| 2036 | BUF | 5 | 5 | 4 | 53 | 63 | `evaluate` |
| 2036 | HAR | 7 | 0 | 3 | 53 | 65 | `evaluate` |
| 2036 | HAR | 7 | 0 | 4 | 53 | 64 | `evaluate` |
| 2036 | CLE | 5 | 0 | 3 | 53 | 63 | `evaluate` |
| 2036 | CLE | 5 | 0 | 4 | 53 | 60 | `evaluate` |
| 2036 | PIT | 4 | 1 | 3 | 53 | 64 | `evaluate` |
| 2036 | PIT | 4 | 1 | 4 | 53 | 63 | `evaluate` |
| 2036 | CIN | 4 | 3 | 3 | 53 | 60 | `evaluate` |
| 2036 | CIN | 4 | 3 | 4 | 53 | 56 | `worseSurplus` |
| 2036 | CMB | 6 | 0 | 3 | 53 | 60 | `evaluate` |
| 2036 | CMB | 6 | 0 | 4 | 53 | 60 | `evaluate` |
| 2036 | HOU | 4 | 3 | 3 | 53 | 61 | `evaluate` |
| 2036 | HOU | 4 | 3 | 4 | 53 | 59 | `evaluate` |
| 2036 | NSH | 4 | 2 | 3 | 53 | 59 | `evaluate` |
| 2036 | NSH | 4 | 2 | 4 | 53 | 58 | `worseSurplus` |
| 2036 | JAX | 5 | 6 | 3 | 53 | 60 | `evaluate` |
| 2036 | JAX | 5 | 6 | 4 | 53 | 57 | `evaluate` |
| 2036 | MEM | 7 | 1 | 3 | 53 | 65 | `evaluate` |
| 2036 | MEM | 7 | 1 | 4 | 53 | 63 | `evaluate` |
| 2036 | DEN | 2 | 8 | 3 | ps | 54 | `stashOrFreeAgent` |
| 2036 | DEN | 2 | 8 | 4 | ps | 52 | `stashOrFreeAgent` |
| 2036 | LV | 6 | 4 | 3 | 53 | 65 | `evaluate` |
| 2036 | LV | 6 | 4 | 4 | 53 | 65 | `evaluate` |
| 2036 | SD | 5 | 5 | 3 | 53 | 65 | `evaluate` |
| 2036 | SD | 5 | 5 | 4 | 53 | 63 | `evaluate` |
| 2036 | KC | 5 | 6 | 3 | 53 | 62 | `evaluate` |
| 2036 | KC | 5 | 6 | 4 | 53 | 61 | `evaluate` |
| 2036 | NYS | 6 | 12 | 3 | 53 | 58 | `evaluate` |
| 2036 | NYS | 6 | 12 | 4 | 53 | 55 | `evaluate` |
| 2036 | PHI | 6 | 0 | 3 | 53 | 61 | `evaluate` |
| 2036 | PHI | 6 | 0 | 4 | 53 | 61 | `evaluate` |
| 2036 | WAS | 2 | 2 | 3 | ir | 78 | `evaluate` |
| 2036 | WAS | 2 | 2 | 4 | ps | 53 | `stashOrFreeAgent` |
| 2036 | BAL | 5 | 2 | 3 | 53 | 70 | `evaluate` |
| 2036 | BAL | 5 | 2 | 4 | 53 | 58 | `evaluate` |
| 2036 | CHI | 3 | 5 | 3 | 53 | 58 | `evaluate` |
| 2036 | CHI | 3 | 5 | 4 | ir | 90 | `evaluate` |
| 2036 | GB | 5 | 2 | 3 | 53 | 67 | `evaluate` |
| 2036 | GB | 5 | 2 | 4 | 53 | 63 | `evaluate` |
| 2036 | DET | 5 | 0 | 3 | 53 | 58 | `evaluate` |
| 2036 | DET | 5 | 0 | 4 | 53 | 57 | `draftCapitalHold` |
| 2036 | MIN | 4 | 1 | 3 | 53 | 61 | `evaluate` |
| 2036 | MIN | 4 | 1 | 4 | 53 | 59 | `evaluate` |
| 2036 | ATL | 2 | 0 | 3 | ir | 72 | `evaluate` |
| 2036 | NO | 6 | 0 | 3 | 53 | 65 | `evaluate` |
| 2036 | NO | 6 | 0 | 4 | 53 | 62 | `evaluate` |
| 2036 | TB | 5 | 3 | 3 | 53 | 62 | `evaluate` |
| 2036 | TB | 5 | 3 | 4 | 53 | 60 | `evaluate` |
| 2036 | CAR | 5 | 0 | 3 | 53 | 65 | `evaluate` |
| 2036 | CAR | 5 | 0 | 4 | 53 | 64 | `evaluate` |
| 2036 | SF | 4 | 6 | 3 | 53 | 64 | `evaluate` |
| 2036 | SF | 4 | 6 | 4 | 53 | 59 | `evaluate` |
| 2036 | SEA | 6 | 4 | 3 | 53 | 62 | `evaluate` |
| 2036 | SEA | 6 | 4 | 4 | 53 | 61 | `evaluate` |
| 2036 | LA | 5 | 0 | 3 | 53 | 72 | `evaluate` |
| 2036 | LA | 5 | 0 | 4 | 53 | 59 | `evaluate` |
| 2036 | PHX | 5 | 0 | 3 | 53 | 67 | `evaluate` |
| 2036 | PHX | 5 | 0 | 4 | 53 | 63 | `evaluate` |
| 2037 | BKN | 6 | 1 | 3 | 53 | 67 | `evaluate` |
| 2037 | BKN | 6 | 1 | 4 | 53 | 65 | `evaluate` |
| 2037 | BUF | 4 | 0 | 3 | 53 | 60 | `worseSurplus` |
| 2037 | BUF | 4 | 0 | 4 | 53 | 55 | `draftCapitalHold` |
| 2037 | HAR | 3 | 2 | 3 | 53 | 59 | `worseSurplus` |
| 2037 | HAR | 3 | 2 | 4 | ir | 71 | `evaluate` |
| 2037 | CLE | 6 | 1 | 3 | 53 | 64 | `evaluate` |
| 2037 | CLE | 6 | 1 | 4 | 53 | 62 | `evaluate` |
| 2037 | PIT | 5 | 2 | 3 | 53 | 66 | `evaluate` |
| 2037 | PIT | 5 | 2 | 4 | 53 | 64 | `evaluate` |
| 2037 | CIN | 2 | 6 | 3 | ps | 54 | `stashOrFreeAgent` |
| 2037 | CIN | 2 | 6 | 4 | ps | 53 | `stashOrFreeAgent` |
| 2037 | CMB | 5 | 0 | 3 | 53 | 66 | `evaluate` |
| 2037 | CMB | 5 | 0 | 4 | 53 | 59 | `evaluate` |
| 2037 | HOU | 5 | 3 | 3 | 53 | 62 | `evaluate` |
| 2037 | HOU | 5 | 3 | 4 | 53 | 62 | `evaluate` |
| 2037 | NSH | 3 | 3 | 3 | 53 | 58 | `evaluate` |
| 2037 | NSH | 3 | 3 | 4 | ps | 55 | `stashOrFreeAgent` |
| 2037 | JAX | 6 | 7 | 3 | 53 | 63 | `evaluate` |
| 2037 | JAX | 6 | 7 | 4 | 53 | 60 | `evaluate` |
| 2037 | MEM | 4 | 1 | 3 | 53 | 61 | `evaluate` |
| 2037 | MEM | 4 | 1 | 4 | 53 | 60 | `evaluate` |
| 2037 | DEN | 5 | 7 | 3 | 53 | 60 | `evaluate` |
| 2037 | DEN | 5 | 7 | 4 | 53 | 56 | `worseSurplus` |
| 2037 | LV | 6 | 1 | 3 | 53 | 65 | `evaluate` |
| 2037 | LV | 6 | 1 | 4 | 53 | 64 | `evaluate` |
| 2037 | SD | 3 | 2 | 3 | 53 | 63 | `evaluate` |
| 2037 | SD | 3 | 2 | 4 | ps | 48 | `stashOrFreeAgent` |
| 2037 | KC | 4 | 8 | 3 | 53 | 59 | `evaluate` |
| 2037 | KC | 4 | 8 | 4 | 53 | 59 | `worseSurplus` |
| 2037 | NYS | 5 | 13 | 3 | 53 | 59 | `evaluate` |
| 2037 | NYS | 5 | 13 | 4 | 53 | 56 | `evaluate` |
| 2037 | PHI | 6 | 2 | 3 | 53 | 62 | `evaluate` |
| 2037 | PHI | 6 | 2 | 4 | 53 | 59 | `evaluate` |
| 2037 | WAS | 4 | 1 | 3 | 53 | 58 | `worseSurplus` |
| 2037 | WAS | 4 | 1 | 4 | 53 | 58 | `evaluate` |
| 2037 | BAL | 6 | 0 | 3 | 53 | 70 | `evaluate` |
| 2037 | BAL | 6 | 0 | 4 | 53 | 70 | `evaluate` |
| 2037 | CHI | 3 | 4 | 3 | 53 | 63 | `worseSurplus` |
| 2037 | CHI | 3 | 4 | 4 | ps | 51 | `stashOrFreeAgent` |
| 2037 | GB | 3 | 2 | 3 | 53 | 58 | `worseSurplus` |
| 2037 | GB | 3 | 2 | 4 | ps | 52 | `stashOrFreeAgent` |
| 2037 | DET | 7 | 5 | 3 | 53 | 65 | `evaluate` |
| 2037 | DET | 7 | 5 | 4 | 53 | 64 | `evaluate` |
| 2037 | MIN | 3 | 0 | 3 | 53 | 62 | `evaluate` |
| 2037 | ATL | 10 | 0 | 3 | 53 | 67 | `evaluate` |
| 2037 | ATL | 10 | 0 | 4 | 53 | 64 | `evaluate` |
| 2037 | NO | 4 | 0 | 3 | 53 | 69 | `evaluate` |
| 2037 | NO | 4 | 0 | 4 | 53 | 61 | `evaluate` |
| 2037 | TB | 5 | 5 | 3 | 53 | 62 | `evaluate` |
| 2037 | TB | 5 | 5 | 4 | 53 | 58 | `evaluate` |
| 2037 | CAR | 5 | 2 | 3 | 53 | 64 | `evaluate` |
| 2037 | CAR | 5 | 2 | 4 | 53 | 62 | `worseSurplus` |
| 2037 | SF | 5 | 6 | 3 | 53 | 65 | `evaluate` |
| 2037 | SF | 5 | 6 | 4 | 53 | 63 | `evaluate` |
| 2037 | SEA | 7 | 3 | 3 | 53 | 62 | `evaluate` |
| 2037 | SEA | 7 | 3 | 4 | 53 | 60 | `evaluate` |
| 2037 | LA | 6 | 0 | 3 | 53 | 78 | `evaluate` |
| 2037 | LA | 6 | 0 | 4 | 53 | 77 | `evaluate` |
| 2037 | PHX | 6 | 1 | 3 | 53 | 69 | `evaluate` |
| 2037 | PHX | 6 | 1 | 4 | 53 | 66 | `evaluate` |
| 2038 | BKN | 5 | 4 | 3 | 53 | 71 | `evaluate` |
| 2038 | BKN | 5 | 4 | 4 | 53 | 67 | `evaluate` |
| 2038 | BUF | 5 | 2 | 3 | 53 | 63 | `evaluate` |
| 2038 | BUF | 5 | 2 | 4 | 53 | 58 | `evaluate` |
| 2038 | HAR | 5 | 3 | 3 | 53 | 65 | `evaluate` |
| 2038 | HAR | 5 | 3 | 4 | 53 | 65 | `evaluate` |
| 2038 | CLE | 5 | 0 | 3 | 53 | 64 | `evaluate` |
| 2038 | CLE | 5 | 0 | 4 | 53 | 64 | `evaluate` |
| 2038 | PIT | 5 | 2 | 3 | 53 | 64 | `evaluate` |
| 2038 | PIT | 5 | 2 | 4 | 53 | 64 | `evaluate` |
| 2038 | CIN | 6 | 6 | 3 | 53 | 62 | `evaluate` |
| 2038 | CIN | 6 | 6 | 4 | 53 | 60 | `evaluate` |
| 2038 | CMB | 5 | 3 | 3 | 53 | 65 | `evaluate` |
| 2038 | CMB | 5 | 3 | 4 | 53 | 60 | `worseSurplus` |
| 2038 | HOU | 3 | 0 | 3 | 53 | 62 | `evaluate` |
| 2038 | NSH | 3 | 0 | 3 | 53 | 58 | `evaluate` |
| 2038 | JAX | 3 | 5 | 3 | 53 | 59 | `evaluate` |
| 2038 | JAX | 3 | 5 | 4 | ir | 82 | `evaluate` |
| 2038 | MEM | 6 | 3 | 3 | 53 | 61 | `evaluate` |
| 2038 | MEM | 6 | 3 | 4 | 53 | 60 | `evaluate` |
| 2038 | DEN | 8 | 5 | 3 | 53 | 64 | `evaluate` |
| 2038 | DEN | 8 | 5 | 4 | 53 | 61 | `evaluate` |
| 2038 | LV | 4 | 0 | 3 | 53 | 59 | `evaluate` |
| 2038 | LV | 4 | 0 | 4 | 53 | 59 | `evaluate` |
| 2038 | SD | 3 | 4 | 3 | 53 | 62 | `evaluate` |
| 2038 | SD | 3 | 4 | 4 | ps | 48 | `stashOrFreeAgent` |
| 2038 | KC | 4 | 6 | 3 | 53 | 61 | `evaluate` |
| 2038 | KC | 4 | 6 | 4 | 53 | 56 | `worseSurplus` |
| 2038 | NYS | 7 | 9 | 3 | 53 | 62 | `evaluate` |
| 2038 | NYS | 7 | 9 | 4 | 53 | 61 | `evaluate` |
| 2038 | PHI | 2 | 2 | 3 | ps | 48 | `stashOrFreeAgent` |
| 2038 | PHI | 2 | 2 | 4 | ps | 44 | `stashOrFreeAgent` |
| 2038 | WAS | 3 | 10 | 3 | 53 | 61 | `evaluate` |
| 2038 | WAS | 3 | 10 | 4 | ps | 58 | `stashOrFreeAgent` |
| 2038 | BAL | 5 | 3 | 3 | 53 | 70 | `evaluate` |
| 2038 | BAL | 5 | 3 | 4 | 53 | 62 | `evaluate` |
| 2038 | CHI | 3 | 2 | 3 | 53 | 62 | `worseSurplus` |
| 2038 | CHI | 3 | 2 | 4 | ps | 53 | `stashOrFreeAgent` |
| 2038 | GB | 4 | 0 | 3 | 53 | 59 | `evaluate` |
| 2038 | GB | 4 | 0 | 4 | 53 | 57 | `draftCapitalHold` |
| 2038 | DET | 7 | 3 | 3 | 53 | 66 | `evaluate` |
| 2038 | DET | 7 | 3 | 4 | 53 | 64 | `evaluate` |
| 2038 | MIN | 3 | 0 | 3 | 53 | 62 | `evaluate` |
| 2038 | ATL | 7 | 0 | 3 | 53 | 63 | `evaluate` |
| 2038 | ATL | 7 | 0 | 4 | 53 | 63 | `evaluate` |
| 2038 | NO | 6 | 3 | 3 | 53 | 67 | `evaluate` |
| 2038 | NO | 6 | 3 | 4 | 53 | 59 | `evaluate` |
| 2038 | TB | 7 | 1 | 3 | 53 | 58 | `draftCapitalHold` |
| 2038 | TB | 7 | 1 | 4 | 53 | 57 | `worseSurplus` |
| 2038 | CAR | 9 | 4 | 3 | 53 | 67 | `worseSurplus` |
| 2038 | CAR | 9 | 4 | 4 | 53 | 67 | `evaluate` |
| 2038 | SF | 9 | 3 | 3 | 53 | 67 | `evaluate` |
| 2038 | SF | 9 | 3 | 4 | 53 | 66 | `evaluate` |
| 2038 | SEA | 5 | 2 | 3 | 53 | 58 | `evaluate` |
| 2038 | SEA | 5 | 2 | 4 | 53 | 57 | `evaluate` |
| 2038 | LA | 6 | 0 | 3 | 53 | 79 | `evaluate` |
| 2038 | LA | 6 | 0 | 4 | 53 | 79 | `evaluate` |
| 2038 | PHX | 6 | 2 | 3 | 53 | 69 | `evaluate` |
| 2038 | PHX | 6 | 2 | 4 | 53 | 65 | `evaluate` |
