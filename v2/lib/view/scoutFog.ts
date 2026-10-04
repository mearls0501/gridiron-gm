import { campusForty, isFutureProspect } from "../core/futureClass";
import { boardGrade, consensusGrade, gradeContext } from "../core/scouting-reports";
import { calendarView, windowCeiling, windowFloor } from "../core/scouting";
import { GameState, Player, SCOUTING_WINDOWS, ScoutingWindow } from "../core/types";

/**
 * Draft-room and player-page fog. Display only.
 *
 * A drafted player is no longer a prospect, so a badge of his overall is the
 * answer key whoever took him. The row shows where he sat on the user's
 * board and on consensus. A class that has not reached the combine window
 * gets the campus forty, not the electronic clock, vertical, or bench.
 */

function windowIndex(w: ScoutingWindow): number {
  return SCOUTING_WINDOWS.indexOf(w);
}

/** The window the calendar is in, including the phase floor, without writing the save. */
function effectiveWindow(state: GameState): ScoutingWindow {
  const floor = windowFloor(state);
  const ceil = windowCeiling(state);
  let w = calendarView(state).window;
  if (windowIndex(w) < windowIndex(floor)) w = floor;
  if (windowIndex(w) > windowIndex(ceil)) w = ceil;
  return w;
}

/** True once this prospect's own class is in the combine window or later. */
export function combineSheetPublic(state: GameState, p: Player): boolean {
  if (!p.prospect || p.retired || !p.profile) return false;
  if (isFutureProspect(state, p)) return false;
  const season = p.draftClassSeason ?? state.season;
  if (season > state.season) return false;
  if (season < state.season) return true;
  return windowIndex(effectiveWindow(state)) >= windowIndex("combine");
}

export interface ProspectTesting {
  forty: string | null;
  vertical: string | null;
  bench: string | null;
}

/** The testing line under school and size. Campus forty until the combine window. */
export function prospectTesting(state: GameState, p: Player): ProspectTesting {
  const profile = p.profile;
  if (!p.prospect || !profile) return { forty: null, vertical: null, bench: null };
  if (!combineSheetPublic(state, p)) {
    const forty = campusForty(p);
    return {
      forty: forty != null ? forty.toFixed(2) : null,
      vertical: null,
      bench: null,
    };
  }
  const c = profile.combine;
  return {
    forty: c.forty != null ? c.forty.toFixed(2) : null,
    vertical: c.vertical != null ? String(c.vertical) : null,
    bench: c.bench != null ? String(c.bench) : null,
  };
}

/** The same fragments the player page prints, joined for the view test. */
export function prospectTestingText(state: GameState, p: Player): string {
  const t = prospectTesting(state, p);
  const parts: string[] = [];
  if (t.forty != null) parts.push(`40yd ${t.forty}s`);
  if (t.vertical != null) parts.push(`Vert ${t.vertical}`);
  if (t.bench != null) parts.push(`Bench ${t.bench}`);
  return parts.join(" ");
}

function classPool(state: GameState, season: number): Player[] {
  return state.players.filter((q) => !q.retired && q.draftClassSeason === season);
}

/** Slot on the user's board and on consensus. Not an overall, a potential, or a band. */
export function recentPickSlots(state: GameState, p: Player): { board: string; consensus: string } {
  const season = p.draftClassSeason ?? state.season;
  const pool = classPool(state, season);
  if (!pool.some((q) => q.id === p.id)) pool.push(p);
  const ctx = gradeContext(state, pool);
  return {
    board: boardGrade(state, p, ctx).label,
    consensus: consensusGrade(state, p, ctx).label,
  };
}

/** Both slots, the way the recent-picks row reads. */
export function recentPickText(state: GameState, p: Player): string {
  const s = recentPickSlots(state, p);
  return `${s.board} ${s.consensus}`;
}
