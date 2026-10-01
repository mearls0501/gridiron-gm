import { REPLACEMENT_OVR } from "../core/frontOffice";
import { playerName } from "../core/ratings";
import { capHit, positionCount, rosterCount, teamCap } from "../core/select";
import { needsOf } from "../core/trades";
import {
  GameState, POSITION_MIN, POSITIONS, Player, Position, WaiverClaim, rosterLimit,
} from "../core/types";
import { userHasClaim, waiverWire } from "../core/waivers";

/**
 * Waiver desk on /roster. Display only.
 *
 * The wire after a settle is a wall of Claim buttons (about 56 early, about
 * 267 the next year). Those bodies stay on `state.waivers`. This module
 * only decides which rows to show first. It does not cut, claim, sort the
 * save, or draw RNG.
 *
 * A row is on the default desk when the GM can act on it: his own waive,
 * a claim he already filed, or someone else's player who fits under the
 * cap and is at least replacement level — a hard position hole counts
 * even below that. Overall orders the scan. A hole jumps the line, and
 * a shopping need breaks an overall tie. The scan is capped so the rest
 * stay one filter away.
 */

/** How many Claim buttons the default desk shows. A scan cap, not a league rule. */
export const WAIVER_DESK_CLAIM_CAP = 12;

export interface WaiverDeskRow {
  entry: WaiverClaim;
  player: Player;
  hit: number;
  affordable: boolean;
  need: boolean;
  own: boolean;
  submitted: boolean;
}

export interface WaiverDesk {
  featured: WaiverDeskRow[];
  hidden: WaiverDeskRow[];
  /** Featured rows that render a Claim button. */
  toClaim: number;
  rosterFull: boolean;
  space: number;
}

function byOvrThenId(a: WaiverDeskRow, b: WaiverDeskRow): number {
  return b.player.ovr - a.player.ovr || a.player.id - b.player.id;
}

function needRankOf(needs: Position[], pos: Position): number {
  const i = needs.indexOf(pos);
  return i === -1 ? needs.length : i;
}

/**
 * Split the live wire into the default scan and the collapsed remainder.
 * `state.waivers` is not reordered or filtered.
 */
export function waiverDesk(state: GameState): WaiverDesk {
  const teamId = state.userTeamId;
  const space = teamCap(state, teamId).space;
  const rosterFull = rosterCount(state, teamId) >= rosterLimit(state.phase);
  const needs = needsOf(state, teamId);
  const minShort = new Set<Position>();
  for (const pos of POSITIONS) {
    if (positionCount(state, teamId, pos) < POSITION_MIN[pos]) minShort.add(pos);
  }

  const rows: WaiverDeskRow[] = waiverWire(state).map(({ entry, player }) => {
    const hit = capHit(player.contract);
    const own = entry.originalTeamId === teamId;
    const hole = minShort.has(player.pos);
    return {
      entry,
      player,
      hit,
      affordable: hit <= space,
      need: !own && (needs.includes(player.pos) || hole),
      own,
      submitted: !own && userHasClaim(entry, teamId),
    };
  });

  const own = rows.filter((r) => r.own).sort(byOvrThenId);
  const submitted = rows.filter((r) => r.submitted).sort(byOvrThenId);
  const rest = rows.filter((r) => !r.own && !r.submitted);

  const candidates: WaiverDeskRow[] = [];
  const hidden: WaiverDeskRow[] = [];
  for (const row of rest) {
    // Roster-full is not a reason to drop the name. The page withholds the
    // Claim button until a slot exists; submitWaiverClaim is what rejects it.
    // A shopping need does not promote a below-replacement body over a
    // better player. A hole under POSITION_MIN does.
    const hole = minShort.has(row.player.pos);
    const fits = row.affordable && (row.player.ovr >= REPLACEMENT_OVR || hole);
    if (fits) candidates.push(row);
    else hidden.push(row);
  }

  candidates.sort((a, b) => {
    const holeA = minShort.has(a.player.pos) ? 1 : 0;
    const holeB = minShort.has(b.player.pos) ? 1 : 0;
    if (holeA !== holeB) return holeB - holeA;
    const ovr = a.player.ovr - b.player.ovr;
    if (ovr !== 0) return -ovr;
    const need = Number(b.need) - Number(a.need);
    if (need !== 0) return need;
    if (a.need && b.need) {
      const rank = needRankOf(needs, a.player.pos) - needRankOf(needs, b.player.pos);
      if (rank !== 0) return rank;
    }
    return a.player.id - b.player.id;
  });

  const featuredClaims = candidates.slice(0, WAIVER_DESK_CLAIM_CAP);
  hidden.push(...candidates.slice(WAIVER_DESK_CLAIM_CAP));
  hidden.sort((a, b) => Number(b.affordable) - Number(a.affordable) || byOvrThenId(a, b));

  return {
    featured: [...submitted, ...featuredClaims, ...own],
    hidden,
    toClaim: featuredClaims.length,
    rosterFull,
    space,
  };
}

export function waiverDeskMatches(row: WaiverDeskRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return playerName(row.player).toLowerCase().includes(q) || row.player.pos.toLowerCase().includes(q);
}

/** Rows on screen. A search looks through the whole wire, including the collapsed set. */
export function visibleWaiverRows(desk: WaiverDesk, query: string, showHidden: boolean): WaiverDeskRow[] {
  const q = query.trim();
  const pool = q || showHidden ? [...desk.featured, ...desk.hidden] : desk.featured;
  if (!q) return pool;
  return pool.filter((row) => waiverDeskMatches(row, q));
}

export function waiverDeskHiddenCopy(desk: WaiverDesk): string | null {
  const n = desk.hidden.length;
  if (n === 0) return null;
  const names = n === 1 ? "1 player is" : `${n} players are`;
  const over = desk.hidden.filter((r) => !r.affordable).length;
  const why = over === n
    ? "because the cap hit does not fit"
    : over === 0
      ? "below this scan"
      : "over the cap, or below this scan";
  const slot = desk.rosterFull ? " Release someone before a claim can land." : "";
  return `${names} still on the wire, ${why}.${slot} Nobody was removed from the pool. They stay claimable.`;
}
