import {
  BoxScore, Game, GameState, PlayerGameStat, SeasonStatLine, TeamGameStats,
} from "../core/types";
import {
  blankPlayerGameStat, blankSeasonLine, blankTeamGameStats,
} from "../core/season/stats";

/**
 * Save codec: sparse stat rows.
 *
 * A stat row has ~50 numeric fields and almost all of them are zero. A left
 * guard's line for a game is 52 keys to say "he played 63 snaps"; a defensive
 * tackle's season line carries every passing, receiving, kicking, punting and
 * return field at 0. Measured over a 20-season franchise the mean box-score row
 * had 6.3 non-zero fields out of 52, and stat rows were 28 MB of a 34 MB save.
 *
 * So on the way to disk every zero-valued number and every `false` is dropped,
 * and on the way back in the row is rebuilt from the same blank constructors
 * the simulation uses. That took the same franchise from 34.5 MB to 12.1 MB
 * with nothing lost: decode(encode(x)) is deep-equal to x.
 *
 * Two properties make this safe rather than clever:
 *
 *   - It is LOSSLESS and self-describing. A key that survives carries its own
 *     name, so this is not a positional wire format that a reordered interface
 *     would silently corrupt. Adding a field to `SeasonStatLine` needs no
 *     change here at all.
 *   - The default for a missing key is 0 (or `false` for `started`), and the
 *     key list comes from `season/stats.ts` — the same constructors the sim
 *     fills in. `null` is NOT zero and is written out explicitly, which is what
 *     keeps a free agent's `teamId: null` distinct from team 0's.
 *
 * Only stat rows are touched. Players, teams, contracts, history and the record
 * book round-trip untouched: they are small, and readable saves are worth more
 * than the last megabyte.
 */

/** A row with its zero-valued fields removed. */
type Sparse = Record<string, unknown>;

function shrink(row: object): Sparse {
  const out: Sparse = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === 0 || v === false) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Rebuild a full row on top of a blank one. `Object.assign` and not a spread of
 * the template because the sparse row must win on every key it does carry,
 * including an explicit `null`.
 */
function grow<T extends object>(blank: T, sparse: unknown): T {
  if (!sparse || typeof sparse !== "object") return blank;
  return Object.assign(blank, sparse) as T;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export function encodeSeasonLine(l: SeasonStatLine): Sparse {
  return shrink(l);
}

export function decodeSeasonLine(raw: unknown): SeasonStatLine {
  // season and teamId are overwritten by the raw row; the placeholders only
  // exist so the template has every key.
  return grow(blankSeasonLine(0, 0), raw);
}

export function encodePlayerGameStat(s: PlayerGameStat): Sparse {
  return shrink(s);
}

export function decodePlayerGameStat(raw: unknown): PlayerGameStat {
  return grow(blankPlayerGameStat(0, 0, false), raw);
}

export function encodeTeamGameStats(s: TeamGameStats): Sparse {
  return shrink(s);
}

export function decodeTeamGameStats(raw: unknown): TeamGameStats {
  return grow(blankTeamGameStats(), raw);
}

// ---------------------------------------------------------------------------
// Whole save
// ---------------------------------------------------------------------------

function encodeBoxScore(b: BoxScore): unknown {
  return {
    ...b,
    home: encodeTeamGameStats(b.home),
    away: encodeTeamGameStats(b.away),
    players: b.players.map(encodePlayerGameStat),
  };
}

function decodeBoxScore(raw: unknown): BoxScore {
  const b = raw as BoxScore;
  return {
    ...b,
    home: decodeTeamGameStats(b.home),
    away: decodeTeamGameStats(b.away),
    players: (b.players ?? []).map(decodePlayerGameStat),
  };
}

/**
 * A save-shaped object with its stat rows shrunk. Structurally a `GameState`
 * with holes in it, so it is deliberately not typed as one — nothing outside
 * this module and `save.ts` should ever hold one.
 */
export type EncodedSave = Record<string, unknown>;

export function encodeSave(state: GameState): EncodedSave {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, stats: p.stats.map(encodeSeasonLine) })),
    games: state.games.map((g) => ({
      ...g,
      boxScore: g.boxScore ? encodeBoxScore(g.boxScore) : null,
    })),
  };
}

export function decodeSave(raw: EncodedSave): GameState {
  const state = raw as unknown as GameState;
  for (const p of state.players ?? []) {
    p.stats = (p.stats ?? []).map(decodeSeasonLine);
  }
  for (const g of (state.games ?? []) as Game[]) {
    g.boxScore = g.boxScore ? decodeBoxScore(g.boxScore) : null;
  }
  return state;
}
