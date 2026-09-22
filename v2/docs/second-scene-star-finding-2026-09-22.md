# Second-scene star finding — 2026-09-22

Wave 4.1 Claude lane A. **Docs / FINDING only.** No engine, `scripts/`,
or `baselines.json` edits. Report-never-tune until Matt picks a mechanism.

Lock candidate (report-only, no band): `careers.secondSceneStarPct` vs
`nfl-reference.md` §2.7 **11.4%** (4 of 35 QBs). Studio panels read
**0.0** while `secondSceneEligiblePct` / `secondSceneFiredPct` are
non-zero (Wave 4.0 Packet 1 panel: eligible **2.64**, fired **8.47**,
star **0.0**; post-#97/#98 panel: star still **0.0**).

---

## Verdict

Star% is stuck at 0 because the harness **star** label is not the §2.7
event, and the shipped mechanism (ceiling redraw toward `pot`) almost
never produces that harness label after a fire.

Two stacked causes, both evidenced:

1. **Definition mismatch (primary).** §2.7 counts a later **top-ten
   passer-rating** season among qualifying starters (~10/32 ≈ 31%).
   `careers.secondSceneStarPct` counts a later **`outcomes` star year**
   — top `starRank(QB)=5` by **OVR** among QBs who recorded snaps
   (~Pro Bowl stand-in, ~15% of 32 jobs). Same English word ("star"),
   different bar and different metric. Locking 0 against 11.4 is
   comparing incompatible rates.

2. **Mechanism cannot clear that OVR bar for typical fires.** The draw
   only raises `ceiling` toward immutable `pot`. Growth toward the new
   ceiling runs only while `age < peakAge` inside `developPlayer`, but
   the fire gate allows age through `peakAge + 1`. Fires at/near peak
   spend the lift on the **decline** path (which ignores room to
   ceiling). Even with runway, signed `K=0.45` yields small lifts
   (~gap×0.45), and near-peak `growthRate` is ~0.13 of remaining room
   per year — far short of climbing into the top-5 OVR band (local
   probe: mature QB star seasons sit **min 82 / median 88 / max 93**).

Eligible/fired > 0 is expected: those metrics stop at "bad season +
bust gap" and "six-gate draw ran." They do not require a later star
year. Owners seeding (#111) is **not** the smoking gun — fires already
happen, so coach/scheme opportunity inputs can pass.

---

## What the harness counts

From `scripts/careers.ts` (QB mature careers only):

| emit | numerator / denominator |
|---|---|
| `secondSceneEligiblePct` | bad starting season (bottom-third starter year) **and** (`pot−ceiling ≥ 6` **or** already fired) / mature QBs |
| `secondSceneFiredPct` | `player.secondScene` set / eligible |
| `secondSceneStarPct` | later career season with `snapshot.star` **and** `season > secondScene.season` / fired |

`snapshot.star` (`lib/core/outcomes.ts`): rank by OVR among same-position
players who played snaps that season is `≤ starRank(pos)`. For QB,
`starRank = max(4, round(STARTERS.QB × 32 × 0.15)) = 5`.

§2.7 Path 2 (nflverse, written before any baseline): population = QBs
with a bottom-third PR/EPA starting season in years 1–3; event = later
season in career years **4–8** with a **top-ten passer-rating** finish
at a **different** primary club → **4/35 = 11.4%**.

---

## Six-gate fire path (`maybeApplySecondScene`)

All must hold (Packet 5 / Matt-SIGNED dials 1–8). Returns true → flag +
ceiling lift on a child stream; `pot` never moves.

1. Not already fired / not retired / not prospect / on a roster.
2. Bust gap: `pot − ceiling ≥ BUST_GAP` (6).
3. Age: `age ≤ peakAge + 1`.
4. Depth-chart QB1 (or pos starter) on current club.
5. Opportunity: current-season snaps ≥ `OPPORTUNITY_SNAPS` (500).
6. First season at this club.
7. A prior bad starting season **on another club**.
8. `sceneImproved`: scheme-fit delta ≥ `SCENE_FIT_DELTA` (0.25) **or**
   OC `development` ≥ old + `SCENE_COACH_DELTA` (15).

Then: `lift = clamp(normal(gap×K, gap×0.25), 0, gap)` with `K.QB=0.45`.
Hook: `applySecondScenes` at the top of `runProgression`, **before**
`age += 1` and `developPlayer`.

Eligible in the harness is only gates **bad season + bust gap** (plus
"already fired" so post-lift closed gaps still count). Fired needs the
full path. Star needs a later Pro Bowl–OVR season.

---

## Evidence

### Studio panels (already on `main` / HANDOFF)

- Wave 4.0 Packet 1 @ `625fd06`: eligible **2.64**, fired **8.47**,
  star **0.0**.
- Post-#97/#98 @ `6e3b7bf`: star still **0.0**; `r1BustPct` did not
  drop >1 pt (no K retune trigger).

### Local probe (2026-09-22, seed 12345, not a panel)

Careers-shaped runs (ephemeral `/tmp` probes, not committed):

**20 seasons — star OVR bar.** Mature QB star-season OVRs: **n=33,
min=82, p10=83, median=88, p90=91, max=93**. Top-5 OVR is an 80s club,
not "merely good."

**24 seasons — every fired QB on the save.** Mature window: eligible
17, **fired 0**, star 0 (this seed’s mature QBs never fired; Studio
panels average fired > 0 across seeds). League-wide: **2** QBs with
`secondScene`, both pot **89**:

| player | round | fire age / peak | lift | years left to peak after +1 | max OVR after | later star? |
|---|---:|---:|---:|---:|---:|:---:|
| Grady Harris | 3 | 27 / 30 | 5.07 | **2** | 87 | **yes** |
| Mateo Martinez | 2 | **29 / 28** | 3.89 | **−2 (past peak)** | 82 (was 85 before) | **no** |

Harris is the rare success: high pot, fire before peak, runway, climbs
to 87 OVR and clears the harness star bar. Martinez is the structural
failure mode: gate allows fire at 29 with peak 28; lift applies;
decline consumes ability (`grewAfter=false`); no later star. Studio
`star%=0` with `fired%>0` is this failure mode dominating the mature
fired sample.

### Age gate vs growth runway (code + planted progression)

`runProgression` order: fire at age `F` → `age = F+1` →
`growing = age < peakAge`.

For `peakAge = 28`:

| fire age F | gate allows | age after +1 | `developPlayer` growing? | growth years left `peak−(F+1)` |
|---:|:---:|---:|:---:|---:|
| 24–26 | yes | 25–27 | yes | 3–1 |
| 27 | yes | 28 | **no** | **0** |
| 28–29 | yes | 29–30 | **no** | **0** |
| 30 | no | — | — | — |

Planted consistent-OVR progression (seed 41, peak 28, gap→lift ≈3.13):

- Fire 24–26: OVR **+1** in the fire offseason (uses new ceiling).
- Fire 27: **0** (lift applied; growth off).
- Fire 28–29: **−1 / −2** (decline path; ceiling room unused).

So the signed age window **permits fires that cannot spend the lift**.
The Darnold path (bad year → new club → starter snaps) burns calendar
years; fires cluster toward that dead zone.

### Why K-alone is the wrong first move

Mean lift ≈ `gap × 0.45`. Minimum bust gap 6 → mean lift ~2.7. A
player at OVR 73 with new ceiling ~78 still needs multiple growth
years at near-peak rates (~13% of remaining room) to approach pot, and
pot itself is often **below** median star OVR (88). Raising `K`
without addressing definition / runway / pot wall will not honestly
hit 11.4% on the current harness label — and Packet 5 already warned
not to pre-emptively retune K against `r1BustPct`.

### Hypotheses checked

| hypothesis | result |
|---|---|
| Star definition too strict vs §2.7 | **Confirmed** — top-5 OVR vs top-10 PR |
| Eligibility window never reaches star bar | **Partial** — fires occur; post-fire climb into top-5 OVR does not for panel mature sample |
| K / gap too small | **Contributing** — small lifts; not the only cause |
| Harness filter mismatch | **Confirmed** as label mismatch; mature filter is fine |
| Progression order | **Confirmed interaction** — age++ then decline ignores new ceiling |
| Missing coach/scheme after #111 owners | **Rejected** — fired already >0; owners are not on the fire path |

---

## What is NOT recommended

- Silent moves to `SECOND_SCENE_K`, `BUST_GAP`, `SCENE_*`, snap/age
  dials, or inventing a `baselines.json` band for
  `secondSceneStarPct`.
- Treating 0 vs 11.4 as a pure tuning miss on the current label.
- Blaming #111 owners seeding for star%=0.
- "Just raise K until Studio reads ~11%" — fights the wrong target and
  risks `r1BustPct`.

Report-never-tune until Matt picks a **mechanism** (or a measurement
realignment) below.

---

## Mechanism options (for Matt to sign later)

No recommended numbers on existing knobs unless noted as "justify
first."

1. **Measurement realign (preferred first conversation).** Redefine
   the lock emit to match §2.7: among fired (or among the §2.7-shaped
   population), rate of a later **top-ten production** season (passer
   rating / starter grade), not `outcomes.star`. Keep Pro Bowl OVR as a
   separate report line if useful. This may move the number without
   any dial change — measure before retuning.

2. **Grace growth after a scene.** One (or N) post-fire development
   year that still closes toward the new ceiling even if
   `age ≥ peakAge`, so late-but-legal fires are not pure decline.

3. **Tighten the fire age to match runway.** e.g. require
   `age ≤ peakAge − 2` so every fire has ≥1 growth year. Reduces fired
   rate; does not by itself create stars if pot is low.

4. **Stronger scene effect than ceiling-only.** Temporary scene floor,
   partial OVR realization, or a second draw that can move ability
   inside pot more aggressively in the new scheme — design change, not
   a quiet K bump.

5. **Separate late-emergence label.** Keep `outcomes.star` for Pro
   Bowls; add a Path-2-specific "scene success" flag graded like §2.7.
   Lock that rate to 11.4%; leave Pro Bowl OVR ungated for this path.

6. **K / gap revisit only after (1).** If the measurement matches §2.7
   and the rate is still far low/high, then consider dial work with an
   explicit `r1BustPct` guard — not before.

---

## Files read (no code changes)

- `lib/core/secondScene.ts`, `secondScene.test.ts`
- `lib/core/outcomes.ts` (`starRank`, `snapshot`)
- `lib/core/offseason/progression.ts` (`runProgression`, growth/decline)
- `scripts/careers.ts` emits
- `docs/nfl-reference.md` §2.7, `docs/HANDOFF.md` Packet 5 + panels

## Local commands run (ephemeral probes under `/tmp`, not committed)

- 20-season careers-shaped probe, seed 12345
- Planted `runProgression` age×peak matrix, seed 41
