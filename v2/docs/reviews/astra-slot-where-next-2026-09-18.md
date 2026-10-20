# Astra-slot strategy review: where next (2026-09-18)

> Filename note: this review is filed under the "Astra-slot" strategy-review
> slot name. There is no Astra model in the cloud agent fleet, so this was
> written model-agnostically against the repo state itself — every claim below
> cites a SHA, PR, file, or panel number a reviewer can check without knowing
> which model held the pen.
>
> Lens: product/design. Not a calibration review. The question throughout is
> "what does the player see and feel," not "what does the guard read."
> Constraints observed: no baseline edit without Matt sign; report-not-tune
> for tags; docs-only, no engine claims I did not measure.

Base: `main @ db7f871` (#103). Sources: `v2/AGENTS.md`, `v2/docs/ORCHESTRATION.md`,
`v2/docs/ROADMAP.md`, `v2/docs/HANDOFF.md` (top: Wave 4.0 post-#97/#98 panel),
PRs #96–#103, PR #100 (DRAFT).

## 1. Where we stand

- **Wave 3.9 Phase 4 (history & identity) is done and merged.** HOF as a league induction event (#95), jersey numbers + retired numbers (#93), and the second scene / Darnold path (#94) all landed, with additive-only `careers.*` emits and no baseline moves. The franchise half finally has identity objects; none of them are tuned yet.
- **Wave 4 Packets 1–4 + 6 have landed; Packet 5 is the lone open item.** Packet 1 panel docs (#96), Packet 2 CPU tag-tender ceiling — Matt SIGNED (#97), Packet 3 people-layer season counters (#98), Packet 4 per-prospect film/pro-day caps 2/1/1/1 — Matt SIGNED (#99/#102), Packet 6 +2 probe report-only (#101). Packet 5 (risk-grade teeth) is DRAFT #100, awaiting effect-size sign — and it is the only Wave 4 packet that moves the parent PRNG stream (weekly injury draw goes per-player child `(seed, season, week, "medical", playerId)`; later weeks diverge, year-0 `calibrate`/`statcheck`/`careers` reshuffle by its own PR body).
- **The post-tag panel @ `6e3b7bf` (#103) says Packet 2 worked structurally.** `drift.capBustSeasons` 3.40 → **0.00** (GATE FAIL 7, not 8 — the eighth tick cleared). `drift.topCapPctMean` 23.31 → **20.28** (20.52/19.94/19.86/20.08/21.03). The proposed first band **20.3 ±3** (17.3–23.3, `nfl` note 18–20) is a PROPOSAL only — sign widget skipped, `docs/baselines.json` untouched.
- **Tags did not dip and that is a report, not a failure.** `drift.franchiseTagsPerSeason` **17.11** vs Packet 1's 17.27 — still inside the signed 14±4 band (ceiling 18), still above real NFL ~10. The expected dip toward 11–14 never arrived. Per the packet's own leftover line and the no-baseline-without-sign rule, this stays report-only; nobody retunes tag rules toward the band.
- **People counters are live and mostly first reads.** Packet 3 writes at event sites (`fireCpuHeadCoaches`, `fileDemand`, `sitHoldouts`, rolled at `rolloverTradeCounter`): HC fires **0.00** — a FINDING against the signed 6–8/yr expect, diagnosed as write-site not dials; holdouts **10.22** (inside single-digits–12 expect); trade requests **48.8** and holdout games missed **37.09** (no expect, no band — record only). `psychology.fixture.*` renames closed the fixture-emit trap.
- **The second scene fires; nobody becomes a star.** `careers.secondSceneStarPct` **0.0** across panels vs `nfl-reference.md` §2.7 ref **11.4%** (report only, no band). Eligibility/fired reads exist (Packet 1: eligible 2.64%, fired 8.47%; tag-ceiling reshuffle moved fired to 21.43 on one careers-24 seed) — so the window opens, but the star outcome never lands. That is a product-spec question (what counts as a star, and does the opportunity mechanism ever grant one), not an engine knob.
- **The next slice is already specced and half-built: text PBP/recaps from the event log, zero RNG, display-only.** ROADMAP Phase 1 ("make the engine visible") is next after Wave 4 closes, and the seams exist: `v2/lib/core/sim/events.ts` (`emitPlay`/`onPlayEvent`, documented observation-only, "callers must never draw RNG here"), the renderer at `v2/lib/view/playByPlay.ts` (+ test), consumers at `v2/app/game/[id]/page.tsx` and `v2/app/play/page.tsx`, and `v2/lib/core/liveGame.ts` (94 lines, still re-sims from a snapshot per peek — the thing Lane A exists to kill). ORCHESTRATION Lane A owns exactly this cluster with a byte-identical-gate acceptance.
- **Save weight and trade volume are non-issues at this altitude.** `saveMbAtEnd` 12.43 / growth 0.48 sit inside the #91 locks (15.89 / 0.61); `tradesPerSeason` 78.67 is a record read, not a defect. Nothing here should pull design attention off the visible game.

## 2. Top 3 next moves, ranked

### #1 — Close Wave 4 cleanly before opening anything (sign + solo panel, no new work)

Two signatures and one panel stand between `main` and a clean Wave 4 close,
and all three are Matt-or-Studio actions, not worker invention:

1. **Matt signs or parks the `topCapPctMean` 20.3±3 band** (#103 proposal). Until then it is prose in a HANDOFF note — quotable, lockable by nobody. A later Lead packet locks it the way Wave 3.9 Packet 2 locked save/moved `statcheck`.
2. **Matt signs or revises the Packet 5 effect sizes** (`MEDICAL_HAZARD` 1.00/1.08/1.20/1.40 post-clamp; `CHARACTER_HOLDOUT` 1.00/1.10/1.35/1.70; `CHARACTER_DEMAND` 1.00/1.05/1.20/1.35). These are gameplay dials with no primary source — Brophy 2008 in §4 is career *length* by combine orthopedic grade, cited as context only, not a weekly-hazard series — so there is nothing to "verify," only a design taste to approve.
3. **Packet 5 merges solo, then the Studio 5-seed `gate:full:serial` panel runs.** Its own PR body concedes the parent stream moves. It must not share a merge window with anything else, and the +2 probe's owed lock-grade panel (Studio 14-season × seeds 12345/1/2, per `v2/docs/plus2-probe-2026-09-16.md`) should run before any further stream-moving work stacks up behind it — otherwise the next bisect has two suspects.

Why this is #1: every move below assumes a known-good `main`. An unsigned band plus an unpaneled stream move is how the repo previously bought weeks of tuning toward fiction (AGENTS.md invariant 7 exists for exactly this).

### #2 — Ship the visible game: text PBP + drive log + recaps off the existing event log (Lane A)

ROADMAP calls this "highest-leverage item in the project once the panel is green," and from the product side the reasoning is blunt: **every calibrated hour so far buys realism the player cannot perceive.** The game page is a scoring summary with no drive log; `/play` never shows the result of the snap just called. The fix is display-only by construction:

- Render from the `PlayEvent` log `simulateGame` already writes — `events.ts` helpers (`isOffensiveSnap`, `lastCalledSnap`) plus `lib/view/playByPlay.ts` — into a drive chart + text PBP on `/game/[id]` and a called-snap result on `/play`.
- Kill the `liveGame.ts` snapshot re-sim per peek without touching `sim/game.ts` outcomes (Lane A boundary: emit hooks only, zero RNG draws).
- Acceptance is the strongest in the repo: gate metrics **byte-identical** to `main`, `npm run determinism` clean, old save loads, one browser walkthrough per affected page.

Ranked above all people/contract work because it converts sunk calibration into felt value with zero stream risk — the only packet class that cannot move a panel number. Sequence it first so the disagreement in §4 has somewhere to land: consequences need a surface before they need teeth.

### #3 — Surface the people layer before deepening it (diagnosis + UI, no dial tuning)

Wave 4 built the counters; the player still cannot see what they count. Concretely:

- **HC fires 0 vs 6–8/yr is a write-site investigation**, per the panel note — `fireCpuHeadCoaches` is live, the read is zero. Diagnose where the write site misses (firing path vs counter path) before anyone proposes a rate. Do not tune a dial toward 6–8.
- **Holdouts (10.22/yr), trade requests (48.8/yr), and games missed (37.09/yr) have no player-facing surface named anywhere.** If 49 trade requests a season resolve off-screen, doubling or halving the rate changes nothing the GM feels. The design task is inbox/briefing/player-page surfacing with the existing counts, not new psychology knobs.
- **Second-scene star 0 vs 11.4% needs a spec, not a tune.** The window fires (see §1); stardom never does. Decide what a "star" outcome means as a product (stat threshold? starts? second contract?) and whether the opportunity mechanism can ever grant it — then, and only then, a `careers` band from Matt.

This is deliberately *not* "start Phase 2 coaches/owners" or "start Phase 3 contract office." Both add `Team`/`Player` fields plus offseason hooks that ORCHESTRATION deliberately sequenced after the display work. Surfacing-first keeps every packet in the zero-RNG class while the panels in move #1 run.

## 3. What NOT to do

- **Do not edit `docs/baselines.json` or `scripts/` emit math** on any of this — the topCap band is unsigned, the Packet 5 emits (`careers.medicalMajorGamesMissedRatio`, `psychology.holdoutsByCharacter`) are explicitly band-less, and the +2 panel is explicitly lock-grade later.
- **Do not retune tag rules toward 14±4 or NFL ~10.** 17.11 is inside the signed band. The CPU-ceiling rule is sourced (Prescott 2021 20.7% as the largest real tender; no club tags above market ceiling — it extends or walks). Report the reads.
- **Do not merge #100 without the effect-size sign *and* the solo panel.** It is the one Wave 4 packet that is not byte-identical by design. Forcing it into a shared window repeats the multi-suspect merge pattern §6 of ORCHESTRATION exists to prevent.
- **Do not chase `statcheck.wr10RecYds` panel/single-seed noise, the `tails.milestonesOff` aggregate (22.60, KNOWN-HIGH), or `p0Failures` 0.40 beyond reporting.** All three are called out by name in the panel notes as noise/known-high/finding. Tuning toward them is the exact failure invariant 7 documents.
- **Do not "fix" secondSceneStar 0 with engine knobs** (opportunity rates, progression slopes, K-table). With no band and no star-spec, any knob that moves 0 → 11.4% is untestable taste wearing a lab coat.
- **Do not invent an HC fire rate with dial tuning.** Zero against 6–8 with a live counter is a missing-write investigation, and the panel note says so verbatim.
- **Do not draw RNG anywhere in the PBP/recap slice.** Child-stream rule (ORCHESTRATION §3): pure display consumes zero draws, proven by byte-identical metrics. A "tiny jitter for variety" in prose selection is a parent-stream move with a costume on.
- **Do not merge PR #9 or #63, do not reopen the solved scouting line** (audit closed 2026-09-15: information ceiling +0.1 true points/slot, inside seed noise), and do not touch `METHOD_PER_PROSPECT` 2/1/1/1, `POSITION_VALUE`/`cpuBoardValue`, `CONTENDER_PULL`/`GUARANTEE_PULL`, or `CARRY_SHARE` — all signed or exonerated, all named as untouched in every Wave 4 packet body.

## 4. One sharp disagreement: risk teeth before surfacing ships an invisible tax on a stream move

I would not land Packet 5's hazard multipliers as the next merge even after sign — I would land the *surfacing* half first and hold the multipliers until the PBP/recap surface in move #2 exists.

The product case: a 1.08×–1.40× weekly soft-tissue multiplier and a 1.10×–1.70× holdout multiplier are, to the player, **indistinguishable from noise**. No screen today tells the GM "this prospect carried a major medical flag in April, missed 4 extra games in October, and that is why your season ended" — because the April flag lives in the war room and the October games live nowhere the player reads. The packet's own honesty proves the point: its measurement is two lead-additive harness emits, not a single player-visible sentence. We would be spending the scarcest currency in this repo — a parent-stream move that reshuffles `calibrate`/`statcheck`/`careers` year-0 and burns the fresh post-#97/#98 panel as a baseline — to buy consequences the player can never attribute.

The design risk compounds: unattributable punishment reads as cruelty, not strategy. A major-medical prospect who washes out without a story teaches the GM nothing except "drafting is random"; the same outcome narrated through a recap line ("missed 5 games — soft tissue, same flag from his combine medical") teaches "the flag was real, price it." The audit that closed the solved line established that information advantage in this game is worth ~+0.1 true points per slot — small, honest, *felt*. Untraced weekly-hazard dials with no surfacing invert that: large, unproven, unfelt.

Concrete counter-proposal, kept inside the packet's file cluster: split #100 into (a) a display-only slice that carries `medicalRisk`/`characterRisk` grades into recaps, the player page, and the draft board's already-capped intel UI — zero RNG, byte-identical, mergeable tomorrow — and (b) the hazard multipliers, signed against a *career-length* target actually traceable to Brophy (games/seasons, not weekly chance) after the Studio panel in move #1. If the multipliers cannot survive contact with a traced target and a surface that makes them legible, that is the finding — and findings, in this repo's contract, are something you report, not something you tune past.
