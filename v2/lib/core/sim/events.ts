import {
  DriveResult, DriveSummary, PlayEvent, PlayKind, PlayResult,
} from "../types";

/**
 * Play-by-play capture. Observation only — callers must never draw RNG here.
 *
 * `simulateGame` always writes a local log. Live peek also subscribes so a
 * thrown NeedSnapCall still has every snap that already finished.
 */

type Listener = (e: PlayEvent) => void;
const listeners: Listener[] = [];

export function onPlayEvent(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

export function emitPlay(e: PlayEvent): void {
  for (const fn of listeners) fn(e);
}

export function isOffensiveSnap(e: PlayEvent): boolean {
  return e.kind === "run" || e.kind === "pass" || e.kind === "sack" || e.kind === "kneel";
}

export function lastCalledSnap(
  plays: PlayEvent[],
  userTeamId: number,
  nCalls: number,
): PlayEvent | null {
  if (nCalls <= 0) return null;
  let n = 0;
  for (const p of plays) {
    if (p.offenseId !== userTeamId) continue;
    if (p.kind !== "run" && p.kind !== "pass" && p.kind !== "sack") continue;
    n++;
    if (n === nCalls) return p;
  }
  return null;
}

function snapYards(e: PlayEvent): number {
  return isOffensiveSnap(e) ? e.yards : 0;
}

function terminalOf(e: PlayEvent): DriveResult | null {
  if (e.kind === "kickoff" && e.result === "td") return "return_td";
  if (e.kind === "punt" && e.result === "td") return "return_td";
  if (e.kind === "punt") return "punt";
  if (e.kind === "fg") return e.result === "good" ? "field_goal" : "missed_fg";
  if (e.kind === "safety") return "safety";
  if (e.kind === "downs") return "downs";
  if (e.result === "td" && (e.kind === "run" || e.kind === "pass")) return "touchdown";
  if (e.result === "int" || e.result === "fumble") return "turnover";
  return null;
}

type OpenDrive = Omit<DriveSummary, "n" | "result" | "to">;

function closeDrive(
  cur: OpenDrive | null,
  result: DriveResult,
  endYl: number,
  to: number,
): DriveSummary | null {
  if (!cur) return null;
  return { ...cur, n: 0, endYl, to, result };
}

/**
 * Group a play stream into drives. Pure. No RNG.
 *
 * A kickoff (except a return TD) opens the next possession. PAT / two-point
 * stay on the scoring drive. Opening touchback is how the engine starts —
 * there is no live opening kick.
 */
export function buildDrives(plays: PlayEvent[]): DriveSummary[] {
  const out: DriveSummary[] = [];
  const box: { cur: OpenDrive | null } = { cur: null };

  const open = (e: PlayEvent, startYl: number, from: number) => {
    box.cur = {
      offenseId: e.offenseId,
      q: e.q,
      clock: e.clock,
      startYl,
      endYl: startYl,
      plays: 0,
      yards: 0,
      from,
    };
  };

  const finish = (row: DriveSummary | null) => {
    if (!row) return;
    row.n = out.length + 1;
    out.push(row);
    box.cur = null;
  };

  for (let i = 0; i < plays.length; i++) {
    const e = plays[i];
    if (e.kind === "kickoff") {
      if (e.result === "td") {
        finish(closeDrive(box.cur, "end_game", box.cur?.endYl ?? e.yardLine, i));
        open(e, 25, i);
        if (box.cur) {
          box.cur.plays = 1;
          box.cur.yards = e.yards;
          finish(closeDrive(box.cur, "return_td", 100, i + 1));
        }
        continue;
      }
      const half = !!(box.cur && e.q === 3 && box.cur.q <= 2);
      finish(closeDrive(box.cur, half ? "end_half" : "end_game", box.cur?.endYl ?? e.yardLine, i));
      open(e, e.yardLine, i);
      continue;
    }

    if (!box.cur || box.cur.offenseId !== e.offenseId) {
      if (box.cur && box.cur.offenseId !== e.offenseId) {
        finish(closeDrive(box.cur, "end_game", box.cur.endYl, i));
      }
      if (!box.cur) open(e, e.yardLine, i);
    }

    const cur = box.cur;
    if (cur) {
      if (isOffensiveSnap(e)) {
        cur.plays++;
        cur.yards += snapYards(e);
        cur.endYl = e.result === "td" ? 100 : Math.max(1, Math.min(99, e.yardLine + e.yards));
      } else if (e.kind === "penalty") {
        cur.endYl = Math.max(1, Math.min(99, e.yardLine + e.yards));
      } else if (e.kind === "fg" || e.kind === "punt") {
        cur.endYl = e.yardLine;
      }
    }

    const term = terminalOf(e);
    if (term) {
      if (term === "return_td") {
        finish(closeDrive(box.cur, "punt", e.yardLine, i));
        open(e, e.yardLine, i);
        if (box.cur) {
          box.cur.plays = 1;
          box.cur.yards = e.yards;
          finish(closeDrive(box.cur, "return_td", 100, i + 1));
        }
        continue;
      }
      // PAT / two-point after a TD stay on this drive.
      let to = i + 1;
      while (
        to < plays.length &&
        (plays[to].kind === "xp" || plays[to].kind === "two")
      ) {
        to++;
      }
      finish(closeDrive(box.cur, term, term === "touchdown" ? 100 : box.cur?.endYl ?? e.yardLine, to));
      i = to - 1;
    }
  }

  finish(closeDrive(box.cur, "end_game", box.cur?.endYl ?? 0, plays.length));
  return out;
}

export type { PlayEvent, PlayKind, PlayResult, DriveSummary, DriveResult };
