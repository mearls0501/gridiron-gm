import { AttrKey, GameState, Player, Position, StaffBudget, Team } from "./types";
import { POSITION_WEIGHTS, relevantAttrs } from "./ratings";
import { clamp } from "./rng";

/**
 * The front office as a budget.
 *
 * Every club in this league has the same cap and the same number of staff
 * points. That is a game decision, not a claim about the NFL: symmetric
 * resources with asymmetric allocation is what makes a strategy, because the
 * only thing separating two front offices is what they chose to fund. If
 * everyone could fund everything there would be nothing to decide.
 *
 * Four buckets, one pool:
 *
 *   development   how fast your players close the gap to what they could be,
 *                 and — concentrated on a few names — whether a man widely
 *                 written off ever gets there at all
 *   scouting      how much of the fog over a draft class you actually lift
 *   training      soft-tissue injuries, recovery time, and how gently a body
 *                 ages
 *   scheme        commitment to an identity, which lifts the players who fit
 *                 it and leaves the ones who do not behind
 *
 * ## The neutral point, and why it matters
 *
 * `NEUTRAL_SHARE` is 25% — an even split. Every effect in this file is written
 * as a deviation FROM that split, and at an even split every multiplier is
 * exactly 1. So a league where nobody specialises behaves precisely as the
 * game did before any of this existed.
 *
 * That is not a convenience. It is the guardrail. It means the system cannot
 * inflate the league: concentration moves value between players and between
 * clubs, it does not create it. `drift.ovrDrift` and the `careers.*` outcome
 * rates stay where the NFL research put them no matter how aggressively anyone
 * allocates, and `staff.leagueOvrDelta` gates exactly that.
 *
 * ## What investment can and cannot do
 *
 * A player carries two numbers above his rating. `pot` is the ceiling nature
 * gave him. `ceiling` is what he will realistically reach, and the development
 * failure model sets it below `pot` — bad luck, bad coaching, a body that did
 * not hold up, a scheme that never suited him.
 *
 * Development spending buys back the gap between the two. It never touches
 * `pot`. So a 72-rated quarterback sitting on a 78 ceiling and an 86 potential
 * can genuinely be coached into the mid-eighties, and the same investment on a
 * seventh-rounder with 70 potential returns a 70-rated player, forever. That
 * is the line between a reclamation project and a fantasy, and it is the whole
 * reason `pot` is left alone.
 *
 * The other half of the journeyman story is already built and lives elsewhere:
 * `sim/game.ts` derives pressure from the offensive line and the box score
 * from the men actually catching the ball, so a 78 quarterback behind a great
 * line throwing to great receivers already posts numbers a 78 has no business
 * posting. That is situational and it does not travel when he leaves. This
 * file is the part that sticks.
 */

// ---------------------------------------------------------------------------
// The budget
// ---------------------------------------------------------------------------

export const STAFF_BUCKETS = ["development", "scouting", "training", "scheme"] as const;
export type StaffBucket = (typeof STAFF_BUCKETS)[number];

export type { StaffBudget };

/** Points a club has to spend each season. */
export const STAFF_POINTS = 100;

/** An even split. Every effect here is a deviation from this. */
export const NEUTRAL_SHARE = 1 / STAFF_BUCKETS.length;

/** Nobody may starve a department completely — the floor keeps a club legal. */
export const MIN_BUCKET = 5;

export function evenBudget(): StaffBudget {
  const each = STAFF_POINTS / STAFF_BUCKETS.length;
  return { development: each, scouting: each, training: each, scheme: each };
}

/**
 * The budget a club is actually running, defaulting to an even split.
 *
 * Optional on `Team` so a save written before this existed still loads and
 * plays identically.
 */
export function staffBudget(team: Team): StaffBudget {
  return team.staff ?? evenBudget();
}

/** Share of the pool in one bucket, 0..1. */
export function share(team: Team, bucket: StaffBucket): number {
  const b = staffBudget(team);
  const total = STAFF_BUCKETS.reduce((a, k) => a + Math.max(0, b[k]), 0);
  return total > 0 ? Math.max(0, b[bucket]) / total : NEUTRAL_SHARE;
}

/**
 * Clamp a proposed allocation to something legal, preserving intent.
 *
 * Takes whatever the user dragged the sliders to and returns the nearest legal
 * budget: every bucket at or above the floor, summing to the pool. Rejecting
 * the input instead would make the allocation screen a puzzle about arithmetic
 * rather than a decision about a football team.
 */
export function normaliseBudget(proposed: Partial<StaffBudget>): StaffBudget {
  const raw = { ...evenBudget(), ...proposed };
  const out = {} as StaffBudget;
  for (const k of STAFF_BUCKETS) out[k] = Math.max(MIN_BUCKET, Math.round(raw[k]));

  // Scale the room above the floors so the total lands on the pool exactly.
  const floors = MIN_BUCKET * STAFF_BUCKETS.length;
  const room = STAFF_POINTS - floors;
  const over = STAFF_BUCKETS.reduce((a, k) => a + (out[k] - MIN_BUCKET), 0);
  if (over > 0 && room > 0) {
    let spent = 0;
    STAFF_BUCKETS.forEach((k, i) => {
      if (i === STAFF_BUCKETS.length - 1) {
        out[k] = MIN_BUCKET + (room - spent);
      } else {
        const give = Math.round(((out[k] - MIN_BUCKET) / over) * room);
        out[k] = MIN_BUCKET + give;
        spent += give;
      }
    });
  } else {
    for (const k of STAFF_BUCKETS) out[k] = STAFF_POINTS / STAFF_BUCKETS.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Development
// ---------------------------------------------------------------------------

/**
 * How many players a club may point its development staff at.
 *
 * Three, and the number is the design. A cap of one makes the choice trivial
 * and a cap of ten makes it no choice at all — the interesting version is
 * having to leave somebody off. This is where "we built the whole building
 * around him" becomes a decision with a cost: the rookie edge rusher you did
 * not name grows at the league rate.
 */
export const MAX_FOCUS = 3;

export function developmentFocus(team: Team): number[] {
  return (team.devFocus ?? []).slice(0, MAX_FOCUS);
}

/**
 * The multiplier on a player's growth toward his ceiling.
 *
 * Two parts. The club-wide part lifts or drags everyone on the roster with the
 * development budget. The focus part is the concentration: the pool named in
 * `devFocus` splits the club's whole development spend between them, so
 * naming one man is roughly three times naming three.
 *
 * Both are 1.0 at an even budget with nobody named.
 */
export function developmentMultiplier(state: GameState, p: Player): number {
  if (p.teamId === null) return 1;
  const team = state.teams[p.teamId];
  const dev = share(team, "development");

  // Club-wide: a club at the floor develops ~15% slower than neutral, a club
  // pouring everything in ~26% faster. Deliberately modest — this is the tide
  // that lifts the whole roster, and it must not be the headline.
  const broad = 1 + (dev - NEUTRAL_SHARE) * 0.9;

  const focus = developmentFocus(team);
  if (!focus.includes(p.id)) return broad;

  // Concentration. The named group shares the club's development spend, so the
  // fewer the names the harder each one is pushed.
  const perMan = dev / Math.max(1, focus.length);
  return broad * (1 + perMan * 1.5);
}

/**
 * Ceiling recovery — the part that separates a project from a fantasy.
 *
 * `ceiling` is what the development failure model decided this man would
 * actually reach; `pot` is what he was born able to reach. Sustained, focused
 * coaching claws the gap back. It is slow on purpose: a fraction of the
 * remaining gap per season, so a genuine reclamation takes three or four years
 * of commitment rather than one offseason of clicking a button.
 *
 * `pot` is never touched. A player with 70 potential returns a 70-rated player
 * no matter what is spent on him, which is what stops a roster of late-round
 * picks from all becoming Pro Bowlers.
 */
export function ceilingRecovery(state: GameState, p: Player): number {
  if (p.teamId === null || p.age >= p.peakAge) return 0;
  const team = state.teams[p.teamId];
  if (!developmentFocus(team).includes(p.id)) return 0;

  const gap = Math.max(0, p.pot - p.ceiling);
  if (gap <= 0) return 0;

  const perMan = share(team, "development") / Math.max(1, developmentFocus(team).length);
  // At a maximally concentrated budget this closes about a fifth of the
  // remaining gap a year, so four seasons of it recovers most of a lost
  // ceiling and one season recovers a little.
  return gap * clamp(perMan * 0.26, 0, 0.22);
}

// ---------------------------------------------------------------------------
// Training and medical
// ---------------------------------------------------------------------------

/**
 * Multiplier on a player's weekly soft-tissue injury risk.
 *
 * The unglamorous bucket. A club that funds it properly keeps its stars on the
 * field, which is worth more than it looks in a league where availability is
 * most of value — and a club that strips it to the floor will find out in
 * November.
 */
export function injuryRiskMultiplier(team: Team): number {
  return clamp(1 - (share(team, "training") - NEUTRAL_SHARE) * 1.1, 0.55, 1.35);
}

/** Multiplier on how long an injury keeps a man out. */
export function recoveryMultiplier(team: Team): number {
  return clamp(1 - (share(team, "training") - NEUTRAL_SHARE) * 0.7, 0.7, 1.25);
}

/** How gently the training staff lets a body age past its peak. */
export function declineMultiplier(team: Team): number {
  return clamp(1 - (share(team, "training") - NEUTRAL_SHARE) * 0.5, 0.8, 1.2);
}

// ---------------------------------------------------------------------------
// Scouting
// ---------------------------------------------------------------------------

/**
 * Scouting points for the season.
 *
 * This is the bucket that already existed — it was a flat 100 a year buying
 * looks at draft prospects — and it is now one claim on the pool among four.
 * A club that wants to lift the fog off a draft class pays for it by coaching
 * its roster worse, or by getting hurt more.
 */
export function scoutingPointsFor(team: Team): number {
  return Math.round(STAFF_POINTS * (share(team, "scouting") / NEUTRAL_SHARE) * 0.5 + 50);
}

// ---------------------------------------------------------------------------
// Scheme
// ---------------------------------------------------------------------------

/**
 * A scheme is a set of attributes a club decides it cares about more than the
 * league average does.
 *
 * The tradeoff is real in both directions: committing to a vertical passing
 * game makes your deep threats better than their ratings and makes the
 * possession receiver you drafted last year worse than his, and it narrows who
 * is worth signing. The point is not the bonus, it is that the bonus is
 * attached to a decision you have to live with when the draft board does not
 * cooperate.
 *
 * Kept deliberately small. Four identities a side is enough to make the
 * decision bite without becoming a second game about menus.
 */
export interface Scheme {
  id: string;
  name: string;
  side: "offense" | "defense";
  blurb: string;
  /** Attributes this identity leans on, by position. */
  emphasis: Partial<Record<Position, AttrKey[]>>;
}

export const SCHEMES: Scheme[] = [
  {
    id: "vertical",
    name: "Vertical Passing",
    side: "offense",
    blurb: "Push the ball down the field. Arm talent and separation over timing and hands.",
    emphasis: { QB: ["thp", "tha"], WR: ["spd", "jmp"], TE: ["spd"], OT: ["pbk"], OG: ["pbk"] },
  },
  {
    id: "westcoast",
    name: "Timing and Rhythm",
    side: "offense",
    blurb: "Get it out on time. Accuracy, route discipline and hands beat raw arm strength.",
    emphasis: { QB: ["tha", "dec"], WR: ["rte", "cth"], TE: ["cth", "rte"], RB: ["cth"] },
  },
  {
    id: "power",
    name: "Downhill Run",
    side: "offense",
    blurb: "Win at the line. Movement up front and a back who finishes runs.",
    // One attribute per lineman, not two.
    //
    // This is the only scheme that leans on six men along a single axis, and
    // the boost compounds across all of them on the same play in a way the
    // passing identities never do — the ball only goes to one receiver. At two
    // emphasised attributes per lineman the league rushing leader ran for
    // 2,396 yards against a real record of 2,105, while mean rushing was only
    // four yards a game high. The whole error was in the tail.
    emphasis: { OT: ["rbk"], OG: ["rbk"], C: ["rbk"], RB: ["str", "car"], TE: ["rbk"] },
  },
  {
    id: "spread",
    name: "Spread and Space",
    side: "offense",
    blurb: "Make them defend the whole field. Movement skill everywhere, size nowhere.",
    emphasis: { QB: ["spd", "dec"], RB: ["elu", "cth"], WR: ["agi", "acc"], TE: ["agi"] },
  },
  {
    id: "fourman",
    name: "Four-Man Rush",
    side: "defense",
    blurb: "Beat five with four. Everything is built on the edge winning alone.",
    emphasis: { EDGE: ["prs", "acc"], DT: ["prs"], CB: ["cov"], S: ["cov"] },
  },
  {
    id: "blitz",
    name: "Pressure and Man",
    side: "defense",
    blurb: "Send extra and trust the corners. High variance by design.",
    // `prs` is not in the linebacker or safety weight table, so naming it there
    // was a silent no-op that quietly shrank the emphasis set and widened the
    // drag on everything else.
    emphasis: { LB: ["spd", "pur"], S: ["tkl", "spd"], CB: ["cov", "agi"], EDGE: ["prs"] },
  },
  {
    id: "twogap",
    name: "Two-Gap Front",
    side: "defense",
    blurb: "Control the line, keep the linebackers clean, make them earn every yard.",
    emphasis: { DT: ["str", "pur"], EDGE: ["str", "pur"], LB: ["tkl", "awr"], S: ["tkl"] },
  },
  {
    id: "zone",
    name: "Zone Match",
    side: "defense",
    blurb: "Nobody runs free. Recognition and discipline over raw cover ability.",
    // Same no-op: `pur` is not a cornerback attribute.
    emphasis: { CB: ["awr", "cov"], S: ["awr", "cov"], LB: ["cov", "awr"], EDGE: ["pur"] },
  },
];

export function schemeById(id: string | undefined): Scheme | null {
  return SCHEMES.find((s) => s.id === id) ?? null;
}

const OFFENSE: Position[] = ["QB", "RB", "WR", "TE", "OT", "OG", "C"];

/**
 * How well a player suits his club's identity, -1..+1.
 *
 * Measured as how far his emphasised attributes sit above or below his own
 * average — so it asks "is this the kind of player this scheme wants" rather
 * than "is he good", and a 68-rated deep threat can be a better fit in a
 * vertical offence than an 80-rated possession receiver.
 *
 * A player at a position the scheme does not name is neutral. Kickers and
 * punters are always neutral, which is the correct amount of scheme fit for a
 * kicker.
 */
export function schemeFit(p: Player, scheme: Scheme | null): number {
  if (!scheme) return 0;
  const keys = scheme.emphasis[p.pos];
  if (!keys || !keys.length) return 0;

  // Measured against the attributes his POSITION is graded on, not against all
  // twenty-three.
  //
  // Comparing to the whole set looked reasonable and was systematically wrong:
  // generation draws irrelevant attributes around 45 and relevant ones around
  // the player's target, so every competent player sits far above his own
  // overall mean on anything his position cares about — and a scheme only ever
  // emphasises attributes the position cares about. The league-wide mean fit
  // came out at +0.70 on a -1..+1 scale, which is not a distinction, it is a
  // bonus every club collects for existing.
  const rel = relevantAttrs(p.pos);
  if (!rel.length) return 0;
  let base = 0;
  for (const k of rel) base += p.attrs[k];
  base /= rel.length;

  let sum = 0;
  for (const k of keys) sum += p.attrs[k] - base;
  // A 15-point edge on the emphasised attributes is a full fit.
  return clamp(sum / keys.length / 15, -1, 1);
}

/** The identity that governs this player — offence or defence side. */
export function schemeFor(team: Team, pos: Position): Scheme | null {
  const id = OFFENSE.includes(pos) ? team.offScheme : team.defScheme;
  return schemeById(id);
}

/**
 * The scheme effect on one player, as a rating-equivalent adjustment.
 *
 * Scaled by the scheme budget, so an identity a club has not paid to install
 * is barely an identity. Runs from about -4 to +4 at a fully funded scheme,
 * which is enough to change who starts without rewriting who is good.
 *
 * This is the front-office view — what a club thinks a player is worth to
 * THEM. What happens on the field is `schemeAttrMultiplier` below.
 */
export function schemeAdjustment(state: GameState, p: Player): number {
  if (p.teamId === null) return 0;
  const team = state.teams[p.teamId];
  const scheme = schemeFor(team, p.pos);
  if (!scheme) return 0;
  const intensity = share(team, "scheme") / NEUTRAL_SHARE;
  return schemeFit(p, scheme) * 4 * clamp(intensity, 0, 2);
}

/**
 * How hard the scheme leans on one attribute, on the field.
 *
 * A scheme is a decision about what your team spends its week practising. The
 * things it asks for get sharper and the things it does not get rustier — so
 * this returns a multiplier above 1 for the attributes the identity
 * emphasises and below 1 for the rest of what the position is graded on.
 *
 * It is deliberately zero-sum WITHIN a player rather than a bonus on top of
 * him. The drag on the unemphasised attributes is set so the mean across
 * everything his position is judged on is unchanged, which is what makes this
 * a redistribution rather than a league-wide scoring inflation — the same
 * property that keeps the rest of `staff.ts` honest. `calibrate` and
 * `staffcheck.schemeScoringDelta` are the two things watching it.
 *
 * The consequence is the tradeoff, not the bonus: a vertical passing offence
 * makes a strong-armed quarterback throw better than his rating and a
 * game-manager throw worse than his, so committing to an identity decides who
 * on your roster is worth playing — and that decision outlives the players you
 * made it for.
 *
 * Note the asymmetry with `schemeFit`: nothing here reads the fit score.
 * Amplifying a player's strengths BY how strong they already are would count
 * the same thing twice and hand the good-fit player a compounding bonus. The
 * scheme applies the same lean to everybody, and fit is what falls out of it.
 */
export function schemeAttrMultiplier(team: Team, pos: Position, key: AttrKey): number {
  const scheme = schemeFor(team, pos);
  if (!scheme) return 1;
  const keys = scheme.emphasis[pos];
  if (!keys || !keys.length) return 1;

  const rel = relevantAttrs(pos);
  const emphasised = rel.filter((k) => keys.includes(k));
  const rest = rel.length - emphasised.length;
  if (!emphasised.length || rest <= 0) return 1;

  // A club at the floor barely has an identity; one that has poured points in
  // has a pronounced one. Capped so no scheme rewrites who is good.
  //
  // 0.028 rather than the 0.045 this started at, because the run schemes
  // compound in a way the pass schemes do not: Downhill Run leans on five
  // linemen and a back along a single axis, so the boost multiplies across six
  // men who all touch the same play. At 0.045 the league rushing leader ran
  // for 2,396 yards against a real record of 2,105 — mean rushing was only 4
  // yards a game high, so this was entirely a tail effect, which is exactly
  // what `statcheck.leadRushYds` exists to catch.
  const intensity = clamp(share(team, "scheme") / NEUTRAL_SHARE, 0, 2.2);
  const boost = 0.028 * intensity;

  if (emphasised.includes(key)) return 1 + boost;
  // Never dull what a position IS.
  //
  // A scheme is a choice about emphasis, not about competence. Zone Match asks
  // its corners for recognition rather than raw cover ability, and the drag
  // fell on `cov` — 36% of a cornerback's rating, the single thing that makes
  // him a cornerback. `coherence.eliteCbShadowDrop` caught it immediately:
  // shadowing a WR1 with a shutdown corner went from costing him a yard to
  // GAINING him ten, because the shutdown corner had been coached out of
  // covering. Whatever a position is most graded on is exempt from the drag.
  if (key === definingAttr(pos)) return 1;
  if (rel.includes(key)) return 1 - (boost * emphasised.length) / rest;
  return 1;
}

/** The attribute a position is most graded on. Cached — the weights are static. */
const DEFINING = new Map<Position, AttrKey>();
function definingAttr(pos: Position): AttrKey | null {
  let cached = DEFINING.get(pos);
  if (cached) return cached;
  const w = POSITION_WEIGHTS[pos];
  let best: AttrKey | null = null;
  let bestW = -1;
  for (const [k, v] of Object.entries(w) as [AttrKey, number][]) {
    if (v > bestW) { bestW = v; best = k; }
  }
  if (best) DEFINING.set(pos, best);
  return best;
}

/**
 * Scheme fit as a development multiplier.
 *
 * A player asked to do what he is built for gets better at it faster. Smaller
 * than the development bucket's own effect, so scheme is a tilt rather than a
 * second development budget.
 */
export function schemeDevelopmentMultiplier(state: GameState, p: Player): number {
  if (p.teamId === null) return 1;
  const team = state.teams[p.teamId];
  const scheme = schemeFor(team, p.pos);
  if (!scheme) return 1;
  const intensity = share(team, "scheme") / NEUTRAL_SHARE;
  return 1 + schemeFit(p, scheme) * 0.16 * clamp(intensity, 0, 2);
}

// ---------------------------------------------------------------------------
// CPU allocation
// ---------------------------------------------------------------------------

/**
 * What a CPU club funds, from the archetype it already has.
 *
 * Reuses `frontOffice` rather than inventing a second personality system: a
 * club that prefers youth and drafts best-available funds development and
 * scouting, a win-now club funds training and its scheme because it needs the
 * roster it already has to be available and to fit. The spread is real but
 * bounded — no CPU club strips a bucket to the floor, because a league of
 * extremists would make the user's own allocation meaningless.
 */
export function cpuBudget(state: GameState, teamId: number): StaffBudget {
  const t = state.teams[teamId];
  const fo = t.frontOffice;
  if (!fo) return evenBudget();

  const each = STAFF_POINTS / STAFF_BUCKETS.length;
  const swing = 9;
  return normaliseBudget({
    development: each + (fo.youthPreference - 0.5) * 2 * swing,
    scouting: each + (fo.bpaBias - 0.5) * 2 * swing,
    training: each + (fo.winNow - 0.5) * 2 * swing,
    scheme: each + (0.5 - fo.risk) * 2 * swing,
  });
}

/**
 * Who a CPU club points its development staff at.
 *
 * The men with the most left to gain: young, still short of what they could
 * be, and already playing. A club does not spend its development budget on a
 * thirty-year-old who has been what he is for six years.
 */
export function cpuDevelopmentFocus(state: GameState, teamId: number): number[] {
  return state.players
    .filter((p) => p.teamId === teamId && !p.retired && !p.prospect && p.age < p.peakAge)
    .map((p) => ({ p, room: (p.pot - p.ovr) * (1 + (p.ovr - 60) / 40) }))
    .sort((a, b) => b.room - a.room)
    .slice(0, MAX_FOCUS)
    .map((x) => x.p.id);
}

/** Set every CPU club's allocation for the season. Called at the rollover. */
export function refreshCpuStaff(state: GameState): void {
  for (const t of state.teams) {
    if (t.id === state.userTeamId) continue;
    t.staff = cpuBudget(state, t.id);
    t.devFocus = cpuDevelopmentFocus(state, t.id);
  }
}
