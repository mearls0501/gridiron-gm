import { irCount, practiceSquadCount, rosterCount } from "../core/select";
import { GameState, ROSTER_LIMIT, isCampPhase, rosterLimit } from "../core/types";

/**
 * Phase-aware roster clipboard for /roster and the Hub.
 *
 * Camp (offseason-draft / offseason-final) may sit over 53 up to 90.
 * Regular season, playoffs, and preseason lock at 53. Over-53 during
 * camp is not an illegal roster — it is the cutdown decision.
 */
export interface RosterCapView {
  count: number;
  cap: number;
  camp: boolean;
  overCap: number;
  overSeason: number;
  short: number;
  ir: number;
  ps: number;
  label: string;
  sub: string;
  tone: "good" | "warn";
  cutdown: boolean;
}

export function rosterCapView(state: GameState, teamId: number): RosterCapView {
  const count = rosterCount(state, teamId);
  const cap = rosterLimit(state.phase);
  const camp = isCampPhase(state.phase);
  const overCap = Math.max(0, count - cap);
  const overSeason = camp ? Math.max(0, count - ROSTER_LIMIT) : 0;
  const short = Math.max(0, ROSTER_LIMIT - count);
  const ir = irCount(state, teamId);
  const ps = practiceSquadCount(state, teamId);

  let sub: string;
  if (overCap > 0) {
    sub = `${overCap} over the ${camp ? "camp" : "roster"} limit`;
  } else if (camp && overSeason > 0) {
    sub = `${overSeason} over the ${ROSTER_LIMIT}-man season roster — cut or keep`;
  } else if (short > 0) {
    sub = `${short} short of ${ROSTER_LIMIT}`;
  } else if (camp) {
    sub = `At the ${ROSTER_LIMIT}-man season roster`;
  } else {
    sub = "Legal roster";
  }

  const tone: "good" | "warn" =
    overCap > 0 || short > 0 || overSeason > 0 ? "warn" : "good";

  return {
    count,
    cap,
    camp,
    overCap,
    overSeason,
    short,
    ir,
    ps,
    label: `${count}/${cap}`,
    sub,
    tone,
    cutdown: camp && overSeason > 0,
  };
}

export function hubCampCutdownCopy(view: RosterCapView): string | null {
  if (!view.cutdown) return null;
  return `Camp roster ${view.label}. Cut ${view.overSeason} on /roster before the season, or Start the Season will auto-cut to 53 (extras pass waivers; unclaimed may land on the practice squad).`;
}
