/**
 * Regression: July 15 tag extension sits on the post-draft camp Hub.
 *
 * A tagged player sits on a 1-year tender. Extend replaces it with a
 * multi-year deal; Skip leaves the tender. One attempt. User club is
 * not auto-extended.
 *
 * Run: npx tsx lib/core/tagExtension.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { Rng } from "./rng";
import { freeAgents, isActiveRoster, teamCap } from "./select";
import { LEAGUE_MINIMUM, Player } from "./types";
import {
  applyFranchiseTag, applyTagExtension, expireContracts,
  isTagExtensionEligible, runCpuTagExtensions, skipTagExtension,
  tagExtensionPlayers, tagExtensionTerms,
} from "./offseason/contracts";
import { advanceOffseason, enterCampAfterDraft, enterDraft, simEntireDraft } from "./offseason";

function clubActive(st: ReturnType<typeof newGame>, teamId: number) {
  return st.players.filter((p) => p.teamId === teamId && !p.retired && !p.prospect && isActiveRoster(p));
}

function plantExpiring(st: ReturnType<typeof newGame>, teamId: number): Player {
  const p = clubActive(st, teamId).slice().sort((a, b) => b.ovr - a.ovr)[0];
  assert.ok(p && p.contract, "need a rostered player to plant");
  p.age = 25;
  p.retired = false;
  p.prospect = false;
  p.contract.yearsRemaining = 1;
  p.contract.baseSalary = [p.contract.baseSalary[0] ?? LEAGUE_MINIMUM];
  return p;
}

function plantTagged(st: ReturnType<typeof newGame>, teamId: number): Player {
  const p = plantExpiring(st, teamId);
  const rng = new Rng(st.rngState);
  const tagged = applyFranchiseTag(st, teamId, p.id, rng);
  assert.equal(tagged.ok, true, tagged.reason ?? "tag");
  st.rngState = rng.state;
  return p;
}

function ok(label: string) { console.log("ok   ", label); }

// (1) tagged player can be extended to years > 1 and stays off the next FA.
{
  const st = newGame({ seed: 1 });
  const p = plantTagged(st, st.userTeamId);
  expireContracts(st);
  assert.equal(p.teamId, st.userTeamId);
  assert.ok(p.contract);
  assert.equal(p.contract.years, 1);

  assert.equal(isTagExtensionEligible(st, p), true);
  const terms = tagExtensionTerms(st, st.userTeamId, p);
  assert.ok(terms.years > 1);
  const rng = new Rng(st.rngState);
  const extended = applyTagExtension(st, st.userTeamId, p.id, rng);
  assert.equal(extended.ok, true, extended.reason ?? "extend");
  st.rngState = rng.state;
  assert.ok(p.contract);
  assert.ok(p.contract.years > 1, "extension must be multi-year");
  assert.equal(p.contract.yearsRemaining, p.contract.years);
  assert.equal(p.teamId, st.userTeamId);
  assert.equal(isTagExtensionEligible(st, p), false);

  expireContracts(st);
  assert.equal(p.teamId, st.userTeamId, "extended player must not expire this year");
  st.season += 1;
  expireContracts(st);
  assert.equal(p.teamId, st.userTeamId, "extended player must stay off the next FA");
  assert.ok(p.contract);
  assert.ok(p.contract.yearsRemaining >= 1);
  assert.equal(freeAgents(st).some((x) => x.id === p.id), false);
  ok("extend keeps him off the next FA");
}

// (2) skip → still on the 1-year tender.
{
  const st = newGame({ seed: 2 });
  const p = plantTagged(st, st.userTeamId);
  expireContracts(st);
  const skipped = skipTagExtension(st, st.userTeamId, p.id);
  assert.equal(skipped.ok, true, skipped.reason ?? "skip");
  assert.ok(p.contract);
  assert.equal(p.contract.years, 1);
  assert.equal(p.contract.yearsRemaining, 1);
  assert.equal(p.teamId, st.userTeamId);
  assert.equal(isTagExtensionEligible(st, p), false);
  ok("skip leaves the 1-year tender");
}

// One attempt per tagged player.
{
  const st = newGame({ seed: 3 });
  const p = plantTagged(st, st.userTeamId);
  expireContracts(st);
  const rng = new Rng(st.rngState);
  assert.equal(applyTagExtension(st, st.userTeamId, p.id, rng).ok, true);
  const again = applyTagExtension(st, st.userTeamId, p.id, rng);
  assert.equal(again.ok, false);
  assert.match(again.reason ?? "", /already decided/i);
  ok("one attempt");
}

// Untagged veteran is not on the desk.
{
  const st = newGame({ seed: 4 });
  const p = plantExpiring(st, st.userTeamId);
  assert.equal(isTagExtensionEligible(st, p), false);
  assert.equal(tagExtensionPlayers(st, st.userTeamId).some((x) => x.id === p.id), false);
  const rng = new Rng(st.rngState);
  const r = applyTagExtension(st, st.userTeamId, p.id, rng);
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /tagged player/i);
  ok("untagged veteran is not eligible");
}

// (3) nobody tagged → empty desk, camp still advances.
{
  const st = newGame({ seed: 10 });
  st.phase = "offseason-draft";
  enterDraft(st);
  simEntireDraft(st);
  const rng = new Rng(st.rngState);
  enterCampAfterDraft(st, rng);
  st.rngState = rng.state;
  assert.equal(st.phase, "offseason-final");
  assert.equal(tagExtensionPlayers(st, st.userTeamId).length, 0);
  const msg = advanceOffseason(st);
  assert.equal(st.phase, "preseason", msg);
  ok("empty desk, camp advances");
}

// (4) cap block uses the same Sign-shaped reason.
{
  const st = newGame({ seed: 6 });
  const p = plantTagged(st, st.userTeamId);
  expireContracts(st);
  st.teams[st.userTeamId].deadCap = teamCap(st, st.userTeamId).cap;
  const rng = new Rng(st.rngState);
  const blocked = applyTagExtension(st, st.userTeamId, p.id, rng);
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason ?? "", /Not enough cap space/);
  assert.ok(p.contract);
  assert.equal(p.contract.years, 1);
  assert.equal(p.contract.yearsRemaining, 1);
  ok("cap block");
}

// (5) CPU does not auto-extend the user club.
{
  const st = newGame({ seed: 7 });
  const user = plantTagged(st, st.userTeamId);
  expireContracts(st);
  for (const t of st.teams) {
    if (t.id === st.userTeamId) continue;
    const p = plantExpiring(st, t.id);
    const rng = new Rng(st.rngState);
    applyFranchiseTag(st, t.id, p.id, rng);
    st.rngState = rng.state;
  }
  const rng = new Rng(st.rngState);
  runCpuTagExtensions(st, rng);
  assert.equal(isTagExtensionEligible(st, user), true, "user club is not auto-extended");
  assert.equal((st.tagExtensions ?? []).some((e) => e.teamId === st.userTeamId), false);
  for (const e of st.tagExtensions ?? []) {
    assert.notEqual(e.teamId, st.userTeamId);
    if (e.extended) assert.ok(teamCap(st, e.teamId).space >= 0, `club ${e.teamId} over the cap`);
  }
  ok("CPU skips the user club");
}

// Old saves missing tagExtensions still load and keep the 1-year tender.
{
  const st = newGame({ seed: 8 });
  delete st.tagExtensions;
  const raw = JSON.parse(JSON.stringify(st)) as typeof st;
  assert.ok(!("tagExtensions" in raw) || raw.tagExtensions === undefined);
  const p = plantTagged(raw, raw.userTeamId);
  expireContracts(raw);
  assert.equal(p.teamId, raw.userTeamId);
  assert.ok(p.contract);
  assert.equal(p.contract.years, 1);
  ok("old saves load");
}

// (6) Headless recap → tag → FA → draft → camp still reaches cutdown.
{
  const st = newGame({ seed: 9 });
  // Year-0 recap with no Super Bowl writes champion/runner-up -1, and
  // draftOrder then injects phantom picks. Plant a played SB so the
  // calendar path is the one a finished season takes.
  st.playoffs = { seeds: [], round: "SB", complete: true, championId: 0 };
  st.games.push({
    id: st.nextGameId++,
    season: st.season,
    week: 22,
    homeId: 0,
    awayId: 1,
    played: true,
    homeScore: 24,
    awayScore: 17,
    playoffRound: "SB",
    boxScore: null,
  });
  st.phase = "offseason-recap";
  const msg1 = advanceOffseason(st);
  assert.equal(st.phase, "offseason-tag", msg1);
  const msg2 = advanceOffseason(st);
  assert.equal(st.phase, "offseason-fa", msg2);
  const msg3 = advanceOffseason(st);
  assert.equal(st.phase, "offseason-draft", msg3);
  const msg4 = advanceOffseason(st);
  assert.equal(st.phase, "offseason-final", msg4);
  assert.equal((st.tagExtensions ?? []).some((e) => e.teamId === st.userTeamId), false);
  const msg5 = advanceOffseason(st);
  assert.equal(st.phase, "preseason", msg5);
  ok("headless recap→camp reaches cutdown");
}
