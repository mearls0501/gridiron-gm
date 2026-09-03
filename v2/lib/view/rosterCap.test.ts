/**
 * Regression: training-camp holding cap vs the 53-man season roster.
 *
 * Playtest (GM Playtest year 0901): draft + UDFA dumped onto a 53-man
 * ROSTER_LIMIT. Hub Auto-fix (reconcileRoster) was the only cutdown.
 * Real camp is 90 then one cut to 53.
 *
 * Run: npx tsx lib/view/rosterCap.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "../core/newGame";
import {
  enterDraft, enterCampAfterDraft, finalizeOffseason, simEntireDraft,
} from "../core/offseason";
import { askingPrice, cutPlayer, fillRoster, reconcileRoster, signPlayer } from "../core/offseason/contracts";
import { signUdfa, UDFA_SIGNINGS_MAX } from "../core/offseason/draft";
import { makeContract } from "../core/generate";
import { Rng } from "../core/rng";
import { rosterCount, rosterIssues } from "../core/select";
import {
  CAMP_ROSTER_LIMIT, LEAGUE_MINIMUM, Phase, ROSTER_LIMIT, isCampPhase, rosterLimit,
} from "../core/types";
import { hubCampCutdownCopy, rosterCapView } from "./rosterCap";

function attachExtras(st: ReturnType<typeof newGame>, n: number): void {
  const fas = st.players.filter((p) => p.teamId === null && !p.retired && !p.prospect);
  assert.ok(fas.length >= n, `need ${n} free agents to plant extras`);
  const rng = new Rng(st.rngState);
  for (let i = 0; i < n; i++) {
    fas[i].teamId = st.userTeamId;
    fas[i].contract = makeContract(rng, LEAGUE_MINIMUM, 1, st.season, 0);
  }
  st.rngState = rng.state;
}

// Phase ceiling: 90 in camp, 53 everywhere else.
{
  const camp: Phase[] = ["offseason-draft", "offseason-final"];
  const season: Phase[] = ["preseason", "regular", "playoffs", "offseason-recap", "offseason-fa"];
  for (const p of camp) {
    assert.equal(isCampPhase(p), true, p);
    assert.equal(rosterLimit(p), CAMP_ROSTER_LIMIT);
  }
  for (const p of season) {
    assert.equal(isCampPhase(p), false, p);
    assert.equal(rosterLimit(p), ROSTER_LIMIT);
  }
  assert.equal(CAMP_ROSTER_LIMIT, 90);
  assert.equal(ROSTER_LIMIT, 53);
}

// Clipboard: 60/90 in camp is legal; 60/53 in season is over.
{
  const st = newGame({ seed: 1 });
  assert.equal(rosterCount(st, st.userTeamId), ROSTER_LIMIT);
  const season = rosterCapView(st, st.userTeamId);
  assert.equal(season.label, "53/53");
  assert.equal(season.camp, false);
  assert.equal(season.cutdown, false);
  assert.equal(season.tone, "good");
  assert.equal(rosterIssues(st, st.userTeamId).filter((i) => i.kind === "overLimit").length, 0);

  st.phase = "offseason-final";
  attachExtras(st, 7);
  assert.equal(rosterCount(st, st.userTeamId), 60);

  const camp = rosterCapView(st, st.userTeamId);
  assert.equal(camp.label, "60/90");
  assert.equal(camp.camp, true);
  assert.equal(camp.cutdown, true);
  assert.equal(camp.overSeason, 7);
  assert.equal(camp.overCap, 0);
  assert.match(camp.sub, /7 over the 53-man season roster — cut or keep/);
  assert.equal(hubCampCutdownCopy(camp), "Camp roster 60/90. Cut 7 on /roster before the season, or Start the Season will auto-cut to 53 (extras pass waivers; unclaimed may land on the practice squad).");
  assert.equal(rosterIssues(st, st.userTeamId).filter((i) => i.kind === "overLimit").length, 0,
    "60/90 camp is not an illegal roster — Auto-fix must not be the only path");

  st.phase = "regular";
  const illegal = rosterCapView(st, st.userTeamId);
  assert.equal(illegal.label, "60/53");
  assert.equal(illegal.overCap, 7);
  assert.ok(rosterIssues(st, st.userTeamId).some((i) => i.kind === "overLimit"));
}

// fillRoster / reconcileRoster in camp do not dump a 60-man club to 53.
// Camp fill may grow toward 90 from the street; it must not cut down.
{
  const st = newGame({ seed: 2 });
  st.phase = "offseason-final";
  attachExtras(st, 7);
  const rng = new Rng(st.rngState);
  fillRoster(st, st.userTeamId, rng);
  const afterFill = rosterCount(st, st.userTeamId);
  assert.ok(afterFill >= 60, `camp fill trimmed to ${afterFill}`);
  assert.ok(afterFill <= CAMP_ROSTER_LIMIT, `camp fill ${afterFill} over 90`);
  reconcileRoster(st, st.userTeamId, rng);
  const afterRec = rosterCount(st, st.userTeamId);
  assert.ok(afterRec >= 60, `camp reconcile dumped to ${afterRec}`);
  assert.ok(afterRec <= CAMP_ROSTER_LIMIT);
  st.rngState = rng.state;

  const extra = st.players.find((p) => p.teamId === st.userTeamId && !p.retired && !p.prospect);
  assert.ok(extra);
  const cut = cutPlayer(st, extra.id);
  assert.equal(cut.ok, true);
  assert.equal(rosterCount(st, st.userTeamId), afterRec - 1);
}

// Season reconcile still locks 53.
{
  const st = newGame({ seed: 3 });
  st.phase = "offseason-final";
  attachExtras(st, 7);
  const rng = new Rng(st.rngState);
  reconcileRoster(st, st.userTeamId, rng, ROSTER_LIMIT);
  assert.equal(rosterCount(st, st.userTeamId), ROSTER_LIMIT);
}

// signPlayer uses the phase ceiling.
{
  const st = newGame({ seed: 4 });
  const fa = st.players
    .filter((p) => p.teamId === null && !p.retired && !p.prospect)
    .sort((a, b) => a.ovr - b.ovr)[0];
  assert.ok(fa);
  const rng = new Rng(st.rngState);
  const apy = askingPrice(st, fa);
  const seasonRefuse = signPlayer(st, fa.id, st.userTeamId, 1, apy, rng);
  assert.equal(seasonRefuse.ok, false);
  assert.match(seasonRefuse.reason ?? "", /53/);

  st.phase = "offseason-final";
  const campOk = signPlayer(st, fa.id, st.userTeamId, 1, apy, rng);
  assert.equal(campOk.ok, true, campOk.reason ?? "sign should succeed in camp");
  assert.equal(rosterCount(st, st.userTeamId), 54);
}

// Live path: draft + UDFA + camp fill sits toward 90; cutdown still locks 53.
{
  const st = newGame({ seed: 1 });
  enterDraft(st);
  simEntireDraft(st);
  const rng = new Rng(st.rngState);
  const leftover = st.players.filter((p) => p.prospect && p.teamId === null);
  assert.ok(leftover.length >= 5, "need undrafted names for the board-cap check");
  for (let i = 0; i < UDFA_SIGNINGS_MAX; i++) {
    assert.equal(signUdfa(st, st.userTeamId, leftover[i].id, rng), true, `UDFA ${i + 1} should sign`);
  }
  assert.equal(signUdfa(st, st.userTeamId, leftover[UDFA_SIGNINGS_MAX].id, rng), false,
    "board Sign stays capped at 4");
  assert.equal(UDFA_SIGNINGS_MAX, 4);
  enterCampAfterDraft(st, rng);
  st.rngState = rng.state;

  const userN = rosterCount(st, st.userTeamId);
  assert.ok(userN > 60, `user camp roster ${userN} should sit well above 53 toward 90`);
  assert.ok(userN <= CAMP_ROSTER_LIMIT, `user camp roster ${userN} over 90`);
  assert.ok(userN !== 43 && userN !== 53, `user camp stuck at ${userN}`);
  assert.equal(rosterIssues(st, st.userTeamId).filter((i) => i.kind === "overLimit").length, 0);

  const over = st.teams.filter((t) => rosterCount(st, t.id) > ROSTER_LIMIT).length;
  assert.equal(over, 32, "every club should sit over 53 after camp fill");
  for (const t of st.teams) {
    const n = rosterCount(st, t.id);
    assert.ok(n > 60, `${t.abbr} camp ${n} not toward 90`);
    assert.ok(n <= CAMP_ROSTER_LIMIT, `${t.abbr} over camp cap`);
  }

  const clip = rosterCapView(st, st.userTeamId);
  assert.equal(clip.camp, true);
  assert.equal(clip.cap, CAMP_ROSTER_LIMIT);
  assert.ok(clip.cutdown);
  assert.equal(clip.label, `${userN}/90`);

  const extras = st.teams.reduce((n, t) => n + Math.max(0, rosterCount(st, t.id) - ROSTER_LIMIT), 0);
  const logAt = st.log.length;
  finalizeOffseason(st);
  const waived = st.log.slice(logAt).filter((e) => e.text.includes(" waived ")).length;
  assert.ok(waived >= extras, `cutdown extras must hit waivers; waived=${waived} extras=${extras}`);
  assert.ok((st.waivers?.length ?? 0) < 120, `Start the Season must settle the claim chain; wire=${st.waivers?.length ?? 0}`);
  for (const t of st.teams) {
    assert.equal(rosterCount(st, t.id), ROSTER_LIMIT, `${t.abbr} after cutdown`);
  }
  assert.equal(st.phase, "preseason");
  const after = rosterCapView(st, st.userTeamId);
  assert.equal(after.label, "53/53");
  assert.equal(after.cutdown, false);
}

console.log("rosterCap: ok");
