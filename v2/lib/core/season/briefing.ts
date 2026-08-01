import {
  Game, GameState, Player, Position, STARTERS, Team, TRADE_DEADLINE_WEEK,
  weatherLabel, isHarsh,
} from "../types";
import { computeRecords, recordString, rosterIssues, teamCap, formatMoney, ordinal } from "../select";
import { userNextGame, isOnBye } from "./engine";
import { divisionStandings } from "./standings";
import { passerRating } from "./stats";
import { playerName } from "../ratings";

/**
 * The weekly briefing: one deterministic digest of what just happened and
 * what needs doing, built entirely from state that already exists. No RNG,
 * no mutation — the same save renders the same briefing forever, which is
 * exactly the property an eventual LLM narrator would sit on top of.
 */

export interface StatLineNote {
  playerId: number;
  name: string;
  pos: Position;
  teamAbbr: string;
  line: string;      // "24/31, 312 yds, 3 TD"
  tone: "star" | "dud";
}

export interface GameStory {
  gameId: number;
  won: boolean;
  final: string;             // "Riverboats 27, Summit 20"
  turningPoint: string | null;
  stars: StatLineNote[];
  duds: StatLineNote[];
}

export interface ActionItem {
  label: string;
  detail: string;
  href: string;
  urgent: boolean;
}

export interface OpponentPreview {
  teamId: number;
  name: string;              // "Denver Summit"
  record: string;
  standing: string;          // "2nd in AFC West"
  form: string;              // "W-L-W last three"
  home: boolean;
  weather: string | null;
  stars: { name: string; pos: Position; ovr: number }[];
  out: { name: string; pos: Position; weeks: number }[];
  edges: string[];           // matchup notes, both directions
}

export interface InjuryNote {
  name: string;
  pos: Position;
  desc: string;
  weeks: number;
  starter: boolean;
}

export interface Briefing {
  yourGame: GameStory | null;
  headlines: string[];
  actionItems: ActionItem[];
  reviewItems: string[];
  opponent: OpponentPreview | null;
  onBye: boolean;
  injuries: InjuryNote[];
}

const fullName = (t: Team) => `${t.city} ${t.name}`;

function statLine(l: { passAtt: number; passCmp: number; passYds: number; passTd: number; passInt: number; rushAtt: number; rushYds: number; rushTd: number; rec: number; recYds: number; recTd: number; sacks: number; ints: number; fgm: number; fga: number }): string {
  const parts: string[] = [];
  if (l.passAtt > 0) parts.push(`${l.passCmp}/${l.passAtt}, ${l.passYds} yds, ${l.passTd} TD${l.passInt ? `, ${l.passInt} INT` : ""}`);
  if (l.rushAtt > 2) parts.push(`${l.rushAtt} car, ${l.rushYds} yds${l.rushTd ? `, ${l.rushTd} TD` : ""}`);
  if (l.rec > 0) parts.push(`${l.rec} rec, ${l.recYds} yds${l.recTd ? `, ${l.recTd} TD` : ""}`);
  if (l.sacks >= 1.5) parts.push(`${l.sacks} sacks`);
  if (l.ints > 0) parts.push(`${l.ints} INT`);
  if (l.fga > 0) parts.push(`${l.fgm}/${l.fga} FG`);
  return parts.join(" · ");
}

/** The last lead change in the second half, told from the box score. */
function findTurningPoint(state: GameState, g: Game): string | null {
  if (!g.boxScore) return null;
  let lastChange: { desc: string; teamId: number; q: number } | null = null;
  let leader: number | null = null;
  for (const p of g.boxScore.scoringPlays) {
    const now = p.homeScore > p.awayScore ? g.homeId : p.awayScore > p.homeScore ? g.awayId : null;
    if (now !== null && now !== leader) {
      leader = now;
      if (p.q >= 3) lastChange = { desc: p.desc, teamId: p.teamId, q: p.q };
    }
  }
  if (!lastChange) return null;
  const t = state.teams[lastChange.teamId];
  const when = lastChange.q === 3 ? "in the third" : lastChange.q === 4 ? "in the fourth" : "in overtime";
  return `The game turned ${when}: ${t.abbr} — ${lastChange.desc}.`;
}

function buildGameStory(state: GameState, week: number): GameStory | null {
  const g = state.games.find(
    (x) => x.season === state.season && x.week === week && x.played &&
      (x.homeId === state.userTeamId || x.awayId === state.userTeamId)
  );
  if (!g || !g.boxScore) return null;

  const home = state.teams[g.homeId];
  const away = state.teams[g.awayId];
  const won = (g.homeId === state.userTeamId) === (g.homeScore > g.awayScore) && g.homeScore !== g.awayScore;
  const winner = g.homeScore >= g.awayScore ? home : away;
  const loser = winner === home ? away : home;
  const final = `${winner.name} ${Math.max(g.homeScore, g.awayScore)}, ${loser.name} ${Math.min(g.homeScore, g.awayScore)}`;

  const byId = new Map(state.players.map((p) => [p.id, p]));
  const stars: StatLineNote[] = [];
  const duds: StatLineNote[] = [];

  for (const row of g.boxScore.players) {
    const p = byId.get(row.playerId);
    if (!p) continue;
    const abbr = state.teams[row.teamId].abbr;
    const impact =
      row.passYds * 0.04 + (row.passTd + row.rushTd + row.recTd) * 4 + row.rushYds * 0.1 +
      row.recYds * 0.1 + row.sacks * 3 + row.ints * 5 - row.passInt * 4 - row.fumblesLost * 4;
    if (impact >= 10) {
      stars.push({ playerId: p.id, name: playerName(p), pos: p.pos, teamAbbr: abbr, line: statLine(row), tone: "star" });
    }
    // Duds: only the user's own players, and only real negatives.
    if (row.teamId === state.userTeamId) {
      const badQb = row.passInt >= 2 && passerRating({ ...row, season: 0, teamId: null, games: 1, gamesStarted: 1 }) < 65;
      const badK = row.fga - row.fgm >= 2;
      const fumbler = row.fumblesLost >= 2;
      if (badQb || badK || fumbler) {
        duds.push({ playerId: p.id, name: playerName(p), pos: p.pos, teamAbbr: abbr, line: statLine(row), tone: "dud" });
      }
    }
  }
  stars.sort((a, b) => (a.teamAbbr === b.teamAbbr ? 0 : a.teamAbbr === state.teams[state.userTeamId].abbr ? -1 : 1));

  return { gameId: g.id, won, final, turningPoint: findTurningPoint(state, g), stars: stars.slice(0, 5), duds: duds.slice(0, 3) };
}

function buildHeadlines(state: GameState, week: number): string[] {
  const out: string[] = [];
  const recs = computeRecords(state);

  for (const g of state.games) {
    if (g.season !== state.season || g.week !== week || !g.played) continue;
    if (g.homeId === state.userTeamId || g.awayId === state.userTeamId) continue;
    const margin = Math.abs(g.homeScore - g.awayScore);
    const winner = state.teams[g.homeScore > g.awayScore ? g.homeId : g.awayId];
    const loser = state.teams[g.homeScore > g.awayScore ? g.awayId : g.homeId];
    const wr = recs.get(winner.id)!;
    const lr = recs.get(loser.id)!;
    if (margin >= 28) {
      // Deterministic variety: the verb hangs off the game id, so the same
      // save tells the same story forever but a slate of blowouts doesn't
      // read like a mail merge.
      const verbs = ["embarrassed", "dismantled", "routed", "steamrolled", "humiliated"];
      const verb = verbs[g.id % verbs.length];
      out.push(`${fullName(winner)} ${verb} ${loser.name} ${Math.max(g.homeScore, g.awayScore)}-${Math.min(g.homeScore, g.awayScore)}.`);
    } else if (lr.w - wr.w >= 3) {
      out.push(`Upset: ${winner.name} (${recordString(wr)}) took down ${fullName(loser)} (${recordString(lr)}).`);
    }
  }

  for (const e of state.log) {
    if (e.season !== state.season || e.week !== week) continue;
    if (e.kind === "milestone") out.push(e.text);
    else if (e.kind === "transaction" && e.text.startsWith("Trade:")) out.push(e.text);
  }
  return out.slice(0, 8);
}

function buildActionItems(state: GameState): { action: ActionItem[]; review: string[] } {
  const action: ActionItem[] = [];
  const review: string[] = [];
  const team = state.teams[state.userTeamId];

  const offers = state.tradeOffers ?? [];
  if (offers.length > 0) {
    const nearDeadline = state.phase === "regular" && state.week >= TRADE_DEADLINE_WEEK - 1;
    action.push({
      label: `${offers.length} trade offer${offers.length > 1 ? "s" : ""} on the table`,
      detail: nearDeadline ? "The deadline is this week — decide now or lose the window." : "A club is waiting on your answer.",
      href: "/trades",
      urgent: nearDeadline,
    });
  }

  // Injured players still slotted as starters.
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const hurtStarters: Player[] = [];
  for (const pos of Object.keys(STARTERS) as Position[]) {
    for (const id of (team.depthChart[pos] ?? []).slice(0, STARTERS[pos])) {
      const p = byId.get(id);
      if (p && p.injuryWeeks > 0) hurtStarters.push(p);
    }
  }
  if (hurtStarters.length > 0) {
    action.push({
      label: `${hurtStarters.length} injured starter${hurtStarters.length > 1 ? "s" : ""} in the lineup`,
      detail: `${hurtStarters.map((p) => `${playerName(p)} (${p.pos})`).slice(0, 3).join(", ")} — promote the backup or eat the snaps.`,
      href: "/depth-chart",
      urgent: true,
    });
  }

  for (const issue of rosterIssues(state, state.userTeamId)) {
    action.push({
      label: issue.message,
      detail: issue.detail ?? "Fix before the next game.",
      href: "/roster",
      urgent: issue.kind !== "underLimit",
    });
  }

  const cap = teamCap(state, state.userTeamId);
  if (cap.space < 0) {
    action.push({ label: `Over the cap by ${formatMoney(-cap.space)}`, detail: "Restructure or release to get compliant.", href: "/finances", urgent: true });
  }

  if (team.scoutingPoints >= 20 && state.phase === "regular") {
    review.push(`${team.scoutingPoints} scouting points banked — film and workouts sharpen your draft board all season.`);
  }

  if (state.phase === "regular" && state.week <= TRADE_DEADLINE_WEEK && TRADE_DEADLINE_WEEK - state.week <= 1) {
    review.push(`The trade deadline is ${state.week === TRADE_DEADLINE_WEEK ? "THIS week" : "next week"}.`);
  }
  return { action, review };
}

/** Average OVR of the listed starters in a position group. */
function groupStrength(state: GameState, teamId: number, group: Position[]): number {
  const t = state.teams[teamId];
  const byId = new Map(state.players.map((p) => [p.id, p]));
  let sum = 0, n = 0;
  for (const pos of group) {
    for (const id of (t.depthChart[pos] ?? []).slice(0, STARTERS[pos])) {
      const p = byId.get(id);
      if (p) { sum += p.ovr; n++; }
    }
  }
  return n ? sum / n : 0;
}

const GROUPS: { name: string; positions: Position[] }[] = [
  { name: "quarterback play", positions: ["QB"] },
  { name: "skill positions", positions: ["RB", "WR", "TE"] },
  { name: "offensive line", positions: ["OT", "OG", "C"] },
  { name: "defensive front", positions: ["EDGE", "DT", "LB"] },
  { name: "secondary", positions: ["CB", "S"] },
];

function buildOpponent(state: GameState): OpponentPreview | null {
  const g = userNextGame(state);
  if (!g) return null;
  const oppId = g.homeId === state.userTeamId ? g.awayId : g.homeId;
  const opp = state.teams[oppId];
  const recs = computeRecords(state);

  const div = divisionStandings(state, opp.division);
  const rank = div.findIndex((t) => t.teamId === oppId) + 1;

  const last3 = state.games
    .filter((x) => x.season === state.season && x.played && (x.homeId === oppId || x.awayId === oppId))
    .slice(-3)
    .map((x) => ((x.homeId === oppId) === (x.homeScore > x.awayScore) && x.homeScore !== x.awayScore ? "W" : x.homeScore === x.awayScore ? "T" : "L"));

  const roster = state.players.filter((p) => p.teamId === oppId && !p.prospect);
  const stars = [...roster].sort((a, b) => b.ovr - a.ovr).slice(0, 3)
    .map((p) => ({ name: playerName(p), pos: p.pos, ovr: p.ovr }));
  const out = roster.filter((p) => p.injuryWeeks > 0).sort((a, b) => b.ovr - a.ovr).slice(0, 4)
    .map((p) => ({ name: playerName(p), pos: p.pos, weeks: p.injuryWeeks }));

  const edges: string[] = [];
  const diffs = GROUPS.map((grp) => ({
    grp,
    diff: groupStrength(state, state.userTeamId, grp.positions) - groupStrength(state, oppId, grp.positions),
  })).sort((a, b) => b.diff - a.diff);
  const best = diffs[0], worst = diffs[diffs.length - 1];
  if (best.diff >= 2) edges.push(`You hold the edge in ${best.grp.name} (+${best.diff.toFixed(1)} OVR across the starters).`);
  if (worst.diff <= -2) edges.push(`They are stronger in ${worst.grp.name} (${worst.diff.toFixed(1)} OVR) — game-plan around it.`);
  if (edges.length === 0) edges.push("Evenly matched across every position group — this one comes down to execution.");

  return {
    teamId: oppId,
    name: fullName(opp),
    record: recordString(recs.get(oppId)!),
    standing: `${ordinal(rank)} in ${opp.division}`,
    form: last3.length ? last3.join("-") : "no games yet",
    home: g.homeId === state.userTeamId,
    weather: g.conditions
      ? `${weatherLabel(g.conditions.weather)}${isHarsh(g.conditions.weather) ? " — harsh conditions, expect a ground game" : ""}`
      : null,
    stars,
    out,
    edges,
  };
}

export function buildBriefing(state: GameState): Briefing {
  const lastWeek = state.phase === "regular" ? state.week - 1 : state.phase === "playoffs" ? state.week - 1 : 0;
  const { action, review } = buildActionItems(state);
  const team = state.teams[state.userTeamId];
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const starterIds = new Set<number>();
  for (const pos of Object.keys(STARTERS) as Position[]) {
    for (const id of (team.depthChart[pos] ?? []).slice(0, STARTERS[pos])) starterIds.add(id);
  }
  const injuries = state.players
    .filter((p) => p.teamId === state.userTeamId && !p.prospect && p.injuryWeeks > 0)
    .sort((a, b) => b.ovr - a.ovr)
    .map((p) => ({
      name: playerName(p), pos: p.pos, desc: p.injuryDesc ?? "injured", weeks: p.injuryWeeks,
      starter: starterIds.has(p.id),
    }));

  return {
    yourGame: lastWeek >= 1 ? buildGameStory(state, lastWeek) : null,
    headlines: lastWeek >= 1 ? buildHeadlines(state, lastWeek) : [],
    actionItems: action,
    reviewItems: review,
    opponent: state.phase === "regular" || state.phase === "preseason" ? buildOpponent(state) : null,
    onBye: state.phase === "regular" && isOnBye(state, state.userTeamId),
    injuries,
  };
}
