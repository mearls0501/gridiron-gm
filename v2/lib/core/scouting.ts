import { clamp, Rng } from "./rng";
import { frontOffice } from "./frontOffice";
import { NEUTRAL_SHARE, share } from "./staff";
import {
  AttrKey, BoardNote, CombineMetric, GameState, Player, Position,
  ProspectProfile, RiskGrade, ScoutingMethod, ScoutingState, UserIntel,
} from "./types";

/**
 * The fog of war over a draft class.
 *
 * Three layers, three owners:
 *
 * 1. PUBLIC — the prospect's profile: school, measurements, testing numbers,
 *    and a media consensus board. Everyone reads the same sheet for free.
 * 2. THE USER'S — `state.scouting`: OVR and potential bands centred on
 *    genuinely wrong estimates, tightened by spending the season's scouting
 *    points on specific methods. Stored, because the user paid for it.
 * 3. EACH CPU CLUB'S — derived, never stored. A club's read of a prospect is
 *    truth plus stable noise from a pure integer hash of (seed, season, club,
 *    player). No save growth, no RNG stream consumption, fully deterministic —
 *    and every club holds a durable, DIFFERENT opinion, which is what makes
 *    scouting competitive information rather than a shared spreadsheet.
 *
 * The old model had both halves backwards: the CPU read the user's paid-for
 * band (so user scouting sharpened all 31 rivals) and read true `pot` directly
 * (so on the dimension that decides a draft the CPU was omniscient). Both
 * reads are gone; `cpuProspectView` is now the only window a club gets.
 */

// ---------------------------------------------------------------------------
// Stable noise — a pure hash, not the RNG stream
// ---------------------------------------------------------------------------

/** SplitMix32-style avalanche. Pure function of its inputs, no state. */
function hash32(a: number, b: number, c: number, d: number): number {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ b, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ c, 0xc2b2ae35) >>> 0;
  h = Math.imul(h ^ d, 0x27d4eb2f) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}

/** Uniform in (0,1), never exactly 0. */
function unit(a: number, b: number, c: number, d: number): number {
  return (hash32(a, b, c, d) + 1) / 4294967297;
}

/** A stable standard normal for a given key. Box-Muller over two hash lanes. */
function stableNormal(a: number, b: number, c: number, d: number): number {
  const u1 = unit(a, b, c, d);
  const u2 = unit(a, b, c, d ^ 0x5bf03635);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ---------------------------------------------------------------------------
// The public consensus board
// ---------------------------------------------------------------------------

/**
 * The media's read of a prospect. One number the whole league can see —
 * imperfect in the same direction for everyone, which is what lets a club
 * that does its own work find the players the consensus is wrong about.
 */
export function consensusScore(state: GameState, p: Player): number {
  const n = stableNormal(state.seed, p.draftClassSeason ?? 0, 0x0c0de, p.id);
  return clamp(p.ovr + n * CONSENSUS_SD, 35, 99);
}

/**
 * The error structure of a belief, in one place, because the correction that
 * prices it (`cpuExpectedView`) has to be derived from the same numbers.
 */
const CONSENSUS_SD = 6;
const COMMON_OVR_SD = 7;
const OWN_OVR_SD = 4.5;
const COMMON_POT_SD = 3.5;
const OWN_POT_SD = 4;
// Share of the consensus miss that independent work recovers. Zero leaves
// (view − consensus) anti-correlated with (truth − consensus), because
// COMMON_OVR_SD > CONSENSUS_SD on the same hash; the leftover common term
// amplifies groupthink and POSITION_VALUE multiplies that leftover error.
const PRIVATE_SIGNAL = 0.45;

// ---------------------------------------------------------------------------
// CPU beliefs
// ---------------------------------------------------------------------------

/**
 * What one CPU club believes a prospect is and could become.
 *
 * Error structure mirrors what the old shared-band model measured in
 * aggregate — a large component every club shares (the consensus groupthink)
 * plus a smaller independent read per club — so league-wide draft quality
 * stays in the calibrated range while WHO knows WHAT changes completely.
 *
 * A club that funds scouting above the neutral 25 share shrinks its
 * independent error and recovers more of the consensus miss; at exactly the
 * neutral share the factor is 1.0 and the extra lane is 0, which is
 * invariant 6: an even budget changes nothing.
 */
const viewCache = new Map<string, { ovr: number; pot: number }>();

export function cpuProspectView(
  state: GameState, teamId: number, p: Player
): { ovr: number; pot: number } {
  const season = p.draftClassSeason ?? 0;
  // Pure function of (seed, season, team, player, staff share, ovr, pot) —
  // ovr/pot are in the key because progression can move a prospect's truth
  // between the class being seeded and the draft. Bounded so a 30-season
  // headless run cannot grow it without limit.
  const key = `${state.seed}:${season}:${teamId}:${p.id}:${p.ovr}:${p.pot}:${share(state.teams[teamId], "scouting").toFixed(3)}`;
  const hit = viewCache.get(key);
  if (hit) return hit;
  if (viewCache.size > 120_000) viewCache.clear();

  const q = scoutQuality(state, teamId);
  const common = stableNormal(state.seed, season, 0x0c0de, p.id);
  const ownOvr = stableNormal(state.seed, season, teamId + 1, p.id);
  const ownPot = stableNormal(state.seed, season, teamId + 1, p.id ^ 0x7a11);

  // Quality-scaled recovery of (truth − consensus). Zero at q=1 so even-budget
  // views stay byte-identical to the PRIVATE_SIGNAL=0.45 formula on main.
  // Own-noise already shrinks with q; without this lane a well-funded desk
  // just hears leftover groupthink more clearly. Pot uses the shared pot
  // error — there is no public potential board.
  const lane = q === 1 ? 0 : (1 - q) * PRIVATE_SIGNAL;
  const ovr = clamp(
    p.ovr + common * COMMON_OVR_SD * (1 - PRIVATE_SIGNAL) + ownOvr * OWN_OVR_SD * q
      + lane * (-common * CONSENSUS_SD),
    30, 99
  );
  const pot = clamp(
    p.pot + common * COMMON_POT_SD * (1 - PRIVATE_SIGNAL) + ownPot * OWN_POT_SD * q
      + lane * (-common * COMMON_POT_SD),
    ovr, 99
  );
  const out = { ovr, pot };
  viewCache.set(key, out);
  return out;
}

/**
 * The same belief, priced as an expectation instead of as truth.
 *
 * A club does not draft a random prospect: it drafts the one it likes most,
 * and it only wins him when its read is the optimistic one in the room. So the
 * error on a SELECTED man is not the error on an average man — it is the error
 * conditional on having been the high bidder, which is positive by
 * construction. Measured over 384 round-one picks, the drafting club's read ran
 * +10.4 OVR above truth while the league's mean read of the same men ran +5.5:
 * roughly five points of that is the buyer's own optimism, not shared
 * groupthink.
 *
 * The correction is ordinary shrinkage. A club's deviation from the public
 * consensus is, by construction, almost entirely its own private error — the
 * common component is shared with the consensus board and cancels out of the
 * difference — so that deviation is regressed toward the market by the share of
 * it the market's own uncertainty can account for. A club that reads a man the
 * way everyone else does barely moves; a club that has him five points clear of
 * the field keeps only part of that gap. Perceived headroom is shrunk the same
 * way and for the same reason, which is where most of the optimism lives: `pot`
 * is floored at `ovr`, so noise on the gap can only push it up.
 *
 * Deliberately uniform across positions. The QB share of round one is inflated
 * not because clubs are more wrong about quarterbacks — the selection premium
 * is flat across the board, ~5 points at QB and ~5 at EDGE and CB — but because
 * `POSITION_VALUE` multiplies whatever error survives, so the same optimism buys
 * 3.4x the board movement at QB that it buys at safety. Correcting the estimate
 * therefore bites hardest exactly where it is amplified, with nothing in here
 * that knows what a quarterback is.
 *
 * Pure: hashes only, no RNG draws, so the draft consumes the same stream it did
 * before.
 */
export function cpuExpectedView(
  state: GameState, teamId: number, p: Player
): { ovr: number; pot: number } {
  const view = cpuProspectView(state, teamId, p);
  const q = scoutQuality(state, teamId);

  // Reliability: how much of a private deviation to believe, given how noisy
  // this club's own read is against how uncertain the market itself is.
  const keepOvr = CONSENSUS_SD ** 2 / (CONSENSUS_SD ** 2 + (OWN_OVR_SD * q) ** 2);
  const keepRoom = COMMON_POT_SD ** 2 / (COMMON_POT_SD ** 2 + (OWN_POT_SD * q) ** 2);

  const anchor = consensusScore(state, p);
  const ovr = anchor + (view.ovr - anchor) * keepOvr;
  const room = Math.max(0, view.pot - view.ovr) * keepRoom;
  return { ovr, pot: ovr + room };
}

/** <1 = sees the class better than the league, 1.0 exactly at an even split. */
export function scoutQuality(state: GameState, teamId: number): number {
  const s = Math.max(0.05, share(state.teams[teamId], "scouting"));
  return clamp(Math.pow(NEUTRAL_SHARE / s, 0.5), 0.7, 1.6);
}

/**
 * How a club prices known risk. Medical and character checks are table stakes
 * for a real department, so CPU clubs read the truth here — their edge or
 * blind spot is in the talent evaluation, not the physical.
 */
export function riskDiscount(p: Player): number {
  const med = p.profile?.medicalRisk ?? "clean";
  const cha = p.profile?.characterRisk ?? "clean";
  const m = med === "major" ? 0.82 : med === "moderate" ? 0.93 : med === "minor" ? 0.98 : 1;
  const c = cha === "major" ? 0.88 : cha === "moderate" ? 0.95 : cha === "minor" ? 0.99 : 1;
  return m * c;
}

// ---------------------------------------------------------------------------
// Prospect profiles — generation
// ---------------------------------------------------------------------------

const REGION = [
  "Northport", "Caldwell", "Ridgemont", "Lakewood", "Harrison", "Delmar",
  "Fairbank", "Stone Valley", "Crestline", "Weston", "Millbrook", "Ashford",
  "Kingsley", "Redmond", "Alcott", "Brier", "Dunmore", "Eastvale", "Galloway",
  "Holloway", "Ironwood", "Juniper", "Kessler", "Loxley", "Marlowe",
] as const;

const SCHOOL_KIND = ["State", "Tech", "A&M", "University", "College"] as const;

/** Height/weight priors by position: [meanIn, sdIn, meanLb, sdLb]. */
const BUILD: Record<Position, [number, number, number, number]> = {
  QB: [75, 1.5, 222, 10], RB: [70, 1.5, 214, 12], WR: [73, 2.0, 202, 12],
  TE: [77, 1.2, 251, 10], OT: [78, 1.2, 314, 12], OG: [76, 1.2, 315, 12],
  C: [75, 1.0, 306, 10], EDGE: [76, 1.4, 258, 12], DT: [75, 1.4, 305, 15],
  LB: [74, 1.4, 238, 10], CB: [71, 1.5, 192, 8], S: [72, 1.3, 203, 8],
  K: [72, 1.5, 195, 10], P: [74, 1.5, 210, 10],
};

function grade(rng: Rng, clean: number, minor: number, moderate: number): RiskGrade {
  const r = rng.next();
  if (r < clean) return "clean";
  if (r < clean + minor) return "minor";
  if (r < clean + minor + moderate) return "moderate";
  return "major";
}

/**
 * Give a prospect his public identity. Called from `generateDraftClass` on the
 * class's OWN child stream, so none of this touches the parent stream no
 * matter how many prospects are generated (the 2026-07-28 lesson).
 *
 * Testing numbers derive from true physical attributes plus honest measurement
 * noise: a 4.3 forty genuinely means speed. That is why combine data is public
 * AND real — it reveals tools, not football.
 */
export function generateProspectProfile(rng: Rng, p: Player): void {
  const [hM, hS, wM, wS] = BUILD[p.pos];
  const a = p.attrs;
  const heightIn = Math.round(clamp(rng.normal(hM, hS), hM - 4, hM + 4));
  const weightLb = Math.round(clamp(rng.normal(wM, wS), wM - 3 * wS, wM + 3 * wS));

  // Attributes in this engine are graded WITHIN a position's context (a 63-spd
  // tackle is not a 63-spd receiver in sneakers), so the testing numbers have
  // to put the mass back in: every drill pays for weight at roughly the real
  // exchange rate. Calibrated so medians land near real combine medians —
  // receivers ~4.5, tackles ~5.0, a 33" vertical for a skill man.
  const w = weightLb - 210;
  const combine: Partial<Record<CombineMetric, number>> = {};
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  if (rng.chance(0.9)) combine.forty = r2(clamp(4.98 - a.spd * 0.0075 + w * 0.005 + rng.normal(0, 0.05), 4.22, 5.6));
  if (combine.forty != null) combine.tenSplit = r2(clamp(combine.forty * 0.345 + rng.normal(0, 0.015), 1.45, 2.0));
  if (rng.chance(p.pos === "QB" ? 0.25 : 0.7)) combine.bench = Math.round(clamp(1 + a.str * 0.28 + w * 0.045 + rng.normal(0, 2.2), 6, 45));
  if (rng.chance(0.85)) combine.vertical = r1(clamp(19.5 + a.jmp * 0.2 - w * 0.02 + rng.normal(0, 1.4), 21, 46));
  if (rng.chance(0.8)) combine.broad = Math.round(clamp(90 + a.jmp * 0.35 - w * 0.05 + rng.normal(0, 2.6), 94, 141));
  if (rng.chance(0.7)) combine.threeCone = r2(clamp(7.9 - a.agi * 0.011 + w * 0.003 + rng.normal(0, 0.08), 6.4, 8.45));
  if (rng.chance(0.7)) combine.shortShuttle = r2(clamp(4.65 - a.agi * 0.006 + w * 0.0026 + rng.normal(0, 0.05), 3.85, 5.1));

  const yr = rng.next();
  const profile: ProspectProfile = {
    college: rng.chance(0.85)
      ? `${rng.pick(REGION as unknown as string[])} ${rng.pick(SCHOOL_KIND as unknown as string[])}`
      : rng.pick(REGION as unknown as string[]),
    classYear: yr < 0.1 ? "SO" : yr < 0.52 ? "JR" : yr < 0.88 ? "SR" : "RS_SR",
    heightIn,
    weightLb,
    combine,
    medicalRisk: grade(rng, 0.62, 0.22, 0.11),
    characterRisk: grade(rng, 0.70, 0.18, 0.08),
    coachability: Math.round(clamp(rng.normal(60, 16), 10, 99)),
  };
  p.profile = profile;

  // Risk grades are REAL, not flavor: they act through channels that already
  // exist, so no downstream system needs a new special case.
  if (profile.medicalRisk === "moderate") p.durability = Math.max(1, p.durability - 8);
  if (profile.medicalRisk === "major") p.durability = Math.max(1, p.durability - 18);
  if (profile.characterRisk === "moderate") p.devSpeed = Math.max(0.5, p.devSpeed - 0.08);
  if (profile.characterRisk === "major") p.devSpeed = Math.max(0.5, p.devSpeed - 0.18);
}

// ---------------------------------------------------------------------------
// User intel
// ---------------------------------------------------------------------------

export const METHOD_COST: Record<ScoutingMethod, number> = {
  film: 6, proDay: 5, privateWorkout: 10, medical: 4, interview: 4,
};

export const METHOD_LABEL: Record<ScoutingMethod, string> = {
  film: "Film Study", proDay: "Pro Day", privateWorkout: "Private Workout",
  medical: "Medical Check", interview: "Interview",
};

function ovrErrSd(effort: number) { return Math.max(1.5, 10 - effort * 0.085); }
function ovrWidth(effort: number) { return Math.max(2, Math.round(12 - effort * 0.1)); }
function potErrSd(effort: number) { return Math.max(3, 12 - effort * 0.09); }
function potWidth(effort: number) { return Math.max(4, Math.round(16 - effort * 0.12)); }

export function ensureScouting(state: GameState): ScoutingState {
  if (!state.scouting || state.scouting.season !== state.season) {
    state.scouting = { season: state.season, intel: {}, board: {} };
  }
  return state.scouting;
}

/**
 * The department's current belief about one prospect. Falls back to the free
 * public read — the legacy shared band (kept in sync for old saves and for
 * `displayedOvr`) plus a wide consensus-centred potential band — until the
 * user actually spends work on him.
 */
export function getIntel(state: GameState, p: Player): UserIntel {
  const row = state.scouting?.season === state.season ? state.scouting.intel[p.id] : undefined;
  if (row) return row;
  return defaultIntel(state, p);
}

/**
 * The market's view of a prospect — the intel everyone starts from before a
 * club does its own work. Exported so grades can rank a user's private read
 * against the same public scale (a board grade and a consensus grade must be
 * measured in the same currency or the comparison is meaningless).
 */
export function publicIntel(state: GameState, p: Player): UserIntel {
  return defaultIntel(state, p);
}

function defaultIntel(state: GameState, p: Player): UserIntel {
  const season = p.draftClassSeason ?? 0;
  const ovrLow = p.scoutedOvrLow ?? Math.max(30, Math.round(consensusScore(state, p)) - 6);
  const ovrHigh = p.scoutedOvrHigh ?? Math.min(99, Math.round(consensusScore(state, p)) + 6);
  const potMid = clamp(p.pot + stableNormal(state.seed, season, 0xfa11, p.id) * 7, 35, 99);
  return {
    effort: p.scouted ?? 0,
    methods: {},
    ovrLow, ovrHigh,
    potLow: Math.max(30, Math.round(potMid) - 8),
    potHigh: Math.min(99, Math.round(potMid) + 8),
    medical: null,
    character: null,
  };
}

export function boardNote(state: GameState, playerId: number): BoardNote {
  return (state.scouting?.season === state.season ? state.scouting.board[playerId] : undefined) ?? {};
}

export function setBoardNote(state: GameState, playerId: number, patch: Partial<BoardNote>): void {
  const s = ensureScouting(state);
  const cur = s.board[playerId] ?? {};
  const next = { ...cur, ...patch };
  if (!next.tier && !next.watch && !next.avoid && !next.note) delete s.board[playerId];
  else s.board[playerId] = next;
}

export function canAfford(state: GameState, method: ScoutingMethod): boolean {
  return state.teams[state.userTeamId].scoutingPoints >= METHOD_COST[method];
}

/**
 * Spend scouting points on one method for one prospect.
 *
 * Each method reveals a different truth: film and workouts move the talent
 * bands, the pro day adds a coachability read on top of a modest tighten,
 * medicals and interviews reveal the risk grades. New information arrives as a
 * fresh noisy sample BLENDED with the standing estimate, so a report can move
 * a board — sometimes wrongly — without teleporting.
 */
export function runScoutingMethod(
  state: GameState, playerId: number, method: ScoutingMethod, rng: Rng
): boolean {
  const team = state.teams[state.userTeamId];
  const cost = METHOD_COST[method];
  if (team.scoutingPoints < cost) return false;
  const p = state.players.find((x) => x.id === playerId);
  if (!p || !p.prospect || !p.profile) return false;

  const s = ensureScouting(state);
  const intel = s.intel[playerId] ?? { ...defaultIntel(state, p), methods: {} };
  s.intel[playerId] = intel;
  team.scoutingPoints -= cost;
  intel.methods[method] = (intel.methods[method] ?? 0) + 1;

  const gain = method === "privateWorkout" ? 20 : method === "film" ? 14 : method === "proDay" ? 8 : 3;
  intel.effort = clamp(intel.effort + gain, 0, 100);

  if (method === "film" || method === "proDay" || method === "privateWorkout") {
    const w = method === "privateWorkout" ? 0.65 : method === "film" ? 0.5 : 0.35;
    const ovrSample = p.ovr + rng.normal(0, ovrErrSd(intel.effort));
    const ovrMid = ((intel.ovrLow + intel.ovrHigh) / 2) * (1 - w) + ovrSample * w;
    const ow = ovrWidth(intel.effort);
    intel.ovrLow = clamp(Math.round(ovrMid - ow / 2), 30, 99);
    intel.ovrHigh = clamp(Math.round(ovrMid + ow / 2), intel.ovrLow, 99);

    const potSample = p.pot + rng.normal(0, potErrSd(intel.effort));
    const potMid = ((intel.potLow + intel.potHigh) / 2) * (1 - w) + potSample * w;
    const pw = potWidth(intel.effort);
    intel.potLow = clamp(Math.round(potMid - pw / 2), 30, 99);
    intel.potHigh = clamp(Math.round(potMid + pw / 2), intel.potLow, 99);
  }
  if (method === "medical") intel.medical = p.profile.medicalRisk;
  if (method === "interview") intel.character = p.profile.characterRisk;

  // Effort mirrors to the legacy field for display and sorting. The BAND
  // does not: `p.scoutedOvr*` is the pristine public baseline the whole
  // market grades from, and mirroring the user's private band onto it made
  // the consensus follow the user's homework around — you could never
  // disagree with a market that was copying you (found by Matt, 2026-08-01).
  p.scouted = intel.effort;
  return true;
}

/** A spent class's intel and board are dead weight. Called at the rollover. */
export function pruneScouting(state: GameState): void {
  if (state.scouting && state.scouting.season < state.season) delete state.scouting;
}

// ---------------------------------------------------------------------------
// What a page may show — attribute bands for prospects
// ---------------------------------------------------------------------------

const ATHLETIC: AttrKey[] = ["spd", "acc", "agi", "str", "jmp", "sta"];
const MENTAL: AttrKey[] = ["awr", "dec", "dsc"];

/**
 * The band a rendered attribute panel may show for a prospect.
 *
 * Centred on truth PLUS stable noise — never on truth alone, because a band
 * centred on truth is just the true rating with decoration, which is the v1
 * bug this codebase was built to never repeat. Physical attributes are tight
 * (the combine made them public), technical attributes tighten with film work,
 * mental ones only really open up after an interview.
 */
export function attrBand(
  state: GameState, p: Player, key: AttrKey
): { low: number; high: number } {
  const v = p.attrs[key];
  if (!p.prospect) return { low: v, high: v };

  const intel = getIntel(state, p);
  let sd: number, width: number;
  if (ATHLETIC.includes(key)) {
    sd = 1.5; width = 4;
  } else if (MENTAL.includes(key)) {
    const seen = (intel.methods.interview ?? 0) > 0;
    sd = seen ? 3 : 8; width = seen ? 6 : 16;
  } else {
    sd = Math.max(2, 7 - intel.effort * 0.05);
    width = Math.max(4, Math.round(14 - intel.effort * 0.1));
  }
  const center = clamp(
    v + stableNormal(state.seed, p.draftClassSeason ?? 0, 0xa77 + state.userTeamId, p.id ^ hashKey(key)) * sd,
    1, 99
  );
  return {
    low: Math.max(1, Math.round(center - width / 2)),
    high: Math.min(99, Math.round(center + width / 2)),
  };
}

function hashKey(key: AttrKey): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h;
}
