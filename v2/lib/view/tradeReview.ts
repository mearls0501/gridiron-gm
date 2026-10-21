import { playerName } from "../core/ratings";
import {
  arrivingCapHit, capHit, deadMoney, departingPaidOut, formatMoney, isActiveRoster,
  remainingBonusProration, rosterCount, teamCap,
} from "../core/select";
import { checkTrade, TradeCheck } from "../core/trades";
import { GameState, ROSTER_LIMIT, TradeAsset, TradeOffer } from "../core/types";
import { draftPickDeskLabel, tradeBoardOvr } from "./tradeBoard";

/**
 * /trades review before a trade commits: an incoming offer's Accept and the
 * user's own Propose. Display only.
 *
 * The offer card prints `Name (POS, OVR)` and nothing else, and the offer
 * stores no injury or cap snapshot, so Accept used to commit blind. This
 * reads the live save every time it is built: an injury, IR move or cap
 * change after the call shows up here.
 *
 * Cap is what `executeTrade` posts, which `checkTrade` now prices the same
 * way: a departing contract's uncharged bonus accelerates onto the sender;
 * the arriving player counts his base salary, and his guarantee comes with
 * him. `check` is the engine's verdict and decides whether Confirm is live.
 */

export interface ReviewPlayer {
  kind: "player";
  playerId: number;
  name: string;
  pos: string;
  age: number;
  ovr: number | string;
  /** "Out 6 wks · Torn hamstring", or null when healthy. */
  injury: string | null;
  ir: boolean;
  /** This season's charge on the club that holds him after the trade. */
  capAfter: number;
  /** Charge on his current club today. */
  capNow: number;
  yearsLeft: number;
  /** Bonus that accelerates onto the sender when he leaves. */
  deadOnSender: number;
  /** Base already paid this season by the club he leaves; it stays on its books. */
  paidOnSender: number;
  /** Remaining guaranteed base; it travels with the contract. */
  guaranteed: number;
}

export interface ReviewPick {
  kind: "pick";
  label: string;
}

export type ReviewLine = ReviewPlayer | ReviewPick | { kind: "missing"; label: string };

export interface OfferReview {
  offerId: number;
  /** The club on the other end, whichever side made the offer. */
  partnerTeamId: number;
  /** What the user receives. */
  incoming: ReviewLine[];
  /** What the user sends. */
  outgoing: ReviewLine[];
  cap: {
    spaceBefore: number;
    /** Positive = room used. */
    change: number;
    spaceAfter: number;
    deadAdded: number;
  };
  roster: { before: number; after: number; limit: number };
  warnings: string[];
  check: TradeCheck;
}

function injuryLine(weeks: number, desc: string | null): string | null {
  if (weeks <= 0) return null;
  const w = `Out ${weeks} wk${weeks === 1 ? "" : "s"}`;
  return desc ? `${w} · ${desc}` : w;
}

function line(state: GameState, a: TradeAsset): ReviewLine {
  if (a.kind === "pick") return { kind: "pick", label: draftPickDeskLabel(state, a) };
  const p = state.players.find((x) => x.id === a.playerId);
  if (!p) return { kind: "missing", label: "A player who is no longer in the league" };
  const c = p.contract;
  return {
    kind: "player",
    playerId: p.id,
    name: playerName(p),
    pos: p.pos,
    age: p.age,
    ovr: tradeBoardOvr(state, p),
    injury: injuryLine(p.injuryWeeks, p.injuryDesc),
    ir: p.status === "ir",
    capAfter: arrivingCapHit(state, c),
    capNow: capHit(c),
    yearsLeft: c?.yearsRemaining ?? 0,
    deadOnSender: Math.round(remainingBonusProration(c)),
    paidOnSender: departingPaidOut(state, c),
    guaranteed: Math.max(0, deadMoney(c) - Math.round(remainingBonusProration(c))),
  };
}

function activeCount(state: GameState, assets: TradeAsset[]): number {
  let n = 0;
  for (const a of assets) {
    if (a.kind !== "player") continue;
    const p = state.players.find((x) => x.id === a.playerId);
    if (p && isActiveRoster(p)) n++;
  }
  return n;
}

/**
 * Works for an incoming call (user is `toTeamId`) and for the user's own
 * proposal (user is `fromTeamId`); the lines are always from the user's side.
 */
export function buildOfferReview(state: GameState, offer: TradeOffer): OfferReview {
  const userId = state.userTeamId;
  const userProposes = offer.fromTeamId === userId;
  const gets = userProposes ? offer.get : offer.give;
  const sends = userProposes ? offer.give : offer.get;
  const incoming = gets.map((a) => line(state, a));
  const outgoing = sends.map((a) => line(state, a));

  let change = 0;
  let deadAdded = 0;
  for (const l of outgoing) {
    if (l.kind !== "player") continue;
    change += l.deadOnSender + l.paidOnSender - l.capNow;
    deadAdded += l.deadOnSender;
  }
  for (const l of incoming) {
    if (l.kind === "player") change += l.capAfter;
  }
  const spaceBefore = teamCap(state, userId).space;

  const before = rosterCount(state, userId);
  const after = before - activeCount(state, sends) + activeCount(state, gets);

  const warnings: string[] = [];
  for (const l of incoming) {
    if (l.kind !== "player") continue;
    if (l.ir) warnings.push(`${l.name} is on injured reserve.`);
    else if (l.injury) warnings.push(`${l.name} is hurt — ${l.injury}.`);
  }
  const guaranteedIn = incoming.reduce((n, l) => n + (l.kind === "player" ? l.guaranteed : 0), 0);
  if (guaranteedIn > 0) {
    warnings.push(`You take on ${formatMoney(guaranteedIn)} of guaranteed salary. Cutting him later still costs it.`);
  }
  if (deadAdded > 0) {
    warnings.push(`You keep ${formatMoney(deadAdded)} of dead money from the bonus on contracts you send.`);
  }
  if (after > ROSTER_LIMIT && state.phase.startsWith("offseason")) {
    warnings.push(`You would carry ${after} players. Cutdown brings that back to ${ROSTER_LIMIT}.`);
  }

  return {
    offerId: offer.id,
    partnerTeamId: userProposes ? offer.toTeamId : offer.fromTeamId,
    incoming,
    outgoing,
    cap: { spaceBefore, change, spaceAfter: spaceBefore - change, deadAdded },
    roster: { before, after, limit: ROSTER_LIMIT },
    warnings,
    check: checkTrade(state, offer),
  };
}
