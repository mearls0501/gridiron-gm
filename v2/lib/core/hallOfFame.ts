import {
  GameState, HofEntry as LeagueHofEntry, Player, SeasonHistory, SeasonStatLine, TeamRecord,
} from "./types";
import { recordString, winPct } from "./select";
import {
  STARTER_GAMES, fullTimeSnapBaseline, positionRanks, snapshot,
} from "./outcomes";

/**
 * Franchise history presenter + league Hall of Fame induction.
 *
 * The franchise ring is still derived at render time and does not write
 * `state.history`, awards, or retirements. The league Hall is a recap
 * event: one class per year, five seasons after retirement, written onto
 * `state.hallOfFame`. Selection is a sort — no RNG.
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
 * League induction also requires the outcomes.ts bar: career star seasons
 * ≥ 3, or elite seasons ≥ 1, or a championship as a starter
 * (`gamesStarted >= STARTER_GAMES` on the title club that year).
 *
 * ROY alone does not qualify. Active players never qualify.
 * Retired numbers are omitted: players do not carry jersey numbers.
 */

export const MIN_FRANCHISE_SEASONS = 4;
export const LONGEVITY_SEASONS = 8;
/** Published Pro Football Hall of Fame wait: five seasons after retirement. */
export const HOF_WAIT_SEASONS = 5;
/**
 * Cap on one class. Modern-era player max has been 5; total enshrinement
 * including seniors / coaches / contributors runs ~5–8
 * (`docs/nfl-reference.md` §4). We induct players only, at most eight.
 */
export const HOF_CLASS_MAX = 8;
/** outcomes.ts star-year bar for league induction. */
export const HOF_STAR_BAR = 3;
/** outcomes.ts elite-year bar for league induction. */
export const HOF_ELITE_BAR = 1;

export const HOF_RULE =
  "Retired, four seasons with this club, and a major award (MVP / OPOY / DPOY), " +
  "a championship, a league-leading season, or eight seasons here. " +
  "ROY alone does not qualify. No career-value score — those numbers are not on the save.";

export const LEAGUE_HOF_RULE =
  "Five seasons after retirement. The franchise-legend threshold plus a league bar: " +
  "three star seasons, one elite season, or a championship as a starter. " +
  "One class per year, at most eight, selected by a sort.";

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

export function lastPlayedSeason(p: Player): number | null {
  let last: number | null = null;
  for (const s of p.stats) {
    if (s.games <= 0) continue;
    if (last == null || s.season > last) last = s.season;
  }
  return last;
}

export function retiredSeasonOf(p: Player): number | null {
  if (typeof p.retiredSeason === "number") return p.retiredSeason;
  return lastPlayedSeason(p);
}

export function starSeasonsOf(p: Player): number {
  return p.starSeasons ?? 0;
}

export function eliteSeasonsOf(p: Player): number {
  return p.eliteSeasons ?? 0;
}

export function primaryTeamId(p: Player): number | null {
  const counts = new Map<number, number>();
  for (const s of p.stats) {
    if (s.teamId == null || s.games <= 0) continue;
    counts.set(s.teamId, (counts.get(s.teamId) ?? 0) + 1);
  }
  let best: number | null = null;
  let n = -1;
  for (const [id, c] of counts) {
    if (c > n || (c === n && (best == null || id < best))) {
      best = id;
      n = c;
    }
  }
  return best;
}

export function championshipsAsStarter(state: GameState, p: Player): number {
  let n = 0;
  for (const h of state.history) {
    const line = p.stats.find(
      (s) => s.season === h.season && s.teamId === h.championId && s.gamesStarted >= STARTER_GAMES,
    );
    if (line) n++;
  }
  return n;
}

export function meetsLeagueHofBar(state: GameState, p: Player): boolean {
  return (
    starSeasonsOf(p) >= HOF_STAR_BAR ||
    eliteSeasonsOf(p) >= HOF_ELITE_BAR ||
    championshipsAsStarter(state, p) >= 1
  );
}

export function isWaitComplete(state: GameState, p: Player): boolean {
  const year = retiredSeasonOf(p);
  if (year == null) return false;
  return state.season >= year + HOF_WAIT_SEASONS;
}

export function isLeagueHofCandidate(state: GameState, p: Player): boolean {
  if (!p.retired || p.prospect) return false;
  const teams = new Set<number>();
  for (const s of p.stats) {
    if (s.teamId != null && s.games > 0) teams.add(s.teamId);
  }
  let franchise = false;
  for (const teamId of teams) {
    if (isHofEligible(state, p, teamId)) {
      franchise = true;
      break;
    }
  }
  return franchise && meetsLeagueHofBar(state, p);
}

function bestFranchiseReasonWeight(state: GameState, p: Player): number {
  let best = 0;
  const teams = new Set<number>();
  for (const s of p.stats) {
    if (s.teamId != null && s.games > 0) teams.add(s.teamId);
  }
  for (const teamId of teams) {
    const w = reasonWeight(hofReasons(state, p, teamId));
    if (w > best) best = w;
  }
  return best;
}

function leagueHofScore(state: GameState, p: Player): number {
  return (
    eliteSeasonsOf(p) * 100 +
    starSeasonsOf(p) * 10 +
    championshipsAsStarter(state, p) * 30 +
    bestFranchiseReasonWeight(state, p)
  );
}

export function compareHofCandidates(state: GameState, a: Player, b: Player): number {
  return (
    leagueHofScore(state, b) - leagueHofScore(state, a) ||
    championshipsAsStarter(state, b) - championshipsAsStarter(state, a) ||
    (b.stats.length - a.stats.length) ||
    a.lastName.localeCompare(b.lastName) ||
    a.id - b.id
  );
}

/**
 * Count this season's star / elite labels onto each active player.
 *
 * Called from recap BEFORE progression so OVR is still the season just
 * played — the same moment `scripts/careers.ts` snapshots.
 */
export function tickHofCareerLabels(state: GameState): void {
  const ranks = positionRanks(state, state.season);
  const baseline = fullTimeSnapBaseline(state, state.season);
  for (const p of state.players) {
    if (p.prospect || p.retired) continue;
    const line = p.stats.find((s) => s.season === state.season);
    if (!line || line.snaps <= 0) continue;
    const snap = snapshot(p, state.season, p.draftClassSeason ?? state.season, baseline, ranks);
    if (snap.star) p.starSeasons = starSeasonsOf(p) + 1;
    if (snap.elite) p.eliteSeasons = eliteSeasonsOf(p) + 1;
  }
}

function toLeagueEntry(state: GameState, p: Player): LeagueHofEntry {
  const teamId = primaryTeamId(p);
  const lines = teamId != null
    ? franchiseSeasonLines(p, teamId)
    : p.stats.filter((s) => s.games > 0).slice().sort((a, b) => a.season - b.season);
  const reasons = teamId != null ? hofReasons(state, p, teamId) : [];
  return {
    playerId: p.id,
    inductedSeason: state.season,
    teamId,
    seasons: lines.length,
    firstSeason: lines[0]?.season ?? lastPlayedSeason(p),
    lastSeason: lines[lines.length - 1]?.season ?? lastPlayedSeason(p),
    championships: reasons.filter((r) => r.kind === "champion").length,
  };
}

export function runHofInduction(state: GameState): LeagueHofEntry[] {
  const hall = state.hallOfFame ?? (state.hallOfFame = []);
  if (hall.some((e) => e.inductedSeason === state.season)) return [];
  const already = new Set(hall.map((e) => e.playerId));
  const eligible = state.players.filter(
    (p) => !already.has(p.id) && isWaitComplete(state, p) && isLeagueHofCandidate(state, p),
  );
  eligible.sort((a, b) => compareHofCandidates(state, a, b));
  const clas = eligible.slice(0, HOF_CLASS_MAX);
  const inducted: LeagueHofEntry[] = [];
  for (const p of clas) {
    const entry = toLeagueEntry(state, p);
    hall.push(entry);
    inducted.push(entry);
    state.log.push({
      season: state.season,
      week: 0,
      kind: "milestone",
      playerId: p.id,
      text: `${p.firstName} ${p.lastName} (${p.pos}) is inducted into the Hall of Fame.`,
    });
  }
  return inducted;
}

export function hofInducteesPerClass(state: GameState): number {
  const hall = state.hallOfFame ?? [];
  if (hall.length === 0) return 0;
  const by = new Map<number, number>();
  for (const e of hall) by.set(e.inductedSeason, (by.get(e.inductedSeason) ?? 0) + 1);
  const sizes = [...by.values()];
  return sizes.reduce((a, b) => a + b, 0) / sizes.length;
}

export interface LeagueHofInducteeView {
  entry: LeagueHofEntry;
  player: Player | null;
}

export interface LeagueHofClassView {
  season: number;
  inductees: LeagueHofInducteeView[];
}

export interface LeagueHallView {
  classes: LeagueHofClassView[];
  inducteeCount: number;
  classCount: number;
  empty: boolean;
  rule: string;
}

export function presentLeagueHall(state: GameState): LeagueHallView {
  const by = new Map<number, LeagueHofEntry[]>();
  for (const e of state.hallOfFame ?? []) {
    const arr = by.get(e.inductedSeason) ?? [];
    arr.push(e);
    by.set(e.inductedSeason, arr);
  }
  const classes: LeagueHofClassView[] = [...by.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([season, rows]) => ({
      season,
      inductees: rows
        .slice()
        .sort((a, b) => a.playerId - b.playerId)
        .map((entry) => ({
          entry,
          player: state.players.find((p) => p.id === entry.playerId) ?? null,
        })),
    }));
  return {
    classes,
    inducteeCount: (state.hallOfFame ?? []).length,
    classCount: classes.length,
    empty: classes.length === 0,
    rule: LEAGUE_HOF_RULE,
  };
}
