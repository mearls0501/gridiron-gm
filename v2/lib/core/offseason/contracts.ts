import { Rng, clamp } from "../rng";
import { defaultGuaranteedYears, makeContract, makePlayer, marketApy } from "../generate";
import { GameState, LEAGUE_MINIMUM, Player, ROSTER_LIMIT, Position, POSITION_MIN } from "../types";
import { addDeadCap, capHit, deadMoney, positionCount, rosterCount, startSeason, teamCap } from "../select";
import { POSITION_VALUE } from "../ratings";
import { evaluate, frontOffice, targetSpend, teamOutlook, SPEND_FLOOR, payroll } from "../frontOffice";

/**
 * Contracts, cuts and re-signings.
 *
 * Cap hit = base salary + prorated signing bonus. Cutting accelerates the
 * remaining proration into dead money. Those two rules are what make roster
 * building a real constraint — the old build summed a single "year 1" column,
 * so cutting anyone was free and the cap never bit.
 */

export function contractYearsRemainingAfterRollover(p: Player): number {
  if (!p.contract) return 0;
  return Math.max(0, p.contract.yearsRemaining - 1);
}

/** Roll every contract forward one season. Returns players who hit free agency. */
export function expireContracts(state: GameState): Player[] {
  const expiring: Player[] = [];

  for (const p of state.players) {
    if (p.retired || p.prospect || !p.contract) continue;

    p.contract.yearsRemaining -= 1;
    p.contract.baseSalary = p.contract.baseSalary.slice(1);
    // bonusProrationYears is the TERM of the proration, fixed at signing. How
    // much of it is left is derived from `years - yearsRemaining`; decrementing
    // it here made the annual bonus charge grow every season.
    p.contract.guaranteedYears = Math.max(0, p.contract.guaranteedYears - 1);

    if (p.contract.yearsRemaining <= 0 || p.contract.baseSalary.length === 0) {
      p.contract = null;
      if (p.teamId !== null) {
        expiring.push(p);
        p.teamId = null;
      }
    }
  }

  return expiring;
}

export interface CutResult {
  ok: boolean;
  reason?: string;
  dead: number;
  savings: number;
}

export function cutPlayer(state: GameState, playerId: number): CutResult {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return { ok: false, reason: "No such player", dead: 0, savings: 0 };
  if (p.teamId === null) return { ok: false, reason: "Player is not on a roster", dead: 0, savings: 0 };

  const teamId = p.teamId;
  const dead = deadMoney(p.contract);
  const savings = capHit(p.contract) - dead;

  addDeadCap(state, teamId, dead);
  p.teamId = null;
  p.contract = null;

  state.log.push({
    season: state.season,
    week: state.week,
    kind: "transaction",
    text: `${state.teams[teamId].abbr} released ${p.firstName} ${p.lastName} (${p.pos}) — ${dead > 0 ? `$${(dead / 1e6).toFixed(1)}M dead money` : "no dead money"}`,
  });

  return { ok: true, dead, savings };
}

export interface SignResult {
  ok: boolean;
  reason?: string;
}

/**
 * Sign a free agent. Enforced server-side of the UI, not just in it: roster
 * limit, cap space and the player's own willingness are all checked here so no
 * screen can bypass them.
 */
export function signPlayer(
  state: GameState, playerId: number, teamId: number, years: number, apy: number, rng: Rng
): SignResult {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return { ok: false, reason: "No such player" };
  if (p.retired) return { ok: false, reason: "Player has retired" };
  if (p.teamId !== null) return { ok: false, reason: "Player is already under contract" };
  if (rosterCount(state, teamId) >= ROSTER_LIMIT) {
    return { ok: false, reason: `Roster is full (${ROSTER_LIMIT}). Release someone first.` };
  }

  const yrs = clamp(Math.round(years), 1, 6);
  const offer = Math.max(LEAGUE_MINIMUM, Math.round(apy));

  const asking = askingPrice(state, p);
  if (offer < asking * 0.92) {
    return {
      ok: false,
      reason: `${p.lastName} wants at least $${(asking / 1e6).toFixed(1)}M per year.`,
    };
  }

  const contract = makeContract(rng, offer, yrs, state.season, defaultGuaranteedYears(offer, yrs));
  const hit = capHit(contract);
  const cap = teamCap(state, teamId);
  if (hit > cap.space) {
    return {
      ok: false,
      reason: `Not enough cap space. That deal costs $${(hit / 1e6).toFixed(1)}M against $${(cap.space / 1e6).toFixed(1)}M available.`,
    };
  }

  p.teamId = teamId;
  p.contract = contract;
  state.log.push({
    season: state.season,
    week: state.week,
    kind: "transaction",
    text: `${state.teams[teamId].abbr} signed ${p.firstName} ${p.lastName} (${p.pos}) — ${yrs}yr / $${(offer / 1e6).toFixed(1)}M per year`,
  });
  return { ok: true };
}

/** What this player expects per year on the open market. */
export function askingPrice(state: GameState, p: Player): number {
  return marketApy(p.ovr, p.pos, p.age, state.season, startSeason(state));
}

/**
 * The most any one contract may charge against the cap.
 *
 * `marketApy` already saturates near 26% for a quarterback, but clubs then
 * apply premiums on top — eagerness in free agency, a loyalty bump on their own
 * players, an overpay to clear the spending floor — and those stacked back over
 * the line. This is the backstop: no negotiation, for any reason, produces a
 * deal worth more than a quarter of the cap.
 */
export const MAX_CONTRACT_SHARE = 0.25;

/** Asking price with a club-specific premium, held under the hard ceiling. */
export function negotiatedApy(
  state: GameState, teamId: number, p: Player, premium: number
): number {
  const ceiling = teamCap(state, teamId).cap * MAX_CONTRACT_SHARE;
  return Math.max(
    LEAGUE_MINIMUM,
    Math.min(Math.round(askingPrice(state, p) * premium), Math.round(ceiling))
  );
}

/** Reasonable contract length for a player of this age/ability. */
export function suggestedYears(p: Player): number {
  if (p.age >= 33) return 1;
  if (p.age >= 30) return 2;
  if (p.ovr >= 80) return 5;
  if (p.ovr >= 72) return 4;
  return 3;
}

// ---------------------------------------------------------------------------
// CPU roster management
// ---------------------------------------------------------------------------

/**
 * Re-sign the players a CPU team wants to keep, within its own budget.
 *
 * Retention used to be a flat coin flip on OVR, identical for every club. Now a
 * continuity shop keeps almost everyone it drafted and a cap hawk lets its own
 * thirty-year-olds walk — and a rebuilding team declines to re-sign a good
 * veteran precisely because he is good and will not be here for the next window.
 */
export function cpuResign(state: GameState, teamId: number, candidates: Player[], rng: Rng): Player[] {
  const kept: Player[] = [];
  const fo = frontOffice(state, teamId);
  const { posture } = teamOutlook(state, teamId);
  const budget = targetSpend(state, teamId, posture) * teamCap(state, teamId).cap;
  const floor = teamCap(state, teamId).cap * SPEND_FLOOR;

  const ranked = candidates
    .slice()
    .sort(
      (a, b) =>
        evaluate(state, teamId, b, posture, POSITION_VALUE[b.pos]) -
        evaluate(state, teamId, a, posture, POSITION_VALUE[a.pos])
    );

  for (const p of ranked) {
    if (rosterCount(state, teamId) >= ROSTER_LIMIT) break;
    const cap = teamCap(state, teamId);

    // Clubs pay a premium to keep their own — that is what "loyalty" buys.
    const apy = negotiatedApy(state, teamId, p, 0.94 + fo.loyalty * 0.12);
    const yrs = suggestedYears(p);
    const probe = makeContract(rng, apy, yrs, state.season, defaultGuaranteedYears(apy, yrs));
    const hit = capHit(probe);
    if (hit > cap.space * 0.55) continue;
    if (cap.committed + hit > budget) continue;

    // Whether they actually want him back.
    const quality = clamp((p.ovr - 62) / 26, 0, 1);
    const young = p.age <= 27 ? 0.18 : p.age >= 31 ? -0.20 : 0;
    const fits = posture === "rebuild" && p.age >= 30 ? -0.35 : 0;
    // A club a long way under the spending floor keeps its own people. This is
    // the cheapest possible way to hold payroll up, and it is what real teams
    // do — the alternative is losing a starter you then cannot replace, because
    // by the time free agency has run there is nobody left worth paying.
    const floorPull = clamp((floor - cap.committed) / Math.max(1, floor), 0, 1) * 0.45;
    const chance = clamp(0.10 + quality * 0.70 + fo.loyalty * 0.35 + young + fits + floorPull, 0.02, 0.97);
    if (!rng.chance(chance)) continue;

    p.teamId = teamId;
    p.contract = probe;
    kept.push(p);
  }
  return kept;
}

/**
 * Bring every team to a legal 53 with position minimums satisfied.
 *
 * Runs for the CPU automatically and is available to the user as "auto-fill".
 * This is the single function that guarantees the simulation can always field
 * 22 players — the old build hard-threw mid-week when a roster drifted.
 */
/**
 * Best free agent this team can actually AFFORD at his market price.
 *
 * Roster filling used to hand every signing a one-year league-minimum deal
 * regardless of who the player was, so an 86 OVR free agent asking $18.8M a
 * year could be had for $895K by clicking "auto-fill" — which made the entire
 * free agency screen, the asking price and the 92% floor optional. Now the
 * filler pays the same market price the user does, and a team that has spent
 * its cap gets replacement-level bodies, not bargains.
 *
 * A reserve is held back for the roster spots still unfilled, otherwise one
 * star would eat the whole budget and strand the team at 40 players.
 */
function bestAffordable(
  state: GameState, teamId: number, pos: Position | null
): Player | null {
  const space = teamCap(state, teamId).space;
  const slotsLeft = Math.max(0, ROSTER_LIMIT - rosterCount(state, teamId));
  const reserve = Math.max(0, slotsLeft - 1) * LEAGUE_MINIMUM * 1.3;
  const budget = Math.max(LEAGUE_MINIMUM * 1.25, space - reserve);

  let best: Player | null = null;
  for (const p of state.players) {
    if (p.teamId !== null || p.retired || p.prospect) continue;
    if (pos !== null && p.pos !== pos) continue;
    if (best && p.ovr <= best.ovr) continue;
    if (askingPrice(state, p) > budget) continue;
    best = p;
  }
  return best;
}

/** Sign at the going rate, on a term appropriate to what he costs. */
function signAtMarket(state: GameState, teamId: number, p: Player, rng: Rng): void {
  const apy = askingPrice(state, p);
  const yrs = apy <= LEAGUE_MINIMUM * 1.25 ? 1 : suggestedYears(p);
  p.teamId = teamId;
  p.contract = makeContract(rng, apy, yrs, state.season, defaultGuaranteedYears(apy, yrs));
}

export function fillRoster(state: GameState, teamId: number, rng: Rng): void {
  // 1. Position minimums first.
  for (const pos of Object.keys(POSITION_MIN) as Position[]) {
    while (positionCount(state, teamId, pos) < POSITION_MIN[pos]) {
      if (rosterCount(state, teamId) >= ROSTER_LIMIT) {
        // Cut the worst player at an over-stocked position to make room.
        if (!cutWorstSurplus(state, teamId, pos)) break;
      }
      // Generate a replacement-level body rather than leave the unit empty.
      const pick = bestAffordable(state, teamId, pos) ?? generateReplacement(state, pos, rng);
      signAtMarket(state, teamId, pick, rng);
    }
  }

  // 2. Fill remaining slots with the best available.
  let guard = 0;
  while (rosterCount(state, teamId) < ROSTER_LIMIT && guard++ < 120) {
    let pick = bestAffordable(state, teamId, null);
    if (!pick) {
      const pos = (Object.keys(POSITION_MIN) as Position[])[guard % 14];
      pick = generateReplacement(state, pos, rng);
    }
    signAtMarket(state, teamId, pick, rng);
  }

  // 3. Trim if over.
  guard = 0;
  while (rosterCount(state, teamId) > ROSTER_LIMIT && guard++ < 120) {
    if (!cutWorstSurplus(state, teamId, null)) break;
  }
}

function cutWorstSurplus(state: GameState, teamId: number, protectPos: Position | null): boolean {
  const roster = state.players.filter(
    (p) => p.teamId === teamId && !p.retired && !p.prospect
  );
  const candidates = roster.filter((p) => {
    if (protectPos && p.pos === protectPos) return false;
    return positionCount(state, teamId, p.pos) > POSITION_MIN[p.pos];
  });
  const target = candidates.sort((a, b) => a.ovr - b.ovr)[0];
  if (!target) return false;
  cutPlayer(state, target.id);
  return true;
}

function generateReplacement(state: GameState, pos: Position, rng: Rng): Player {
  const p = makePlayer(rng, state.nextPlayerId++, {
    pos,
    targetOvr: clamp(Math.round(rng.normal(56, 4)), 45, 66),
    age: rng.int(22, 28),
    season: state.season,
  });
  state.players.push(p);
  return p;
}

/**
 * Spend up to the league floor.
 *
 * Nothing used to make a club spend money. A team that lost a lot of contracts
 * in one offseason filled its roster with minimum deals and simply stayed
 * there: measured over twenty seasons, some franchise was sitting at 20-30% of
 * the cap EVERY year, fielding replacement level and losing without ever
 * choosing to. Real leagues have a floor for exactly this reason.
 *
 * It spends by UPGRADING, not by adding — sign a better free agent at a
 * position, release the worst body there — so the roster stays at 53 and the
 * position minimums are never disturbed.
 */
export function spendToFloor(state: GameState, teamId: number, rng: Rng): void {
  const capInfo = teamCap(state, teamId);
  const floor = capInfo.cap * SPEND_FLOOR;
  let guard = 0;

  while (payroll(state, teamId) < floor && guard++ < 100) {
    const space = teamCap(state, teamId).space;
    if (space <= LEAGUE_MINIMUM) break;

    // A club that has to spend bids above the market. This is not a cheat, it
    // is the single most reliable behaviour of a bad team with cap room.
    const shortfall = clamp((floor - payroll(state, teamId)) / floor, 0, 1);
    const overpay = 1 + shortfall * 1.6;

    const roster = state.players.filter(
      (p) => p.teamId === teamId && !p.retired && !p.prospect
    );
    const worstAt = new Map<Position, Player>();
    for (const p of roster) {
      const cur = worstAt.get(p.pos);
      if (!cur || p.ovr < cur.ovr) worstAt.set(p.pos, p);
    }

    let best: Player | null = null;
    let replaced: Player | null = null;
    let bestGain = 0;

    for (const fa of state.players) {
      if (fa.teamId !== null || fa.retired || fa.prospect) continue;
      const out = worstAt.get(fa.pos);
      if (!out) continue;
      const gain = fa.ovr - out.ovr;
      if (gain <= 1 || gain <= bestGain) continue;

      const apy = negotiatedApy(state, teamId, fa, overpay);
      const yrs = suggestedYears(fa);
      const probe = makeContract(rng, apy, yrs, state.season, defaultGuaranteedYears(apy, yrs));
      // The upgrade has to fit once the outgoing player's hit comes off.
      if (capHit(probe) - capHit(out.contract) + deadMoney(out.contract) > space) continue;

      best = fa;
      replaced = out;
      bestGain = gain;
    }

    if (!best || !replaced) {
      // Nothing left worth buying. A club can still convert space into payroll
      // the way real ones do: extend its own young players a year early, at the
      // market rate they would command anyway. This always has candidates,
      // which is what makes the floor reachable rather than aspirational.
      if (!extendOwnPlayer(state, teamId, space, overpay, rng)) break;
      continue;
    }

    cutPlayer(state, replaced.id);
    const apy = negotiatedApy(state, teamId, best, overpay);
    const yrs = suggestedYears(best);
    best.teamId = teamId;
    best.contract = makeContract(rng, apy, yrs, state.season, defaultGuaranteedYears(apy, yrs));
    state.log.push({
      season: state.season, week: state.week, kind: "transaction",
      text: `${state.teams[teamId].abbr} signed ${best.firstName} ${best.lastName} (${best.pos}, ${best.ovr} OVR) — ${yrs}yr / $${(apy / 1e6).toFixed(1)}M per year`,
    });
  }
}

/**
 * Re-cut the most under-paid player on the roster at his real market price.
 *
 * Returns false when there is nobody left to extend, which is the loop's exit.
 */
function extendOwnPlayer(
  state: GameState, teamId: number, space: number, overpay: number, rng: Rng
): boolean {
  const roster = state.players.filter(
    (p) => p.teamId === teamId && !p.retired && !p.prospect && p.contract
  );

  let target: Player | null = null;
  let bestGap = 0;
  for (const p of roster) {
    // A club that must spend pays its own above the market too.
    const market = askingPrice(state, p) * overpay;
    const gap = market - capHit(p.contract);
    if (gap <= LEAGUE_MINIMUM || gap <= bestGap) continue;
    if (gap > space) continue;
    target = p;
    bestGap = gap;
  }
  if (!target) return false;

  const apy = negotiatedApy(state, teamId, target, overpay);
  const yrs = clamp(suggestedYears(target) + 1, 1, 6);
  target.contract = makeContract(rng, apy, yrs, state.season, defaultGuaranteedYears(apy, yrs));
  state.log.push({
    season: state.season, week: state.week, kind: "transaction",
    text: `${state.teams[teamId].abbr} extended ${target.firstName} ${target.lastName} (${target.pos}, ${target.ovr} OVR) — ${yrs}yr / $${(apy / 1e6).toFixed(1)}M per year`,
  });
  return true;
}

/** Bring a team under the cap by releasing the worst value-for-money contracts. */
export function enforceCap(state: GameState, teamId: number): void {
  let guard = 0;
  while (teamCap(state, teamId).space < 0 && guard++ < 60) {
    const roster = state.players.filter(
      (p) => p.teamId === teamId && !p.retired && !p.prospect && p.contract
    );
    // Cut the player whose cap hit buys the least ability, protecting minimums.
    const candidates = roster
      .filter((p) => positionCount(state, teamId, p.pos) > POSITION_MIN[p.pos])
      .map((p) => ({
        p,
        savings: capHit(p.contract) - deadMoney(p.contract),
        cost: Math.pow(Math.max(1, p.ovr - 45), 1.6),
      }))
      .filter((c) => c.savings > 0)
      .sort((a, b) => b.savings / b.cost - a.savings / a.cost);

    if (candidates.length === 0) break;
    cutPlayer(state, candidates[0].p.id);
  }
}

/**
 * Bring a team to a legal roster AND under the cap.
 *
 * These two constraints fight each other — cutting for cap space drops the
 * roster below 53, and refilling adds salary back — so they have to be solved
 * together rather than in sequence. Running `enforceCap` once and then
 * `fillRoster` once leaves teams over the cap, which is exactly what the
 * verification harness caught.
 */
export function reconcileRoster(state: GameState, teamId: number, rng: Rng): void {
  for (let pass = 0; pass < 8; pass++) {
    enforceCap(state, teamId);
    fillRoster(state, teamId, rng);

    const cap = teamCap(state, teamId);
    const count = rosterCount(state, teamId);
    if (cap.space >= 0 && count === ROSTER_LIMIT) return;
  }

  // Last resort: replace the most expensive cuttable contracts with minimum
  // deals until the books balance. Guarantees a legal team every time.
  let guard = 0;
  while (teamCap(state, teamId).space < 0 && guard++ < 80) {
    const roster = state.players.filter(
      (p) => p.teamId === teamId && !p.retired && !p.prospect && p.contract
    );
    const target = roster
      .filter((p) => capHit(p.contract) > LEAGUE_MINIMUM * 2)
      .sort((a, b) => capHit(b.contract) - capHit(a.contract))[0];
    if (!target) break;
    // Renegotiate down rather than cut — keeps the roster at 53. This is the
    // escape hatch that guarantees a legal team, but it is a 95% haircut the
    // player never agreed to, so it must never happen silently.
    const was = capHit(target.contract);
    target.contract = makeContract(rng, LEAGUE_MINIMUM, 1, state.season, 0);
    state.log.push({
      season: state.season, week: state.week, kind: "transaction",
      text: `${state.teams[teamId].abbr} restructured ${target.firstName} ${target.lastName} (${target.pos}) to the league minimum — forced by the cap, was $${(was / 1e6).toFixed(1)}M`,
    });
  }
  fillRoster(state, teamId, rng);
}
