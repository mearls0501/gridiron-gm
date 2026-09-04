# Gridiron GM — Orchestration (parallel agents)

Read with `ROADMAP.md`. Any agent dispatching or receiving packets in this repo follows this file.

You are the orchestrator for a team of coding agents working the Gridiron GM repo
(live code in `v2/`). Your job is to hand out
non-overlapping packets, keep the gate green on `main`, and escalate the decisions
that are Matt's. You do not tune the engine yourself.

Read in this order before dispatching anything: `v2/AGENTS.md` (the contract),
`v2/docs/HANDOFF.md` (top 300 lines — the newest packets), `v2/docs/ROADMAP.md`,
and `v2/docs/nfl-reference.md` when a packet touches a calibrated number.

---

## 1. The five invariants (a worker that breaks one fails review even if the gate is green)

1. **Seeded RNG only.** Nothing outside `lib/core/rng.ts` calls `Math.random()`,
   `Date.now()`, `new Date()`, `performance.now()`. `npm run determinism` enforces it.
2. **The box score IS the score.** Points only come from a scoring play that also
   writes the player stats.
3. **The depth chart drives the simulation.** Never pick players by sorting on OVR.
4. **One array of players.** No parallel collection for any subset (prospects, retired,
   PS, IR are all flags on `state.players`).
5. **No backend, no runtime LLM, no new dependencies.** `package.json` deps do not change.

## 2. Hard rules for every worker (put these verbatim in every packet)

- `scripts/` and `docs/baselines.json` are **read-only**. Do not edit, do not "fix" a
  harness, do not move a baseline. If you believe a baseline is wrong, write it up in
  your HANDOFF note and stop.
- Never delete, weaken, or comment out an assertion. Never reduce `verify`'s check count.
- `npm run gate` (~40s) after every edit. `npm run gate:full` before you open a PR.
  A **missing** metric is a failure, not a skip.
- **Three strikes and stop.** If the gate is not green after three attempts, stop and
  report: what you changed, what the gate said each time, what you now think is wrong.
  An honest dead end beats a hack that goes green.
- Diagnose before you edit. Do not refactor. Make the one change.
- Check `v2/docs/` for existing research before commissioning your own.
- Anything red that is not in the AGENTS.md known-open table is a regression **you**
  caused. Two inherited single-seed reds are expected on the fast tier and are not
  yours: `leverage.wrongSign 1` and `statcheck.wr10RecYds 1018`. Leave them.

## 3. The PRNG stream rule (this is the one parallel agents get wrong)

Every sim metric baseline is pinned to a PRNG stream position. Any change that draws
randomness in a new place, or reorders existing draws, moves the stream — and every
downstream metric reshuffles, which looks like "I broke rushing yards" when you added a
coaching carousel.

- **Pure display / read-only features consume zero RNG.** Prove it: gate metrics are
  byte-identical to `main` before and after.
- **New features that need randomness draw from a forked child stream** keyed by
  `(seed, season, week, featureName)` — never the week's parent stream. Precedent:
  `irFill.ts` runs CPU IR replacements on a child stream "so the week's parent stream
  cannot move." Copy that pattern.
- If a packet **must** move the parent stream (an engine change), it is a lead packet,
  it runs the 5-seed panel, and it is merged alone with nothing else in flight.

## 4. Module ownership — one lane, one file cluster, no overlap

Assign each agent exactly one lane. Two agents never edit the same file. The files
below are the boundaries; a worker that needs a file outside its lane stops and asks.

| Lane | Owns | Does NOT touch |
|---|---|---|
| **A — Game viewer / play-by-play** | new `lib/core/sim/events.ts` (event emitter), `app/game/[id]/page.tsx`, `app/play/page.tsx`, `lib/core/liveGame.ts`, `lib/view/*` for game presentation | `sim/game.ts` beyond inserting emit hooks that change no outcome; zero RNG draws |
| **B — Contract office** | `lib/core/offseason/contracts.ts`, `app/finances/page.tsx`, `Contract` fields in `types.ts` (additive, optional), `askingPrice`/`negotiatedApy` onto the club belief | `draft.ts`, `freeAgency.ts`, `frontOffice.ts` |
| **C — Draft published rules** | `lib/core/offseason/draft.ts` (rookie slot scale, compensatory picks), `pickOwners` for comp picks in `trades.ts` only where picks are created | `contracts.ts`, `scouting.ts`, `cpuBoardValue` / `POSITION_VALUE` |
| **D — People (coaches, owner)** | new `lib/core/coaches.ts`, new `lib/core/owner.ts`, new `app/staff/page.tsx`, `Team.coach`/`Team.owner` fields (additive), `effectiveCoach` in `callSheet.ts` | `staff.ts` (the budget system — different thing despite the name), `frontOffice.ts` archetype dials, `sim/game.ts` |
| **E — History & identity** | new `lib/core/hallOfFame.ts`, new `app/history/page.tsx`, `app/records/page.tsx`, `app/league/page.tsx` history section | anything that writes `state.history` (`recordSeasonHistory`) |
| **F — Player psychology** | new `lib/core/psychology.ts` (contract-year, holdouts, trade requests), hooks in `briefing.ts` | `contracts.ts` (lane B) — raise a request, do not edit; `freeAgency.ts` |

**Shared hotspots, with rules:**

- `lib/core/types.ts` — additive optional fields only; one small commit per lane; rebase
  on `main` before PR. Never rename or retype an existing field.
- `lib/store/save.ts` migrations — every new field must load on an old save. Add a
  default in the migration, test with an exported pre-change save.
- `lib/core/offseason/index.ts` (phase advance) and `components/Shell.tsx` (nav) — the
  orchestrator owns these. Workers describe the hook they need in their PR; you wire it
  at integration.
- `v2/docs/HANDOFF.md` — every packet **prepends** its own dated section under the
  header. Resolve merge conflicts by keeping both sections. Never edit another packet's
  section.

## 5. Packet template (send this to each worker)

```
PACKET: <lane letter> — <one-line title>
BASE: main @ <sha>          (pin the SHA; every wave starts from the same commit)
BRANCH: <agent>/<lane>-<slug>

READ FIRST: v2/AGENTS.md in full; v2/docs/HANDOFF.md top 300 lines;
            v2/docs/nfl-reference.md §<n> if a calibrated number is involved.

GOAL: <what exists when you are done, from the user's side of the screen>

YOU OWN: <exact file list>
DO NOT TOUCH: <exact file list from the lane table> + scripts/ + docs/baselines.json
RNG: <"zero draws — prove metrics byte-identical" | "child stream keyed (seed, season, week, '<feature>')">

ACCEPTANCE:
  - npm run gate green (the two inherited reds excepted)
  - npm run determinism clean
  - a unit test in lib/core/<feature>.test.ts wired into the `test` script chain
  - old save loads (export one from main first, import after)
  - browser evidence: one described walkthrough on the affected page(s)

DELIVER: PR against main. HANDOFF.md section with: Diagnosis / Change / Leftover /
         Untouched / Gate output (paste it) / Browser evidence.

STOP CONDITIONS: three red gates; needing a file outside YOU OWN; discovering the
change must move the parent PRNG stream; any temptation to touch a baseline.
Stop cleanly, write the handoff, report.
```

## 6. Integration — what you do, in order, per wave

1. Pin a base SHA. All packets in the wave branch from it.
2. Dispatch lanes. Do not dispatch two packets into the same lane in one wave.
3. As PRs land: rebase each on current `main`, run `npm run gate`, merge **one at a
   time**, run `gate` again after each merge. Never batch-merge.
4. After the wave: `npm run gate:full` on `main`. If a metric moved, bisect by lane —
   the lane that moved it either consumed parent RNG or touched an outcome; bounce it.
5. Run `npm run test` and both browser suites (`node scripts/e2e.mjs`,
   `scripts/e2e-interact.mjs`) on `main` after every wave.
6. Write one wave summary to HANDOFF.md: what merged, what bounced, what moved.

## 7. Escalate to Matt — never decide these yourself

- Any change to `docs/baselines.json` or what a guard measures.
- Any engine change that moves the parent PRNG stream.
- Retiring or rewriting a known-open row in AGENTS.md.
- Design dials with no primary source (the `CONTENDER_PULL` / `GUARANTEE_PULL` class).
- Owner patience / firing thresholds, holdout triggers, coach contract values — these
  are gameplay choices, ship them behind a proposed default and flag them.

## 8. Wave 1 recommendation

Run **A, B, C, E** in parallel — they are fully disjoint and three of the four consume
zero RNG. Hold **D** and **F** for wave 2: both add fields to `Team`/`Player` and both
need offseason phase hooks that you wire, so they go after the wave-1 `types.ts`
changes are on `main`. Before wave 1 starts, run the five-seed panel re-lock yourself
(`npm run gate:full -- --seeds 5`) and re-measure `drift.tradesPerSeason` so every
worker is comparing against a current `main`, not a stale table.
