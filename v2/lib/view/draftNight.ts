/**
 * Draft-night ticker and the move-up alert. Display only.
 *
 * Pace is a wait between picks in the store. Nothing here reads a clock,
 * and nothing here decides who is drafted. Reach and slide are slot counts
 * against consensus, not a rating.
 */

import { playerName } from "../core/ratings";
import { boardGrade, consensusGrade, gradeContext } from "../core/scouting-reports";
import { boardNote } from "../core/scouting";
import { isUserOnClock, userPicks } from "../core/offseason/draft";
import { GameState, Player, TradeAsset } from "../core/types";
import { tradeBoardAssetLabel } from "./tradeBoard";

export type DraftPace = "instant" | "fast" | "broadcast";

export const DRAFT_PACE_OPTIONS: { value: DraftPace; label: string }[] = [
  { value: "instant", label: "Instant" },
  { value: "fast", label: "Fast" },
  { value: "broadcast", label: "Broadcast" },
];

/** How long the room holds a pick before the next one. Instant does not wait. */
export const DRAFT_PACE_MS: Record<DraftPace, number> = {
  instant: 0,
  fast: 90,
  broadcast: 640,
};

export interface DraftSnap {
  onClock: number;
  clockTrades: number;
  slotTeamId: number | null;
  slotPick: number | null;
  owners: { season: number; round: number; originalTeamId: number; teamId: number }[];
}

export interface TickerPick {
  kind: "pick";
  pick: number;
  round: number;
  club: string;
  player: string;
  playerId: number | null;
  pos: string;
  school: string;
  board: string;
  consensus: string;
  boardSlot: number | null;
  consensusSlot: number | null;
  reachSlide: string;
  forfeited: boolean;
}

export interface TickerTrade {
  kind: "trade";
  pick: number;
  club: string;
  text: string;
  sent: string[];
}

export type DraftTapeItem = TickerPick | TickerTrade;

export interface MoveUpAlert {
  season: number;
  playerId: number;
  name: string;
  pos: string;
  school: string;
  board: string;
  consensus: string;
  consensusSlot: number;
  onPick: number;
  userPick: number;
}

export function moveUpAlertKey(season: number, playerId: number): string {
  return `${season}:${playerId}`;
}

/** Taken earlier than the public slot, or still on the board later. */
export function reachSlideLabel(pick: number, consensusSlot: number): string {
  if (pick < consensusSlot) return `reach ${consensusSlot - pick}`;
  if (pick > consensusSlot) return `slide ${pick - consensusSlot}`;
  return "slot";
}

/**
 * The public board says he is gone before the user's next pick, and the
 * clock has reached that public slot. Consensus and the pick numbers only.
 */
export function prospectWillNotLast(
  consensusSlot: number,
  currentPick: number,
  userNextPick: number,
): boolean {
  return consensusSlot < userNextPick && currentPick >= consensusSlot;
}

export function snapDraft(state: GameState): DraftSnap {
  const d = state.draft;
  const slot = d && !d.complete ? d.picks[d.onClock] : undefined;
  return {
    onClock: d?.onClock ?? 0,
    clockTrades: d?.clockTrades ?? 0,
    slotTeamId: slot?.teamId ?? null,
    slotPick: slot?.pick ?? null,
    owners: (state.pickOwners ?? []).map((o) => ({
      season: o.season,
      round: o.round,
      originalTeamId: o.originalTeamId,
      teamId: o.teamId,
    })),
  };
}

function classPool(state: GameState, season: number, extra?: Player): Player[] {
  const pool = state.players.filter((q) => !q.retired && q.draftClassSeason === season);
  if (extra && !pool.some((q) => q.id === extra.id)) pool.push(extra);
  return pool;
}

function slotsFor(state: GameState, p: Player): { board: number; consensus: number } {
  const season = p.draftClassSeason ?? state.season;
  const ctx = gradeContext(state, classPool(state, season, p));
  return {
    board: boardGrade(state, p, ctx).slot,
    consensus: consensusGrade(state, p, ctx).slot,
  };
}

export function tickerPick(state: GameState, pickRound: number, pickNo: number, teamId: number, playerId: number | null): TickerPick {
  const club = state.teams[teamId]?.abbr ?? "—";
  if (playerId === null) {
    return {
      kind: "pick",
      pick: pickNo,
      round: pickRound,
      club,
      player: "Pick forfeited",
      playerId: null,
      pos: "—",
      school: "—",
      board: "—",
      consensus: "—",
      boardSlot: null,
      consensusSlot: null,
      reachSlide: "—",
      forfeited: true,
    };
  }
  const p = state.players.find((x) => x.id === playerId);
  if (!p) {
    return tickerPick(state, pickRound, pickNo, teamId, null);
  }
  const slots = slotsFor(state, p);
  return {
    kind: "pick",
    pick: pickNo,
    round: pickRound,
    club,
    player: playerName(p),
    playerId: p.id,
    pos: p.pos,
    school: p.profile?.college ?? "—",
    board: `#${slots.board}`,
    consensus: `#${slots.consensus}`,
    boardSlot: slots.board,
    consensusSlot: slots.consensus,
    reachSlide: reachSlideLabel(pickNo, slots.consensus),
    forfeited: false,
  };
}

export function tickerPickText(row: TickerPick): string {
  return [row.club, row.player, row.pos, row.school, row.board, row.consensus, row.reachSlide].join(" · ");
}

/** Assets the buyer sent, labeled the way the trade desk labels them. */
export function clockTradeFromSnap(state: GameState, before: DraftSnap): TickerTrade | null {
  const d = state.draft;
  if (!d || (d.clockTrades ?? 0) <= before.clockTrades) return null;
  const slot = d.picks[before.onClock];
  const buyerId = slot?.teamId;
  const sellerId = before.slotTeamId;
  if (buyerId == null || sellerId == null || buyerId === sellerId) return null;

  const beforeTeam = new Map(
    before.owners.map((o) => [`${o.season}:${o.round}:${o.originalTeamId}`, o.teamId]),
  );
  const sent: string[] = [];
  for (const o of state.pickOwners ?? []) {
    const key = `${o.season}:${o.round}:${o.originalTeamId}`;
    const prev = beforeTeam.get(key);
    if (prev == null || prev !== buyerId || o.teamId !== sellerId) continue;
    const asset: TradeAsset = {
      kind: "pick",
      season: o.season,
      round: o.round,
      originalTeamId: o.originalTeamId,
    };
    sent.push(tradeBoardAssetLabel(state, asset));
  }

  const club = state.teams[buyerId]?.abbr ?? "—";
  const pickNo = before.slotPick ?? slot?.pick ?? 0;
  const text = sent.length
    ? `${club} move up to #${pickNo} — send ${sent.join(", ")}`
    : `${club} move up to #${pickNo}`;
  return { kind: "trade", pick: pickNo, club, text, sent };
}

export function draftStepEvents(state: GameState, before: DraftSnap): DraftTapeItem[] {
  const d = state.draft;
  if (!d) return [];
  const events: DraftTapeItem[] = [];
  const trade = clockTradeFromSnap(state, before);
  if (trade) events.push(trade);
  if (d.onClock > before.onClock || (d.complete && before.slotPick != null)) {
    const made = d.picks[before.onClock];
    if (made) events.push(tickerPick(state, made.round, made.pick, made.teamId, made.playerId));
  }
  return events;
}

export function tapeLabel(item: DraftTapeItem): string {
  if (item.kind === "trade") return item.text;
  if (item.forfeited) return `${item.club} forfeit pick #${item.pick}`;
  return `${item.club} select ${item.player}, ${item.pos}`;
}

/**
 * One starred or tier-1 name the public board says will not last until the
 * user's next pick. The user's mark is the star or the tier. The "will not
 * last" test is consensus against the clock. CPU boards are not read.
 */
export function moveUpAlert(state: GameState, skip: ReadonlySet<string>): MoveUpAlert | null {
  const d = state.draft;
  if (!d || d.complete || isUserOnClock(state)) return null;
  const on = d.picks[d.onClock];
  if (!on || on.playerId !== null) return null;
  const next = userPicks(state).find((p) => p.playerId === null);
  if (!next || next.pick <= on.pick) return null;

  const season = d.season;
  const available = state.players.filter(
    (p) => p.prospect && !p.retired && p.teamId === null && p.draftClassSeason === season,
  );
  const ctx = gradeContext(state, classPool(state, season));
  const hits: MoveUpAlert[] = [];
  for (const p of available) {
    const note = boardNote(state, p.id);
    if (note.tier !== 1 && !note.watch) continue;
    const key = moveUpAlertKey(season, p.id);
    if (skip.has(key)) continue;
    const consensusSlot = consensusGrade(state, p, ctx).slot;
    if (!prospectWillNotLast(consensusSlot, on.pick, next.pick)) continue;
    const boardSlot = boardGrade(state, p, ctx).slot;
    hits.push({
      season,
      playerId: p.id,
      name: playerName(p),
      pos: p.pos,
      school: p.profile?.college ?? "—",
      board: `#${boardSlot}`,
      consensus: `#${consensusSlot}`,
      consensusSlot,
      onPick: on.pick,
      userPick: next.pick,
    });
  }
  hits.sort((a, b) => a.consensusSlot - b.consensusSlot || a.playerId - b.playerId);
  return hits[0] ?? null;
}
