/**
 * Scouting fog on the draft room and the player page.
 *
 * A drafted player is no longer a prospect, and Recent picks was printing
 * his real overall whoever took him. A future class has not had a combine;
 * the player page and the future card were printing that sheet.
 *
 * Run: npx tsx lib/view/scoutFog.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { campusForty, futureClassRows, isFutureProspect } from "../core/futureClass";
import { newGame } from "../core/newGame";
import { enterDraft, simToUserPick } from "../core/offseason";
import { availableProspects, isUserOnClock, makePick } from "../core/offseason/draft";
import { presentedOvr } from "../core/ratings";
import { Rng } from "../core/rng";
import { boardGrade, consensusGrade, gradeContext } from "../core/scouting-reports";
import { Player } from "../core/types";
import {
  combineSheetPublic,
  prospectTesting,
  prospectTestingText,
  recentPickSlots,
  recentPickText,
} from "./scoutFog";

function leaksRating(text: string, p: Player): string | null {
  if (/\bOVR\b/i.test(text)) return "overall";
  if (/potential/i.test(text)) return "potential";
  if (/\d+-\d+/.test(text)) return "band";
  const shown = String(presentedOvr(p.pos, p.ovr));
  if (text === shown || text.split(/\s+/).includes(shown)) return "rating";
  return null;
}

{
  const draft = readFileSync(new URL("../../app/draft/page.tsx", import.meta.url), "utf8");
  const recent = draft.slice(draft.indexOf('title="Recent picks"'));
  assert.ok(recent.includes("recentPickSlots"));
  assert.equal(recent.includes("presentedOvr"), false);
  assert.equal(recent.includes("displayedOvr"), false);
  assert.equal(recent.includes("OvrBadge"), false);
  assert.equal(recent.includes('"OVR"'), false);
  assert.equal(draft.includes("presentedOvr"), false);
  assert.equal(draft.includes("OvrBadge"), false);

  const player = readFileSync(new URL("../../app/player/[id]/page.tsx", import.meta.url), "utf8");
  assert.ok(player.includes("prospectTesting"));
  assert.equal(player.includes("profile.combine"), false);
  assert.equal(player.includes("combine.forty"), false);
  assert.equal(player.includes("combine.vertical"), false);
  assert.equal(player.includes("combine.bench"), false);

  const futureSrc = readFileSync(new URL("../core/futureClass.ts", import.meta.url), "utf8");
  assert.ok(futureSrc.includes("campusForty(p)"));
  assert.equal(futureSrc.includes("combine.forty.toFixed"), false);
}

{
  const st = newGame({ seed: 42, userTeamId: 0 });
  enterDraft(st);
  assert.ok(st.draft);
  let guard = 0;
  while (guard++ < 8) {
    const cpu = st.draft.picks.some((p) => p.playerId !== null && p.teamId !== st.userTeamId);
    const own = st.draft.picks.some((p) => p.playerId !== null && p.teamId === st.userTeamId);
    if (cpu && own) break;
    if (isUserOnClock(st)) {
      const rng = new Rng(st.rngState);
      const pool = availableProspects(st, st.season);
      assert.ok(pool[0], "need a prospect on the clock");
      assert.ok(makePick(st, pool[0].id, rng));
      st.rngState = rng.state;
    } else {
      simToUserPick(st);
    }
  }
  const made = st.draft.picks.filter((p) => p.playerId !== null);
  const cpuPicks = made.filter((p) => p.teamId !== st.userTeamId);
  const userPicks = made.filter((p) => p.teamId === st.userTeamId);
  assert.ok(cpuPicks.length > 0, "need a CPU pick");
  assert.ok(userPicks.length > 0, "need a user pick");

  const rngBefore = st.rngState;
  const season = st.draft.season;
  const pool = st.players.filter((q) => !q.retired && q.draftClassSeason === season);
  const ctx = gradeContext(st, pool);

  for (const pick of [...cpuPicks, ...userPicks]) {
    const p = st.players.find((q) => q.id === pick.playerId);
    assert.ok(p);
    const text = recentPickText(st, p);
    const slots = recentPickSlots(st, p);
    assert.equal(leaksRating(text, p), null, `${p.lastName} rendered ${leaksRating(text, p)}: ${text}`);
    assert.equal(slots.board, boardGrade(st, p, ctx).label);
    assert.equal(slots.consensus, consensusGrade(st, p, ctx).label);
    assert.equal(text, `${slots.board} ${slots.consensus}`);
    assert.notEqual(slots.board, String(p.ovr));
    assert.notEqual(slots.consensus, String(presentedOvr(p.pos, p.ovr)));
  }
  assert.equal(st.rngState, rngBefore, "recent-pick slots must not draw");
}

{
  const st = newGame({ seed: 42, userTeamId: 0 });
  const rngBefore = st.rngState;
  const withSheet = (p: Player) =>
    p.prospect &&
    !p.retired &&
    p.profile?.combine.forty != null &&
    p.profile.combine.vertical != null &&
    p.profile.combine.bench != null;

  const future = st.players.find((p) => isFutureProspect(st, p) && withSheet(p));
  const current = st.players.find((p) => p.prospect && p.draftClassSeason === st.season && withSheet(p));
  assert.ok(future && future.profile);
  assert.ok(current && current.profile);

  assert.equal(combineSheetPublic(st, future), false);
  assert.equal(combineSheetPublic(st, current), false);
  const futureText = prospectTestingText(st, future);
  const futureSheet = prospectTesting(st, future);
  assert.equal(futureSheet.vertical, null);
  assert.equal(futureSheet.bench, null);
  assert.equal(futureText.includes("Vert"), false);
  assert.equal(futureText.includes("Bench"), false);
  assert.equal(futureText.includes(future.profile.combine.forty!.toFixed(2)), false);
  assert.equal(futureSheet.forty, campusForty(future)!.toFixed(2));
  assert.equal(leaksRating(futureText, future), null, futureText);

  const currentText = prospectTestingText(st, current);
  assert.equal(currentText.includes("Vert"), false);
  assert.equal(currentText.includes("Bench"), false);
  assert.notEqual(prospectTesting(st, current).forty, current.profile.combine.forty!.toFixed(2));

  const rows = futureClassRows(st, st.season + 1);
  let campus = 0;
  for (const row of rows) {
    const p = st.players.find((q) => q.id === row.id);
    assert.ok(p);
    const official = p.profile?.combine.forty;
    if (official == null) {
      assert.equal(row.forty, null);
      continue;
    }
    assert.equal(row.forty, campusForty(p)!.toFixed(2));
    assert.notEqual(row.forty, official.toFixed(2));
    const blob = JSON.stringify(row);
    assert.equal(blob.includes("vertical"), false);
    assert.equal(blob.includes("bench"), false);
    assert.equal(blob.includes("ceiling"), false);
    assert.equal(/\bovr\b/i.test(blob), false);
    campus++;
  }
  assert.ok(campus > 50, `campus forties ${campus}`);

  st.phase = "offseason-recap";
  assert.equal(combineSheetPublic(st, current), false);
  assert.equal(prospectTesting(st, current).vertical, null);

  st.phase = "offseason-fa";
  assert.equal(combineSheetPublic(st, current), true);
  assert.equal(combineSheetPublic(st, future), false);
  const open = prospectTesting(st, current);
  assert.equal(open.forty, current.profile.combine.forty!.toFixed(2));
  assert.equal(open.vertical, String(current.profile.combine.vertical));
  assert.equal(open.bench, String(current.profile.combine.bench));
  assert.equal(prospectTestingText(st, current).includes("Vert"), true);
  assert.equal(prospectTestingText(st, current).includes("Bench"), true);
  const stillFuture = prospectTesting(st, future);
  assert.equal(stillFuture.vertical, null);
  assert.equal(stillFuture.bench, null);
  assert.notEqual(stillFuture.forty, future.profile.combine.forty!.toFixed(2));
  assert.equal(st.rngState, rngBefore, "testing lines must not draw");
}

console.log("ok    scout fog — recent picks, campus forty, combine window");
