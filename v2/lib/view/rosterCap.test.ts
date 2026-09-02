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
  enterDraft, finalizeOffseason, runUdfaChase, simEntireDraft,
} from "../core/offseason";
import { askingPrice, cutPlayer, fillRoster, reconcileRoster, signPlayer } from "../core/offseason/contracts";
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
  assert.equal(hubCampCutdownCopy(camp), "Camp roster 60/90. Cut 7 on /roster before the season, or Start the Season will auto-cut.");
  assert.equal(rosterIssues(st, st.userTeamId).filter((i) => i.kind === "overLimit").length, 0,
    "60/90 camp is not an illegal roster — Auto-fix must not be the only path");

  st.phase = "regular";
  const illegal = rosterCapView(st, st.userTeamId);
  assert.equal(illegal.label, "60/53");
  assert.equal(illegal.overCap, 7);
  assert.ok(rosterIssues(st, st.userTeamId).some((i) => i.kind === "overLimit"));
}

// fillRoster / reconcileRoster in camp do not dump a 60-man club to 53.
{
  const st = newGame({ seed: 2 });
  st.phase = "offseason-final";
  attachExtras(st, 7);
  const rng = new Rng(st.rngState);
  fillRoster(st, st.userTeamId, rng);
  assert.equal(rosterCount(st, st.userTeamId), 60, "camp fill must not trim to 53");
  reconcileRoster(st, st.userTeamId, rng);
  assert.equal(rosterCount(st, st.userTeamId), 60, "camp reconcile must not dump to 53");
  st.rngState = rng.state;

  const extra = st.players.find((p) => p.teamId === st.userTeamId && !p.retired && !p.prospect);
  assert.ok(extra);
  const cut = cutPlayer(st, extra.id);
  assert.equal(cut.ok, true);
  assert.equal(rosterCount(st, st.userTeamId), 59);
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

// Live path: draft + UDFA sits over 53 in camp; cutdown brings every club to 53.
{
  const st = newGame({ seed: 1 });
  enterDraft(st);
  simEntireDraft(st);
  const rng = new Rng(st.rngState);
  runUdfaChase(st, rng);
  st.rngState = rng.state;
  st.phase = "offseason-final";

  const userN = rosterCount(st, st.userTeamId);
  assert.ok(userN > ROSTER_LIMIT, `user camp roster ${userN} should sit over 53`);
  assert.ok(userN <= CAMP_ROSTER_LIMIT, `user camp roster ${userN} over 90`);
  assert.equal(rosterIssues(st, st.userTeamId).filter((i) => i.kind === "overLimit").length, 0);

  const over = st.teams.filter((t) => rosterCount(st, t.id) > ROSTER_LIMIT).length;
  assert.ok(over > 0, "CPU clubs should also sit over 53 after draft + UDFA");
  for (const t of st.teams) {
    assert.ok(rosterCount(st, t.id) <= CAMP_ROSTER_LIMIT, `${t.abbr} over camp cap`);
  }

  const clip = rosterCapView(st, st.userTeamId);
  assert.equal(clip.camp, true);
  assert.equal(clip.cap, CAMP_ROSTER_LIMIT);
  assert.ok(clip.cutdown);
  assert.equal(clip.label, `${userN}/90`);

  finalizeOffseason(st);
  for (const t of st.teams) {
    assert.equal(rosterCount(st, t.id), ROSTER_LIMIT, `${t.abbr} after cutdown`);
  }
  assert.equal(st.phase, "preseason");
  const after = rosterCapView(st, st.userTeamId);
  assert.equal(after.label, "53/53");
  assert.equal(after.cutdown, false);
}

console.log("rosterCap: ok");
