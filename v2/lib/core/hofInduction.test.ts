/**
 * League Hall of Fame induction. Signed 2026-11-10.
 * Five-season wait, class maximum 5 with empty seats left empty,
 * elite ≥ 3 or (star ≥ 8 and elite ≥ 1), ring is score-only,
 * kickers and punters on a separate ballot.
 *
 * Run: npx tsx lib/core/hofInduction.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { runRecap } from "./offseason";
import { isPermanentLogEntry } from "./housekeeping";
import { blankSeasonLine } from "./season/stats";
import { migrate } from "../store/save";
import { GameState, HofEntry, Player, SeasonStatLine } from "./types";
import {
  HOF_CLASS_MAX,
  HOF_ELITE_BAR,
  HOF_SPECIALIST_CLASS_MAX,
  HOF_SPECIALIST_ELITE_BAR,
  HOF_STAR_BAR,
  HOF_STAR_PATH_ELITE,
  HOF_WAIT_SEASONS,
  LEAGUE_HOF_RULE,
  LONGEVITY_SEASONS,
  championshipsAsStarter,
  hofInducteesPerClass,
  isHofSpecialist,
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

function addSeasons(p: Player, teamId: number, seasons: number[]): void {
  for (const season of seasons) {
    const line = blankSeasonLine(season, teamId);
    line.games = 10;
    line.gamesStarted = 10;
    line.snaps = 800;
    p.stats.push(line);
  }
}

function yearsEnding(last: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => last - (n - 1) + i);
}

function longevityYears(last: number): number[] {
  return yearsEnding(last, LONGEVITY_SEASONS);
}

function takePlayers(st: GameState, n: number, pos?: Player["pos"]): Player[] {
  const out: Player[] = [];
  for (const p of st.players) {
    if (p.retired || p.prospect || p.teamId === null) continue;
    if (pos) {
      if (p.pos !== pos) continue;
    } else if (isHofSpecialist(p)) {
      continue;
    }
    out.push(p);
    if (out.length >= n) break;
  }
  assert.equal(out.length, n, `need ${n} rostered ${pos ?? "non-specialist"} players`);
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
  assert.equal(HOF_CLASS_MAX, 5);
  assert.equal(HOF_STAR_BAR, 8);
  assert.equal(HOF_ELITE_BAR, 3);
  assert.equal(HOF_STAR_PATH_ELITE, 1);
  assert.equal(HOF_SPECIALIST_ELITE_BAR, 8);
  assert.equal(HOF_SPECIALIST_CLASS_MAX, 1);
  assert.equal(LONGEVITY_SEASONS, 8);
  ok("signed constants: class 5, elite 3, star 8 plus one elite, specialist elite 8");
}

{
  const st = newGame({ seed: 31 });
  const [p] = takePlayers(st, 1);
  retireForLeague(st, p, { retiredSeason: 2026, elites: 3 });
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
    retireForLeague(st, p, { retiredSeason: 2027, stars: 8, elites: 3 });
  }
  const clas = runHofInduction(st);
  assert.equal(clas.length, HOF_CLASS_MAX, "class is capped at 5");
  assert.equal(st.hallOfFame!.length, HOF_CLASS_MAX);
  const again = runHofInduction(st);
  assert.equal(again.length, 0, "one class per year — same season does not fill again");
  assert.equal(st.hallOfFame!.length, HOF_CLASS_MAX);
  st.season += 1;
  const next = runHofInduction(st);
  assert.equal(next.length, 5, "the next five wait for the next class");
  st.season += 1;
  const tail = runHofInduction(st);
  assert.equal(tail.length, 2, "a class of two stays a class of two");
  assert.equal(st.hallOfFame!.length, 12);
  ok("class size caps at 5; a short leftover class is not filled");
}

{
  const st = newGame({ seed: 33 });
  st.season = 2032;
  const [short, starsOnly, eliteOne, eightStars, starPath, elitePath, champ, mixed, longevityOnly] =
    takePlayers(st, 9);
  const clubs = st.teams.filter((t) => t.id !== st.userTeamId).map((t) => t.id);
  const other = clubs[0]!;
  const third = clubs[1]!;
  retireForLeague(st, short, {
    retiredSeason: 2027,
    teamId: third,
    years: [2024, 2025, 2026, 2027],
    elites: 3,
  });
  retireForLeague(st, starsOnly, { retiredSeason: 2027, teamId: other, stars: 3 });
  retireForLeague(st, eliteOne, { retiredSeason: 2027, teamId: other, elites: 1 });
  retireForLeague(st, eightStars, { retiredSeason: 2027, teamId: other, stars: 8 });
  retireForLeague(st, starPath, { retiredSeason: 2027, teamId: other, stars: 8, elites: 1 });
  retireForLeague(st, elitePath, { retiredSeason: 2027, teamId: other, elites: 3 });
  retireForLeague(st, champ, { retiredSeason: 2027, teamId: st.userTeamId, titleStarter: true });
  retireForLeague(st, mixed, {
    retiredSeason: 2026,
    teamId: other,
    stars: 3,
    titleStarter: true,
  });
  retireForLeague(st, longevityOnly, { retiredSeason: 2027, teamId: other });

  assert.equal(meetsLeagueHofBar(st, starsOnly), false, "three star seasons are short of 8");
  assert.equal(meetsLeagueHofBar(st, eliteOne), false, "one elite season is short of 3");
  assert.equal(meetsLeagueHofBar(st, eightStars), false, "eight star seasons need an elite season");
  assert.equal(meetsLeagueHofBar(st, starPath), true, "eight star seasons and one elite season");
  assert.equal(meetsLeagueHofBar(st, elitePath), true, "three elite seasons");
  assert.equal(meetsLeagueHofBar(st, champ), false, "a starter ring is not a way in");
  assert.equal(championshipsAsStarter(st, champ) >= 1, true);
  assert.equal(meetsLeagueHofBar(st, mixed), false, "three stars plus a ring is still short");
  assert.equal(meetsLeagueHofBar(st, longevityOnly), false, "8 seasons alone is not the league bar");
  assert.equal(isLeagueHofCandidate(st, longevityOnly), false);
  assert.equal(isLeagueHofCandidate(st, short), false, "bar without the franchise threshold is not enough");
  assert.equal(isLeagueHofCandidate(st, champ), false);
  assert.equal(isLeagueHofCandidate(st, starPath), true);
  assert.equal(isLeagueHofCandidate(st, elitePath), true);

  const ids = new Set(runHofInduction(st).map((e) => e.playerId));
  assert.equal(ids.size, 2);
  assert.equal(ids.has(starPath.id), true, "eight stars and one elite inducts");
  assert.equal(ids.has(elitePath.id), true, "three elite seasons inducts");
  assert.equal(ids.has(starsOnly.id), false);
  assert.equal(ids.has(eliteOne.id), false);
  assert.equal(ids.has(eightStars.id), false);
  assert.equal(ids.has(champ.id), false, "championship as a starter does not induct");
  assert.equal(ids.has(mixed.id), false);
  assert.equal(ids.has(longevityOnly.id), false, "longevity-only stays on the franchise ring");
  assert.equal(ids.has(short.id), false, "no franchise threshold, no induction");
  ok("league bar: elite 3, or star 8 plus elite 1; ring and the old bars do not induct");
}

{
  const st = newGame({ seed: 41 });
  st.season = 2032;
  const other = st.teams.find((t) => t.id !== st.userTeamId)!.id;
  const [ring, plain] = takePlayers(st, 2);
  retireForLeague(st, ring, { retiredSeason: 2027, teamId: st.userTeamId, elites: 3, titleStarter: true });
  retireForLeague(st, plain, { retiredSeason: 2027, teamId: other, elites: 3 });
  const clas = runHofInduction(st);
  assert.deepEqual(clas.map((e) => e.playerId), [ring.id, plain.id], "the ring still ranks the class");
  ok("a starter ring stays in the score and the tie-break");
}

{
  const st = newGame({ seed: 34 });
  st.season = 2032;
  const [p] = takePlayers(st, 1);
  retireForLeague(st, p, { retiredSeason: 2027, elites: 3 });
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
      stars: 8,
      elites: 1 + i,
    });
  }
  const a = JSON.parse(JSON.stringify(st)) as GameState;
  const b = JSON.parse(JSON.stringify(st)) as GameState;
  const left = runHofInduction(a).map((e) => e.playerId);
  const right = runHofInduction(b).map((e) => e.playerId);
  assert.equal(left.length, HOF_CLASS_MAX);
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
  retireForLeague(st, p, { retiredSeason: 2027, elites: 3 });
  runRecap(st);
  assert.ok((st.hallOfFame ?? []).some((e) => e.playerId === p.id), "runRecap inducts");
  assert.equal(st.phase, "offseason-tag");
  ok("runRecap stamps retirement year and runs induction");
}

{
  const st = newGame({ seed: 37 });
  const [a, b] = takePlayers(st, 2);
  retireForLeague(st, a, { retiredSeason: 2026, elites: 3 });
  retireForLeague(st, b, { retiredSeason: 2027, elites: 3 });
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
  const players = takePlayers(st, 7);
  for (const p of players) retireForLeague(st, p, { retiredSeason: 2027, elites: 3 });
  runHofInduction(st);
  st.season += 1;
  runHofInduction(st);
  st.season += 1;
  const empty = runHofInduction(st);
  assert.equal(empty.length, 0, "a year with nobody qualified writes no class");
  const mean = hofInducteesPerClass(st);
  assert.equal(mean, 3.5, "the mean counts only seasons that inducted someone");
  assert.equal(st.hallOfFame!.filter((e) => e.inductedSeason === 2032).length, 5);
  assert.equal(st.hallOfFame!.filter((e) => e.inductedSeason === 2033).length, 2);
  ok("careers.hofInducteesPerClass stays a mean of non-empty classes");
}

{
  const st = newGame({ seed: 43 });
  st.season = 2032;
  const [kicker, punter] = [takePlayers(st, 1, "K")[0]!, takePlayers(st, 1, "P")[0]!];
  const club = kicker.teamId!;
  const other = punter.teamId!;
  retireForLeague(st, kicker, { retiredSeason: 2027, teamId: club, elites: 10, stars: 10 });
  retireForLeague(st, punter, { retiredSeason: 2027, teamId: other, elites: 3, stars: 8 });
  assert.equal(meetsLeagueHofBar(st, kicker), false, "a kicker does not clear the ordinary bar");
  assert.equal(meetsLeagueHofBar(st, punter), false, "a punter does not clear the ordinary bar");
  assert.equal(isLeagueHofCandidate(st, kicker), true, "eight-plus elite seasons and eight years");
  assert.equal(isLeagueHofCandidate(st, punter), false, "the ordinary elite count is not the specialist bar");
  const ids = new Set(runHofInduction(st).map((e) => e.playerId));
  assert.equal(ids.has(kicker.id), true);
  assert.equal(ids.has(punter.id), false);
  ok("specialist ballot: elite 8 and eight years; ordinary counts do not qualify K or P");
}

{
  const st = newGame({ seed: 44 });
  st.season = 2032;
  const [shortElite, split, waiting] = takePlayers(st, 3, "K");
  const home = shortElite.teamId!;
  const away = st.teams.find((t) => t.id !== home)!.id;
  retireForLeague(st, shortElite, {
    retiredSeason: 2027,
    teamId: home,
    years: yearsEnding(2027, 7),
    elites: 8,
  });
  retireForLeague(st, split, {
    retiredSeason: 2027,
    teamId: home,
    years: [2020, 2021, 2022, 2023],
    elites: 8,
  });
  addSeasons(split, away, [2024, 2025, 2026, 2027]);
  retireForLeague(st, waiting, { retiredSeason: 2028, elites: 8 });
  assert.equal(isLeagueHofCandidate(st, shortElite), false, "seven seasons with one club is short");
  assert.equal(isLeagueHofCandidate(st, split), false, "eight seasons have to be with one club");
  assert.equal(isLeagueHofCandidate(st, waiting), true);
  st.season = 2032;
  assert.equal(isWaitComplete(st, waiting), false, "2028 retirement waits until 2033");
  assert.equal(runHofInduction(st).length, 0);
  st.season = 2033;
  const clas = runHofInduction(st);
  assert.deepEqual(clas.map((e) => e.playerId), [waiting.id]);
  ok("specialist clock and the eight-year club requirement");
}

{
  const st = newGame({ seed: 45 });
  st.season = 2032;
  const kickers = takePlayers(st, 2, "K");
  const punters = takePlayers(st, 1, "P");
  const ordinary = takePlayers(st, 2);
  retireForLeague(st, kickers[0]!, { retiredSeason: 2027, elites: 12, stars: 12 });
  retireForLeague(st, kickers[1]!, { retiredSeason: 2027, elites: 9, stars: 9 });
  retireForLeague(st, punters[0]!, { retiredSeason: 2027, elites: 10, stars: 10 });
  for (const p of ordinary) retireForLeague(st, p, { retiredSeason: 2027, elites: 3 });
  const clas = runHofInduction(st);
  assert.equal(clas.length, 3, "two ordinary plus one specialist, not padded to 5");
  const specs = clas.filter((e) => {
    const p = st.players.find((x) => x.id === e.playerId)!;
    return isHofSpecialist(p);
  });
  assert.equal(specs.length, 1);
  assert.equal(specs[0]!.playerId, kickers[0]!.id, "the higher specialist score takes the seat");
  assert.equal(clas.some((e) => e.playerId === punters[0]!.id), false);
  assert.equal(clas.some((e) => e.playerId === kickers[1]!.id), false);
  st.season += 1;
  const next = runHofInduction(st);
  assert.equal(next.length, 1, "the specialist who waited is not dropped");
  assert.equal(next[0]!.playerId, punters[0]!.id);
  st.season += 1;
  const third = runHofInduction(st);
  assert.deepEqual(third.map((e) => e.playerId), [kickers[1]!.id]);
  ok("at most one specialist, inside the five, and the rest wait");
}

{
  const st = newGame({ seed: 46 });
  st.season = 2032;
  const ordinary = takePlayers(st, 5);
  const [kicker] = takePlayers(st, 1, "K");
  ordinary.forEach((p, i) => {
    const elite = 12 - i;
    retireForLeague(st, p, { retiredSeason: 2027, elites: elite, stars: elite });
  });
  retireForLeague(st, kicker, { retiredSeason: 2027, elites: 8 });
  const clas = runHofInduction(st);
  assert.equal(clas.length, 5);
  assert.equal(clas.some((e) => e.playerId === kicker.id), false, "a specialist outside the five waits");
  st.season += 1;
  const next = runHofInduction(st);
  assert.deepEqual(next.map((e) => e.playerId), [kicker.id]);
  ok("a specialist seat is not reserved ahead of the sort");
}

{
  const st = newGame({ seed: 47 });
  st.season = 2032;
  const kickers = takePlayers(st, 3, "K");
  kickers.forEach((p, i) => {
    retireForLeague(st, p, { retiredSeason: 2027, elites: 10 - i, stars: 10 - i });
  });
  const clas = runHofInduction(st);
  assert.equal(clas.length, 1, "specialists alone do not fill the class");
  assert.equal(clas[0]!.playerId, kickers[0]!.id);
  ok("three qualifying specialists make a class of one");
}

{
  const st = newGame({ seed: 40 });
  const prior = takePlayers(st, 8);
  for (const p of prior) {
    retireForLeague(st, p, { retiredSeason: 2030, titleStarter: true });
  }
  assert.equal(meetsLeagueHofBar(st, prior[0]!), false, "the stored class would miss the new bar");
  const stored: HofEntry[] = prior.map((p) => ({
    playerId: p.id,
    inductedSeason: 2038,
    teamId: st.userTeamId,
    seasons: 8,
    firstSeason: 2023,
    lastSeason: 2030,
    championships: 1,
  }));
  st.hallOfFame = stored;
  const snapshot = JSON.stringify(st.hallOfFame);
  migrate(st);
  assert.equal(JSON.stringify(st.hallOfFame), snapshot, "load does not drop inductees");
  migrate(st);
  assert.equal(JSON.stringify(st.hallOfFame), snapshot, "migrate is idempotent on the hall");
  st.season = 2038;
  assert.equal(runHofInduction(st).length, 0, "a stored class is not reopened");
  assert.equal(st.hallOfFame!.length, 8, "the stored class of 8 is not cut to 5");

  const [next] = takePlayers(st, 1);
  retireForLeague(st, next, { retiredSeason: 2033, elites: 3 });
  const [rejected] = takePlayers(st, 1);
  retireForLeague(st, rejected, { retiredSeason: 2033, titleStarter: true });
  st.season = 2040;
  const clas = runHofInduction(st);
  assert.deepEqual(clas.map((e) => e.playerId), [next.id]);
  assert.equal(st.hallOfFame!.filter((e) => e.inductedSeason === 2038).length, 8);
  assert.equal(st.hallOfFame!.some((e) => e.playerId === rejected.id), false);
  for (const p of prior) {
    assert.equal(st.hallOfFame!.filter((e) => e.playerId === p.id && e.inductedSeason === 2038).length, 1);
  }
  ok("existing inductees stay; a later class uses the new bar");
}

console.log("ok    League Hall of Fame induction");
