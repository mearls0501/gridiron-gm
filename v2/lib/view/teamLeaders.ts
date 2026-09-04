import { DEFENSE, GameState, Player, Position, SeasonStatLine } from "../core/types";
import {
  currentLine,
  isReceivingLeaderPos,
  RECEIVING_LEADER_POS,
} from "../core/season/stats";

/**
 * Team / receiving leaders as the Hub card and /stats receiving board
 * render them. Receiving is WR/TE/RB only — a defender with leftover
 * recYds is not a receiving leader.
 */

export { isReceivingLeaderPos, RECEIVING_LEADER_POS };

export type TeamLeaderKind = "passing" | "rushing" | "receiving" | "defense";

export interface StatLeader {
  player: Player;
  line: SeasonStatLine;
  value: number;
}

export interface TeamLeaderRow {
  kind: TeamLeaderKind;
  label: string;
  player: Player;
  line: SeasonStatLine;
  text: string;
}

function qualifyingLine(p: Player, season: number): SeasonStatLine | null {
  if (p.prospect || p.retired) return null;
  const line = currentLine(p, season);
  return line.games > 0 ? line : null;
}

export function receivingLeaders(
  state: GameState,
  opts: { teamId?: number; season?: number; limit?: number } = {},
): StatLeader[] {
  const season = opts.season ?? state.season;
  const rows: StatLeader[] = [];
  for (const p of state.players) {
    if (opts.teamId !== undefined && p.teamId !== opts.teamId) continue;
    if (!isReceivingLeaderPos(p.pos)) continue;
    const line = qualifyingLine(p, season);
    if (!line || line.recYds <= 0) continue;
    rows.push({ player: p, line, value: line.recYds });
  }
  rows.sort((a, b) => b.value - a.value || a.player.id - b.player.id);
  return rows.slice(0, opts.limit ?? 10);
}

function bestOnClub(
  state: GameState,
  teamId: number,
  value: (l: SeasonStatLine) => number,
  eligible: (pos: Position) => boolean,
): StatLeader | null {
  let best: StatLeader | null = null;
  for (const p of state.players) {
    if (p.teamId !== teamId) continue;
    if (!eligible(p.pos)) continue;
    const line = qualifyingLine(p, state.season);
    if (!line) continue;
    const v = value(line);
    if (v <= 0) continue;
    if (!best || v > best.value || (v === best.value && p.id < best.player.id)) {
      best = { player: p, line, value: v };
    }
  }
  return best;
}

function passText(l: SeasonStatLine): string {
  return `${l.passYds} yds, ${l.passTd} TD, ${l.passInt} INT`;
}

function rushText(l: SeasonStatLine): string {
  return `${l.rushYds} yds, ${l.rushTd} TD`;
}

function recText(l: SeasonStatLine): string {
  return `${l.rec} rec, ${l.recYds} yds, ${l.recTd} TD`;
}

function defText(l: SeasonStatLine): string {
  return `${l.tackles} tkl, ${l.sacks} sk, ${l.ints} INT`;
}

function isRushLeaderPos(pos: Position): boolean {
  return pos === "QB" || pos === "RB" || pos === "WR" || pos === "TE";
}

function isDefensePos(pos: Position): boolean {
  return (DEFENSE as readonly Position[]).includes(pos);
}

/**
 * Hub "Team Leaders": one row per sit-class, not a composite that can
 * paint a defender with a receiving line.
 */
export function teamLeaders(state: GameState, teamId: number): TeamLeaderRow[] {
  const rows: TeamLeaderRow[] = [];
  const pass = bestOnClub(state, teamId, (l) => l.passYds, (pos) => pos === "QB");
  if (pass) {
    rows.push({ kind: "passing", label: "Passing", player: pass.player, line: pass.line, text: passText(pass.line) });
  }
  const rush = bestOnClub(state, teamId, (l) => l.rushYds, isRushLeaderPos);
  if (rush) {
    rows.push({ kind: "rushing", label: "Rushing", player: rush.player, line: rush.line, text: rushText(rush.line) });
  }
  const rec = receivingLeaders(state, { teamId, limit: 1 })[0];
  if (rec) {
    rows.push({ kind: "receiving", label: "Receiving", player: rec.player, line: rec.line, text: recText(rec.line) });
  }
  const def = bestOnClub(
    state,
    teamId,
    (l) => l.sacks * 7 + l.ints * 8 + l.tackles * 0.4,
    isDefensePos,
  );
  if (def) {
    rows.push({ kind: "defense", label: "Defense", player: def.player, line: def.line, text: defText(def.line) });
  }
  return rows;
}
