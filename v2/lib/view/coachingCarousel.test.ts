/**
 * Coaching carousel on the franchise-tag hub.
 *
 * Firings and hires are the log lines the carousel already wrote.
 * A contract expiry is not a firing. Nothing here draws.
 *
 * Run: npx tsx lib/view/coachingCarousel.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fireCoach, fireCpuHeadCoaches, hireCoach, roleLabel, runCoachCarousel, tickCoachContracts } from "../core/coaches";
import { newGame } from "../core/newGame";
import { ensureOwners } from "../core/owner";
import { blankRecord } from "../core/select";
import { GameState } from "../core/types";
import { coachingCarouselMoves } from "./coachingCarousel";

function ok(label: string) { console.log("ok   ", label); }

function cpuClub(st: GameState) {
  return st.teams.find((t) => t.id !== st.userTeamId)!;
}

function blankYear(st: GameState, season: number, winsFor: (teamId: number) => number) {
  st.history.push({
    season,
    championId: st.userTeamId === 0 ? 1 : 0,
    runnerUpId: st.userTeamId === 1 ? 2 : 1,
    standings: st.teams.map((t) => {
      const w = winsFor(t.id);
      const r = blankRecord(t.id);
      r.w = w;
      r.l = 17 - w;
      r.expectedWins = 8;
      return r;
    }),
    awards: { mvp: null, opoy: null, dpoy: null, roy: null },
    leaders: { passYds: null, rushYds: null, recYds: null, sacks: null },
  });
}

{
  const st = newGame({ seed: 11 });
  assert.equal(coachingCarouselMoves(st), null, "preseason has no carousel block");
  st.phase = "offseason-recap";
  assert.equal(coachingCarouselMoves(st), null, "the block is the tag hub");
  st.phase = "offseason-tag";
  assert.deepEqual(coachingCarouselMoves(st), [], "an empty log is an empty carousel");
  ok("carousel is the franchise-tag window only");
}

{
  const st = newGame({ seed: 12 });
  ensureOwners(st);
  st.week = 22;
  const cpu = cpuClub(st);
  cpu.owner!.patience = 0.55;
  const hc = cpu.coaches!.hc!;
  hc.hiredSeason = st.season - 1;
  hc.yearsRemaining = 4;
  for (const t of st.teams) {
    if (t.coaches?.hc && t.id !== cpu.id) t.coaches.hc.yearsRemaining = 4;
  }
  blankYear(st, st.season - 1, (id) => (id === cpu.id ? 3 : 14));
  const firedName = hc.name;
  const parent = st.rngState;
  const n = fireCpuHeadCoaches(st);
  assert.equal(n, 1, "planted 3-win year fires one head coach");
  tickCoachContracts(st);
  runCoachCarousel(st);
  st.phase = "offseason-tag";
  const moves = coachingCarouselMoves(st);
  assert.ok(moves, "tag hub returns the list");
  assert.equal(st.rngState, parent, "reading the carousel does not draw");
  const firing = moves!.find((m) => m.action === "fired" && m.coach === firedName);
  assert.ok(firing, "the fired head coach is on the block");
  assert.equal(firing!.role, "hc");
  assert.equal(firing!.club, `${cpu.city} ${cpu.name}`);
  assert.equal(firing!.chair, "Head coach");
  const hires = moves!.filter((m) => m.action === "hired");
  assert.ok(hires.length > 0, "the carousel's hires are on the block");
  assert.ok(st.log.some((e) => e.text.includes("contract expire")), "the tick did let contracts expire");
  for (const m of moves!) {
    const line = st.log.find((e) => e.week === st.week && e.season === st.season && e.text.includes(m.coach) && (e.text.includes(`fired ${roleLabel(m.role)}`) || e.text.includes(`hired ${m.coach} as`)));
    assert.ok(line, `${m.coach} is a fire or a hire`);
    assert.equal(line!.text.includes("contract expire"), false);
  }
  ok("tag hub lists this offseason's fires and hires, not expiries");
}

{
  const st = newGame({ seed: 13 });
  st.phase = "offseason-tag";
  st.week = 22;
  st.season = 2026;
  const club = st.teams[st.userTeamId];
  const other = cpuClub(st);
  st.log.push(
    {
      season: 2026, week: 8, kind: "transaction",
      text: `The ${club.city} ${club.name} fired ${roleLabel("oc")} In Season.`,
    },
    {
      season: 2026, week: 22, kind: "transaction",
      text: `The ${other.city} ${other.name} let ${roleLabel("dc")} Pat Expire's contract expire.`,
    },
    {
      season: 2026, week: 22, kind: "transaction",
      text: `The ${other.city} ${other.name} fired ${roleLabel("hc")} Ada Fired.`,
    },
    {
      season: 2025, week: 22, kind: "transaction",
      text: `The ${other.city} ${other.name} hired Old Hire as ${roleLabel("hc")}.`,
    },
    {
      season: 2026, week: 22, kind: "transaction",
      text: `The ${club.city} ${club.name} hired Poached Coach as head coach, poaching him from the ${other.city} ${other.name}.`,
    },
    {
      season: 2026, week: 22, kind: "milestone",
      text: `Hired as general manager of the ${club.city} ${club.name}.`,
    },
  );
  const moves = coachingCarouselMoves(st)!;
  assert.equal(moves.length, 2, "in-season fires, expiries, and last year's hires stay off");
  assert.equal(moves[0].action, "fired");
  assert.equal(moves[0].coach, "Ada Fired");
  assert.equal(moves[0].chair, "Head coach");
  assert.equal(moves[1].action, "hired");
  assert.equal(moves[1].coach, "Poached Coach");
  assert.equal(moves[1].role, "hc");
  assert.equal(moves[1].fromClub, `${other.city} ${other.name}`);
  ok("the block is this week, this season, fires and hires only");
}

{
  const st = newGame({ seed: 14 });
  st.phase = "offseason-tag";
  st.week = 4;
  const club = st.teams[st.userTeamId];
  const oc = club.coaches!.oc!;
  const parent = st.rngState;
  const release = st.log.length;
  const r = fireCoach(st, club.id, "oc");
  assert.equal(r.ok, true);
  const hire = hireCoach(st, club.id, oc.id, "oc");
  assert.equal(hire.ok, true);
  assert.equal(st.rngState, parent, "the desk did not move the parent stream");
  const moves = coachingCarouselMoves(st)!;
  assert.equal(moves.length, st.log.length - release);
  assert.deepEqual(moves.map((m) => m.action), ["fired", "hired"]);
  assert.equal(moves[0].role, "oc");
  assert.equal(moves[0].chair, "Offensive coordinator");
  assert.equal(moves[1].coach, oc.name);
  ok("a tag-window coordinator fire and hire are on the block");
}

{
  const hub = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
  assert.match(hub, /coachingCarouselMoves/);
  assert.match(hub, /Coaching Carousel/);
  ok("the franchise-tag hub renders the carousel block");
}

console.log("ok    coaching carousel");
