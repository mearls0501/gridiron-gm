import { Rng, clamp } from "../rng";
import { defaultGuaranteedYears, makeContract, signingBonusFor } from "../generate";
import { POSITION_VALUE } from "../ratings";
import {
  FaBid, FaState, GameState, LEAGUE_MINIMUM, Player, POSITION_TARGET, Position, ROSTER_LIMIT,
} from "../types";
import { capHit, positionCount, rosterCount, teamCap } from "../select";
import { askingPrice, negotiatedApy, suggestedYears } from "./contracts";
import {
  FrontOffice, Posture, SPEND_FLOOR, evaluate, frontOffice, targetSpend, teamOutlook,
} from "../frontOffice";

/**
 * Free agency.
 *
 * CPU teams bid against the user in waves. Every signing is validated against
 * the same cap and roster rules the user faces — the old build let the CPU sign
 * 40 players with no cap check while the user could grab any star for the
 * league minimum through an unguarded endpoint.
 */

export const FA_ROUNDS = 4;

function teamNeed(state: GameState, teamId: number, pos: Position): number {
  const have = positionCount(state, teamId, pos);
  const want = POSITION_TARGET[pos];
  return clamp((want - have) / Math.max(1, want), -0.4, 1);
}

/**
 * Does this club want this player, and how badly.
 *
 * The old version was `(ovr - agePenalty) * positionValue * need` — identical
 * for all 32 teams, so every club ranked the market the same way and the only
 * thing that decided who got whom was the order the shuffle happened to put
 * them in. Now the club's own philosophy and its point in the cycle both apply,
 * so a rebuilding analytics desk and an all-in ground-game team genuinely want
 * different players.
 */
function interest(
  state: GameState, teamId: number, p: Player, posture: Posture, rng: Rng
): number {
  const fo = frontOffice(state, teamId);
  const need = teamNeed(state, teamId, p.pos);

  // A contender will take a clear upgrade at a position it already has covered;
  // a rebuilding club will not sign a 31-year-old to sit behind someone.
  const starBar = posture === "contend" ? 76 : posture === "retool" ? 79 : 84;
  if (need <= 0 && p.ovr < starBar) return 0;
  if (posture === "rebuild" && p.age >= 30 && p.ovr < 82) return 0;

  // Each club scouts the market slightly differently.
  const perceived = p.ovr + rng.normal(0, 2);
  const scoutingNoise = perceived - p.ovr;

  const value = evaluate(state, teamId, p, posture, POSITION_VALUE[p.pos]);
  return (value + scoutingNoise * POSITION_VALUE[p.pos]) * (1 + need * 0.6);
}

export interface FaSigning {
  player: Player;
  teamId: number;
  years: number;
  apy: number;
}

/**
 * Run one wave of CPU free agency. Returns the signings that happened so the UI
 * can show the user what they missed.
 */
export function runCpuFaRound(state: GameState, rng: Rng, round: number): FaSigning[] {
  const signings: FaSigning[] = [];
  const pool = state.players
    .filter((p) => p.teamId === null && !p.retired && !p.prospect)
    .sort((a, b) => b.ovr - a.ovr);

  if (pool.length === 0) return signings;

  // Later rounds are bargain hunting; prices soften.
  const priceMult = [1.12, 1.0, 0.9, 0.8][clamp(round - 1, 0, 3)];

  // Teams act in a random order each wave so the same club doesn't always win —
  // except that clubs under the spending floor go first. They have the money
  // and the holes, and if they wait their turn there is nothing left to buy.
  const teamOrder = rng.shuffle(state.teams.map((t) => t.id))
    .filter((id) => id !== state.userTeamId)
    .sort((a, b) => {
      const ca = teamCap(state, a);
      const cb = teamCap(state, b);
      const da = ca.committed < ca.cap * SPEND_FLOOR ? 0 : 1;
      const db = cb.committed < cb.cap * SPEND_FLOOR ? 0 : 1;
      return da - db;
    });

  for (const teamId of teamOrder) {
    if (rosterCount(state, teamId) >= ROSTER_LIMIT) continue;

    const { posture } = teamOutlook(state, teamId);
    const fo = frontOffice(state, teamId);
    const capInfo = teamCap(state, teamId);
    const target = targetSpend(state, teamId, posture) * capInfo.cap;

    // How active a club is depends on what it is trying to do and how much
    // room it has, not on a coin flip. An all-in team with $80M works the
    // market hard; a rebuilding cap hawk signs one bridge veteran and leaves.
    const roomPct = clamp((target - capInfo.committed) / Math.max(1, capInfo.cap), 0, 1);
    // A club under the league spending floor has to be in the market whatever
    // its philosophy says — this is the mechanism that stops a stripped roster
    // from sitting at a third of the cap forever.
    const belowFloor = capInfo.committed < capInfo.cap * SPEND_FLOOR;
    const appetite =
      (posture === "contend" ? 3.2 : posture === "retool" ? 2.2 : 1.2) *
      (0.5 + fo.capAggression) * (0.35 + roomPct * 4) * (belowFloor ? 2.2 : 1);
    const moves = clamp(Math.round(rng.normal(appetite, 0.8)), 0, belowFloor ? 10 : 6);

    for (let m = 0; m < moves; m++) {
      const cap = teamCap(state, teamId);
      const headroom = target - cap.committed;
      if (headroom <= 1_000_000) break;
      if (rosterCount(state, teamId) >= ROSTER_LIMIT) break;

      const available = pool.filter((p) => p.teamId === null && !p.retired);
      if (available.length === 0) break;

      const ranked = available
        .map((p) => ({ p, v: interest(state, teamId, p, posture, rng) }))
        .filter((x) => x.v > 0)
        .sort((a, b) => b.v - a.v)
        .slice(0, 12);
      if (ranked.length === 0) break;

      const targetEntry = rng.weighted(ranked, (x, i) => Math.max(0.05, 1 - i * 0.1));
      const player = targetEntry.p;

      // A club that badly wants a player will go over the asking price; one
      // that is being disciplined will not. This is what creates a market.
      const eagerness =
        1 + (fo.capAggression - 0.5) * 0.14 + (posture === "contend" ? 0.05 : -0.03) +
        (belowFloor ? 0.30 : 0);
      const apy = negotiatedApy(state, teamId, player, priceMult * eagerness);
      const years = contractYears(player, fo, posture);
      const probe = makeContract(rng, apy, years, state.season, defaultGuaranteedYears(apy, years));
      const hit = capHit(probe);

      // Hard cap discipline: never exceed available space, and stay inside the
      // club's own budget rather than the league maximum.
      if (hit > cap.space) continue;
      if (!belowFloor && hit > headroom) continue;
      // Don't blow more than half the remaining room on one non-star.
      if (!belowFloor && player.ovr < 80 && hit > cap.space * 0.5) continue;

      player.teamId = teamId;
      player.contract = probe;
      signings.push({ player, teamId, years, apy });
      state.log.push({
        season: state.season, week: state.week, kind: "transaction",
        text: `${state.teams[teamId].abbr} signed ${player.firstName} ${player.lastName} (${player.pos}, ${player.ovr} OVR) — ${years}yr / $${(apy / 1e6).toFixed(1)}M per year`,
      });
    }
  }

  return signings;
}

/** Term length, read through the club's own preference for youth and now. */
function contractYears(p: Player, fo: FrontOffice, posture: Posture): number {
  let yrs = suggestedYears(p);
  // Win-now clubs shorten deals to stay flexible; continuity shops lengthen.
  if (posture === "contend" && p.age >= 29) yrs = Math.max(1, yrs - 1);
  if (fo.loyalty > 0.7 && p.age < 28) yrs = Math.min(6, yrs + 1);
  if (fo.youthPreference > 0.75 && p.age >= 30) yrs = Math.max(1, yrs - 1);
  return clamp(yrs, 1, 6);
}

// ---------------------------------------------------------------------------
// The live market
// ---------------------------------------------------------------------------

/**
 * Free agency as a contest rather than a shopping trip.
 *
 * Before this, `signPlayer` handed the user anyone he was willing to pay asking
 * price for, instantly and unopposed — the 31 CPU clubs only ever picked over
 * what he had already declined. `FaState`/`FaBid` were declared for exactly
 * this and left null.
 *
 * Now the user places a BID. When the wave resolves, clubs that want the same
 * player bid against him, and the player picks. Everything the CPU uses here is
 * the machinery that already decided its offscreen signings — `interest()`,
 * `negotiatedApy`, the club's posture and front-office dials — so a club cannot
 * bid in a way it would not have signed.
 *
 * DESIGN DIALS, NOT MEASUREMENTS. `CONTENDER_PULL` and `GUARANTEE_PULL` below
 * are chosen to make a decision interesting, not derived from a primary source,
 * and nothing in the gate is tuned against them. They are deliberately ungated
 * for the same reason `kickExposure` is (invariant 7). If they are ever to be
 * fitted, the number to fit against is how often real free agents take less
 * than the top offer, and that computation does not exist in nfl-reference.md.
 */

/** How much a winning team is worth to a player, as a share of salary. */
const CONTENDER_PULL = 0.16;
/** How much a fully-guaranteed-looking deal is worth beyond its salary. */
const GUARANTEE_PULL = 0.25;
/** Players are not perfectly rational calculators. */
const CHOICE_NOISE_SD = 0.03;

export function openMarket(state: GameState): void {
  state.fa = { round: 1, maxRounds: FA_ROUNDS, bids: [], complete: false };
}

function bidFor(teamId: number, p: Player, years: number, apy: number): FaBid {
  const yrs = clamp(Math.round(years), 1, 6);
  const rate = Math.max(LEAGUE_MINIMUM, Math.round(apy));
  return {
    teamId, playerId: p.id, years: yrs, apy: rate,
    totalValue: rate * yrs,
    signingBonus: signingBonusFor(rate, yrs),
  };
}

export interface BidResult { ok: boolean; reason?: string }

/**
 * Place or replace the user's bid on a free agent.
 *
 * Validated against the same rules `signPlayer` enforces, because a bid the
 * user could not honour is worse than no bid — he would plan around winning a
 * player the cap will not let him have.
 */
export function placeUserBid(
  state: GameState, playerId: number, years: number, apy: number
): BidResult {
  if (!state.fa) return { ok: false, reason: "The market is not open." };
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return { ok: false, reason: "No such player" };
  if (p.retired) return { ok: false, reason: "Player has retired" };
  if (p.teamId !== null) return { ok: false, reason: "Player is already under contract" };

  const bid = bidFor(state.userTeamId, p, years, apy);
  const asking = askingPrice(state, p);
  if (bid.apy < asking * 0.92) {
    return { ok: false, reason: `${p.lastName} will not listen below $${(asking / 1e6).toFixed(1)}M per year.` };
  }

  // Cap is checked against every bid the user already has outstanding, not just
  // this one — otherwise he could bid his whole cap on four players and win all
  // four.
  const probe = capHit(makeContract(new Rng(1), bid.apy, bid.years, state.season,
    defaultGuaranteedYears(bid.apy, bid.years)));
  const others = state.fa.bids
    .filter((b) => b.teamId === state.userTeamId && b.playerId !== playerId)
    .reduce((sum, b) => sum + capHit(makeContract(new Rng(1), b.apy, b.years, state.season,
      defaultGuaranteedYears(b.apy, b.years))), 0);
  const cap = teamCap(state, state.userTeamId);
  if (probe + others > cap.space) {
    return {
      ok: false,
      reason: `That would commit $${((probe + others) / 1e6).toFixed(1)}M against $${(cap.space / 1e6).toFixed(1)}M of room, counting your other outstanding bids.`,
    };
  }

  const openSpots = ROSTER_LIMIT - rosterCount(state, state.userTeamId);
  if (state.fa.bids.filter((b) => b.teamId === state.userTeamId && b.playerId !== playerId).length + 1 > openSpots) {
    return { ok: false, reason: `Only ${openSpots} roster spot${openSpots === 1 ? "" : "s"} open.` };
  }

  state.fa.bids = state.fa.bids.filter(
    (b) => !(b.teamId === state.userTeamId && b.playerId === playerId)
  );
  state.fa.bids.push(bid);
  return { ok: true };
}

export function withdrawUserBid(state: GameState, playerId: number): void {
  if (!state.fa) return;
  state.fa.bids = state.fa.bids.filter(
    (b) => !(b.teamId === state.userTeamId && b.playerId === playerId)
  );
}

export function userBids(state: GameState): FaBid[] {
  return state.fa?.bids.filter((b) => b.teamId === state.userTeamId) ?? [];
}

/**
 * What this offer is worth to the player.
 *
 * Money dominates, but not absolutely — a winning club buys a discount, and so
 * does guaranteed money. That is what gives the user a lever other than cash:
 * build a contender and the market gets cheaper.
 */
function offerScore(state: GameState, p: Player, bid: FaBid, rng: Rng): number {
  const asking = Math.max(1, askingPrice(state, p));
  const money = bid.apy / asking;

  const guaranteeShare = clamp(bid.signingBonus / Math.max(1, bid.totalValue), 0, 0.5);
  const { wins } = teamOutlook(state, bid.teamId);
  const winShare = clamp(wins / 17, 0, 1);

  return money
    * (1 + guaranteeShare * GUARANTEE_PULL)
    * (1 + CONTENDER_PULL * (winShare - 0.5))
    * (1 + rng.normal(0, CHOICE_NOISE_SD));
}

export interface WaveOutcome {
  /** Offscreen CPU signings, as before. */
  signings: FaSigning[];
  /** Players the user bid on and got. */
  won: FaSigning[];
  /** Players the user bid on and lost, with who took them and for how much. */
  lost: { player: Player; teamId: number; years: number; apy: number }[];
}

/**
 * Resolve one wave: contested bids first, then the rest of the market.
 *
 * Contested players are settled BEFORE `runCpuFaRound` so a club that loses the
 * auction still has its money and can go spend it, which is what stops the
 * user's bids from quietly suppressing CPU activity.
 */
export function resolveFaWave(state: GameState, rng: Rng, round: number): WaveOutcome {
  const out: WaveOutcome = { signings: [], won: [], lost: [] };
  const fa = state.fa;

  const pending = fa ? fa.bids.filter((b) => b.teamId === state.userTeamId) : [];
  for (const userBid of pending) {
    const p = state.players.find((x) => x.id === userBid.playerId);
    if (!p || p.teamId !== null || p.retired) continue;

    const { posture: _u } = teamOutlook(state, state.userTeamId);
    const rivals: FaBid[] = [];

    // Which clubs would counter, ranked by how badly they want him. Capped so a
    // single free agent does not pull all 31 clubs into one auction.
    const keen = state.teams
      .map((t) => t.id)
      .filter((id) => id !== state.userTeamId)
      .filter((id) => rosterCount(state, id) < ROSTER_LIMIT)
      .map((id) => ({ id, v: interest(state, id, p, teamOutlook(state, id).posture, rng) }))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, 4);

    for (const { id } of keen) {
      const posture = teamOutlook(state, id).posture;
      const fo = frontOffice(state, id);
      // A club that wants him will stretch past its usual discipline to match a
      // rival's number, but only within the ceiling `negotiatedApy` enforces.
      const eagerness = 1 + (fo.capAggression - 0.5) * 0.14 + (posture === "contend" ? 0.08 : -0.03);
      const apy = negotiatedApy(state, id, p, eagerness * 1.05);
      const years = contractYears(p, fo, posture);
      const rival = bidFor(id, p, years, apy);
      const hit = capHit(makeContract(new Rng(1), rival.apy, rival.years, state.season,
        defaultGuaranteedYears(rival.apy, rival.years)));
      if (hit > teamCap(state, id).space) continue;
      if (rival.apy < askingPrice(state, p) * 0.92) continue;
      rivals.push(rival);
    }

    const field = [userBid, ...rivals];
    const scored = field.map((b) => ({ b, s: offerScore(state, p, b, rng) }));
    scored.sort((a, b) => b.s - a.s);
    const winner = scored[0].b;

    const contract = makeContract(rng, winner.apy, winner.years, state.season,
      defaultGuaranteedYears(winner.apy, winner.years));
    if (capHit(contract) > teamCap(state, winner.teamId).space) continue;

    p.teamId = winner.teamId;
    p.contract = contract;
    const rec = { player: p, teamId: winner.teamId, years: winner.years, apy: winner.apy };
    if (winner.teamId === state.userTeamId) out.won.push(rec);
    else out.lost.push(rec);

    state.log.push({
      season: state.season, week: state.week, kind: "transaction",
      text: `${state.teams[winner.teamId].abbr} signed ${p.firstName} ${p.lastName} (${p.pos}, ${p.ovr} OVR) — ${winner.years}yr / $${(winner.apy / 1e6).toFixed(1)}M per year${field.length > 1 ? ` (${field.length} clubs bid)` : ""}`,
    });
  }

  if (fa) fa.bids = fa.bids.filter((b) => {
    const p = state.players.find((x) => x.id === b.playerId);
    return p != null && p.teamId === null && !p.retired;
  });

  out.signings = runCpuFaRound(state, rng, round);
  if (fa) {
    fa.round = round + 1;
    fa.complete = fa.round > fa.maxRounds;
  }
  return out;
}

export function faPool(state: GameState): Player[] {
  return state.players
    .filter((p) => p.teamId === null && !p.retired && !p.prospect)
    .sort((a, b) => b.ovr - a.ovr);
}

export function faPoolFor(state: GameState, pos: Position | "ALL"): Player[] {
  const pool = faPool(state);
  return pos === "ALL" ? pool : pool.filter((p) => p.pos === pos);
}
