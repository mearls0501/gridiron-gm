import { playerName } from "../core/ratings";
import { preseasonFor, preseasonWeeksLeft } from "../core/preseason";
import { CampLine, GameState, PRESEASON_WEEKS, PreseasonPlan } from "../core/types";

/**
 * Hub / roster read of camp's preseason. Display only. Results and camp lines
 * are for information: in this packet they do not change who is cut.
 */

export const PRESEASON_PLAN_LABEL: Record<PreseasonPlan, string> = {
  sit: "Sit the starters",
  series: "Starters play one series",
  quarter: "Starters play the first quarter",
};

export interface PreseasonResultRow {
  week: number;
  opp: string;
  home: boolean;
  us: number;
  them: number;
  outcome: "W" | "L" | "T";
}

export interface CampLeaderRow {
  playerId: number;
  name: string;
  pos: string;
  snaps: number;
  line: string;
}

export interface PreseasonView {
  weeksPlayed: number;
  weeksLeft: number;
  /** Next week to play, or null once all three are done. */
  nextWeek: number | null;
  userPlan: PreseasonPlan;
  results: PreseasonResultRow[];
  leaders: CampLeaderRow[];
}

/** One short production phrase for a camp line, by what he did most. */
export function campLineText(line: CampLine | undefined): string {
  if (!line) return "—";
  const bits: string[] = [];
  if (line.passAtt) bits.push(`${line.passCmp ?? 0}/${line.passAtt}, ${line.passYds ?? 0} yds${line.passTd ? `, ${line.passTd} TD` : ""}${line.passInt ? `, ${line.passInt} INT` : ""}`);
  if (line.rushAtt) bits.push(`${line.rushAtt} car, ${line.rushYds ?? 0} yds${line.rushTd ? `, ${line.rushTd} TD` : ""}`);
  if (line.rec) bits.push(`${line.rec} rec, ${line.recYds ?? 0} yds${line.recTd ? `, ${line.recTd} TD` : ""}`);
  if (line.tackles) bits.push(`${line.tackles} tkl`);
  if (line.sacks) bits.push(`${line.sacks} sk`);
  if (line.ints) bits.push(`${line.ints} INT`);
  if (line.passDef) bits.push(`${line.passDef} PD`);
  if (line.fga) bits.push(`${line.fgm ?? 0}/${line.fga} FG`);
  return bits.length ? bits.join(" · ") : "—";
}

export function preseasonView(state: GameState, leaderCount = 12): PreseasonView | null {
  if (state.phase !== "offseason-final" && state.phase !== "preseason") return null;
  const ps = preseasonFor(state);
  const weeksPlayed = ps?.week ?? 0;
  const weeksLeft = state.phase === "offseason-final" ? preseasonWeeksLeft(state) : 0;
  const me = state.userTeamId;
  const results: PreseasonResultRow[] = (ps?.games ?? [])
    .filter((g) => g.homeId === me || g.awayId === me)
    .sort((a, b) => a.week - b.week)
    .map((g) => {
      const home = g.homeId === me;
      const us = home ? g.homeScore : g.awayScore;
      const them = home ? g.awayScore : g.homeScore;
      return {
        week: g.week,
        opp: state.teams[home ? g.awayId : g.homeId]?.abbr ?? "?",
        home,
        us,
        them,
        outcome: us > them ? "W" : us < them ? "L" : "T",
      };
    });
  const camp = ps?.camp ?? {};
  const leaders: CampLeaderRow[] = state.players
    .filter((p) => p.teamId === me && (camp[p.id]?.snaps ?? 0) > 0)
    .map((p) => ({
      playerId: p.id,
      name: playerName(p),
      pos: p.pos,
      snaps: camp[p.id]?.snaps ?? 0,
      line: campLineText(camp[p.id]),
    }))
    .sort((a, b) => b.snaps - a.snaps || a.playerId - b.playerId)
    .slice(0, leaderCount);
  return {
    weeksPlayed,
    weeksLeft,
    nextWeek: weeksLeft > 0 ? PRESEASON_WEEKS - weeksLeft + 1 : null,
    userPlan: ps?.userPlan ?? state.preseason?.userPlan ?? "series",
    results,
    leaders,
  };
}
