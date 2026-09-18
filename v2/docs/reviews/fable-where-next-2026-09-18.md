# Fable — where next (2026-09-18)

Strategy review only. No engine change, no baseline change, no packet dispatched
from this file. Read against `main @ db7f871` (#103), the Wave 4.0 post-#97/#98
panel @ `6e3b7bf`, and PR #100 as drafted.

---

## 1. Where the game stands

- **The engine half is done and defended.** 22 harnesses, GATE FAIL 7 on the
  post-#97/#98 panel, and every one of the seven is a known residue
  (`p0Failures` 0.40, `milestonesOff` 22.60, `conditions.problems` /
  `staff.problems` 0.20s). There is no unexplained red. `capBustSeasons`
  cleared to **0.00 structurally** — the tag ceiling did exactly what its
  diagnosis promised — and `deadMoneyPct` 2.42 / `tradesPerSeason` 78.67 are
  records, not regressions.

- **Wave 4 is one packet from closed, and that packet is blocked on a
  signature, not on code.** Packets 1–4 + 6 are on `main`. Packet 5 (#100,
  risk-grade teeth) is drafted, correctly re-diagnosed the weekly injury draw
  as living on the *parent* stream (the audit write-up's "child stream" claim
  was wrong), and moves it to a per-player child keyed
  `(seed, season, week, "medical", playerId)`. That makes it a parent-stream
  mover: solo merge, nothing else in flight, Studio panel after. It waits only
  on Matt signing the effect-size table already in the PR body.

- **The cap/tag cluster half-closed as predicted — and the half that didn't
  close is the interesting finding.** `topCapPctMean` 20.28 landed inside the
  predicted ~20–21 leftover (proposed band 20.3±3, unsigned).
  `franchiseTagsPerSeason` did **not** dip toward 11–14: 17.11, barely moved
  from 17.27. Since the ceiling only blocks tenders above `MAX_CONTRACT_SHARE`,
  the excess volume was never above the ceiling — the ~17-vs-real-10 gap is a
  different mechanism, currently undiagnosed. Still inside the signed 14±4
  band (ceiling 18); report-only stands.

- **The people layer exists as measurement, only partially as behavior.**
  Holdouts 10.22/yr sits inside the signed single-digits–12 expect. Trade
  requests 48.8 and holdout-games-missed 37.09 are first reads with no expect.
  HC fires read **0.00 against a signed expect of 6–8** — and the counter
  itself is proven (the `peopleTeeth` test fires coaches on planted 3–14
  standings and increments at the write site), so the zero is real behavior:
  in a live league, owner heat never trips, or the chairs empty some other way
  first. Note the ordering in `offseason/index.ts`: `tickCoachContracts`
  releases expired coaches *before* `fireCpuHeadCoaches` runs, so a bad HC on
  a short deal can always exit "expired" before heat gets him. That is a
  candidate, not a conclusion.

- **The second-scene machinery measures a path the engine cannot yet
  produce.** `secondSceneStarPct` 0.0 vs §2.7's 11.4% (eligible 2.64%, fired
  8.47 → 21.43 post-ceiling). This is working as designed — the metric landed
  before the mechanism, per invariant 7's "measure first" discipline. The
  Darnold path itself (change-of-scene QB development gated by scheme fit and
  opportunity) is still an unbuilt design packet.

- **Governance, not code, is the current bottleneck — and that is the system
  working.** Three decisions queue on Matt: the #100 effect sizes, the
  `topCapPctMean` 20.3±3 band, and eventual people-counter bands. Nothing
  baseline-shaped has moved without a sign since Wave 3.7. The discipline that
  ended the trade-model-60x era is holding under pressure, which is worth more
  than any single packet.

- **The scouting line is genuinely closed.** Challenge-audit verdict: the
  information ceiling buys +0.1 true points per slot over auto-pick, inside
  seed noise, and the exploit arms lose on starter-seasons. Caps 2/1/1/1
  signed. The +2 probe isolated the user's residual edge to FO dials
  (`bpaBias` ≈ 0.21 re-roll takes it to ~0) and exonerated clock trades
  (sign-flips across seeds). Only the Studio 14×3 lock-grade read is left.

- **The game is still invisible.** No play-by-play, no drive log, no recaps;
  Play-the-Game never shows the result of the snap you called. Phase 5 in the
  wave plan — text PBP/recaps from the event log, zero RNG, display-only
  (ROADMAP.md's "make the engine visible", its declared highest-leverage
  item) — is the next major after Wave 4 closes.

---

## 2. Top 3 next moves, ranked

### 1. Clear the Matt sign-queue, land #100 solo, run the post-merge panel

Everything is serialized behind this. #100 moves the parent PRNG stream, so by
the orchestration rules it merges alone with nothing else in flight, and the
Studio 5-seed panel after it becomes the reference every subsequent packet is
measured against. Until that panel exists, Wave 4 is not closed and Phase 5 is
not started.

Make it one consolidated decision memo, not three dribbled asks:

- **#100 effect sizes** — the table is already in the PR body
  (medical hazard 1.00/1.08/1.20/1.40, character-holdout up to 1.70). These
  are gameplay dials with no primary source, exactly the §7-escalation class;
  proposed defaults are reasonable and the emits
  (`medicalMajorGamesMissedRatio`, `holdoutsByCharacter`) are report-only.
- **`topCapPctMean` 20.3±3** — the panel evidence (20.28, five seeds inside
  19.86–21.03) is as clean as a first band gets.
- **People bands: recommend deferring.** #100's `characterRisk` multipliers
  will move holdout and trade-request rates the moment it merges. Locking
  people bands now means re-locking them one panel later. Sign the cap band,
  hold the people bands for the post-#100 panel.

### 2. Two diagnosis-only packets in the panel's shadow

Both are read-only (report-not-tune per standing rules), so they don't violate
the nothing-else-in-flight rule around #100, and both produce exactly the
write-ups the *next* sign session needs:

- **(a) `hcFires` 0.00.** Instrument `ownerJobView` across a 20-season run:
  the heat distribution, the margin to threshold, how many club-seasons ever
  get within reach. Separately, count how HC chairs actually empty — if
  `tickCoachContracts` expiry is draining them before `fireCpuHeadCoaches`
  runs (it is called first in `offseason/index.ts`), the fix is an ordering /
  contract-length design question for Matt, not a patience-dial tune. Check
  `hcTenureSeasons < OWNER_MIN_SEASONS` coverage too: if typical HC deals are
  short relative to the minimum-tenure grace, no coach is ever *eligible* to
  be fired.
- **(b) tag volume stuck at ~17.** A census of who gets tagged, at what
  position and tender-to-cap %, across the panel seeds. The Packet 2 diagnosis
  already fingered `surplusExceedsTender` + QB `POSITION_VALUE` 3.4× making an
  ordinary 80-OVR starter's surplus beat any tender; the ceiling only cut off
  the top. The testable hypothesis is that the volume excess is *below* the
  ceiling and upstream — clubs reaching the tag decision that a real club
  would have extended a year earlier via `cpuResign`. If true, tags are a
  symptom and the extension path is the defect.

### 3. Spec the Phase 5 event-log contract now; dispatch the day the panel is green

Text PBP and recaps are Lane A: a new `lib/core/sim/events.ts` emitter, hooks
in `game.ts` that change no outcome, zero RNG draws, gate metrics byte-identical
to `main`. The spec work — what events `game.ts` already produces, what a drive
log and a season recap actually need, where `liveGame.ts`'s
re-simulate-per-peek gets replaced — costs nothing while the panel runs and
removes the usual first-week thrash from the packet.

Why this is the right next major and not just the fun one: it is the consumer
that makes everything else legible. A recap that can say "the owner fired the
coach after a second straight 4–13" is what makes `hcFires` matter; a drive log
is what makes eleven waves of calibration something the player can feel. And
the deterministic event log is the substrate the eventual LLM narration
(roadmap Phase 5 proper) renders from — build the log first, prose second, and
the LLM stays display-only by construction.

---

## 3. What NOT to do

- **Do not retune tag volume toward 11–14 or the real ~10.** 17.11 is inside
  the signed 14±4 band. The dip was a *predicted consequence* of the ceiling,
  not a target; its absence is a finding to diagnose (move 2b), not a miss to
  tune away.
- **Do not invent a fire rate.** The signed 6–8/yr HC-fires expect is a
  validation number for a mechanism that should produce it, not a dial target.
  Lowering the heat threshold until 6–8 comes out turns owner patience into a
  difficulty slider — the exact failure invariant 6 exists to prevent.
- **Do not build the second-scene/Darnold mechanism as a reaction to the 0.**
  `secondSceneStarPct` is report-only by design. The mechanism is a real
  design packet with progression/parent-stream implications; queue it
  deliberately (it is Phase 4 territory), not as a red-chase behind #100.
- **Do not touch `baselines.json` ahead of a sign** — the 20.3±3 band is a
  proposal until Matt signs, full stop — and do not merge anything
  engine-touching while #100 is in flight.
- **Do not chase the GATE FAIL 7 residues or the noise metrics** —
  `milestonesOff` 22.60, `wr10RecYds`, `leverage.wrongSign` are all documented
  known-opens or single-seed noise with "do not tune" written on them.
- **Do not start LLM narration before the deterministic event log exists.**
  Prose without a replayable substrate can't be tested, and invariant 5 keeps
  the LLM out of every loop that matters.

---

## 4. The sharp disagreement risk

**The tempting wrong pick is "the ceiling under-delivered — finish the job by
tuning tag propensity."** The 17.11 read looks like a half-failure next to the
predicted 11–14 dip, and the pressure to make the last cap/tag number pretty
before closing the wave will be real.

If we take it, three things go wrong in order. First, it is a tune toward a
consequence-prediction, not a traced number — the precise class of error
invariant 7 was written against, and the trade-model-60x scar is the proof of
where it ends. Second, it will *work*, which is the dangerous part: tag counts
will read 14, the band goes quiet, and the actual defect — most plausibly an
extension path that lets taggable starters reach expiry a real club would have
extended a year out — keeps operating underneath, now invisible. The behavior
gets less real as the number gets prettier. Third, it burns the signed 14±4
band's value as a leak detector: a band that has been tuned-to can never again
tell you the mechanism moved.

The tell that we picked wrong will show up sideways, not in the tag count:
`deadMoneyPct` or `topCapPctMean` drifting while tags sit obediently on 14, or
`careers` second-contract shares bending back toward the pre-PR-#6 pathology.
The hedge is cheap and already ranked: run the diagnosis census (move 2b)
before anyone proposes a tag change, and let the write-up — not the band —
decide whether the next packet touches `runCpuFranchiseTags` at all.

---

*Fable, 2026-09-18. Docs-only; no engine, no baselines, no dispatch.*
