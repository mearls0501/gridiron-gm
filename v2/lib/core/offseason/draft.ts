import { Rng, clamp } from "../rng";
import { makeContract, makePlayer } from "../generate";
import { POSITION_VALUE } from "../ratings";
import {
  DraftPick, DraftState, GameState, LEAGUE_MINIMUM, Player, Position,
  POSITION_TARGET, POSITIONS, ROSTER_LIMIT, STARTERS,
} from "../types";
import { positionCount, rosterCount } from "../select";
import { draftOrder } from "../season/standings";
import { Posture, REPLACEMENT_OVR, frontOffice, teamOutlook } from "../frontOffice";
import { ensurePickInventory } from "../trades";

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
 * Real drafts run 254-262 picks including compensatory selections; v2 has 224
 * (7 x 32, no comp picks), so a few dozen board-grade players go undrafted
 * every year as priority free agents, which is exactly what happens.
 */
export const DRAFT_BOARD = 258;

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

export const SCOUT_COST = 10;

export function canScout(state: GameState, teamId: number): boolean {
  return state.teams[teamId].scoutingPoints >= SCOUT_COST;
}

export function spendScouting(state: GameState, teamId: number, playerId: number, rng: Rng): boolean {
  const team = state.teams[teamId];
  if (team.scoutingPoints < SCOUT_COST) return false;
  const p = state.players.find((x) => x.id === playerId);
  if (!p || !p.prospect) return false;
  team.scoutingPoints -= SCOUT_COST;
  scoutProspect(p, 22, rng);
  return true;
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
  const order = draftOrder(state, season);
  const owners = new Map<string, number>();
  for (const row of state.pickOwners ?? []) {
    if (row.season === season) owners.set(`${row.round}:${row.originalTeamId}`, row.teamId);
  }

  const picks: DraftPick[] = [];
  let overall = 1;
  for (let round = 1; round <= ROUNDS; round++) {
    for (const originalTeamId of order) {
      const teamId = owners.get(`${round}:${originalTeamId}`) ?? originalTeamId;
      picks.push({ round, pick: overall++, teamId, originalTeamId, playerId: null });
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
  state: GameState, teamId: number, p: Player, posture: Posture, rng: Rng
): number {
  const fo = frontOffice(state, teamId);
  const mid =
    p.scoutedOvrLow != null && p.scoutedOvrHigh != null
      ? (p.scoutedOvrLow + p.scoutedOvrHigh) / 2
      : p.ovr;

  // The CPU has its own independent read, so boards differ team to team. A
  // risk-tolerant front office trusts a wider band and swings on the tail.
  const perceived = mid + rng.normal(0, 3.5) + (fo.risk - 0.5) * (p.pot - p.ovr) * 0.35;
  const upside = Math.max(0, p.pot - p.ovr) * (0.18 + fo.risk * 0.30);

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
  const marginal = clamp((mid - incumbent) / 20, -0.6, 1);
  const thin = positionCount(state, teamId, p.pos) < POSITION_TARGET[p.pos] ? 0.35 : 0;
  const need = clamp(marginal + thin, -0.6, 1);

  // bpaBias is literally how much the need term is allowed to move the board.
  // A pure best-player-available desk ignores the roster; a need drafter will
  // reach two rounds for a hole.
  const needWeight = (1 - fo.bpaBias) * 0.55;
  const bias = fo.posBias[p.pos] ?? 1;
  const rebuildUpside = posture === "rebuild" ? 1 + Math.max(0, p.pot - p.ovr) * 0.012 : 1;

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
  // Positional value only counts if he actually takes the job. A quarterback is
  // worth 3.4x a safety when he STARTS; a backup quarterback is a minimum-wage
  // clipboard holder worth almost nothing, because there are 32 jobs and no
  // more. Discounting by whether he displaces the incumbent is what stops
  // contenders spending firsts on a position they have already solved — the
  // need term alone was far too weak a lever against a 3.4x multiplier.
  const startsHere = clamp((mid - incumbent + 6) / 12, 0.25, 1);
  const above = Math.max(1, perceived - REPLACEMENT_OVR + upside);
  return above * POSITION_VALUE[p.pos] * startsHere * bias * rebuildUpside * (1 + need * needWeight);
}

export function rookieContract(state: GameState, round: number, rng: Rng) {
  // Four-year deals for everyone drafted; escalating by round.
  const scale = [0, 5.2, 2.4, 1.5, 1.15, 1.0, 0.95, 0.9][round] ?? 0.9;
  const apy = Math.max(LEAGUE_MINIMUM, Math.round(LEAGUE_MINIMUM * scale));
  return makeContract(rng, apy, 4, state.season, 2);
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
  p.contract = rookieContract(state, pick.round, rng);
  p.scoutedOvrLow = null;
  p.scoutedOvrHigh = null;
  pick.playerId = p.id;

  state.log.push({
    season: state.season, week: state.week, kind: "draft",
    text: `Round ${pick.round}, pick ${pick.pick}: ${state.teams[pick.teamId].abbr} select ${p.firstName} ${p.lastName}, ${p.pos}`,
  });

  d.onClock += 1;
  if (d.onClock >= d.picks.length) d.complete = true;
  return true;
}

/** Run CPU picks until the user is on the clock or the draft ends. */
export function runDraftUntilUser(state: GameState, rng: Rng, limit = 300): void {
  const d = state.draft;
  if (!d) return;
  let guard = 0;
  while (!d.complete && guard++ < limit) {
    const pick = d.picks[d.onClock];
    if (!pick) break;
    if (pick.teamId === state.userTeamId) return;
    cpuPick(state, rng);
  }
}

export function cpuPick(state: GameState, rng: Rng): void {
  const d = state.draft;
  if (!d || d.complete) return;
  const pick = d.picks[d.onClock];
  if (!pick) return;

  const pool = availableProspects(state, d.season);
  if (pool.length === 0 || rosterCount(state, pick.teamId) >= ROSTER_LIMIT + 20) {
    d.onClock += 1;
    if (d.onClock >= d.picks.length) d.complete = true;
    return;
  }

  const { posture } = teamOutlook(state, pick.teamId);
  const scored = pool
    .map((p) => ({ p, v: cpuBoardValue(state, pick.teamId, p, posture, rng) }))
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
    if (pick.teamId === state.userTeamId) {
      // Auto-pick for the user when they choose to sim the whole thing.
      cpuPick(state, rng);
    } else {
      cpuPick(state, rng);
    }
  }
  d.complete = true;
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
