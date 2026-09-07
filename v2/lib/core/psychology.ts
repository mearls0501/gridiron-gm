import { marketApy } from "./generate";
import { playerName } from "./ratings";
import { Rng } from "./rng";
import { formatMoney, isActiveRoster, startSeason } from "./select";
import {
  GameState,
  Player,
  PlayerPsychology,
  PsychReason,
  STARTERS,
  TRADE_DEADLINE_WEEK,
} from "./types";

/**
 * Minimal player psychology: contract-year notes, holdouts, and trade
 * requests driven by role vs rating vs money. No morale slider.
 *
 * All draws come from a child stream keyed (seed, season, week, 'psychology').
 * `state.rngState` is not read or written.
 *
 * Proposed defaults — flag for Matt (escalate class). Conservative, and
 * untraced: nfl-reference.md has no holdout / trade-request block. A
 * contract-year availability nudge would have to live in injuries.ts or
 * game.ts and would move the parent stream; this module is briefing +
 * flags only.
 */

/** OVR floor for a money holdout. Starters on cheap clubs, not the 53. */
export const HOLDOUT_OVR = 76;
/** Paid-to-market ratio below this, plus HOLDOUT_OVR, can hold out. */
export const HOLDOUT_PAY = 0.62;
/** Per-eligible chance a qualifying star files a holdout. */
export const HOLDOUT_P = 0.16;
/** League cap on new holdouts in one evaluation. */
export const HOLDOUT_CAP = 12;

/** OVR floor for a snap-share / bench trade request. */
export const TRADE_OVR = 74;
/** How close to the last starter before a bench player complains. */
export const TRADE_OVR_GAP = 3;
/** Per-eligible chance a buried starter-caliber player asks out. */
export const TRADE_ROLE_P = 0.11;
/** Per-eligible chance a money-only veteran asks out (no holdout). */
export const TRADE_MONEY_P = 0.05;
/** League cap on new trade requests in one evaluation. */
export const TRADE_CAP = 14;

/** Rookie-scale deals do not hold out. */
export const ROOKIE_SCALE_YEARS = 3;
/** User-desk plant: file the loudest eligible complaint if nobody has. */
export const USER_PLANT_SCORE = 0.32;

const SKIP_POS = new Set(["K", "P"]);

export function psychologyChildRng(state: GameState): Rng {
  return childRng(state.seed, state.season, state.week, "psychology");
}

function childRng(seed: number, season: number, week: number, tag: string): Rng {
  let h = seed >>> 0;
  h = Math.imul(h ^ season, 0x9e3779b9);
  h = Math.imul(h ^ (week + 1), 0x85ebca6b);
  for (let i = 0; i < tag.length; i++) h = Math.imul(h ^ tag.charCodeAt(i), 0xc2b2ae35);
  return new Rng((h >>> 0) || 0x9e3779b9);
}

/** Remaining-deal APY. Same shape as the draft compensatory helper. */
export function contractApy(p: Player): number {
  const c = p.contract;
  if (!c || c.yearsRemaining <= 0) return 0;
  const base = c.baseSalary.slice(0, c.yearsRemaining).reduce((a, b) => a + b, 0);
  const elapsed = Math.max(0, c.years - c.yearsRemaining);
  const prorationYears = Math.max(0, Math.min(c.bonusProrationYears - elapsed, c.yearsRemaining));
  const annual = c.bonusProrationYears > 0 ? c.signingBonus / c.bonusProrationYears : 0;
  return Math.round((base + annual * prorationYears) / c.yearsRemaining);
}

export function marketValue(state: GameState, p: Player): number {
  return marketApy(p.ovr, p.pos, p.age, state.season, startSeason(state));
}

export function payRatio(state: GameState, p: Player): number {
  const market = marketValue(state, p);
  if (market <= 0) return 1;
  return contractApy(p) / market;
}

export function isContractYear(p: Player): boolean {
  return !!p.contract && p.contract.yearsRemaining === 1 && !p.prospect && !p.retired;
}

export function onRookieScale(p: Player): boolean {
  return p.draftedRound !== null && p.yearsPro <= ROOKIE_SCALE_YEARS;
}

function chartIndex(state: GameState, p: Player): number {
  if (p.teamId === null) return -1;
  const ids = state.teams[p.teamId]?.depthChart[p.pos] ?? [];
  return ids.indexOf(p.id);
}

export function isStarter(state: GameState, p: Player): boolean {
  const i = chartIndex(state, p);
  return i >= 0 && i < STARTERS[p.pos];
}

function lastStarterOvr(state: GameState, p: Player): number {
  if (p.teamId === null) return 0;
  const ids = (state.teams[p.teamId]?.depthChart[p.pos] ?? []).slice(0, STARTERS[p.pos]);
  let worst = 99;
  for (const id of ids) {
    const other = state.players.find((x) => x.id === id);
    if (other && other.ovr < worst) worst = other.ovr;
  }
  return worst === 99 ? 0 : worst;
}

function rostered(p: Player): boolean {
  return p.teamId !== null && !p.retired && !p.prospect && isActiveRoster(p) && !SKIP_POS.has(p.pos);
}

export function moneyDiscontent(state: GameState, p: Player): boolean {
  if (!rostered(p) || onRookieScale(p) || !p.contract) return false;
  if (p.ovr < HOLDOUT_OVR) return false;
  return payRatio(state, p) < HOLDOUT_PAY;
}

export function roleDiscontent(state: GameState, p: Player): boolean {
  if (!rostered(p) || p.yearsPro < 2) return false;
  if (p.ovr < TRADE_OVR) return false;
  if (isStarter(state, p)) return false;
  const last = lastStarterOvr(state, p);
  return last > 0 && p.ovr + TRADE_OVR_GAP >= last;
}

export function psychReason(state: GameState, p: Player): PsychReason | null {
  const money = moneyDiscontent(state, p);
  const role = roleDiscontent(state, p);
  if (money && role) return "roleAndMoney";
  if (money) return "money";
  if (role) return "role";
  return null;
}

export function discontentScore(state: GameState, p: Player): number {
  const money = moneyDiscontent(state, p) ? Math.min(1, (HOLDOUT_PAY - payRatio(state, p)) / HOLDOUT_PAY) : 0;
  const role = roleDiscontent(state, p) ? Math.min(1, (p.ovr - TRADE_OVR + 4) / 16) : 0;
  return money * 0.6 + role * 0.4;
}

function liveDemand(p: Player): boolean {
  return !!(p.psychology?.holdout || p.psychology?.tradeRequest);
}

function demandResolved(state: GameState, p: Player): boolean {
  const psy = p.psychology;
  if (!psy || !liveDemand(p)) return true;
  if (p.teamId === null || p.retired || p.prospect) return true;
  if (psy.teamId !== undefined && psy.teamId !== p.teamId) return true;
  if (psy.holdout && !moneyDiscontent(state, p) && payRatio(state, p) >= HOLDOUT_PAY + 0.08) return true;
  if (psy.tradeRequest && isStarter(state, p) && !moneyDiscontent(state, p)) return true;
  return false;
}

function clearDemand(p: Player): void {
  if (!p.psychology) return;
  p.psychology.holdout = false;
  p.psychology.tradeRequest = false;
}

function fileDemand(
  state: GameState,
  p: Player,
  kind: "holdout" | "tradeRequest",
  reason: PsychReason,
): void {
  p.psychology = {
    holdout: kind === "holdout",
    tradeRequest: kind === "tradeRequest",
    reason,
    filedSeason: state.season,
    filedWeek: state.week,
    teamId: p.teamId ?? undefined,
  };
  if (p.teamId === state.userTeamId) {
    const verb = kind === "holdout" ? "Holdout" : "Trade request";
    state.log.push({
      season: state.season,
      week: state.week,
      kind: "transaction",
      text: `${verb}: ${playerName(p)} (${p.pos}) — ${reasonLabel(reason)}.`,
    });
  }
}

export function reasonLabel(reason: PsychReason): string {
  if (reason === "money") return "wants to be paid with the market";
  if (reason === "role") return "wants a starting role";
  return "wants snaps and a new deal";
}

export function plantDemand(
  state: GameState,
  playerId: number,
  kind: "holdout" | "tradeRequest",
  reason: PsychReason = kind === "holdout" ? "money" : "role",
): boolean {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return false;
  fileDemand(state, p, kind, reason);
  return true;
}

export function resolveDemand(state: GameState, playerId: number): boolean {
  const p = state.players.find((x) => x.id === playerId);
  if (!p?.psychology || !liveDemand(p)) return false;
  clearDemand(p);
  return true;
}

function holdoutEligible(state: GameState, p: Player): boolean {
  if (liveDemand(p) || !moneyDiscontent(state, p)) return false;
  return isStarter(state, p) || p.ovr >= HOLDOUT_OVR + 4;
}

function tradeEligible(state: GameState, p: Player): boolean {
  if (liveDemand(p)) return false;
  return roleDiscontent(state, p) || (moneyDiscontent(state, p) && p.yearsPro >= 4);
}

/**
 * Evaluate locker-room demands for this (season, week). Child stream only.
 * Idempotent: a second call in the same week is a no-op.
 */
export function runPsychology(state: GameState): void {
  if (state.psychTick?.season === state.season && state.psychTick?.week === state.week) return;

  for (const p of state.players) {
    if (liveDemand(p) && demandResolved(state, p)) clearDemand(p);
  }

  const rng = psychologyChildRng(state);
  const ordered = state.players.filter(rostered).slice().sort((a, b) => a.id - b.id);

  let newHoldouts = 0;
  let newTrades = 0;
  for (const p of ordered) {
    if (liveDemand(p)) continue;
    const reason = psychReason(state, p);
    if (!reason) continue;

    if (holdoutEligible(state, p) && newHoldouts < HOLDOUT_CAP && rng.chance(HOLDOUT_P)) {
      fileDemand(state, p, "holdout", reason === "role" ? "money" : reason);
      newHoldouts++;
      continue;
    }
    const pTrade = reason === "role" || reason === "roleAndMoney" ? TRADE_ROLE_P : TRADE_MONEY_P;
    if (tradeEligible(state, p) && newTrades < TRADE_CAP && rng.chance(pTrade)) {
      fileDemand(state, p, "tradeRequest", reason);
      newTrades++;
    }
  }

  plantUserDesk(state);
  state.psychTick = { season: state.season, week: state.week };
}

/** Guarantee the GM screen has a path when someone on the roster qualifies. */
function plantUserDesk(state: GameState): void {
  const club = state.players.filter((p) => p.teamId === state.userTeamId && rostered(p));
  if (club.some(liveDemand)) return;
  let best: Player | null = null;
  let bestScore = 0;
  for (const p of club) {
    const score = discontentScore(state, p);
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  if (!best || bestScore < USER_PLANT_SCORE) return;
  const reason = psychReason(state, best);
  if (!reason) return;
  const kind = moneyDiscontent(state, best) && (isStarter(state, best) || best.ovr >= HOLDOUT_OVR)
    ? "holdout"
    : "tradeRequest";
  fileDemand(state, best, kind, reason);
}

export interface PsychologyView {
  holdouts: Player[];
  tradeRequests: Player[];
  contractYear: Player[];
}

/** Read-only desk view. No RNG, no mutation. */
export function psychologyView(state: GameState, teamId: number): PsychologyView {
  const club = state.players.filter((p) => p.teamId === teamId && !p.retired && !p.prospect);
  const holdouts = club.filter((p) => p.psychology?.holdout).sort((a, b) => b.ovr - a.ovr);
  const tradeRequests = club.filter((p) => p.psychology?.tradeRequest).sort((a, b) => b.ovr - a.ovr);
  const contractYear = club
    .filter((p) => isContractYear(p) && p.ovr >= 70)
    .sort((a, b) => b.ovr - a.ovr);
  return { holdouts, tradeRequests, contractYear };
}

export function holdoutDetail(state: GameState, p: Player): string {
  const market = marketValue(state, p);
  const apy = contractApy(p);
  const gap = Math.max(0, market - apy);
  return `${playerName(p)} (${p.pos}, ${p.ovr} OVR) is at ${formatMoney(apy)} against a ${formatMoney(market)} market${gap > 0 ? ` — ${formatMoney(gap)} light` : ""}.`;
}

export function tradeRequestDetail(state: GameState, p: Player): string {
  const reason = p.psychology?.reason ?? psychReason(state, p) ?? "role";
  const i = chartIndex(state, p);
  const slot = i >= 0 ? `${p.pos}${i + 1}` : p.pos;
  return `${playerName(p)} (${p.pos}, ${p.ovr} OVR) is ${slot} and ${reasonLabel(reason)}.`;
}

export function demandNearDeadline(state: GameState): boolean {
  return state.phase === "regular" && state.week >= TRADE_DEADLINE_WEEK - 1;
}

/**
 * League-wide counts for the frequency harness. Does not write.
 */
export function psychologyCensus(state: GameState): { holdouts: number; tradeRequests: number; contractYear: number } {
  let holdouts = 0;
  let tradeRequests = 0;
  let contractYear = 0;
  for (const p of state.players) {
    if (p.teamId === null || p.retired || p.prospect) continue;
    if (p.psychology?.holdout) holdouts++;
    if (p.psychology?.tradeRequest) tradeRequests++;
    if (isContractYear(p)) contractYear++;
  }
  return { holdouts, tradeRequests, contractYear };
}
