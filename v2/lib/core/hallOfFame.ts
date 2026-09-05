import { GameState, Player, SeasonHistory, SeasonStatLine, TeamRecord } from "./types";
import { recordString, winPct } from "./select";

/**
 * Franchise history + Hall of Fame presenter.
 *
 * Read-only. Does not write `state.history`, awards, or retirements.
 * There is no career-AV: the save has seasons, award ids, league leaders,
 * and championships, and that is the whole rule.
 *
 * A retiree is a franchise legend when they:
 *   1. are retired,
 *   2. played at least `MIN_FRANCHISE_SEASONS` seasons with this club
 *      (`stats` rows with `teamId === club` and `games > 0`), and
 *   3. at least one of:
 *        - MVP / OPOY / DPOY in a season they played for this club
 *        - a championship with this club
 *        - a league-leading season (pass / rush / rec / sacks) with this club
 *        - `LONGEVITY_SEASONS` seasons with this club
 *
 * ROY alone does not qualify. Active players never qualify.
 * Retired numbers are omitted: players do not carry jersey numbers.
 */

export const MIN_FRANCHISE_SEASONS = 4;
export const LONGEVITY_SEASONS = 8;

export const HOF_RULE =
  "Retired, four seasons with this club, and a major award (MVP / OPOY / DPOY), " +
  "a championship, a league-leading season, or eight seasons here. " +
  "ROY alone does not qualify. No career-value score — those numbers are not on the save.";

export type AwardKey = "mvp" | "opoy" | "dpoy" | "roy";
export type LeaderKey = "passYds" | "rushYds" | "recYds" | "sacks";

export const AWARD_LABEL: Record<AwardKey, string> = {
  mvp: "MVP",
  opoy: "Offensive Player of the Year",
  dpoy: "Defensive Player of the Year",
  roy: "Rookie of the Year",
};

export const AWARD_SHORT: Record<AwardKey, string> = {
  mvp: "MVP",
  opoy: "OPOY",
  dpoy: "DPOY",
  roy: "ROY",
};

export const LEADER_LABEL: Record<LeaderKey, string> = {
  passYds: "Passing yards",
  rushYds: "Rushing yards",
  recYds: "Receiving yards",
  sacks: "Sacks",
};

export const MAJOR_AWARD_KEYS: AwardKey[] = ["mvp", "opoy", "dpoy"];
export const LEADER_KEYS: LeaderKey[] = ["passYds", "rushYds", "recYds", "sacks"];

const CAREER_AWARD_RE =
  /^(\d+)\s+(MVP|Offensive Player of the Year|Defensive Player of the Year|Champion)$/;

export type HofReason =
  | { kind: "award"; season: number; key: AwardKey; label: string }
  | { kind: "champion"; season: number }
  | { kind: "leader"; season: number; key: LeaderKey; label: string }
  | { kind: "longevity"; seasons: number };

export interface FranchiseYear {
  season: number;
  record: string | null;
  standing: TeamRecord | null;
  finish: string | null;
  champion: boolean;
  runnerUp: boolean;
  championId: number;
  runnerUpId: number;
  awards: { key: AwardKey; label: string; player: Player | null }[];
  leaders: { key: LeaderKey; label: string; player: Player | null; value: string | null }[];
}

export interface HofEntry {
  player: Player;
  seasons: number;
  firstSeason: number | null;
  lastSeason: number | null;
  reasons: HofReason[];
  championships: number;
}

export interface TimelineBeat {
  season: number;
  text: string;
}

export interface FranchiseHistoryView {
  teamId: number;
  city: string;
  name: string;
  years: FranchiseYear[];
  hallOfFame: HofEntry[];
  timeline: TimelineBeat[];
  championships: number;
  firstSeason: number | null;
  lastSeason: number | null;
  emptyHistory: boolean;
  emptyHof: boolean;
  hofRule: string;
}

export function franchiseSeasonLines(p: Player, teamId: number): SeasonStatLine[] {
  return p.stats
    .filter((s) => s.teamId === teamId && s.games > 0)
    .slice()
    .sort((a, b) => a.season - b.season);
}

export function franchiseSeasonCount(p: Player, teamId: number): number {
  return franchiseSeasonLines(p, teamId).length;
}

function playerById(state: GameState, id: number | null): Player | null {
  if (id == null) return null;
  return state.players.find((p) => p.id === id) ?? null;
}

function playedFor(p: Player, teamId: number, season: number): boolean {
  return p.stats.some((s) => s.season === season && s.teamId === teamId && s.games > 0);
}

function leaderValue(line: SeasonStatLine | undefined, key: LeaderKey): string | null {
  if (!line) return null;
  if (key === "sacks") {
    const n = line.sacks;
    return Number.isFinite(n) ? n.toFixed(n % 1 === 0 ? 0 : 1) : null;
  }
  const n = line[key];
  return Number.isFinite(n) ? String(n) : null;
}

function divisionFinish(state: GameState, teamId: number, standings: TeamRecord[]): string | null {
  const team = state.teams[teamId];
  if (!team || standings.length === 0) return null;
  const peers = state.teams
    .filter((t) => t.division === team.division)
    .map((t) => standings.find((r) => r.teamId === t.id) ?? null)
    .filter((r): r is TeamRecord => r != null)
    .sort((a, b) => winPct(b) - winPct(a) || (b.pf - b.pa) - (a.pf - a.pa));
  const rank = peers.findIndex((r) => r.teamId === teamId) + 1;
  if (rank === 0) return null;
  const suf = ["st", "nd", "rd", "th"][Math.min(rank - 1, 3)];
  return `${rank}${suf} in ${team.division}`;
}

function careerAwardReasons(p: Player, teamId: number): HofReason[] {
  const reasons: HofReason[] = [];
  for (const raw of p.careerAwards) {
    const m = CAREER_AWARD_RE.exec(raw);
    if (!m) continue;
    const season = Number(m[1]);
    if (!playedFor(p, teamId, season)) continue;
    if (m[2] === "Champion") {
      reasons.push({ kind: "champion", season });
      continue;
    }
    const key: AwardKey =
      m[2] === "MVP" ? "mvp" : m[2] === "Offensive Player of the Year" ? "opoy" : "dpoy";
    reasons.push({ kind: "award", season, key, label: AWARD_SHORT[key] });
  }
  return reasons;
}

function historyReasons(state: GameState, p: Player, teamId: number): HofReason[] {
  const reasons: HofReason[] = [];
  for (const h of state.history) {
    if (!playedFor(p, teamId, h.season)) continue;
    for (const key of MAJOR_AWARD_KEYS) {
      if (h.awards[key] === p.id) {
        reasons.push({ kind: "award", season: h.season, key, label: AWARD_SHORT[key] });
      }
    }
    if (h.championId === teamId) {
      reasons.push({ kind: "champion", season: h.season });
    }
    for (const key of LEADER_KEYS) {
      if (h.leaders[key] === p.id) {
        reasons.push({ kind: "leader", season: h.season, key, label: LEADER_LABEL[key] });
      }
    }
  }
  return reasons;
}

function dedupeReasons(reasons: HofReason[]): HofReason[] {
  const seen = new Set<string>();
  const out: HofReason[] = [];
  for (const r of reasons) {
    const id =
      r.kind === "longevity"
        ? `longevity:${r.seasons}`
        : r.kind === "champion"
          ? `champion:${r.season}`
          : `${r.kind}:${r.season}:${r.key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(r);
  }
  out.sort((a, b) => {
    const sa = a.kind === "longevity" ? 0 : a.season;
    const sb = b.kind === "longevity" ? 0 : b.season;
    return sa - sb || a.kind.localeCompare(b.kind);
  });
  return out;
}

export function hofReasons(state: GameState, p: Player, teamId: number): HofReason[] {
  const seasons = franchiseSeasonCount(p, teamId);
  const reasons = dedupeReasons([
    ...historyReasons(state, p, teamId),
    ...careerAwardReasons(p, teamId),
  ]);
  if (seasons >= LONGEVITY_SEASONS) {
    reasons.push({ kind: "longevity", seasons });
  }
  return reasons;
}

export function isHofEligible(state: GameState, p: Player, teamId: number): boolean {
  if (!p.retired || p.prospect) return false;
  const seasons = franchiseSeasonCount(p, teamId);
  if (seasons < MIN_FRANCHISE_SEASONS) return false;
  const reasons = hofReasons(state, p, teamId);
  return reasons.some((r) => r.kind !== "longevity") || seasons >= LONGEVITY_SEASONS;
}

function reasonWeight(reasons: HofReason[]): number {
  let n = 0;
  for (const r of reasons) {
    if (r.kind === "champion") n += 3;
    else if (r.kind === "award") n += 2;
    else if (r.kind === "leader") n += 1;
  }
  return n;
}

export function franchiseHallOfFame(state: GameState, teamId: number): HofEntry[] {
  const rows: HofEntry[] = [];
  for (const p of state.players) {
    if (!isHofEligible(state, p, teamId)) continue;
    const lines = franchiseSeasonLines(p, teamId);
    const reasons = hofReasons(state, p, teamId);
    rows.push({
      player: p,
      seasons: lines.length,
      firstSeason: lines[0]?.season ?? null,
      lastSeason: lines[lines.length - 1]?.season ?? null,
      reasons,
      championships: reasons.filter((r) => r.kind === "champion").length,
    });
  }
  rows.sort((a, b) => {
    const wa = reasonWeight(a.reasons);
    const wb = reasonWeight(b.reasons);
    return (
      wb - wa ||
      b.championships - a.championships ||
      b.seasons - a.seasons ||
      a.player.lastName.localeCompare(b.player.lastName) ||
      a.player.id - b.player.id
    );
  });
  return rows;
}

function presentYear(state: GameState, teamId: number, h: SeasonHistory): FranchiseYear {
  const standing = h.standings.find((r) => r.teamId === teamId) ?? null;
  const awards: FranchiseYear["awards"] = [];
  for (const key of (["mvp", "opoy", "dpoy", "roy"] as AwardKey[])) {
    const id = h.awards[key];
    const player = playerById(state, id);
    if (!player || !playedFor(player, teamId, h.season)) continue;
    awards.push({ key, label: AWARD_SHORT[key], player });
  }
  const leaders: FranchiseYear["leaders"] = [];
  for (const key of LEADER_KEYS) {
    const id = h.leaders[key];
    const player = playerById(state, id);
    if (!player || !playedFor(player, teamId, h.season)) continue;
    const line = player.stats.find((s) => s.season === h.season);
    leaders.push({
      key,
      label: LEADER_LABEL[key],
      player,
      value: leaderValue(line, key),
    });
  }
  return {
    season: h.season,
    record: standing ? recordString(standing) : null,
    standing,
    finish: standing ? divisionFinish(state, teamId, h.standings) : null,
    champion: h.championId === teamId,
    runnerUp: h.runnerUpId === teamId,
    championId: h.championId,
    runnerUpId: h.runnerUpId,
    awards,
    leaders,
  };
}

function timelineText(year: FranchiseYear): string {
  const bits: string[] = [];
  if (year.champion) bits.push("Won the championship");
  else if (year.runnerUp) bits.push("Lost the championship");
  if (year.record) bits.push(year.record);
  if (year.finish) bits.push(year.finish);
  for (const a of year.awards) {
    const name = a.player ? `${a.player.firstName} ${a.player.lastName}` : "—";
    bits.push(`${a.label}: ${name}`);
  }
  for (const l of year.leaders) {
    const name = l.player ? `${l.player.firstName} ${l.player.lastName}` : "—";
    const val = l.value ? ` (${l.value})` : "";
    bits.push(`Led ${l.label.toLowerCase()}: ${name}${val}`);
  }
  return bits.length > 0 ? bits.join(" · ") : "Season archived";
}

export function presentFranchiseHistory(
  state: GameState,
  teamId: number = state.userTeamId,
): FranchiseHistoryView {
  const team = state.teams[teamId];
  const years = [...state.history]
    .sort((a, b) => b.season - a.season)
    .map((h) => presentYear(state, teamId, h));
  const hallOfFame = franchiseHallOfFame(state, teamId);
  const timeline = [...years]
    .sort((a, b) => a.season - b.season)
    .map((y) => ({ season: y.season, text: timelineText(y) }));
  return {
    teamId,
    city: team?.city ?? "Unknown",
    name: team?.name ?? "Club",
    years,
    hallOfFame,
    timeline,
    championships: years.filter((y) => y.champion).length,
    firstSeason: years.length ? years[years.length - 1]!.season : null,
    lastSeason: years.length ? years[0]!.season : null,
    emptyHistory: years.length === 0,
    emptyHof: hallOfFame.length === 0,
    hofRule: HOF_RULE,
  };
}

export function reasonLine(r: HofReason): string {
  if (r.kind === "longevity") return `${r.seasons} seasons with the club`;
  if (r.kind === "champion") return `${r.season} Champion`;
  if (r.kind === "award") return `${r.season} ${r.label}`;
  return `${r.season} ${r.label} leader`;
}
