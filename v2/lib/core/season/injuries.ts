import { injuryRiskMultiplier, recoveryMultiplier } from "../staff";
import { Rng, clamp } from "../rng";
import { Game, GameState, Player, Position } from "../types";

/**
 * The injury model that lives outside the game.
 *
 * `sim/game.ts` handles what happens on the field — a player goes down on a
 * particular play and does not return that day. This file handles the week: who
 * else breaks down, how long everyone is out, and what a serious one costs a
 * career. It lives in its own module because the playoffs need it too, and
 * `playoffs.ts` cannot import `engine.ts` without a cycle. That is not
 * incidental — the postseason previously ran with no injuries and no healing at
 * all, so nobody got hurt in January and nobody came back for the final.
 *
 * Three things this replaces:
 *
 *  - Rolling injuries and then healing them IN THE SAME CALL, which meant every
 *    injury was one week shorter than it claimed and the most common entry in
 *    the table (bruised ribs, one week, weight 30 of 100) cost zero games.
 *  - A flat ~1.2% chance applied to all 53 players regardless of position,
 *    workload, age, or whether the club even played that week. A punter on a
 *    bye carried the same risk as a left tackle who took 65 snaps.
 *  - Wiping every injury at the season rollover, so a week-17 knee was fine by
 *    the opener and the biggest consequence in the game had no consequence.
 */

export interface InjuryEntry {
  desc: string;
  min: number;
  max: number;
  weight: number;
}

/**
 * Non-contact and cumulative injuries — the ones that don't happen on a
 * tackle. The in-game model carries the traumatic tail; this is the soft-tissue
 * and wear side, which is why it skews short.
 */
const WEEKLY_TABLE: InjuryEntry[] = [
  { desc: "Hamstring strain", min: 1, max: 3, weight: 26 },
  { desc: "Groin strain", min: 1, max: 3, weight: 18 },
  { desc: "Back spasms", min: 1, max: 2, weight: 14 },
  { desc: "Ankle sprain", min: 1, max: 3, weight: 13 },
  { desc: "Calf strain", min: 2, max: 4, weight: 9 },
  { desc: "Shoulder soreness", min: 1, max: 2, weight: 7 },
  { desc: "Quad strain", min: 2, max: 5, weight: 5 },
  { desc: "High ankle sprain", min: 3, max: 6, weight: 4 },
  { desc: "Foot fracture", min: 5, max: 10, weight: 2.5 },
  { desc: "Achilles tear", min: 22, max: 44, weight: 0.8 },
  { desc: "Torn ACL", min: 22, max: 44, weight: 0.7 },
];

/**
 * How exposed each position is over a week of practice and play. Backs and
 * receivers pull soft tissue; the trenches grind; specialists barely feature.
 */
const POSITION_RISK: Record<Position, number> = {
  QB: 1.90, RB: 2.80, WR: 1.60, TE: 2.50,
  OT: 1.95, OG: 1.95, C: 1.75,
  EDGE: 1.93, DT: 1.85, LB: 1.40, CB: 2.04, S: 1.70,
  K: 0.15, P: 0.15,
};

/**
 * How long a week's injury keeps each position out, relative to the table.
 *
 * Incidence alone cannot describe availability. A real quarterback is hit less
 * often than anyone else on the field and is still the LEAST available starter
 * in football (nfl-reference.md S6.5: 14.1 games, 34% missing four or more) —
 * he is hurt rarely and out long, and when he does go down the backup tends to
 * keep the job. Fitting the mean games missed by raising incidence alone would
 * land the right total through the wrong mechanism: too many one-week absences
 * and too few long ones.
 *
 * So incidence and duration are fitted JOINTLY, per group, against the two
 * moments S6.5 provides — mean games missed pins the total, share available for
 * 16+ games pins the split between often-and-brief and rare-and-long.
 *
 * This scales a draw that already happened; it adds no RNG draw and does not
 * touch the stream.
 */
const POSITION_DURATION: Record<Position, number> = {
  QB: 2.0, RB: 1.6, WR: 1.8, TE: 1.2,
  OT: 1.4, OG: 1.4, C: 1.4,
  EDGE: 1.4, DT: 1.4, LB: 2.0, CB: 1.6, S: 1.6,
  K: 1.0, P: 1.0,
};

/** Injuries of at least this many weeks leave a mark on a career. */
export const SERIOUS_WEEKS = 8;

/** How much of an offseason a long-term injury gets to heal into. */
export const OFFSEASON_RECOVERY_WEEKS = 26;

/**
 * Heal one week.
 *
 * Called BEFORE the new week's injuries are rolled. That ordering is the whole
 * fix: a player hurt this week has not yet sat out a game, so decrementing him
 * in the same breath refunded a week he never missed.
 */
export function healWeek(state: GameState): void {
  for (const p of state.players) {
    if (p.injuryWeeks > 0) {
      p.injuryWeeks -= 1;
      if (p.injuryWeeks <= 0) {
        p.injuryWeeks = 0;
        p.injuryDesc = null;
      }
    }
  }
}

/** Snaps each player took in the given games, for workload weighting. */
export function snapsThisWeek(games: Game[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const g of games) {
    if (!g.boxScore) continue;
    for (const s of g.boxScore.players) {
      m.set(s.playerId, (m.get(s.playerId) ?? 0) + s.snaps);
    }
  }
  return m;
}

/**
 * Roll the week's non-contact injuries.
 *
 * Risk is workload first: a man who took 60 snaps is exposed, a healthy scratch
 * is not, and a club on its bye is not exposed at all. Age and durability then
 * modulate it — a 34-year-old hamstring is not a 24-year-old hamstring, which
 * is the only place in the game where age carries a cost that isn't a rating.
 */
export function rollWeeklyInjuries(
  state: GameState, games: Game[], rng: Rng
): void {
  const snaps = snapsThisWeek(games);

  for (const p of state.players) {
    if (p.teamId === null || p.retired || p.prospect || p.injuryWeeks > 0) continue;

    const played = snaps.get(p.id) ?? 0;
    // Someone who took no snaps can still pull something in practice, but the
    // exposure is a fraction of a starter's.
    const workload = played > 0 ? clamp(played / 55, 0.25, 1.6) : 0.18;

    const durability = 1 + (70 - p.durability) / 90;
    const age = 1 + Math.max(0, p.age - 27) * 0.075;

    // What the club funds its training and medical staff. Exactly 1.0 on an
    // even staff budget, so a league that has not allocated is unchanged.
    const staff = injuryRiskMultiplier(state.teams[p.teamId]);

    const chance = 0.0205 * workload * POSITION_RISK[p.pos] * durability * age * staff;
    if (!rng.chance(clamp(chance, 0.0008, 0.09))) continue;

    const entry = rng.weighted(WEEKLY_TABLE, (e) => e.weight);
    p.injuryWeeks = Math.max(
      1,
      Math.round(
        rng.int(entry.min, entry.max) *
        POSITION_DURATION[p.pos] *
        recoveryMultiplier(state.teams[p.teamId])
      )
    );
    p.injuryDesc = entry.desc;
    if (p.injuryWeeks >= SERIOUS_WEEKS) applyWear(p, rng);

    // Reporting everything would bury every other kind of news under a hundred
    // hamstrings a week. All of the user's, and anything serious elsewhere.
    const isUser = p.teamId === state.userTeamId;
    if (!isUser && p.injuryWeeks < 4) continue;

    state.log.push({
      season: state.season,
      week: state.week,
      kind: "injury",
      text: `${p.firstName} ${p.lastName} (${state.teams[p.teamId].abbr} ${p.pos}) — ${entry.desc}, out ${p.injuryWeeks} week${p.injuryWeeks === 1 ? "" : "s"}`,
    });
  }
}

/**
 * A serious injury costs a player some of his durability permanently.
 *
 * This is what turns injuries from a weekly inconvenience into a franchise
 * consideration: a player with a history breaks down again, so "he can't stay
 * on the field" becomes a real reason not to pay him.
 */
export function applyWear(p: Player, rng: Rng): void {
  p.durability = clamp(Math.round(p.durability - rng.int(2, 7)), 10, 99);
}

/**
 * Take the durability hit for anything that turned serious during these games.
 *
 * The in-game model writes `injuryWeeks` directly and cannot reach this file,
 * so the caller snapshots who was healthy before kickoff and hands it back.
 */
export function applyGameWear(
  state: GameState, healthyBefore: Set<number>, rng: Rng
): void {
  for (const p of state.players) {
    if (!healthyBefore.has(p.id)) continue;
    if (p.injuryWeeks >= SERIOUS_WEEKS) applyWear(p, rng);
  }
}

export function healthySet(state: GameState): Set<number> {
  const s = new Set<number>();
  for (const p of state.players) if (p.injuryWeeks <= 0) s.add(p.id);
  return s;
}

/**
 * Carry injuries across the offseason instead of erasing them.
 *
 * A knee in December is not fine in September. Twenty-six weeks of recovery
 * covers everything short of the worst tear, which is exactly the intent: most
 * players report healthy, and once in a while a club opens the season without
 * its best player and has to have planned for it.
 */
export function healOffseason(p: Player): void {
  p.injuryWeeks = Math.max(0, p.injuryWeeks - OFFSEASON_RECOVERY_WEEKS);
  if (p.injuryWeeks <= 0) {
    p.injuryWeeks = 0;
    p.injuryDesc = null;
  }
}
