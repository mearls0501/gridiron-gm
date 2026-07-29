import { GameState, LogEntry } from "./types";

/**
 * Save housekeeping.
 *
 * Run once per year at the rollover, on the things that grow without bound and
 * that nothing will ever read again. The stat rows are NOT here: they are kept
 * forever on purpose — the record book derives season, career and franchise
 * marks from them at display time — and the size problem there is solved by
 * `lib/store/codec.ts` instead, losslessly.
 *
 * The log is different. It is 22,000 entries by season 20 and the only thing
 * that reads it is a 40-line news feed on the home and league pages. Every
 * signing, cut, injury and draft pick from fourteen years ago is dead weight.
 */

/** Seasons of full log detail kept behind the current one. */
export const LOG_DETAIL_SEASONS = 2;

/**
 * Kinds worth keeping forever. A milestone is a record falling, a title, a
 * retirement — the franchise's actual story, and cheap: a few dozen a year.
 */
const PERMANENT_KINDS: ReadonlySet<LogEntry["kind"]> = new Set(["milestone"]);

/**
 * Hard ceiling on retained entries, as a backstop for a franchise that
 * generates far more traffic per season than the ones we measured. Oldest go
 * first, and never a permanent entry.
 */
export const LOG_MAX_ENTRIES = 4000;

/**
 * Trim the log to the recent past plus the permanent record.
 *
 * Called from `finalizeOffseason`, so `state.season` has already rolled to the
 * new year — entries at or after `season - LOG_DETAIL_SEASONS` are the current
 * year and the two behind it.
 */
export function trimLog(state: GameState): void {
  const cutoff = state.season - LOG_DETAIL_SEASONS;
  let kept = state.log.filter((e) => e.season >= cutoff || PERMANENT_KINDS.has(e.kind));

  if (kept.length > LOG_MAX_ENTRIES) {
    const permanent: LogEntry[] = [];
    const recent: LogEntry[] = [];
    for (const e of kept) (PERMANENT_KINDS.has(e.kind) ? permanent : recent).push(e);
    // Drop the oldest non-permanent entries until we are under the ceiling.
    const room = Math.max(0, LOG_MAX_ENTRIES - permanent.length);
    const trimmed = new Set(recent.slice(0, Math.max(0, recent.length - room)));
    kept = kept.filter((e) => !trimmed.has(e));
  }

  state.log = kept;
}

/**
 * Drop players who retired without ever playing a down.
 *
 * Retired players are kept on purpose — the record book derives season, career
 * and franchise marks from their own stat lines, so pruning them would quietly
 * rewrite history. But a man who never took a snap has no stat lines, holds no
 * record, won no award and appears on no past roster. He is pure weight.
 *
 * This matters because the draft class is deliberately about twice the number
 * of picks, so roughly 230 undrafted players enter the pool every year and most
 * never catch on. Without this the save grew +0.49 MB a season against a +0.40
 * guard, entirely on men who were never in the league.
 */
export function pruneNeverPlayed(state: GameState): void {
  state.players = state.players.filter(
    (p) => !p.retired || p.stats.length > 0 || p.careerAwards.length > 0
  );
}

/** Everything the yearly rollover does to keep a save from growing forever. */
export function runHousekeeping(state: GameState): void {
  trimLog(state);
  pruneNeverPlayed(state);
}
