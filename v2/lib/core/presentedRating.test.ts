/**
 * Roster scale: specialists do not sort as stars, and 99 potential is rare.
 *
 * Stored grades, kick attributes, and the save RNG stay put. Run:
 * npx tsx lib/core/presentedRating.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import {
  computeOvr, presentOvrText, presentPotText, presentedAttr, presentedOvr, presentedPot, relevantAttrs,
} from "./ratings";
import { visibleOvr, visiblePot, veteranIntel } from "./scouting";
import { isActiveRoster } from "./select";
import { Player } from "./types";

assert.equal(presentedOvr("WR", 88), 88);
assert.equal(presentedOvr("K", 86), 74);
assert.equal(presentedOvr("P", 75), 63);
assert.equal(presentedPot("WR", 88, 90), 90);
assert.equal(presentedPot("WR", 74, 99), 87);
assert.equal(presentedPot("WR", 96, 99), 99);
assert.equal(presentedPot("WR", 92, 99), 98);
assert.equal(presentedPot("K", 86, 99), 82);
assert.equal(presentOvrText("K", "84-88"), "72-76");
assert.equal(presentOvrText("K", "?"), "?");
assert.equal(presentOvrText("WR", "84-88"), "84-88");
assert.equal(presentPotText("WR", 74, "96-99"), "86-87");

{
  let prev = -1;
  for (let pot = 70; pot <= 99; pot++) {
    const shown = presentedPot("QB", 70, pot);
    assert.ok(shown >= 70 && shown <= 99);
    assert.ok(shown >= prev);
    prev = shown;
  }
}

{
  const st = newGame({ seed: 42, userTeamId: 0 });
  const rngBefore = st.rngState;
  const ownK = st.players.find((p) => p.teamId === st.userTeamId && p.pos === "K");
  assert.ok(ownK);
  const shifted = { ...ownK.attrs };
  for (const key of relevantAttrs("K")) shifted[key] = presentedAttr("K", key, ownK.attrs[key]);
  assert.equal(computeOvr(shifted, "K"), presentedOvr("K", ownK.ovr));
  assert.equal(visibleOvr(st, ownK), String(presentedOvr("K", ownK.ovr)));
  assert.notEqual(visibleOvr(st, ownK), String(ownK.ovr));
  assert.equal(visiblePot(st, ownK), String(presentedPot("K", ownK.ovr, ownK.pot)));

  const rivalK = st.players.find((p) => p.teamId !== st.userTeamId && p.teamId !== null && p.pos === "K" && !p.prospect);
  assert.ok(rivalK);
  const intel = veteranIntel(st, rivalK);
  const raw = intel.ovrHigh - intel.ovrLow <= 2
    ? String(Math.round((intel.ovrLow + intel.ovrHigh) / 2))
    : `${intel.ovrLow}-${intel.ovrHigh}`;
  assert.equal(visibleOvr(st, rivalK), presentOvrText("K", raw));
  assert.notEqual(visibleOvr(st, rivalK), String(rivalK.ovr));
  assert.equal(st.rngState, rngBefore);
}

function active(players: Player[], teamId: number): Player[] {
  return players.filter((p) => p.teamId === teamId && isActiveRoster(p) && !p.prospect && !p.retired);
}

{
  let slots = 0;
  let spec = 0;
  let n = 0;
  let pot99 = 0;
  for (const seed of [1, 42, 77, 100, 2026]) {
    const st = newGame({ seed, userTeamId: 0 });
    for (const t of st.teams) {
      const rows = active(st.players, t.id)
        .sort((a, b) => presentedOvr(b.pos, b.ovr) - presentedOvr(a.pos, a.ovr) || a.id - b.id);
      const top = rows.slice(0, 10);
      slots += top.length;
      spec += top.filter((p) => p.pos === "K" || p.pos === "P").length;
      for (const p of rows) {
        n++;
        const shown = presentedPot(p.pos, p.ovr, p.pot);
        assert.ok(shown >= presentedOvr(p.pos, p.ovr));
        if (shown >= 99) {
          pot99++;
          assert.ok(p.ovr >= 93, `${p.pos} ${p.ovr}/${p.pot} should not print 99`);
        }
      }
    }
    const user = active(st.players, st.userTeamId)
      .sort((a, b) => presentedOvr(b.pos, b.ovr) - presentedOvr(a.pos, a.ovr) || a.id - b.id);
    assert.ok(user[0].pos !== "K" && user[0].pos !== "P", `seed ${seed} best player is ${user[0].pos}`);
    const n99 = user.filter((p) => presentedPot(p.pos, p.ovr, p.pot) >= 99).length;
    assert.ok(n99 <= 1, `seed ${seed} user roster prints ${n99} players at 99`);
  }
  assert.ok(spec / slots < 0.04, `specialists still take ${(100 * spec / slots).toFixed(1)}% of top-10 slots`);
  assert.ok(pot99 / n < 0.005, `99 POT is ${(100 * pot99 / n).toFixed(2)}% of rostered players`);
}

console.log("ok    presentedRating — specialists leave the top of the roster, 99 POT is rare");
