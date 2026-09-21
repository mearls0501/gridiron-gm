# deadMoney-by-source census — 2026-09-21 (Wave 4.1 Packet 4)

Read-only. Report / never-tune. Engine, `scripts/`, `docs/baselines.json`,
and AGENTS.md known-open rows were **not** edited. Attribution used a
local one-off (`/tmp/deadmoney-census.ts`) that is **not** in this PR.

**Question.** `drift.deadMoneyPct` sits at **≈2.42** on the Wave 4.0
post-#97/#98 5-seed panel (`6e3b7bf`) against an OTC note of **~5–8%**
(`nfl-reference.md` §4). What sources actually write `Team.deadCap`, and
what share of league dead money (and of the cap) does each source hold,
so a lead can see *why* the aggregate is ~2.4 rather than guessing?

**Verdict.** On current `main @ 93d7e4b` (#109), seed **12345**, 20
seasons, `drift.deadMoneyPct` mean is **2.46** — same family as the
panel 2.42 and the Wave 4.0 Packet 1 2.46. That opening-year stock is
only three write sites, all post-`clearDeadCap`:

| source | write site | mean $M / yr | % of dead | % of cap |
|---|---|---:|---:|---:|
| `waiver_clear` | `waivers.ts` `stashOrFreeAgent` | 185.03 | **49.1** | 1.23 |
| `trade_proration` | `trades.ts` `moveAsset` | 122.05 | **32.4** | 0.81 |
| `void_expire` | `expireContracts` leftover with `voidYears > 0` | 69.57 | **18.5** | 0.46 |
| `expire_nonvoid` | `expireContracts` leftover with `voidYears = 0` | 0 | 0 | 0 |

Almost half is preseason cutdown releases. A third is leftover signing
bonus on **offseason** trades. Void-year acceleration is real but thin
(0.46 cap points; 3.3 expires a year). Regular expiry writes **$0**.
Restructures, tags/extensions, IR, and PS do not call `addDeadCap`.
Retirement wipes leftover bonus/guarantees without charging
(~$481M/yr, ~3.2 cap points if it were charged). In-season dead sits
on the books at recap (**3.49%**) and is then wiped at FA open, so it
never enters the metric. Those two mechanism facts — hard annual wipe
+ uncosted retirement — plus cheap void-free cuts and sparse CPU void
use, are why the comparable opening-year share is ~2.4 rather than
5–8%. **Do not retune contracts, voids, cuts, or tags toward 5–8%.**

---

## 1. How dead money is written (code path)

`Team.deadCap` is the only stock `drift.deadMoneyPct` reads
(`scripts/drift.ts`: league `deadCap` / (`salaryCap` × 32) × 100).
`addDeadCap` (`lib/core/select.ts`) is the only adder. Three call
sites exist in `lib/core/**`:

| source label | file | what is charged |
|---|---|---|
| `waiver_clear` | `lib/core/waivers.ts` `stashOrFreeAgent` | `deadMoney(contract)` when a waived player clears and is not PS-stashed — remaining bonus proration + remaining guaranteed base |
| `void_expire` / `expire_nonvoid` | `lib/core/offseason/contracts.ts` `expireContracts` | `remainingBonusProration` when `yearsRemaining` hits 0. Split by `voidYears > 0` vs `= 0` |
| `trade_proration` | `lib/core/trades.ts` `moveAsset` | leftover bonus only (`deadMoney − remainingGuaranteed`). Receiver inherits base; sender keeps the unamortized bonus as dead |

`clearDeadCap` runs once a league year, at the start of
`runFreeAgencyOpen` (tag window → FA). Everything on the books at that
moment is zeroed. `expireContracts` then adds leftover. Offseason
trades and the finalize/cutdown waiver settle add more. `finalizeOffseason`
rolls the calendar to next preseason **without** another clear. Drift
snapshots **after** that full offseason loop, so the metric is
opening-year stock of year N+1, not in-year peak.

`makeContract` sets `bonusProrationYears = min(years, 5)`, so a deal
with no voids has leftover 0 at natural expiry. Void years
(`applyVoidYears`, Wave 3.8 Packet 4) are the only path that sets
`bonusProrationYears > years`.

Paths that do **not** write `deadCap`:

- **Restructure** (`applyRestructure`) converts this year's base into
  bonus. Headless CPU never calls it (0 events on this run). It would
  only change *future* cut/void dead.
- **Retirement** (`runProgression`) sets `retired`, `teamId = null`,
  `contract = null`. No `addDeadCap`. Expire then skips the body.
- **Franchise tag** — `expireContracts` `continue`s tagged players.
- **IR** — `status === "ir"` keeps `capHit`. Not dead.
- **PS stash** — `stashOrFreeAgent` parks the man if there is a PS
  slot and room for the *hit*. Acceleration is skipped; the hit stays
  as committed cap.

---

## 2. Method

| item | value |
|---|---|
| SHA | `93d7e4be812554b988cd92cf369e8b48a0b51829` (`main` / #109, includes #100) |
| seed | **12345** (harness default; `GG_SEED` unset) |
| seasons | **20** (league years 2026–2045) |
| command | local `npx tsx /tmp/deadmoney-census.ts 20 12345` from `v2/` |
| wall-clock | 2399.7 s (~40 min) on this 4-core VM |
| loop | same as `scripts/drift.ts`: play to recap, then `advanceOffseason` through finalize |
| attribution | optional listener on `addDeadCap` / `clearDeadCap` plus observe-only notes on retirement, PS stash, void-year adds, tag skips. Amounts and RNG unchanged |
| script | **not committed** |

Stock is snapshotted twice per season:

- **recap** — end of the regular year, before `clearDeadCap`
- **drift** — after the full offseason, same moment as
  `drift.deadMoneyPct`

Dollars are league-wide (32 clubs, including the headless user club).
Percents-of-cap use that season's `salaryCap` × 32, same formula as
the harness. Reported means are the mean of the 20 seasonal values
(not the ratio of 20-year totals). League cap grows, so later years
are larger in dollars and similar in percent.

This is one seed. The Wave 4.0 5-seed panel mean 2.42 is the
multi-seed authority for the aggregate; this run is the by-source
breakdown.

---

## 3. Drift stock — why the 2.46 exists

Mean `deadMoneyPct` **2.4588**. Mean dead **$376.66M** on a mean
league cap of **$15,008.52M**.

| source | mean $M | % of dead | % of cap |
|---|---:|---:|---:|
| `waiver_clear` | 185.03 | 49.12 | 1.23 |
| `trade_proration` | 122.05 | 32.40 | 0.81 |
| `void_expire` | 69.57 | 18.47 | 0.46 |
| `expire_nonvoid` | 0.00 | 0.00 | 0.00 |
| **total** | **376.66** | **100** | **2.46** |

Those three adders reconcile to the flow that happens *after* the
annual clear:

| post-clear adder | 20-yr $M | = drift stock × 20 |
|---|---:|---|
| `waiver_clear:preseason` (cutdown `settleWaivers` after finalize) | 3,701.06 | waiver stock $185.03 × 20 ≈ 3,700.7 |
| `trade_proration:offseason` | 2,441.04 | trade stock $122.05 × 20 = 2,441.0 |
| `void_expire:offseason` | 1,391.48 | void stock $69.57 × 20 = 1,391.4 |

In-season trades and in-season cuts are **not** in this table. They
are wiped at FA open.

Year 0–2 have **$0** void expire (CPU voids require ≥3 years left, so
the first acceleration is 2029). Steady-state 2029–2045 mean
`deadMoneyPct` is **2.64**, still well under 5.

---

## 4. Recap stock — in-year books before the wipe

Mean recap `deadMoneyPct` **3.49**. Mean dead **$533.79M**.

| source | mean $M | % of recap dead | % of cap |
|---|---:|---:|---:|
| `trade_proration` | 242.88 | 45.50 | 1.62 |
| `waiver_clear` | 225.34 | 42.22 | 1.50 |
| `void_expire` | 65.58 | 12.28 | 0.44 |
| **total** | **533.79** | **100** | **3.49** |

This is previous opening stock plus in-season adds. It is the highest
clean read of "what the cap sheet carried during the year." It is
still ~1.5–4.5 points short of the OTC 5–8% note. Clearing the books
at FA open explains **1.03** of the 2.46-vs-5–8 gap, not the rest.

---

## 5. Flow (every `addDeadCap`, including dollars later cleared)

20-year total added **$11,231.14M** ($561.6M / season).

| source | total $M | % of flow | events | $M / season | mean event |
|---|---:|---:|---:|---:|---:|
| `trade_proration` | 5,064.11 | 45.09 | 1,259 | 253.21 | $4.02M |
| `waiver_clear` | 4,775.54 | 42.52 | 15,530 | 238.78 | $0.31M |
| `void_expire` | 1,391.48 | 12.39 | 66 | 69.57 | $21.08M |

### Flow × window

| cell | total $M | % of flow | survives into drift stock? |
|---|---:|---:|---|
| `waiver_clear:preseason` | 3,701.06 | 32.95 | yes (cutdown after finalize) |
| `trade_proration:inseason` | 2,623.07 | 23.36 | no (wiped at FA open) |
| `trade_proration:offseason` | 2,441.04 | 21.73 | yes |
| `void_expire:offseason` | 1,391.48 | 12.39 | yes |
| `waiver_clear:inseason` | 1,042.40 | 9.28 | no |
| `waiver_clear:offseason` | 32.08 | 0.29 | no (recap/tag `settleWaivers` before clear) |

`clearDeadCap` fired 20 times and wiped **$10,702.74M**.

### Waiver composition

15,530 clears. Bonus proration **60.95%** / guaranteed base **39.05%**.
Events with `voidYears > 0`: **0**. Events on a tagged player: **0**.
CPU clubs do not cut voided or tagged deals on this run; those
leftovers only appear at expire (voids) or not at all (tags play the
tender / get extended).

---

## 6. Per-season `deadMoneyPct` (seed 12345)

| season | drift % | recap % | drift waiver $M | drift void $M | drift trade $M |
|---|---:|---:|---:|---:|---:|
| 2026 | 0.94 | 1.37 | 56.89 | 0.00 | 19.61 |
| 2027 | 1.70 | 1.80 | 69.13 | 0.00 | 77.93 |
| 2028 | 1.63 | 3.34 | 126.38 | 0.00 | 23.11 |
| 2029 | 2.54 | 3.04 | 143.27 | 7.59 | 96.46 |
| 2030 | 1.82 | 3.11 | 133.90 | 6.98 | 46.27 |
| 2031 | 2.72 | 3.70 | 143.91 | 93.94 | 59.59 |
| 2032 | 3.02 | 4.52 | 167.73 | 120.35 | 61.92 |
| 2033 | 2.72 | 4.37 | 195.59 | 60.62 | 77.25 |
| 2034 | 3.10 | 3.73 | 177.84 | 76.40 | 148.64 |
| 2035 | 2.91 | 4.52 | 185.80 | 57.58 | 158.30 |
| 2036 | 3.26 | 3.88 | 175.43 | 173.17 | 127.77 |
| 2037 | 3.12 | 4.32 | 232.63 | 138.08 | 112.61 |
| 2038 | 2.32 | 4.42 | 261.17 | 88.78 | 31.57 |
| 2039 | 2.91 | 3.08 | 233.83 | 24.65 | 247.28 |
| 2040 | 2.53 | 3.49 | 243.77 | 45.46 | 177.63 |
| 2041 | 2.57 | 3.41 | 234.42 | 202.33 | 65.27 |
| 2042 | 2.21 | 4.00 | 238.62 | 24.60 | 194.85 |
| 2043 | 2.25 | 3.14 | 226.31 | 0.00 | 267.58 |
| 2044 | 2.76 | 2.59 | 212.24 | 190.97 | 240.79 |
| 2045 | 2.14 | 3.97 | 241.81 | 79.97 | 206.61 |
| **mean** | **2.46** | **3.49** | **185.03** | **69.57** | **122.05** |

Void dollars are lumpy (0 some years, $202M in 2041) because only 66
deals voided in 20 seasons.

---

## 7. Observed non-sources (not invented categories)

These do not call `addDeadCap`. They are recorded only so a lead does
not have to re-open the files.

| observation | 20-yr count | 20-yr $ | $M / season | notes |
|---|---:|---:|---:|---|
| `retirement_uncosted` | 3,096 | $9,618.27M | **480.91** | leftover `deadMoney()` at the moment the contract is nulled. ~3.20 cap points if it were a charge. Happens at recap, *before* `clearDeadCap`, and expire skips the retired body |
| `ps_stash_avoided` | 12,438 | $2,847.25M | 142.36 | acceleration skipped; hit stays as `capHit`. Not missing dead — different bucket |
| `void_years_added` | 125 | — | 6.25 adds/yr | CPU `runCpuVoidYears` only (contend + ~90% committed, ≥3 years left). User club not auto-voided |
| `tag_expire_skip` | 336 | — | 16.8/yr | matches the ~16–17 tags/yr panel. No leftover charged |
| `restructure_applied` | **0** | — | 0 | user desk only; CPU has no path |

IR has no row because nothing in the IR/PS place/activate path writes
or observes `deadCap`.

---

## 8. Why ~2.4 rather than ~5–8% (OTC)

OTC's published 2020s league-wide dead-money share of the cap is
**~5–8%** (`nfl-reference.md` §4;
https://overthecap.com/salary-cap). It is a note on an additive emit,
not a band, and not a T/D/S/P computation. The comparable sim window
is the **drift / opening-year** stock (after the new league year has
been built), not recap.

On this seed that window is 2.46 because:

1. **Only three things charge `deadCap`, and regular expiry is not one
   of them.** Natural end-of-deal leftover is $0 unless the deal has
   void years.
2. **`clearDeadCap` is a hard annual wipe.** In-season trade leftover
   ($131M/yr) and in-season cuts ($52M/yr) die at FA open. NFL June-1
   designations and multi-year dead carry have no sim equivalent.
3. **Retirement is free.** ~$481M/yr of leftover bonus + guaranteed
   base vanishes. Charging it at recap would still be wiped before
   the drift snapshot unless expire also re-charged it.
4. **Cuts are small and void-free.** 15,530 clears at $0.31M mean; 0
   of them are voided or tagged contracts. The expensive leftovers
   stay on the roster until void-expire ($21M mean, 3.3/yr).
5. **CPU void-year use is sparse.** 6.25 adds/yr, 3.3 expires/yr, 0.46
   cap points in the metric. Year-0 generation has zero voids by
   design (Wave 3.8 Packet 4).
6. **Even the in-year recap stock is only 3.49%.** The wipe is not
   the whole gap.

A back-of-envelope that is **not a target**: recap 3.49 + uncosted
retirement 3.20 ≈ **6.7**, inside the OTC note. That arithmetic mixes
two different windows and assumes every retirement leftover is NFL
dead. It is here only to show the gap is mechanism-shaped, not a
missing 2× multiplier on the three live adders. Do not treat 6.7 as
a prescription.

---

## 9. Leftover (for a future packet — no dials)

A tune packet that is told to move `deadMoneyPct` toward 5–8% would
need Matt to pick a **mechanism**, not a number on an existing knob.
This census does not pick one.

What that packet would need, measured:

- Whether retirement leftover should charge `deadCap` (and whether
  that charge should land before or after `clearDeadCap`, or at
  expire).
- Whether `clearDeadCap` should remain a hard wipe or grow a
  June-1 / multi-year carry. Changing the wipe moves the *metric
  window*, not just the dollars.
- Whether CPU clubs are *supposed* to cut voided / expensive
  veterans (0 such clears here). Volume of cheap cutdown releases
  is already high; the missing dollars are per-event size.
- Whether 6.25 CPU void-year adds a year is the intended use of the
  Wave 3.8 Packet 4 desk. More voids raise `void_expire` with a
  3-year lag; they do not touch year-0 calibrate / statcheck.
- Whether OTC 5–8% is even the right comparison for this emit, or
  whether the emit should stay a runaway-voids watch with no band.

Do **not** retune `runCpuVoidYears` gates, cutdown harshness, trade
frequency, tag rules, `GUARANTEE_PULL`, or any contract dial from
this write-up. `drift.deadMoneyPct` stays an additive emit with no
band.

---

## 10. Untouched

`lib/core/**`, `scripts/**`, `docs/baselines.json`, AGENTS.md
known-open rows, `POSITION_VALUE`, `CONTENDER_PULL`,
`GUARANTEE_PULL`, `CARRY_SHARE`, void-year N=4, carryover, tag /
fifth-year / extension decision logic.
