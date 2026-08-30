import { Rng, clamp } from "../rng";
import { refreshOvr, relevantAttrs, POSITION_WEIGHTS } from "../ratings";
import { AttrKey, GameState, Player, SeasonHistory } from "../types";
import { currentLine } from "../season/stats";
import { healOffseason } from "../season/injuries";
import { leagueStandings } from "../season/standings";
import { computeRecords } from "../select";
import { REPLACEMENT_OVR } from "../frontOffice";
import {
  ceilingRecovery, declineMultiplier, developmentMultiplier, schemeDevelopmentMultiplier,
} from "../staff";

/**
 * Aging, development and retirement.
 *
 * The old build had none of this wired up: nobody aged, developed or retired,
 * so rosters were frozen forever and there was no franchise arc. Here it runs
 * every offseason and moves the underlying ATTRIBUTES, not a cosmetic overall.
 */

/**
 * Growth: the share of a player's remaining room to his ceiling that he closes
 * in one offseason, by distance from his personal peak age.
 */
function growthRate(age: number, peakAge: number): number {
  const d = age - peakAge;
  if (d >= 0) return 0;
  if (d <= -6) return 0.30;
  if (d <= -4) return 0.28;
  if (d <= -2) return 0.22;
  return 0.13;
}

/**
 * Decline: OVR points lost per season, by years past peak. Accelerating.
 *
 * The old table topped out at -2.1 a year and was rounded to an integer before
 * being applied, so anything shallower than half a point vanished entirely and
 * a player one year past his peak lost literally nothing. Across a 20-season
 * run that produced a league where the average 34-year-old rated HIGHER than
 * the average 27-year-old — nobody was ever a declining asset, so there was
 * never a reason to move on from anyone.
 */
function declineRate(age: number, peakAge: number): number {
  const d = age - peakAge;
  if (d < 0) return 0;
  if (d === 0) return 0.25;
  if (d === 1) return 0.95;
  if (d === 2) return 1.70;
  if (d === 3) return 2.50;
  if (d === 4) return 3.30;
  if (d === 5) return 4.10;
  return 4.10 + (d - 5) * 1.30;
}

/**
 * How a year of change is distributed across a player's attributes.
 *
 * Ageing is not uniform. A 34-year-old corner has lost a step but knows the
 * route concept; a 23-year-old is the reverse. Weights are normalised against
 * the position's OVR weights below, so the net OVR movement still lands on the
 * intended number no matter how the position is built.
 */
const ATHLETIC = new Set<AttrKey>(["spd", "acc", "agi", "jmp", "str", "sta", "elu"]);
const MENTAL = new Set<AttrKey>(["awr", "dec", "dsc"]);

function driftWeight(k: AttrKey, declining: boolean): number {
  if (declining) return ATHLETIC.has(k) ? 1.45 : MENTAL.has(k) ? 0.30 : 1.00;
  return ATHLETIC.has(k) ? 0.90 : MENTAL.has(k) ? 1.25 : 1.10;
}

/**
 * Round a fractional change to an integer without losing the fraction.
 *
 * Attributes are integers, so `Math.round(70 - 0.4)` is 70 and a slow decline
 * never happens at all. Rounding stochastically preserves the expectation: a
 * -0.4 lands as -1 four times in ten. Uses the seeded rng, so it still replays.
 */
function stochasticRound(rng: Rng, x: number): number {
  const base = Math.floor(x);
  return base + (rng.next() < x - base ? 1 : 0);
}

export function developPlayer(state: GameState, p: Player, rng: Rng): number {
  const before = p.ovr;
  const coach = p.teamId !== null ? state.teams[p.teamId].coach : null;
  const coachBonus = coach ? (coach.development - 50) / 220 : 0;

  // Staff investment first: a club that has built itself around this man buys
  // back some of the gap between what he will reach and what he could have.
  // `ceiling` moves, `pot` never does — see `lib/core/staff.ts`.
  const recovered = ceilingRecovery(state, p);
  if (recovered > 0) p.ceiling = Math.min(p.pot, p.ceiling + recovered);

  // Toward what he will actually reach, not what he was projected to reach.
  const room = Math.max(0, p.ceiling - p.ovr);
  const growing = p.age < p.peakAge;

  // Playing time accelerates development for young players.
  const line = currentLine(p, state.season);
  const snapShare = clamp(line.snaps / 700, 0, 1);

  // Both are exactly 1.0 for a club on an even staff budget with nobody named,
  // so an unallocated league develops precisely as it did before.
  const staff = developmentMultiplier(state, p) * schemeDevelopmentMultiplier(state, p);

  let delta: number;
  if (growing) {
    const rate = growthRate(p.age, p.peakAge);
    const growth = room * rate * p.devSpeed * (1 + coachBonus + snapShare * 0.35) * staff;
    delta = Math.min(rng.normal(growth, 0.9), room);
  } else {
    const wear = 1 + (1 - p.durability / 100) * 0.6;
    // A well-funded training staff does not stop a man ageing, it slows it.
    const kept = p.teamId !== null ? declineMultiplier(state.teams[p.teamId]) : 1;
    const decline = -declineRate(p.age, p.peakAge) * wear * (1 - coachBonus * 0.4) * kept;
    delta = rng.normal(decline, 0.9);
  }

  // Spread the change over the attributes that define the position, weighted so
  // athleticism and technique move at different speeds, and normalised so the
  // resulting OVR change is the delta we actually intended.
  const rel = relevantAttrs(p.pos);
  const w = POSITION_WEIGHTS[p.pos];
  let wBar = 0;
  for (const k of rel) wBar += (w[k] ?? 0) * driftWeight(k, delta < 0);
  if (wBar > 0) {
    for (const k of rel) {
      const share = (delta * driftWeight(k, delta < 0)) / wBar;
      p.attrs[k] = clamp(stochasticRound(rng, p.attrs[k] + share), 15, 99);
    }
  }

  // Raw athleticism fades whether or not the position is graded on it — a
  // 35-year-old guard is slower even though nobody was ever timing him.
  if (!growing) {
    const fade = -declineRate(p.age, p.peakAge) * 0.35;
    for (const k of ["spd", "acc", "agi", "jmp"] as const) {
      if (rel.includes(k)) continue;
      p.attrs[k] = clamp(stochasticRound(rng, p.attrs[k] + fade), 15, 99);
    }
  }

  refreshOvr(p);

  // Potential is a wall, and until now it wasn't one.
  //
  // Growth is capped at `room = ceiling - ovr`, so the INTENDED delta can never
  // break the ceiling. The realised one could: the delta is spread across the
  // position's attributes, each is stochastically rounded to an integer and
  // clamped to 15..99, and the recomposed OVR lands a little either side of
  // what was asked for. Every one of those steps is correct on its own and the
  // error is unbiased, but half the time it lands high, and nothing walked it
  // back — `pot` was only reconciled at peak age, where the line
  // `p.pot = Math.max(p.ovr, ...)` silently RAISED potential to meet whatever
  // the player had already become. Potential quietly followed ability upward
  // instead of bounding it.
  //
  // Measured at ~5% of all player-seasons in a league with no staff investment
  // at all, so this predates the budget system. It matters much more now: the
  // entire argument that development spending cannot manufacture a roster of
  // late-round Pro Bowlers rests on `pot` being a hard stop.
  if (p.ovr > p.pot) {
    const overshoot = p.ovr - p.pot;
    const rel2 = relevantAttrs(p.pos);
    for (const k of rel2) p.attrs[k] = clamp(p.attrs[k] - overshoot, 15, 99);
    refreshOvr(p);
  }

  // Potential converges toward realised ability as a player ages.
  if (p.age >= p.peakAge) {
    p.pot = Math.max(p.ovr, p.pot - rng.int(0, 2));
    p.ceiling = Math.max(p.ovr, Math.min(p.ceiling, p.pot));
  }
  return p.ovr - before;
}

/** Probability a player hangs it up this offseason. */
function retirementChance(p: Player): number {
  if (p.age < 28) return 0;
  const ageFactor = Math.pow((p.age - 27) / 10, 1.8);
  const abilityFactor = clamp((72 - p.ovr) / 40, -0.25, 1);
  const noContract = p.teamId === null ? 0.22 : 0;
  return clamp(ageFactor * 0.55 + abilityFactor * 0.30 + noContract, 0, 0.97);
}

export interface OffseasonReport {
  retirements: { player: Player; age: number }[];
  risers: { player: Player; delta: number }[];
  fallers: { player: Player; delta: number }[];
  expiring: Player[];
}

/**
 * Extra chance a man who could not find a club walks away.
 *
 * Nobody spends a career waiting for a call. Without this the unsigned pool
 * only ever grows — measured at 258 free agents after one season and 542 after
 * twelve, none of them ever leaving — which bloats the save and slows every
 * scan over `state.players` in the bargain.
 *
 * Scaled by how far below replacement he is and by age, so a 24-year-old who
 * just missed a roster hangs around for another camp while a 31-year-old who
 * nobody wanted is finished. Zero for anyone under contract.
 */
export function unsignedAttrition(p: Player): number {
  if (p.teamId !== null || p.retired || p.prospect) return 0;
  const old = clamp((p.age - 26) / 8, 0, 1);
  if (p.draftedRound === null) {
    const belowReplacement = clamp((REPLACEMENT_OVR + 4 - p.ovr) / 12, 0, 1);
    return clamp(0.18 + belowReplacement * 0.45 + old * 0.35, 0, 0.9);
  }
  const belowReplacement = clamp((REPLACEMENT_OVR - p.ovr) / 12, 0, 1);
  return clamp(belowReplacement * 0.45 + old * 0.50, 0, 0.9);
}

export function runProgression(state: GameState, rng: Rng): OffseasonReport {
  const report: OffseasonReport = { retirements: [], risers: [], fallers: [], expiring: [] };

  for (const p of state.players) {
    if (p.retired || p.prospect) continue;

    p.age += 1;
    p.yearsPro += 1;
    // Not wiped. A knee in December is not fine in September.
    healOffseason(p);

    const delta = developPlayer(state, p, rng);
    if (delta >= 3) report.risers.push({ player: p, delta });
    if (delta <= -3) report.fallers.push({ player: p, delta });

    if (rng.chance(retirementChance(p) + unsignedAttrition(p))) {
      p.retired = true;
      p.teamId = null;
      p.contract = null;
      report.retirements.push({ player: p, age: p.age });
    }
  }

  report.risers.sort((a, b) => b.delta - a.delta);
  report.fallers.sort((a, b) => a.delta - b.delta);
  report.retirements.sort((a, b) => b.player.ovr - a.player.ovr);
  return report;
}

// ---------------------------------------------------------------------------
// Awards + history
// ---------------------------------------------------------------------------

function bestBy(state: GameState, score: (p: Player) => number): number | null {
  let best: Player | null = null;
  let bestScore = -Infinity;
  for (const p of state.players) {
    if (p.prospect || p.retired) continue;
    const line = p.stats.find((s) => s.season === state.season);
    if (!line || line.games === 0) continue;
    const s = score(p);
    if (s > bestScore) { bestScore = s; best = p; }
  }
  return best ? best.id : null;
}

export function recordSeasonHistory(state: GameState): SeasonHistory {
  const recs = computeRecords(state, state.season);
  const standings = leagueStandings(state, state.season);
  const champion = state.playoffs?.championId ?? -1;

  const sb = state.games.find(
    (g) => g.season === state.season && g.playoffRound === "SB" && g.played
  );
  const runnerUp = sb
    ? (sb.homeScore > sb.awayScore ? sb.awayId : sb.homeId)
    : -1;

  const lineOf = (p: Player) => p.stats.find((s) => s.season === state.season);

  const history: SeasonHistory = {
    season: state.season,
    championId: champion,
    runnerUpId: runnerUp,
    standings: standings.map((r) => ({ ...r })),
    awards: {
      mvp: bestBy(state, (p) => {
        const l = lineOf(p);
        if (!l) return -Infinity;
        const teamWins = p.teamId !== null ? recs.get(p.teamId)!.w : 0;
        return l.passYds * 0.055 + l.passTd * 5.5 - l.passInt * 3
          + l.rushYds * 0.075 + l.rushTd * 5.5
          + l.recYds * 0.065 + l.recTd * 5 + teamWins * 2.2;
      }),
      opoy: bestBy(state, (p) => {
        const l = lineOf(p);
        if (!l || p.pos === "QB") return -Infinity;
        return l.rushYds * 0.09 + l.rushTd * 6 + l.recYds * 0.085 + l.recTd * 6;
      }),
      dpoy: bestBy(state, (p) => {
        const l = lineOf(p);
        if (!l) return -Infinity;
        return l.sacks * 9 + l.ints * 11 + l.tackles * 0.55 + l.ff * 5 + l.passDef * 1.5;
      }),
      roy: bestBy(state, (p) => {
        if (p.yearsPro !== 0) return -Infinity;
        const l = lineOf(p);
        if (!l) return -Infinity;
        return l.passYds * 0.05 + l.passTd * 5 - l.passInt * 3 + l.rushYds * 0.07
          + l.rushTd * 5 + l.recYds * 0.06 + l.recTd * 5
          + l.sacks * 8 + l.ints * 9 + l.tackles * 0.5;
      }),
    },
    leaders: {
      passYds: bestBy(state, (p) => lineOf(p)?.passYds ?? -Infinity),
      rushYds: bestBy(state, (p) => lineOf(p)?.rushYds ?? -Infinity),
      recYds: bestBy(state, (p) => lineOf(p)?.recYds ?? -Infinity),
      sacks: bestBy(state, (p) => lineOf(p)?.sacks ?? -Infinity),
    },
  };

  // Stamp award winners onto the players themselves for their career page.
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const stamp = (id: number | null, label: string) => {
    if (id == null) return;
    byId.get(id)?.careerAwards.push(`${state.season} ${label}`);
  };
  stamp(history.awards.mvp, "MVP");
  stamp(history.awards.opoy, "Offensive Player of the Year");
  stamp(history.awards.dpoy, "Defensive Player of the Year");
  stamp(history.awards.roy, "Rookie of the Year");
  if (champion >= 0) {
    for (const p of state.players) {
      if (p.teamId === champion && !p.prospect && !p.retired) {
        p.careerAwards.push(`${state.season} Champion`);
      }
    }
  }

  return history;
}
