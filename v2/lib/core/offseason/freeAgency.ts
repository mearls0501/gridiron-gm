import { Rng, clamp } from "../rng";
import { defaultGuaranteedYears, makeContract } from "../generate";
import { POSITION_VALUE } from "../ratings";
import {
  GameState, Player, POSITION_TARGET, Position, ROSTER_LIMIT,
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

export function faPool(state: GameState): Player[] {
  return state.players
    .filter((p) => p.teamId === null && !p.retired && !p.prospect)
    .sort((a, b) => b.ovr - a.ovr);
}

export function faPoolFor(state: GameState, pos: Position | "ALL"): Player[] {
  const pool = faPool(state);
  return pos === "ALL" ? pool : pool.filter((p) => p.pos === pos);
}
