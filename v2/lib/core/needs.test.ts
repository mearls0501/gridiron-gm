/**
 * Regression: camp-90 street bodies must not hide a position need.
 *
 * After #39, `fillCampRosters` stocks every club to 90 from the street.
 * Those extras sit ~50 OVR. `needsOf` used raw `positionCount`, so no
 * club was ever short and shopping collapsed to starter-deficit only.
 *
 * Run: npx tsx lib/core/needs.test.ts
 */
import assert from "node:assert/strict";
import { REPLACEMENT_OVR } from "./frontOffice";
import { newGame } from "./newGame";
import { isActiveRoster, positionCount } from "./select";
import { needsOf } from "./trades";
import { Player, POSITION_TARGET, POSITIONS, Position, STARTERS } from "./types";

const STREET_OVR = 50;
const STARTER_OVR = 72;

function clubActive(st: ReturnType<typeof newGame>, teamId: number): Player[] {
  return st.players.filter(
    (p) => p.teamId === teamId && !p.retired && !p.prospect && isActiveRoster(p)
  );
}

function atPos(players: Player[], pos: Position): Player[] {
  return players.filter((p) => p.pos === pos).sort((a, b) => b.ovr - a.ovr);
}

function setOvr(p: Player, ovr: number): void {
  p.ovr = ovr;
  p.pot = Math.max(p.pot, ovr);
}

/** Adequate starters + replacement depth everywhere, so only an explicit hole ranks. */
function flattenNeeds(active: Player[]): void {
  for (const pos of POSITIONS) {
    const group = atPos(active, pos);
    for (const p of group.slice(0, STARTERS[pos])) setOvr(p, STARTER_OVR);
    for (const p of group.slice(STARTERS[pos])) setOvr(p, REPLACEMENT_OVR);
  }
}

{
  const st = newGame({ seed: 1 });
  st.phase = "offseason-final";
  const teamId = st.teams.find((t) => t.id !== st.userTeamId)!.id;
  const active = clubActive(st, teamId);
  flattenNeeds(active);
  const cbs = atPos(active, "CB");
  assert.ok(cbs.length >= POSITION_TARGET.CB, "generated roster is at CB target");
  for (const p of cbs.slice(STARTERS.CB)) setOvr(p, STREET_OVR);

  assert.ok(positionCount(st, teamId, "CB") >= POSITION_TARGET.CB);
  const quality = cbs.filter((p) => p.ovr >= REPLACEMENT_OVR).length;
  assert.ok(quality < POSITION_TARGET.CB, "street extras must not count as quality");
  assert.ok(
    cbs.slice(0, STARTERS.CB).every((p) => p.ovr >= REPLACEMENT_OVR + 6),
    "starters are adequate so this is a headcount need, not a deficit",
  );

  assert.ok(
    needsOf(st, teamId).includes("CB"),
    "50-OVR camp bodies must not make a club not-short at CB",
  );

  st.phase = "regular";
  assert.ok(
    !needsOf(st, teamId).includes("CB"),
    "in-season 53-man headcount is unchanged — street mix on a 53 is not this packet",
  );
}

{
  const st = newGame({ seed: 1 });
  st.phase = "offseason-final";
  const teamId = st.teams.find((t) => t.id !== st.userTeamId)!.id;
  flattenNeeds(clubActive(st, teamId));
  assert.ok(!needsOf(st, teamId).includes("CB"), "a full quality CB room is not a need");
}

{
  const st = newGame({ seed: 2 });
  st.phase = "offseason-final";
  const teamId = st.teams.find((t) => t.id !== st.userTeamId)!.id;
  const active = clubActive(st, teamId);
  flattenNeeds(active);
  const cbs = atPos(active, "CB");
  for (const p of cbs.slice(STARTERS.CB)) setOvr(p, REPLACEMENT_OVR - 1);
  assert.ok(needsOf(st, teamId).includes("CB"), "57 OVR does not count toward the 53");

  for (const p of cbs.slice(STARTERS.CB, POSITION_TARGET.CB)) setOvr(p, REPLACEMENT_OVR);
  assert.ok(
    !needsOf(st, teamId).includes("CB"),
    "58 OVR is replacement and fills the 53-man target",
  );
}

{
  const st = newGame({ seed: 3 });
  st.phase = "offseason-final";
  const teamId = st.teams.find((t) => t.id !== st.userTeamId)!.id;
  const active = clubActive(st, teamId);
  flattenNeeds(active);
  const cbs = atPos(active, "CB");
  for (const p of cbs.slice(STARTERS.CB)) p.status = "ps";
  assert.ok(cbs.slice(STARTERS.CB).every((p) => !isActiveRoster(p)));
  assert.ok(positionCount(st, teamId, "CB") < POSITION_TARGET.CB);
  assert.ok(needsOf(st, teamId).includes("CB"), "PS bodies are not 53-man quality");
}

console.log("ok    needs — camp street bodies do not hide a 53-man need");
