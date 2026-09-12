import { GameState, Player, POSITION_MIN, PRACTICE_SQUAD_LIMIT, rosterLimit, salaryCap, WaiverClaim } from "./types";
import { addDeadCap, capHit, deadMoney, getPlayer, isActiveRoster, rosterCount, startSeason } from "./select";
import { placeOnPs, clearRosterSlot } from "./rosterStatus";
import { compareTeamsCore, leagueStandings } from "./season/standings";
import { evaluate, teamOutlook, TeamOutlook } from "./frontOffice";
import { POSITION_VALUE } from "./ratings";
import { cutPlayer, draftCapitalHold } from "./offseason/contracts";

const TIME = typeof process !== "undefined" && process.env.WAIVER_TIME === "1";
let resolvePass = 0;

/**
 * Waiver wire.
 *
 * Design doc Part 5: everyone cut passes through waivers before you can stash
 * him. No cash bid — inverse standings is the cost. Play Week is one
 * window. Start the Season and the preseason→season advance close the
 * current window and keep resolving claim-cut windows in that same
 * advance until the chain settles. See docs/nfl-reference.md §4.
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

type TeamBag = {
  members: Player[];
  outlook: TeamOutlook | null;
};

type WaiverIdx = {
  byId: Map<number, Player>;
  order: Map<number, number>;
  bags: TeamBag[];
};

/** One pass over `state.players` per window. Bags stay in players-array order. */
function buildWaiverIndex(state: GameState): WaiverIdx {
  const byId = new Map<number, Player>();
  const order = new Map<number, number>();
  const bags: TeamBag[] = state.teams.map(() => ({ members: [], outlook: null }));
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    byId.set(p.id, p);
    order.set(p.id, i);
    if (p.teamId === null || p.retired || p.prospect) continue;
    bags[p.teamId].members.push(p);
  }
  return { byId, order, bags };
}

function insertMember(idx: WaiverIdx, teamId: number, p: Player): void {
  const bag = idx.bags[teamId];
  const pi = idx.order.get(p.id) ?? 1e9;
  let i = 0;
  while (i < bag.members.length && (idx.order.get(bag.members[i].id) ?? 0) < pi) i++;
  bag.members.splice(i, 0, p);
  bag.outlook = null;
}

function removeMember(idx: WaiverIdx, teamId: number, playerId: number): void {
  const bag = idx.bags[teamId];
  const i = bag.members.findIndex((x) => x.id === playerId);
  if (i >= 0) bag.members.splice(i, 1);
  bag.outlook = null;
}

function rosterN(bag: TeamBag): number {
  let n = 0;
  for (const p of bag.members) if (isActiveRoster(p)) n++;
  return n;
}

function posN(bag: TeamBag, pos: Player["pos"]): number {
  let n = 0;
  for (const p of bag.members) if (p.pos === pos && isActiveRoster(p)) n++;
  return n;
}

function psN(bag: TeamBag): number {
  let n = 0;
  for (const p of bag.members) if (p.status === "ps") n++;
  return n;
}

function spaceOf(state: GameState, bag: TeamBag, teamId: number): number {
  const cap = salaryCap(state.season, startSeason(state));
  let committed = 0;
  for (const p of bag.members) committed += capHit(p.contract);
  return cap - committed - (state.teams[teamId]?.deadCap ?? 0);
}

function bagOutlook(state: GameState, teamId: number, bag: TeamBag): TeamOutlook {
  if (!bag.outlook) bag.outlook = teamOutlook(state, teamId);
  return bag.outlook;
}

function bodyWorth(state: GameState, teamId: number, p: Player, outlook: TeamOutlook): number {
  return evaluate(state, teamId, p, outlook.posture, POSITION_VALUE[p.pos]) + draftCapitalHold(p, state.season);
}

/** Same-position surplus worse than `incoming`, or null. Cross-position dumps are not need. */
function worseSurplus(state: GameState, idx: WaiverIdx, teamId: number, incoming: Player): Player | null {
  const bag = idx.bags[teamId];
  const outlook = bagOutlook(state, teamId, bag);
  const incomingWorth = bodyWorth(state, teamId, incoming, outlook);
  const roster = bag.members.filter((p) => p.pos === incoming.pos && isActiveRoster(p));
  if (roster.length <= POSITION_MIN[incoming.pos]) return null;
  const worst = roster.slice().sort((a, b) => bodyWorth(state, teamId, a, outlook) - bodyWorth(state, teamId, b, outlook))[0];
  if (!worst) return null;
  if (bodyWorth(state, teamId, worst, outlook) < incomingWorth) return worst;
  return null;
}

function cpuWants(state: GameState, idx: WaiverIdx, teamId: number, p: Player): boolean {
  const hold = rosterLimit(state.phase);
  const bag = idx.bags[teamId];
  if (rosterN(bag) < hold) {
    if (posN(bag, p.pos) < POSITION_MIN[p.pos]) return true;
    return bodyWorth(state, teamId, p, bagOutlook(state, teamId, bag)) > 0;
  }
  return worseSurplus(state, idx, teamId, p) !== null;
}

function wantsClaim(state: GameState, idx: WaiverIdx, teamId: number, p: Player, entry: WaiverClaim): boolean {
  if (teamId === entry.originalTeamId) return false;
  if (teamId === state.userTeamId) return userHasClaim(entry, teamId);
  return cpuWants(state, idx, teamId, p);
}

function awardClaim(state: GameState, idx: WaiverIdx, teamId: number, p: Player): boolean {
  const hold = rosterLimit(state.phase);
  const incoming = capHit(p.contract);
  const bag = idx.bags[teamId];
  if (rosterN(bag) >= hold) {
    if (teamId === state.userTeamId) return false;
    const worse = worseSurplus(state, idx, teamId, p);
    if (!worse) return false;
    // Cut first, then the incoming hit must still fit. Dead money on the
    // cut lands when he clears, not here.
    if (spaceOf(state, bag, teamId) + capHit(worse.contract) < incoming) return false;
    cutPlayer(state, worse.id);
    removeMember(idx, teamId, worse.id);
  } else if (teamId !== state.userTeamId && spaceOf(state, bag, teamId) < incoming) {
    return false;
  }
  if (rosterN(idx.bags[teamId]) >= hold) return false;
  p.teamId = teamId;
  clearRosterSlot(p);
  insertMember(idx, teamId, p);
  state.log.push({
    season: state.season,
    week: state.week,
    kind: "transaction",
    text: `${state.teams[teamId].abbr} claimed ${p.firstName} ${p.lastName} (${p.pos}) off waivers`,
  });
  return true;
}

function stashOrFreeAgent(state: GameState, idx: WaiverIdx, p: Player, originalTeamId: number): void {
  const hit = capHit(p.contract);
  const bag = idx.bags[originalTeamId];
  const space = spaceOf(state, bag, originalTeamId);
  if (
    psN(bag) < PRACTICE_SQUAD_LIMIT &&
    space >= hit
  ) {
    p.teamId = originalTeamId;
    clearRosterSlot(p);
    const parked = placeOnPs(state, p.id);
    if (parked.ok) {
      insertMember(idx, originalTeamId, p);
      return;
    }
  }
  const dead = deadMoney(p.contract);
  if (space >= dead) {
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
    return;
  }
  // Cannot stash or eat the dead money. Leave him on the next window so
  // the club stays legal. Settle stops when this set stops moving.
  if (p.teamId === originalTeamId) insertMember(idx, originalTeamId, p);
  if (!state.waivers) state.waivers = [];
  if (!state.waivers.some((w) => w.playerId === p.id)) {
    state.waivers.push({ playerId: p.id, originalTeamId });
  }
}

/**
 * Close the current window. Snapshot first so a club that cuts to make a
 * claim slot puts that man on the NEXT window, not this one.
 */
export function resolveWaivers(state: GameState): boolean {
  const pending = state.waivers ?? [];
  if (pending.length === 0) return false;
  state.waivers = [];

  resolvePass++;
  const timeLabel = `resolveWaivers#${resolvePass} n=${pending.length}`;
  if (TIME) console.time(timeLabel);

  const idx = buildWaiverIndex(state);
  const order = waiverPriority(state);
  let claimed = 0;
  for (const entry of pending) {
    const p = idx.byId.get(entry.playerId);
    if (!p || p.retired || p.teamId !== null) continue;

    let taken = false;
    for (const teamId of order) {
      if (!wantsClaim(state, idx, teamId, p, entry)) continue;
      if (awardClaim(state, idx, teamId, p)) {
        taken = true;
        claimed++;
        break;
      }
    }
    if (!taken) stashOrFreeAgent(state, idx, p, entry.originalTeamId);
  }

  if ((state.waivers ?? []).length === 0) delete state.waivers;
  if (TIME) console.timeEnd(timeLabel);
  return claimed > 0;
}

/**
 * Close windows until claim-cuts stop producing a next window, or
 * the leftover set cannot move without breaking a club's cap.
 * Each call is still one snapshot; cuts made to open a claim slot
 * land on the next iteration, not this one. Bound is a chain cap,
 * not a league rate.
 */
export function settleWaivers(state: GameState): void {
  if (TIME) console.time("settleWaivers");
  resolvePass = 0;
  let prev = "";
  for (let i = 0; i < 64; i++) {
    const ids = (state.waivers ?? []).map((w) => w.playerId).sort((a, b) => a - b).join(",");
    if (!ids || ids === prev) {
      if ((state.waivers ?? []).length === 0) delete state.waivers;
      if (TIME) console.timeEnd("settleWaivers");
      return;
    }
    prev = ids;
    resolveWaivers(state);
  }
  if (TIME) console.timeEnd("settleWaivers");
}
