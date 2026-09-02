import { Rng, clamp } from "../rng";
import { defaultGuaranteedYears, makeContract, makePlayer, marketApy } from "../generate";
import {
  GameState, LEAGUE_MINIMUM, MAX_CONTRACT_SHARE, Player, PRACTICE_SQUAD_LIMIT, ROSTER_LIMIT,
  Position, POSITION_MIN, rosterLimit,
} from "../types";
import { capHit, deadMoney, isActiveRoster, isOnWaivers, positionCount, practiceSquadCount, rosterCount, startSeason, teamCap } from "../select";
import { clearRosterSlot } from "../rosterStatus";
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
        clearRosterSlot(p);
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

  p.teamId = null;
  clearRosterSlot(p);
  if (!state.waivers) state.waivers = [];
  if (!state.waivers.some((w) => w.playerId === p.id)) {
    state.waivers.push({ playerId: p.id, originalTeamId: teamId });
  }

  state.log.push({
    season: state.season,
    week: state.week,
    kind: "transaction",
    text: `${state.teams[teamId].abbr} waived ${p.firstName} ${p.lastName} (${p.pos})`,
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
  if (isOnWaivers(state, p.id)) return { ok: false, reason: "Player is on waivers." };
  const hold = rosterLimit(state.phase);
  if (rosterCount(state, teamId) >= hold) {
    return { ok: false, reason: `Roster is full (${hold}). Release someone first.` };
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
  clearRosterSlot(p);
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
export { MAX_CONTRACT_SHARE } from "../types";

/*
 * KNOWN OPEN: `drift.ts` reports a peak single-season cap hit of 30% against a
 * 28% guard, in 1 season of 20. It is NOT this ceiling leaking — dropping it to
 * 0.22 changed the peak by exactly nothing, so the offending contract's AVERAGE
 * is already well inside the limit. The peak comes from `makeContract`'s salary
 * profile: base salaries are back-loaded and the prorated signing bonus rides
 * on top, so a late year of a long deal can charge ~1.4x the APY.
 *
 * That was always true (the guard read 26% before the development work) and the
 * bigger spread in player quality simply pushed one deal over the line. The fix
 * belongs in the salary profile, not in this constant.
 */

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
    const want = clamp(0.10 + quality * 0.70 + fo.loyalty * 0.35 + young + fits + floorPull, 0.02, 0.97);

    // And whether HE wants to stay. Re-signing used to be a one-sided decision,
    // so the better a player was the more certainly he stayed — which is the
    // opposite of what happens. A man with a real market tests it, because
    // somebody out there will pay more than the club that already has him.
    const marketPull = clamp((p.ovr - 70) / 22, 0, 1) * 0.55 * (1 - fo.loyalty * 0.4);
    let chance = clamp(want * (1 - marketPull), 0.02, 0.95);

    // A second contract is earned. The continuity terms above (base / youth /
    // loyalty / floor-pull) were keeping replacement-level late-rounders at
    // ~50% — R7 re-signed with the drafter at 11.5% of a class against ~1.5%
    // (nfl-reference.md §2.3). Veterans still use that formula; a rookie-deal
    // backup walks, and a first-rounder who became a starter still clears it.
    if (p.draftedRound !== null && p.yearsPro <= 4) {
      const earned = clamp((p.ovr - 70) / 12, 0, 1);
      chance = clamp(earned * (0.80 + fo.loyalty * 0.12) * (1 - marketPull), 0, 0.90);
    }
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
    if (p.teamId !== null || p.retired || p.prospect || isOnWaivers(state, p.id)) continue;
    if (pos !== null && p.pos !== pos) continue;
    if (best && p.ovr <= best.ovr) continue;
    if (askingPrice(state, p) > budget) continue;
    best = p;
  }
  return best;
}

/** Sign at the going rate, on a term appropriate to what he costs. */
function signAtMarket(state: GameState, teamId: number, p: Player, rng: Rng): void {
  // Through the same ceiling as every other path. This one went straight to
  // `askingPrice` and bypassed it, which is how a contract reached 30% of the
  // cap while `negotiatedApy` was capping everything else at 22% — the comment
  // on MAX_CONTRACT_SHARE claimed no negotiation could exceed it and one
  // silently did.
  const apy = negotiatedApy(state, teamId, p, 1);
  const yrs = apy <= LEAGUE_MINIMUM * 1.25 ? 1 : suggestedYears(p);
  p.teamId = teamId;
  p.contract = makeContract(rng, apy, yrs, state.season, defaultGuaranteedYears(apy, yrs));
  clearRosterSlot(p);
}

export function fillRoster(
  state: GameState, teamId: number, rng: Rng,
  limit = rosterLimit(state.phase), stashPs = false,
): void {
  // 1. Position minimums first.
  for (const pos of Object.keys(POSITION_MIN) as Position[]) {
    while (positionCount(state, teamId, pos) < POSITION_MIN[pos]) {
      if (rosterCount(state, teamId) >= limit) {
        // Cut the worst player at an over-stocked position to make room.
        if (!cutWorstSurplus(state, teamId, pos)) break;
      }
      // Generate a replacement-level body rather than leave the unit empty.
      const pick = bestAffordable(state, teamId, pos) ?? generateReplacement(state, pos, rng);
      signAtMarket(state, teamId, pick, rng);
    }
  }

  // 2. Fill remaining slots with the best available. Floor is always 53 —
  // camp may hold more, but a short club still needs a season roster.
  let guard = 0;
  while (rosterCount(state, teamId) < ROSTER_LIMIT && guard++ < 120) {
    let pick = bestAffordable(state, teamId, null);
    if (!pick) {
      const pos = (Object.keys(POSITION_MIN) as Position[])[guard % 14];
      pick = generateReplacement(state, pos, rng);
    }
    signAtMarket(state, teamId, pick, rng);
  }

  // 3. Trim only above the phase ceiling (90 in camp, 53 once the season locks).
  // Cutdown extras go to waivers; unclaimed may stash to the 16-man PS.
  guard = 0;
  while (rosterCount(state, teamId) > limit && guard++ < 120) {
    if (stashPs && practiceSquadCount(state, teamId) < PRACTICE_SQUAD_LIMIT) {
      if (moveWorstSurplus(state, teamId, null, "ps")) continue;
    }
    if (!cutWorstSurplus(state, teamId, null)) break;
  }
}

/**
 * Release the least valuable surplus man.
 *
 * This used to sort on raw `p.ovr`, and that was the single largest drain on
 * drafted careers in the game. A rookie is by construction the lowest-rated
 * man on a roster — he is twenty-two, he has not developed yet, and his whole
 * value is potential. So every draft class pushed its club over 53 and this
 * function cut the class straight back off again, before any of them played a
 * down. Seventh rounders had a median career of zero seasons against a real
 * two, and rounds 2-6 were surviving to their fourth season 15-20 points below
 * the real rate (`docs/nfl-reference.md` §2.2).
 *
 * `upgradeRoster` already argued this case in its own docstring — that a young
 * player with a high ceiling should be protected by the club's own valuation
 * rather than by a special case — and then this function, which does far more
 * cutting, ignored it. It also sat against the grain of the third invariant:
 * the game does not decide who plays by sorting on overall.
 *
 * Now it prices the same way `upgradeRoster` does, philosophy and cycle
 * included, plus the sunk draft capital that keeps a real club patient with
 * its own pick.
 */
function cutWorstSurplus(state: GameState, teamId: number, protectPos: Position | null): boolean {
  return moveWorstSurplus(state, teamId, protectPos, "cut");
}

/** Open one active slot so a CPU return from IR can land. PS first, then cut. */
export function freeActiveSlot(state: GameState, teamId: number): boolean {
  if (practiceSquadCount(state, teamId) < PRACTICE_SQUAD_LIMIT) {
    if (moveWorstSurplus(state, teamId, null, "ps")) return true;
  }
  return cutWorstSurplus(state, teamId, null);
}

function moveWorstSurplus(
  state: GameState, teamId: number, protectPos: Position | null, dest: "cut" | "ps"
): boolean {
  const roster = state.players.filter(
    (p) => p.teamId === teamId && !p.retired && !p.prospect && isActiveRoster(p)
  );
  const candidates = roster.filter((p) => {
    if (protectPos && p.pos === protectPos) return false;
    return positionCount(state, teamId, p.pos) > POSITION_MIN[p.pos];
  });
  const { posture } = teamOutlook(state, teamId);
  const worth = (p: Player) =>
    evaluate(state, teamId, p, posture, POSITION_VALUE[p.pos]) + draftCapitalHold(p, state.season);
  const target = candidates.sort((a, b) => worth(a) - worth(b))[0];
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
      if (fa.teamId !== null || fa.retired || fa.prospect || isOnWaivers(state, fa.id)) continue;
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
 * Competition for roster spots — the missing cutdown.
 *
 * `scripts/careers.ts` found that 84% of fourth-round picks were still on a
 * roster in year three against a real 42.6%, and that a seventh rounder became
 * a multi-year starter 15.5% of the time against a real 5.9%. The cause was
 * structural rather than a bad constant: a player was only ever released when
 * his club was over the cap or over 53, and a rookie on a minimum deal is
 * never either. Nobody in the league lost a job on merit.
 *
 * The real analogue is the annual cutdown. Ninety men report, fifty-three stay,
 * and every roster spot is contested every single year. This does the same job
 * with the pieces already here: each club compares the weakest man at each
 * position against the open market and takes the better player.
 *
 * `spendToFloor` already did exactly this, but only for clubs below the
 * spending floor — and the median club sits at 92% of the cap, so in practice
 * it almost never ran. Two things are different here beyond removing that gate:
 *
 *   - The comparison is on `evaluate()` rather than raw OVR, so a young player
 *     with a high ceiling is protected by the club's own valuation instead of
 *     by a special case. That is what gives high picks the longer rope they
 *     get in reality, and it makes the rope vary by front office: a
 *     risk-tolerant, youth-preferring club holds its projects, a win-now club
 *     cuts them for a finished veteran.
 *   - There is no overpay. A club upgrading from a position of strength pays
 *     the market, not a premium.
 */
export const UPGRADE_MARGIN = 4;

/** Swaps per club per offseason. A cutdown, not a teardown. */
export const MAX_UPGRADES = 10;

/**
 * How much extra rope a club gives its own recent draft pick, in OVR points.
 *
 * The docstring above claims `evaluate()` alone protects a young player with a
 * high ceiling. It does not protect him enough: with this function running ten
 * swaps a club a year against a 420-man camp pool, fourth-round picks were
 * surviving to their fourth season 52.9% of the time against a real 70.7%, and
 * a seventh rounder's median career was zero seasons against a real two.
 *
 * The missing force is sunk draft capital. Teams demonstrably over-value their
 * own picks — it is the central finding of Massey & Thaler's "The Loser's
 * Curse" — and the effect is not a bias the game should correct away, it is
 * the mechanism behind a real number in `docs/nfl-reference.md` §2.7: a first
 * rounder who has not started by year three still becomes a starter 42% of the
 * time, because his club keeps giving him chances that a comparable undrafted
 * player never gets.
 *
 * Scaled by round and decaying across the rookie deal, so a first rounder is
 * nearly uncuttable as a rookie and merely favoured by year four, while a
 * seventh rounder gets a nudge. Undrafted players get nothing, which is why
 * they wash out at the rate they do.
 */
const ROUND_HOLD: Record<number, number> = { 1: 14, 2: 10, 3: 7, 4: 5, 5: 4, 6: 3, 7: 2 };

export function draftCapitalHold(p: Player, season: number): number {
  if (p.draftedRound === null || p.draftClassSeason === null) return 0;
  const yearsIn = season - p.draftClassSeason;
  if (yearsIn < 0 || yearsIn > ROOKIE_HOLD_YEARS) return 0;
  const base = ROUND_HOLD[p.draftedRound] ?? 0;
  const hold = base * (1 - yearsIn / (ROOKIE_HOLD_YEARS + 1));
  // Camp rope for the 65-to-53 trim. R7 year-0 stays +8 (PR #8) and decays
  // through the second cutdown. R6 needs a third camp to reach the traced
  // median of 4; R1–R5 already clear the trim on the table.
  if (p.draftedRound === 7 && yearsIn <= 1) {
    return hold + 8 * (1 - yearsIn / 2);
  }
  if (p.draftedRound === 6 && yearsIn <= 2) {
    return hold + 5 * (1 - yearsIn / 3);
  }
  return hold;
}

/** Seasons of rookie-deal protection. The hold is gone once he is paid. */
const ROOKIE_HOLD_YEARS = 4;

export function upgradeRoster(state: GameState, teamId: number, rng: Rng): number {
  const { posture } = teamOutlook(state, teamId);
  const val = (p: Player) => evaluate(state, teamId, p, posture, POSITION_VALUE[p.pos]);
  /** The club's own men are priced with the draft capital already spent on them. */
  const held = (p: Player) => val(p) + draftCapitalHold(p, state.season);
  let swaps = 0;

  while (swaps < MAX_UPGRADES) {
    const space = teamCap(state, teamId).space;
    const roster = state.players.filter(
      (p) => p.teamId === teamId && !p.retired && !p.prospect && p.contract && isActiveRoster(p)
    );

    // The weakest man at each position, by the club's own valuation.
    const worstAt = new Map<Position, Player>();
    for (const p of roster) {
      if (positionCount(state, teamId, p.pos) <= POSITION_MIN[p.pos]) continue;
      const cur = worstAt.get(p.pos);
      if (!cur || held(p) < held(cur)) worstAt.set(p.pos, p);
    }

    let best: Player | null = null;
    let replaced: Player | null = null;
    let bestGain = UPGRADE_MARGIN;

    for (const fa of state.players) {
      if (fa.teamId !== null || fa.retired || fa.prospect || isOnWaivers(state, fa.id)) continue;
      const out = worstAt.get(fa.pos);
      if (!out) continue;
      const gain = val(fa) - held(out);
      if (gain <= bestGain) continue;

      const apy = negotiatedApy(state, teamId, fa, 1);
      const yrs = suggestedYears(fa);
      const probe = makeContract(rng, apy, yrs, state.season, defaultGuaranteedYears(apy, yrs));
      // Has to fit once the outgoing man's hit comes off and his dead money on.
      if (capHit(probe) - capHit(out.contract) + deadMoney(out.contract) > space) continue;

      best = fa;
      replaced = out;
      bestGain = gain;
    }

    if (!best || !replaced) break;

    cutPlayer(state, replaced.id);
    const apy = negotiatedApy(state, teamId, best, 1);
    const yrs = suggestedYears(best);
    best.teamId = teamId;
    best.contract = makeContract(rng, apy, yrs, state.season, defaultGuaranteedYears(apy, yrs));
    swaps++;
  }

  return swaps;
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
      .filter((p) => !isActiveRoster(p) || positionCount(state, teamId, p.pos) > POSITION_MIN[p.pos])
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
export function reconcileRoster(
  state: GameState, teamId: number, rng: Rng,
  limit = rosterLimit(state.phase), stashPs = false,
): void {
  for (let pass = 0; pass < 8; pass++) {
    enforceCap(state, teamId);
    fillRoster(state, teamId, rng, limit, stashPs);

    const cap = teamCap(state, teamId);
    const count = rosterCount(state, teamId);
    if (cap.space >= 0 && count >= ROSTER_LIMIT && count <= limit) return;
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
  fillRoster(state, teamId, rng, limit, stashPs);
}
