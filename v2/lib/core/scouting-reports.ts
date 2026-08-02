import { AttrKey, ATTR_LABEL, GameState, Player, Position } from "./types";
import { relevantAttrs } from "./ratings";
import { attrBand, getIntel, publicIntel } from "./scouting";

/**
 * The judgment layer: everything the war room SAYS about a prospect.
 *
 * The philosophy (Matt, 2026-08-01): a real front office never gets a number.
 * It gets a round grade, written reports, and sources it has learned to
 * read. The numeric estimate bands still exist underneath — they feed the
 * engine and these functions — but no prospect surface renders them.
 *
 * Everything here is DERIVED and deterministic: stable hashes only, no RNG
 * draws, no stored state, no save growth. The same save produces the same
 * grades, the same prose, the same sources, forever.
 */

// ---------------------------------------------------------------------------
// Sources — your department, generated from the franchise, stable forever
// ---------------------------------------------------------------------------

const FIRST = ["Dan", "Marcus", "Elena", "Ray", "Tobias", "Grady", "Simone", "Walt", "Priya", "Cole", "Dez", "Martha"];
const LAST = ["Reyes", "Okafor", "Lindqvist", "Battle", "Merriweather", "Cho", "Delgado", "Krebs", "Sowell", "Fontaine", "Barr", "Ostrowski"];
const ROLES = ["area scout", "area scout", "area scout", "national cross-checker", "college director"];

function hash32(a: number, b: number, c: number): number {
  let h = (a ^ (b * 0x9e3779b1) ^ (c * 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export interface Source {
  name: string;
  role: string;
}

/** The department member whose desk this prospect lands on. Stable per save. */
export function sourceFor(state: GameState, p: Player): Source {
  const idx = hash32(state.seed, state.userTeamId, p.id);
  const first = FIRST[idx % FIRST.length];
  const last = LAST[(idx >>> 4) % LAST.length];
  const role = ROLES[(idx >>> 8) % ROLES.length];
  return { name: `${first.charAt(0)}. ${last}`, role };
}

// ---------------------------------------------------------------------------
// Grades — round-and-shade, ranked against the class
// ---------------------------------------------------------------------------

export interface GradeContext {
  /** Market values of the whole class, sorted descending. */
  sorted: number[];
}

/** Present ability and projection blended the way a draft board weighs them. */
function blend(i: { ovrLow: number; ovrHigh: number; potLow: number; potHigh: number }): number {
  const ovrMid = (i.ovrLow + i.ovrHigh) / 2;
  const potMid = (i.potLow + i.potHigh) / 2;
  return ovrMid * 0.55 + potMid * 0.45;
}

/**
 * Build once per screen; ranks any estimate against the class. Both the
 * consensus grade and your board grade are ranked on this same scale — the
 * market's blended public estimates — so an unscouted player grades exactly
 * where the market has him, and your work moves YOUR number against a
 * stable market, not against a different formula.
 */
export function gradeContext(state: GameState, pool: Player[]): GradeContext {
  const sorted = pool.map((q) => blend(publicIntel(state, q))).sort((a, b) => b - a);
  return { sorted };
}

function slotFor(value: number, ctx: GradeContext): number {
  // Position this value would hold on the market's board.
  let lo = 0, hi = ctx.sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ctx.sorted[mid] > value) lo = mid + 1;
    else hi = mid;
  }
  return lo + 1;
}

const SHADES = ["Early", "Mid", "Late"];

function slotLabel(slot: number): string {
  if (slot <= 10) return "Top-10 pick";
  if (slot <= 32) return `${SHADES[Math.min(2, Math.floor(((slot - 11) / 22) * 3))]} Round 1`;
  for (let r = 2; r <= 7; r++) {
    const start = 32 * (r - 1) + 1;
    if (slot <= 32 * r) {
      const shade = SHADES[Math.min(2, Math.floor(((slot - start) / 32) * 3))];
      return `${shade} Round ${r}`;
    }
  }
  if (slot <= 320) return "Priority UDFA";
  return "Camp invite";
}

export type Conviction = "low" | "medium" | "high";

export interface Grade {
  label: string;
  slot: number;
  conviction: Conviction;
}

/** What the market thinks. Public, free, sometimes wrong. */
export function consensusGrade(state: GameState, p: Player, ctx: GradeContext): Grade {
  const slot = slotFor(blend(publicIntel(state, p)), ctx);
  return { label: slotLabel(slot), slot, conviction: "medium" };
}

/**
 * Your board's grade: assembled from your department's estimate bands.
 * Present-day ability and projection blended the way a draft board weighs
 * them; conviction is honest about how much work is behind the opinion.
 */
export function boardGrade(state: GameState, p: Player, ctx: GradeContext): Grade {
  const intel = getIntel(state, p);
  const value = blend(intel);
  const width = intel.ovrHigh - intel.ovrLow + (intel.potHigh - intel.potLow);
  const conviction: Conviction = width <= 14 ? "high" : width <= 22 ? "medium" : "low";
  const slot = slotFor(value, ctx);
  return { label: slotLabel(slot), slot, conviction };
}

// ---------------------------------------------------------------------------
// Trait verdicts — the attribute panel, in scout-speak
// ---------------------------------------------------------------------------

export type TraitVerdict = "elite" | "good" | "adequate" | "limited";

export interface Trait {
  key: AttrKey;
  label: string;
  verdict: TraitVerdict;
  certain: boolean;
}

export function verdictFor(mid: number): TraitVerdict {
  if (mid >= 84) return "elite";
  if (mid >= 74) return "good";
  if (mid >= 62) return "adequate";
  return "limited";
}

/** Position-relevant traits as verdicts, uncertain ones flagged. */
export function prospectTraits(state: GameState, p: Player): Trait[] {
  return relevantAttrs(p.pos).map((key) => {
    const band = attrBand(state, p, key);
    const mid = (band.low + band.high) / 2;
    return {
      key,
      label: ATTR_LABEL[key],
      verdict: verdictFor(mid),
      certain: band.high - band.low <= 6,
    };
  });
}

// ---------------------------------------------------------------------------
// Reports — written pros and cons with a name attached
// ---------------------------------------------------------------------------

const STRENGTH: Partial<Record<AttrKey, string[]>> = {
  spd: ["can flat-out run — the long speed is real", "a different gear in the open field"],
  acc: ["explosive out of his stance", "wins the first two steps almost every snap"],
  agi: ["easy mover, changes direction without gearing down", "loose hips, makes the first man miss"],
  str: ["plays with heavy hands and real power", "strength shows up at the point of attack"],
  jmp: ["elite play above the rim", "wins contested balls with pure explosion"],
  sta: ["motor never quits — same player in the fourth quarter", "plays every snap like the first"],
  thp: ["arm strength to make every throw on the tree", "the deep out is effortless"],
  tha: ["ball placement is surgical", "throws receivers open with touch and timing"],
  rte: ["route craft well beyond his years", "sets up defenders like a veteran"],
  cth: ["hands catcher — plucks it away from his frame", "drops almost nothing in traffic"],
  elu: ["special in space — first tackler rarely gets him", "makes defenders look silly one-on-one"],
  car: ["ball security is a strength, not a worry", "protects the football through contact"],
  rbk: ["moves people in the run game", "finishes run blocks through the whistle"],
  pbk: ["anchor holds against power", "mirror ability against speed off the edge"],
  tkl: ["reliable, wrap-up tackler", "brings his hips — people go backward"],
  prs: ["natural pass-rush instincts and a real plan", "bends the corner and finishes"],
  cov: ["sticky in coverage, finds the ball", "route recognition lets him drive on throws early"],
  pur: ["relentless in pursuit — never out of the play", "sideline-to-sideline range"],
  kpw: ["leg strength for 55+", "kickoffs are a weapon"],
  kac: ["metronome inside 45", "ball striking is repeatable and clean"],
  awr: ["processes fast — always where the play is", "football IQ jumps off the film"],
  dec: ["decision-making is calm and mostly clean", "takes what the defense gives"],
  dsc: ["disciplined — rarely fooled, rarely flagged", "assignment-sound every week"],
};

const WEAKNESS: Partial<Record<AttrKey, string[]>> = {
  spd: ["long speed is a real limitation", "gets caught from behind"],
  acc: ["slow to accelerate — builds speed gradually", "loses the first step too often"],
  agi: ["tight-hipped; struggles to redirect", "change of direction is laborious"],
  str: ["gets overpowered at the point", "functional strength has to come along"],
  jmp: ["below-the-rim athlete", "loses jump balls he should contest"],
  sta: ["fades late in games", "conditioning shows on long drives"],
  thp: ["arm is adequate, not special — the far hash out is a strain", "velocity dips on the move"],
  tha: ["accuracy comes and goes, especially past 15 yards", "misses high when pressured"],
  rte: ["route tree is raw — mostly verticals and screens", "rounds his breaks"],
  cth: ["body-catches too much", "concentration drops in traffic"],
  elu: ["goes down on first contact", "not a creator after the catch"],
  car: ["ball security is a genuine concern", "carries it loose in traffic"],
  rbk: ["gets little movement in the run game", "loses sustain when the defender counters"],
  pbk: ["anchor gives ground against power", "feet get crossed against counters"],
  tkl: ["misses more tackles than you can live with", "ankle-biter — dives at shoelaces"],
  prs: ["rush plan is one move and hope", "stalls when the first move is stopped"],
  cov: ["loses the route at the break point", "grabby downfield — will draw flags"],
  pur: ["takes bad angles in pursuit", "effort snaps show up on film"],
  kpw: ["leg maxes out around 50", "kickoffs invite returns"],
  kac: ["misses left, misses right — no pattern", "wobbles under pressure kicks"],
  awr: ["late to diagnose — a beat behind the play", "the game hasn't slowed down for him yet"],
  dec: ["forces throws he shouldn't", "decision clock runs slow"],
  dsc: ["freelances out of assignments", "penalties follow him"],
};

export interface Report {
  source: Source;
  text: string;
}

function pick<T>(arr: T[], h: number): T {
  return arr[h % arr.length];
}

/**
 * The written file on a prospect: the area scout's film report assembled
 * from his two loudest strengths and loudest weakness (by scouted estimate,
 * so a wrong band writes a wrong report — that is the game), plus flag
 * reports for anything a method uncovered, plus a divergence note when your
 * board disagrees with the market by a round or more.
 */
export function prospectReports(
  state: GameState, p: Player, ctx: GradeContext
): Report[] {
  const out: Report[] = [];
  const src = sourceFor(state, p);
  const intel = getIntel(state, p);
  const h = hash32(state.seed, p.id, 0x5c07);

  const traits = relevantAttrs(p.pos).map((key) => {
    const band = attrBand(state, p, key);
    return { key, mid: (band.low + band.high) / 2 };
  });
  const sorted = [...traits].sort((a, b) => b.mid - a.mid);
  const best = sorted.slice(0, 2);
  const worst = sorted[sorted.length - 1];

  const s1 = pick(STRENGTH[best[0].key] ?? ["does his job"], h);
  const s2 = best[1] ? pick(STRENGTH[best[1].key] ?? ["contributes"], h >>> 3) : null;
  const w1 = pick(WEAKNESS[worst.key] ?? ["needs polish"], h >>> 6);
  out.push({
    source: src,
    text: `${cap(s1)}${s2 ? `; ${s2}` : ""}. On the other side of the ledger: ${w1}.`,
  });

  if (intel.medical) {
    out.push({
      source: { name: "Medical", role: "team physicians" },
      text:
        intel.medical === "clean"
          ? "Checked out clean. No structural concerns in the exam."
          : intel.medical === "minor"
            ? "Minor wear in the exam — nothing that changes the grade on its own."
            : intel.medical === "moderate"
              ? "The exam raised a flag — durability history is a real part of this evaluation."
              : "Failed our physical standards. Drafting him is a bet against the medical.",
    });
  }
  if (intel.character) {
    out.push({
      source: { name: "Personnel", role: "interview team" },
      text:
        intel.character === "clean"
          ? "Interviewed exceptionally. Football matters to him; teammates follow him."
          : intel.character === "minor"
            ? "A few yellow lights in the interview — coachable, but he'll need structure."
            : intel.character === "moderate"
              ? "The interview left questions about accountability and preparation habits."
              : "Multiple sources independently raised character concerns. Board decision, not a scouting one.",
    });
  }

  const board = boardGrade(state, p, ctx);
  const market = consensusGrade(state, p, ctx);
  if (Math.abs(board.slot - market.slot) >= 32) {
    out.push({
      source: { name: sourceFor(state, p).name, role: "cross-check" },
      text:
        board.slot < market.slot
          ? "We are meaningfully higher than the market on this player. If the room believes the file, he's a target."
          : "The market likes him more than we do. Let someone else pay the consensus price.",
    });
  }
  return out;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
