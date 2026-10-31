/**
 * History rows keep the club the user ran that season.
 *
 * Seed 42, KC then acceptGmChair to BAL then SF. Titles, records, and
 * award/leader rows that were stamped with gmTeamId stay put. A row
 * already on disk without gmTeamId is not repaired from gmHiredSeason:
 * its record and pills still follow the chair, and its awards, leaders,
 * and champion id stay visible.
 *
 * The Season Review year is shown from the live playoff champion and
 * does not call the writer.
 *
 * Run: npx tsx lib/core/historyChair.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { acceptGmChair } from "./owner";
import { recordSeasonHistory } from "./offseason/progression";
import { blankSeasonLine } from "./season/stats";
import { blankRecord } from "./select";
import { presentFranchiseHistory, FranchiseHistoryView } from "./hallOfFame";
import { GameState, Player, SeasonHistory, SeasonStatLine, TeamRecord } from "./types";

function club(st: GameState, abbr: string): number {
  const team = st.teams.find((t) => t.abbr === abbr);
  assert.ok(team, abbr);
  return team.id;
}

function rostered(st: GameState, teamId: number, pos: Player["pos"]): Player {
  const p = st.players.find(
    (x) => x.teamId === teamId && x.pos === pos && !x.retired && !x.prospect,
  );
  assert.ok(p, `${pos} on club ${teamId}`);
  return p;
}

function giveLine(
  p: Player, season: number, teamId: number, patch: Partial<SeasonStatLine>,
): void {
  const line = blankSeasonLine(season, teamId);
  line.games = 16;
  Object.assign(line, patch, { season, teamId, games: patch.games ?? 16 });
  p.stats.push(line);
}

function table(st: GameState, records: Record<number, [number, number]>): TeamRecord[] {
  return st.teams.map((t) => {
    const r = blankRecord(t.id);
    const rec = records[t.id];
    if (rec) {
      r.w = rec[0];
      r.l = rec[1];
      r.pf = 200 + r.w * 20;
      r.pa = 400 - r.w * 10;
    } else {
      r.w = 8;
      r.l = 9;
      r.pf = 310;
      r.pa = 320;
    }
    return r;
  });
}

function row(
  season: number,
  championId: number,
  runnerUpId: number,
  standings: TeamRecord[],
  awards: SeasonHistory["awards"],
  leaders: SeasonHistory["leaders"],
  gmTeamId?: number,
): SeasonHistory {
  const history: SeasonHistory = {
    season, championId, runnerUpId, standings, awards, leaders,
  };
  if (gmTeamId != null) history.gmTeamId = gmTeamId;
  return history;
}

function year(view: FranchiseHistoryView, season: number) {
  const y = view.years.find((item) => item.season === season);
  assert.ok(y, `season ${season}`);
  return y;
}

function takeChair(st: GameState, teamId: number): void {
  st.forcedMove = {
    fromTeamId: st.userTeamId,
    season: st.season,
    openChairs: [teamId],
  };
  const res = acceptGmChair(st, teamId);
  assert.equal(res.ok, true, res.reason ?? "accept");
  assert.equal(st.userTeamId, teamId);
}

{
  const st = newGame({
    seed: 42, userTeamId: 15, startSeason: 2026, settings: { firingEnabled: false },
  });
  assert.equal(club(st, "KC"), 15);
  assert.equal(club(st, "BAL"), 19);
  assert.equal(club(st, "SF"), 28);
  const phx = club(st, "PHX");
  st.phase = "offseason-recap";
  st.playoffs = { seeds: [], round: "SB", complete: true, championId: phx };
  st.teams[st.userTeamId]!.gmHiredSeason = 1999;
  const written = recordSeasonHistory(st);
  assert.equal(written.gmTeamId, st.userTeamId, "the stamp is the chair held at the write");
  assert.equal(written.gmTeamId, 15);
  assert.notEqual(written.gmTeamId, 1999, "gmHiredSeason is not the stamp");
  assert.equal(written.championId, phx);
  assert.equal(st.history.length, 0, "the writer returns the row; Continue pushes it");
}

{
  const st = newGame({
    seed: 42, userTeamId: 15, startSeason: 2026, settings: { firingEnabled: false },
  });
  const kc = club(st, "KC");
  const bal = club(st, "BAL");
  const sf = club(st, "SF");
  const phx = club(st, "PHX");
  const hou = club(st, "HOU");
  const den = club(st, "DEN");
  const lv = club(st, "LV");
  const sd = club(st, "SD");
  const nys = club(st, "NYS");
  const phi = club(st, "PHI");
  const was = club(st, "WAS");
  const sea = club(st, "SEA");
  const la = club(st, "LA");

  const kcQb = rostered(st, kc, "QB");
  const sfWr = rostered(st, sf, "WR");
  const balRb = rostered(st, bal, "RB");
  giveLine(kcQb, 2026, kc, { passYds: 4500, passTd: 38 });
  giveLine(sfWr, 2026, sf, { recYds: 1438, rec: 90, recTd: 10 });
  giveLine(kcQb, 2024, kc, { passYds: 4100, passTd: 30 });
  giveLine(sfWr, 2024, sf, { recYds: 1438, rec: 90, recTd: 10 });
  giveLine(balRb, 2027, bal, { rushYds: 1600, rushTd: 14 });

  const opened: Record<number, [number, number]> = {
    [kc]: [15, 2],
    [den]: [10, 7],
    [lv]: [9, 8],
    [sd]: [8, 9],
    [bal]: [6, 11],
    [nys]: [5, 12],
    [phi]: [4, 13],
    [was]: [3, 14],
    [sea]: [10, 7],
    [sf]: [4, 13],
    [la]: [3, 14],
    [phx]: [2, 15],
  };
  const held: Record<number, [number, number]> = {
    [bal]: [12, 5],
    [nys]: [9, 8],
    [phi]: [8, 9],
    [was]: [7, 10],
    [kc]: [3, 14],
    [sf]: [5, 12],
  };

  const awards = {
    mvp: kcQb.id, opoy: sfWr.id, dpoy: 999999, roy: null,
  };
  const leaders = {
    passYds: kcQb.id, rushYds: null, recYds: sfWr.id, sacks: null,
  };

  // KC's hire year equals this row on purpose. It must not become gmTeamId.
  st.teams[kc]!.gmHiredSeason = 2024;
  st.history.push(
    row(2024, phx, hou, table(st, opened), awards, leaders),
    row(2026, kc, phx, table(st, opened), awards, leaders, kc),
    row(
      2027, hou, bal, table(st, held),
      { mvp: balRb.id, opoy: null, dpoy: null, roy: null },
      { passYds: null, rushYds: balRb.id, recYds: null, sacks: null },
      bal,
    ),
  );

  const signature = structuredClone(st.history);

  function stampedStay(view: FranchiseHistoryView): void {
    const title = year(view, 2026);
    assert.equal(title.champion, true);
    assert.equal(title.runnerUp, false);
    assert.equal(title.record, "15-2");
    assert.equal(title.finish, "1st in AFC West");
    assert.equal(title.championId, kc);
    assert.equal(title.pending, false);
    assert.deepEqual(
      title.awards.map((a) => [a.key, a.player?.id, a.teamId]),
      [["mvp", kcQb.id, kc], ["opoy", sfWr.id, sf]],
    );
    assert.equal(title.awards.some((a) => a.key === "dpoy"), false, "a missing body is not a row");
    assert.equal(title.awards.some((a) => a.key === "roy"), false, "a null id is not a row");
    assert.deepEqual(
      title.leaders.map((l) => [l.key, l.player?.id, l.teamId, l.value]),
      [["passYds", kcQb.id, kc, "4500"], ["recYds", sfWr.id, sf, "1438"]],
    );
    const beat = view.timeline.find((b) => b.season === 2026);
    assert.ok(beat);
    assert.match(beat.text, /Won the championship/);
    assert.match(beat.text, /15-2/);
    assert.match(beat.text, /MVP: .* KC/);
    assert.match(beat.text, /OPOY: .* SF/);

    const second = year(view, 2027);
    assert.equal(second.champion, false);
    assert.equal(second.runnerUp, true);
    assert.equal(second.record, "12-5");
    assert.equal(second.finish, "1st in NFC East");
    assert.equal(second.championId, hou);
    assert.deepEqual(
      second.awards.map((a) => [a.key, a.player?.id, a.teamId]),
      [["mvp", balRb.id, bal]],
    );
    assert.deepEqual(
      second.leaders.map((l) => [l.key, l.player?.id, l.teamId, l.value]),
      [["rushYds", balRb.id, bal, "1600"]],
    );
    assert.equal(view.championships, 1);
  }

  function legacyFollowsChair(view: FranchiseHistoryView, record: string, finish: string): void {
    const old = year(view, 2024);
    assert.equal(old.record, record);
    assert.equal(old.finish, finish);
    assert.equal(old.champion, false, "the pill stays with the chair, not the stored champion");
    assert.equal(old.runnerUp, false);
    assert.equal(old.championId, phx, "the champion stays visible");
    assert.equal(old.pending, false);
    assert.deepEqual(
      old.awards.map((a) => [a.key, a.player?.id, a.teamId]),
      [["mvp", kcQb.id, kc], ["opoy", sfWr.id, sf]],
    );
    assert.deepEqual(
      old.leaders.map((l) => [l.key, l.player?.id, l.teamId, l.value]),
      [["passYds", kcQb.id, kc, "4100"], ["recYds", sfWr.id, sf, "1438"]],
    );
  }

  {
    const view = presentFranchiseHistory(st);
    assert.equal(view.city, "Kansas City");
    stampedStay(view);
    legacyFollowsChair(view, "15-2", "1st in AFC West");
  }

  takeChair(st, bal);
  assert.deepEqual(st.history, signature, "acceptGmChair does not rewrite history");
  assert.equal(st.teams[kc]!.gmHiredSeason, 2024, "the club left behind keeps its hire year");
  {
    const view = presentFranchiseHistory(st);
    assert.equal(view.city, "Baltimore");
    stampedStay(view);
    legacyFollowsChair(view, "6-11", "1st in NFC East");
  }

  takeChair(st, sf);
  assert.deepEqual(st.history, signature, "the second chair change leaves the rows");
  assert.equal(st.teams[kc]!.gmHiredSeason, 2024);
  {
    const view = presentFranchiseHistory(st);
    assert.equal(view.city, "San Francisco");
    stampedStay(view);
    legacyFollowsChair(view, "4-13", "2nd in NFC West");
    assert.equal(year(view, 2026).record, "15-2", "KC's title year does not become SF's 4-13");
    assert.equal(year(view, 2027).runnerUp, true, "BAL's runner-up pill survives the move to SF");
  }
}

{
  const st = newGame({
    seed: 42, userTeamId: 15, startSeason: 2026, settings: { firingEnabled: false },
  });
  const phx = club(st, "PHX");
  const qb = rostered(st, st.userTeamId, "QB");
  st.phase = "offseason-recap";
  st.playoffs = { seeds: [], round: "SB", complete: true, championId: phx };
  giveLine(qb, st.season, st.userTeamId, { passYds: 5000, passTd: 45, games: 17 });
  const awardsBefore = st.players.map((p) => p.careerAwards.length);
  const view = presentFranchiseHistory(st);
  assert.equal(st.history.length, 0, "the pending year is not written");
  assert.deepEqual(st.players.map((p) => p.careerAwards.length), awardsBefore, "the writer did not stamp");
  assert.equal(view.years.length, 1);
  assert.equal(view.years[0]!.pending, true);
  assert.equal(view.years[0]!.season, 2026);
  assert.equal(view.years[0]!.championId, phx);
  assert.equal(view.years[0]!.champion, false);
  assert.equal(view.championships, 0);
  assert.equal(view.years[0]!.record, "0-0");
  assert.match(view.years[0]!.finish ?? "", /AFC West/);
  const mvp = view.years[0]!.awards.find((a) => a.key === "mvp");
  assert.equal(mvp?.player?.id, qb.id);
  assert.equal(mvp?.teamId, st.userTeamId);
  presentFranchiseHistory(st);
  assert.equal(st.history.length, 0);
  assert.deepEqual(st.players.map((p) => p.careerAwards.length), awardsBefore);

  st.history.push(row(
    2026, phx, -1,
    st.teams.map((t) => blankRecord(t.id)),
    { mvp: null, opoy: null, dpoy: null, roy: null },
    { passYds: null, rushYds: null, recYds: null, sacks: null },
    st.userTeamId,
  ));
  const archived = presentFranchiseHistory(st);
  assert.equal(archived.years.length, 1, "a stored row replaces the pending year");
  assert.equal(archived.years[0]!.pending, false);
  assert.equal(st.history.length, 1);
}

console.log("ok    history chair — gmTeamId, legacy rows, and the pending review year");
