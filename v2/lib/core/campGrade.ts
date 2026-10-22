import { CampLine, GameState, Player, Position, PreseasonState } from "./types";

/**
 * Camp battles (packet B): a bounded nudge on the cut to 53 from what a
 * player did in this camp's preseason games.
 * Design: `docs/preseason-games-design-2026-10-20.md` §6.
 *
 * There is no published rate for how much preseason play changes who makes
 * the 53, so this is a design dial, not an NFL number, and it ships **off**.
 * A Studio panel turns it on with `GG_CAMP_NUDGE=1` and reads `careers`
 * (R6–R7 and UDFA survival) before anyone signs it on.
 *
 * - Grade: production per snap against his position's camp average, in
 *   standard deviations capped at ±2 and scaled to ±1, then shrunk toward
 *   zero by snap count. The cap comes first so the shrink really bounds a
 *   fluke: one touchdown on 6 snaps grades at most 6/36.
 * - Nudge: grade × `CAMP_NUDGE_MAX`, added to the club's own cut valuation
 *   (`evaluate + draftCapitalHold`). It only reorders players already close
 *   in value; a seventh-rounder's draft-capital hold is 2–10 on that scale.
 * - Only in camp (`offseason-final`) with this year's preseason played.
 *   Offensive line, punters and players with no snaps grade 0: the box has no
 *   production line for them.
 */

/** Largest nudge, in `evaluate` units. A dial for the panel, not a rate. */
export const CAMP_NUDGE_MAX = 3;

/** Snaps at which the shrink reaches one half. */
const SHRINK_SNAPS = 30;

/** Standard deviations that count as the top or bottom of camp. */
const Z_CAP = 2;

/** On only when a harness asks for it. Ships off. */
export function campNudgeOn(): boolean {
  return typeof process !== "undefined" && process.env?.GG_CAMP_NUDGE === "1";
}

type Family = "pass" | "rush" | "catch" | "defense" | "kick";

const FAMILY: Partial<Record<Position, Family>> = {
  QB: "pass", RB: "rush", WR: "catch", TE: "catch",
  EDGE: "defense", DT: "defense", LB: "defense", CB: "defense", S: "defense",
  K: "kick",
};

/** Box production in one currency per position family. */
function production(fam: Family, l: CampLine): number {
  const n = (v: number | undefined) => v ?? 0;
  switch (fam) {
    case "pass":
      return n(l.passYds) * 0.04 + n(l.passTd) * 4 - n(l.passInt) * 4 + n(l.rushYds) * 0.1;
    case "rush":
      return n(l.rushYds) * 0.1 + n(l.rushTd) * 6 + n(l.recYds) * 0.1 + n(l.rec) * 0.5;
    case "catch":
      return n(l.recYds) * 0.1 + n(l.rec) * 0.5 + n(l.recTd) * 6;
    case "defense":
      return n(l.tackles) + n(l.sacks) * 4 + n(l.ints) * 5 + n(l.passDef) * 2;
    case "kick":
      return n(l.fgm) * 3 - (n(l.fga) - n(l.fgm)) * 3;
  }
}

function thisCamp(state: GameState): PreseasonState | null {
  if (state.phase !== "offseason-final") return null;
  const ps = state.preseason;
  return ps && ps.season === state.season + 1 && ps.week > 0 ? ps : null;
}

const cache = new WeakMap<PreseasonState, { week: number; grades: Map<number, number> }>();

function gradesFor(state: GameState, ps: PreseasonState): Map<number, number> {
  const hit = cache.get(ps);
  if (hit && hit.week === ps.week) return hit.grades;

  const byPos = new Map<Position, { id: number; snaps: number; rate: number }[]>();
  for (const p of state.players) {
    const fam = FAMILY[p.pos];
    const line = ps.camp[p.id];
    const snaps = line?.snaps ?? 0;
    if (!fam || !line || snaps <= 0) continue;
    const rows = byPos.get(p.pos) ?? [];
    rows.push({ id: p.id, snaps, rate: production(fam, line) / snaps });
    byPos.set(p.pos, rows);
  }

  const grades = new Map<number, number>();
  for (const rows of byPos.values()) {
    if (rows.length < 2) continue;
    // Snap-weighted mean and spread, so a handful of snaps cannot set the bar.
    const w = rows.reduce((s, r) => s + r.snaps, 0);
    const mean = rows.reduce((s, r) => s + r.rate * r.snaps, 0) / w;
    const sd = Math.sqrt(rows.reduce((s, r) => s + r.snaps * (r.rate - mean) ** 2, 0) / w);
    if (!(sd > 0)) continue;
    for (const r of rows) {
      const shrink = r.snaps / (r.snaps + SHRINK_SNAPS);
      const z = Math.max(-Z_CAP, Math.min(Z_CAP, (r.rate - mean) / sd)) / Z_CAP;
      grades.set(r.id, z * shrink);
    }
  }
  cache.set(ps, { week: ps.week, grades });
  return grades;
}

/** −1..1: how his camp went against his position. 0 outside camp or with no line. */
export function campGrade(state: GameState, p: Player): number {
  const ps = thisCamp(state);
  if (!ps) return 0;
  return gradesFor(state, ps).get(p.id) ?? 0;
}

/** The term the cut adds to a club's own player. 0 unless the nudge is on. */
export function campNudge(state: GameState, p: Player): number {
  if (!campNudgeOn()) return 0;
  return campGrade(state, p) * CAMP_NUDGE_MAX;
}
