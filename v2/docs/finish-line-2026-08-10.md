# What is left to finish Gridiron GM

Written 2026-08-10, after a session spent entirely in the measurement layer. The
conclusion of that session is the premise of this document.

---

## The one-sentence version

**The simulation is done enough. The game is not.** Every remaining item that would
change whether someone wants to play a second season is in the player-facing loop, and
every remaining item in the engine is a target or an accepted limitation, not a defect.

---

## Where the line actually is

Twenty screens exist. Games play drive by drive, the box score reconciles with the score,
the depth chart drives the sim, all 30 attribute probes show a correctly-signed effect,
schedules are constraint-generated, contracts prorate, players age and retire, the CPU
drafts on need and value. Five audit rounds and a month of calibration are behind it.
`gate:full` runs 14 harnesses and exits 0.

That is a working football simulation. What it is not yet is a career.

Matt's own verdict after the demo — recorded in the weekly-loop design — was: *"the sim
records everything but tells you nothing."* That is still the gap. Nothing found this
session changes it; the session's work only made the instruments trustworthy enough to
stop arguing about them.

---

## The three systems that finish it

### 1. Live CPU bidding in free agency — the biggest single hole

`FaState` and `FaBid` are declared in `types.ts:657-669`, `GameState.fa` is typed, and it
is **always null**. Free agency is one of the three things a general manager does, and in
this game the computer does not participate in it. The user signs whoever they want at
whatever the model says, unopposed.

This is the largest gameplay gap in the build and the shape is already designed — the
types exist, `runCpuFaRound` and `spendToFloor` already model CPU intent, and
`frontOffice.ts` already gives each club a posture and a valuation. What is missing is
making those clubs bid *against the user in real time* instead of resolving offscreen.

Do this first. It converts an existing system from a formality into a contest.

### 2. Weekly loop Phase 2, steps 2-5 — the stakes layer

All design decisions were locked by Matt on 2026-08-01. Step 1 (the settings layer,
`dcf0da4`) shipped. What remains:

- **Owner profile + GM rating** — patience/ambition/loyalty, a preseason expectation band
  from `teamOutlook`, weekly mood, a season verdict.
- **Media moments with gameplay teeth** — Matt's requirement, verbatim: *"what do you
  think happens in real life?"* Consequences through existing channels only.
- **The job carousel** — being fired, and being hireable elsewhere, gated by GM rating.
- **Department reports.**

Without this there is no reason to care about winning. The firing setting already defaults
ON for new games and there is currently nothing behind it.

Note the invariant already stated in `types.ts`: settings gate what the game DOES ABOUT
events, never whether they happen. A paused-and-resumed sim must call the identical
advance sequence.

### 3. The scouting calendar — steps 2-4 of the redesign

Step 1 (`b0f7faa`) and the market-independence fix (`c86abd6`) shipped: numbers are out of
the prospect UI, and the market no longer copies the user's private work. What remains is
the part Matt actually objected to.

The point economy is still in place, and it is the thing he called *"the opposite of what
we are trying to build"* — points, button-mash, bands converge, you know the OVR. Step 3
removes it entirely and replaces it with calendar windows: in-season film focus, then
all-star week → combine → pro days → 30 private visits → UDFA prep. Miss a window and the
information does not exist this cycle. The 30 visits become the scarce currency.

Step 2 (source tendencies) is smaller and colours the reports. Step 4 extends `scoutcheck`.

This is a save-state change (`state.scouting` gains calendar fields, old spends migrate),
so it wants doing before there are saves worth preserving.

---

## The things that look like work and are not

**Sim tuning.** The known-open table is now almost entirely targets and two formally
accepted limitations. `statcheck.rb5RushYds` has one live lever left (ypc dispersion,
§5.10 — and note this *reopens* a row AGENTS.md had closed as "no distribution lever
left"; the exonerated lever was carry share, which is a different mechanism). Beyond that,
the passing record is out of reach by measurement, and QB availability's second moment
needs a per-position duration table that is a design change nobody has asked for.

**More measurement.** This session fixed the panel noise, the Poisson verdict, and two
attribution traps. The instruments are now good enough to trust. Adding more is procrastination.

---

## The smaller holes worth closing on the way past

Each is bounded and each is currently invisible to every guard:

- **ROY is not restricted to rookies.** A straight bug; no grep hit for it in
  `lib/core/season/`.
- **`history[].standings` is written and no page reads it.** Dead data, or a missing
  season-history screen — decide which.
- **A club never benches a passer for playing badly.** Garbage-time rotation exists and is
  fitted to §5.4b; performance-based benching does not.
- **`leverage.noEffect` = 1: LB awareness is 16% of OVR and the engine never reads it.**
  An attribute that is displayed, valued, paid for, and inert.

---

## What "done" should mean

A definition worth committing to, because without one this project has no edge to stop at:

> A new user starts a franchise, plays twenty seasons without touching a harness, and at
> the end can tell you the story of what happened — who they drafted and missed on, the
> year the owner nearly fired them, the free agent they lost to a rival, the back half of
> a career they mismanaged.

Every item in the three systems above is required for that sentence to be true. Almost
nothing left in the engine is.

---

## Recommended order

1. **Live FA bidding.** Largest hole, types already exist, converts a formality into a contest.
2. **Weekly loop Phase 2 steps 2-5.** The stakes layer. Firing already defaults on with nothing behind it.
3. **Scouting calendar.** Save-state change — do it before saves are precious.
4. **The four small holes above**, opportunistically.
5. **Draft outcome realism** (`careers.survivalMae` 8.8 → <4, `careers.r1BustPct` 28% → 15%,
   second contracts 3-5x high). This is engine work, but unlike the rest of the engine
   queue it directly serves the twenty-season story — it is what makes a draft pick mean
   something four years later.

Everything below line 5 is polish on a game that is already good enough to play.
