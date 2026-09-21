# tags~17.1 leak-or-behaviour census — 2026-09-21

Wave 4.1 Packet 3. Read-only. Engine, dials, `docs/baselines.json`, and
`scripts/` were not edited. Probe script lived in `/tmp` and is not in
this PR.

**Verdict: intentional behaviour — not a measurement leak.**

`drift.franchiseTagsPerSeason` **17.11** is a real count of exclusive
franchise-tag records applied in the window that just closed. It is
what the signed CPU rule produces. It is not a `trimLog` / season-label
/ double-count artifact. Discard the hypothesis that ~17.1 is a
harness leak.

The rate sits **1.7×** the sourced NFL note (~10) and **high in** the
signed 14±4 band (ceiling 18). That gap is the signed price test being
a weak volume filter, plus `continue` fall-through after the Wave 4.0
22% ceiling — not a wrong numerator.

---

## 1. Verdict

| question | answer |
|---|---|
| Is 17.1 a **measurement leak** (wrong count)? | **No.** |
| Is 17.1 **intentional behaviour** of the signed CPU rule? | **Yes.** The rule is doing what it says. Most non-rebuild CPU clubs find someone who passes. |
| Is the *rate* what the NFL does? | **No.** Real exclusive-tag volume is ~10 / year (`nfl-reference.md` §4). The sim is ~17. |
| Should anyone retune toward 14 or 10? | **No.** Band and rule are Matt-signed. Report only. |

The leftover that *looks* like a leak is behavioural, and it is
already named: `surplusExceedsTender` does not express “worth a
franchise tag.” Combined with per-player `continue` (not per-club
skip) after the 22% ceiling, clubs that cannot tag their first choice
tag the next cheaper expiring player instead. That is why the
post-#97 panel did **not** dip toward 11–14.

---

## 2. What the 17.1 figure is

Authority is the Mac Studio 5-seed `gate:full:serial` at `6e3b7bf`
(#98, post tag-ceiling #97), recorded in `HANDOFF.md` (Wave 4.0
post-#97/#98 panel, 2026-09-16):

| panel | SHA | `franchiseTagsPerSeason` | notes |
|---|---|---:|---|
| Wave 3.4 / 3.5 addendum | seed 12345, 12 seasons | **13.17** | first emit; no band yet |
| Wave 3.7 Packet 2 (Matt SIGNED) | `2752729` / #77 | **~14.0** (15.1 / 13.8 / 12.3 / 14.3 / 14.4) | band locked **14 ±4**, `nfl: 10` |
| Wave 3.9 Packet 1 | `748036a` / #88 | **16.62** (17.1 / 16.7 / 15.8 / 17.55 / 15.95) | first “≥17 / leak-or-behaviour” note. **Correction:** 16.62 is inside 14±4 (ceiling 18), not above it |
| Wave 4.0 Packet 1 | `625fd06` / #93 | **17.27** | still inside the band |
| Wave 4.0 post-#97/#98 | `6e3b7bf` / #98 | **17.11** | ceiling was expected to dip this toward 11–14. **It did not.** |

`docs/baselines.json` `drift.franchiseTagsPerSeason`: target **14**,
tol **4**, nfl **10**. Note: do not retune tag rules toward the band.
AGENTS.md (Wave 3.9 Packet 2 ratification) already lists
`franchiseTagsPerSeason` 16.62 as a finding, not a retune
(Claude lane / leak-or-behaviour). This packet closes that question
as a **read**.

17.11 / 31 CPU clubs = **55%** of CPU clubs tag each year (user club
is never auto-tagged in a headless run). NFL ~10 / 32 = **31%**.
Ratio **1.71×**. 17.11 is 3.11 above the band centre and 0.89 under
the signed ceiling.

---

## 3. How a tag is produced

Window: `offseason-recap` → `offseason-tag` → FA.
`advanceOffseason` on recap runs `runRecap` then
`runCpuFranchiseTags` (`lib/core/offseason/index.ts`). Tags are
written with `season: state.season` (the year that just finished).
Calendar increment happens later, in `finalizeOffseason`
(`state.season += 1`).

`applyFranchiseTag` (`lib/core/offseason/contracts.ts`):

- one exclusive tag per club per year
- only a player with `yearsRemaining === 1`
- at most three consecutive tags on the same player at this club
- tender is the published CBA shape (`franchiseTagSalary`): first =
  max(position top-five snapshot, 120% of last hit); n2 = 120% of
  the first tender; n3 = max(144% of n2, that year’s QB tender)
- must fit remaining cap (Sign-shaped block)
- `expireContracts` skips anyone in `state.franchiseTags` for this
  season, so a tagged man stays on the 53 and can be tagged again
  next year

CPU path `runCpuFranchiseTags` (same file; child stream
`featureChildRng(state, "franchiseTags")`, parent untouched):

1. Skip the user club.
2. Skip rebuild (`teamOutlook` contend / retool / rebuild).
3. Rank that club’s expiring players by `evaluate()` × `POSITION_VALUE`.
4. Walk the list. `continue` (next player, **same club**) when:
   - already three consecutive tags on him
   - tender > `MAX_CONTRACT_SHARE` (22%) of the cap — Wave 4.0 Packet 2, Matt SIGNED
   - next-season committed + tender > ~90% of the cap
   - `evaluate()` surplus ≤ tender in trade units (`tender / cap * 340`)
5. First player who passes is tagged; `break`.

Comment on the function says “Priced, not automatic.” Empirically,
for contend / retool clubs, it is close to automatic. That is
behaviour of the signed gates, not a second writer.

July-15 extensions write `state.tagExtensions`, **not**
`state.franchiseTags`. Fifth-year options are a third array. Neither
enters the drift tag count.

Housekeeping does not prune `franchiseTags`. Old-season rows stay.
That is fine: the harness filters by season.

---

## 4. How 17.1 is measured

`scripts/drift.ts`, one snapshot per simulated year, **after** the
full offseason has run (tag window included) and the calendar has
rolled:

```
const season = st.season;          // year that is about to close
// … play regular + playoffs, stop at offseason-recap …
// … advanceOffseason until !isOffseason (tags apply on recap→tag) …
franchiseTags: (st.franchiseTags ?? []).filter((t) => t.season === season).length
```

Then `drift.franchiseTagsPerSeason` = mean of those per-season
counts across the panel.

This is the same class as a mechanical counter, not a log scan.
`measurement_traps` §8 / `trimLog` deleted `Trade:` rows and made
`tradesPerSeason` read 7.8 instead of ~65. Tags never used the log.
People-layer volume (`hcFires` / holdouts / …) uses
`seasonCounters.*Last` because those live fields **reset** at
rollover. Tag rows do not reset; they are historical records keyed
by `season`. Filtering by the captured season after rollover is the
correct analogue.

Checked leak candidates and discarded:

| candidate | result |
|---|---|
| Log / `trimLog` scan | Not used. |
| Wrong season after `state.season += 1` | Tags are stamped with the pre-increment season; filter uses the captured pre-increment season. Match. |
| Counting last year twice | Each row has one `season`. Additive `totalRecords` in the probe (20 → 41 → 60 → 74) is history, not a double count. |
| Counting tag extensions as tags | Extensions live on `tagExtensions`. |
| Counting the user club | User is skipped. Headless count is CPU-only. |
| Calling `runCpuFranchiseTags` twice | Only from the recap `advanceOffseason` step. |
| Two tags per club | `clubHasFranchiseTag` + `applyFranchiseTag` refuse a second. Max 31 CPU. Observed ~14–21. |

The 17.1 numerator is the number of exclusive tags the CPU actually
applied.

---

## 5. Why the 22% ceiling did not dip volume

`docs/diag-capbust-tags-2026-09-15.md` predicted
`franchiseTagsPerSeason` would fall from 16.6 toward **11–14** once
CPU tenders above 22% were skipped. Panel: **17.27 → 17.11**.

The prediction assumed a blocked club tags nobody and falls through
to `cpuResign` / the market. The code does not do that. The ceiling
is a `continue` **inside the player loop**:

```
if (tender > MAX_CONTRACT_SHARE * teamCap(...).cap) continue;
```

The club then tags the next cheaper expiring player who passes
surplus / headroom.

Directional probe (this VM, seed 12345, 4 drift-shaped seasons,
~132 s; **not** a lock-grade panel):

| season | actual tags | rebuild CPU | first-pick ceiling blocks | of those, still tagged someone |
|---|---:|---:|---:|---:|
| 2026 | 20 | 11 | 0 | 0 |
| 2027 | 21 | 9 | 0 | 0 |
| 2028 | 19 | 7 | 3 | 2 |
| 2029 | 14 | 8 | 5 | 4 |
| **total** | **74** | — | **8** | **6** |

75% of ceiling-blocked clubs still tagged. Early years have no
ceiling hits (first tags sit at ~7–18% of the cap). Later years
grow n2 QB tenders into the 19–22% band; those are the ones the
ceiling can catch — and then the club tags an EDGE / WR / etc.
instead. Removing ~0.5 n3-QB tags per year (the cap-bust family)
without stopping the club predicts a ~0.2 drop. That is what the
panel did.

The ceiling did its signed job: `capBustSeasons` 3.40 → **0.00**,
`topCapPctMean` 23.31 → **20.28**. Volume was never the thing it
removed.

---

## 6. Composition (same 4-season probe)

Authority for the **rate** remains the Studio 17.11. This table is
who gets tagged, so the rate can be read.

74 tags, user = 0, mean **18.5** (20 / 21 / 19 / 14) — same family
as the 17.x panels, noisier because n=4.

| consecutive | n | share |
|---|---:|---:|
| n1 | 55 | 74% |
| n2 | 19 | 26% |
| n3 | 0 | 0% in four years (n3 needs three straight windows) |

| pos | n | share |
|---|---:|---:|
| QB | 18 | 24% |
| EDGE | 16 | 22% |
| WR / CB | 8 / 8 | 11% each |
| OT / OG / DT | 7 / 6 / 5 | 9 / 8 / 7% |
| RB, TE, S, K, P | 2 + 1 + 1 + 1 + 1 | remainder |

Mean tagged OVR ~82. Mean tender ~10–12% of the cap. The 22%
ceiling almost never sees a first tag.

Year-0 generate (no regular season, same seed) is even hotter: dry-run
**23 / 31** CPU clubs would tag (9 contend / 16 retool / 6 rebuild;
2 surplus-fail-all). Actual apply from recap: **25** tags, all n1,
8 of them QBs, mean hit 11.3% of cap. After one played season that
falls to 20. A 20-season mean of 17.11 is compatible with a high
early-year and a later ceiling-years dip that fall-through keeps
from collapsing.

Tells that the price test is not “franchise-tag worthy”:

- 2028 LV **K** 79 OVR at **1.8%** of the cap
- 2029 SD **P** 86 OVR at **2.2%** of the cap
- 2026 generate path: 69-OVR QB at 17.1% of the cap

A kicker clears `surplusExceedsTender` because the tender is tiny.
`POSITION_VALUE.K = 0.35`, replacement is 58, so a 79 K is
`21 × 0.35 ≈ 7.4` evaluate units; 1.8% of cap × 340 ≈ 6.1. The
inequality passes. Real clubs almost never spend the exclusive tag
on K/P. The test is doing the arithmetic it was written to do; it
is not selecting a tag-worthy player.

QB still leaks in the other direction, as the cap-bust diagnosis
said: `POSITION_VALUE.QB = 3.4`, so an ordinary starter’s surplus
beats a 17–20% tender. The ceiling now stops the ones that would
have gone to 25–28%. It does not stop the first tag at ~17%.

---

## 7. Comparisons the docs already made

- `nfl-reference.md` §4: exclusive tag, one per club, published
  escalators, CPU 22% ceiling, rebuild does not tag, **~10 a year**.
  The ~10 note has no dataset / URL computation block (invariant 7
  is soft here). Treat it as the signed `nfl:` field, not a new
  research claim. This census does not re-source it.
- Band 14±4 was locked on the Wave 3.7 **14.0** panel, with the
  explicit instruction not to retune rules toward the band. Later
  16.6–17.3 readings are inside that window. ROADMAP.md still shows
  the Wave 3.7 14.0 / 8–16 row; that row is stale versus the 17.11
  authority, not a second measurement.
- Rise 14.0 → 16.6 happened between `2752729` and `748036a` while
  `contracts.ts` also gained void years / cap carryover (#84) and
  people-layer teeth (#82). The **emit math did not change**. This
  census does not pin that +2.6 on one commit; it only notes the
  count stayed a real apply-count across the rise.
- Wave 3.9 leftover text that 16.62 “remains above the signed 14±4
  band” was **wrong** (ceiling is 18). Wave 4.0 Packet 1 already
  corrected it.

---

## 8. Recommended next step (sign-off class — do not do it here)

Do **not** move `docs/baselines.json`. Do **not** retune
`franchiseTagSalary`, escalators, `MAX_CONTRACT_SHARE`,
`POSITION_VALUE`, or `evaluate()`.

If Matt wants volume nearer the NFL ~10 note, the honest levers are
design rules, not a tighter band:

1. **No fall-through.** When the first-ranked expiring player fails
   the 22% ceiling, skip the club (`continue` the team loop, not the
   player loop). That is the behaviour the 11–14 prediction assumed.
   Predicted effect: later-year n2/n3 QB windows stop substituting
   an EDGE/WR/K; volume should finally move. Measure, do not aim.
2. **A tag-worthiness floor** (example: do not tag K/P, or require
   surplus to clear a multiple of the tender, or require starter-tier
   OVR). Same escalate class as the original surplus leak. Needs a
   source or an explicit gameplay sign.
3. **Optional hygiene, not a fix:** a `seasonCounters.franchiseTags`
   / `…Last` pair would match trades / people. The current
   filter-by-season already reads the closed year correctly. Do not
   add it to “fix” 17.1.

What I would not do: widen the 14±4 band, lower its centre to 17,
cap tags at two by fiat, or chase 10 by shrinking tenders.

---

## 9. Untouched

Engine, `runCpuFranchiseTags`, `franchiseTagSalary`,
`applyFranchiseTag`, escalators, `MAX_CONTRACT_SHARE`,
`POSITION_VALUE`, `evaluate()`, `scripts/drift.ts`,
`docs/baselines.json`, `docs/HANDOFF.md`, `docs/nfl-reference.md`.
No gate run (docs-only; no behaviour change).
