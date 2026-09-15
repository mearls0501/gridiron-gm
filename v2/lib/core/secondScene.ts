import { STARTER_GAMES } from "./outcomes";
import { Rng, clamp } from "./rng";
import { currentLine, passerRating } from "./season/stats";
import { schemeFit, schemeFor } from "./staff";
import { GameState, Player, Position, SeasonStatLine, Team } from "./types";

/**
 * The second scene ("the Darnold path").
 *
 * One child-stream redraw of `ceiling` after a bust played badly, changed
 * clubs, and actually got the job. `pot` never moves. Parent stream is not
 * read. Year 0 cannot qualify — condition 1 needs a prior starting season.
 *
 * Dials SIGNED 2026-09-14 (Matt, recommended). None trace to a primary
 * source; the lock number is `careers.secondSceneStarPct` against
 * `nfl-reference.md` §2.7 (4 of 35 = 11.4%).
 */

export const BUST_GAP = 6;
export const SCENE_FIT_DELTA = 0.25;
export const SCENE_COACH_DELTA = 15;
export const OPPORTUNITY_SNAPS = 500;
export const SECOND_SCENE_K: Partial<Record<Position, number>> = {
  QB: 0.45,
  TE: 0.35,
};
export const SECOND_SCENE_K_OTHER = 0.20;
export const SECOND_SCENE_DRAW_SD = 0.25;

export function secondSceneK(pos: Position): number {
  return SECOND_SCENE_K[pos] ?? SECOND_SCENE_K_OTHER;
}

export function isBustGap(p: Player): boolean {
  return p.pot - p.ceiling >= BUST_GAP;
}

/** Production grade for ranking starters. The engine has no EPA. */
export function starterGrade(p: Player, line: SeasonStatLine): number {
  switch (p.pos) {
    case "QB": return passerRating(line);
    case "RB": return line.rushYds + line.recYds;
    case "WR":
    case "TE": return line.recYds;
    case "EDGE":
    case "DT": return line.sacks * 10 + line.tackles;
    case "LB": return line.tackles + line.sacks * 8 + line.ints * 12;
    case "CB":
    case "S": return line.ints * 15 + line.passDef * 3 + line.tackles;
    case "K": return line.fgm * 3 + line.xpm;
    case "P": return line.puntYds;
    default: return line.snaps;
  }
}

export function isBottomThirdStarter(state: GameState, p: Player, season: number): boolean {
  const group: { id: number; grade: number }[] = [];
  for (const q of state.players) {
    if (q.pos !== p.pos || q.prospect) continue;
    const line = q.stats.find((s) => s.season === season);
    if (!line || line.gamesStarted < STARTER_GAMES) continue;
    group.push({ id: q.id, grade: starterGrade(q, line) });
  }
  if (group.length < 3) return false;
  group.sort((a, b) => b.grade - a.grade || a.id - b.id);
  const rank = group.findIndex((x) => x.id === p.id) + 1;
  if (rank <= 0) return false;
  return rank > group.length * (2 / 3);
}

export function hasBadStartingSeason(state: GameState, p: Player): boolean {
  for (const line of p.stats) {
    if (line.season >= state.season) continue;
    if (line.gamesStarted < STARTER_GAMES || line.teamId === null) continue;
    if (isBottomThirdStarter(state, p, line.season)) return true;
  }
  return false;
}

function badSeasonElsewhere(
  state: GameState, p: Player, currentTeamId: number
): { season: number; teamId: number } | null {
  for (const line of p.stats) {
    if (line.season >= state.season) continue;
    if (line.gamesStarted < STARTER_GAMES || line.teamId === null) continue;
    if (line.teamId === currentTeamId) continue;
    if (isBottomThirdStarter(state, p, line.season)) {
      return { season: line.season, teamId: line.teamId };
    }
  }
  return null;
}

function firstSeasonAtClub(p: Player, teamId: number, season: number): boolean {
  return !p.stats.some((s) => s.season < season && s.teamId === teamId);
}

function ocDevelopment(team: Team): number | null {
  const d = team.coaches?.oc?.development;
  return typeof d === "number" ? d : null;
}

export function sceneImproved(
  state: GameState, p: Player, oldTeamId: number, newTeamId: number
): boolean {
  const oldT = state.teams[oldTeamId];
  const newT = state.teams[newTeamId];
  if (!oldT || !newT) return false;
  const fitDelta = schemeFit(p, schemeFor(newT, p.pos)) - schemeFit(p, schemeFor(oldT, p.pos));
  if (fitDelta >= SCENE_FIT_DELTA) return true;
  const oldOc = ocDevelopment(oldT);
  const newOc = ocDevelopment(newT);
  if (oldOc !== null && newOc !== null && newOc >= oldOc + SCENE_COACH_DELTA) return true;
  return false;
}

function childRng(seed: number, season: number, playerId: number): Rng {
  let h = seed >>> 0;
  h = Math.imul(h ^ season, 0x9e3779b9);
  h = Math.imul(h ^ playerId, 0x85ebca6b);
  const tag = "secondScene";
  for (let i = 0; i < tag.length; i++) h = Math.imul(h ^ tag.charCodeAt(i), 0xc2b2ae35);
  return new Rng((h >>> 0) || 0x9e3779b9);
}

/**
 * If all six gates hold, redraw `ceiling` toward `pot` on a per-player
 * child stream. Returns true when the draw ran.
 */
export function maybeApplySecondScene(state: GameState, p: Player): boolean {
  if (p.secondScene || p.retired || p.prospect || p.teamId === null) return false;
  if (!isBustGap(p)) return false;
  if (p.age > p.peakAge + 1) return false;

  const team = state.teams[p.teamId];
  if (!team || team.depthChart[p.pos]?.[0] !== p.id) return false;

  const line = currentLine(p, state.season);
  if (line.snaps < OPPORTUNITY_SNAPS) return false;
  if (!firstSeasonAtClub(p, p.teamId, state.season)) return false;

  const bad = badSeasonElsewhere(state, p, p.teamId);
  if (!bad) return false;
  if (!sceneImproved(state, p, bad.teamId, p.teamId)) return false;

  const gap = p.pot - p.ceiling;
  const k = secondSceneK(p.pos);
  const rng = childRng(state.seed, state.season, p.id);
  const draw = rng.normal(gap * k, gap * SECOND_SCENE_DRAW_SD);
  const lift = clamp(draw, 0, gap);
  p.ceiling += lift;
  p.secondScene = { season: state.season, teamId: p.teamId, lift };
  state.log.push({
    season: state.season,
    week: state.week,
    kind: "milestone",
    text: `${p.firstName} ${p.lastName} has found something in ${team.city}'s offense.`,
    playerId: p.id,
  });
  return true;
}

/** One pass before `developPlayer`. Child stream only. */
export function applySecondScenes(state: GameState): void {
  for (const p of state.players) {
    if (p.retired || p.prospect) continue;
    maybeApplySecondScene(state, p);
  }
}
