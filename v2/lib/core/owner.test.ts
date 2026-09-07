/**
 * Owner patience, heat, and the firingEnabled bite.
 *
 * Run: npx tsx lib/core/owner.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { blankRecord } from "./select";
import {
  OWNER_MIN_SEASONS,
  ensureOwners,
  fireHeatThreshold,
  ownerHeatFor,
  ownerJobView,
} from "./owner";
import { GameState, SeasonHistory, TeamRecord } from "./types";

function ok(label: string) { console.log("ok   ", label); }

function plantYear(st: GameState, season: number, userWins: number): SeasonHistory {
  const standings: TeamRecord[] = st.teams.map((t) => {
    const r = blankRecord(t.id);
    if (t.id === st.userTeamId) {
      r.w = userWins;
      r.l = 17 - userWins;
    } else {
      r.w = 8;
      r.l = 9;
    }
    return r;
  });
  const row: SeasonHistory = {
    season,
    championId: st.userTeamId === 0 ? 1 : 0,
    runnerUpId: st.userTeamId === 1 ? 2 : 1,
    standings,
    awards: { mvp: null, opoy: null, dpoy: null, roy: null },
    leaders: { passYds: null, rushYds: null, recYds: null, sacks: null },
  };
  st.history.push(row);
  return row;
}

{
  const st = newGame({ seed: 51 });
  const before = st.rngState;
  assert.equal(st.teams[st.userTeamId].owner, undefined);
  ensureOwners(st);
  assert.equal(st.rngState, before, "owner child stream must not move the parent");
  for (const t of st.teams) {
    assert.ok(t.owner?.name, `${t.abbr} missing owner`);
    assert.ok(t.owner!.patience >= 0.35 && t.owner!.patience <= 0.80);
  }
  const a = newGame({ seed: 51 });
  const b = newGame({ seed: 52 });
  ensureOwners(a);
  ensureOwners(b);
  assert.equal(st.teams[0].owner!.name, a.teams[0].owner!.name);
  assert.notEqual(st.teams[0].owner!.name, b.teams[0].owner!.name);
  ok("ensure owners on child stream; same seed same names");
}

{
  assert.ok(fireHeatThreshold(0.35) < fireHeatThreshold(0.80), "patient owners are harder to trip");
  assert.equal(OWNER_MIN_SEASONS, 2);

  const impatientHot = ownerHeatFor(0.35, "contend", [4, 4]);
  assert.ok(
    impatientHot >= fireHeatThreshold(0.35),
    `impatient contend 4-13 twice should fire (heat ${impatientHot.toFixed(1)})`,
  );

  const patientRebuild = ownerHeatFor(0.80, "rebuild", [5, 5]);
  assert.ok(
    patientRebuild < fireHeatThreshold(0.80),
    `patient rebuild 5-12 twice should hold (heat ${patientRebuild.toFixed(1)})`,
  );
  ok("proposed firing defaults: impatient contend fires; patient rebuild holds");
}

{
  const st = newGame({ seed: 53 });
  ensureOwners(st);
  st.teams[st.userTeamId].owner!.patience = 0.35;
  plantYear(st, st.season - 2, 3);
  plantYear(st, st.season - 1, 3);

  st.settings = { ...(st.settings!), firingEnabled: false };
  const off = ownerJobView(st, st.userTeamId);
  assert.ok(off);
  assert.equal(off.firingEnabled, false);
  assert.equal(off.wouldFire, false, "firingEnabled off never fires");
  assert.ok(off.heat > 0, "heat is still computed when firing is off");

  st.settings.firingEnabled = true;
  const on = ownerJobView(st, st.userTeamId)!;
  if (on.heat >= on.threshold && on.seasonsWithGm >= OWNER_MIN_SEASONS) {
    assert.equal(on.wouldFire, true, "flag on + heat over the line means the chair is lost");
  } else {
    assert.equal(on.wouldFire, false);
  }
  ok("firingEnabled is the bite; heat is computed either way");
}

{
  const st = newGame({ seed: 54 });
  const raw = JSON.parse(JSON.stringify(st)) as GameState;
  for (const t of raw.teams) delete t.owner;
  ensureOwners(raw);
  assert.ok(raw.teams.every((t) => t.owner), "stripped save gets an owner");
  ok("old save without owner loads");
}

console.log("ok    owner people layer");
