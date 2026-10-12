/**
 * In-season owner card: pace against the full-season bar.
 * Playoffs and Season Review keep the actual record.
 * `ownerJudgment` is not in this path.
 *
 * Run: npx tsx lib/view/ownerPace.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { newGame } from "../core/newGame";
import { ownerJobView, ownerJudgment } from "../core/owner";
import { blankRecord } from "../core/select";
import { GAMES_PER_TEAM, GameState } from "../core/types";
import { ownerCardPace, ownerMarginSub, paceLabel, roundPace, winPace } from "./ownerPace";

function ok(label: string) { console.log("ok   ", label); }

function close(actual: number, expected: number, label: string) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} vs ${expected}`);
}

function plantLive(
  st: GameState,
  teamId: number,
  wins: number,
  losses: number,
  ties = 0,
): void {
  const opp = st.teams.find((t) => t.id !== teamId)!;
  let id = st.games.reduce((m, g) => Math.max(m, g.id), 0);
  const push = (homeScore: number, awayScore: number, week: number) => {
    id += 1;
    st.games.push({
      id,
      season: st.season,
      week,
      homeId: teamId,
      awayId: opp.id,
      played: true,
      homeScore,
      awayScore,
      playoffRound: null,
      boxScore: null,
    });
  };
  for (let i = 0; i < wins; i++) push(24, 10, i + 1);
  for (let i = 0; i < losses; i++) push(10, 24, wins + i + 1);
  for (let i = 0; i < ties; i++) push(17, 17, wins + losses + i + 1);
}

function plantYear(st: GameState, season: number, wins: number, expected: number): void {
  st.history.push({
    season,
    championId: st.userTeamId === 0 ? 1 : 0,
    runnerUpId: st.userTeamId === 1 ? 2 : 1,
    standings: st.teams.map((t) => {
      const w = t.id === st.userTeamId ? wins : 12;
      const r = blankRecord(t.id);
      r.w = w;
      r.l = 17 - w;
      r.expectedWins = t.id === st.userTeamId ? expected : 10;
      return r;
    }),
    awards: { mvp: null, opoy: null, dpoy: null, roy: null },
    leaders: { passYds: null, rushYds: null, recYds: null, sacks: null },
  });
}

{
  assert.equal(GAMES_PER_TEAM, 17);
  close(winPace(4, 6)!, 4 * 17 / 6, "4 wins in 6 games");
  close(winPace(3, 4)!, 3 * 17 / 4, "3 wins in 4 games");
  close(winPace(1.5, 2)!, 1.5 * 17 / 2, "a tie is half a win");
  close(winPace(8, 8)!, 17, "8-0 is on pace for 17");
  assert.equal(winPace(4, 0), null, "zero games does not divide");
  assert.equal(winPace(0, 0), null, "0-0 does not divide");
  assert.equal(winPace(0, -1), null);

  assert.equal(roundPace(4 * 17 / 6), 11.3);
  assert.equal(roundPace(3 * 17 / 4), 12.8);
  assert.equal(roundPace(17), 17);
  assert.equal(roundPace(8.5), 8.5);
  assert.equal(paceLabel(4 * 17 / 6), "on pace for 11.3");
  assert.equal(paceLabel(17), "on pace for 17");
  assert.equal(paceLabel(8.5), "on pace for 8.5");
  ok("pace math: wins × 17 / games, tenth label, zero games guarded");
}

{
  const st = newGame({ seed: 401 });
  st.settings = { ...(st.settings!), firingEnabled: true };
  const team = st.teams[st.userTeamId];
  team.owner!.patience = 0.55;
  team.gmHiredSeason = st.season;
  team.seasonExpectedWins = 8;
  st.phase = "regular";
  const parent = st.rngState;

  const before = ownerJobView(st, st.userTeamId)!;
  const kickoff = ownerCardPace(st, st.userTeamId, before);
  assert.equal(kickoff.label, null, "0-0 has no pace label");
  assert.equal(kickoff.pace, null);
  close(kickoff.margin, before.margin, "0-0 keeps the actual margin");
  assert.equal(ownerMarginSub(before, kickoff).includes("on pace"), false);

  plantLive(st, st.userTeamId, 4, 2);
  const job = ownerJobView(st, st.userTeamId)!;
  const judged = ownerJudgment(0.55, [4], [8], true);
  close(job.margin, judged.margin, "judgment margin stays on 4 raw wins");
  close(job.weightedWins, judged.weightedWins, "judgment weight stays on 4 raw wins");
  assert.equal(job.wouldFire, judged.wouldFire);
  assert.equal(job.recentWins, 4);

  const pace = ownerCardPace(st, st.userTeamId, job);
  const projected = 4 * 17 / 6;
  close(pace.pace!, projected, "unrounded pace");
  close(pace.weightedWins, projected, "one season is the pace itself");
  close(pace.margin, projected - job.bar, "margin is the pace against the bar");
  assert.equal(pace.label, "on pace for 11.3");
  assert.equal(
    ownerMarginSub(job, pace),
    `bar ${job.bar.toFixed(1)} · margin ${pace.margin.toFixed(1)} · on pace for 11.3`,
  );
  assert.ok(pace.margin !== job.margin, "the card margin is not the raw-win margin");
  assert.equal(st.rngState, parent, "the pace read does not draw");

  st.phase = "playoffs";
  const postJob = ownerJobView(st, st.userTeamId)!;
  const post = ownerCardPace(st, st.userTeamId, postJob);
  assert.equal(post.label, null, "playoffs drop the pace label");
  assert.equal(post.pace, null);
  close(post.margin, postJob.margin, "playoffs keep the actual margin");
  close(post.weightedWins, postJob.weightedWins, "playoffs keep the actual weight");
  assert.equal(postJob.recentWins, 4, "playoffs keep the actual wins");
  assert.equal(ownerMarginSub(postJob, post), `bar ${postJob.bar.toFixed(1)} · margin ${postJob.margin.toFixed(1)}`);
  assert.equal(ownerMarginSub(postJob, post).includes("on pace"), false);

  st.phase = "offseason-recap";
  const reviewJob = ownerJobView(st, st.userTeamId)!;
  const review = ownerCardPace(st, st.userTeamId, reviewJob);
  assert.equal(review.label, null, "Season Review drops the pace label");
  close(review.margin, reviewJob.margin, "Season Review keeps the actual margin");
  assert.equal(reviewJob.recentWins, 4, "Season Review keeps the actual wins");
  assert.equal(
    ownerMarginSub(reviewJob, review),
    `bar ${reviewJob.bar.toFixed(1)} · margin ${reviewJob.margin.toFixed(1)}`,
  );
  assert.equal(ownerJudgment(0.55, [4], [8], true).wouldFire, reviewJob.wouldFire);
  ok("label switches: in-season pace, playoffs and Season Review keep the record");
}

{
  const st = newGame({ seed: 402 });
  st.settings = { ...(st.settings!), firingEnabled: true };
  const team = st.teams[st.userTeamId];
  team.owner!.patience = 0.55;
  team.gmHiredSeason = st.season - 1;
  team.seasonExpectedWins = 10;
  plantYear(st, st.season - 1, 8, 10);
  st.phase = "regular";
  plantLive(st, st.userTeamId, 3, 1);
  const job = ownerJobView(st, st.userTeamId)!;
  const judged = ownerJudgment(0.55, [8, 3], [10, 10], true);
  close(job.margin, judged.margin, "two-season judgment stays on raw wins");
  assert.equal(job.wouldFire, judged.wouldFire);
  assert.equal(job.recentWins, 3);

  const pace = ownerCardPace(st, st.userTeamId, job);
  const projected = 3 * 17 / 4;
  const weighted = projected * 0.6 + 8 * 0.4;
  close(pace.pace!, projected, "current season is the pace");
  close(pace.weightedWins, weighted, "prior season stays actual in the 60/40");
  close(pace.margin, weighted - job.bar, "margin uses the paced weight");
  assert.equal(pace.label, "on pace for 12.8");
  assert.equal(ownerMarginSub(job, pace).endsWith("· on pace for 12.8"), true);

  st.phase = "playoffs";
  const postJob = ownerJobView(st, st.userTeamId)!;
  const post = ownerCardPace(st, st.userTeamId, postJob);
  assert.equal(post.label, null);
  close(post.margin, judged.margin, "playoffs margin is the raw two-season margin");
  assert.equal(postJob.recentWins, 3);

  st.phase = "offseason-recap";
  const review = ownerCardPace(st, st.userTeamId, ownerJobView(st, st.userTeamId)!);
  assert.equal(review.label, null);
  close(review.margin, judged.margin, "Season Review margin is the raw two-season margin");
  ok("a prior season stays in the weight; only the live year is paced");
}

{
  const st = newGame({ seed: 403 });
  st.settings = { ...(st.settings!), firingEnabled: true };
  const team = st.teams[st.userTeamId];
  team.owner!.patience = 0.55;
  team.gmHiredSeason = st.season;
  team.seasonExpectedWins = 8;
  st.phase = "regular";
  plantLive(st, st.userTeamId, 1, 0, 1);
  const job = ownerJobView(st, st.userTeamId)!;
  const pace = ownerCardPace(st, st.userTeamId, job);
  close(job.recentWins!, 1.5, "the judgment counts the tie as half a win");
  close(pace.pace!, 1.5 * 17 / 2, "the pace uses that same win");
  assert.equal(pace.label, "on pace for 12.8");
  ok("a tie counts half a win in the pace");
}

{
  const staff = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../app/staff/page.tsx"), "utf8");
  assert.match(staff, /ownerCardPace/);
  assert.match(staff, /ownerMarginSub/);
  assert.match(staff, /pace\.weightedWins/);
  assert.equal(staff.includes("job.margin.toFixed"), false, "the card prints the pace margin, not the raw one");
  ok("the staff card prints the pace margin and its label");
}

console.log("ok    owner card pace");
