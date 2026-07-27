import { Rng, clamp } from "./rng";
import { FrontOffice, GameState, Player, Position, POSITIONS } from "./types";
import { computeRecords, teamCap, capHit, teamRoster } from "./select";

export type { FrontOffice };

/**
 * Front offices.
 *
 * Every CPU team used to run the same one-line valuation — `interest()` in
 * freeAgency.ts was an OVR, an age penalty and a positional multiplier — so all
 * 32 clubs wanted exactly the same players in exactly the same order, and the
 * only thing separating them was who the shuffle put first. There was no team
 * that overpaid for a quarterback, no team that refused to pay a running back,
 * no team that knew it was rebuilding.
 *
 * A front office is a set of NUMBERS on the save. The archetypes below were
 * written out longhand rather than sampled from noise, so each one is a
 * coherent philosophy instead of a random point in dial-space; a franchise gets
 * one at league creation, lightly perturbed by the seeded rng so two saves that
 * draw the same archetype still don't play identically.
 *
 * Deliberately not a runtime model call: this has to run offline, replay from a
 * seed, and be simulatable twenty seasons deep by the drift harness in a few
 * minutes. Baking the personalities into the save gets all of that and costs
 * nothing.
 */

/**
 * Sixteen philosophies. Each one has to be recognisable from the outside: if a
 * user cannot tell after three seasons that Denver refuses to pay running backs
 * and always drafts a lineman, the dial did nothing.
 */
export const ARCHETYPES: FrontOffice[] = [
  {
    name: "The Trench Builder",
    blurb: "Games are won up front. Everything else is a luxury.",
    winNow: 0.45, risk: 0.35, capAggression: 0.60, loyalty: 0.65,
    youthPreference: 0.50, bpaBias: 0.35,
    posBias: { OT: 1.35, OG: 1.40, C: 1.35, DT: 1.30, EDGE: 1.15, RB: 0.70, WR: 0.85 },
  },
  {
    name: "The Quarterback Whisperer",
    blurb: "Find the passer, pay the passer, protect the passer.",
    winNow: 0.55, risk: 0.60, capAggression: 0.75, loyalty: 0.50,
    youthPreference: 0.55, bpaBias: 0.45,
    posBias: { QB: 1.45, OT: 1.20, WR: 1.15, TE: 1.10, LB: 0.80, S: 0.85 },
  },
  {
    name: "The Analytics Desk",
    blurb: "Positional value is not a preference, it is arithmetic.",
    winNow: 0.40, risk: 0.50, capAggression: 0.55, loyalty: 0.30,
    youthPreference: 0.75, bpaBias: 0.85,
    posBias: { QB: 1.25, EDGE: 1.25, OT: 1.20, CB: 1.15, RB: 0.45, K: 0.55, P: 0.50, LB: 0.75 },
  },
  {
    name: "The All-In Operator",
    blurb: "The window is open now. Next year's cap is next year's problem.",
    winNow: 0.95, risk: 0.85, capAggression: 0.95, loyalty: 0.45,
    youthPreference: 0.20, bpaBias: 0.25,
    posBias: { QB: 1.20, WR: 1.20, EDGE: 1.15, CB: 1.10 },
  },
  {
    name: "The Patient Rebuilder",
    blurb: "Accumulate young talent. Refuse to pay for other teams' primes.",
    winNow: 0.10, risk: 0.55, capAggression: 0.30, loyalty: 0.35,
    youthPreference: 0.95, bpaBias: 0.80,
    posBias: { QB: 1.30, OT: 1.15, EDGE: 1.15, RB: 0.55, K: 0.60, P: 0.55 },
  },
  {
    name: "The Defensive Purist",
    blurb: "Hold them under seventeen and you will win more than you lose.",
    winNow: 0.55, risk: 0.40, capAggression: 0.65, loyalty: 0.60,
    youthPreference: 0.50, bpaBias: 0.40,
    posBias: { EDGE: 1.35, DT: 1.25, LB: 1.30, CB: 1.25, S: 1.25, WR: 0.80, TE: 0.80, RB: 0.65 },
  },
  {
    name: "The Air Raid",
    blurb: "Score more than they do. Nobody sells tickets to a punt.",
    winNow: 0.65, risk: 0.65, capAggression: 0.70, loyalty: 0.45,
    youthPreference: 0.55, bpaBias: 0.40,
    posBias: { QB: 1.35, WR: 1.40, TE: 1.20, OT: 1.15, LB: 0.70, DT: 0.75, S: 0.80 },
  },
  {
    name: "The Continuity Shop",
    blurb: "Draft them, develop them, keep them. Free agency is for other people.",
    winNow: 0.45, risk: 0.25, capAggression: 0.50, loyalty: 0.95,
    youthPreference: 0.60, bpaBias: 0.55,
    posBias: {},
  },
  {
    name: "The Bargain Hunter",
    blurb: "There is no such thing as a bad player, only a bad price.",
    winNow: 0.35, risk: 0.45, capAggression: 0.35, loyalty: 0.40,
    youthPreference: 0.45, bpaBias: 0.70,
    posBias: { QB: 0.90, RB: 0.80, K: 0.80, P: 0.80 },
  },
  {
    name: "The Gambler",
    blurb: "Boring rosters finish 9-8. Take the swing.",
    winNow: 0.60, risk: 0.98, capAggression: 0.80, loyalty: 0.30,
    youthPreference: 0.70, bpaBias: 0.75,
    posBias: { QB: 1.30, WR: 1.25, EDGE: 1.20, CB: 1.15, C: 0.80, OG: 0.85 },
  },
  {
    name: "The Old-School Ground Game",
    blurb: "Run the ball, stop the run, and win in December.",
    winNow: 0.55, risk: 0.25, capAggression: 0.55, loyalty: 0.75,
    youthPreference: 0.35, bpaBias: 0.25,
    posBias: { RB: 1.55, OG: 1.30, C: 1.25, TE: 1.30, DT: 1.20, LB: 1.15, WR: 0.75, CB: 0.85 },
  },
  {
    name: "The Cap Hawk",
    blurb: "Never carry dead money. Never sign the second contract.",
    winNow: 0.40, risk: 0.30, capAggression: 0.25, loyalty: 0.20,
    youthPreference: 0.85, bpaBias: 0.65,
    posBias: { QB: 1.10, RB: 0.55, WR: 0.90, K: 0.70, P: 0.65 },
  },
  {
    name: "The Secondary First",
    blurb: "You cannot cover in this league without corners. Everything starts there.",
    winNow: 0.50, risk: 0.45, capAggression: 0.60, loyalty: 0.55,
    youthPreference: 0.65, bpaBias: 0.45,
    posBias: { CB: 1.50, S: 1.35, EDGE: 1.15, WR: 1.05, RB: 0.60, TE: 0.85, OG: 0.90 },
  },
  {
    name: "The Veteran Room",
    blurb: "Rookies lose games. Give me professionals who have been there.",
    winNow: 0.75, risk: 0.30, capAggression: 0.75, loyalty: 0.80,
    youthPreference: 0.15, bpaBias: 0.30,
    posBias: { QB: 1.15, C: 1.20, S: 1.15, LB: 1.10 },
  },
  {
    name: "The Draft Hoarder",
    blurb: "Volume beats precision. Take seven swings and hit on three.",
    winNow: 0.25, risk: 0.70, capAggression: 0.40, loyalty: 0.40,
    youthPreference: 0.90, bpaBias: 0.90,
    posBias: { QB: 1.20, EDGE: 1.15, OT: 1.10, RB: 0.60, K: 0.55, P: 0.50 },
  },
  {
    name: "The Balanced Front Office",
    blurb: "No dogma. Take the value, fill the holes, stay flexible.",
    winNow: 0.50, risk: 0.50, capAggression: 0.55, loyalty: 0.55,
    youthPreference: 0.55, bpaBias: 0.55,
    posBias: {},
  },
];

/** Draw a front office, perturbed so two teams on the same archetype differ. */
export function makeFrontOffice(rng: Rng, base: FrontOffice): FrontOffice {
  const jitter = (v: number) => clamp(v + rng.normal(0, 0.07), 0.05, 0.99);
  const posBias: Partial<Record<Position, number>> = {};
  for (const pos of POSITIONS) {
    const b = base.posBias[pos] ?? 1;
    // Every club has small idiosyncratic tastes on top of its philosophy.
    const v = clamp(b * (1 + rng.normal(0, 0.05)), 0.4, 1.7);
    if (Math.abs(v - 1) > 0.02) posBias[pos] = v;
  }
  return {
    name: base.name,
    blurb: base.blurb,
    winNow: jitter(base.winNow),
    risk: jitter(base.risk),
    capAggression: jitter(base.capAggression),
    loyalty: jitter(base.loyalty),
    youthPreference: jitter(base.youthPreference),
    bpaBias: jitter(base.bpaBias),
    posBias,
  };
}

/** One archetype per franchise, shuffled so franchise order isn't destiny. */
export function assignFrontOffices(rng: Rng, count: number): FrontOffice[] {
  const pool: FrontOffice[] = [];
  while (pool.length < count) pool.push(...ARCHETYPES);
  return rng.shuffle(pool).slice(0, count).map((a) => makeFrontOffice(rng, a));
}

/** Fallback for saves written before front offices existed. */
export const DEFAULT_FRONT_OFFICE: FrontOffice = ARCHETYPES[ARCHETYPES.length - 1];

export function frontOffice(state: GameState, teamId: number): FrontOffice {
  return state.teams[teamId]?.frontOffice ?? DEFAULT_FRONT_OFFICE;
}

// ---------------------------------------------------------------------------
// Posture
// ---------------------------------------------------------------------------

/**
 * Where a club thinks it is in its own cycle.
 *
 * This is the piece that was missing entirely. Without it every team behaved
 * identically in March regardless of whether it had just gone 14-3 with a
 * 29-year-old roster or 3-14 with rookies everywhere — so nobody ever sold, and
 * nobody ever went for it.
 */
export type Posture = "contend" | "retool" | "rebuild";

export interface TeamOutlook {
  posture: Posture;
  /** Wins last season, or 8.5 before a season has been played. */
  wins: number;
  /** Snap-weighted age of the players who actually matter. */
  coreAge: number;
  /** How many genuine starters (75+) the club already has. */
  quality: number;
}

export function teamOutlook(state: GameState, teamId: number): TeamOutlook {
  const fo = frontOffice(state, teamId);
  const roster = teamRoster(state, teamId);

  const lastSeason = state.season - (state.phase === "preseason" ? 1 : 0);
  const recs = computeRecords(state, lastSeason);
  const rec = recs.get(teamId);
  const played = rec ? rec.w + rec.l + rec.t : 0;
  const wins = played > 0 ? rec!.w : 8.5;

  // Weight by ability: the age of the 53rd man is not the age of the team.
  let wSum = 0;
  let aSum = 0;
  for (const p of roster) {
    const w = Math.max(0, p.ovr - 55) ** 2;
    wSum += w;
    aSum += w * p.age;
  }
  const coreAge = wSum > 0 ? aSum / wSum : 26;
  const quality = roster.filter((p) => p.ovr >= 75).length;

  // A club that is winning, or believes it should be, contends. A young club
  // with nothing on the roster rebuilds. Everyone else is retooling.
  const contendScore =
    (wins - 8.5) * 0.30 + (quality - 12) * 0.16 + (fo.winNow - 0.5) * 2.2 + (coreAge - 26) * 0.18;

  const posture: Posture =
    contendScore > 0.75 ? "contend" : contendScore < -0.75 ? "rebuild" : "retool";

  return { posture, wins, coreAge, quality };
}

// ---------------------------------------------------------------------------
// Valuation
// ---------------------------------------------------------------------------

/**
 * What this club thinks a player is worth, in its own currency.
 *
 * Used by re-signings, free agency and the draft board so a team's philosophy
 * shows up consistently in all three rather than only in one screen.
 */
/**
 * Roughly what a club can sign off the street. Value is measured ABOVE this.
 *
 * This line matters more than it looks. Multiplying a player's whole rating by
 * his positional value made a 61 OVR quarterback (61 x 3.4 = 207) worth more
 * than an 87 OVR receiver (87 x 1.4 = 122), because the multiplier was applied
 * to the replacement-level part of him as well as the good part. Inside free
 * agency that only skewed the ordering; the moment trades existed it was fatal,
 * and clubs cheerfully sent away stars for a backup passer and three sevenths.
 * A quarterback IS worth three times a receiver — per point of ability over
 * what anyone else could give you, not per point of rating.
 */
export const REPLACEMENT_OVR = 58;

export function evaluate(
  state: GameState, teamId: number, p: Player, posture: Posture, posValue: number
): number {
  const fo = frontOffice(state, teamId);

  // Upside is worth more to a rebuilding club and to a risk-tolerant one.
  const upside = Math.max(0, p.pot - p.ovr);
  const horizon = posture === "rebuild" ? 1.0 : posture === "retool" ? 0.55 : 0.2;
  const upsideValue = upside * (0.15 + horizon * 0.45) * (0.6 + fo.risk * 0.8);

  // Age is read through the club's own lens, and a contender barely cares.
  const over = Math.max(0, p.age - 28);
  const agePenalty = over * (0.8 + fo.youthPreference * 3.4) * (posture === "contend" ? 0.5 : 1);

  const bias = fo.posBias[p.pos] ?? 1;
  const above = p.ovr - REPLACEMENT_OVR + upsideValue - agePenalty;
  return above * posValue * bias;
}

/**
 * The share of the cap this club is willing to have committed.
 *
 * A rebuilding cap hawk sits around 80%; an all-in operator will run to the
 * ceiling. Nobody may sit below the floor — see `spendToFloor`.
 */
export function targetSpend(state: GameState, teamId: number, posture: Posture): number {
  const fo = frontOffice(state, teamId);
  const base = 0.82 + fo.capAggression * 0.16;
  const shift = posture === "contend" ? 0.04 : posture === "rebuild" ? -0.05 : 0;
  return clamp(base + shift, SPEND_FLOOR, 0.995);
}

/**
 * League-wide spending floor, as a share of the cap.
 *
 * Real leagues have one for a reason. Without it a club that lost a lot of
 * contracts in one offseason simply never rebuilt its payroll — measured over
 * twenty seasons, some team was sitting at 20-30% of the cap every single year,
 * fielding a roster of minimum deals and losing on purpose by accident.
 */
export const SPEND_FLOOR = 0.78;

export function payroll(state: GameState, teamId: number): number {
  let sum = 0;
  for (const p of state.players) {
    if (p.teamId !== teamId || p.retired || p.prospect) continue;
    sum += capHit(p.contract);
  }
  return sum + (state.teams[teamId]?.deadCap ?? 0);
}

export function payrollPct(state: GameState, teamId: number): number {
  return payroll(state, teamId) / teamCap(state, teamId).cap;
}
