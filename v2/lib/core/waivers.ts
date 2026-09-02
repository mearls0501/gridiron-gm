import { GameState, Player, POSITION_MIN, PRACTICE_SQUAD_LIMIT, rosterLimit, WaiverClaim } from "./types";
import { addDeadCap, deadMoney, getPlayer, positionCount, practiceSquadCount, rosterCount } from "./select";
import { placeOnPs, clearRosterSlot } from "./rosterStatus";
import { compareTeamsCore, leagueStandings } from "./season/standings";
import { evaluate, teamOutlook } from "./frontOffice";
import { POSITION_VALUE } from "./ratings";
import { cutPlayer, draftCapitalHold } from "./offseason/contracts";

/**
 * Waiver wire.
 *
 * Design doc Part 5: everyone cut passes through waivers before you can stash
 * him. No cash bid — inverse standings is the cost. The window is one sim
 * step (Play Week, Start the Season during cutdown, or the preseason→season
 * advance for leftovers). See docs/nfl-reference.md §4.
 */

export function waiverStandingSeason(state: GameState): number {
  return state.phase === "preseason" ? state.season - 1 : state.season;
}

/** Worst record claims first. Existing standings sort, inverted. Ungated. */
export function waiverPriority(state: GameState): number[] {
  const season = waiverStandingSeason(state);
  return leagueStandings(state, season)
    .slice()
    .sort(
      (a, b) =>
        compareTeamsCore(state, b, a, season, false) || (b.teamId - a.teamId)
    )
    .map((r) => r.teamId);
}

export function waiverWindowLabel(state: GameState): string {
  if (state.phase === "offseason-final") return "Resolves when you Start the Season.";
  if (state.phase === "preseason") return "Resolves when the season starts.";
  if (state.phase === "regular" || state.phase === "playoffs") {
    return "Resolves at the next Play Week.";
  }
  return "Resolves at the next calendar advance.";
}

export function waiverWire(state: GameState): { entry: WaiverClaim; player: Player }[] {
  const out: { entry: WaiverClaim; player: Player }[] = [];
  for (const w of state.waivers ?? []) {
    const player = getPlayer(state, w.playerId);
    if (player) out.push({ entry: w, player });
  }
  return out;
}

export function userHasClaim(entry: WaiverClaim, userTeamId: number): boolean {
  return !!entry.claims?.includes(userTeamId);
}

export function submitWaiverClaim(state: GameState, playerId: number): { ok: boolean; reason?: string } {
  const w = state.waivers?.find((x) => x.playerId === playerId);
  if (!w) return { ok: false, reason: "That player is not on waivers." };
  if (w.originalTeamId === state.userTeamId) {
    return { ok: false, reason: "You cannot claim a player you just waived." };
  }
  if (rosterCount(state, state.userTeamId) >= rosterLimit(state.phase)) {
    return { ok: false, reason: "No open roster slot — release someone first." };
  }
  if (!w.claims) w.claims = [];
  if (!w.claims.includes(state.userTeamId)) w.claims.push(state.userTeamId);
  const p = getPlayer(state, playerId);
  state.log.push({
    season: state.season,
    week: state.week,
    kind: "transaction",
    text: `${state.teams[state.userTeamId].abbr} submitted a waiver claim on ${p ? `${p.firstName} ${p.lastName}` : "a player"}`,
  });
  return { ok: true };
}

export function withdrawWaiverClaim(state: GameState, playerId: number): { ok: boolean; reason?: string } {
  const w = state.waivers?.find((x) => x.playerId === playerId);
  if (!w) return { ok: false, reason: "That player is not on waivers." };
  if (!w.claims?.includes(state.userTeamId)) {
    return { ok: false, reason: "No claim to withdraw." };
  }
  w.claims = w.claims.filter((id) => id !== state.userTeamId);
  if (w.claims.length === 0) delete w.claims;
  return { ok: true };
}

function bodyWorth(state: GameState, teamId: number, p: Player): number {
  const { posture } = teamOutlook(state, teamId);
  return evaluate(state, teamId, p, posture, POSITION_VALUE[p.pos]) + draftCapitalHold(p, state.season);
}

/** Same-position surplus worse than `incoming`, or null. Cross-position dumps are not need. */
function worseSurplus(state: GameState, teamId: number, incoming: Player): Player | null {
  const incomingWorth = bodyWorth(state, teamId, incoming);
  const roster = state.players.filter(
    (p) =>
      p.teamId === teamId &&
      p.pos === incoming.pos &&
      !p.retired &&
      !p.prospect &&
      p.status !== "ir" &&
      p.status !== "ps"
  );
  if (positionCount(state, teamId, incoming.pos) <= POSITION_MIN[incoming.pos]) return null;
  const worst = roster.slice().sort((a, b) => bodyWorth(state, teamId, a) - bodyWorth(state, teamId, b))[0];
  if (!worst) return null;
  if (bodyWorth(state, teamId, worst) < incomingWorth) return worst;
  return null;
}

function cpuWants(state: GameState, teamId: number, p: Player): boolean {
  const hold = rosterLimit(state.phase);
  if (rosterCount(state, teamId) < hold) {
    if (positionCount(state, teamId, p.pos) < POSITION_MIN[p.pos]) return true;
    return bodyWorth(state, teamId, p) > 0;
  }
  return worseSurplus(state, teamId, p) !== null;
}

function wantsClaim(state: GameState, teamId: number, p: Player, entry: WaiverClaim): boolean {
  if (teamId === entry.originalTeamId) return false;
  if (teamId === state.userTeamId) return userHasClaim(entry, teamId);
  return cpuWants(state, teamId, p);
}

function awardClaim(state: GameState, teamId: number, p: Player): boolean {
  const hold = rosterLimit(state.phase);
  if (rosterCount(state, teamId) >= hold) {
    if (teamId === state.userTeamId) return false;
    const worse = worseSurplus(state, teamId, p);
    if (!worse) return false;
    cutPlayer(state, worse.id);
  }
  if (rosterCount(state, teamId) >= hold) return false;
  p.teamId = teamId;
  clearRosterSlot(p);
  state.log.push({
    season: state.season,
    week: state.week,
    kind: "transaction",
    text: `${state.teams[teamId].abbr} claimed ${p.firstName} ${p.lastName} (${p.pos}) off waivers`,
  });
  return true;
}

function stashOrFreeAgent(state: GameState, p: Player, originalTeamId: number): void {
  if (practiceSquadCount(state, originalTeamId) < PRACTICE_SQUAD_LIMIT) {
    p.teamId = originalTeamId;
    clearRosterSlot(p);
    const parked = placeOnPs(state, p.id);
    if (parked.ok) return;
  }
  const dead = deadMoney(p.contract);
  addDeadCap(state, originalTeamId, dead);
  p.contract = null;
  p.teamId = null;
  clearRosterSlot(p);
  state.log.push({
    season: state.season,
    week: state.week,
    kind: "transaction",
    text: `${p.firstName} ${p.lastName} (${p.pos}) cleared waivers and became a free agent` +
      (dead > 0 ? ` — $${(dead / 1e6).toFixed(1)}M dead money` : ""),
  });
}

/**
 * Close the current window. Snapshot first so a club that cuts to make a
 * claim slot puts that man on the NEXT window, not this one.
 */
export function resolveWaivers(state: GameState): void {
  const pending = state.waivers ?? [];
  if (pending.length === 0) return;
  state.waivers = [];

  const order = waiverPriority(state);
  for (const entry of pending) {
    const p = getPlayer(state, entry.playerId);
    if (!p || p.retired || p.teamId !== null) continue;

    let taken = false;
    for (const teamId of order) {
      if (!wantsClaim(state, teamId, p, entry)) continue;
      if (awardClaim(state, teamId, p)) {
        taken = true;
        break;
      }
    }
    if (!taken) stashOrFreeAgent(state, p, entry.originalTeamId);
  }

  if ((state.waivers ?? []).length === 0) delete state.waivers;
}
