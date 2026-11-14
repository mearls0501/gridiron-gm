import { PlayEvent } from "../core/types";

/**
 * Play art: one field strip per snap, drawn from fields the event already
 * carries. No formation — the engine has none (`nfl-reference.md` §4,
 * "This-week play-calling"), so the strip shows only the spot, the line to
 * gain, where the ball ended, and what kind of snap it was.
 *
 * Offense-relative yards: 0 is the offense's own goal line, 100 the goal it
 * attacks.
 */
export type ArtGlyph =
  | "run" | "pass" | "incomplete" | "sack" | "turnover" | "kick" | "penalty" | "none";

export interface SnapArt {
  los: number;
  lineToGain: number | null;
  end: number;
  glyph: ArtGlyph;
}

const clampYd = (y: number) => Math.max(0, Math.min(100, Math.round(y)));

/** Where a kickoff leaves the tee, in the receiving offense's yards. */
export const KICKOFF_TEE = 65;

export function snapArt(e: PlayEvent): SnapArt {
  const los = clampYd(e.yardLine);
  const toGain = e.down >= 1 && e.toGo > 0 ? clampYd(e.yardLine + e.toGo) : null;
  switch (e.kind) {
    case "kickoff":
      // The row's spot is where the receiving club starts; the ball came
      // from the kicking club's 35.
      return {
        los: KICKOFF_TEE,
        lineToGain: null,
        end: e.result === "td" ? 100 : e.result === "touchback" ? 0 : los,
        glyph: "kick",
      };
    case "punt":
    case "xp":
    case "two":
      return { los, lineToGain: null, end: los, glyph: e.kind === "two" ? "pass" : "kick" };
    case "fg":
      return { los, lineToGain: null, end: e.result === "good" ? 100 : los, glyph: "kick" };
    case "penalty":
      return { los, lineToGain: null, end: clampYd(e.yardLine + e.yards), glyph: "penalty" };
    case "sack":
      return { los, lineToGain: toGain, end: clampYd(e.yardLine + Math.min(0, e.yards)), glyph: "sack" };
    case "run":
    case "pass": {
      if (e.result === "incomplete") return { los, lineToGain: toGain, end: los, glyph: "incomplete" };
      const end = e.result === "td" ? 100 : clampYd(e.yardLine + e.yards);
      const glyph: ArtGlyph = e.result === "int" || e.result === "fumble"
        ? "turnover"
        : e.kind;
      return { los, lineToGain: toGain, end, glyph };
    }
    case "kneel":
      return { los, lineToGain: toGain, end: clampYd(e.yardLine + e.yards), glyph: "run" };
    default:
      return { los, lineToGain: null, end: los, glyph: "none" };
  }
}

/**
 * Map an offense-relative yard onto a strip drawn with `leftTeamId`'s goal
 * on the left. When the other club has the ball the yards mirror.
 */
export function fieldX(yard: number, offenseId: number, leftTeamId: number): number {
  return offenseId === leftTeamId ? yard : 100 - yard;
}
