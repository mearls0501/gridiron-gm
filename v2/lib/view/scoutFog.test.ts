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
import { playerName, presentedOvr } from "../core/ratings";
import { Rng } from "../core/rng";
import { boardGrade, consensusGrade, gradeContext, slotShade } from "../core/scouting-reports";
import { advanceScoutingWindow, ensureScouting } from "../core/scouting";
import { Player } from "../core/types";
import { athleticClass, athleticSheet, boardTesting } from "./athleticSheet";
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
  assert.ok(player.includes("testing.eraLabel"));
  assert.equal(player.includes("profile.combine"), false);
  assert.equal(player.includes("combine.forty"), false);
  assert.equal(player.includes("combine.vertical"), false);
  assert.equal(player.includes("combine.bench"), false);

  const futureSrc = readFileSync(new URL("../core/futureClass.ts", import.meta.url), "utf8");
  assert.ok(futureSrc.includes("campusForty(p)"));
  assert.equal(futureSrc.includes("combine.forty.toFixed"), false);

  const headStart = draft.indexOf("const boardHead");
  const board = draft.slice(headStart, draft.indexOf("];", headStart));
  assert.ok(board.includes('"Size"'));
  assert.ok(board.includes('"40"'));
  assert.ok(board.includes('"Bench"'));
  assert.ok(board.includes('"Vert"'));
  assert.ok(draft.includes("boardTesting"));
  assert.ok(draft.includes("sheet.eraLabel"));
  assert.equal(draft.includes("pr.combine"), false);
  assert.equal(draft.includes(".combine."), false);

  const futureCard = draft.slice(draft.indexOf('title="Future classes"'), draft.indexOf("Big board"));
  assert.equal(futureCard.includes("Bench"), false);
  assert.equal(futureCard.includes("Vertical"), false);
  assert.ok(futureCard.includes("campus"));

  const cpuDraft = readFileSync(new URL("../core/offseason/draft.ts", import.meta.url), "utf8");
  const cpuScout = readFileSync(new URL("../core/scouting.ts", import.meta.url), "utf8");
  assert.equal(cpuDraft.includes("athleticSheet"), false);
  assert.equal(cpuDraft.includes("campusForty"), false);
  assert.equal(cpuScout.includes("athleticSheet"), false);
  assert.equal(cpuScout.includes("boardTesting"), false);
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
  assert.equal(currentText.startsWith("Campus"), true, currentText);
  assert.equal(currentText.includes("Vert"), false);
  assert.equal(currentText.includes("Bench"), false);
  assert.notEqual(prospectTesting(st, current).forty, current.profile.combine.forty!.toFixed(2));
  assert.equal(prospectTesting(st, current).era, "campus");

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

  const ax = athleticClass(st, st.season);
  const classPool = st.players.filter(
    (p) => p.prospect && !p.retired && p.profile && p.draftClassSeason === st.season,
  );
  const ctx = gradeContext(st, classPool);
  let invited = 0;
  let campShade = 0;
  for (const p of classPool) {
    const camp = slotShade(consensusGrade(st, p, ctx).slot) === "Camp invite";
    if (camp) {
      campShade++;
      assert.equal(ax.invite.has(p.id), false);
    } else {
      invited++;
      assert.equal(ax.invite.has(p.id), true);
    }
  }
  assert.ok(invited > 200, `invitees ${invited}`);
  assert.ok(campShade > 50, `camp shade ${campShade}`);

  const invitee = classPool.find(
    (p) =>
      ax.invite.has(p.id) &&
      p.profile?.combine.forty != null &&
      p.profile.combine.vertical != null &&
      p.profile.combine.bench != null,
  );
  const outsider = classPool.find(
    (p) => !ax.invite.has(p.id) && p.profile?.combine.forty != null && p.profile.combine.bench != null,
  );
  const skipped = classPool.find(
    (p) => ax.invite.has(p.id) && p.profile?.combine.forty != null && p.profile.combine.bench == null,
  );
  assert.ok(invitee && invitee.profile);
  assert.ok(outsider && outsider.profile);
  assert.ok(skipped && skipped.profile);

  const open = athleticSheet(st, invitee, ax);
  assert.equal(open.era, "combine");
  assert.equal(open.eraLabel, "Combine");
  assert.equal(open.forty.text, invitee.profile.combine.forty!.toFixed(2));
  assert.equal(open.vertical.text, String(invitee.profile.combine.vertical));
  assert.equal(open.bench.text, String(invitee.profile.combine.bench));
  assert.equal(open.forty.skipped, false);
  assert.equal(prospectTestingText(st, invitee).includes("Combine"), true);
  assert.equal(prospectTestingText(st, invitee).includes("Vert"), true);
  assert.equal(prospectTestingText(st, invitee).includes("Bench"), true);
  const inviteBlob = JSON.stringify(open.rows);
  assert.equal(/ceiling|potential|\bovr\b/i.test(inviteBlob), false);

  const held = athleticSheet(st, outsider, ax);
  assert.equal(held.era, "campus");
  assert.equal(held.forty.text, campusForty(outsider)!.toFixed(2));
  assert.notEqual(held.forty.text, outsider.profile.combine.forty!.toFixed(2));
  assert.equal(held.bench.text, null);
  assert.equal(held.bench.skipped, false);
  assert.equal(held.vertical.text, null);
  assert.equal(held.rows.some((r) => r.label === "Bench" || r.label === "Vertical"), false);
  const campusBoard = boardTesting(held, outsider.pos);
  assert.equal(campusBoard.forty, `${campusForty(outsider)!.toFixed(2)}s`);
  assert.equal(campusBoard.bench, "—");
  assert.equal(campusBoard.vertical, "—");
  const inviteBoard = boardTesting(open, invitee.pos);
  assert.equal(inviteBoard.forty, `${invitee.profile.combine.forty!.toFixed(2)}s`);
  assert.equal(inviteBoard.bench, String(invitee.profile.combine.bench));
  assert.ok(inviteBoard.fortyPct);

  const gap = athleticSheet(st, skipped, ax);
  assert.equal(gap.era, "combine");
  assert.equal(gap.bench.text, null);
  assert.equal(gap.bench.skipped, true);
  assert.equal(gap.rows.find((r) => r.label === "Bench")?.value, "—");

  const pos = invitee.pos;
  const timed = classPool.filter(
    (p) => ax.invite.has(p.id) && p.pos === pos && p.profile?.combine.forty != null,
  );
  timed.sort((a, b) => a.profile!.combine.forty! - b.profile!.combine.forty!);
  assert.ok(timed.length >= 2);
  const fast = athleticSheet(st, timed[0], ax);
  const slow = athleticSheet(st, timed[timed.length - 1], ax);
  assert.ok(fast.forty.percentile != null && slow.forty.percentile != null);
  assert.ok(fast.forty.percentile > slow.forty.percentile, `${fast.forty.percentile} vs ${slow.forty.percentile}`);
  assert.ok(fast.forty.percentile <= 100 && slow.forty.percentile >= 1);

  ensureScouting(st);
  assert.equal(ensureScouting(st).window, "combine");
  assert.ok(advanceScoutingWindow(st));
  assert.equal(ensureScouting(st).window, "proDays");
  const axDay = athleticClass(st, st.season);
  const day = athleticSheet(st, outsider, axDay);
  assert.equal(day.era, "proDay");
  assert.equal(day.eraLabel, "Pro day");
  assert.equal(day.forty.text, outsider.profile.combine.forty!.toFixed(2));
  assert.equal(day.forty.skipped, false);
  if (outsider.profile.combine.bench != null) {
    assert.equal(day.bench.text, String(outsider.profile.combine.bench));
  }
  const stillInvited = athleticSheet(st, invitee, axDay);
  assert.equal(stillInvited.era, "combine");
  assert.equal(stillInvited.forty.text, invitee.profile.combine.forty!.toFixed(2));

  const stillFuture = prospectTesting(st, future);
  assert.equal(stillFuture.era, "campus");
  assert.equal(stillFuture.vertical, null);
  assert.equal(stillFuture.bench, null);
  assert.notEqual(stillFuture.forty, future.profile.combine.forty!.toFixed(2));
  const futureSheetNow = athleticSheet(st, future);
  assert.equal(futureSheetNow.rows.some((r) => r.label === "Vertical" || r.label === "Bench"), false);

  assert.equal(st.rngState, rngBefore, "testing lines must not draw");
  console.log(
    `seed 42  ${playerName(current)} ${currentText}  invitee ${playerName(invitee)} combine ${open.forty.text}  pro day ${playerName(outsider)} ${day.forty.text}  future campus-only`,
  );
}

console.log("ok    scout fog — recent picks, campus forty, combine window");
