import { isFutureProspect } from "../core/futureClass";
import { boardGrade, consensusGrade, gradeContext } from "../core/scouting-reports";
import { GameState, Player } from "../core/types";
import { athleticSheet, TestingEra, testingPhase } from "./athleticSheet";

/**
 * Draft-room and player-page fog. Display only.
 *
 * A drafted player is no longer a prospect, so a badge of his overall is the
 * answer key whoever took him. The row shows where he sat on the user's
 * board and on consensus. Athletic numbers come from the public sheet:
 * campus forty until the combine, verified drills for invitees, and the
 * pro-day sheet for everyone else.
 */

/** True once this prospect's own class is in the combine window or later. */
export function combineSheetPublic(state: GameState, p: Player): boolean {
  if (!p.prospect || p.retired || !p.profile) return false;
  if (isFutureProspect(state, p)) return false;
  const season = p.draftClassSeason ?? state.season;
  if (season > state.season) return false;
  return testingPhase(state, season) !== "before";
}

export interface ProspectTesting {
  era: TestingEra | null;
  eraLabel: string | null;
  forty: string | null;
  vertical: string | null;
  bench: string | null;
}

/** The testing line under school and size. */
export function prospectTesting(state: GameState, p: Player): ProspectTesting {
  if (!p.prospect || !p.profile) {
    return { era: null, eraLabel: null, forty: null, vertical: null, bench: null };
  }
  const sheet = athleticSheet(state, p);
  return {
    era: sheet.era,
    eraLabel: sheet.eraLabel,
    forty: sheet.forty.text,
    vertical: sheet.vertical.text,
    bench: sheet.bench.text,
  };
}

/** The same fragments the player page prints, joined for the view test. */
export function prospectTestingText(state: GameState, p: Player): string {
  const t = prospectTesting(state, p);
  const parts: string[] = [];
  if (t.eraLabel) parts.push(t.eraLabel);
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
