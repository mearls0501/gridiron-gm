/**
 * Paced draft night picks the same players as the instant buttons.
 *
 * Seed 42. The stepper is the live one-pick loop. A yield between picks,
 * and a move-up alert that is declined, must not change the draft.
 *
 * Run: npx tsx lib/store/draftNight.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { newGame } from "../core/newGame";
import { advance } from "../core/season/engine";
import { advanceOffseason, simEntireDraft, simToUserPick } from "../core/offseason";
import {
  availableProspects,
  isUserOnClock,
  makePick,
  userPicks,
} from "../core/offseason/draft";
import { Rng } from "../core/rng";
import { boardGrade, consensusGrade, gradeContext } from "../core/scouting-reports";
import { setBoardNote } from "../core/scouting";
import { GameState, Player } from "../core/types";
import { tradeBoardAssetLabel } from "../view/tradeBoard";
import {
  clockTradeFromSnap,
  moveUpAlert,
  moveUpAlertKey,
  prospectWillNotLast,
  reachSlideLabel,
  snapDraft,
  tickerPickText,
  type DraftTapeItem,
  type TickerPick,
} from "../view/draftNight";
import { draftNightStepper, drainDraftNight, type DraftNightMode } from "./draftNight";

function strip(s: GameState): string {
  const copy = { ...s } as Record<string, unknown>;
  delete copy.createdAt;
  delete copy.updatedAt;
  return JSON.stringify(copy);
}

function clone(s: GameState): GameState {
  return JSON.parse(JSON.stringify(s)) as GameState;
}

function pickKey(s: GameState): string {
  return (s.draft?.picks ?? [])
    .map((p) => `${p.pick}:${p.teamId}:${p.playerId ?? "-"}:${p.acquiredByClockTrade ? 1 : 0}`)
    .join("|");
}

function toDraft(seed: number): GameState {
  const st = newGame({ seed });
  advance(st);
  let g = 0;
  while (st.phase === "regular" && g++ < 40) advance(st);
  g = 0;
  while (st.phase === "playoffs" && g++ < 12) advance(st);
  assert.equal(st.phase, "offseason-recap");
  advanceOffseason(st);
  advanceOffseason(st);
  assert.equal(st.phase, "offseason-fa");
  advanceOffseason(st);
  assert.equal(st.phase, "offseason-draft");
  assert.ok(st.draft);
  return st;
}

function leaked(text: string, p: Player, allowed: string[]): string | null {
  let rest = text;
  for (const n of allowed) {
    if (n) rest = rest.split(n).join(" ");
  }
  if (/\bOVR\b/i.test(rest) || /potential/i.test(rest)) return "word";
  const tokens = rest.split(/\s+/);
  if (tokens.includes(String(p.ovr))) return "ovr";
  if (tokens.includes(String(p.pot))) return "pot";
  return null;
}

async function yieldDrain(s: GameState, mode: DraftNightMode): Promise<{ message: string; events: DraftTapeItem[] }> {
  const step = draftNightStepper(s, mode);
  const events: DraftTapeItem[] = [];
  let result = step();
  while (!result.done) {
    events.push(...result.events);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    result = step();
  }
  events.push(...result.events);
  return { message: result.message, events };
}

function drainLettingThemGo(s: GameState, mode: DraftNightMode): { message: string; events: DraftTapeItem[] } {
  const step = draftNightStepper(s, mode);
  const skip = new Set<string>();
  const events: DraftTapeItem[] = [];
  while (true) {
    const alert = moveUpAlert(s, skip);
    if (alert) {
      skip.add(moveUpAlertKey(alert.season, alert.playerId));
      continue;
    }
    const result = step();
    events.push(...result.events);
    if (result.done) return { message: result.message, events };
  }
}

function walk(dir: string, hit: (rel: string, src: string) => void): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, hit);
    else if (name.endsWith(".ts")) hit(full, readFileSync(full, "utf8"));
  }
}

{
  assert.equal(reachSlideLabel(10, 18), "reach 8");
  assert.equal(reachSlideLabel(22, 14), "slide 8");
  assert.equal(reachSlideLabel(9, 9), "slot");
  assert.equal(prospectWillNotLast(8, 8, 20), true);
  assert.equal(prospectWillNotLast(8, 3, 20), false);
  assert.equal(prospectWillNotLast(30, 12, 20), false);
  assert.equal(prospectWillNotLast(20, 20, 20), false);

  const view = readFileSync(new URL("../view/draftNight.ts", import.meta.url), "utf8");
  assert.ok(view.includes("tradeBoardAssetLabel"));
  assert.equal(view.includes("cpuBoardValue"), false);
  assert.equal(view.includes("cpuProspectView"), false);
  assert.equal(view.includes("cpuExpectedView"), false);
  assert.equal(view.includes("Date.now"), false);
  assert.equal(view.includes(".ovr"), false);
  assert.equal(view.includes(".pot"), false);
  assert.equal(view.includes("tryCpuClockTrade"), false);

  const stepper = readFileSync(new URL("./draftNight.ts", import.meta.url), "utf8");
  assert.ok(stepper.includes("stepDraftUntilUser"));
  assert.ok(stepper.includes("stepFullDraft"));
  assert.equal(stepper.includes("Date.now"), false);
  assert.equal(stepper.includes("setTimeout"), false);
  assert.equal(stepper.includes("tryCpuClockTrade"), false);

  const page = readFileSync(new URL("../../app/draft/page.tsx", import.meta.url), "utf8");
  assert.equal(page.includes("simToUserPick"), false);
  assert.equal(page.includes("simEntireDraft"), false);
  assert.ok(page.includes('simDraft("until"'));
  assert.ok(page.includes('simDraft("full"'));
  assert.ok(page.includes("Draft ticker"));
  assert.ok(page.includes("He will not last"));
  const ticker = page.slice(page.indexOf('title="Draft ticker"'), page.indexOf('title="He will not last"'));
  assert.ok(ticker.includes("Reach / slide"));
  assert.equal(ticker.includes("OVR"), false);
  assert.equal(ticker.includes("potential"), false);
  assert.equal(ticker.includes("presentedOvr"), false);

  const coreDir = fileURLToPath(new URL("../core/", import.meta.url));
  walk(coreDir, (rel, src) => {
    assert.equal(src.includes("draftNight"), false, rel);
    assert.equal(src.includes("DRAFT_PACE"), false, rel);
  });

  const draftCore = readFileSync(new URL("../core/offseason/draft.ts", import.meta.url), "utf8");
  assert.equal(draftCore.split("slotRng.chance(0.4)").length - 1, 2);
}

async function main(): Promise<void> {
  const atDraft = toDraft(42);
  assert.equal(atDraft.seed, 42);

  {
    const instant = clone(atDraft);
    const sync = clone(atDraft);
    const yielded = clone(atDraft);
    simEntireDraft(instant);
    const syncRun = drainDraftNight(sync, "full");
    const yieldedRun = await yieldDrain(yielded, "full");
    assert.equal(syncRun.message, yieldedRun.message);
    assert.equal(pickKey(sync), pickKey(instant));
    assert.equal(pickKey(yielded), pickKey(instant));
    assert.equal(strip(sync), strip(instant));
    assert.equal(strip(yielded), strip(instant));
    assert.ok(instant.draft?.complete);

    const picks = yieldedRun.events.filter((e): e is TickerPick => e.kind === "pick" && !e.forfeited);
    assert.ok(picks.length > 32, `expected a draft of picks, got ${picks.length}`);
    for (const row of picks) {
      const p = yielded.players.find((x) => x.id === row.playerId);
      assert.ok(p);
      assert.equal(row.club.length > 0, true);
      assert.equal(row.player, `${p.firstName} ${p.lastName}`);
      assert.equal(row.pos, p.pos);
      assert.equal(row.school, p.profile?.college ?? "—");
      assert.equal(row.board, `#${row.boardSlot}`);
      assert.equal(row.consensus, `#${row.consensusSlot}`);
      assert.match(row.reachSlide, /^(reach \d+|slide \d+|slot)$/);
      const text = tickerPickText(row);
      const allowed = [
        String(row.pick),
        String(row.round),
        String(row.boardSlot),
        String(row.consensusSlot),
        String(Math.abs(row.pick - (row.consensusSlot ?? row.pick))),
      ];
      assert.equal(leaked(text, p, allowed), null, text);
    }

    const trades = yieldedRun.events.filter((e) => e.kind === "trade");
    const tradeDelta = (yielded.draft?.clockTrades ?? 0) - (atDraft.draft?.clockTrades ?? 0);
    assert.equal(trades.length, tradeDelta);
    for (const trade of trades) {
      assert.ok(trade.sent.length > 0, trade.text);
      assert.ok(trade.text.includes(trade.sent[0]));
      assert.equal(/potential/i.test(trade.text), false);
      assert.equal(/\bOVR\b/.test(trade.text), false);
    }
  }

  {
    const instant = clone(atDraft);
    const yielded = clone(atDraft);
    if (isUserOnClock(instant)) {
      const pool = availableProspects(instant, instant.draft!.season).slice().sort((a, b) => a.id - b.id);
      const same = availableProspects(yielded, yielded.draft!.season).slice().sort((a, b) => a.id - b.id);
      const rngA = new Rng(instant.rngState);
      const rngB = new Rng(yielded.rngState);
      assert.equal(makePick(instant, pool[0].id, rngA), true);
      assert.equal(makePick(yielded, same[0].id, rngB), true);
      instant.rngState = rngA.state;
      yielded.rngState = rngB.state;
    }
    simToUserPick(instant);
    const yieldedRun = await yieldDrain(yielded, "until");
    assert.equal(pickKey(yielded), pickKey(instant));
    assert.equal(strip(yielded), strip(instant));
    assert.equal(yieldedRun.message.length > 0, true);
  }

  {
    const marked = clone(atDraft);
    let offClock = 0;
    while (isUserOnClock(marked) && offClock++ < 8) {
      const avail = availableProspects(marked, marked.draft!.season).slice().sort((a, b) => a.id - b.id);
      const rng = new Rng(marked.rngState);
      assert.equal(makePick(marked, avail[0].id, rng), true);
      marked.rngState = rng.state;
    }
    assert.equal(isUserOnClock(marked), false);
    const season = marked.draft!.season;
    const classPlayers = marked.players.filter((p) => !p.retired && p.draftClassSeason === season);
    const pool = classPlayers.filter((p) => p.prospect && p.teamId === null);
    const ctx = gradeContext(marked, classPlayers);
    const nextUser = userPicks(marked).filter((p) => p.playerId === null).sort((a, b) => a.pick - b.pick)[0];
    assert.ok(nextUser, "seed 42 still has a user pick");
    const onNow = marked.draft!.picks[marked.draft!.onClock].pick;
    const ranked = pool
      .map((p) => ({ p, slot: consensusGrade(marked, p, ctx).slot }))
      .sort((a, b) => a.slot - b.slot || a.p.id - b.p.id);
    const choice = ranked.find((row) => row.slot < nextUser.pick && onNow >= row.slot)
      ?? ranked.find((row) => {
        if (!(row.slot < nextUser.pick)) return false;
        return marked.draft!.picks.some(
          (p) => p.playerId === null && p.teamId !== marked.userTeamId && p.pick >= row.slot && p.pick < nextUser.pick,
        );
      });
    assert.ok(choice, "consensus has a name before the user's next pick");
    const userPick = nextUser;
    const idx = marked.draft!.picks.findIndex(
      (p) => p.playerId === null && p.teamId !== marked.userTeamId && p.pick >= choice.slot && p.pick < userPick.pick,
    );
    assert.ok(idx >= 0, "a CPU slot sits on that public name");
    marked.draft!.onClock = idx;
    setBoardNote(marked, choice.p.id, { tier: 1 });
    const alert = moveUpAlert(marked, new Set());
    assert.equal(alert?.playerId, choice.p.id);
    assert.equal(alert?.consensus, `#${choice.slot}`);
    assert.equal(prospectWillNotLast(choice.slot, marked.draft!.picks[idx].pick, userPick.pick), true);
    const boardSlot = boardGrade(marked, choice.p, ctx).slot;
    assert.equal(alert?.board, `#${boardSlot}`);

    setBoardNote(marked, choice.p.id, { tier: 2, watch: false });
    assert.equal(moveUpAlert(marked, new Set()), null);
    setBoardNote(marked, choice.p.id, { tier: undefined, watch: true });
    assert.equal(moveUpAlert(marked, new Set())?.playerId, choice.p.id);
    const skip = new Set([moveUpAlertKey(marked.draft!.season, choice.p.id)]);
    assert.equal(moveUpAlert(marked, skip), null);

    setBoardNote(marked, choice.p.id, { tier: undefined, watch: false });
    const best = pool.slice().sort((a, b) => b.ovr - a.ovr)[0];
    assert.equal(moveUpAlert(marked, new Set())?.playerId, undefined);
    assert.notEqual(best, undefined);
  }

  {
    const traded = clone(atDraft);
    const before = snapDraft(traded);
    const d = traded.draft!;
    const seller = d.picks[d.onClock].teamId;
    const later = d.picks.find((p, i) => i > d.onClock && p.playerId === null && p.teamId !== seller);
    assert.ok(later, "a later pick can move");
    const buyer = later.teamId;
    const asset = {
      kind: "pick" as const,
      season: d.season,
      round: later.round,
      originalTeamId: later.originalTeamId,
    };
    later.teamId = seller;
    d.picks[d.onClock].teamId = buyer;
    for (const row of traded.pickOwners ?? []) {
      if (row.season === d.season && row.round === later.round && row.originalTeamId === later.originalTeamId) {
        row.teamId = seller;
      }
      const slot = d.picks[before.onClock];
      if (row.season === d.season && row.round === slot.round && row.originalTeamId === slot.originalTeamId) {
        row.teamId = buyer;
      }
    }
    d.clockTrades = (d.clockTrades ?? 0) + 1;
    const event = clockTradeFromSnap(traded, before);
    assert.ok(event);
    const label = tradeBoardAssetLabel(traded, asset);
    assert.equal(event.sent[0], label);
    assert.ok(event.text.includes(label));
    assert.ok(event.text.includes(traded.teams[buyer].abbr));
    assert.equal(/\bOVR\b/.test(event.text), false);
  }

  {
    const instant = clone(atDraft);
    const paced = clone(atDraft);
    const pool = instant.players.filter(
      (p) => p.prospect && !p.retired && p.teamId === null && p.draftClassSeason === instant.draft!.season,
    );
    const ctx = gradeContext(instant, pool);
    const starred = pool
      .map((p) => ({ p, slot: consensusGrade(instant, p, ctx).slot }))
      .sort((a, b) => a.slot - b.slot)[0];
    setBoardNote(instant, starred.p.id, { tier: 1, watch: true });
    setBoardNote(paced, starred.p.id, { tier: 1, watch: true });
    simEntireDraft(instant);
    const run = drainLettingThemGo(paced, "full");
    assert.equal(pickKey(paced), pickKey(instant));
    assert.equal(strip(paced), strip(instant));
    assert.equal(run.message.length > 0, true);
  }

  console.log("ok    draft night — seed 42 paced picks match instant");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
