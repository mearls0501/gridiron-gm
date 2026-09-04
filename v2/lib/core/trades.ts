import { Rng, clamp } from "./rng";
import { POSITION_VALUE } from "./ratings";
import {
  DraftPick, GameState, PICK_HORIZON, PickOwnership, Player, POSITION_MIN, POSITION_TARGET,
  Position, ROSTER_LIMIT, STARTERS, TRADE_DEADLINE_WEEK, TradeAsset, TradeOffer,
} from "./types";
import {
  addDeadCap, capHit, deadMoney, isActiveRoster, positionCount, rosterCount, teamCap, teamRoster,
} from "./select";
import { Posture, REPLACEMENT_OVR, evaluate, frontOffice, teamOutlook } from "./frontOffice";
import { askingPrice } from "./offseason/contracts";
import { draftOrder } from "./season/standings";

/**
 * Trades.
 *
 * There was no trade system at all — `grep -ri trade` across the whole codebase
 * returned a single comment. `DraftPick.originalTeamId` existed and was never
 * used for anything.
 *
 * Two design commitments here:
 *
 *  1. **Valuation is asymmetric.** Both clubs price the deal in their OWN
 *     currency, using the same `evaluate()` the draft and free agency use. A
 *     trade happens precisely when two front offices disagree about what
 *     something is worth — a rebuilding analytics desk selling a 30-year-old
 *     back to a win-now ground-game team is not either side being fooled. A
 *     single league-wide value chart would mean no trade is ever mutually
 *     beneficial, and nothing would ever move.
 *
 *  2. **Trading a contract costs the sender.** The remaining signing-bonus
 *     proration accelerates onto the club that paid it, exactly as it does on a
 *     cut. Otherwise a bad contract is a free thing to give away and the cap
 *     stops being a constraint the moment the trade screen opens.
 */

// ---------------------------------------------------------------------------
// Pick inventory
// ---------------------------------------------------------------------------

const ROUNDS = 7;

/** Make sure every club owns its own picks for the next few classes. */
export function ensurePickInventory(state: GameState): void {
  if (!state.pickOwners) state.pickOwners = [];
  const have = new Set(state.pickOwners.map((p) => `${p.season}:${p.round}:${p.originalTeamId}`));

  for (let i = 0; i < PICK_HORIZON; i++) {
    const season = state.season + i;
    for (let round = 1; round <= ROUNDS; round++) {
      for (const t of state.teams) {
        const key = `${season}:${round}:${t.id}`;
        if (have.has(key)) continue;
        state.pickOwners.push({ season, round, originalTeamId: t.id, teamId: t.id });
      }
    }
  }
}

/** Drop rows for classes that have already been drafted. */
export function prunePickInventory(state: GameState, throughSeason: number): void {
  if (!state.pickOwners) return;
  state.pickOwners = state.pickOwners.filter((p) => p.season > throughSeason);
  // finalizeOffseason calls this after convertUndrafted and before the
  // 53-man reconcile — the real cutdown, and the only hook this file owns
  // on that spine. Child stream, not the parent: finalize holds its own
  // Rng copy and would overwrite a write-back of state.rngState.
  if (state.phase === "offseason-final") {
    const cutRng = new Rng((state.rngState ^ Math.imul(state.season, 0x9e3779b9) ^ 0x0c47d001) >>> 0);
    runCutdownTrades(state, cutRng);
  }
}

/**
 * The concrete board slot for a year+round row, when that class is on the
 * clock. Clock trades already reason in these slots (`liveAsset` in draft.ts);
 * mid-draft /trades inventory has to as well, or a spent pick stays listed as
 * a generic "2026 R1".
 */
export function liveDraftSlot(
  state: GameState,
  pick: { season: number; round: number; originalTeamId: number }
): DraftPick | undefined {
  const d = state.draft;
  if (!d || d.season !== pick.season) return undefined;
  return d.picks.find(
    (pk) => pk.round === pick.round && pk.originalTeamId === pick.originalTeamId
  );
}

/** A year+round aggregate that includes a used slot is a dead asset. */
export function isSpentPick(
  state: GameState,
  pick: { season: number; round: number; originalTeamId: number }
): boolean {
  // Prior-class rows are spent even when no draft is on the clock — otherwise
  // leftover pickOwners from a missed prune stay listed as live inventory.
  if (pick.season < state.season) return true;
  const d = state.draft;
  if (!d || d.season !== pick.season) return false;
  if (d.complete) return true;
  const slot = liveDraftSlot(state, pick);
  return slot != null && slot.playerId !== null;
}

/**
 * Closed-window leftover is for Reject during the same regular season
 * (and through the playoffs). Year rollover — Recap / tag / FA / camp /
 * next preseason — drops those in-season offers so they cannot reopen.
 */
export function pruneStaleTradeInbox(state: GameState): void {
  if (!state.tradeOffers?.length) return;
  if (state.phase === "regular" || state.phase === "playoffs") return;
  state.tradeOffers = state.tradeOffers.filter((o) => o.week > TRADE_DEADLINE_WEEK);
}

export function picksOwnedBy(state: GameState, teamId: number, season?: number): PickOwnership[] {
  return (state.pickOwners ?? [])
    .filter((p) => p.teamId === teamId && (season === undefined || p.season === season))
    .filter((p) => !isSpentPick(state, p))
    .sort((a, b) => a.season - b.season || a.round - b.round || a.originalTeamId - b.originalTeamId);
}

function findPick(state: GameState, a: Extract<TradeAsset, { kind: "pick" }>): PickOwnership | undefined {
  return (state.pickOwners ?? []).find(
    (p) => p.season === a.season && p.round === a.round && p.originalTeamId === a.originalTeamId
  );
}

// ---------------------------------------------------------------------------
// Valuation
// ---------------------------------------------------------------------------

/**
 * What a pick is worth, in the same units `evaluate()` returns for players.
 *
 * Round is most of it, but WHOSE pick matters: a bad team's second is worth
 * more than a good team's second, which is the whole reason a rebuild trades
 * for other clubs' futures rather than its own.
 */
export function pickValue(
  state: GameState, teamId: number, pick: PickOwnership, slotIndex?: number
): number {
  const fo = frontOffice(state, teamId);

  // Round value, steeply convex — the top of a draft is not four seconds.
  //
  // Calibrated against what `evaluate()` returns for PLAYERS, since the two get
  // added together in a package. The scale is "ability above replacement times
  // positional value", so a first is priced around a good young starter (an 85
  // quarterback prices at ~92, a 78 receiver at ~28) and a seventh is priced at
  // roughly nothing, which is what a seventh is.
  const ROUND_BASE = [0, 90, 40, 22, 13, 8, 5, 3];
  let value = ROUND_BASE[pick.round] ?? 3;

  // Where in the round it falls. During the draft itself the slot is KNOWN —
  // callers on the clock pass it — otherwise it is estimated from the original
  // club's last finish. `draftOrder` is worst-first, so a low index is early.
  const order = draftOrder(state, state.season - 1);
  const slot = slotIndex ?? order.indexOf(pick.originalTeamId);
  if (slot >= 0) {
    // +25% at the very top of a round, -25% at the bottom.
    value *= 1.25 - (slot / Math.max(1, order.length - 1)) * 0.5;
  }

  // How steeply this club's own board falls away.
  //
  // This is what makes a pick-for-pick trade possible at all, and it was
  // missing. Every club used to price picks on the same curve scaled by one
  // flat appetite multiplier — and a scalar cancels out of both sides of a
  // swap, so the proposer's "am I better off" test and the receiver's "do I
  // like this" test were exactly contradictory. Working it through: the
  // receiver needed the bundle to be worth more than 1.13x the target and the
  // proposer needed it to be worth less than 1.10x, so no bundle could ever
  // satisfy both and the league struck zero pick swaps.
  //
  // The real disagreement is not about picks in general, it is about EARLY
  // picks against LATE ones. A club with its window open wants the one player
  // and will send three Day 3 picks to get him; a club two years out wants the
  // three swings. That is the trade. `docs/nfl-reference.md` §1.4: rounds 5-7
  // are 55% of every pick that changes hands.
  //
  // Mean-preserving at `winNow = 0.5`, so a league of neutral clubs prices
  // picks exactly as before.
  const earliness = (8 - pick.round) / 7;
  const topHeavy = 0.8 + fo.winNow * 0.4;
  value *= Math.pow(topHeavy, earliness * 3);

  // A pick two years out is a promise, not a player — and how much of a promise
  // depends on whether you expect to be good when it lands.
  const yearsOut = Math.max(0, pick.season - state.season);
  value *= Math.pow(0.72 + (1 - fo.winNow) * 0.18, yearsOut);

  // Rebuilders and draft hoarders pay over the odds for picks; win-now clubs
  // treat them as loose change.
  const appetite = 0.72 + (1 - fo.winNow) * 0.5 + fo.bpaBias * 0.22;
  return value * appetite;
}

/**
 * What a player is worth to this club, net of what his contract costs.
 *
 * `evaluate()` already reads ability through the club's philosophy and its
 * point in the cycle. The contract term is what stops a 30-year-old on a
 * maximum deal from being an asset.
 */
export function playerTradeValue(
  state: GameState, teamId: number, p: Player, posture: Posture
): number {
  const raw = evaluate(state, teamId, p, posture, POSITION_VALUE[p.pos]);

  // Price the deal: paying under market is an asset, over market is a burden.
  const market = askingPrice(state, p);
  const hit = capHit(p.contract);
  const surplus = (market - hit) / Math.max(1, teamCap(state, teamId).cap);
  const contractAdj = clamp(surplus * 340, -70, 45);

  // Somebody who cannot stay on the field is worth less than his rating.
  const health = p.injuryWeeks > 0 ? 1 - clamp(p.injuryWeeks / 30, 0, 0.55) : 1;
  const durable = 0.85 + (p.durability / 100) * 0.3;

  return Math.max(0, (raw + contractAdj) * health * durable);
}

export function assetValue(
  state: GameState, teamId: number, a: TradeAsset, posture: Posture
): number {
  if (a.kind === "player") {
    const p = state.players.find((x) => x.id === a.playerId);
    return p ? playerTradeValue(state, teamId, p, posture) : 0;
  }
  const pick = findPick(state, a);
  return pick ? pickValue(state, teamId, pick) : 0;
}

export function packageValue(
  state: GameState, teamId: number, assets: TradeAsset[], posture: Posture
): number {
  let total = 0;
  for (const a of assets) total += assetValue(state, teamId, a, posture);
  // Two good players are not quite worth one great one — you can only start so
  // many. Mild concavity keeps quantity from beating quality.
  //
  // Counted over PLAYERS only. Applying it to picks was quietly fatal to
  // pick-for-pick trading: a three-for-one swap took a 9% haircut on the side
  // sending three, which meant the receiving club needed the bundle to be worth
  // over 1.13x the target while the proposing club needed it to be worth under
  // 1.10x. No bundle satisfies both, so the league struck none. The rationale
  // does not apply to picks anyway — a club cannot start a draft pick, and
  // stockpiling them is the recognised rebuilding strategy rather than a
  // mistake the model should price against.
  const players = assets.filter((a) => a.kind === "player").length;
  return players > 1 ? total * (1 - Math.min(0.14, (players - 1) * 0.045)) : total;
}

// ---------------------------------------------------------------------------
// Legality
// ---------------------------------------------------------------------------

export interface TradeCheck {
  ok: boolean;
  reason?: string;
}

export function tradeWindowOpen(state: GameState): boolean {
  if (state.phase === "regular") return state.week <= TRADE_DEADLINE_WEEK;
  if (state.phase === "preseason") return true;
  return state.phase.startsWith("offseason");
}

/**
 * Can this deal actually be executed.
 *
 * Checked here rather than in the UI, for the same reason `signPlayer` is: no
 * screen may be able to produce an illegal roster or an over-cap club.
 */
export function checkTrade(state: GameState, offer: TradeOffer): TradeCheck {
  if (!tradeWindowOpen(state)) {
    return { ok: false, reason: "The trade window is closed." };
  }
  if (offer.give.length === 0 && offer.get.length === 0) {
    return { ok: false, reason: "Nothing is being traded." };
  }

  for (const [teamId, assets] of [
    [offer.fromTeamId, offer.give],
    [offer.toTeamId, offer.get],
  ] as [number, TradeAsset[]][]) {
    for (const a of assets) {
      if (a.kind === "player") {
        const p = state.players.find((x) => x.id === a.playerId);
        if (!p) return { ok: false, reason: "A player in this deal no longer exists." };
        if (p.teamId !== teamId) {
          return { ok: false, reason: `${p.lastName} is not on that roster.` };
        }
        if (p.retired || p.prospect) {
          return { ok: false, reason: `${p.lastName} cannot be traded.` };
        }
      } else {
        const pick = findPick(state, a);
        if (!pick) return { ok: false, reason: "That pick does not exist." };
        if (pick.teamId !== teamId) return { ok: false, reason: "That pick belongs to someone else." };
        if (pick.season < state.season || isSpentPick(state, pick)) {
          return { ok: false, reason: "That pick has already been used." };
        }
      }
    }
  }

  // Roster and cap, both directions.
  for (const [teamId, out, incoming] of [
    [offer.fromTeamId, offer.give, offer.get],
    [offer.toTeamId, offer.get, offer.give],
  ] as [number, TradeAsset[], TradeAsset[]][]) {
    const leaving = out.filter((a) => {
      if (a.kind !== "player") return false;
      const p = state.players.find((x) => x.id === a.playerId);
      return !!p && isActiveRoster(p);
    }).length;
    const arriving = incoming.filter((a) => {
      if (a.kind !== "player") return false;
      const p = state.players.find((x) => x.id === a.playerId);
      return !!p && isActiveRoster(p);
    }).length;
    const after = rosterCount(state, teamId) - leaving + arriving;
    // Offseason rosters sit over 53 after the draft and the UDFA chase;
    // finalize's cutdown brings them back. Blocking those deals is why the
    // late-August window in docs/nfl-reference.md §1.2 (~16 trades, ~17% of
    // the year) produced nothing.
    if (after > ROSTER_LIMIT && !state.phase.startsWith("offseason")) {
      return { ok: false, reason: `${state.teams[teamId].abbr} would be at ${after} players.` };
    }

    // Position minimums have to survive the trade during the season, when
    // there is no cutdown coming to fix them.
    if (state.phase === "regular" || state.phase === "playoffs") {
      const delta = new Map<Position, number>();
      for (const a of out) {
        if (a.kind !== "player") continue;
        const p = state.players.find((x) => x.id === a.playerId)!;
        if (!isActiveRoster(p)) continue;
        delta.set(p.pos, (delta.get(p.pos) ?? 0) - 1);
      }
      for (const a of incoming) {
        if (a.kind !== "player") continue;
        const p = state.players.find((x) => x.id === a.playerId)!;
        if (!isActiveRoster(p)) continue;
        delta.set(p.pos, (delta.get(p.pos) ?? 0) + 1);
      }
      for (const [pos, d] of delta) {
        if (positionCount(state, teamId, pos) + d < POSITION_MIN[pos]) {
          return { ok: false, reason: `${state.teams[teamId].abbr} would be short at ${pos}.` };
        }
      }
    }

    // Cap: the sender eats the dead money, the receiver takes on base salary.
    let change = 0;
    for (const a of out) {
      if (a.kind !== "player") continue;
      const p = state.players.find((x) => x.id === a.playerId)!;
      change += deadMoney(p.contract) - capHit(p.contract);
    }
    for (const a of incoming) {
      if (a.kind !== "player") continue;
      const p = state.players.find((x) => x.id === a.playerId)!;
      change += p.contract?.baseSalary[0] ?? 0;
    }
    if (teamCap(state, teamId).space - change < 0) {
      return { ok: false, reason: `${state.teams[teamId].abbr} cannot fit the contracts.` };
    }
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

function moveAsset(state: GameState, a: TradeAsset, toTeamId: number): void {
  if (a.kind === "pick") {
    const pick = findPick(state, a);
    if (pick) pick.teamId = toTeamId;
    return;
  }

  const p = state.players.find((x) => x.id === a.playerId);
  if (!p || p.teamId === null || !p.contract) return;

  // The club that paid the signing bonus keeps what is left of it.
  const from = p.teamId;
  const proration = deadMoney(p.contract) - remainingGuaranteed(p);
  if (proration > 0) addDeadCap(state, from, Math.round(proration));

  // The receiving club inherits base salary only.
  p.contract = { ...p.contract, signingBonus: 0, bonusProrationYears: 0, guaranteedYears: 0 };
  p.teamId = toTeamId;
}

/** Re-point every unexercised slot at its current owner after a mid-draft swap. */
function syncLiveDraftOwners(state: GameState): void {
  const d = state.draft;
  if (!d || d.complete) return;
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

function remainingGuaranteed(p: Player): number {
  const c = p.contract;
  if (!c) return 0;
  let g = 0;
  for (let i = 0; i < Math.min(c.guaranteedYears, c.yearsRemaining); i++) g += c.baseSalary[i] ?? 0;
  return g;
}

/**
 * The underlying object behind an asset, so a screen can render a player the
 * same way every other table on the site does rather than as a flat string.
 */
export function resolveAsset(
  state: GameState, a: TradeAsset
): { kind: "player"; player: Player } | { kind: "pick"; pick: PickOwnership } | null {
  if (a.kind === "player") {
    const player = state.players.find((x) => x.id === a.playerId);
    return player ? { kind: "player", player } : null;
  }
  const pick = findPick(state, a);
  return pick ? { kind: "pick", pick } : null;
}

export function describeAsset(state: GameState, a: TradeAsset): string {
  if (a.kind === "player") {
    const p = state.players.find((x) => x.id === a.playerId);
    return p ? `${p.firstName} ${p.lastName} (${p.pos}, ${p.ovr})` : "a player";
  }
  const owner = state.teams[a.originalTeamId];
  const origin = owner ? ` (${owner.abbr})` : "";
  const pick = findPick(state, a);
  if (!pick || isSpentPick(state, a)) {
    return `${a.season} R${a.round}${origin} (used)`;
  }
  const slot = liveDraftSlot(state, pick);
  if (slot && slot.playerId === null) return `${pick.season} #${slot.pick}${origin}`;
  return `${pick.season} R${pick.round}${origin}`;
}

export function executeTrade(state: GameState, offer: TradeOffer): TradeCheck {
  const check = checkTrade(state, offer);
  if (!check.ok) return check;

  for (const a of offer.give) moveAsset(state, a, offer.toTeamId);
  for (const a of offer.get) moveAsset(state, a, offer.fromTeamId);
  syncLiveDraftOwners(state);
  state.nextTradeId = Math.max(state.nextTradeId ?? 1, offer.id + 1);

  const from = state.teams[offer.fromTeamId];
  const to = state.teams[offer.toTeamId];
  state.log.push({
    season: state.season,
    // `state.week` is still sitting on the last playoff week all offseason.
    week: state.phase.startsWith("offseason") ? 0 : state.week,
    kind: "transaction",
    text:
      `Trade: ${to.abbr} receive ${offer.give.map((a) => describeAsset(state, a)).join(", ") || "nothing"} ` +
      `from ${from.abbr} for ${offer.get.map((a) => describeAsset(state, a)).join(", ") || "nothing"}`,
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// The CPU side
// ---------------------------------------------------------------------------

export interface OfferVerdict {
  accept: boolean;
  margin: number;
  /** What the receiving club thinks it is getting and giving up. */
  incoming: number;
  outgoing: number;
  /**
   * Whether the deal is legal at all. Separate from `accept` on purpose: a club
   * can love an offer that happens to bust a roster limit, and telling the user
   * "they decline" when the real problem is a 54th man is a lie.
   */
  legal: boolean;
  illegalReason?: string;
}

/** Does the receiving club like this enough to say yes. */
export function evaluateOffer(state: GameState, offer: TradeOffer): OfferVerdict {
  const { posture } = teamOutlook(state, offer.toTeamId);
  const incoming = packageValue(state, offer.toTeamId, offer.give, posture);
  const outgoing = packageValue(state, offer.toTeamId, offer.get, posture);
  const legality = checkTrade(state, offer);
  if (outgoing <= 0 && incoming <= 0) {
    return { accept: false, margin: 0, incoming, outgoing, legal: legality.ok, illegalReason: legality.reason };
  }

  // Clubs want to win a trade, not break even. The margin is small on purpose:
  // the PROPOSER also has to come out ahead in its own currency, so both tests
  // together already need the two front offices to disagree by a real amount.
  // At 1.08 the window was so narrow that a whole league managed one trade a
  // year.
  const margin = incoming - outgoing * 1.03;
  return {
    accept: margin > 0 && legality.ok,
    margin,
    incoming,
    outgoing,
    legal: legality.ok,
    illegalReason: legality.reason,
  };
}

function tradeableFrom(state: GameState, teamId: number, posture: Posture): Player[] {
  const roster = teamRoster(state, teamId);
  const surplus = (p: Player) => positionCount(state, teamId, p.pos) > POSITION_MIN[p.pos];
  return roster.filter((p) => {
    if (!p.contract || !surplus(p)) return false;
    // A rebuild will sell anyone who will not be here for the next good team —
    // including its best player, which is the only way a blockbuster ever
    // happens. A contender moves spare parts and surplus at stacked positions.
    if (posture === "rebuild") return p.age >= 28 || p.ovr < 72;
    if (posture === "contend") {
      return p.ovr < 72 || positionCount(state, teamId, p.pos) > POSITION_TARGET[p.pos];
    }
    return p.ovr < 76 || (p.age >= 30 && p.ovr < 84);
  });
}

/**
 * How weak a club's weakest STARTER at a position is, in points below
 * replacement level. Zero when the man holding the job is adequate.
 */
function starterDeficit(state: GameState, teamId: number, pos: Position): number {
  const group = teamRoster(state, teamId)
    .filter((p) => p.pos === pos)
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, STARTERS[pos]);
  if (!group.length) return 20;
  const weakest = group[group.length - 1].ovr;
  return Math.max(0, REPLACEMENT_OVR + UPGRADE_APPETITE - weakest);
}

/**
 * How far above replacement a starter has to be before his club stops shopping
 * for his job. Six points, which is about the gap between a man who is merely
 * on the roster and one you would actually plan around.
 */
const UPGRADE_APPETITE = 6;

/** Positions a club would take help at, best-value first. */
const MAX_NEEDS = 5;

/**
 * What a club is shopping for.
 *
 * This used to be purely a headcount: a need existed only where the roster held
 * fewer men at a position than `POSITION_TARGET` wanted. The problem is that
 * `fillRoster` runs every offseason and brings every club up to target at every
 * position, so by the time the trade window opens almost nobody has a hole —
 * and `proposeTrade` walks away because there is nothing anyone wants. That is
 * most of why the league struck a fraction of the deals it should.
 *
 * Real front offices do not trade to fill empty chairs; they trade to upgrade
 * the weakest man who is starting. So a need is now either shape — a genuine
 * headcount shortage, or a starting job held by somebody the club would replace
 * given the chance.
 *
 * Capped at the five most valuable, so a bad club shops where it hurts most
 * rather than declaring itself in the market for everything.
 */
function needsOf(state: GameState, teamId: number): Position[] {
  return (Object.keys(POSITION_TARGET) as Position[])
    .map((pos) => ({
      pos,
      short: positionCount(state, teamId, pos) < POSITION_TARGET[pos],
      deficit: starterDeficit(state, teamId, pos),
    }))
    .filter((x) => x.short || x.deficit > 0)
    // Worst starting job first, weighted by how much the position matters.
    .sort((a, b) => (b.deficit + 1) * POSITION_VALUE[b.pos] - (a.deficit + 1) * POSITION_VALUE[a.pos])
    .slice(0, MAX_NEEDS)
    .map((x) => x.pos);
}

function rationaleFor(posture: Posture, wantsPlayer: boolean): string {
  if (posture === "rebuild") {
    return wantsPlayer
      ? "We like the age profile and we have the room to be patient with him."
      : "We are building through the draft. Picks are worth more to us than this contract.";
  }
  if (posture === "contend") {
    return wantsPlayer
      ? "Our window is open. We would rather have the player than the pick."
      : "We can afford to move future capital for help right now.";
  }
  return "This fits how we want the roster to look next year.";
}

/**
 * Build an offer from `fromTeamId` for a player the club actually wants.
 *
 * Returns null when nothing sensible is available, which is most of the time —
 * trades should be uncommon enough to be news.
 */
export function proposeTrade(
  state: GameState, fromTeamId: number, toTeamId: number, rng: Rng
): TradeOffer | null {
  if (fromTeamId === toTeamId) return null;
  const { posture } = teamOutlook(state, fromTeamId);
  const { posture: theirs } = teamOutlook(state, toTeamId);

  const wants = new Set(needsOf(state, fromTeamId));
  const targets = tradeableFrom(state, toTeamId, theirs)
    .filter((p) => wants.has(p.pos))
    .sort(
      (a, b) =>
        playerTradeValue(state, fromTeamId, b, posture) -
        playerTradeValue(state, fromTeamId, a, posture)
    )
    .slice(0, 5);
  if (targets.length === 0) return null;

  const target = rng.weighted(targets, (_, i) => Math.max(0.1, 1 - i * 0.22));
  // Build the package a shade above what the seller thinks he is worth: the
  // seller then still has to come out ahead on his own books, so aiming at
  // exactly his valuation produced a deal that was rejected almost every time.
  const price = playerTradeValue(state, toTeamId, target, theirs) * 1.18;

  // Assemble a package: picks first, then a spare body if picks fall short.
  const give: TradeAsset[] = [];
  let offered = 0;

  const myPicks = picksOwnedBy(state, fromTeamId)
    .map((pk) => ({ pk, v: pickValue(state, toTeamId, pk) }))
    .sort((a, b) => a.v - b.v); // cheapest first, so we don't overpay wildly

  for (const { pk, v } of myPicks) {
    if (offered >= price) break;
    if (give.length >= 3) break;
    give.push({ kind: "pick", season: pk.season, round: pk.round, originalTeamId: pk.originalTeamId });
    offered += v;
  }

  if (offered < price) {
    // The CHEAPEST body that closes the gap, not the best one available.
    // Sorting the other way made clubs throw an 87 tackle into a deal for a 67
    // quarterback because the tackle was the most valuable thing they were
    // willing to move.
    const spare = tradeableFrom(state, fromTeamId, posture)
      .filter((p) => p.id !== target.id)
      .map((p) => ({ p, v: playerTradeValue(state, toTeamId, p, theirs) }))
      .filter((x) => offered + x.v >= price * 0.85)
      .sort((a, b) => a.v - b.v)[0];
    if (spare && offered + spare.v <= price * 1.45) {
      give.push({ kind: "player", playerId: spare.p.id });
      offered += spare.v;
    }
  }

  if (give.length === 0 || offered < price * 0.85) return null;

  // A 53-man club taking a player and sending only picks goes to 54.
  const except = new Set<number>([
    target.id,
    ...give.filter((a): a is Extract<TradeAsset, { kind: "player" }> => a.kind === "player").map((a) => a.playerId),
  ]);
  if (
    rosterCount(state, fromTeamId) - give.filter((a) => {
      if (a.kind !== "player") return false;
      const p = state.players.find((x) => x.id === a.playerId);
      return !!p && isActiveRoster(p);
    }).length + 1 > ROSTER_LIMIT
    && !state.phase.startsWith("offseason")
  ) {
    const chip = pickDepthChip(state, fromTeamId, rng, except);
    if (!chip) return null;
    give.push({ kind: "player", playerId: chip.id });
  }

  // And the proposing club has to want it too.
  //
  // Without this, `proposeTrade` only ever asked "is this enough for them to
  // say yes" and would happily assemble a package worth far more to itself than
  // what it was getting back. A trade needs BOTH sides to come out ahead in
  // their own currency — that is the whole reason asymmetric valuation exists.
  const myGain =
    packageValue(state, fromTeamId, [{ kind: "player", playerId: target.id }], posture) -
    packageValue(state, fromTeamId, give, posture);
  if (myGain <= 0) return null;

  const offer: TradeOffer = {
    id: state.nextTradeId ?? 1,
    fromTeamId,
    toTeamId,
    give,
    get: [{ kind: "player", playerId: target.id }],
    season: state.season,
    week: state.week,
    rationale: rationaleFor(posture, true),
  };
  return offer;
}

/**
 * Move up or down the board — picks for picks, no player involved.
 *
 * This is the largest single category of real NFL trade and the model did not
 * have it at all. `docs/nfl-reference.md` §1.4: across 2018-2025, 36.6% of
 * trades were pick-for-pick, 32.1% player-for-pick, 27.6% mixed bundles, and
 * only 3.5% player-for-player. `proposeTrade` builds the 32% case and nothing
 * else, which is most of why the league struck 1.4 deals a year against a real
 * 90.
 *
 * Nothing new is needed to price it. `pickValue` is already club-specific — a
 * rebuilder pays up to 1.44x for a pick and a win-now club as little as 0.72x
 * — so two clubs at opposite ends of that range clear a swap the same way they
 * clear a player deal, by disagreeing.
 *
 * The target is drawn weighted toward cheap picks because that is what
 * actually moves: rounds 5-7 are 55% of every pick that changes hands and
 * round 1 is 8% (§1.4). Picking uniformly would trade far too many firsts.
 */
function proposePickSwap(
  state: GameState, fromTeamId: number, toTeamId: number, rng: Rng
): TradeOffer | null {
  const { posture } = teamOutlook(state, fromTeamId);
  const { posture: theirs } = teamOutlook(state, toTeamId);

  const theirPicks = picksOwnedBy(state, toTeamId);
  if (!theirPicks.length) return null;

  // Buy what THEY rate less than we do.
  //
  // Target selection used to weight by round alone, which ignored the only
  // thing that makes a swap possible: whether these two clubs disagree about
  // this particular pick. Measured over 3,000 attempts, 84% died on the
  // proposer's own value test — the builder was shopping for picks its
  // counterparty happened to love.
  //
  // The round term stays because it keeps the mix close to reality (rounds 5-7
  // are 55% of picks that change hands, `docs/nfl-reference.md` §1.4). The gap
  // term is what finds a deal that can actually clear. Weighting by
  // disagreement ALONE produces a round mix within a couple of points of the
  // real one — the distribution genuinely falls out of the mechanism — but at
  // lower volume, so both terms are kept.
  const target = rng.weighted(theirPicks, (pk) => {
    const ours = pickValue(state, fromTeamId, pk);
    const theirs = pickValue(state, toTeamId, pk);
    const gap = theirs > 0.01 ? ours / theirs : 1;
    return Math.pow(pk.round, 1.6) * Math.pow(Math.max(0.2, gap), 3);
  });
  // Just past the 1.03 margin the receiving club demands. Anything more
  // generous and the proposer's own test rejects it; the two tests together
  // leave a narrow band that only opens when the clubs genuinely disagree
  // about early picks against late ones.
  const price = pickValue(state, toTeamId, target) * 1.06;

  // Offer what the other club rates higher than you do. Sorting by the ratio of
  // their price to ours — rather than by our price, or by theirs — is the whole
  // asymmetric-valuation idea applied to picks: a rebuilder hands a win-now
  // club the future seconds it is desperate for and keeps the ones it likes.
  const mine = picksOwnedBy(state, fromTeamId)
    .filter((pk) => !(pk.season === target.season && pk.round === target.round && pk.originalTeamId === target.originalTeamId))
    .map((pk) => ({
      pk,
      v: pickValue(state, toTeamId, pk),
      edge: pickValue(state, toTeamId, pk) / Math.max(0.01, pickValue(state, fromTeamId, pk)),
    }))
    .sort((a, b) => b.edge - a.edge);
  if (!mine.length) return null;

  // Fill toward the price without blowing past it.
  //
  // Taking the highest-edge picks in order, as this did, ignores SIZE — so a
  // club shopping for a seventh-rounder would open by offering a second,
  // because the second happened to be the pick the other club overvalued most.
  // Every one of those deals then failed the proposer's own test on the next
  // line, and it was 84% of all pick-swap attempts: 2,533 of 3,000.
  //
  // So each piece is chosen for edge from among the picks that still FIT what
  // is left to cover. A little overshoot on the last one is allowed and is what
  // really happens — somebody rounds up to close it.
  const give: TradeAsset[] = [];
  const used = new Set<PickOwnership>();
  let offered = 0;
  for (let slot = 0; slot < 3 && offered < price; slot++) {
    const need = price - offered;
    // Room to round up on the last piece — somebody always does, to close it.
    const slack = slot === 2 ? 3 : 1.5;
    const fit = mine.find((m) => !used.has(m.pk) && m.v <= need * slack);
    if (!fit) break;
    used.add(fit.pk);
    give.push({ kind: "pick", season: fit.pk.season, round: fit.pk.round, originalTeamId: fit.pk.originalTeamId });
    offered += fit.v;
  }
  if (!give.length || offered < price) return null;

  const get: TradeAsset[] = [
    { kind: "pick", season: target.season, round: target.round, originalTeamId: target.originalTeamId },
  ];

  // Both clubs price it themselves, and both have to come out ahead. A club
  // that would be paying three real picks for one it does not rate walks.
  if (packageValue(state, fromTeamId, get, posture) <= packageValue(state, fromTeamId, give, posture)) {
    return null;
  }

  return {
    id: state.nextTradeId ?? 1,
    fromTeamId,
    toTeamId,
    give,
    get,
    season: state.season,
    week: state.week,
    rationale: rationaleFor(theirs, false),
  };
}

/**
 * One round of CPU trading.
 *
 * Two shapes, mixed at roughly the real ratio: pick-for-pick is the larger
 * category and also the one that clears most often, since no roster spot,
 * contract or cap hit has to work out for either side.
 */
export function runCpuTrades(state: GameState, rng: Rng, attempts = 120): number {
  if (!tradeWindowOpen(state)) return 0;
  ensurePickInventory(state);

  let done = 0;
  const ids = state.teams.map((t) => t.id).filter((id) => id !== state.userTeamId);

  // Pick-for-pick is a draft-window phenomenon. In 128 in-season trades
  // across 2018-2025, ZERO were pure pick swaps — every one moved a player
  // (docs/nfl-reference.md §1.4b). In-season proposals therefore always
  // start from a player; the offseason keeps the year-round mix.
  const pickSwapShare = state.phase === "regular" ? 0 : 0.55;

  for (let i = 0; i < attempts; i++) {
    const from = rng.pick(ids);
    const to = rng.pick(ids.filter((id) => id !== from));
    const offer = rng.next() < pickSwapShare
      ? proposePickSwap(state, from, to, rng)
      : proposeTrade(state, from, to, rng);
    if (!offer) continue;

    const verdict = evaluateOffer(state, offer);
    if (!verdict.accept) continue;

    state.nextTradeId = (state.nextTradeId ?? 1) + 1;
    if (executeTrade(state, offer).ok) done++;
  }

  // Same builder, more search: weeks 8-9 are 53% of in-season volume
  // (docs/nfl-reference.md §1.3b) and were measuring ~5 against ~9.
  if (state.phase === "regular" && state.week >= TRADE_DEADLINE_WEEK - 1) {
    const extra = state.week === TRADE_DEADLINE_WEEK ? 80 : 35;
    for (let i = 0; i < extra; i++) {
      const from = rng.pick(ids);
      const to = rng.pick(ids.filter((id) => id !== from));
      const offer = proposeTrade(state, from, to, rng);
      if (!offer) continue;
      if (!evaluateOffer(state, offer).accept) continue;
      state.nextTradeId = (state.nextTradeId ?? 1) + 1;
      if (executeTrade(state, offer).ok) done++;
    }
  }
  return done;
}

/**
 * Draft weekend.
 *
 * The single biggest window in the calendar and the model had nothing in it:
 * trades ran once before the draft opened and then stopped, so no club ever
 * moved on the clock. Real drafts see ~35 trades moving ~115 picks with 24-30
 * of 32 clubs involved, and that is 31-48% of all trade activity in the year
 * (`docs/nfl-reference.md` §1.5).
 *
 * Only pick-for-pick here. Draft-weekend player trades exist but they are the
 * minority, and a club reshaping its roster mid-draft is a different decision
 * from moving up the board.
 */
export function runDraftDayTrades(state: GameState, rng: Rng, attempts = 260): number {
  ensurePickInventory(state);
  let done = 0;
  const ids = state.teams.map((t) => t.id).filter((id) => id !== state.userTeamId);
  if (ids.length < 2) return 0;

  for (let i = 0; i < attempts; i++) {
    const from = rng.pick(ids);
    const to = rng.pick(ids.filter((id) => id !== from));
    const offer = proposePickSwap(state, from, to, rng);
    if (!offer) continue;
    if (!evaluateOffer(state, offer).accept) continue;
    state.nextTradeId = (state.nextTradeId ?? 1) + 1;
    if (executeTrade(state, offer).ok) done++;
  }
  return done;
}

/**
 * A man the depth chart does not start. Cutdown chips and roster-balancing
 * bodies come from here — never from an overall sort.
 */
function pickDepthChip(
  state: GameState, teamId: number, rng: Rng, except: Set<number>
): Player | null {
  const team = state.teams[teamId];
  const pool: { p: Player; depth: number }[] = [];
  for (const p of teamRoster(state, teamId)) {
    if (!p.contract || except.has(p.id)) continue;
    if (positionCount(state, teamId, p.pos) <= POSITION_MIN[p.pos]) continue;
    const chart = team.depthChart[p.pos] ?? [];
    const idx = chart.indexOf(p.id);
    if (idx >= 0 && idx < STARTERS[p.pos]) continue;
    pool.push({ p, depth: idx < 0 ? STARTERS[p.pos] + 4 : idx });
  }
  if (!pool.length) return null;
  return rng.weighted(pool, (x) => x.depth).p;
}

function proposeCutdownDump(
  state: GameState, sellerId: number, buyerId: number, rng: Rng
): TradeOffer | null {
  if (sellerId === buyerId) return null;
  const { posture: buyerP } = teamOutlook(state, buyerId);
  const wants = new Set(needsOf(state, buyerId));
  const chips = teamRoster(state, sellerId).filter((p) => {
    if (!p.contract || !wants.has(p.pos)) return false;
    if (positionCount(state, sellerId, p.pos) <= POSITION_MIN[p.pos]) return false;
    const chart = state.teams[sellerId].depthChart[p.pos] ?? [];
    const idx = chart.indexOf(p.id);
    return idx < 0 || idx >= STARTERS[p.pos];
  });
  if (!chips.length) return null;

  const target = rng.weighted(chips, (p) => {
    const chart = state.teams[sellerId].depthChart[p.pos] ?? [];
    const idx = chart.indexOf(p.id);
    return idx < 0 ? 8 : Math.max(0.5, idx);
  });

  // One Day-3 pick. The seller is about to cut this man for nothing
  // (§1.4: 70% of veterans fetch a fifth or worse). Bundling three
  // late picks, as the regular builder does, emptied the pool that
  // in-season deals also spend.
  const buyerVal = playerTradeValue(state, buyerId, target, buyerP);
  const pick = picksOwnedBy(state, buyerId)
    .filter((pk) => pk.round >= 5)
    .map((pk) => ({ pk, cost: pickValue(state, buyerId, pk) }))
    .filter((x) => x.cost > 0 && x.cost < buyerVal)
    .sort((a, b) => a.cost - b.cost)[0];
  if (!pick) return null;

  const give: TradeAsset[] = [
    { kind: "pick", season: pick.pk.season, round: pick.pk.round, originalTeamId: pick.pk.originalTeamId },
  ];
  const get: TradeAsset[] = [{ kind: "player", playerId: target.id }];
  if (packageValue(state, buyerId, get, buyerP) <= packageValue(state, buyerId, give, buyerP)) {
    return null;
  }

  return {
    id: state.nextTradeId ?? 1,
    fromTeamId: buyerId,
    toTeamId: sellerId,
    give,
    get,
    season: state.season,
    week: state.week,
    rationale: rationaleFor(buyerP, true),
  };
}

/**
 * Late-August cutdown. docs/nfl-reference.md §1.2: ~17% of the year, ~16
 * trades. Clubs move depth-chart bubble bodies for a single Day-3 pick
 * rather than cut them for nothing. Hooked from prunePickInventory
 * during offseason-final.
 *
 * The seller does not run evaluateOffer's 1.03 margin: the alternative
 * is a release, so any pick is a win.
 */
export function runCutdownTrades(state: GameState, rng: Rng, attempts = 120): number {
  ensurePickInventory(state);
  let done = 0;
  const ids = state.teams.map((t) => t.id).filter((id) => id !== state.userTeamId);
  if (ids.length < 2) return 0;

  // §1.2: final cutdowns are ~16 trades a year. The one-pick dump
  // clears easily, and uncapped it spent the Day-3 pool in two seasons
  // (23 then 39) and the window went to zero.
  const cap = 16;
  for (let i = 0; i < attempts && done < cap; i++) {
    const seller = rng.pick(ids);
    const buyer = rng.pick(ids.filter((id) => id !== seller));
    const offer = proposeCutdownDump(state, seller, buyer, rng);
    if (!offer) continue;
    if (!checkTrade(state, offer).ok) continue;
    state.nextTradeId = (state.nextTradeId ?? 1) + 1;
    if (executeTrade(state, offer).ok) done++;
  }
  return done;
}

/**
 * Offers put in front of the user.
 *
 * The CPU comes to the user for the same reasons it goes to anyone else — it
 * wants a player at a position of need and it is willing to pay. Kept to at
 * most a couple of live offers so the hub does not become a spam inbox.
 */
export function generateUserOffers(state: GameState, rng: Rng, max = 2): TradeOffer[] {
  pruneStaleTradeInbox(state);
  if (!tradeWindowOpen(state)) return [];
  ensurePickInventory(state);
  if (!state.tradeOffers) state.tradeOffers = [];

  // Drop anything stale before topping up.
  state.tradeOffers = state.tradeOffers.filter(
    (o) => o.season === state.season && checkTrade(state, o).ok
  );

  const ids = state.teams.map((t) => t.id).filter((id) => id !== state.userTeamId);
  let guard = 0;
  while (state.tradeOffers.length < max && guard++ < 24) {
    const from = rng.pick(ids);
    const offer = proposeTrade(state, from, state.userTeamId, rng);
    if (!offer) continue;
    if (state.tradeOffers.some((o) => o.fromTeamId === from)) continue;
    offer.id = state.nextTradeId ?? 1;
    state.nextTradeId = (state.nextTradeId ?? 1) + 1;
    state.tradeOffers.push(offer);
  }
  return state.tradeOffers;
}

export function acceptOffer(state: GameState, offerId: number): TradeCheck {
  const offer = (state.tradeOffers ?? []).find((o) => o.id === offerId);
  if (!offer) return { ok: false, reason: "That offer is no longer on the table." };
  const result = executeTrade(state, offer);
  if (result.ok) {
    state.tradeOffers = (state.tradeOffers ?? []).filter((o) => o.id !== offerId);
  }
  return result;
}

export function rejectOffer(state: GameState, offerId: number): void {
  state.tradeOffers = (state.tradeOffers ?? []).filter((o) => o.id !== offerId);
}

/**
 * The user's own proposal, priced by the club on the other end.
 *
 * `give` is what the USER sends, so from the engine's point of view the user is
 * `fromTeamId` and the counterparty evaluates normally.
 */
export function proposeFromUser(
  state: GameState, toTeamId: number, give: TradeAsset[], get: TradeAsset[]
): { offer: TradeOffer; verdict: { accept: boolean; margin: number }; check: TradeCheck } {
  const offer: TradeOffer = {
    id: state.nextTradeId ?? 1,
    fromTeamId: state.userTeamId,
    toTeamId,
    give,
    get,
    season: state.season,
    week: state.week,
    rationale: "",
  };
  return { offer, verdict: evaluateOffer(state, offer), check: checkTrade(state, offer) };
}
