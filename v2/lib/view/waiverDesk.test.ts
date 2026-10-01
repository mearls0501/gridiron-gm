/**
 * Regression: the waiver desk was a wall of Claim buttons.
 *
 * After settle the wire is still full of cap-stuck bodies (about 56, then
 * about 267). They stay on state.waivers and submitWaiverClaim is unchanged.
 * The desk only hides them until the GM expands or searches.
 *
 * Run: npx tsx lib/view/waiverDesk.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "../core/newGame";
import { capHit, rosterCount, teamCap } from "../core/select";
import { designateIr } from "../core/rosterStatus";
import { needsOf } from "../core/trades";
import { Contract, Player, Position } from "../core/types";
import { submitWaiverClaim, waiverWire } from "../core/waivers";
import {
  WAIVER_DESK_CLAIM_CAP,
  visibleWaiverRows,
  waiverDesk,
  waiverDeskHiddenCopy,
} from "./waiverDesk";

function deal(hit: number, season: number): Contract {
  return {
    years: 1,
    yearsRemaining: 1,
    baseSalary: [hit],
    signingBonus: 0,
    bonusProrationYears: 1,
    signedSeason: season,
    guaranteedYears: 0,
  };
}

function cpuBodies(st: ReturnType<typeof newGame>, n: number): Player[] {
  const out: Player[] = [];
  for (const p of st.players) {
    if (out.length >= n) break;
    if (p.teamId === null || p.teamId === st.userTeamId || p.retired || p.prospect) continue;
    if (p.status) continue;
    out.push(p);
  }
  assert.equal(out.length, n, `need ${n} cpu bodies`);
  return out;
}

function park(
  st: ReturnType<typeof newGame>,
  p: Player,
  hit: number,
  ovr: number,
  pos: Position,
): void {
  const originalTeamId = p.teamId;
  assert.equal(typeof originalTeamId, "number");
  p.teamId = null;
  p.status = undefined;
  p.pos = pos;
  p.ovr = ovr;
  p.contract = deal(hit, st.season);
  assert.equal(capHit(p.contract), hit);
  if (!st.waivers) st.waivers = [];
  st.waivers.push({ playerId: p.id, originalTeamId: originalTeamId! });
}

{
  const st = newGame({ seed: 1 });
  const teamId = st.userTeamId;
  assert.equal(rosterCount(st, teamId), 53);
  const space = teamCap(st, teamId).space;
  assert.ok(space >= 0, `space ${space}`);

  for (const p of st.players) {
    if (p.teamId === teamId && p.pos === "CB" && !p.retired && !p.prospect) p.ovr = 40;
  }
  assert.deepEqual(needsOf(st, teamId), ["CB"]);

  const bodies = cpuBodies(st, 19);
  const cheap = 0;
  const fatHit = Math.round(space) + 1_000_000;
  const star = bodies[0];
  const scrub = bodies[1];
  const fat = bodies[2];
  const splash = bodies[3];
  park(st, star, cheap, 90, "CB");
  park(st, scrub, cheap, 40, "K");
  park(st, fat, fatHit, 95, "CB");
  park(st, splash, cheap, 99, "RB");
  for (let i = 0; i < 15; i++) park(st, bodies[4 + i], cheap, 60 + (i % 5), "RB");

  const wireIds = (st.waivers ?? []).map((w) => w.playerId).join(",");
  const frozen = JSON.stringify(st.waivers);
  assert.equal(waiverWire(st).length, 19);

  const full = waiverDesk(st);
  assert.equal(JSON.stringify(st.waivers), frozen, "desk must not rewrite the wire");
  assert.equal((st.waivers ?? []).map((w) => w.playerId).join(","), wireIds);
  assert.equal(full.rosterFull, true);
  assert.equal(full.toClaim, WAIVER_DESK_CLAIM_CAP, "the scan stays short even when the roster is full");
  assert.equal(full.featured[0].player.id, splash.id, "overall orders the scan");
  assert.equal(full.featured[1].player.id, star.id);
  assert.equal(full.featured[1].need, true);
  assert.equal(full.hidden.some((r) => r.player.id === star.id), false);
  assert.equal(full.hidden.some((r) => r.player.id === fat.id), true);
  assert.ok(full.hidden.length < 19);
  const fullCopy = waiverDeskHiddenCopy(full);
  assert.ok(fullCopy && fullCopy.includes("Release someone") && fullCopy.includes("removed"));
  const blocked = submitWaiverClaim(st, star.id);
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason ?? "", /roster slot/);

  const slot = st.players.find(
    (p) => p.teamId === teamId && p.pos !== "CB" && !p.status && !p.retired && !p.prospect,
  );
  assert.ok(slot);
  slot.injuryWeeks = 10;
  assert.equal(designateIr(st, slot.id).ok, true);
  assert.ok(rosterCount(st, teamId) < 53);

  const open = waiverDesk(st);
  assert.equal(open.rosterFull, false);
  assert.equal(open.toClaim, WAIVER_DESK_CLAIM_CAP);
  assert.equal(open.toClaim, 12);
  assert.equal(open.featured[0].player.id, splash.id);
  assert.equal(open.featured[1].player.id, star.id, "a need does not jump a better player");
  assert.equal(open.featured[1].need, true);
  assert.equal(open.featured.some((r) => r.player.id === scrub.id), false, "below replacement and not a need stays collapsed");
  assert.equal(open.featured.some((r) => r.player.id === fat.id), false, "unaffordable stays collapsed");
  assert.equal(open.hidden.some((r) => r.player.id === fat.id), true);
  assert.equal(open.hidden.some((r) => r.player.id === scrub.id), true);
  assert.ok(open.hidden.length > 0);
  assert.equal(open.featured.length + open.hidden.length, 19, "hide does not drop a body");

  const found = visibleWaiverRows(open, scrub.lastName, false);
  assert.equal(found.length, 1);
  assert.equal(found[0].player.id, scrub.id, "search reaches the collapsed wire");
  assert.equal(visibleWaiverRows(open, "", false).some((r) => r.player.id === scrub.id), false);
  assert.equal(visibleWaiverRows(open, "", true).length, 19);

  const claim = submitWaiverClaim(st, fat.id);
  assert.equal(claim.ok, true, claim.reason ?? "hidden players stay claimable");
  assert.equal((st.waivers ?? []).length, 19, "a claim does not remove him from the pool");
  const after = waiverDesk(st);
  assert.equal(after.featured[0].player.id, fat.id, "a filed claim stays on the desk");
  assert.equal(after.featured[0].submitted, true);
  assert.equal(after.toClaim, WAIVER_DESK_CLAIM_CAP);
  assert.equal(after.hidden.some((r) => r.player.id === fat.id), false);
}

// A hole under POSITION_MIN jumps a higher overall who is not a hole.
{
  const st = newGame({ seed: 2 });
  const teamId = st.userTeamId;
  const space = teamCap(st, teamId).space;
  for (const p of st.players) {
    if (p.teamId === teamId && p.pos === "P") {
      p.teamId = null;
      p.contract = null;
    }
  }
  const bodies = cpuBodies(st, 2);
  const hole = bodies[0];
  const star = bodies[1];
  park(st, hole, 0, 50, "P");
  park(st, star, 0, 90, "RB");
  assert.ok(space >= 0);
  const desk = waiverDesk(st);
  assert.equal(desk.featured[0].player.id, hole.id, "a position hole is the first row");
  assert.equal(desk.featured[0].need, true);
  assert.equal(desk.featured.some((r) => r.player.id === star.id), true);
}

console.log("ok    waiverDesk — default scan hides the wire; claims are unchanged");
