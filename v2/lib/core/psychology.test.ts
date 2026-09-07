/**
 * Player psychology: contract-year flags, holdouts, trade requests.
 * Child stream only. Frequency is measured here so it cannot float.
 *
 * Run: npx tsx lib/core/psychology.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { decodeSave, encodeSave } from "../store/codec";
import { buildBriefing } from "./season/briefing";
import {
  HOLDOUT_CAP,
  TRADE_CAP,
  contractApy,
  isContractYear,
  plantDemand,
  psychologyCensus,
  psychologyView,
  resolveDemand,
  runPsychology,
} from "./psychology";
import { GameState, Player } from "./types";

function ok(label: string) { console.log("ok   ", label); }

function stripPsych(st: GameState): GameState {
  const raw = JSON.parse(JSON.stringify(st)) as GameState;
  delete raw.psychTick;
  for (const p of raw.players) delete p.psychology;
  return raw;
}

{
  const st = newGame({ seed: 41 });
  const before = st.rngState;
  assert.equal(st.psychTick === undefined, true, "newGame does not evaluate psychology");
  runPsychology(st);
  assert.equal(st.rngState, before, "psychology child stream must not move the parent");
  const tick = st.psychTick;
  assert.ok(tick, "tick is written");
  const again = st.rngState;
  runPsychology(st);
  assert.equal(st.rngState, again);
  assert.equal(tick.week, st.week);
  ok("runPsychology is child-stream; parent still; same week is a no-op");
}

{
  const a = newGame({ seed: 42 });
  const b = newGame({ seed: 42 });
  runPsychology(a);
  runPsychology(b);
  const ids = (st: GameState, kind: "holdout" | "tradeRequest") =>
    st.players.filter((p) => p.psychology?.[kind]).map((p) => p.id).sort((x, y) => x - y);
  assert.deepEqual(ids(a, "holdout"), ids(b, "holdout"));
  assert.deepEqual(ids(a, "tradeRequest"), ids(b, "tradeRequest"));
  const c = newGame({ seed: 43 });
  runPsychology(c);
  assert.ok(c.psychTick, "other seed also ticks");
  ok("same seed same filings; child stream is keyed");
}

{
  const st = stripPsych(newGame({ seed: 17 }));
  assert.equal(st.psychTick === undefined, true);
  const before = st.rngState;
  runPsychology(st);
  assert.equal(st.rngState, before);
  const round = decodeSave(encodeSave(st));
  assert.equal(round.psychTick && round.psychTick.season, st.psychTick && st.psychTick.season);
  const filed = st.players.find((p) => p.psychology?.holdout || p.psychology?.tradeRequest);
  if (filed) {
    const back = round.players.find((p) => p.id === filed.id)!;
    assert.equal(!!back.psychology?.holdout, !!filed.psychology?.holdout);
    assert.equal(!!back.psychology?.tradeRequest, !!filed.psychology?.tradeRequest);
  }
  ok("old save without psychology loads; codec keeps the flags");
}

{
  const st = newGame({ seed: 19 });
  const user = st.players.find((p) => p.teamId === st.userTeamId && !p.prospect && p.ovr >= 70)!;
  assert.ok(user);
  plantDemand(st, user.id, "holdout", "money");
  plantDemand(st, user.id, "holdout", "money"); // last write wins
  const b = buildBriefing(st);
  const hold = b.actionItems.find((a) => /holdout/i.test(a.label));
  assert.ok(hold, "briefing surfaces a planted holdout");
  assert.equal(hold!.href, "/finances");
  assert.equal(hold!.urgent, true);
  assert.ok(hold!.detail.includes(user.lastName) || hold!.label.includes("holdout"));

  const other = st.players.find((p) => p.teamId === st.userTeamId && p.id !== user.id && !p.prospect)!;
  plantDemand(st, other.id, "tradeRequest", "role");
  const b2 = buildBriefing(st);
  const trade = b2.actionItems.find((a) => /trade request/i.test(a.label));
  assert.ok(trade, "briefing surfaces a planted trade request");
  assert.equal(trade!.href, "/trades");
  assert.ok(b2.reviewItems.some((r) => /contract-year/i.test(r)), "contract-year players are on the desk");
  ok("briefing shows planted holdout + trade request; contract-year is review");
}

{
  const st = newGame({ seed: 21 });
  const p = st.players.find((x) => x.teamId === st.userTeamId && x.contract && !x.prospect)!;
  plantDemand(st, p.id, "tradeRequest", "role");
  assert.equal(resolveDemand(st, p.id), true);
  assert.equal(!!p.psychology?.tradeRequest, false);
  const view = psychologyView(st, st.userTeamId);
  assert.equal(view.tradeRequests.length, 0);
  ok("resolveDemand clears a request without touching contracts");
}

{
  const seeds = [11, 22, 33, 44, 55, 66, 77, 88];
  const rows: { holdouts: number; tradeRequests: number; contractYear: number }[] = [];
  for (const seed of seeds) {
    const st = newGame({ seed });
    const before = st.rngState;
    runPsychology(st);
    assert.equal(st.rngState, before, `parent moved on seed ${seed}`);
    const c = psychologyCensus(st);
    assert.ok(c.holdouts <= HOLDOUT_CAP + 1, `holdouts ${c.holdouts} over cap+plant`);
    assert.ok(c.tradeRequests <= TRADE_CAP + 1, `trades ${c.tradeRequests} over cap+plant`);
    rows.push(c);
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const holdMean = mean(rows.map((r) => r.holdouts));
  const tradeMean = mean(rows.map((r) => r.tradeRequests));
  const cyMean = mean(rows.map((r) => r.contractYear));
  console.log(`##M psychology.holdoutsMean ${holdMean.toFixed(2)}`);
  console.log(`##M psychology.tradeRequestsMean ${tradeMean.toFixed(2)}`);
  console.log(`##M psychology.contractYearMean ${cyMean.toFixed(2)}`);
  assert.ok(holdMean >= 1 && holdMean <= 14, `holdout mean ${holdMean} outside 1–14`);
  assert.ok(tradeMean >= 0 && tradeMean <= 16, `trade-request mean ${tradeMean} outside 0–16`);
  assert.ok(cyMean >= 200 && cyMean <= 900, `contract-year mean ${cyMean} is not a league`);
  const any = rows.some((r) => r.holdouts + r.tradeRequests > 0);
  assert.ok(any, "at least one seed filed a demand");
  ok(`frequency harness: holdouts ${holdMean.toFixed(1)} / trades ${tradeMean.toFixed(1)} / CY ${cyMean.toFixed(0)}`);
}

{
  const st = newGame({ seed: 42 });
  runPsychology(st);
  const p = st.players.find((x) => x.contract && x.contract.yearsRemaining === 1 && !x.prospect);
  if (p) {
    assert.equal(isContractYear(p), true);
    assert.ok(contractApy(p) >= 0);
  }
  const userCy = st.players.filter((x: Player) => x.teamId === st.userTeamId && isContractYear(x) && x.ovr >= 70);
  const briefing = buildBriefing(st);
  if (userCy.length > 0) {
    assert.ok(briefing.reviewItems.some((r) => /contract-year/i.test(r)));
  }
  ok("contract-year is a flag + briefing note, not a sim hook");
}

console.log("ok    psychology people layer");
