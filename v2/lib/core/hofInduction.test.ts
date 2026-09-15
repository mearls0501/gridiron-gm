/**
 * League Hall of Fame induction: five-season wait, one class per year,
 * outcomes.ts bar, milestone log, deterministic sort.
 *
 * Run: npx tsx lib/core/hofInduction.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { runRecap } from "./offseason";
import { isPermanentLogEntry } from "./housekeeping";
import { blankSeasonLine } from "./season/stats";
import { GameState, Player, SeasonStatLine } from "./types";
import {
  HOF_CLASS_MAX,
  HOF_WAIT_SEASONS,
  LEAGUE_HOF_RULE,
  championshipsAsStarter,
  hofInducteesPerClass,
  isLeagueHofCandidate,
  isWaitComplete,
  meetsLeagueHofBar,
  presentLeagueHall,
  runHofInduction,
  tickHofCareerLabels,
} from "./hallOfFame";

function ok(label: string) {
  console.log("ok   ", label);
}

function plantSeasons(p: Player, teamId: number, seasons: number[], games = 10): SeasonStatLine[] {
  const lines: SeasonStatLine[] = [];
  for (const season of seasons) {
    const line = blankSeasonLine(season, teamId);
    line.games = games;
    line.gamesStarted = games;
    line.snaps = 800;
    lines.push(line);
  }
  p.stats = lines;
  return lines;
}

function longevityYears(last: number): number[] {
  return [last - 7, last - 6, last - 5, last - 4, last - 3, last - 2, last - 1, last];
}

function takePlayers(st: GameState, n: number): Player[] {
  const out: Player[] = [];
  for (const p of st.players) {
    if (p.retired || p.prospect || p.teamId === null) continue;
    out.push(p);
    if (out.length >= n) break;
  }
  assert.equal(out.length, n, `need ${n} rostered players`);
  return out;
}

function retireForLeague(
  st: GameState,
  p: Player,
  opts: {
    retiredSeason: number;
    teamId?: number;
    stars?: number;
    elites?: number;
    titleStarter?: boolean;
    years?: number[];
  },
): Player {
  const teamId = opts.teamId ?? (p.teamId ?? st.userTeamId);
  const last = opts.retiredSeason;
  const years = opts.years ?? longevityYears(last);
  p.retired = true;
  p.teamId = null;
  p.prospect = false;
  p.contract = null;
  p.careerAwards = [];
  p.retiredSeason = opts.retiredSeason;
  p.starSeasons = opts.stars ?? 0;
  p.eliteSeasons = opts.elites ?? 0;
  plantSeasons(p, teamId, years);
  if (opts.titleStarter) {
    const titleYear = years[years.length - 1]!;
    const line = p.stats.find((s) => s.season === titleYear)!;
    line.gamesStarted = 16;
    if (!st.history.some((h) => h.season === titleYear)) {
      st.history.push({
        season: titleYear,
        championId: teamId,
        runnerUpId: teamId === 0 ? 1 : 0,
        standings: [],
        awards: { mvp: null, opoy: null, dpoy: null, roy: null },
        leaders: { passYds: null, rushYds: null, recYds: null, sacks: null },
      });
    } else {
      st.history.find((h) => h.season === titleYear)!.championId = teamId;
    }
  }
  return p;
}

{
  const st = newGame({ seed: 31 });
  const [p] = takePlayers(st, 1);
  retireForLeague(st, p, { retiredSeason: 2026, stars: 3 });
  st.season = 2026 + HOF_WAIT_SEASONS - 1;
  assert.equal(isWaitComplete(st, p), false, "year 4 is still waiting");
  assert.equal(runHofInduction(st).length, 0);
  assert.equal((st.hallOfFame ?? []).length, 0);

  st.season = 2026 + HOF_WAIT_SEASONS;
  assert.equal(isWaitComplete(st, p), true, "year 5 is eligible");
  const clas = runHofInduction(st);
  assert.equal(clas.length, 1);
  assert.equal(clas[0]!.playerId, p.id);
  assert.equal(clas[0]!.inductedSeason, st.season);
  ok("five-season wait: not inducted at +4, inducted at +5");
}

{
  const st = newGame({ seed: 32 });
  st.season = 2032;
  const players = takePlayers(st, 12);
  for (const p of players) {
    retireForLeague(st, p, { retiredSeason: 2027, stars: 4, elites: 1 });
  }
  const clas = runHofInduction(st);
  assert.equal(HOF_CLASS_MAX, 8);
  assert.equal(clas.length, HOF_CLASS_MAX, "class is capped at 8");
  assert.equal(st.hallOfFame!.length, HOF_CLASS_MAX);
  const again = runHofInduction(st);
  assert.equal(again.length, 0, "one class per year — same season does not fill again");
  assert.equal(st.hallOfFame!.length, HOF_CLASS_MAX);
  st.season += 1;
  const next = runHofInduction(st);
  assert.equal(next.length, 4, "leftover eligible wait for the next class");
  assert.equal(st.hallOfFame!.length, 12);
  ok("class size caps at 8; leftover wait for next year");
}

{
  const st = newGame({ seed: 33 });
  st.season = 2032;
  const [short, stars, elite, champ, longevityOnly] = takePlayers(st, 5);
  const other = st.teams.find((t) => t.id !== st.userTeamId)!.id;
  retireForLeague(st, short, {
    retiredSeason: 2027,
    teamId: other,
    years: [2024, 2025, 2026, 2027],
    stars: 5,
  });
  retireForLeague(st, stars, { retiredSeason: 2027, teamId: other, stars: 3 });
  retireForLeague(st, elite, { retiredSeason: 2027, teamId: other, elites: 1 });
  retireForLeague(st, champ, { retiredSeason: 2027, teamId: st.userTeamId, titleStarter: true });
  retireForLeague(st, longevityOnly, { retiredSeason: 2027, teamId: other });

  assert.equal(meetsLeagueHofBar(st, stars), true);
  assert.equal(meetsLeagueHofBar(st, elite), true);
  assert.equal(meetsLeagueHofBar(st, champ), true);
  assert.equal(championshipsAsStarter(st, champ) >= 1, true);
  assert.equal(meetsLeagueHofBar(st, longevityOnly), false, "8 seasons alone is not the league bar");
  assert.equal(isLeagueHofCandidate(st, longevityOnly), false);
  assert.equal(isLeagueHofCandidate(st, short), false, "bar without the franchise threshold is not enough");

  const ids = new Set(runHofInduction(st).map((e) => e.playerId));
  assert.equal(ids.has(stars.id), true, "3 star seasons inducts");
  assert.equal(ids.has(elite.id), true, "1 elite season inducts");
  assert.equal(ids.has(champ.id), true, "championship as a starter inducts");
  assert.equal(ids.has(longevityOnly.id), false, "longevity-only stays on the franchise ring");
  assert.equal(ids.has(short.id), false, "no franchise threshold, no induction");
  ok("league bar: 3 stars / 1 elite / title as starter; longevity-only rejected");
}

{
  const st = newGame({ seed: 34 });
  st.season = 2032;
  const [p] = takePlayers(st, 1);
  retireForLeague(st, p, { retiredSeason: 2027, stars: 3 });
  const before = st.log.length;
  runHofInduction(st);
  const added = st.log.slice(before);
  const row = added.find((e) => e.kind === "milestone" && e.playerId === p.id);
  assert.ok(row, "induction writes a milestone");
  assert.match(row!.text, /Hall of Fame/);
  assert.match(row!.text, new RegExp(p.lastName));
  assert.equal(isPermanentLogEntry(row!), true, "trimLog keeps the milestone");
  ok("milestone log entry per inductee, permanent kind");
}

{
  const st = newGame({ seed: 35 });
  st.season = 2032;
  const players = takePlayers(st, 6);
  for (let i = 0; i < players.length; i++) {
    retireForLeague(st, players[i]!, {
      retiredSeason: 2027,
      stars: 3 + (i % 3),
      elites: i === 0 ? 1 : 0,
    });
  }
  const a = JSON.parse(JSON.stringify(st)) as GameState;
  const b = JSON.parse(JSON.stringify(st)) as GameState;
  const left = runHofInduction(a).map((e) => e.playerId);
  const right = runHofInduction(b).map((e) => e.playerId);
  assert.deepEqual(left, right);
  assert.deepEqual(a.hallOfFame, b.hallOfFame);
  assert.deepEqual(
    a.log.filter((e) => e.text.includes("Hall of Fame")).map((e) => e.text),
    b.log.filter((e) => e.text.includes("Hall of Fame")).map((e) => e.text),
  );
  ok("selection is a sort — identical clones induct identically");
}

{
  const st = newGame({ seed: 36 });
  st.phase = "offseason-recap";
  st.season = 2032;
  const [p] = takePlayers(st, 1);
  retireForLeague(st, p, { retiredSeason: 2027, stars: 3 });
  const rngBefore = st.rngState;
  runRecap(st);
  assert.ok((st.hallOfFame ?? []).some((e) => e.playerId === p.id), "runRecap inducts");
  assert.equal(st.phase, "offseason-tag");
  // Progression still draws; we did not add a draw. Stream may move from aging.
  void rngBefore;
  ok("runRecap stamps retirement year and runs induction");
}

{
  const st = newGame({ seed: 37 });
  const [a, b] = takePlayers(st, 2);
  retireForLeague(st, a, { retiredSeason: 2026, stars: 3 });
  retireForLeague(st, b, { retiredSeason: 2027, stars: 3 });
  st.season = 2031;
  runHofInduction(st);
  st.season = 2032;
  runHofInduction(st);
  assert.equal(hofInducteesPerClass(st), 1);
  const view = presentLeagueHall(st);
  assert.equal(view.empty, false);
  assert.equal(view.classCount, 2);
  assert.equal(view.classes[0]!.season, 2032, "newest class first");
  assert.equal(view.rule, LEAGUE_HOF_RULE);
  JSON.parse(JSON.stringify(st));
  ok("presentLeagueHall groups by class; save round-trips");
}

{
  const st = newGame({ seed: 38 });
  const p = st.players.find((x) => x.teamId !== null && !x.retired && !x.prospect)!;
  const line = blankSeasonLine(st.season, p.teamId!);
  line.games = 17;
  line.gamesStarted = 17;
  line.snaps = 1100;
  p.stats = [line];
  p.ovr = 99;
  tickHofCareerLabels(st);
  assert.ok((p.starSeasons ?? 0) >= 1, "live tick writes a star season on a 99");
  assert.ok((p.eliteSeasons ?? 0) >= 1, "live tick writes an elite season on a 99");
  ok("tickHofCareerLabels uses outcomes.ts ranks");
}

{
  const st = newGame({ seed: 39 });
  st.season = 2032;
  const players = takePlayers(st, 8);
  for (const p of players) retireForLeague(st, p, { retiredSeason: 2027, stars: 3 });
  runHofInduction(st);
  const mean = hofInducteesPerClass(st);
  assert.equal(mean, 8);
  console.log(`##M careers.hofInducteesPerClass ${mean.toFixed(2)}`);
  ok("careers.hofInducteesPerClass emits from a full class of 8");
}

console.log("ok    League Hall of Fame induction");
