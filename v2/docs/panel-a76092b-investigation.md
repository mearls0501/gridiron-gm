# Panel a76092b — payroll floor, the band, and four minimum rewrites

Read-only. No sim change, no test change, no `baselines.json` edit, no re-lock, no dial. Head `a76092b` is the guarded post-carryover refill on draft PR #214. The CPU sweep was clean, so the cover is doing the job it was signed for. The gate was **GATE FAIL, 7 problems**. The six that are new or still open are below. The seventh is the same `coherence` exit that fails on `ddc62bd`, `cf73d64`, and `65e1284`. It is the accepted noise. It is not investigated again here.

`gate:full` runs five panel ids, `GG_SEED` 1 through 5. `verify` does not read `GG_SEED`. All five seeds are the one league `20260727`, ten seasons. Drift's payroll sample is taken on arrival at `offseason-recap`, before that offseason runs (`scripts/drift.ts`). The roster it sees was built by the previous offseason.

The Studio log `gate-full-5seed-a76092b.log` was not in this workspace. Seed 2's club is therefore not copied out of that table. What follows is the comparison logs that were attached, the code, and a light replay on this VM. This VM has diverged from Studio after the first few seasons before. Where a name did not replay, that is said.

## 1. Seed 2's new floor

### What the panel measured

`drift.p0Failures` 0.20 and `drift.minPayrollSeasonsUnder55` 0.20. Both are means across the five seeds. One seed failed the guard once, the other four did not. The guard is `poorHouse === 0` in `scripts/drift.ts`: a CPU club under 55% of the cap at a recap. The panel's own text is one season in twenty, lowest 52%.

It did not fail on the three comparison logs. Lowest CPU payroll on each, by panel id:

| Panel id | Seed | `ddc62bd` (main) | `cf73d64` | `65e1284` |
|---|---:|---:|---:|---:|
| 1 | 506939785 | 77% | 75% | 77% |
| 2 | 1013891931 | 72% (2035) | 71% (2044) | 78% (2039) |
| 3 | 1520852267 | 56% (2039) | 78% | 72% |
| 4 | 2027804413 | 77% | 76% | 76% |
| 5 | 387272780 | 72% | 77% | 76% |

Main already had a 56% season (seed 3, 2039). Nothing on these three heads crossed 55. The 52% is new at `a76092b`.

Panel id 2 is seed `1013891931`. User is Boston on that seed. The `65e1284` and `cf73d64` Studio tables for it are identical through 2030 (same passing leader, same minimum payroll 83 / 89 / 96 / 98 / 85). They split after that. `ddc62bd` splits at 2028.

### Replay on this VM

Same seed, same snapshot moment, head `a76092b`. Twenty seasons. The minimum matched the Studio `65e1284` / `cf73d64` integers through 2030 (83.1, 89.4, 95.9, 98.1, 85.1). After that the stream is this tree's own.

No season was under 55%. The low was **San Francisco, 2043, 72.4%**.

| | SF, 2043 recap |
|---|---:|
| Payroll | $497.1M, 72.4% of a $686.6M cap |
| Dead | $96.0M (14% of the cap) |
| Carryover | $137.3M, which is 20% of that cap |
| Space | $326.9M |
| Roster | 53, of which 22 hits are under $1M |
| Three largest hits | $39.1M, $31.3M, $27.4M |

The other years on this replay bottomed at 75 to 83%. Denver in 2044 was 76.5% with a $149.8M hit still on the book. The stars were not rewritten away.

So this VM does not contain the 52% club. Naming one from the missing Studio table would be a guess. The early-season match says the seed is right and the split is later, which is when the guarded cover can move the stream. The same split hid `506976155` on the previous panel.

### What can cut a book that far

The 20% ceiling is not it. It was already on `cf73d64` and `65e1284`, and those floors were 71% and 78% on this seed. On the SF row the bank is sitting on the ceiling because the club underspent. The ceiling stopped a larger bank. It did not take salary off the roster.

A reshuffle of the older trees is not enough either. The same seed's floor on main, on the ceiling, and on smallest-hit is 72, 71, and 78. None of those is 52.

The guarded cover can do it, and it is the only new writer. Order inside `finalizeOffseason` (`lib/core/offseason/index.ts`):

1. Cutdown `reconcileRoster` (largest-hit last resort, no `afterCarryover`).
2. `spendToFloor`, which is the 78% floor. CPU only.
3. `upgradeRoster`, then another cutdown reconcile.
4. Calendar rolls. Carryover is applied.
5. If space is negative, `reconcileRoster(..., afterCarryover)` — release, then the smallest hit that still leaves a minimum for every open spot, otherwise the largest hit that covers the hole. Then a refill that will not sign a market deal past the room, so the open spots fall through to `signMinimum`.

`spendToFloor` has already run. Nothing in the regular season calls it again. Drift then looks at that roster a year later. A rewrite of the two or three biggest hits down to the one-year minimum, with the replacements signed at the minimum, is a $100M-class drop. On a ~$690M cap that is the difference between the 72% this VM actually played and a 52% book. SF's 2043 row still has those hits, which is why it stayed at 72%.

**Cause.** The 52% is the guarded cover, not the ceiling, and not a reshuffle of a path that already existed. It is one season on Studio that this VM did not replay, so the club and the year are not named here.

### Proposed fix — UNSIGNED

After the post-carryover cover, call the existing spend-up once more for a CPU club whose payroll is under `SPEND_FLOOR`, and stop if a signing would go back over the cap. Do not retune `SPEND_FLOOR`, `targetSpend`, or the 20% ceiling. Do not ship this off a 52% this VM could not replay.

## 2. The payroll band

`drift.medianPayrollPct` is the mean, across twenty seasons and then across the five seeds, of the CPU median payroll at recap. The lock is target 90.602, tolerance 6, so the gate fails above **96.602**.

| Head | Seed 1 | Seed 2 | Seed 3 | Seed 4 | Seed 5 | Mean |
|---|---:|---:|---:|---:|---:|---:|
| `ddc62bd` (main) | 96.22 | 95.65 | 94.50 | 96.43 | 94.48 | **95.46** |
| `cf73d64` | 97.20 | 97.26 | 95.53 | 97.21 | 95.67 | **96.57** |
| `65e1284` | 96.66 | 96.50 | 95.36 | 97.93 | 95.84 | **96.46** |
| `a76092b` | 97.32 | 96.76 | 95.69 | 97.29 | 96.16 | **96.64** |

Against main, `a76092b` is up 1.18 points. Almost all of that was already present at `cf73d64` (+1.11). That commit is `spendBudget = targetSpend × cap + capCarryover`, with the bank then capped at 20% of the cap. The median moved up because CPU clubs are allowed to spend the bank. The ceiling is why it stopped near 97 instead of walking on up. This is the signed formula, not noise.

`65e1284` gave 0.11 of that back (smallest-hit rewrites a deal down). `a76092b` put 0.18 back on, and 0.18 is what crosses 96.602. A mean that was 0.14 under the line is now 0.04 over it.

The 0.18 is not a clean systematic raise from the cover. Seed 4 fell 0.64. The other four rose 0.26 to 0.66. One seed's swing is larger than the mean move. The cover's direct effect is downward: a refused market deal and a minimum rewrite both shrink that club's payroll. A small rise in the median is the other side of the same rule. `65e1284` went over the cap and then cut. A cut that saves money lowers payroll. The guarded path stays legal, cuts less, and leaves more of the spend on the book. That is a small effect sitting on top of the carryover shift. It is not a new spending dial.

**Cause.** The distance from main is the signed carryover spend. The miss against the band is that spend plus a 0.18 move from the cover, which is smaller than the seed noise and happens to cross a line `65e1284` was just under.

### Proposed fix — UNSIGNED

None in the sim. Moving the band, or cutting `targetSpend`, would be a dial retune. The number is the signed budget sitting 0.04 over a lock that predates it.

## 3. The four $0.9M bargains

`verify` flags a fresh non-rookie deal whose ask is over three times the minimum ($2,385,000) and whose annual hit is under half that ask (`scripts/verify.ts`). `$0.9M` is the cap hit of a one-year `LEAGUE_MINIMUM`. `signMinimum` refuses anyone over overall 66. Allen (82), Thigpen (83), Everhart (80), and Quarles (77) are all over that line. They are not minimum free-agent signings.

The only writer of a $0.9M deal onto a player that good is `rewriteToMinimum` in `lib/core/offseason/contracts.ts`. The log line is "restructured … to the league minimum — forced by the cap". The post-carryover path appends "after carryover". The cutdown path does not.

### What Matt already accepted

On `cf73d64`, under the ten-season verify, two checks failed and each named one bargain:

| Bracket year | Deal | Ask | Hit |
|---|---|---:|---:|
| 2029 | Lopez, QB, 86 | $54.4M | $0.9M |
| 2032 | Dabney, OT, 85 | $38.3M | $0.9M |

That head's last resort was the largest hit, every time. `verify.failures` was 2. These are star asks. They are the hatch.

### What the panel named this time

| Bracket year | Deal | Ask | OVR |
|---|---|---:|---:|
| 2029 | Allen, S | $16.9M | 82 |
| 2031 | Thigpen, C | $17.6M | 83 |
| 2032 | Everhart, DT | $19.3M | 80 |
| 2035 | Quarles, RB | $10.3M | 77 |

Same check, smaller asks. This is the band `65e1284` already produced (Gatlin $7.4M, Walker III $16.7M, Moore $6.3M), not the Lopez/Dabney band. Each of those older lines said "2 bargains" and named one. This note names the four the panel printed. It does not claim each line was a single body. The Studio log that would show the count was not here.

### Replay on this VM, seed 20260727, ten seasons

The names do not match. That split is the same one that moved Gatlin/Walker/Moore off this VM last time. Every bargain the replay did produce was a post-carryover rewrite. None was a cutdown line, and none was `signMinimum`.

| Bracket year | This VM | Ask | Old hit | Log |
|---|---|---:|---:|---|
| 2030 | PHI, Quinn Sanchez, DT, 77 | $11.1M | $4.0M | after carryover |
| 2032 | PHI, Cam Rutledge, TE, 81 | $17.5M | $24.9M | after carryover |
| 2032 | KC, Mateo Okafor, OT, 69 | $6.7M | $9.4M | after carryover |
| 2033 | TB, Silas Baker, S, 91 | $33.0M | $30.8M | after carryover |
| 2035 | BUF, Aaron Whitlock, CB, 68 | $5.8M | $5.4M | after carryover |

A $4.0M or $5.4M old hit is the smallest-hit arm. The largest fallback does not pick a $4M deal while a bigger one covers the hole. A $24.9M or $30.8M old hit is the other arm: the hole was big enough that only a large deal covered it, or the smallest deal could not fund the refill and the rule fell back to the largest. Baker, at 91 overall and a $33.0M ask, is the Lopez shape, reached through that fallback rather than through the old unconditional largest hatch.

**Cause.** All four Studio deals are the post-carryover minimum rewrite. They are not a new writer. They are the smaller target of the same hatch Matt accepted for Lopez and Dabney. The guarded rule was supposed to use the large rewrite only when the small one cannot leave the club legal. It still leaves a $0.9M deal on someone asking $10M to $19M, and that still fails the check.

### Proposed fix — UNSIGNED

Do not edit the bargain check. Two shapes, neither signed:

- Stop the rewrite once the book is non-negative and the open spots fit at the minimum, and live with a short roster when they do not. That brings back the 47-man miss the cover was built to close.
- After a rewrite, spend back up with a deal the check would allow, instead of leaving the $0.9M hit in place. That is a second transaction. It changes who is cheap a year later, which is the same neighborhood as the 52% floor.

Leaving the hatch as it is keeps the sweep clean and keeps failing these four checks.
