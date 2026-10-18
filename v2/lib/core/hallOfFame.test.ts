/**
 * Hall of Fame eligibility and franchise-history presenter.
 *
 * Thresholds are documented in hallOfFame.ts. No career-AV. History is
 * planted on the save — this file never calls recordSeasonHistory.
 *
 * Run: npx tsx lib/core/hallOfFame.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { applyGameStats, blankPlayerGameStat, blankSeasonLine, blankTeamGameStats, careerTotals } from "./season/stats";
import { blankRecord } from "./select";
import {
  Game, GameState, Player, SeasonHistory, SeasonStatLine, TeamRecord,
} from "./types";
import {
  HOF_RULE,
  LONGEVITY_SEASONS,
  MIN_FRANCHISE_SEASONS,
  franchiseHallOfFame,
  franchiseSeasonCount,
  hofReasons,
  isHofEligible,
  isLeagueHofCandidate,
  lastPlayedSeason,
  presentFranchiseHistory,
  primaryTeamId,
  reasonLine,
  runHofInduction,
} from "./hallOfFame";

function plantSeasons(p: Player, teamId: number, seasons: number[], games = 10): SeasonStatLine[] {
  const lines: SeasonStatLine[] = [];
  for (const season of seasons) {
    const line = blankSeasonLine(season, teamId);
    line.games = games;
    line.gamesStarted = games;
    lines.push(line);
  }
  p.stats = lines;
  return lines;
}

function plantHistory(
  st: GameState,
  season: number,
  extras: Partial<SeasonHistory> & { userW?: number; userL?: number } = {},
): SeasonHistory {
  const standings: TeamRecord[] = st.teams.map((t) => {
    const r = blankRecord(t.id);
    if (t.id === st.userTeamId) {
      r.w = extras.userW ?? 10;
      r.l = extras.userL ?? 7;
      r.pf = 380;
      r.pa = 320;
    } else {
      r.w = 8;
      r.l = 9;
    }
    return r;
  });
  const row: SeasonHistory = {
    season,
    championId: extras.championId ?? (st.userTeamId === 0 ? 1 : 0),
    runnerUpId: extras.runnerUpId ?? (st.userTeamId === 1 ? 2 : 1),
    standings: extras.standings ?? standings,
    awards: extras.awards ?? { mvp: null, opoy: null, dpoy: null, roy: null },
    leaders: extras.leaders ?? { passYds: null, rushYds: null, recYds: null, sacks: null },
  };
  st.history.push(row);
  return row;
}

function retiree(st: GameState, pos: Player["pos"] = "QB"): Player {
  const p = st.players.find((x) => x.teamId === st.userTeamId && x.pos === pos && !x.retired && !x.prospect);
  assert.ok(p, `need a rostered ${pos}`);
  p.retired = true;
  p.teamId = null;
  p.prospect = false;
  p.careerAwards = [];
  return p;
}

function playoffAppearance(st: GameState, p: Player, teamId: number, season: number): void {
  const game: Game = {
    id: 999, season, week: 22, homeId: teamId, awayId: (teamId + 1) % 32,
    played: true, homeScore: 21, awayScore: 0, playoffRound: "SB",
    boxScore: {
      home: blankTeamGameStats(), away: blankTeamGameStats(),
      quarters: { home: [], away: [] }, scoringPlays: [],
      players: [{ ...blankPlayerGameStat(p.id, teamId, true), snaps: 60, rushYds: 100 }],
    },
  };
  applyGameStats(st, game);
}

{
  const st = newGame({ seed: 11 });
  const view = presentFranchiseHistory(st);
  assert.equal(view.emptyHistory, true, "year-0 save has no archive");
  assert.equal(view.years.length, 0);
  assert.equal(view.timeline.length, 0);
  assert.equal(view.emptyHof, true, "year-0 HoF is empty, honestly");
  assert.equal(view.hallOfFame.length, 0);
  assert.equal(view.championships, 0);
  assert.equal(view.hofRule, HOF_RULE);
  assert.equal(franchiseHallOfFame(st, st.userTeamId).length, 0);
}

{
  const st = newGame({ seed: 12 });
  plantHistory(st, 2026, { championId: st.userTeamId, userW: 13, userL: 4 });
  plantHistory(st, 2027, {
    championId: 3,
    runnerUpId: st.userTeamId,
    userW: 11,
    userL: 6,
  });

  const view = presentFranchiseHistory(st);
  assert.equal(view.emptyHistory, false);
  assert.equal(view.years.length, 2);
  assert.equal(view.years[0]!.season, 2027, "newest year first");
  assert.equal(view.years[1]!.season, 2026);
  assert.equal(view.years[1]!.champion, true);
  assert.equal(view.years[1]!.record, "13-4");
  assert.equal(view.years[0]!.runnerUp, true);
  assert.equal(view.years[0]!.record, "11-6");
  assert.equal(view.championships, 1);
  assert.equal(view.firstSeason, 2026);
  assert.equal(view.lastSeason, 2027);
  assert.equal(view.timeline.length, 2);
  assert.ok(view.timeline[0]!.text.includes("Won the championship"));
  assert.ok(view.timeline[1]!.text.includes("Lost the championship"));
  assert.ok(view.years[0]!.finish);
  assert.match(view.years[0]!.finish!, /in /);
}

{
  const st = newGame({ seed: 13 });
  const p = retiree(st, "QB");
  plantSeasons(p, st.userTeamId, [2026, 2027, 2028, 2029]);
  plantHistory(st, 2028, { awards: { mvp: p.id, opoy: null, dpoy: null, roy: null } });

  assert.equal(franchiseSeasonCount(p, st.userTeamId), 4);
  assert.equal(isHofEligible(st, p, st.userTeamId), true, "4 seasons + MVP");
  const hof = franchiseHallOfFame(st, st.userTeamId);
  assert.equal(hof.length, 1);
  assert.equal(hof[0]!.player.id, p.id);
  assert.ok(hof[0]!.reasons.some((r) => r.kind === "award" && r.label === "MVP"));
  assert.ok(reasonLine(hof[0]!.reasons[0]!).includes("MVP"));

  const view = presentFranchiseHistory(st);
  assert.equal(view.emptyHof, false);
  assert.equal(view.hallOfFame[0]!.player.id, p.id);
  assert.equal(view.years[0]!.awards[0]!.player?.id, p.id);
}

{
  const st = newGame({ seed: 14 });
  const p = retiree(st, "WR");
  plantSeasons(p, st.userTeamId, [2026, 2027, 2028]);
  plantHistory(st, 2027, { awards: { mvp: p.id, opoy: null, dpoy: null, roy: null } });
  assert.equal(MIN_FRANCHISE_SEASONS, 4);
  assert.equal(isHofEligible(st, p, st.userTeamId), false, "MVP with only 3 seasons is short");
  assert.equal(franchiseHallOfFame(st, st.userTeamId).length, 0);
}

{
  const st = newGame({ seed: 15 });
  const p = retiree(st, "RB");
  const years = [2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027];
  assert.equal(years.length, LONGEVITY_SEASONS);
  plantSeasons(p, st.userTeamId, years);
  assert.equal(isHofEligible(st, p, st.userTeamId), true, "8 seasons, no award");
  const reasons = franchiseHallOfFame(st, st.userTeamId)[0]!.reasons;
  assert.ok(reasons.some((r) => r.kind === "longevity" && r.seasons === 8));
}

{
  const st = newGame({ seed: 16 });
  const p = retiree(st, "EDGE");
  plantSeasons(p, st.userTeamId, [2026, 2027, 2028, 2029]);
  plantHistory(st, 2028, { awards: { mvp: null, opoy: null, dpoy: null, roy: p.id } });
  p.careerAwards = ["2028 Rookie of the Year"];
  assert.equal(isHofEligible(st, p, st.userTeamId), false, "ROY alone does not qualify");
}

{
  const st = newGame({ seed: 17 });
  const p = st.players.find((x) => x.teamId === st.userTeamId && x.pos === "QB" && !x.retired)!;
  plantSeasons(p, st.userTeamId, [2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027]);
  plantHistory(st, 2024, { awards: { mvp: p.id, opoy: null, dpoy: null, roy: null } });
  assert.equal(p.retired, false);
  assert.equal(isHofEligible(st, p, st.userTeamId), false, "active players never qualify");
  assert.equal(franchiseHallOfFame(st, st.userTeamId).length, 0);
}

{
  const st = newGame({ seed: 18 });
  const p = retiree(st, "WR");
  plantSeasons(p, st.userTeamId, [2026, 2027, 2028, 2029]);
  const line = p.stats.find((s) => s.season === 2028)!;
  line.recYds = 1840;
  plantHistory(st, 2028, { leaders: { passYds: null, rushYds: null, recYds: p.id, sacks: null } });
  assert.equal(isHofEligible(st, p, st.userTeamId), true, "league-leading season qualifies");
  const view = presentFranchiseHistory(st);
  assert.equal(view.years[0]!.leaders[0]!.player?.id, p.id);
  assert.equal(view.years[0]!.leaders[0]!.value, "1840");
}

{
  const st = newGame({ seed: 19 });
  const other = st.teams.find((t) => t.id !== st.userTeamId)!.id;
  const p = retiree(st, "QB");
  plantSeasons(p, other, [2026, 2027, 2028, 2029]);
  plantHistory(st, 2028, { awards: { mvp: p.id, opoy: null, dpoy: null, roy: null } });
  assert.equal(isHofEligible(st, p, st.userTeamId), false, "award for another club does not count");
  assert.equal(isHofEligible(st, p, other), true, "same man qualifies for the club he played for");
}

{
  const st = newGame({ seed: 20 });
  const p = retiree(st, "LB");
  plantSeasons(p, st.userTeamId, [2026, 2027, 2028, 2029]);
  plantHistory(st, 2027, { championId: st.userTeamId });
  assert.equal(isHofEligible(st, p, st.userTeamId), true, "championship with the club qualifies");
}

{
  const st = newGame({ seed: 21 });
  const p = retiree(st, "TE");
  plantSeasons(p, st.userTeamId, [2026, 2027, 2028, 2029]);
  p.careerAwards = ["2028 Offensive Player of the Year"];
  assert.equal(isHofEligible(st, p, st.userTeamId), true, "careerAwards stamp is enough without a history row");
}

{
  const st = newGame({ seed: 22 });
  JSON.parse(JSON.stringify(st));
  const view = presentFranchiseHistory(st);
  assert.equal(view.emptyHistory, true);
  assert.equal(view.emptyHof, true);
}

// Championship membership survives even when the title year's only appearances
// were in the postseason. Exercise history and the career stamp independently.
for (const archived of [true, false]) {
  const st = newGame({ seed: 23 });
  const p = retiree(st, "RB");
  const club = st.userTeamId;
  plantSeasons(p, club, [2026, 2027, 2028]);
  const regularBefore = structuredClone(p.stats);
  playoffAppearance(st, p, club, 2028);
  playoffAppearance(st, p, club, 2029);
  if (archived) {
    plantHistory(st, 2029, { championId: club, awards: { mvp: p.id, opoy: null, dpoy: null, roy: null } });
  } else {
    p.careerAwards = ["2029 Champion", "2029 MVP"];
  }
  assert.equal(franchiseSeasonCount(p, club), 4, "REG plus playoffs in one year counts once");
  assert.equal(franchiseSeasonCount(p, (club + 1) % 32), 0, "membership stays with the actual club");
  assert.equal(isHofEligible(st, p, club), true, "the playoff-only fourth season and title qualify");
  const reasons = hofReasons(st, p, club);
  assert.equal(reasons.filter((r) => r.kind === "champion").length, 1);
  assert.equal(reasons.filter((r) => r.kind === "award").length, 0,
    "postseason membership cannot assign regular-season awards to that club");
  const entry = franchiseHallOfFame(st, club).find((e) => e.player.id === p.id)!;
  assert.equal(entry.seasons, 4);
  assert.equal(entry.firstSeason, 2026);
  assert.equal(entry.lastSeason, 2029);
  assert.equal(entry.championships, 1);
  p.starSeasons = 3;
  st.season = 2034;
  assert.equal(lastPlayedSeason(p), 2029, "the retirement fallback includes postseason service");
  assert.equal(isLeagueHofCandidate(st, p), true);
  const inducted = runHofInduction(st).find((e) => e.playerId === p.id)!;
  assert.equal(inducted.seasons, 4);
  assert.equal(inducted.lastSeason, 2029);
  assert.equal(inducted.championships, 1);
  assert.deepEqual(p.stats, regularBefore, "club history does not invent production rows");
  assert.equal(careerTotals(p).rushYds, 0);
}

{
  const st = newGame({ seed: 24 });
  const p = retiree(st, "RB");
  p.stats = [];
  for (const season of [2026, 2027, 2028, 2029]) playoffAppearance(st, p, st.userTeamId, season);
  p.careerAwards = ["2029 Champion"];
  p.eliteSeasons = 1;
  st.season = 2034;
  assert.equal(primaryTeamId(p), st.userTeamId, "postseason-only clubs participate in primary-club selection");
  assert.equal(isLeagueHofCandidate(st, p), true, "candidate discovery includes postseason-only clubs");
  const entry = runHofInduction(st).find((e) => e.playerId === p.id)!;
  assert.equal(entry.teamId, st.userTeamId);
  assert.equal(entry.seasons, 4);
  assert.equal(entry.firstSeason, 2026);
  assert.equal(entry.lastSeason, 2029);
  assert.equal(entry.championships, 1);
  assert.equal(careerTotals(p).games, 0);
}

for (const archived of [true, false]) {
  const st = newGame({ seed: 26 });
  const p = retiree(st, "RB");
  const regularClub = st.userTeamId;
  const playoffClub = (regularClub + 1) % 32;
  plantSeasons(p, regularClub, [2026, 2027, 2028, 2029]);
  playoffAppearance(st, p, playoffClub, 2029);
  p.careerAwards = ["2029 Champion", "2029 MVP"];
  if (archived) plantHistory(st, 2029, { championId: playoffClub });
  assert.equal(hofReasons(st, p, regularClub).some((r) => r.kind === "champion"), false,
    "a title stamp belongs to the championship club, not an earlier regular-season club");
  assert.equal(hofReasons(st, p, playoffClub).filter((r) => r.kind === "champion").length, 1);
  assert.equal(hofReasons(st, p, regularClub).filter((r) => r.kind === "award").length, 1,
    "regular-season award attribution stays with the regular-season club");
  assert.equal(hofReasons(st, p, playoffClub).some((r) => r.kind === "award"), false);
}

console.log("ok    Hall of Fame eligibility, postseason club history, and franchise history presenter");
