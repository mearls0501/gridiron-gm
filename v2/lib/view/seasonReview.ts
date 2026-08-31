import { Game, GameState, Player, SeasonHistory, SeasonStatLine } from "../core/types";
import { computeRecords, recordString } from "../core/select";

/**
 * Read-only Season Review presenter.
 *
 * Awards are taken from `state.history` when that season is already archived.
 * During `offseason-recap` the writer has not run yet, so the same scoring
 * `recordSeasonHistory` uses is applied to the season lines already on the
 * save. Nothing is written. Nothing is invented: if a category has no
 * qualifying player the slot is empty.
 */

export type AwardKey = "mvp" | "opoy" | "dpoy" | "roy";

export const AWARD_LABEL: Record<AwardKey, string> = {
  mvp: "MVP",
  opoy: "Offensive Player of the Year",
  dpoy: "Defensive Player of the Year",
  roy: "Rookie of the Year",
};

export const LEADER_LABEL = {
  passYds: "Passing yards",
  rushYds: "Rushing yards",
  recYds: "Receiving yards",
  sacks: "Sacks",
} as const;

export type LeaderKey = keyof typeof LEADER_LABEL;

export interface AwardRow {
  key: AwardKey;
  label: string;
  player: Player | null;
  teamId: number | null;
  line: string | null;
}

export interface LeaderRow {
  key: LeaderKey;
  label: string;
  player: Player | null;
  teamId: number | null;
  value: string | null;
}

export interface RetirementRow {
  player: Player | null;
  text: string;
  age: number | null;
  ovr: number | null;
}

export interface DevelopmentRow {
  player: Player;
  teamId: number | null;
  delta: number;
  thisLine: string;
  priorLine: string | null;
}

export interface UserGameRow {
  game: Game;
  opponentId: number;
  home: boolean;
  won: boolean;
  tied: boolean;
  us: number;
  them: number;
}

export interface SeasonReviewView {
  season: number;
  /** True when awards came from `history` rather than live scoring. */
  awardsArchived: boolean;
  /** True when we are still in the review phase, before Confirm writes history. */
  pendingWrite: boolean;
  championId: number | null;
  runnerUpId: number | null;
  userRecord: string;
  userFinish: string | null;
  awards: AwardRow[];
  leaders: LeaderRow[];
  retirements: RetirementRow[];
  development: DevelopmentRow[];
  userGames: UserGameRow[];
}

function lineOf(p: Player, season: number): SeasonStatLine | undefined {
  return p.stats.find((s) => s.season === season);
}

function bestBy(state: GameState, season: number, score: (p: Player) => number): number | null {
  let best: Player | null = null;
  let bestScore = -Infinity;
  for (const p of state.players) {
    if (p.prospect || p.retired) continue;
    const line = lineOf(p, season);
    if (!line || line.games === 0) continue;
    const s = score(p);
    if (s > bestScore) {
      bestScore = s;
      best = p;
    }
  }
  return best ? best.id : null;
}

/**
 * Same scoring as `recordSeasonHistory` in offseason/progression.ts.
 * Duplicated here so the recap surface can read winners without calling
 * the writer (which stamps `careerAwards` and must not run twice).
 */
function deriveAwards(state: GameState, season: number): SeasonHistory["awards"] {
  const recs = computeRecords(state, season);
  return {
    mvp: bestBy(state, season, (p) => {
      const l = lineOf(p, season);
      if (!l) return -Infinity;
      const teamWins = p.teamId !== null ? recs.get(p.teamId)!.w : 0;
      return l.passYds * 0.055 + l.passTd * 5.5 - l.passInt * 3
        + l.rushYds * 0.075 + l.rushTd * 5.5
        + l.recYds * 0.065 + l.recTd * 5 + teamWins * 2.2;
    }),
    opoy: bestBy(state, season, (p) => {
      const l = lineOf(p, season);
      if (!l || p.pos === "QB") return -Infinity;
      return l.rushYds * 0.09 + l.rushTd * 6 + l.recYds * 0.085 + l.recTd * 6;
    }),
    dpoy: bestBy(state, season, (p) => {
      const l = lineOf(p, season);
      if (!l) return -Infinity;
      return l.sacks * 9 + l.ints * 11 + l.tackles * 0.55 + l.ff * 5 + l.passDef * 1.5;
    }),
    roy: bestBy(state, season, (p) => {
      if (p.yearsPro !== 0) return -Infinity;
      const l = lineOf(p, season);
      if (!l) return -Infinity;
      return l.passYds * 0.05 + l.passTd * 5 - l.passInt * 3 + l.rushYds * 0.07
        + l.rushTd * 5 + l.recYds * 0.06 + l.recTd * 5
        + l.sacks * 8 + l.ints * 9 + l.tackles * 0.5;
    }),
  };
}

function deriveLeaders(state: GameState, season: number): SeasonHistory["leaders"] {
  return {
    passYds: bestBy(state, season, (p) => lineOf(p, season)?.passYds ?? -Infinity),
    rushYds: bestBy(state, season, (p) => lineOf(p, season)?.rushYds ?? -Infinity),
    recYds: bestBy(state, season, (p) => lineOf(p, season)?.recYds ?? -Infinity),
    sacks: bestBy(state, season, (p) => lineOf(p, season)?.sacks ?? -Infinity),
  };
}

function summarizeLine(l: SeasonStatLine): string {
  const pass = l.passYds * 0.04 + l.passTd * 4;
  const rush = l.rushYds * 0.06 + l.rushTd * 4;
  const rec = l.recYds * 0.055 + l.recTd * 4;
  const def = l.sacks * 7 + l.ints * 8 + l.tackles * 0.4;
  if (def >= pass && def >= rush && def >= rec && (l.sacks > 0 || l.ints > 0 || l.tackles > 0)) {
    return `${l.tackles} tkl, ${l.sacks} sk, ${l.ints} INT`;
  }
  if (pass >= rush && pass >= rec && l.passAtt > 0) return `${l.passYds} yds, ${l.passTd} TD, ${l.passInt} INT`;
  if (rush >= rec && l.rushAtt > 0) return `${l.rushYds} yds, ${l.rushTd} TD`;
  if (l.rec > 0) return `${l.rec} rec, ${l.recYds} yds, ${l.recTd} TD`;
  if (l.sacks > 0 || l.ints > 0 || l.tackles > 0) return `${l.tackles} tkl, ${l.sacks} sk, ${l.ints} INT`;
  return `${l.games} GP`;
}

function leaderValue(l: SeasonStatLine, key: LeaderKey): string {
  if (key === "sacks") {
    const n = l.sacks;
    return Number.isFinite(n) ? n.toFixed(n % 1 === 0 ? 0 : 1) : "—";
  }
  const n = l[key];
  return Number.isFinite(n) ? String(n) : "—";
}

function productionScore(l: SeasonStatLine): number {
  return (
    l.passYds * 0.04 + l.passTd * 4 - l.passInt * 2 +
    l.rushYds * 0.06 + l.rushTd * 4 +
    l.recYds * 0.055 + l.recTd * 4 +
    l.sacks * 7 + l.ints * 8 + l.tackles * 0.4
  );
}

function playerById(state: GameState, id: number | null): Player | null {
  if (id == null) return null;
  return state.players.find((p) => p.id === id) ?? null;
}

function teamIdFor(p: Player | null, season: number): number | null {
  if (!p) return null;
  return lineOf(p, season)?.teamId ?? p.teamId;
}

const RETIRE_RE = /^(.+) \(([A-Z]+), (\d+) OVR\) retires at (\d+)\.$/;

function parseRetirements(state: GameState, season: number): RetirementRow[] {
  const rows: RetirementRow[] = [];
  for (const e of state.log) {
    if (e.season !== season || e.kind !== "milestone") continue;
    const m = RETIRE_RE.exec(e.text);
    if (!m) continue;
    const [, name, pos, ovrStr, ageStr] = m;
    const player =
      state.players.find(
        (p) => p.pos === pos && `${p.firstName} ${p.lastName}` === name
      ) ?? null;
    const age = Number(ageStr);
    const ovr = Number(ovrStr);
    rows.push({
      player,
      text: e.text,
      age: Number.isFinite(age) ? age : null,
      ovr: Number.isFinite(ovr) ? ovr : null,
    });
  }
  return rows;
}

function deriveDevelopment(state: GameState, season: number, userTeamId: number): DevelopmentRow[] {
  const rows: DevelopmentRow[] = [];
  for (const p of state.players) {
    if (p.prospect) continue;
    const now = lineOf(p, season);
    const prior = lineOf(p, season - 1);
    if (!now || now.games === 0) continue;
    if (!prior || prior.games === 0) continue;
    const delta = productionScore(now) - productionScore(prior);
    if (!Number.isFinite(delta) || Math.abs(delta) < 8) continue;
    const mine = now.teamId === userTeamId || prior.teamId === userTeamId || p.teamId === userTeamId;
    if (!mine && Math.abs(delta) < 18) continue;
    rows.push({
      player: p,
      teamId: now.teamId ?? p.teamId,
      delta,
      thisLine: summarizeLine(now),
      priorLine: summarizeLine(prior),
    });
  }
  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const mine = rows.filter((r) =>
    r.teamId === userTeamId || r.player.teamId === userTeamId
  );
  const rest = rows.filter((r) => !mine.includes(r));
  return [...mine.slice(0, 8), ...rest.slice(0, 6)].slice(0, 12);
}

function userGames(state: GameState, season: number, teamId: number): UserGameRow[] {
  const rows: UserGameRow[] = [];
  for (const g of state.games) {
    if (!g.played || g.season !== season) continue;
    if (g.homeId !== teamId && g.awayId !== teamId) continue;
    const home = g.homeId === teamId;
    const us = home ? g.homeScore : g.awayScore;
    const them = home ? g.awayScore : g.homeScore;
    rows.push({
      game: g,
      opponentId: home ? g.awayId : g.homeId,
      home,
      won: us > them,
      tied: us === them,
      us,
      them,
    });
  }
  rows.sort((a, b) => a.game.week - b.game.week);
  return rows;
}

function recapSeason(state: GameState): number {
  if (state.phase === "offseason-recap") return state.season;
  const last = state.history[state.history.length - 1];
  if (last) return last.season;
  return state.season;
}

export function presentSeasonReview(state: GameState): SeasonReviewView {
  const season = recapSeason(state);
  const archived = state.history.find((h) => h.season === season) ?? null;
  const pendingWrite = state.phase === "offseason-recap" && archived == null;

  const awardsSrc = archived?.awards ?? (pendingWrite ? deriveAwards(state, season) : null);
  const leadersSrc = archived?.leaders ?? (pendingWrite || archived ? deriveLeaders(state, season) : null);

  const awards: AwardRow[] = (["mvp", "opoy", "dpoy", "roy"] as AwardKey[]).map((key) => {
    const id = awardsSrc ? awardsSrc[key] : null;
    const player = playerById(state, id);
    const line = player ? lineOf(player, season) : undefined;
    return {
      key,
      label: AWARD_LABEL[key],
      player,
      teamId: teamIdFor(player, season),
      line: line && line.games > 0 ? summarizeLine(line) : null,
    };
  });

  const leaders: LeaderRow[] = (Object.keys(LEADER_LABEL) as LeaderKey[]).map((key) => {
    const id = leadersSrc ? leadersSrc[key] : null;
    const player = playerById(state, id);
    const line = player ? lineOf(player, season) : undefined;
    return {
      key,
      label: LEADER_LABEL[key],
      player,
      teamId: teamIdFor(player, season),
      value: line ? leaderValue(line, key) : null,
    };
  });

  const recs = computeRecords(state, season);
  const userRec = recs.get(state.userTeamId);
  const userRecord = userRec ? recordString(userRec) : "0-0";

  let userFinish: string | null = null;
  if (userRec) {
    const div = state.teams[state.userTeamId]?.division;
    const peers = state.teams
      .filter((t) => t.division === div)
      .map((t) => recs.get(t.id)!)
      .sort((a, b) => {
        const ga = a.w + a.l + a.t;
        const gb = b.w + b.l + b.t;
        const pa = ga === 0 ? 0 : (a.w + a.t * 0.5) / ga;
        const pb = gb === 0 ? 0 : (b.w + b.t * 0.5) / gb;
        return pb - pa || (b.pf - b.pa) - (a.pf - a.pa);
      });
    const rank = peers.findIndex((r) => r.teamId === state.userTeamId) + 1;
    if (rank > 0 && div) {
      const suf = ["st", "nd", "rd", "th"][Math.min(rank - 1, 3)];
      userFinish = `${rank}${suf} in ${div}`;
    }
  }

  const championId =
    archived?.championId ?? state.playoffs?.championId ?? null;
  const runnerUpId = archived?.runnerUpId ?? (() => {
    const sb = state.games.find(
      (g) => g.season === season && g.playoffRound === "SB" && g.played
    );
    if (!sb) return null;
    return sb.homeScore > sb.awayScore ? sb.awayId : sb.homeId;
  })();

  return {
    season,
    awardsArchived: archived != null,
    pendingWrite,
    championId: championId != null && championId >= 0 ? championId : null,
    runnerUpId: runnerUpId != null && runnerUpId >= 0 ? runnerUpId : null,
    userRecord,
    userFinish,
    awards,
    leaders,
    retirements: parseRetirements(state, season),
    development: deriveDevelopment(state, season, state.userTeamId),
    userGames: userGames(state, season, state.userTeamId),
  };
}

export function hasSeasonReview(state: GameState): boolean {
  if (state.phase === "offseason-recap") return true;
  return state.history.length > 0;
}
