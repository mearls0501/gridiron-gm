import { AttrKey, ATTR_LABEL, GameState, Player, Position } from "./types";
import { relevantAttrs } from "./ratings";
import { clamp } from "./rng";
import { attrBand, getIntel, publicIntel } from "./scouting";
import {
  collegeRegion,
  coveringScout,
  leanWord,
  nationalScout,
  roleWord,
} from "./scoutStaff";
import { Scheme, SCHEMES, schemeFor } from "./staff";

/**
 * The judgment layer: everything the war room SAYS about a prospect.
 *
 * The philosophy (Matt, 2026-08-01): a real front office never gets a number.
 * It gets a round grade, written reports, and sources it has learned to
 * read. The numeric estimate bands still exist underneath — they feed the
 * engine and these functions — but no prospect surface renders them.
 *
 * The board rank is the department's order of its own blends. Consensus is
 * the media's order of the public blends. They share a shade vocabulary and
 * nothing else, so a shallow file can disagree without anyone printing OVR.
 *
 * Everything here is DERIVED and deterministic: stable hashes only, no RNG
 * draws, no stored state, no save growth. The same save produces the same
 * grades, the same prose, the same sources, forever.
 */

// ---------------------------------------------------------------------------
// Sources — your department, generated from the franchise, stable forever
// ---------------------------------------------------------------------------

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

/** The area scout whose region this school sits in. Stable for the franchise. */
export function sourceFor(state: GameState, p: Player): Source {
  const scout = coveringScout(state, p);
  const region = collegeRegion(p.profile?.college ?? "");
  const where = scout.role === "area" && region ? region : (scout.lensLabel || "the board");
  return {
    name: scout.name,
    role: `${roleWord(scout)} · ${leanWord(scout.lean)} on ${where}`,
  };
}

// ---------------------------------------------------------------------------
// Grades — round-and-shade, ranked against the class
// ---------------------------------------------------------------------------

export interface GradeContext {
  /** Consensus rank by player id. 1 is the top of the media board. */
  market: Map<number, number>;
  /** Department rank by player id. 1 is the top of your board. */
  department: Map<number, number>;
}

/** Present ability and projection blended the way a draft board weighs them. */
function blend(i: { ovrLow: number; ovrHigh: number; potLow: number; potHigh: number }): number {
  const ovrMid = (i.ovrLow + i.ovrHigh) / 2;
  const potMid = (i.potLow + i.potHigh) / 2;
  return ovrMid * 0.55 + potMid * 0.45;
}

function rankMap(pool: Player[], value: (p: Player) => number): Map<number, number> {
  const order = pool.slice().sort((a, b) => value(b) - value(a) || a.id - b.id);
  const ranks = new Map<number, number>();
  for (let i = 0; i < order.length; i++) ranks.set(order[i].id, i + 1);
  return ranks;
}

/**
 * Build once per screen. Consensus ranks the public blends against each
 * other. Your board ranks the department's blends against each other.
 * Ties break on player id so every prospect has a slot to hang a judgment
 * on — a shared shade is not a rank.
 */
export function gradeContext(state: GameState, pool: Player[]): GradeContext {
  return {
    market: rankMap(pool, (q) => blend(publicIntel(state, q))),
    department: rankMap(pool, (q) => blend(getIntel(state, q))),
  };
}

function ordinal(round: number): string {
  if (round === 1) return "1st";
  if (round === 2) return "2nd";
  if (round === 3) return "3rd";
  return `${round}th`;
}

/** Shade only. The rank lives beside it so a one-slot move is visible. */
export function slotShade(slot: number): string {
  if (slot <= 5) return "Top 5";
  if (slot <= 10) return "Top 10";
  if (slot <= 224) {
    const round = Math.ceil(slot / 32);
    const idx = slot - 32 * (round - 1);
    const shade =
      round === 1
        ? idx <= 16
          ? "Early"
          : idx <= 24
            ? "Mid"
            : "Late"
        : idx <= 11
          ? "Early"
          : idx <= 22
            ? "Mid"
            : "Late";
    return `${shade} ${ordinal(round)}`;
  }
  if (slot <= 320) return "Priority UDFA";
  return "Camp invite";
}

function slotLabel(slot: number): string {
  const shade = slotShade(slot);
  if (shade === "Camp invite") return shade;
  return `#${slot} · ${shade}`;
}

export type Conviction = "low" | "medium" | "high";

export interface Grade {
  label: string;
  /** Board order. 1 is the best player on that board. */
  slot: number;
  /** Round shade without the rank — "Mid 1st", "Top 10". */
  shade: string;
  conviction: Conviction;
}

function gradeAt(slot: number, conviction: Conviction): Grade {
  return { label: slotLabel(slot), slot, shade: slotShade(slot), conviction };
}

/** What the market thinks. Public, free, sometimes wrong. */
export function consensusGrade(state: GameState, p: Player, ctx: GradeContext): Grade {
  const slot = ctx.market.get(p.id) ?? ctx.market.size + 1;
  return gradeAt(slot, "medium");
}

/**
 * Spots your board is higher than consensus. Negative means the market
 * likes him more. Zero is "in line".
 */
export function boardLean(board: Grade, market: Grade): number {
  return market.slot - board.slot;
}

/**
 * Your board's grade: assembled from your department's estimate bands.
 * Present-day ability and projection blended the way a draft board weighs
 * them; conviction is honest about how much work is behind the opinion.
 */
export function boardGrade(state: GameState, p: Player, ctx: GradeContext): Grade {
  const intel = getIntel(state, p);
  const width = intel.ovrHigh - intel.ovrLow + (intel.potHigh - intel.potLow);
  const conviction: Conviction = width <= 14 ? "high" : width <= 22 ? "medium" : "low";
  const slot = ctx.department.get(p.id) ?? ctx.department.size + 1;
  return gradeAt(slot, conviction);
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

/**
 * A band this wide or tighter is a finished read. Wider than this, the trait
 * line prints a question mark and a scheme-fit grade refuses to pick a word.
 */
export const TRAIT_CERTAIN_WIDTH = 6;

/** Position-relevant traits as verdicts, uncertain ones flagged. */
export function prospectTraits(state: GameState, p: Player): Trait[] {
  return relevantAttrs(p.pos).map((key) => {
    const band = attrBand(state, p, key);
    const mid = (band.low + band.high) / 2;
    return {
      key,
      label: ATTR_LABEL[key],
      verdict: verdictFor(mid),
      certain: band.high - band.low <= TRAIT_CERTAIN_WIDTH,
    };
  });
}

// ---------------------------------------------------------------------------
// Scheme fit — a word for the user's identity, from band midpoints
// ---------------------------------------------------------------------------

export type SchemeFitVerdict = "strong" | "some" | "poor" | "?";

/**
 * The user's scheme fit for someone outside his own roster.
 *
 * `verdict` is the identity that governs this position. `best` is the name of
 * the best of the eight identities, "?" when every identity that names the
 * position is still on a wide band, and null when none of them do (a kicker).
 * There is no score on this object.
 */
export interface ScoutedSchemeFit {
  verdict: SchemeFitVerdict;
  /** The user's offensive or defensive identity, whichever side he plays. */
  identity: string | null;
  /**
   * Best identity name. "?" when those bands are still wide. Null when no
   * identity names the position.
   */
  best: string | null;
  /** False when the user's identity does not lean on this position. */
  applies: boolean;
}

/** Same edge the Front Office page calls "suit" / "don't". A word, not a score. */
const FIT_SUIT = 0.15;

type Band = { low: number; high: number };

function bandWide(band: Band | undefined): boolean {
  if (!band) return true;
  return band.high - band.low > TRAIT_CERTAIN_WIDTH;
}

function bandMid(band: Band): number {
  return (band.low + band.high) / 2;
}

/**
 * The same measurement as `schemeFit`, read off band midpoints.
 *
 * A 15-point edge on the emphasised attributes is a full fit. Staff code is
 * not called with a prospect's true attributes — this function never sees them.
 */
function fitFromMids(pos: Position, scheme: Scheme, mid: (key: AttrKey) => number): number {
  const keys = scheme.emphasis[pos];
  if (!keys || !keys.length) return 0;
  const rel = relevantAttrs(pos);
  if (!rel.length) return 0;
  let base = 0;
  for (const k of rel) base += mid(k);
  base /= rel.length;
  let sum = 0;
  for (const k of keys) sum += mid(k) - base;
  return clamp(sum / keys.length / 15, -1, 1);
}

function wordFor(score: number): Exclude<SchemeFitVerdict, "?"> {
  if (score >= FIT_SUIT) return "strong";
  if (score <= -FIT_SUIT) return "poor";
  return "some";
}

/**
 * Verdict for one identity from band edges. Missing or wide emphasised
 * bands are "?". A position the identity does not name is "some".
 */
export function schemeVerdictFromBands(
  pos: Position,
  scheme: Scheme | null,
  bands: Partial<Record<AttrKey, Band>>,
): SchemeFitVerdict {
  if (!scheme) return "some";
  const keys = scheme.emphasis[pos];
  if (!keys || !keys.length) return "some";
  if (keys.some((k) => bandWide(bands[k]))) return "?";
  const rel = relevantAttrs(pos);
  if (!rel.length || rel.some((k) => !bands[k]) || keys.some((k) => !bands[k])) return "?";
  return wordFor(fitFromMids(pos, scheme, (k) => bandMid(bands[k]!)));
}

/** Board order for the four words. "?" sorts after a real read. */
export function schemeFitSortRank(verdict: SchemeFitVerdict): number {
  if (verdict === "strong") return 0;
  if (verdict === "some") return 1;
  if (verdict === "poor") return 2;
  return 3;
}

/**
 * Scheme-fit grades for a prospect or another club's player.
 *
 * Every attribute that enters the grade is an `attrBand` midpoint. Own-roster
 * truth stays on `schemeFit` in the Front Office; this path does not read
 * `p.attrs`.
 */
export function scoutedSchemeFit(state: GameState, p: Player): ScoutedSchemeFit {
  const need = new Set<AttrKey>(relevantAttrs(p.pos));
  for (const s of SCHEMES) {
    for (const k of s.emphasis[p.pos] ?? []) need.add(k);
  }
  const bands: Partial<Record<AttrKey, Band>> = {};
  for (const k of need) bands[k] = attrBand(state, p, k);

  const team = state.teams[state.userTeamId];
  const scheme = team ? schemeFor(team, p.pos) : null;
  const keys = scheme?.emphasis[p.pos];
  const applies = !!keys && keys.length > 0;

  let best: string | null = null;
  let bestScore = -Infinity;
  let anyNamed = false;
  let anyCertain = false;
  for (const s of SCHEMES) {
    const emphasised = s.emphasis[p.pos];
    if (!emphasised || !emphasised.length) continue;
    anyNamed = true;
    if (emphasised.some((k) => bandWide(bands[k]))) continue;
    anyCertain = true;
    const score = fitFromMids(p.pos, s, (k) => bandMid(bands[k]!));
    if (score > bestScore) {
      bestScore = score;
      best = s.name;
    }
  }

  return {
    verdict: schemeVerdictFromBands(p.pos, scheme, bands),
    identity: scheme?.name ?? null,
    best: anyNamed && !anyCertain ? "?" : best,
    applies,
  };
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
 * board disagrees with the market by half a round or more. A soft trait
 * read says so — the file does not talk like a finished grade at 12%.
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
    return { key, mid: (band.low + band.high) / 2, certain: band.high - band.low <= 6 };
  });
  const sorted = [...traits].sort((a, b) => b.mid - a.mid);
  const best = sorted.slice(0, 2);
  const worst = sorted[sorted.length - 1];

  const s1 = pick(STRENGTH[best[0].key] ?? ["does his job"], h);
  const s2 = best[1] ? pick(STRENGTH[best[1].key] ?? ["contributes"], h >>> 3) : null;
  const w1 = pick(WEAKNESS[worst.key] ?? ["needs polish"], h >>> 6);
  const soft = !best[0].certain || (best[1] != null && !best[1].certain) || !worst.certain;
  out.push({
    source: src,
    text: soft
      ? `Early look, still soft: ${s1}${s2 ? `; ${s2}` : ""}. On the other side of the ledger: ${w1}.`
      : `${cap(s1)}${s2 ? `; ${s2}` : ""}. On the other side of the ledger: ${w1}.`,
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
  const gap = Math.abs(board.slot - market.slot);
  if (gap >= 16) {
    const hedge = board.conviction === "low" ? "Shallow file. " : "";
    const national = nationalScout(state);
    out.push({
      source: {
        name: national.name,
        role: `${roleWord(national)} · ${leanWord(national.lean)} on ${national.lensLabel}`,
      },
      text:
        board.slot < market.slot
          ? `${hedge}We have him ${gap} spots higher than the market (#${board.slot} on our board, #${market.slot} on theirs). If the room believes the file, he's a target.`
          : `${hedge}The market has him ${gap} spots higher than we do (theirs #${market.slot}, ours #${board.slot}). Let someone else pay the consensus price.`,
    });
  }
  return out;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
