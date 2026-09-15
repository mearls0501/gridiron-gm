# IR activation report — 2026-09-15 (Wave 3.9 Packet 6)

Read-only. Base `main @ d6b7dcf` (#89). Engine, `docs/baselines.json`, and
the gate were not touched. Additive harness: `v2/ir-activation-report.ts`
(not registered — same docs-class pattern as `v2/scout-audit.ts`).

**Question.** What is typical IR headcount, how often does a designation
return to the 53, and does that disagree with anything already traced in
`nfl-reference.md`?

**Verdict.** CPU clubs keep a thin IR *stock* (~2 bodies/club) and a
busy IR *flow* (~7 designations/club/year). About **71%** of
designations activate the same season; another ~38 leftover bodies
return the next year. Clubs burn **6 of 8** return designations; ~10
of 31 CPU clubs hit the cap and then park healthy men on IR. There is
**no IR headcount cap**. `nfl-reference.md` §4 records the published
rules (8 returns, min 4 games) and no volume/return-rate target —
this axis stays **ungated**. Do not tune.

---

## 1. How IR works (code path)

Invariant 4: IR is `Player.status === "ir"` on `state.players`. Missing
status is active. IR does not count against the 53 (`isActiveRoster` /
`rosterCount` in `lib/core/select.ts`).

Constants (`lib/core/types.ts`, sourced from
`docs/front-office-design-2026-07-28.md` Part 5, written into
`nfl-reference.md` §4 as ungated published rules):

| rule | value | gates |
|---|---|---|
| `IR_MIN_GAMES` | 4 | place (`injuryWeeks >= 4`) and return (`irGames >= 4`) |
| `IR_RETURN_DESIGNATIONS` | 8 | **activate only** — a 9th ACL still leaves the 53 |
| IR roster cap | **none** | a club may hold any number of IR bodies |

### Place

`canDesignateIr` / `designateIr` (`lib/core/rosterStatus.ts`): active,
not retired/prospect, `injuryWeeks >= 4`. Sets `status = "ir"`,
`irGames = 0`.

`autoDesignateIr` (regular + playoffs only): every **CPU** eligible
body, immediately. The user club is skipped — Designate IR is a
`/roster` click.

Injuries that can reach the 4-week bar:

- Weekly non-contact table (`season/injuries.ts` `WEEKLY_TABLE`). Raw
  weights sum to 100. Always ≥4 weeks without duration scaling: foot
  fracture (2.5) + Achilles (0.8) + ACL (0.7) = **4.0**. Calf / quad /
  high-ankle sometimes qualify. `POSITION_DURATION` (QB 1.78 … LB 2.0)
  then stretches many 2–3 week draws over the bar, which is why CPU
  IR volume is a *flow* of mid-length absences, not just tears.
- In-game tiers (`sim/game.ts`): 55% day-to-day, 25% 1–2 weeks, 13%
  3–6, 5% 7–12, 2% 13–40. Roughly a tenth of on-field events are
  IR-eligible. Duration is not position-scaled on this path.

### Fill the opened 53

`applyCpuIrAndFill` (`season/engine.ts`, same shape in
`season/playoffs.ts`) on a **child** RNG stream (ORCHESTRATION §3):

1. `autoDesignateIr`
2. `fillCpuIrReplacements` (`irFill.ts`) — elevate that club's PS
   first (need-position, then OVR), else street-sign
   (`fillOpenActiveSlots`). Never cuts; IR already made the room.
3. `tickIrGames` — `irGames += 1` only if that club *played* (bye
   does not count)
4. `autoActivateFromIr`

User club is skipped. The opened slot stays open until the user signs.

### Activate back to the 53

`activateFromIr` requires all of:

- `status === "ir"`
- `injuryWeeks === 0` (still hurt → stay)
- `irGames >= 4`
- `irReturnsUsed < 8`
- an open 53 slot, or `freeActiveSlot` succeeds (stash worst surplus
  to PS, else cut)

CPU policy is greedy: activate the first eligible body in
`state.players` order as soon as the tests pass. There is no "bury
him" branch except the 8-return cap. The design-doc decision
("burn a return slot or bury him") is only half-implemented: CPU
always burns when it can.

`irReturnsUsed` increments on activate, not on place. After 8
returns the club can still IR people; they cannot come back this
season.

### Offseason / next year

`resetSeasonRosterFlags` clears `irReturnsUsed` and `psElevations`.
It does **not** clear `status` or `irGames`. `healOffseason` subtracts
26 weeks; leftover ACL/Achilles stay injured. `expireContracts` /
cuts / retirement call `clearRosterSlot` and drop IR. PS fold does
not touch IR.

`startRegularSeason` re-runs `applyCpuIrAndFill`, so a leftover
body who is now healthy and already has `irGames >= 4` activates
in week 1 and burns a **new** year's designation.

Playoffs: same designate / fill / tick / activate. Non-contact
weekly roll does not fire in January (only in-game injuries + heal).

---

## 2. Method

**Do not scan `state.log`.** `trimLog` is a measurement trap
(Wave 3.7 Packet 2 / `tradesPerSeason` 7.8 artefact). The harness
diffs the IR set after every `advance()` / `advanceOffseason()`.

```
npx tsx ir-activation-report.ts [seasons] [seed]
```

This packet: **8 seasons, seed 12345**, 4-core cloud VM, ~372 s.
Year 0–1 smoke (same seed, 2 seasons, 42 s) is in the table below
for the early-season floor.

Existing harness already emits **`##M drift.irCapPctMean`**
(Wave 3.8 Packet 5): league IR cap hits / (32 × salary cap) at
**recap**. Not in `baselines.json`. Same formula is re-emitted here
as a cross-check.

CPU-only headcount / designations: the headless user club never
clicks Designate IR (`userDesignations = 0` on this run). League
`irCapPct` still divides by 32, so it is ~3% low vs a 32-CPU world.

---

## 3. Numbers

### Already on the books (`drift.irCapPctMean` at recap)

| source | seasons | seed | `irCapPctMean` |
|---|---:|---|---:|
| Wave 3.8 P5 smoke | 1 | 12345 | 5.35 |
| Wave 3.8 P5 | 8 | 12345 | 5.81 |
| Wave 3.8 P6 | 12 | 12345 | 5.89 |
| **this packet** | **8** | **12345** | **5.92** |
| Wave 3.9 Packet 1 Studio panel | 20 × 5 | panel | **6.35** |

The 8-season read matches Packet 5/6 on the same seed. The Studio
panel sits ~0.4 higher on a longer horizon (leftover star-salary
IR accumulates; 2032 on this seed already printed 8.49).

### This packet — 8 seasons / seed 12345

| metric | mean | how to read it |
|---|---:|---|
| CPU designations / club / year | **6.97** | every 4+ week injury, immediately |
| League designations / year | **216** | 31 CPU clubs; user = 0 |
| League activations / year | **191.5** | back on that club's 53 |
| Same-season return % | **71.0** | activated this year / designated this year |
| Prior-year leftover activations | **38.1** | week-1 activate after offseason heal |
| Other IR exits (cut / expire / retire) | **18.0** | not a return |
| CPU weekly IR headcount / club | **2.07** | mean across regular + playoff snapshots |
| CPU recap IR headcount / club | **2.24** | same moment as `irCapPct` |
| Max one-club IR in any week | **11** | no roster cap, so this is legal |
| CPU return designations used | **6.01 / 8** | activate-counter, not place-counter |
| CPU clubs at the 8-return cap | **10.38** | ~1 in 3 |
| Recap still-injured IR (league) | **37.3** | season-ending / multi-year |
| Recap healthy-on-IR (league) | **32.1** | mostly return-cap residue |
| Recap IR OVR | **72.8** | rotation / starter, not street |
| Recap IR cap hit (mean body) | **$8.6M** | why 2.2 bodies ≈ 6% of cap |
| `irCapPctMean` (same formula as drift) | **5.92** | cross-check |

Per-season extract (same run):

```
season  desig  act  same%  leftover  recapHd  weekHd  retUsed  @cap8  irCap%
2026     222   176   79%        0     1.81    1.93     5.35      8    4.41
2027     222   197   76%       28     1.97    2.09     6.10     10    5.14
2028     207   182   70%       38     2.23    1.89     5.71      8    5.82
2029     187   179   69%       50     2.03    1.91     5.71      8    6.16
2030     216   187   67%       42     2.42    2.03     6.00     11    5.42
2031     214   191   68%       46     2.52    2.24     5.94     11    6.67
2032     242   214   67%       51     2.77    2.40     6.68     16    8.49
2033     218   206   72%       50     2.16    2.06     6.58     11    5.25
```

Year 1 leftover activations = 0 (nobody started on IR). Year 2
leftover = 28, which is year 1's `222 − 176 − 18` residue. The
diff accounting closes.

**How often do IR players return?** Same-season **71%**. Counting
next-year leftover activations against this year's designations
overstates a single cohort (those 38 are last year's leftover, not
this year's). A cleaner "eventually back on the 53" over this
window is activations / designations = **191.5 / 216 ≈ 89%**, with
~8% leaving via expire/cut/retire and the rest sitting injured or
healthy-but-capped at recap.

---

## 4. vs `nfl-reference.md`

Cited, and that is the whole comparison:

- **§4 Practice squad / IR.** 8 return designations, min 4 games, 3
  elevations. Published rule, **not in T/D/S/P**, **ungated**. CPU
  fill after Designate IR is "not a new measured rate." The sim
  implements those rules. This packet did not find a rule miss.
- **§6.3 injury-report artefact.** A player placed on IR drops off
  the weekly Out list. That is why report-weeks cannot be used as
  availability targets. Not a headcount figure.
- **§6.9 `irCapPctMean`.** League IR cap hits / (32 × cap) at recap.
  No band. This packet's 5.92 sits on the Packet 5/6 5.8–5.9 reads.

**No IR headcount, no activation rate, no "typical IR list size"
exists in `nfl-reference.md`.** Per invariant 7, do not invent one
and do not gate these emits. A transactions/IR feed is the source
§6.3 already asked for.

Qualitative (code-path, not a traced miss): real clubs often *bury*
a late-season or replacement-level IR body rather than burn a
designation. CPU never does that until the 8th return is used.
That is why stock is thin (~2/club at recap) while flow is busy
(~7 designations/club) and why ~32 healthy bodies sit on IR at
recap — the cap, not a medical decision.

---

## 5. Proposed metric emits (report-only — do not add yet)

Lead decision whether to hang these on `scripts/drift.ts` as
additive `##M` lines. **Not in this PR.** Not in `baselines.json`.
The standalone harness already prints them.

| proposed `##M` | this 8-season read | claim |
|---|---:|---|
| `ir.cpuWeekHeadcountMean` | 2.07 | typical in-season IR stock / CPU club |
| `ir.cpuRecapHeadcountMean` | 2.24 | recap stock (pairs with `irCapPctMean`) |
| `ir.cpuDesignationsPerClub` | 6.97 | IR *flow* |
| `ir.sameSeasonReturnPct` | 70.97 | how often a designation returns this year |
| `ir.cpuReturnsUsedMean` | 6.01 | designation-budget pressure |
| `ir.cpuClubsAtReturnCap` | 10.38 | how often the 8-cap binds |
| `drift.irCapPctMean` | 5.92 | already emitted; keep |

If a future packet adds them to `drift.ts`, snapshot at recap for
the stock/cap lines (same moment as today) and accumulate the flow
lines across the year with a set-diff, not a log scan.

---

## 6. Mac Studio follow-up

This VM is 4 cores. 8 seasons / one seed is the measurement, not a
panel. To tighten the leftover-accumulation tail and sit on the
Wave 3.9 panel horizon:

```
npx tsx ir-activation-report.ts 12 12345    # matches P6 drift horizon
npx tsx ir-activation-report.ts 20 12345    # matches Studio drift length
```

A 5-seed panel is only worth it if the lead wants to *lock* a
headcount/return emit. Do not lock from this seed. Expect
`irCapPctMean` near **6.0–6.4** on 20 seasons if it stays with the
Packet 1 panel 6.35.

---

## 7. Caveats

- Headless user club never IRs. CPU numbers are the ones that
  describe the policy. League `irCapPct` still divides by 32.
- Single seed. Year-to-year `irCap%` on this run ran 4.41–8.49.
- `sameSeasonReturnPct` uses all designations (user 0 + CPU).
- Offseason expire/retire of IR is charged to the season that just
  closed (`otherExits`). Week-1 leftover activates charge the new
  year.
- Playoff tick only credits clubs that played that round, so a
  healthy IR body on a club that is already out does not gain
  `irGames` in January.
- No engine change, so this cannot move `playerWeeksLost` /
  `ovrDrift`. Those already include the IR floor (AGENTS.md /
  `nfl-reference.md` §6.9).

---

## 8. Untouched

`lib/core/**`, `scripts/**`, `docs/baselines.json`, `docs/nfl-reference.md`,
injury tables, `POSITION_VALUE`, `CARRY_SHARE`, PR #9, tag/cap
packets. No gate registration.
