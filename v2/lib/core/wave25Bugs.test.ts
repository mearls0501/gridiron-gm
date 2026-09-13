/**
 * Wave 3.7 Packet 3a — Wave 2.5 bugs.
 *
 * 1. Comp-pick overallRoundBand stays on the published round.
 * 2. saveGame does not run psychology.
 * 3. Coaches and contract-office child streams use distinct keys.
 * 4. Cuts are a flag, not log-prose inference.
 *
 * Run: npx tsx lib/core/wave25Bugs.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { coachesChildRng } from "./coaches";
import { newGame } from "./newGame";
import { makeContract } from "./generate";
import { cutPlayer, contractOfficeChildRng } from "./offseason/contracts";
import {
  buildDraftPicks,
  computeCompensatoryAwards,
  qualifyingUfaMoves,
  rookieRoundBand,
  rookieSlotApy,
} from "./offseason/draft";
import { Rng } from "./rng";
import { blankSeasonLine } from "./season/stats";
import { Player } from "./types";

function ok(label: string) { console.log("ok   ", label); }

const here = dirname(fileURLToPath(import.meta.url));

function plantUfa(
  st: ReturnType<typeof newGame>,
  fromId: number,
  toId: number,
  apy: number,
): Player {
  const p = st.players.find(
    (x) => x.teamId === fromId && !x.retired && !x.prospect && x.contract
  );
  assert.ok(p, "need a rostered player to plant");
  const line = blankSeasonLine(st.season, fromId);
  line.games = 16;
  p.stats = p.stats.filter((s) => s.season !== st.season);
  p.stats.push(line);
  p.teamId = toId;
  p.prospect = false;
  p.retired = false;
  p.draftClassSeason = st.season - 4;
  p.yearsPro = 4;
  p.contract = makeContract(new Rng(1), apy, 4, st.season, 2);
  return p;
}

// (1) Compensatory overalls do not spill regulars or comps into the next band.
{
  const st = newGame({ seed: 3 });
  const from = st.teams.find((t) => t.id !== st.userTeamId)!.id;
  const to = st.teams.find((t) => t.id !== st.userTeamId && t.id !== from)!.id;
  plantUfa(st, from, to, 15_000_000);
  const awards = computeCompensatoryAwards(st);
  assert.ok(awards.length >= 1, "need a comp award to shift overalls");
  const picks = buildDraftPicks(st, st.season);
  const comps = picks.filter((p) => p.compensatory);
  assert.ok(comps.length >= 1);

  for (const pick of picks) {
    const band = rookieRoundBand(pick.pick, pick.round);
    assert.equal(band, pick.round, `R${pick.round} #${pick.pick} banded as ${band}`);
    if (pick.compensatory && pick.round < 7 && pick.pick > 32 * pick.round) {
      assert.equal(
        rookieRoundBand(pick.pick),
        Math.min(7, Math.ceil(pick.pick / 32)),
        "legacy overall band still follows the 7×32 map",
      );
      assert.notEqual(
        rookieRoundBand(pick.pick),
        pick.round,
        "comp overall sits past the 32-slot band — that is the spill",
      );
    }
  }

  const spilled = comps.find((p) => p.round < 7 && p.pick > 32 * p.round);
  assert.ok(spilled, "need a mid-round comp whose overall left its 32-slot band");
  const scoped = rookieSlotApy(st, spilled.pick, spilled.round);
  const leaked = rookieSlotApy(st, spilled.pick);
  assert.ok(scoped > leaked, "comp money stays on its published-round flat, not the next band");

  const lateRegular = picks.find((p) => !p.compensatory && p.round === spilled.round + 1 && p.pick > 32 * spilled.round);
  if (lateRegular) {
    assert.equal(rookieRoundBand(lateRegular.pick, lateRegular.round), lateRegular.round);
    assert.ok(
      rookieSlotApy(st, lateRegular.pick, lateRegular.round) >= rookieSlotApy(st, lateRegular.pick),
      "regular after comps stays in its published round band",
    );
  }
  ok("overallRoundBand stays on the published round when comps shift overall");
}

// (2) saveGame must not evaluate psychology. Season hooks still do.
{
  const saveSrc = readFileSync(join(here, "../store/save.ts"), "utf8");
  const start = saveSrc.indexOf("export async function saveGame");
  const end = saveSrc.indexOf("export async function loadGame");
  assert.ok(start >= 0 && end > start, "saveGame / loadGame markers");
  const saveGameFn = saveSrc.slice(start, end);
  assert.equal(saveGameFn.includes("runPsychology"), false, "saveGame must not run psychology");
  assert.ok(saveSrc.includes("runPsychology(state)"), "migrate still backfills an old save once");

  const st = newGame({ seed: 41 });
  assert.equal(st.psychTick, undefined, "newGame does not evaluate psychology");
  ok("saveGame no longer mutates psych state");
}

// (3) Coaches and contract office are independent keyed child streams.
{
  const st = newGame({ seed: 42 });
  const coaches = coachesChildRng(st);
  const office = contractOfficeChildRng(st);
  assert.notEqual(coaches.state, office.state, "streams must not share a start seed");
  assert.equal(st.rngState, newGame({ seed: 42 }).rngState, "neither stream writes the parent");

  const a = contractOfficeChildRng(st).state;
  const b = contractOfficeChildRng(newGame({ seed: 42 })).state;
  assert.equal(a, b, "office stream is deterministic");
  const other = contractOfficeChildRng(newGame({ seed: 43 })).state;
  assert.notEqual(a, other, "office stream follows the seed");
  ok("coaches and contract-office child RNGs use distinct keys");
}

// (4) A cut is a flag. Prose in the log is not enough.
{
  const prose = newGame({ seed: 5 });
  const from = prose.teams.find((t) => t.id !== prose.userTeamId)!.id;
  const to = prose.teams.find((t) => t.id !== prose.userTeamId && t.id !== from)!.id;
  const named = plantUfa(prose, from, to, 15_000_000);
  prose.log.push({
    season: prose.season, week: 0, kind: "transaction",
    text: `${prose.teams[from].abbr} waived ${named.firstName} ${named.lastName} (${named.pos})`,
  });
  assert.ok(qualifyingUfaMoves(prose).length >= 1, "log prose must not hide a UFA as a cut");

  const flagged = newGame({ seed: 6 });
  const a = flagged.teams.find((t) => t.id !== flagged.userTeamId)!.id;
  const b = flagged.teams.find((t) => t.id !== flagged.userTeamId && t.id !== a)!.id;
  const p = plantUfa(flagged, a, b, 15_000_000);
  p.waivedSeason = flagged.season;
  flagged.log = [];
  assert.equal(qualifyingUfaMoves(flagged).length, 0, "waivedSeason is enough without a log row");

  const live = newGame({ seed: 7 });
  const victim = live.players.find(
    (x) => x.teamId === live.userTeamId && !x.retired && !x.prospect && x.contract
  );
  assert.ok(victim);
  const cut = cutPlayer(live, victim.id);
  assert.equal(cut.ok, true, cut.reason ?? "cut");
  assert.equal(victim.waivedSeason, live.season);
  const row = live.log[live.log.length - 1];
  assert.equal(row.cut, true);
  assert.equal(row.playerId, victim.id);
  ok("cuts are waivedSeason + log.cut, not free-text");
}

console.log("ok    wave25Bugs — Packet 3a regressions");
