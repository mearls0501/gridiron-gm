/**
 * Regression: camp-90 / waiver flood must not erase Trade: rows.
 *
 * Wave 3.6 autopsy (#76): finalizeOffseason increments season, then
 * trimLog's 4000 ceiling dropped the oldest non-milestone transactions.
 * Later waiver / camp rows sit after the year's trades, so drift counted
 * trades=0 while executeTrade still returned ok.
 *
 * Run: npx tsx lib/core/housekeeping.test.ts
 */
import assert from "node:assert/strict";
import { LOG_DETAIL_SEASONS, LOG_MAX_ENTRIES, trimLog } from "./housekeeping";
import { newGame } from "./newGame";
import { executeTrade, rolloverTradeCounter } from "./trades";
import { GameState, LogEntry, TradeOffer } from "./types";

function entry(season: number, text: string, kind: LogEntry["kind"] = "transaction"): LogEntry {
  return { season, week: 0, kind, text };
}

function stub(season: number, log: LogEntry[]): GameState {
  return { season, log } as GameState;
}

{
  // Autopsy branch: season just rolled; log rows still carry the finished year.
  // Trades first, then a flood of newer waiver / camp transactions.
  const finished = 2031;
  const trades = Array.from({ length: 24 }, (_, i) =>
    entry(finished, `Trade: NE receive pick ${i} from KC for a player`),
  );
  const flood = Array.from({ length: LOG_MAX_ENTRIES + 200 }, (_, i) =>
    entry(finished, `Waived player ${i}`),
  );
  const st = stub(finished + 1, [...trades, ...flood]);
  trimLog(st);

  const keptTrades = st.log.filter((e) => e.text.startsWith("Trade:"));
  assert.equal(
    keptTrades.length,
    trades.length,
    "current-year Trade: rows survive a flooded 4000 ceiling",
  );
  assert.ok(st.log.length <= LOG_MAX_ENTRIES);
  assert.ok(st.log.some((e) => e.text.startsWith("Waived")), "recent non-trade traffic still has room");
}

{
  const current = 2035;
  const st = stub(current, [
    entry(2026, "Trade: BUF receive a pick from MIA for a player"),
    entry(2026, "Signed a street FA"),
    entry(2026, "Retired after 12 seasons", "milestone"),
    entry(current - 1, "Signed a backup"),
  ]);
  trimLog(st);

  assert.ok(current - 2026 > LOG_DETAIL_SEASONS, "2026 is outside the detail window");
  assert.ok(st.log.some((e) => e.text.startsWith("Trade:")), "old Trade: rows stay as franchise history");
  assert.ok(st.log.some((e) => e.kind === "milestone"), "milestones stay");
  assert.ok(!st.log.some((e) => e.text === "Signed a street FA"), "old ordinary transactions drop");
  assert.ok(st.log.some((e) => e.text === "Signed a backup"), "recent ordinary transactions stay");
}

console.log("ok    housekeeping — Trade: rows survive trimLog under a flood");

{
  const st = newGame({ seed: 12345 });
  assert.equal(st.seasonCounters?.tradesExecuted ?? 0, 0, "new game starts at 0");
  const from = st.userTeamId;
  const to = from === 0 ? 1 : 0;
  const offer: TradeOffer = {
    id: 1,
    fromTeamId: from,
    toTeamId: to,
    give: [{ kind: "pick", season: st.season + 1, round: 6, originalTeamId: from }],
    get: [{ kind: "pick", season: st.season + 1, round: 6, originalTeamId: to }],
    season: st.season,
    week: 0,
    rationale: "counter test",
  };
  const res = executeTrade(st, offer);
  assert.equal(res.ok, true, res.reason ?? "pick swap should execute");
  assert.equal(st.seasonCounters?.tradesExecuted, 1, "counter increments on executeTrade");
  assert.ok(st.log.some((e) => e.text.startsWith("Trade:")), "Trade: row still written");

  rolloverTradeCounter(st);
  assert.equal(st.seasonCounters?.tradesExecuted, 0, "rollover resets the live counter");
  assert.equal(st.seasonCounters?.tradesExecutedLast, 1, "closed year is readable after rollover");
}

console.log("ok    housekeeping — tradesExecuted increments and resets at rollover");
