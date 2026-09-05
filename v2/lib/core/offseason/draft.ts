import { Rng, clamp } from "../rng";
import { makeContract, makePlayer } from "../generate";
import { POSITION_VALUE } from "../ratings";
import {
  CAMP_ROSTER_LIMIT, DraftPick, DraftState, GameState, LEAGUE_MINIMUM, Player, PickOwnership,
  Position, POSITION_TARGET, POSITIONS, salaryCap, STARTERS,
} from "../types";
import { positionCount, rosterCount, startSeason } from "../select";
import { draftOrder } from "../season/standings";
import { Posture, REPLACEMENT_OVR, frontOffice, teamOutlook } from "../frontOffice";
import { appendPickOwners, ensurePickInventory, executeTrade, pickValue, picksOwnedBy } from "../trades";
import { TradeAsset, TradeOffer } from "../types";
import { consensusScore, cpuExpectedView, cpuProspectView, generateProspectProfile, riskDiscount } from "../scouting";

/**
 * Draft class generation, scouting and the draft itself.
 *
 * The scouting model is the point of the draft game, so it has the property the
 * old build lacked: the band the user sees is centred on a WRONG number. Scout
 * quality shrinks the error and the band together. Without estimation error a
 * "range" is just the true rating with decoration.
 */

const ROUNDS = 7;

/**
 * The draft board: the men who will actually hear their names called.
 * Real drafts run 254-262 including compensatory selections. Regular slots
 * are still 224 (7×32); compensatory awards append via the published UFA-net
 * formula so the live board grows honestly. See nfl-reference.md §4.
 */
export const DRAFT_BOARD = 258;

/** originalTeamId base for compensatory rows — never a real club id. */
export const COMP_PICK_ORIGIN = 1000;
/** Published NFL cap: at most four compensatory selections per club. */
export const COMP_PICKS_PER_CLUB = 4;

/**
 * The camp pool: distinctly weaker bodies who fill out 90-man rosters and
 * mostly wash out. Teams sign roughly 400-650 undrafted players a year against
 * 2,880 offseason roster spots and only 1,696 active ones, so most of the men
 * who enter the league every year were never draftable at all.
 */
export const CAMP_POOL = 420;

/**
 * Quality as a function of rank on the board.
 *
 * Replaces a five-tier lottery in which every prospect drew from one of five
 * fixed bands. The lottery had no gradient INSIDE a tier, so the top of round
 * one looked like the bottom of it, and the research is emphatic that pick
 * band matters more than round: picks 1-16 and 17-32 differ more from each
 * other than rounds 2 and 3 do.
 *
 * The curve is continuous rather than banded because a real board has no
 * cliffs, and the noise term is what makes the ordering imperfect — a club
 * mis-sorting this list is where steals and reaches come from.
 */
function boardQuality(rank: number, rng: Rng): number {
  // Level calibrated against `drift.ovrDrift`, which is the league's mean OVR
  // movement over twenty seasons and must sit near zero. Two measured points:
  // `76 - 26x^0.55` gave -1.90 (the league deflated) and `82 - 30x^0.5` gave
  // +1.45 (it inflated). This is the interpolation between them.
  const base = 79.5 - 29 * Math.pow(rank / DRAFT_BOARD, 0.52);
  return clamp(Math.round(base + rng.normal(0, 4)), 42, 92);
}

/**
 * How much a quarterback's weight is suppressed at the top of the board.
 *
 * Shaping the ENTIRE top of the board to the real first-round position
 * distribution was too blunt: it dropped running backs to 3% of the elite
 * band, which is true of real first rounds but starved the league of good
 * backs over twenty seasons and pulled league-leading rushing yards down to
 * 1,554 against a 1,989 baseline. Position supply and position DRAFT ORDER are
 * different things, and only the second one was wrong.
 *
 * So supply stays on roster need for every position, and only the quarterback
 * — the one position priced high enough (3.4x) to distort the board on its own
 * — is thinned at the top. Real first rounds are 11.3% quarterback.
 */
const ELITE_QB_SUPPRESSION = 0.34;

/** How deep the suppression runs. */
const ELITE_DEPTH = 48;

/**
 * Generate a draft class on its OWN random stream.
 *
 * `Rng` is mulberry32, whose state advance is `s += 0x6d2b79f5` — a pure
 * counter that does not depend on the values produced. So the state after N
 * draws is a function of N alone, and drawing a different NUMBER of values
 * shifts every random outcome that follows for the rest of the league's life.
 *
 * Because `newGame` generates the first class before it stores `rngState`,
 * that made class size silently couple to every game ever simulated. Changing
 * the class from 460 players to 678 moved `statcheck.leadRushYds` from passing
 * to 1554 — and it then read exactly 1554 across three completely different
 * quality curves, because all three drew the same COUNT. The harness was
 * measuring which stream the season landed on, not the draft.
 *
 * Deriving a child stream from a single parent draw fixes it: the parent
 * advances by exactly one step no matter how big the class is, so the class
 * model and the season simulation are finally independent.
 */
export function generateDraftClass(state: GameState, parent: Rng, season: number): Player[] {
  const rng = new Rng(parent.int(1, 0x7ffffffe));
  const out: Player[] = [];

  const add = (targetOvr: number, pos: Position) => {
    const age = rng.int(21, 23);
    const p = makePlayer(rng, state.nextPlayerId++, {
      pos, targetOvr, age, season, prospect: true,
      potBoost: rng.chance(0.12) ? rng.int(3, 9) : 0,
    });
    p.draftClassSeason = season;
    p.yearsPro = 0;
    // His public identity: school, measurements, testing numbers, and the
    // hidden risk grades scouting can reveal. Same child stream, so class
    // size still cannot couple to the league's simulation stream.
    generateProspectProfile(rng, p);
    out.push(p);
    state.players.push(p);
  };

  const board = DRAFT_BOARD + rng.int(-8, 8);
  for (let rank = 0; rank < board; rank++) {
    const elite = rank < ELITE_DEPTH;
    const pos = rng.weighted(POSITIONS, (q) => {
      const base = POSITION_TARGET[q] * (POSITION_VALUE[q] * 0.5 + 0.6);
      return elite && q === "QB" ? base * ELITE_QB_SUPPRESSION : base;
    });
    add(boardQuality(rank, rng), pos);
  }

  // The camp pool. Flat and low: these are bodies, not prospects.
  const camp = CAMP_POOL + rng.int(-30, 30);
  for (let i = 0; i < camp; i++) {
    const pos = rng.weighted(POSITIONS, (q) => POSITION_TARGET[q]);
    add(clamp(Math.round(rng.normal(49, 4)), 40, 60), pos);
  }

  return out;
}

// ---------------------------------------------------------------------------
// Scouting
// ---------------------------------------------------------------------------

/**
 * Apply scouting effort to a prospect.
 *
 * `effort` 0..100 controls how much the estimate tightens. The reported band is
 * `estimate ± width` where `estimate` carries genuine error — at low effort the
 * midpoint can be badly wrong, which is exactly the risk being modelled.
 */
export function scoutProspect(p: Player, effort: number, rng: Rng): void {
  p.scouted = clamp(p.scouted + effort, 0, 100);

  // Error shrinks from ~11 points at zero scouting to ~1.5 fully scouted.
  const errSd = 11 - (p.scouted / 100) * 9.5;
  const estimate = clamp(Math.round(p.ovr + rng.normal(0, errSd)), 40, 99);
  const width = Math.round(clamp(12 - (p.scouted / 100) * 10, 1.5, 12));

  p.scoutedOvrLow = clamp(estimate - width, 40, 99);
  p.scoutedOvrHigh = clamp(estimate + width, 40, 99);
}

/** Give every prospect a rough initial read so boards aren't blank. */
export function initialScoutingPass(state: GameState, season: number, parent: Rng): void {
  // Same reasoning as `generateDraftClass`: this loops over the class, so its
  // draw count scales with class size and would re-introduce the coupling.
  const rng = new Rng(parent.int(1, 0x7ffffffe));
  for (const p of state.players) {
    if (!p.prospect || p.draftClassSeason !== season) continue;
    p.scouted = 0;
    scoutProspect(p, 12, rng);
  }
}

/**
 * The OVR of the man who would be displaced — the best incumbent among the
 * starting jobs at that position, or replacement level if there is nobody.
 */
function startersAt(state: GameState, teamId: number, pos: Position): number {
  const group = state.players
    .filter((p) => p.teamId === teamId && p.pos === pos && !p.retired && !p.prospect)
    .map((p) => p.ovr)
    .sort((a, b) => b - a);
  const jobs = STARTERS[pos];
  if (group.length < jobs) return REPLACEMENT_OVR;
  // The weakest of the current starters is the one a newcomer replaces.
  return group[jobs - 1];
}

export function canScout(_state: GameState, _teamId: number): boolean {
  return true;
}

export function spendScouting(state: GameState, _teamId: number, playerId: number, rng: Rng): boolean {
  const p = state.players.find((x) => x.id === playerId);
  if (!p || !p.prospect) return false;
  scoutProspect(p, 22, rng);
  return true;
}

// ---------------------------------------------------------------------------
// Rookie slot scale — 2011 CBA shape, ungated (nfl-reference.md §4)
// ---------------------------------------------------------------------------

/**
 * Over The Cap 2024 rookie wage scale as a share of that year's cap
 * ($255.4M). Pick 1 is not pick 32. Applied to this league's live cap
 * and floored at LEAGUE_MINIMUM. Not a careers target.
 */
const ROOKIE_R1_FIRST = 0.03864;
const ROOKIE_R1_LAST = 0.01294;
const ROOKIE_R2_FIRST = 0.00854;
const ROOKIE_TAIL = 0.00312;

/** CBA-shaped cap share for an overall selection. */
export function rookieSlotShare(overallPick: number): number {
  const n = Math.max(1, Math.round(overallPick));
  if (n <= 32) {
    const t = (n - 1) / 31;
    return ROOKIE_R1_FIRST * Math.pow(ROOKIE_R1_LAST / ROOKIE_R1_FIRST, Math.pow(t, 0.72));
  }
  const t = Math.min(1, (n - 33) / 224);
  return ROOKIE_R2_FIRST * Math.pow(ROOKIE_TAIL / ROOKIE_R2_FIRST, Math.pow(t, 0.85));
}

/** Mid-round regular slot when a caller has only a round. */
function midRoundOverall(round: number): number {
  const rd = clamp(Math.round(round), 1, 7);
  return 32 * (rd - 1) + 16;
}

export function rookieSlotApy(state: GameState, overallPick: number): number {
  const cap = salaryCap(state.season, startSeason(state));
  const raw = cap * rookieSlotShare(overallPick);
  return Math.max(LEAGUE_MINIMUM, Math.round(raw / 10_000) * 10_000);
}

export function rookieContract(
  state: GameState, round: number, rng: Rng, overallPick?: number
) {
  const slot = overallPick ?? midRoundOverall(round);
  const apy = rookieSlotApy(state, slot);
  return makeContract(rng, apy, 4, state.season, 2);
}

// ---------------------------------------------------------------------------
// Compensatory picks — UFA net / tiers, zero draws (nfl-reference.md §4)
// ---------------------------------------------------------------------------

export interface UfaMove {
  playerId: number;
  fromTeamId: number;
  toTeamId: number;
  apy: number;
  tier: number;
}

function contractApy(p: Player): number {
  const c = p.contract;
  if (!c || c.years <= 0) return 0;
  const base = c.baseSalary.reduce((a, b) => a + b, 0);
  return Math.round((base + c.signingBonus) / c.years);
}

function lastClubThisSeason(p: Player, season: number): number | null {
  const lines = p.stats.filter((s) => s.season === season && s.teamId != null);
  const last = lines[lines.length - 1];
  return last?.teamId ?? null;
}

function waivedThisOffseason(state: GameState, p: Player): boolean {
  const needle = `waived ${p.firstName} ${p.lastName}`;
  return state.log.some(
    (e) => e.season === state.season && e.kind === "transaction" && e.text.includes(needle)
  );
}

/**
 * OTC-shaped APY tiers as a share of the live cap. Playing-time drop uses
 * last season's games (the new-club snaps the real formula needs have not
 * been played yet). Tiers start at 3 — no first- or second-round comps.
 */
export function compensatoryTier(apy: number, cap: number, games: number): number | null {
  const share = apy / Math.max(1, cap);
  let tier: number | null =
    share >= 0.045 ? 3 :
    share >= 0.030 ? 4 :
    share >= 0.020 ? 5 :
    share >= 0.0115 ? 6 :
    share >= 0.0066 ? 7 :
    null;
  if (tier == null) return null;
  if (games < 8) tier += 1;
  return tier > 7 ? null : tier;
}

/** Qualifying UFA signings this offseason: expired, signed elsewhere, not a cut. */
export function qualifyingUfaMoves(state: GameState): UfaMove[] {
  const cap = salaryCap(state.season, startSeason(state));
  const out: UfaMove[] = [];
  for (const p of state.players) {
    if (p.retired || p.prospect || !p.contract || p.teamId == null) continue;
    if (p.contract.signedSeason !== state.season) continue;
    if (p.draftClassSeason === state.season) continue;
    const from = lastClubThisSeason(p, state.season);
    if (from == null || from === p.teamId) continue;
    if (waivedThisOffseason(state, p)) continue;
    const apy = contractApy(p);
    const games = p.stats.find((s) => s.season === state.season)?.games ?? 0;
    const tier = compensatoryTier(apy, cap, games);
    if (tier == null) continue;
    out.push({ playerId: p.id, fromTeamId: from, toTeamId: p.teamId, apy, tier });
  }
  return out;
}

export interface CompAward {
  teamId: number;
  round: number;
  apy: number;
  playerId: number;
}

/** Net unpaired UFA losses → compensatory slots. Deterministic, zero draws. */
export function computeCompensatoryAwards(state: GameState): CompAward[] {
  const moves = qualifyingUfaMoves(state);
  const byClub = new Map<number, { lost: UfaMove[]; gained: UfaMove[] }>();
  for (const t of state.teams) byClub.set(t.id, { lost: [], gained: [] });
  for (const m of moves) {
    byClub.get(m.fromTeamId)?.lost.push(m);
    byClub.get(m.toTeamId)?.gained.push(m);
  }

  const unpaired: CompAward[] = [];
  for (const t of state.teams) {
    const bag = byClub.get(t.id);
    if (!bag) continue;
    const lost = bag.lost.slice().sort((a, b) => b.apy - a.apy || a.playerId - b.playerId);
    const gained = bag.gained.slice().sort((a, b) => b.apy - a.apy || a.playerId - b.playerId);
    for (const g of gained) {
      let best = -1;
      for (let i = 0; i < lost.length; i++) {
        if (lost[i].tier < g.tier) continue;
        if (best < 0 || lost[i].tier < lost[best].tier ||
          (lost[i].tier === lost[best].tier && lost[i].apy > lost[best].apy)) {
          best = i;
        }
      }
      if (best >= 0) lost.splice(best, 1);
    }
    const kept = lost.slice(0, COMP_PICKS_PER_CLUB);
    for (const m of kept) {
      unpaired.push({ teamId: t.id, round: m.tier, apy: m.apy, playerId: m.playerId });
    }
  }

  unpaired.sort((a, b) => b.apy - a.apy || a.teamId - b.teamId || a.playerId - b.playerId);
  return unpaired;
}

function alreadyAwardedComps(state: GameState, season: number): boolean {
  return (state.pickOwners ?? []).some((p) => p.season === season && p.compensatory);
}

/** Write this class's compensatory rows into pickOwners. Idempotent. */
export function awardCompensatoryPicks(state: GameState, season: number): PickOwnership[] {
  if (alreadyAwardedComps(state, season)) {
    return (state.pickOwners ?? []).filter((p) => p.season === season && p.compensatory);
  }
  const awards = computeCompensatoryAwards(state);
  const rows: PickOwnership[] = awards.map((a, i) => ({
    season,
    round: a.round,
    originalTeamId: COMP_PICK_ORIGIN + i,
    teamId: a.teamId,
    compensatory: true,
  }));
  appendPickOwners(state, rows);
  return rows;
}

function childSeed(seed: number, season: number, week: number, tag: string): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ season, 0x9e3779b9);
  h = Math.imul(h ^ (week + 1), 0x85ebca6b);
  for (let i = 0; i < tag.length; i++) h = Math.imul(h ^ tag.charCodeAt(i), 0xc2b2ae35);
  return (h >>> 0) || 0x9e3779b9;
}

function streamForSlot(state: GameState, pick: DraftPick, parent: Rng): Rng {
  if (!pick.compensatory) return parent;
  const d = state.draft;
  if (!d) return parent;
  if (d.compRngState == null) {
    d.compRngState = childSeed(state.seed, state.season, state.week, "compPicks");
  }
  return new Rng(d.compRngState);
}

function commitStream(state: GameState, pick: DraftPick, used: Rng, parent: Rng): void {
  if (pick.compensatory && state.draft && used !== parent) {
    state.draft.compRngState = used.state;
  }
}

// ---------------------------------------------------------------------------
// Draft board + picks
// ---------------------------------------------------------------------------

export function buildDraftPicks(state: GameState, season: number): DraftPick[] {
  // The ORDER comes from the season that was just PLAYED, which is `season`
  // itself — during the draft phase `state.season` has not rolled over yet.
  // Asking for `season - 1` returned 32 all-zero records (those games were
  // wiped at the previous rollover), every tiebreak fell through to the
  // team-id fallback, and round one was 31,30,29,28... in every save forever.
  //
  // WHO OWNS each slot is a separate question, and it is answered by the
  // persistent pick inventory rather than by the standings — that is what makes
  // a pick a tradeable asset instead of an entitlement.
  ensurePickInventory(state);
  awardCompensatoryPicks(state, season);
  const order = draftOrder(state, season);
  const owners = new Map<string, number>();
  const compsByRound = new Map<number, PickOwnership[]>();
  for (const row of state.pickOwners ?? []) {
    if (row.season !== season) continue;
    if (row.compensatory) {
      const arr = compsByRound.get(row.round) ?? [];
      arr.push(row);
      compsByRound.set(row.round, arr);
    } else {
      owners.set(`${row.round}:${row.originalTeamId}`, row.teamId);
    }
  }

  const picks: DraftPick[] = [];
  let overall = 1;
  for (let round = 1; round <= ROUNDS; round++) {
    for (const originalTeamId of order) {
      const teamId = owners.get(`${round}:${originalTeamId}`) ?? originalTeamId;
      picks.push({ round, pick: overall++, teamId, originalTeamId, playerId: null });
    }
    const extras = (compsByRound.get(round) ?? []).slice().sort(
      (a, b) => a.originalTeamId - b.originalTeamId
    );
    for (const row of extras) {
      picks.push({
        round, pick: overall++, teamId: row.teamId,
        originalTeamId: row.originalTeamId, playerId: null, compensatory: true,
      });
    }
  }
  return picks;
}

export function initDraft(state: GameState, rng: Rng): DraftState {
  const season = state.season;
  if (!state.players.some((p) => p.prospect && p.draftClassSeason === season)) {
    generateDraftClass(state, rng, season);
    initialScoutingPass(state, season, rng);
  }
  return { season, picks: buildDraftPicks(state, season), onClock: 0, complete: false };
}

export function availableProspects(state: GameState, season: number): Player[] {
  return state.players.filter(
    (p) => p.prospect && p.draftClassSeason === season && p.teamId === null && !p.retired
  );
}

/**
 * CPU board value. Uses the CPU's own noisy read of a prospect, positional
 * value, and roster need — so CPU teams draft plausibly without perfect
 * information and without a position-vocabulary bug locking out whole groups.
 */
function cpuBoardValue(
  state: GameState, teamId: number, p: Player, posture: Posture
): number {
  const fo = frontOffice(state, teamId);

  // The club's OWN durable read of the man — never the user's paid-for band,
  // never true `pot`. The old model had both leaks: user scouting sharpened
  // all 31 rival boards, and on the dimension that decides a draft (potential)
  // the CPU read the answer key while the user had no estimate at all. The
  // per-call jitter is gone too — a war room holds an opinion.
  const view = cpuExpectedView(state, teamId, p);
  const room = Math.max(0, view.pot - view.ovr);
  const perceived = view.ovr + (fo.risk - 0.5) * room * 0.35;
  const upside = room * (0.18 + fo.risk * 0.30);

  // Need is about QUALITY, not bodies. Counting heads said a club with three
  // quarterbacks had no need for one — true whether the starter was an 85 or a
  // 62 — so nothing stopped a contender spending a first-round pick on a
  // position it had already solved. With `POSITION_VALUE.QB` at 3.4 that made
  // round one 38% quarterbacks against a real 10-15%, most of whom then never
  // started a game because there are only 32 jobs.
  //
  // The real question a war room asks is how much better this man would make
  // us, which is his projection measured against the man currently doing the
  // job. A club with an elite starter has no need at that position no matter
  // how many bodies it is carrying; a club with a bad one has enormous need.
  const incumbent = startersAt(state, teamId, p.pos);
  const marginal = clamp((view.ovr - incumbent) / 20, -0.6, 1);
  const thin = positionCount(state, teamId, p.pos) < POSITION_TARGET[p.pos] ? 0.35 : 0;
  const need = clamp(marginal + thin, -0.6, 1);

  // bpaBias is literally how much the need term is allowed to move the board.
  // A pure best-player-available desk ignores the roster; a need drafter will
  // reach two rounds for a hole.
  const needWeight = (1 - fo.bpaBias) * 0.55;
  const bias = fo.posBias[p.pos] ?? 1;
  const rebuildUpside = posture === "rebuild" ? 1 + room * 0.012 : 1;

  // Ability ABOVE REPLACEMENT times positional value, never raw ability times
  // positional value. Multiplying the whole rating made a 61 OVR quarterback
  // (61 x 3.4 = 207) worth more than an 85 OVR edge (85 x 1.7 = 145), and the
  // draft went 87% quarterbacks in round one. This is the same mistake that
  // was found and fixed in `evaluate()` when trades were built; it survived
  // here because nothing measured the composition of a draft class until
  // `scripts/careers.ts` existed.
  //
  // Floored at 1 so that below-replacement prospects still sort by positional
  // value rather than inverting — a replacement-level quarterback is worth
  // more than a replacement-level kicker, and a negative times 3.4 would say
  // the opposite.
  //
  // The salary table's 3.4× is still too steep even on surplus. A true-BPA
  // top 32 scored (ovr − replacement) × POSITION_VALUE is ~21% QB against a
  // real 10.3% (nfl-reference.md §2.4); actual CPU drafts sit near 15% only
  // because need / startsHere already suppress below that board. The board
  // reads the square root of the same table so a point of ability is still
  // worth more at quarterback than at safety, without letting the contract
  // premium write the first round. Contracts, trades and generation keep the
  // raw table.
  //
  // Positional value only counts if he actually takes the job. A quarterback
  // premium applies when he STARTS; a backup quarterback is a minimum-wage
  // clipboard holder worth almost nothing, because there are 32 jobs and no
  // more. Discounting by whether he displaces the incumbent is what stops
  // contenders spending firsts on a position they have already solved — the
  // need term alone was far too weak a lever against the salary multiplier.
  const startsHere = clamp((view.ovr - incumbent + 6) / 12, 0.25, 1);
  const above = Math.max(1, perceived - REPLACEMENT_OVR + upside);
  // Medical and character checks are table stakes for a real department, so
  // known risk prices in league-wide rather than per-club.
  return above * Math.sqrt(POSITION_VALUE[p.pos]) * startsHere * bias * rebuildUpside *
    (1 + need * needWeight) * riskDiscount(p);
}

/**
 * A club's read of the best man still on the board — exposed for the
 * on-the-clock trade market, where "how badly do I want this slot" is exactly
 * "what do I think is still there".
 */
export function cpuBoardShortlist(
  state: GameState, teamId: number, pool: Player[], sample = 40
): { p: Player; v: number }[] {
  const { posture } = teamOutlook(state, teamId);
  // Pre-filter by the public consensus so the market check stays cheap; a
  // club's private crush deep down the board is a real thing this misses, and
  // that is acceptable at 32 clubs x 224 picks.
  return pool
    .map((p) => ({ p, c: consensusScore(state, p) }))
    .sort((a, b) => b.c - a.c)
    .slice(0, sample)
    .map((x) => ({ p: x.p, v: cpuBoardValue(state, teamId, x.p, posture) }))
    .sort((a, b) => b.v - a.v);
}

export function cpuTopOfBoard(
  state: GameState, teamId: number, pool: Player[], sample = 40
): { p: Player; v: number } | null {
  return cpuBoardShortlist(state, teamId, pool, sample)[0] ?? null;
}

export function makePick(state: GameState, playerId: number, rng: Rng): boolean {
  const d = state.draft;
  if (!d || d.complete) return false;
  const pick = d.picks[d.onClock];
  if (!pick) return false;

  const p = state.players.find((x) => x.id === playerId);
  if (!p || !p.prospect || p.teamId !== null) return false;

  p.teamId = pick.teamId;
  p.prospect = false;          // becomes a normal player — one namespace, always
  p.draftedRound = pick.round;
  p.draftedPick = pick.pick;
  p.contract = rookieContract(state, pick.round, rng, pick.pick);
  p.scoutedOvrLow = null;
  p.scoutedOvrHigh = null;
  pick.playerId = p.id;

  state.log.push({
    season: state.season, week: state.week, kind: "draft",
    text: `Round ${pick.round}, pick ${pick.pick}: ${state.teams[pick.teamId].abbr} select ${p.firstName} ${p.lastName}, ${p.pos}`,
  });

  d.onClock += 1;
  d.clockOffers = [];        // any offers were for the slot that just picked
  if (d.onClock >= d.picks.length) d.complete = true;
  return true;
}

/** Run CPU picks until the user is on the clock or the draft ends. */
export function runDraftUntilUser(state: GameState, rng: Rng, limit = 320): void {
  const d = state.draft;
  if (!d) return;
  let guard = 0;
  while (!d.complete && guard++ < limit) {
    const pick = d.picks[d.onClock];
    if (!pick) break;
    const slotRng = streamForSlot(state, pick, rng);
    if (pick.teamId === state.userTeamId) {
      generateClockOffers(state, slotRng);
      commitStream(state, pick, slotRng, rng);
      return;
    }
    // The market between picks. A trade changes who is on the clock but never
    // hands the slot to the user, so the loop cannot stall.
    if (slotRng.chance(0.4)) tryCpuClockTrade(state, slotRng);
    cpuPick(state, slotRng);
    commitStream(state, pick, slotRng, rng);
  }
}

export function cpuPick(state: GameState, rng: Rng): void {
  const d = state.draft;
  if (!d || d.complete) return;
  const pick = d.picks[d.onClock];
  if (!pick) return;

  const pool = availableProspects(state, d.season);
  if (pool.length === 0 || rosterCount(state, pick.teamId) >= CAMP_ROSTER_LIMIT) {
    d.onClock += 1;
    if (d.onClock >= d.picks.length) d.complete = true;
    return;
  }

  const { posture } = teamOutlook(state, pick.teamId);
  const scored = pool
    .map((p) => ({ p, v: cpuBoardValue(state, pick.teamId, p, posture) }))
    .sort((a, b) => b.v - a.v);

  // Slight randomness among the top of the board so drafts aren't deterministic.
  const top = scored.slice(0, Math.min(4, scored.length));
  const chosen = rng.weighted(top, (c, i) => Math.max(0.05, 1 - i * 0.28)).p;
  makePick(state, chosen.id, rng);
}

export function runFullDraft(state: GameState, rng: Rng): void {
  const d = state.draft;
  if (!d) return;
  let guard = 0;
  while (!d.complete && guard++ < 400) {
    const pick = d.picks[d.onClock];
    if (!pick) break;
    const slotRng = streamForSlot(state, pick, rng);
    // The clock market runs headlessly too — a simmed draft is still a draft.
    if (pick.teamId !== state.userTeamId && slotRng.chance(0.4)) tryCpuClockTrade(state, slotRng);
    // Auto-pick for the user when they choose to sim the whole thing.
    cpuPick(state, slotRng);
    commitStream(state, pick, slotRng, rng);
  }
  d.complete = true;
}

// ---------------------------------------------------------------------------
// Priority UDFA — the chase after the last pick
// ---------------------------------------------------------------------------

/**
 * How many priority signings one club makes in the minutes after the last pick.
 *
 * Real clubs sign 10-15 UDFAs — into 90-man camps that cut back to 53. The
 * chase is still capped at the men a club's board says can genuinely compete
 * for a place: every signing that plays a down becomes permanent save history
 * (the record book keeps played careers forever), and an appetite of 6 pushed
 * the 20-season save past its 10 MB quota. The camp ceiling is 90; this
 * function does not fill to it.
 */
export const UDFA_SIGNINGS_MAX = 4;

/** The three-year league-minimum deal every real UDFA signs. */
export function udfaContract(state: GameState, rng: Rng) {
  return makeContract(rng, LEAGUE_MINIMUM, 3, state.season, 0);
}

/** How many priority UDFAs this club has already signed from the live class. */
export function udfaSignedCount(state: GameState, teamId: number): number {
  const season = state.draft?.season ?? state.season;
  return state.players.filter(
    (p) =>
      p.teamId === teamId &&
      !p.prospect &&
      !p.retired &&
      p.draftClassSeason === season &&
      p.draftedRound === null
  ).length;
}

/** Sign one undrafted prospect as a priority free agent. */
export function signUdfa(state: GameState, teamId: number, playerId: number, rng: Rng): boolean {
  const d = state.draft;
  if (!d || !d.complete) return false;
  if (udfaSignedCount(state, teamId) >= UDFA_SIGNINGS_MAX) return false;
  const p = state.players.find((x) => x.id === playerId);
  if (!p || !p.prospect || p.teamId !== null) return false;
  if (rosterCount(state, teamId) >= CAMP_ROSTER_LIMIT) return false;

  p.teamId = teamId;
  p.prospect = false;
  p.contract = udfaContract(state, rng);
  p.scoutedOvrLow = null;
  p.scoutedOvrHigh = null;
  state.log.push({
    season: state.season, week: state.week, kind: "draft",
    text: `UDFA: ${state.teams[teamId].abbr} sign ${p.firstName} ${p.lastName}, ${p.pos} (${p.profile?.college ?? "college"})`,
  });
  return true;
}

/**
 * The CPU side of the chase. Runs in rounds so no one club corners the whole
 * pool: each round every club (in a fresh random order) signs the best man
 * left ON ITS OWN BOARD, if it still rates anyone above camp-body level.
 *
 * The user's club is deliberately skipped — choosing which undrafted names to
 * chase is the job, same convention as `cpuResign` and `spendToFloor`. The
 * interactive chase lives in the draft room; a headless run leaves the user's
 * club out, which is the same known bias `checkParity` already corrects for.
 */
export function runUdfaChase(state: GameState, rng: Rng): number {
  const d = state.draft;
  if (!d || !d.complete || d.udfaDone) return 0;

  const pool = () => availableProspects(state, d.season);
  const signedCount = new Map<number, number>();
  let total = 0;

  for (let round = 0; round < UDFA_SIGNINGS_MAX; round++) {
    const order = rng.shuffle(state.teams.map((t) => t.id).filter((id) => id !== state.userTeamId));
    let any = false;
    for (const teamId of order) {
      if ((signedCount.get(teamId) ?? 0) >= UDFA_SIGNINGS_MAX) continue;
      if (rosterCount(state, teamId) >= CAMP_ROSTER_LIMIT) continue;
      const best = cpuTopOfBoard(state, teamId, pool(), 60);
      if (!best) continue;
      // Camp-body threshold: a club only burns a priority call on a man its
      // board says can genuinely compete for a roster spot.
      const view = cpuProspectView(state, teamId, best.p);
      if (Math.max(view.ovr, view.pot - 6) < REPLACEMENT_OVR + 1) continue;
      if (signUdfa(state, teamId, best.p.id, rng)) {
        signedCount.set(teamId, (signedCount.get(teamId) ?? 0) + 1);
        total++;
        any = true;
      }
    }
    if (!any) break;
  }
  d.udfaDone = true;
  return total;
}

/** Undrafted prospects become free agents so the pool never runs dry. */
export function convertUndrafted(state: GameState, season: number): void {
  for (const p of state.players) {
    if (p.prospect && p.draftClassSeason === season && p.teamId === null) {
      p.prospect = false;
      p.scoutedOvrLow = null;
      p.scoutedOvrHigh = null;
    }
  }
}

export function userPicks(state: GameState): DraftPick[] {
  return state.draft?.picks.filter((p) => p.teamId === state.userTeamId) ?? [];
}

export function isUserOnClock(state: GameState): boolean {
  const d = state.draft;
  if (!d || d.complete) return false;
  return d.picks[d.onClock]?.teamId === state.userTeamId;
}

export function draftBoard(state: GameState, sortBy: "board" | "pos" = "board"): Player[] {
  const d = state.draft;
  if (!d) return [];
  const pool = availableProspects(state, d.season);
  const mid = (p: Player) =>
    p.scoutedOvrLow != null && p.scoutedOvrHigh != null
      ? (p.scoutedOvrLow + p.scoutedOvrHigh) / 2
      : 50;
  // Positional value nudges the board; it must not multiply it. Multiplying put
  // every quarterback above every other prospect regardless of grade, which
  // reads as a broken board rather than a premium on the position.
  const boardScore = (p: Player) => mid(p) + (POSITION_VALUE[p.pos] - 1) * 4;
  const sorted = pool.slice().sort((a, b) => {
    if (sortBy === "pos" && a.pos !== b.pos) return a.pos.localeCompare(b.pos);
    return boardScore(b) - boardScore(a) || a.id - b.id;
  });
  return sorted;
}

export function positionsOfNeed(state: GameState, teamId: number): Position[] {
  return (Object.keys(POSITION_TARGET) as Position[])
    .filter((pos) => positionCount(state, teamId, pos) < POSITION_TARGET[pos])
    .sort((a, b) => POSITION_VALUE[b] - POSITION_VALUE[a]);
}

// ---------------------------------------------------------------------------
// The on-the-clock trade market
// ---------------------------------------------------------------------------
//
// Draft weekend is ~35 trades and 31-48% of all annual trade activity, and
// until now the model ran one CPU burst before pick 1 — nobody could move for
// a specific player. The funnel analysis (HANDOFF 2026-07-29) showed why that
// matters: a generic pick swap almost never clears the double-sided margin
// test, but a club on the clock watching its board tier collapse has a
// concrete, LARGE, legible reason to pay. That premium is what clears deals,
// and it is why this is a feature and not a constant.

/** Most trades struck between picks in one draft. Real drafts run ~35 total
 * including the pre-draft moves; the burst before pick 1 supplies the rest. */
export const CLOCK_TRADES_MAX = 24;

/** How many picks of board pressure a buyer looks ahead. */
const CLOCK_LOOKAHEAD = 26;

function liveAsset(d: DraftState, i: number): Extract<TradeAsset, { kind: "pick" }> {
  const pk = d.picks[i];
  return { kind: "pick", season: d.season, round: pk.round, originalTeamId: pk.originalTeamId };
}

function slotInRound(d: DraftState, i: number): number {
  const rd = d.picks[i].round;
  const first = d.picks.findIndex((p) => p.round === rd);
  return first < 0 ? 0 : i - first;
}

/** A pick row shaped for `pickValue`, priced at its KNOWN slot. */
function liveValue(state: GameState, d: DraftState, teamId: number, i: number): number {
  const pk = d.picks[i];
  return pickValue(
    state, teamId,
    { teamId: pk.teamId, season: d.season, round: pk.round, originalTeamId: pk.originalTeamId },
    slotInRound(d, i)
  );
}

/** Re-point every unexercised pick at its current owner after a swap. */
export function syncPicksToOwners(state: GameState): void {
  const d = state.draft;
  if (!d) return;
  const owners = new Map<string, number>();
  for (const row of state.pickOwners ?? []) {
    if (row.season === d.season) owners.set(`${row.round}:${row.originalTeamId}`, row.teamId);
  }
  for (let i = d.onClock; i < d.picks.length; i++) {
    const pk = d.picks[i];
    if (pk.playerId !== null) continue;
    pk.teamId = owners.get(`${pk.round}:${pk.originalTeamId}`) ?? pk.originalTeamId;
  }
}

/**
 * How much a club wants to move up: its board's best man against what its
 * board says will still be there when it picks. This is the tier break —
 * the whole reason draft-day trades exist.
 */
function boardPressure(
  state: GameState, buyerId: number, gap: number, pool: Player[]
): { premium: number; target: Player | null } {
  const scored = cpuBoardShortlist(state, buyerId, pool, 40);
  if (scored.length === 0) return { premium: 0, target: null };
  const v1 = scored[0].v;
  const later = scored[Math.min(gap, scored.length - 1)].v;
  return { premium: (v1 - later) / Math.max(1, later), target: scored[0].p };
}

/** The buyer's next unexercised pick strictly after the slot on the clock. */
function nextLivePickIndex(d: DraftState, teamId: number): number | null {
  for (let i = d.onClock + 1; i < d.picks.length; i++) {
    if (d.picks[i].playerId === null && d.picks[i].teamId === teamId) return i;
  }
  return null;
}

/**
 * Build the cheapest bundle of the buyer's picks that the seller accepts.
 * The buyer's next pick this draft always leads — that is what moving up IS —
 * topped up from his remaining picks, smallest sufficient piece first.
 */
function buildMoveUpBundle(
  state: GameState, d: DraftState, buyerId: number, sellerId: number, slotIdx: number, budget: number
): TradeAsset[] | null {
  const primaryIdx = nextLivePickIndex(d, buyerId);
  if (primaryIdx === null) return null;

  const need = liveValue(state, d, sellerId, slotIdx) * 1.03;
  const bundle: TradeAsset[] = [liveAsset(d, primaryIdx)];
  let toSeller = liveValue(state, d, sellerId, primaryIdx);
  let toBuyer = liveValue(state, d, buyerId, primaryIdx);

  if (toSeller < need) {
    // Sweeteners: later live picks this draft, then future picks.
    const extras: { a: TradeAsset; s: number; b: number }[] = [];
    for (let i = primaryIdx + 1; i < d.picks.length; i++) {
      const pk = d.picks[i];
      if (pk.playerId !== null || pk.teamId !== buyerId) continue;
      extras.push({ a: liveAsset(d, i), s: liveValue(state, d, sellerId, i), b: liveValue(state, d, buyerId, i) });
    }
    for (const row of picksOwnedBy(state, buyerId)) {
      if (row.season === d.season) continue;
      const a: TradeAsset = { kind: "pick", season: row.season, round: row.round, originalTeamId: row.originalTeamId };
      extras.push({ a, s: pickValue(state, sellerId, row), b: pickValue(state, buyerId, row) });
    }
    // Smallest piece that still covers first — round up on the last one.
    extras.sort((x, y) => x.s - y.s);
    while (toSeller < need && bundle.length < 4) {
      const gap = need - toSeller;
      const piece = extras.find((e) => e.s >= gap) ?? extras[extras.length - 1];
      if (!piece) break;
      extras.splice(extras.indexOf(piece), 1);
      bundle.push(piece.a);
      toSeller += piece.s;
      toBuyer += piece.b;
    }
  }

  if (toSeller < need) return null;
  if (toBuyer > budget) return null;   // the premium has a ceiling
  return bundle;
}

/**
 * One attempt at a CPU→CPU move-up for the slot currently on the clock.
 * Returns true if a trade executed (the club on the clock changed).
 */
export function tryCpuClockTrade(state: GameState, rng: Rng): boolean {
  const d = state.draft;
  if (!d || d.complete) return false;
  if ((d.clockTrades ?? 0) >= CLOCK_TRADES_MAX) return false;
  const slotIdx = d.onClock;
  const seller = d.picks[slotIdx]?.teamId;
  if (seller == null || seller === state.userTeamId) return false;

  const pool = availableProspects(state, d.season);
  if (pool.length < 20) return false;

  // Who is feeling pressure? Sample a few clubs picking soon-ish after this.
  const seen = new Set<number>([seller, state.userTeamId]);
  const candidates: { teamId: number; gap: number }[] = [];
  for (let i = slotIdx + 1; i < Math.min(slotIdx + 1 + CLOCK_LOOKAHEAD, d.picks.length); i++) {
    const t = d.picks[i].teamId;
    if (seen.has(t) || d.picks[i].playerId !== null) continue;
    seen.add(t);
    candidates.push({ teamId: t, gap: i - slotIdx });
  }
  if (candidates.length === 0) return false;

  const tries = rng.shuffle(candidates).slice(0, 3);
  for (const { teamId: buyer, gap } of tries) {
    if (gap < 3) continue;                       // no point jumping one spot
    const { premium } = boardPressure(state, buyer, gap, pool);
    // The bar rises steeply at the top of the draft: a move into the top five
    // is a franchise-defining event (~5 first-overall trades in 25 real
    // years), not a Tuesday. Below the top ~16 the tier-break threshold is
    // the ordinary one.
    const bar = slotIdx < 5 ? 0.55 : slotIdx < 16 ? 0.32 : 0.15;
    if (premium < bar) continue;                 // no tier break, no deal

    const budget = liveValue(state, d, buyer, slotIdx) * (1 + Math.min(premium, 0.6) * 0.8);
    const bundle = buildMoveUpBundle(state, d, buyer, seller, slotIdx, budget);
    if (!bundle) continue;

    const offer: TradeOffer = {
      id: state.nextTradeId ?? 1,
      fromTeamId: buyer,
      toTeamId: seller,
      give: bundle,
      get: [liveAsset(d, slotIdx)],
      season: state.season,
      week: state.week,
      rationale: "Moving up for a man our board is not letting out of the building.",
    };
    state.nextTradeId = (state.nextTradeId ?? 1) + 1;
    if (!executeTrade(state, offer).ok) continue;
    d.clockTrades = (d.clockTrades ?? 0) + 1;
    syncPicksToOwners(state);
    return true;
  }
  return false;
}

/**
 * Trade-down offers for the USER's slot, generated when they come on the
 * clock. Same market, same pricing — the difference is these wait for a human.
 */
export function generateClockOffers(state: GameState, rng: Rng, max = 2): void {
  const d = state.draft;
  if (!d || d.complete) return;
  const slotIdx = d.onClock;
  if (d.picks[slotIdx]?.teamId !== state.userTeamId) return;
  d.clockOffers = [];
  if ((d.clockTrades ?? 0) >= CLOCK_TRADES_MAX) return;

  const pool = availableProspects(state, d.season);
  const seen = new Set<number>([state.userTeamId]);
  const candidates: { teamId: number; gap: number }[] = [];
  for (let i = slotIdx + 1; i < Math.min(slotIdx + 1 + CLOCK_LOOKAHEAD, d.picks.length); i++) {
    const t = d.picks[i].teamId;
    if (seen.has(t) || d.picks[i].playerId !== null) continue;
    seen.add(t);
    candidates.push({ teamId: t, gap: i - slotIdx });
  }

  for (const { teamId: buyer, gap } of rng.shuffle(candidates)) {
    if (d.clockOffers.length >= max) break;
    if (gap < 3) continue;
    const { premium } = boardPressure(state, buyer, gap, pool);
    if (premium < 0.15) continue;
    const budget = liveValue(state, d, buyer, slotIdx) * (1 + Math.min(premium, 0.6) * 0.8);
    const bundle = buildMoveUpBundle(state, d, buyer, state.userTeamId, slotIdx, budget);
    if (!bundle) continue;
    d.clockOffers.push({
      id: state.nextTradeId ?? 1,
      fromTeamId: buyer,
      toTeamId: state.userTeamId,
      give: bundle,
      get: [liveAsset(d, slotIdx)],
      season: state.season,
      week: state.week,
      rationale: "They want to come up and get their man.",
    });
    state.nextTradeId = (state.nextTradeId ?? 1) + 1;
  }
}

/** The user accepts a trade-down offer for the slot they are on. */
export function acceptClockOffer(state: GameState, offerId: number, rng: Rng): boolean {
  const d = state.draft;
  if (!d) return false;
  const offer = (d.clockOffers ?? []).find((o) => o.id === offerId);
  if (!offer) return false;
  if (!executeTrade(state, offer).ok) return false;
  d.clockTrades = (d.clockTrades ?? 0) + 1;
  d.clockOffers = [];
  syncPicksToOwners(state);
  runDraftUntilUser(state, rng);
  return true;
}

/**
 * A quote for the user to move UP to the slot currently on the clock: what the
 * club sitting there would take. Returns the bundle or null if the user cannot
 * cover the price (or is already on the clock).
 */
export function quoteMoveUp(state: GameState): TradeAsset[] | null {
  const d = state.draft;
  if (!d || d.complete) return null;
  const slotIdx = d.onClock;
  const seller = d.picks[slotIdx]?.teamId;
  if (seller == null || seller === state.userTeamId) return null;
  if ((d.clockTrades ?? 0) >= CLOCK_TRADES_MAX) return null;
  // The user decides their own premium by accepting or not; the quote itself
  // is priced with no mover's premium beyond the seller's margin.
  return buildMoveUpBundle(state, d, state.userTeamId, seller, slotIdx, Number.POSITIVE_INFINITY);
}

/** Execute the quoted move-up. */
export function acceptMoveUp(state: GameState): boolean {
  const d = state.draft;
  if (!d || d.complete) return false;
  const bundle = quoteMoveUp(state);
  const slotIdx = d.onClock;
  const seller = d.picks[slotIdx]?.teamId;
  if (!bundle || seller == null) return false;
  const offer: TradeOffer = {
    id: state.nextTradeId ?? 1,
    fromTeamId: state.userTeamId,
    toTeamId: seller,
    give: bundle,
    get: [liveAsset(d, slotIdx)],
    season: state.season,
    week: state.week,
    rationale: "",
  };
  state.nextTradeId = (state.nextTradeId ?? 1) + 1;
  if (!executeTrade(state, offer).ok) return false;
  d.clockTrades = (d.clockTrades ?? 0) + 1;
  d.clockOffers = [];
  syncPicksToOwners(state);
  return true;
}
