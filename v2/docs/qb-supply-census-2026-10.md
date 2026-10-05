# QB supply census — 2026-10-05

Wave 4.4 Packet B. Read-only. Engine untouched. One headless seed.

`npx tsx scripts/qbSupplyCensus.ts 12 12345` on `79eaee3` (#151). Start season 2026. Twelve drafts, twelve cutdown springs (2027–2038). The generated opening roster is shown once and left out of the headlines. Every drafted quarterback's recomputed `cpuBoardValue` matched `cpuBoardShortlist` (431 picks, absolute error under 1e-6), and each of those players scored at least at the top-4 cutoff `cpuPick` draws from.

Real comparison, as named for this packet: **11.6** quarterbacks drafted per class (116 QBs, 2010–2019, `docs/nfl-reference.md` §2.7) and **~2.6** on the 53.

---

## Headlines

| | sim | real |
|---|---:|---:|
| QBs drafted per class | **35.9** | 11.6 |
| QBs per club on the 53 | **3.98** | ~2.6 |
| QBs per club on the practice squad | **2.22** | — |

League-wide practice-squad stock averages **71** quarterbacks (peak **101** in 2036). CPU clubs alone are 4.02 on the 53 and 2.24 on the practice squad. The user club does not move the mean.

The background reading (about 18.6 drafted, 3.0–3.6 on the 53, 43 on practice squads by season 4) sits at the low end of this run. The first cutdown is 2.69 on the 53 and 39 on practice squads. By the fourth year of the league the 53 is 3.75 and the practice squad is 48, and both keep climbing.

---

## By season

Opening day is `POSITION_TARGET.QB` of 3, and no practice-squad quarterbacks. After that the draft and the cutdown run.

| season | kind | QB pool | drafted | /club 53 | league 53 | /club PS | league PS | clubs 3+ | clubs 4+ |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 2026 | opening | — | — | 3.00 | 96 | 0.00 | 0 | 32 | 0 |
| 2027 | cutdown | 46 | 35 | 2.69 | 86 | 1.22 | 39 | 16 | 5 |
| 2028 | cutdown | 58 | 32 | 3.22 | 103 | 1.00 | 32 | 20 | 11 |
| 2029 | cutdown | 46 | 36 | 3.75 | 120 | 1.50 | 48 | 25 | 17 |
| 2030 | cutdown | 57 | 37 | 3.81 | 122 | 2.38 | 76 | 25 | 16 |
| 2031 | cutdown | 55 | 47 | 4.00 | 128 | 2.13 | 68 | 25 | 15 |
| 2032 | cutdown | 52 | 35 | 4.25 | 136 | 2.28 | 73 | 29 | 18 |
| 2033 | cutdown | 45 | 41 | 4.53 | 145 | 2.50 | 80 | 30 | 22 |
| 2034 | cutdown | 51 | 24 | 4.69 | 150 | 2.53 | 81 | 31 | 25 |
| 2035 | cutdown | 50 | 36 | 4.47 | 143 | 2.41 | 77 | 27 | 21 |
| 2036 | cutdown | 46 | 33 | 4.19 | 134 | 3.16 | 101 | 30 | 23 |
| 2037 | cutdown | 33 | 30 | 4.06 | 130 | 2.72 | 87 | 27 | 16 |
| 2038 | cutdown | 49 | 45 | 4.09 | 131 | 2.81 | 90 | 26 | 15 |

The pool averages 49 quarterback prospects. Clubs draft 35.9 of them (73%). IR holds 2–8 league-wide and is not in the headlines.

Active quarterbacks on the 53, 384 club-springs:

| QBs on the 53 | club-springs | share |
|---:|---:|---:|
| 2 | 73 | 19.0% |
| 3 | 107 | 27.9% |
| 4 | 83 | 21.6% |
| 5 | 49 | 12.8% |
| 6 | 39 | 10.2% |
| 7 | 19 | 4.9% |
| 8 | 10 | 2.6% |
| 9 | 3 | 0.8% |
| 10 | 1 | 0.3% |

---

## Which board term carried the pick

`cpuBoardValue` (`v2/lib/core/offseason/draft.ts`) scores a prospect as surplus times `sqrt(POSITION_VALUE)`, times whether he would start, times a need term. Need is marginal quality plus a thin bonus:

```591:592:v2/lib/core/offseason/draft.ts
  const thin = positionCount(state, teamId, p.pos) < POSITION_TARGET[p.pos] ? 0.35 : 0;
  const need = clamp(marginal + thin, -0.6, 1);
```

`POSITION_TARGET.QB` is 3. `positionCount` is active bodies, so a quarterback on the practice squad does not cure thin. Marginal need is `(view.ovr − incumbent) / 20`, clamped to [−0.6, 1]. The incumbent is the best quarterback on the roster, or replacement (58) if the room is empty.

The positional premium and the starter discount:

```629:634:v2/lib/core/offseason/draft.ts
  const startsHere = clamp((view.ovr - incumbent + 6) / 12, 0.25, 1);
  const above = Math.max(1, perceived - REPLACEMENT_OVR + upside);
  return above * Math.sqrt(POSITION_VALUE[p.pos]) * startsHere * bias * rebuildUpside *
    (1 + need * needWeight) * riskDiscount(p);
```

`sqrt(3.4)` is about 1.84. The 0.25 floor means a prospect the club reads at least 3 points below its starter still keeps a quarter of that premium.

A term **carries** the pick when the quarterback's full score beats the best non-quarterback on the board and the score with that term removed does not. Two terms can each do that; the larger drop is the carrier. **Base** means he still ranks above that non-quarterback with the thin bonus removed, with marginal need removed, and with the positional scale set to 1.

| | picks | share |
|---|---:|---:|
| Value premium flips the pick | 215 | 49.9% |
| Marginal need flips the pick | 7 | 1.6% |
| Thin bonus flips the pick | 3 | 0.7% |
| Base (no single term flips it) | 216 | 50.1% |

On all 215 decisive picks the carrier is the value premium. The three thin flips and the seven marginal flips are also value flips, and the premium's drop is the larger one. Thin is on for **55 of 431** picks (12.8%). The club already has **4.87** active quarterbacks at the pick. **87%** of QB picks are made at 3 or more on the roster, which is the target the thin bonus uses, so the bonus is off. Marginal need is negative on **83%** of picks: the club's own read is worse than the incumbent. `startsHere` is on the 0.25 floor for **79%**.

Round 1 volume is in range (3.1 per class; a real first round is about 3.3 at the 10.3% share in `nfl-reference.md` §2.4). The extra twenty-four quarterbacks a year are rounds 2–7.

| round | n | per class | mean QB count | mean starter | thin on | value | base | board #1 | true OVR |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 37 | 3.1 | 3.19 | 67.1 | 37.8% | 56.8% | 43.2% | 54.1% | 70.3 |
| 2 | 30 | 2.5 | 3.53 | 66.1 | 26.7% | 46.7% | 53.3% | 50.0% | 64.9 |
| 3 | 49 | 4.1 | 4.12 | 73.1 | 12.2% | 42.9% | 57.1% | 42.9% | 61.7 |
| 4 | 51 | 4.3 | 4.16 | 75.5 | 15.7% | 35.3% | 64.7% | 29.4% | 58.3 |
| 5 | 45 | 3.8 | 4.13 | 78.4 | 17.8% | 48.9% | 51.1% | 44.4% | 55.2 |
| 6 | 62 | 5.2 | 4.74 | 78.1 | 11.3% | 40.3% | 59.7% | 32.3% | 52.1 |
| 7 | 157 | 13.1 | 6.24 | 77.9 | 2.5% | 59.9% | 40.1% | 24.2% | 49.4 |
| all | 431 | 35.9 | 4.87 | 75.4 | 12.8% | 49.9% | 50.1% | 34.6% | 55.7 |

| active QBs at the pick | n | thin on | value | base | mean starter |
|---:|---:|---:|---:|---:|---:|
| 0 | 2 | 100% | 50.0% | 50.0% | 58.0 |
| 1 | 13 | 100% | 53.8% | 46.2% | 66.2 |
| 2 | 40 | 100% | 35.0% | 65.0% | 73.3 |
| 3 | 92 | 0% | 45.7% | 54.3% | 74.9 |
| 4+ | 284 | 0% | 53.2% | 46.8% | 76.4 |

| true OVR | n | value | base | mean round |
|---|---:|---:|---:|---:|
| ≤52 | 170 | 55.3% | 44.7% | 6.57 |
| 53–60 | 144 | 45.8% | 54.2% | 5.13 |
| 61–70 | 92 | 43.5% | 56.5% | 2.76 |
| 71+ | 25 | 60.0% | 40.0% | 1.36 |

Round 7 is a camp body (true OVR 49, the camp generator's center) taken onto a roster that already has six quarterbacks and a 78-overall starter. The thin bonus is on for 2.5% of those picks. The premium flips 60% of them.

---

## What kept the 3rd and 4th quarterback

Spring snapshot, after `finalizeOffseason`: the 53, the practice squad, and waivers are already settled. Active quarterbacks are ordered by OVR. The 3rd and 4th are everyone past `POSITION_MIN.QB` of 2, which does not protect them.

Worth is the cutdown's own number: `evaluate` (which multiplies by `POSITION_VALUE`, 3.4 at QB) plus `draftCapitalHold`. The line is the worst other surplus player. The label is which removal drops him through that line.

| rule | meaning |
|---|---|
| ability | Stays above the line at positional value 1 with no draft-capital hold |
| position-value | The 3.4× is required; the hold is not |
| hold | Draft capital is required; the 3.4× is not |
| both | Each removal drops him |
| either | Either factor alone keeps him; removing both drops him |
| at-limit | He is the next cut. The roster is already at 53 |

| rule | 3rd QB | share | mean OVR | rookie | 4th QB | share | mean OVR |
|---|---:|---:|---:|---:|---:|---:|---:|
| ability | 214 | 68.8% | 63.8 | 11.7% | 102 | 50.0% | 62.2 |
| position-value | 66 | 21.2% | 60.2 | 4.5% | 59 | 28.9% | 58.8 |
| either | 17 | 5.5% | 59.6 | 29.4% | 24 | 11.8% | 59.2 |
| hold | 8 | 2.6% | 56.1 | 87.5% | 9 | 4.4% | 56.8 |
| both | 3 | 1.0% | 57.0 | 0% | 3 | 1.5% | 58.0 |
| at-limit | 3 | 1.0% | 57.7 | 0% | 7 | 3.4% | 56.4 |
| all | 311 | 100% | 62.5 | 12.9% | 204 | 100% | 60.4 |

311 of 384 clubs have a third quarterback. 204 have a fourth. Most of those third quarterbacks are a 64-overall veteran the surplus sort prefers to somebody else even with the quarterback premium turned off. The 3.4× in `evaluate` is what saves the third body for 21% of clubs and the fourth for 29%. Draft capital is a few rookies. Practice-squad quarterbacks are the waiver stash (`stashOrFreeAgent`): unclaimed, the squad has room, and the hit fits. That stock is the 71.

---

## Sign

**Sign:** In `cpuBoardValue`, drop the 0.25 floor on `startsHere` for quarterbacks, so a prospect the club reads below its starter does not keep a quarter of `sqrt(POSITION_VALUE.QB)`.
