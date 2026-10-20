import {
  GameState, Player, Position, Team, TeamRecord, Contract,
  REGULAR_SEASON_WEEKS, ROSTER_LIMIT, rosterLimit, salaryCap,
} from "./types";

/**
 * Read-only queries over GameState.
 *
 * These build indexes on demand rather than caching on the state object, so a
 * save file stays pure data. Rosters are ~1,900 players — a linear scan is
 * sub-millisecond and not worth the invalidation bugs a cache would introduce.
 */

export function playerMap(state: GameState): Map<number, Player> {
  const m = new Map<number, Player>();
  for (const p of state.players) m.set(p.id, p);
  return m;
}

export function getPlayer(state: GameState, id: number): Player | undefined {
  return state.players.find((p) => p.id === id);
}

export function getTeam(state: GameState, id: number): Team {
  const t = state.teams[id];
  if (!t) throw new Error(`No team with id ${id}`);
  return t;
}

export function teamRoster(state: GameState, teamId: number): Player[] {
  return state.players.filter((p) => p.teamId === teamId && !p.retired && !p.prospect);
}

/** Missing `status` is active — old saves and new signings. */
export function isActiveRoster(p: Player): boolean {
  return p.status !== "ir" && p.status !== "ps";
}

export function rosterCount(state: GameState, teamId: number): number {
  let n = 0;
  for (const p of state.players) {
    if (p.teamId === teamId && !p.retired && !p.prospect && isActiveRoster(p)) n++;
  }
  return n;
}

export function irCount(state: GameState, teamId: number): number {
  let n = 0;
  for (const p of state.players) {
    if (p.teamId === teamId && !p.retired && !p.prospect && p.status === "ir") n++;
  }
  return n;
}

export function practiceSquadCount(state: GameState, teamId: number): number {
  let n = 0;
  for (const p of state.players) {
    if (p.teamId === teamId && !p.retired && !p.prospect && p.status === "ps") n++;
  }
  return n;
}

/** Missing `state.waivers` is an empty wire — older saves load. */
export function isOnWaivers(state: GameState, playerId: number): boolean {
  return !!state.waivers?.some((w) => w.playerId === playerId);
}

export function freeAgents(state: GameState): Player[] {
  return state.players.filter(
    (p) => p.teamId === null && !p.retired && !p.prospect && !isOnWaivers(state, p.id)
  );
}

export function draftClass(state: GameState, season: number): Player[] {
  return state.players.filter((p) => p.prospect && p.draftClassSeason === season && !p.retired);
}

export function positionCount(state: GameState, teamId: number, pos: Position): number {
  let n = 0;
  for (const p of state.players) {
    if (p.teamId === teamId && p.pos === pos && !p.retired && !p.prospect && isActiveRoster(p)) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Cap
// ---------------------------------------------------------------------------

/**
 * The signing bonus is spread evenly over the first `bonusProrationYears` of
 * the deal. That annual figure is FIXED at signing — it is the total divided by
 * the proration term, and it does not change as the contract runs down.
 *
 * This used to be read as `signingBonus / bonusProrationYears` with the
 * denominator decremented every offseason, so the annual charge grew every year
 * and the final year of a five-year deal carried the whole bonus again. Cap
 * hits ran to 52% of the cap on contracts that were signed at 26%.
 */
function annualProration(c: Contract): number {
  return c.bonusProrationYears > 0 ? c.signingBonus / c.bonusProrationYears : 0;
}

function elapsedYears(c: Contract): number {
  return Math.max(0, c.years - c.yearsRemaining);
}

/**
 * Years of bonus still uncharged, including void-year remainder.
 * Existing deals keep `bonusProrationYears <= years`, so this equals the old
 * `min(bonusProrationYears - elapsed, yearsRemaining)` on that shape.
 */
export function prorationYearsUncharged(c: Contract): number {
  return Math.max(0, c.bonusProrationYears - elapsedYears(c));
}

/** Uncharged bonus dollars, including void-year remainder. */
export function remainingBonusProration(c: Contract | null): number {
  if (!c) return 0;
  return annualProration(c) * prorationYearsUncharged(c);
}

/** Expires when this offseason's FA wave opens. A playoff signing has not started yet. */
export function expiresAtRollover(c: Contract | null | undefined): boolean {
  return !!c && c.yearsRemaining === 1 && !c.startsNextLeagueYear;
}

/** Share of this year's base the current holder carries: the weeks after `weeksBefore`. */
function holderShare(c: Contract): number {
  const before = Math.min(REGULAR_SEASON_WEEKS, Math.max(0, c.weeksBefore ?? 0));
  return (REGULAR_SEASON_WEEKS - before) / REGULAR_SEASON_WEEKS;
}

/**
 * This season's cap charge for a contract: the holder's share of base salary
 * (pro rata by regular-season week) + bonus proration. A deal signed in the
 * playoffs starts next league year and charges nothing now.
 */
export function capHit(c: Contract | null): number {
  if (!c || c.yearsRemaining <= 0 || c.startsNextLeagueYear) return 0;
  const base = (c.baseSalary[0] ?? 0) * holderShare(c);
  return Math.round(base + (prorationYearsUncharged(c) > 0 ? annualProration(c) : 0));
}

/**
 * The contract's annual rate: full base + bonus proration, ignoring who held
 * it for which weeks. For prices and "highest contract" reads, not for room.
 */
export function annualCapHit(c: Contract | null): number {
  if (!c || c.yearsRemaining <= 0) return 0;
  const base = c.baseSalary[0] ?? 0;
  return Math.round(base + (prorationYearsUncharged(c) > 0 ? annualProration(c) : 0));
}

/**
 * Regular-season weeks whose games are all final, 0–18. Not `state.week`: CPU
 * trades run inside `simulateWeek` after week w's games with `week === w`,
 * while the user acts between weeks with `week === w + 1`. Preseason and the
 * offseason are 0; the playoffs are 18.
 */
export function regularWeeksPaid(state: GameState): number {
  if (state.phase === "playoffs") return REGULAR_SEASON_WEEKS;
  if (state.phase !== "regular") return 0;
  const w = state.week;
  const current = state.games.find(
    (g) => g.season === state.season && g.playoffRound === null && g.week === w,
  );
  return Math.max(0, Math.min(REGULAR_SEASON_WEEKS, current?.played ? w : w - 1));
}

/** Base this holder has already been paid this league year. */
function basePaidSoFar(c: Contract, weeksPaid: number): number {
  const before = c.weeksBefore ?? 0;
  if (c.startsNextLeagueYear || weeksPaid <= before) return 0;
  return ((c.baseSalary[0] ?? 0) * (weeksPaid - before)) / REGULAR_SEASON_WEEKS;
}

/** What a club taking this contract on now would carry this season, bonus excluded. */
export function arrivingCapHit(state: GameState, c: Contract | null): number {
  if (!c || c.yearsRemaining <= 0 || c.startsNextLeagueYear) return 0;
  const from = Math.max(c.weeksBefore ?? 0, regularWeeksPaid(state));
  return Math.round(((c.baseSalary[0] ?? 0) * (REGULAR_SEASON_WEEKS - from)) / REGULAR_SEASON_WEEKS);
}

/** What leaving now books on the club he leaves: the weeks he was paid there. */
export function departingPaidOut(state: GameState, c: Contract | null): number {
  if (!c || c.yearsRemaining <= 0) return 0;
  return Math.round(basePaidSoFar(c, regularWeeksPaid(state)));
}

/**
 * He is leaving `teamId` (trade or cut): the weeks he was paid there stay on
 * its books, and the contract now starts at this week for whoever is next.
 */
export function settlePaidWeeks(state: GameState, p: Player, teamId: number): void {
  const c = p.contract;
  if (!c || c.startsNextLeagueYear) return;
  const paid = departingPaidOut(state, c);
  const t = state.teams[teamId];
  if (paid > 0 && t) t.salaryPaidOut = Math.round((t.salaryPaidOut ?? 0) + paid);
  const w = regularWeeksPaid(state);
  if (w > (c.weeksBefore ?? 0)) c.weeksBefore = w;
}

/**
 * A contract signed now: in season it starts at this week; in the playoffs it
 * starts next league year. A no-op in the offseason and preseason.
 */
export function startContractNow<C extends Contract>(state: GameState, c: C): C {
  if (state.phase === "playoffs") c.startsNextLeagueYear = true;
  else {
    const w = regularWeeksPaid(state);
    if (w > 0) c.weeksBefore = w;
  }
  return c;
}

/**
 * What it costs to cut this player: all remaining bonus proration accelerates
 * into this year (void-year remainder included), plus any remaining guaranteed
 * base salary.
 */
export function deadMoney(c: Contract | null): number {
  if (!c || c.yearsRemaining <= 0) return 0;
  let guaranteed = 0;
  for (let i = 0; i < Math.min(c.guaranteedYears, c.yearsRemaining); i++) {
    // This year's guarantee is only the holder's weeks; a deal that starts
    // next league year owes its first year in full.
    const share = i === 0 && !c.startsNextLeagueYear ? holderShare(c) : 1;
    guaranteed += (c.baseSalary[i] ?? 0) * share;
  }
  return Math.round(remainingBonusProration(c) + guaranteed);
}

/** Net cap change from cutting: positive means savings. */
export function capSavingsFromCut(c: Contract | null): number {
  return capHit(c) - deadMoney(c);
}

export interface CapSummary {
  cap: number;
  committed: number;
  dead: number;
  /** Base already paid this year to players since traded or cut. Not dead money. */
  paidOut: number;
  space: number;
  players: number;
  /** Unused prior-year space added to this year's room. Missing team field = 0. */
  carryover: number;
}

export function teamCap(state: GameState, teamId: number): CapSummary {
  const cap = salaryCap(state.season, startSeason(state));
  let committed = 0;
  let players = 0;
  for (const p of state.players) {
    if (p.teamId !== teamId || p.retired || p.prospect) continue;
    committed += capHit(p.contract);
    players++;
  }
  const dead = state.teams[teamId]?.deadCap ?? 0;
  const paidOut = state.teams[teamId]?.salaryPaidOut ?? 0;
  const carryover = state.teams[teamId]?.capCarryover ?? 0;
  return {
    cap,
    committed: committed + dead + paidOut,
    dead,
    paidOut,
    carryover,
    space: cap + carryover - committed - dead - paidOut,
    players,
  };
}

/** Unused room this league year, floored at 0. Includes unused prior carryover. */
export function unusedCapSpace(state: GameState, teamId: number): number {
  return Math.max(0, Math.round(teamCap(state, teamId).space));
}

/** Snapshot leftover space per club before the calendar rolls. */
export function captureCapCarryover(state: GameState): number[] {
  return state.teams.map((t) => unusedCapSpace(state, t.id));
}

/** Write captured leftovers as this league year's carryover. */
export function applyCapCarryover(state: GameState, amounts: number[]): void {
  for (let i = 0; i < state.teams.length; i++) {
    state.teams[i].capCarryover = Math.max(0, Math.round(amounts[i] ?? 0));
  }
}

/**
 * Dead money lives on the Team so it round-trips through JSON with the rest of
 * the save. (An earlier draft kept it in a WeakMap keyed by state, which would
 * have silently reset to zero every time a save was loaded — cuts would have
 * been free across sessions.)
 */
export function deadCapFor(state: GameState, teamId: number): number {
  return state.teams[teamId]?.deadCap ?? 0;
}

export function addDeadCap(state: GameState, teamId: number, amount: number): void {
  const t = state.teams[teamId];
  if (t) t.deadCap = Math.round((t.deadCap ?? 0) + amount);
}

/** FA open: the closing league year's dead money and paid-out salary are done. */
export function clearDeadCap(state: GameState): void {
  for (const t of state.teams) {
    t.deadCap = 0;
    if (t.salaryPaidOut !== undefined) delete t.salaryPaidOut;
  }
}

export function startSeason(state: GameState): number {
  return state.season - state.history.length;
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

export function blankRecord(teamId: number): TeamRecord {
  return {
    teamId, w: 0, l: 0, t: 0, pf: 0, pa: 0,
    divW: 0, divL: 0, divT: 0, confW: 0, confL: 0, confT: 0,
  };
}

export function computeRecords(state: GameState, season = state.season): Map<number, TeamRecord> {
  const recs = new Map<number, TeamRecord>();
  for (const t of state.teams) recs.set(t.id, blankRecord(t.id));

  // `state.games` only ever holds the current season — it is emptied at the
  // rollover. Asking for an earlier season used to return 32 blank records
  // silently, which is how the draft order broke. The final table for every
  // completed season is already archived on `state.history`, so use it.
  if (!state.games.some((g) => g.season === season)) {
    const archived = state.history.find((h) => h.season === season);
    if (archived) {
      for (const r of archived.standings) recs.set(r.teamId, { ...r });
    }
    return recs;
  }

  for (const g of state.games) {
    if (!g.played || g.season !== season || g.playoffRound !== null) continue;
    const home = state.teams[g.homeId];
    const away = state.teams[g.awayId];
    const hr = recs.get(g.homeId)!;
    const ar = recs.get(g.awayId)!;

    hr.pf += g.homeScore; hr.pa += g.awayScore;
    ar.pf += g.awayScore; ar.pa += g.homeScore;

    const sameDiv = home.division === away.division;
    const sameConf = home.conference === away.conference;

    if (g.homeScore > g.awayScore) {
      hr.w++; ar.l++;
      if (sameDiv) { hr.divW++; ar.divL++; }
      if (sameConf) { hr.confW++; ar.confL++; }
    } else if (g.awayScore > g.homeScore) {
      ar.w++; hr.l++;
      if (sameDiv) { ar.divW++; hr.divL++; }
      if (sameConf) { ar.confW++; hr.confL++; }
    } else {
      hr.t++; ar.t++;
      if (sameDiv) { hr.divT++; ar.divT++; }
      if (sameConf) { hr.confT++; ar.confT++; }
    }
  }
  return recs;
}

export function winPct(r: TeamRecord): number {
  const games = r.w + r.l + r.t;
  return games === 0 ? 0 : (r.w + r.t * 0.5) / games;
}

export function recordString(r: TeamRecord): string {
  return r.t > 0 ? `${r.w}-${r.l}-${r.t}` : `${r.w}-${r.l}`;
}

// ---------------------------------------------------------------------------
// Roster legality
// ---------------------------------------------------------------------------

export interface RosterIssue {
  kind: "overLimit" | "underLimit" | "positionShort" | "overCap";
  message: string;
  detail?: string;
}

export function rosterIssues(state: GameState, teamId: number): RosterIssue[] {
  const issues: RosterIssue[] = [];
  const n = rosterCount(state, teamId);
  const hold = rosterLimit(state.phase);

  if (n > hold) {
    issues.push({
      kind: "overLimit",
      message: `Roster over the limit: ${n}/${hold}`,
      detail: `Release ${n - hold} player${n - hold === 1 ? "" : "s"}.`,
    });
  } else if (n < ROSTER_LIMIT) {
    issues.push({
      kind: "underLimit",
      message: `Roster under the limit: ${n}/${hold}`,
      detail: `Sign ${ROSTER_LIMIT - n} more player${ROSTER_LIMIT - n === 1 ? "" : "s"}.`,
    });
  }

  const cap = teamCap(state, teamId);
  if (cap.space < 0) {
    issues.push({
      kind: "overCap",
      message: `Over the salary cap by ${formatMoney(-cap.space)}`,
      detail: "Release or restructure before the season starts.",
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatMoney(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${abs}`;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
