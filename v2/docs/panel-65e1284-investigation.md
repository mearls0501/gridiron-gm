# Panel 65e1284 — the post-carryover hole is not closed

Read-only. No sim change, no test change, no `baselines.json` edit, no re-lock, no dial. Head `65e1284` is the signed 20% ceiling, the smallest-hit rewrite after carryover, and a CPU-only sweep. Compared with `cf73d64` (largest-hit, sweep still counted the user) and with `f1e5cae` on this VM, which is that ceiling without the smallest-hit change.

`gate:full:serial`, 5 seeds, was **GATE FAIL, 4 problems**: `verify` exited 1, `sweep` exited 1, `coherence` exited 1, and `verify.failures` was 5. Coherence is the same accepted `ddc62bd` noise. Payroll mean **96.46** (seeds 96.66, 96.50, 95.36, 97.93, 95.84) is inside 90.602±6. It is 0.11 under `cf73d64`'s 96.57 and still about a point over `ddc62bd`'s 95.46. Not a fail.

`verify` does not read `GG_SEED`. All five panel seeds are the one league `20260727`.

## 1. The 2028 CPU over-cap clubs

### What the panel measured

CPU-only sweep, 25 leagues × 2 seasons. Fifteen leagues, each `over-cap=1` and `bad-rosters=0`. Fourteen are season **2028**. One is season **2027** (`506944479`). `cf73d64` had a single problem seed, `2027708516` in 2027, and that club was the user.

The print is `st.season` after the offseason has rolled (`scripts/sweep.ts` lines 31–39). Season 2028 is the preseason produced by the 2027 offseason. Season 2027 is the preseason produced by the 2026 offseason.

### Reproduced here

| Seed | Tree | Club | Over | Dead | Carryover | Roster | Rewrite |
|---|---|---|---:|---:|---:|---:|---|
| 506968236 | `65e1284` | NYS, id 16, CPU | $4,359,787 | $70,862,499 | $11,313,438 | 53 | Isaac Gatlin Jr., TE, was $12.0M; Keegan Wright, OT, was $12.3M. Both logged "after carryover" |
| 506968236 | `f1e5cae` | none | — | — | — | — | Ryan Vandross, QB, was $55.7M. No "after carryover". Club finishes legal |
| 506991993 | `65e1284` | DET, id 22, CPU | $5,934,729 | $37,731,666 | $7,062,203 | 53 | Cam Mitchell, TE, was $6.8M, after carryover |
| 506991993 | `f1e5cae` | none | — | — | — | — | Ivan Tillman, EDGE, was $28.8M. Club finishes legal |
| 506944479 | `65e1284` | LA, id 30, CPU | $3,345,837 | $87,919,167 | $1,872,497 | 53 | no minimum rewrite. A long waive list, then the book is still short |
| 506944479 | `f1e5cae` | none | — | — | — | — | Landon Gatlin, EDGE, was $28.0M. Club finishes legal |
| 506976155 | both | none | — | — | — | — | This VM does not reproduce the Studio miss. Both trees finish legal |

Cap on the 2028 rows is $286,518,000. On the 2027 row it is $270,300,000. Carryover is a few million, well under the 20% bank. The ceiling is not what clipped these clubs. The user is Boston on all three seeds and is not the club that is over.

So the delta is the `65e1284` rewrite, not the sweep's new CPU filter. The same CPU club is legal when the post-carryover pass still takes the largest hit.

### The sequence

`finalizeOffseason` writes the bank, then tries to legalize (`lib/core/offseason/index.ts` lines 339–349):

1. If `space < 0`, `reconcileRoster(..., afterCarryover = true)`.
2. `refillCpuRostersAfterWaivers` may call that same function again (`contracts.ts` lines 1538–1542).

Inside `reconcileRoster` (`contracts.ts` lines 1987–2032), for a CPU club:

1. Up to eight passes of `enforceCap` then `fillRoster`. `enforceCap` (lines 1945–1964) only releases a player whose cap hit exceeds his dead money **and** who is above the position minimum (line 1953). The waive lists on NYS, DET, and LA are that release.
2. Because `afterCarryover` is set, `enforceCap` runs once more (line 1999). It does not draw.
3. While space is negative, rewrite the smallest hit that covers the hole (lines 2017–2019). `makeContract` does not draw. NYS took two deals around $12M. DET took one deal of $6.8M. The log line ends in "after carryover", which only this branch writes (line 2027).
4. The loop stops when space is no longer negative. There is no third rewrite on NYS, and Vandross's $55.7M hit was still on the club afterward, so the loop did see a non-negative book before it stopped.
5. `fillRoster` then runs unconditionally (line 2032). `signAtMarket` (lines 1287–1299) does not look at cap space. It will sign a market deal into an open spot. The release-first step is what opened the spots, and it left the dead money behind ($70.9M on NYS, $37.7M on DET, $87.9M on LA). The new hits sit on top of that dead. The function returns. Nothing after `fillRoster` checks space. The refill's own caller does not check again either.

The residual is about $3.3M to $5.9M, which is one signing, not a failed arithmetic residual inside the rewrite itself. The smallest rewrites freed roughly $6M to $22M and got the book to zero. The trailing fill spent that room and a few million more. The largest hit freed $28M to $56M in one rewrite, and the same fill still fit.

The 36 and 26 and 35 players who still have `capHit > deadMoney` are not a missed release. `enforceCap` already stopped, so none of them are both saving money and above the position minimum. Another release-first pass would not take them.

### Why 2028

Year-0 carryover is 0, so the 2026 offseason spends the ordinary target. The first real bank is captured at the end of that offseason and is on the books for 2027. CPU free agency and `cpuResign` spend it during the 2027 offseason (`frontOffice.ts` lines 309–312, `freeAgency.ts` line 167, `contracts.ts` line 1162). The 2028 preseason is the first roll that replaces a bank the club has already committed against. That is the cliff. A largest-hit rewrite was big enough to survive the refill. A smallest-hit rewrite is not. The one 2027 miss is the same shape on the first roll, when the bank is still small ($1.9M on LA) and the camp-cut dead is not: no rewrite at all, the refill alone leaves the club over. It is rare because there is no spent bank yet.

## 2. Verify over-cap at season start, 2030 and 2033

`checkCap` (`scripts/verify.ts` lines 182–191) counts every club, user included. It runs at the top of the season loop (line 562), on the preseason the previous offseason just wrote. It is the same moment the sweep reads, one function call later in a different harness.

The Studio log's `[2030]` failure (1 team) is the book left by the 2029 offseason. `[2033]` (2 teams) is the book left by the 2032 offseason. Those are the same offseasons as the Gatlin and Walker bargain lines, which are checked at the bottom of the previous iteration (line 605).

This VM's seed `20260727` matches the Studio log through 2028 and then diverges, so the years do not line up. The reproduced club is **Philadelphia, a CPU club**, $5,927,868 over at the **2031** preseason. Dead $126,928,143. Carryover $14,847,802. Committed $362,023,192. Roster 53. No minimum-rewrite log on that roll. Same signature as LA in section 1: the release and the refill left a few million of negative space, and the smallest-hit loop had already stopped. It is not the user. It shares the cause with the sweep misses.

## 3. The $0.9M bargains

Yes. They are the minimum rewrite, now aimed at the smaller contract.

`scripts/verify.ts` lines 471–486 flag a fresh non-rookie deal whose ask is over three times the minimum ($2,385,000) and whose annual hit is under half that ask. `$0.9M` is the $895,000 hit of a one-year `LEAGUE_MINIMUM`. The only writer of that deal on a high-ask player is the last resort at `contracts.ts` lines 2023–2027. `signMinimum` refuses anyone over overall 66.

Each Studio line says **2 bargains** and names one:

| Check | Named deal | Ask | What changed |
|---|---|---:|---|
| 2029 offseason | Gatlin, OG, 75 | $7.4M | a mid deal, not a $50M quarterback |
| 2032 offseason | Walker III, QB, 70 | $16.7M | same |
| 2035 offseason | Moore, CB, 73 | $6.3M | same |

On the seeds this VM could replay, the post-carryover log is the same and the old hits are $6.8M, $12.0M, and $12.3M. On `f1e5cae` those clubs instead lost a $28.0M, $28.8M, or $55.7M hit, and that single rewrite did clear the cap. Smallest-hit is doing what it was signed to do. The verify check still fires, because a 75-overall guard asking $7.4M is already over the three-times-minimum line. The check did not get stricter. The rewrite moved down the payroll and kept hitting it. And because those small rewrites do not leave room for the refill, the same offseason also fails "no team is over the cap at season start." `cf73d64` was 1061/1063 (two bargain checks, no season-start cap miss). This head is 1058/1063 (three bargain checks and two cap misses).

## Proposed fixes — UNSIGNED

Two options, as asked.

**Keep largest-hit.** Delete the `afterCarryover` branch and pass `false` again from `index.ts` line 343 and from `refillCpuRostersAfterWaivers`. The replay already shows the result: NYS, DET, and LA finish under the cap, because one rewrite of the biggest hit leaves enough room for the refill. The new sweep failures and the season-start cap misses go away. The star-sized verify bargains come back, which is the `cf73d64` miss, not a new one. Smallest code change. It gives up the signed choice to spare the largest deal.

**Smallest-hit only when it still covers the hole after the refill.** This is the one that matches the failure.

- `signAtMarket` must refuse a hit the club does not have room for (`contracts.ts` lines 1287–1299). The refill is what reopens a hole the rewrite just closed.
- After that fill, if space is negative, run the cover again. `reconcileRoster` line 2032 currently fills and returns.
- Delete the fallback that rewrites a hit too small to cover the deficit (`contracts.ts` lines 2018–2019, the `??` arm). A $6.8M tight end cannot close an $12M hole, and rewriting him only to miss verify is the Gatlin shape.
- If no hit both covers the hole and leaves the 53 fill legal, use the largest hit. That is the rewrite these seeds already survived.

Either fix runs in `finalizeOffseason`, after the first tag and the first free agency. Year-0 `newGame` does not enter the last resort. The seed-42 canary (tag `1777473079` / FA `3280841901`) stays. `verify.failures` moves, which is the point. `drift.medianPayrollPct` can move by a few tenths if a star keeps or loses his hit. Sweep's exit code moves if the clubs finish legal. Sweep has no locked metric. Do not re-lock. Do not retune `targetSpend` or the 20% ceiling. The ceiling is not the hole.

Prefer the second. Largest-hit is the control that proves the refill is the residual, not a reason to throw the smallest-hit rule out before the fill is required to fit.

## What was re-run

No production file changed.

- `npx tsc --noEmit` passed.
- Seed-42 `userOffers` stayed tag `1777473079` / FA `3280841901`.
- `npm test` passed (exit 0) on this unchanged tree.
- Light VM runs: seeds `506968236`, `506991993`, and `506944479` on `65e1284` and on `f1e5cae`, plus seed `506976155` on both, and seed `20260727` far enough to see a season-start miss. No Mac Studio panel.
