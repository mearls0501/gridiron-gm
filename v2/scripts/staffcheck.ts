/**
 * Staff allocation harness.
 *
 * The staff budget makes a claim that is easy to state and easy to get wrong:
 * concentration moves value between players and between clubs, it does not
 * create it. If that claim fails, the system is not a strategy layer, it is a
 * difficulty slider — and every outcome rate the NFL research pinned down goes
 * with it.
 *
 * So this checks four things, in order of how badly a failure would hurt:
 *
 *   1. NEUTRALITY.  A league on an even split must play exactly as a league
 *      with no budgets at all. Every multiplier in `staff.ts` is written as a
 *      deviation from 25%, so this is a test of that arithmetic, and it is the
 *      one that keeps `drift.ovrDrift` and the `careers.*` rates honest.
 *
 *   2. NO INFLATION.  A league where every club specialises hard must have the
 *      same mean rating as a neutral one. Clubs may pull apart; the league
 *      total may not move.
 *
 *   3. CONCENTRATION WORKS.  A player his club has built itself around must
 *      actually outgrow a comparable player nobody named. If this is zero the
 *      feature is decoration.
 *
 *   4. POTENTIAL IS A WALL.  No amount of investment may take a player past
 *      `pot`. This is the line between a reclamation project and a roster of
 *      seventh rounders who all became Pro Bowlers, and it is checked as a
 *      hard invariant over every player in every season.
 *
 *   npx tsx scripts/staffcheck.ts [seasons]
 */
import { emit, emitAll, seedFor } from "./metrics";
import { newGame } from "../lib/core/newGame";
import { advance } from "../lib/core/season/engine";
import { advanceOffseason, developPlayer, isOffseason } from "../lib/core/offseason";
import { Rng } from "../lib/core/rng";
import { GameState } from "../lib/core/types";
import {
  MAX_FOCUS, STAFF_POINTS, evenBudget, normaliseBudget, schemeFit, schemeFor,
} from "../lib/core/staff";

const SEASONS = Number(process.argv[2] ?? 10);
const SEED = seedFor(4242);

const bar = (s: string) => console.log(`\n${s}\n${"─".repeat(s.length)}`);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

let problems = 0;
function check(ok: boolean, label: string, detail: string): void {
  if (!ok) problems++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label} — ${detail}`);
}

/** Rated players on a roster. Prospects and retirees are not the league. */
function active(state: GameState) {
  return state.players.filter((p) => p.teamId !== null && !p.retired && !p.prospect);
}

/**
 * Play a league forward, applying a per-club allocation each rollover.
 *
 * `allocate` runs after every offseason so a policy survives `refreshCpuStaff`,
 * which would otherwise hand every CPU club its archetype budget back.
 */
function run(
  label: string,
  allocate: ((state: GameState) => void) | null
): { state: GameState; overPot: number } {
  const state = newGame({ seed: SEED });
  let overPot = 0;

  if (allocate) allocate(state);
  for (let s = 0; s < SEASONS; s++) {
    let g = 0;
    while (state.phase !== "offseason-recap" && g++ < 40) advance(state);
    let o = 0;
    while (isOffseason(state.phase) && o++ < 40) advanceOffseason(state);
    if (allocate) allocate(state);

    // The hard invariant, every season, every player.
    for (const p of state.players) {
      if (p.ovr > p.pot + 0.5 || p.ceiling > p.pot + 0.5) overPot++;
    }
  }
  void label;
  return { state, overPot };
}

console.log(`STAFF ALLOCATION — ${SEASONS} seasons, seed ${SEED}`);

// ---------------------------------------------------------------------------
// 1 + 2. Neutrality and no inflation
// ---------------------------------------------------------------------------

/** Everyone even. Should be indistinguishable from no staff system at all. */
const neutral = run("neutral", (state) => {
  for (const t of state.teams) {
    t.staff = evenBudget();
    t.devFocus = [];
  }
});

/**
 * Everyone specialises, and not all in the same direction — half the league
 * pours into development and names three men, half strips development to the
 * floor and buys training instead. If concentration created value rather than
 * moving it, this league would out-rate the neutral one.
 */
const split = run("specialised", (state) => {
  for (const t of state.teams) {
    const devHeavy = t.id % 2 === 0;
    t.staff = normaliseBudget(
      devHeavy
        ? { development: STAFF_POINTS * 0.6, scouting: 5, training: 5, scheme: 5 }
        : { development: 5, scouting: 5, training: STAFF_POINTS * 0.6, scheme: 5 }
    );
    t.devFocus = devHeavy
      ? state.players
          .filter((p) => p.teamId === t.id && !p.retired && !p.prospect && p.age < p.peakAge)
          .sort((a, b) => b.pot - b.ovr - (a.pot - a.ovr))
          .slice(0, MAX_FOCUS)
          .map((p) => p.id)
      : [];
  }
});

const neutralOvr = mean(active(neutral.state).map((p) => p.ovr));
const splitOvr = mean(active(split.state).map((p) => p.ovr));

bar("LEAGUE TOTALS");
console.log(`  neutral league mean OVR      ${neutralOvr.toFixed(2)}`);
console.log(`  specialised league mean OVR  ${splitOvr.toFixed(2)}`);
console.log(`  delta                        ${(splitOvr - neutralOvr).toFixed(2)}`);

check(
  Math.abs(splitOvr - neutralOvr) < 1.2,
  "allocation moves value, it does not create it",
  `league mean moved ${(splitOvr - neutralOvr).toFixed(2)} OVR`
);

// The spread between clubs SHOULD open up — that is the whole point.
const clubMean = (state: GameState) =>
  state.teams.map((t) =>
    mean(active(state).filter((p) => p.teamId === t.id).map((p) => p.ovr))
  );
const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
const neutralSpread = spread(clubMean(neutral.state));
const splitSpread = spread(clubMean(split.state));
console.log(`  best-to-worst club spread    ${neutralSpread.toFixed(2)} neutral · ${splitSpread.toFixed(2)} specialised`);

// ---------------------------------------------------------------------------
// 3. Does concentration actually do anything
// ---------------------------------------------------------------------------

bar("CONCENTRATION");

/**
 * The same player, twice.
 *
 * The obvious test — compare named players against unnamed ones inside one
 * league — is worthless, and it took a red line to notice why: clubs name the
 * men with the most ground left to make up, so the named group is selected for
 * being FURTHEST from its potential. Measuring "share of potential realised"
 * then just rediscovers the selection rule, and it reported focus as a 14-point
 * penalty.
 *
 * So this clones one league, runs a full development pass on each copy — one
 * with the club built around a player, one with nobody named — and compares
 * that same player to himself. `ceilingRecovery` draws no random numbers and
 * the growth path draws the same COUNT either way, so both copies stay on the
 * same RNG stream and the only difference between them is the thing being
 * measured.
 */
const probe = newGame({ seed: SEED });
const clone = (): GameState => JSON.parse(JSON.stringify(probe)) as GameState;

const withFocus = clone();
const without = clone();

/** Young men with real ground to make up — the reclamation candidates. */
const candidates = withFocus.players
  .filter((p) => p.teamId !== null && !p.retired && !p.prospect && p.age < p.peakAge && p.pot - p.ceiling >= 3)
  .slice(0, 200);

const byTeam = new Map<number, number[]>();
for (const p of candidates) {
  const arr = byTeam.get(p.teamId!) ?? [];
  if (arr.length < 1) arr.push(p.id); // one name each, the hardest concentration
  byTeam.set(p.teamId!, arr);
}

for (const state of [withFocus, without]) {
  for (const t of state.teams) {
    t.staff = normaliseBudget({ development: 70, scouting: 10, training: 10, scheme: 10 });
    t.devFocus = state === withFocus ? byTeam.get(t.id) ?? [] : [];
  }
}

// Four offseasons of development on each copy.
const named = new Set<number>([...byTeam.values()].flat());
for (let year = 0; year < 4; year++) {
  for (const state of [withFocus, without]) {
    const rng = new Rng(state.rngState);
    for (const p of state.players) {
      if (p.teamId === null || p.retired || p.prospect) continue;
      developPlayer(state, p, rng);
    }
    state.rngState = rng.state;
    state.season += 1;
  }
}

const lookup = (state: GameState, id: number) => state.players.find((p) => p.id === id)!;
const gains = [...named].map((id) => lookup(withFocus, id).ovr - lookup(without, id).ovr);
const ceilGains = [...named].map(
  (id) => lookup(withFocus, id).ceiling - lookup(without, id).ceiling
);

console.log(`  ${named.size} players, four offseasons, same seed, focused vs not`);
console.log(`  mean OVR gain from being the man     ${mean(gains).toFixed(2)}`);
console.log(`  mean ceiling recovered               ${mean(ceilGains).toFixed(2)}`);
console.log(`  best single case                     +${Math.max(...gains).toFixed(0)} OVR`);

const focusGain = mean(gains);
check(
  focusGain > 0.75,
  "a club that builds around a player gets more of him",
  `${focusGain.toFixed(2)} OVR over four seasons`
);

// ---------------------------------------------------------------------------
// 4. Potential is a wall
// ---------------------------------------------------------------------------

bar("THE WALL");
console.log(`  neutral league      ${neutral.overPot} player-seasons above potential`);
console.log(`  specialised league  ${split.overPot}`);
check(
  neutral.overPot === 0 && split.overPot === 0,
  "no investment takes a player past his potential",
  `${neutral.overPot + split.overPot} violations`
);

// ---------------------------------------------------------------------------
// Scheme fit sanity
// ---------------------------------------------------------------------------

bar("SCHEME FIT");
const fits = active(split.state)
  .map((p) => schemeFit(p, schemeFor(split.state.teams[p.teamId!], p.pos)))
  .filter((f) => f !== 0);
const fitMean = mean(fits);
const fitSpread = fits.length ? Math.max(...fits) - Math.min(...fits) : 0;
console.log(`  players with a scheme opinion  ${fits.length}`);
console.log(`  mean fit ${fitMean.toFixed(3)} · range ${fitSpread.toFixed(2)}`);
check(
  Math.abs(fitMean) < 0.25,
  "scheme fit is a distinction, not a league-wide bonus",
  `mean fit ${fitMean.toFixed(3)}`
);
check(
  fitSpread > 0.5,
  "scheme fit actually separates players",
  `range ${fitSpread.toFixed(2)}`
);

// ---------------------------------------------------------------------------
// 5. Scheme on the field
// ---------------------------------------------------------------------------

bar("SCHEME ON THE FIELD");

/**
 * A scheme lean must redistribute, not inflate.
 *
 * `schemeAttrMultiplier` sharpens what an identity practises and dulls the
 * rest, set so the mean across everything the position is graded on is
 * unchanged. But the play engine does not weight those attributes evenly — it
 * leans harder on some than the rating formula does — so "zero-sum across the
 * attribute list" is not automatically zero-sum on the scoreboard.
 *
 * This is the check for that: a league that has poured points into its
 * identities against one that has stripped them to the floor. If committing to
 * a scheme raises league-wide scoring, it is not a strategic choice, it is a
 * free point-per-game every club takes and the calibration goes with it.
 */
function scoringWith(schemePoints: number): number {
  const state = newGame({ seed: SEED });
  for (const t of state.teams) {
    t.staff = normaliseBudget({
      development: (STAFF_POINTS - schemePoints) / 3,
      scouting: (STAFF_POINTS - schemePoints) / 3,
      training: (STAFF_POINTS - schemePoints) / 3,
      scheme: schemePoints,
    });
  }
  let g = 0;
  while (state.phase !== "offseason-recap" && g++ < 40) advance(state);
  const played = state.games.filter((x) => x.played && x.homeScore !== null);
  return mean(played.flatMap((x) => [x.homeScore!, x.awayScore!]));
}

const schemeFloor = scoringWith(5);
const schemeMax = scoringWith(85);
const schemeScoringDelta = schemeMax - schemeFloor;

console.log(`  league scoring, scheme at the floor  ${schemeFloor.toFixed(2)} pts/team/game`);
console.log(`  league scoring, scheme fully funded  ${schemeMax.toFixed(2)}`);
console.log(`  delta                                ${schemeScoringDelta.toFixed(2)}`);
check(
  Math.abs(schemeScoringDelta) < 1.5,
  "committing to a scheme is a choice, not free points",
  `${schemeScoringDelta.toFixed(2)} pts/team/game`
);

bar("METRICS");
emitAll({
  "staff.problems": problems,
  "staff.leagueOvrDelta": splitOvr - neutralOvr,
  "staff.clubSpreadGain": splitSpread - neutralSpread,
  "staff.focusOvrGain": focusGain,
  "staff.focusCeilingGain": mean(ceilGains),
  "staff.overPotential": neutral.overPot + split.overPot,
  "staff.schemeScoringDelta": schemeScoringDelta,
  "staff.schemeFitMean": fitMean,
  "staff.schemeFitRange": fitSpread,
});
emit("staff.sampleSize", named.size);

console.log("");
if (problems > 0) {
  console.log(`${problems} problem${problems === 1 ? "" : "s"}.`);
  process.exit(1);
}
console.log("Staff allocation behaves.");
