import { Attributes, AttrKey, Position, Player } from "./types";
import { clamp } from "./rng";

/**
 * Position-specific weights. OVR is a *display* convenience derived from these;
 * the simulation reads individual attributes, never OVR. Each set sums to 1.0 —
 * asserted by a unit check in scripts/verify.ts so a typo can't silently skew a
 * whole position group.
 */
export const POSITION_WEIGHTS: Record<Position, Partial<Record<AttrKey, number>>> = {
  QB: { tha: 0.30, dec: 0.20, awr: 0.15, thp: 0.14, acc: 0.06, agi: 0.05, spd: 0.04, elu: 0.03, car: 0.03 },
  RB: { elu: 0.20, spd: 0.18, acc: 0.16, agi: 0.14, car: 0.10, str: 0.08, cth: 0.06, awr: 0.04, rbk: 0.04 },
  WR: { rte: 0.24, cth: 0.22, spd: 0.18, acc: 0.12, agi: 0.10, jmp: 0.08, awr: 0.04, elu: 0.02 },
  TE: { cth: 0.22, rte: 0.18, rbk: 0.16, str: 0.12, spd: 0.10, awr: 0.08, jmp: 0.08, agi: 0.06 },
  OT: { pbk: 0.40, rbk: 0.26, str: 0.16, agi: 0.08, awr: 0.06, dsc: 0.04 },
  OG: { rbk: 0.34, pbk: 0.32, str: 0.20, awr: 0.07, agi: 0.04, dsc: 0.03 },
  C:  { rbk: 0.28, pbk: 0.28, awr: 0.20, str: 0.16, dsc: 0.05, agi: 0.03 },
  EDGE: { prs: 0.34, spd: 0.16, str: 0.14, acc: 0.12, tkl: 0.10, pur: 0.08, awr: 0.06 },
  DT: { str: 0.28, prs: 0.24, pur: 0.16, tkl: 0.14, awr: 0.10, acc: 0.08 },
  LB: { tkl: 0.24, pur: 0.20, awr: 0.16, cov: 0.14, spd: 0.12, str: 0.08, acc: 0.06 },
  CB: { cov: 0.36, spd: 0.22, agi: 0.14, acc: 0.10, awr: 0.08, jmp: 0.06, tkl: 0.04 },
  S:  { cov: 0.26, awr: 0.20, tkl: 0.18, spd: 0.14, pur: 0.12, agi: 0.06, jmp: 0.04 },
  K:  { kac: 0.60, kpw: 0.35, dsc: 0.05 },
  P:  { kpw: 0.55, kac: 0.40, dsc: 0.05 },
};

/** Attributes that actually matter for a position — used when generating and progressing. */
export function relevantAttrs(pos: Position): AttrKey[] {
  return Object.keys(POSITION_WEIGHTS[pos]) as AttrKey[];
}

export function computeOvr(attrs: Attributes, pos: Position): number {
  const w = POSITION_WEIGHTS[pos];
  let total = 0;
  for (const k in w) {
    const key = k as AttrKey;
    total += attrs[key] * (w[key] as number);
  }
  return clamp(Math.round(total), 1, 99);
}

export function refreshOvr(p: Player): void {
  p.ovr = computeOvr(p.attrs, p.pos);
}

/**
 * Positional value multiplier — how much a point of OVR is worth at this
 * position. Drives contract value, trade value and CPU draft boards, so a 78
 * QB is not interchangeable with a 78 punter.
 */
export const POSITION_VALUE: Record<Position, number> = {
  QB: 3.4, EDGE: 1.7, OT: 1.6, WR: 1.4, CB: 1.4, DT: 1.15, S: 1.0,
  TE: 0.95, LB: 0.9, OG: 0.9, C: 0.85, RB: 0.7, K: 0.35, P: 0.3,
};

/**
 * Roster scale for specialists.
 *
 * Stored overall is a position grade. Every depth-chart starter, including
 * the only kicker and both punters, is drawn from the same band, so a
 * league-average specialist sorts with the skill players. The kick engine
 * reads `kac` / `kpw`, not this number. A 12-point drop in those attributes
 * moves field-goal probability by about 5.5 points, outside `calibrate.fgPct`
 * (86 ± 4), so the attributes stay and only the number a roster prints moves.
 * Fogged bands shift by the same amount — the center is still the belief,
 * not the stored grade.
 */
export const SPECIALIST_ROSTER_SHIFT = 12;

export function presentedOvr(pos: Position, ovr: number): number {
  if (pos !== "K" && pos !== "P") return ovr;
  return clamp(ovr - SPECIALIST_ROSTER_SHIFT, 1, 99);
}

/**
 * Headroom above 6 is compressed so a mid player cannot print 99. A 99
 * remains only when he is already a 93, which is the far tail of the
 * position grade. Mean growth is untouched: `ceiling` still reads stored `pot`.
 */
function presentedHeadroom(gap: number): number {
  if (gap <= 6) return gap;
  return 6 + Math.round((gap - 6) * 0.35);
}

export function presentedPot(pos: Position, ovr: number, pot: number): number {
  const shown = presentedOvr(pos, ovr);
  const gap = Math.max(0, pot - ovr);
  return clamp(shown + presentedHeadroom(gap), shown, 99);
}

/** Graded specialist attributes, shifted with the roster overall so the card still averages. */
export function presentedAttr(pos: Position, key: AttrKey, value: number): number {
  if (pos !== "K" && pos !== "P") return value;
  if (!relevantAttrs(pos).includes(key)) return value;
  return clamp(value - SPECIALIST_ROSTER_SHIFT, 1, 99);
}

export function presentedAttrBand(
  pos: Position, key: AttrKey, band: { low: number; high: number },
): { low: number; high: number } {
  const low = presentedAttr(pos, key, band.low);
  const high = presentedAttr(pos, key, band.high);
  return { low: Math.min(low, high), high: Math.max(low, high) };
}

/** Shift every integer in an OVR label (`86`, `84-88`, `?`). Non-specialists pass through. */
export function presentOvrText(pos: Position, label: string): string {
  if (pos !== "K" && pos !== "P") return label;
  return label.replace(/\d+/g, (n) => String(presentedOvr(pos, Number(n))));
}

/**
 * Compress every integer in a potential label. `anchorOvr` is the overall
 * the label is already allowed to sit next to — stored, for your own roster,
 * or the belief, for everyone else. Never the other one. A belief is a
 * fraction; the printed band is still whole numbers.
 */
export function presentPotText(pos: Position, anchorOvr: number, label: string): string {
  const anchor = Math.round(anchorOvr);
  return label.replace(/\d+/g, (n) => String(presentedPot(pos, anchor, Number(n))));
}

/** Human-readable tier for UI. */
export function ovrTier(ovr: number): { label: string; tone: string } {
  if (ovr >= 90) return { label: "Elite", tone: "elite" };
  if (ovr >= 82) return { label: "Pro Bowl", tone: "great" };
  if (ovr >= 75) return { label: "Starter", tone: "good" };
  if (ovr >= 68) return { label: "Rotational", tone: "avg" };
  if (ovr >= 60) return { label: "Backup", tone: "weak" };
  return { label: "Depth", tone: "poor" };
}

export function playerName(p: Player): string {
  return `${p.firstName} ${p.lastName}`;
}

/** What the user is allowed to see for a prospect: a band, not the truth. */
export function displayedOvr(p: Player): string {
  if (!p.prospect) return String(p.ovr);
  if (p.scoutedOvrLow == null || p.scoutedOvrHigh == null) return "?";
  if (p.scoutedOvrHigh - p.scoutedOvrLow <= 2) return String(Math.round((p.scoutedOvrLow + p.scoutedOvrHigh) / 2));
  return `${p.scoutedOvrLow}-${p.scoutedOvrHigh}`;
}
