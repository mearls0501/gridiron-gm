/**
 * Quarterback emergency under the NFL rule (2023 emergency third quarterback,
 * kept by the 2024 NFLPA veto): an inactive quarterback on the 53 may enter
 * once the first two are out; a practice-squad quarterback plays only if he was
 * elevated before kickoff. A full 53 uses a game-day elevation that reverts
 * after the games.
 *
 * Run: npx tsx lib/core/emergencyQb.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { advance } from "./season/engine";
import { advanceOffseason } from "./offseason";
import { emergencyQuarterback } from "./emergencyQb";
import { placeOnPs } from "./rosterStatus";
import { Game, GameState, Player } from "./types";

function ok(label: string) { console.log("ok   ", label); }

// (1) Mid-game, a practice-squad quarterback is never handed the ball.
{
  const st = newGame({ seed: 21 });
  st.phase = "regular";
  const team = st.teams[0];
  const qbs = st.players.filter((p) => p.teamId === team.id && p.pos === "QB" && !p.status);
  for (const q of qbs) q.injuryWeeks = 6;
  const spare = st.players.find((p) => p.teamId === team.id && p.pos !== "QB" && !p.status)!;
  spare.pos = "QB";
  spare.injuryWeeks = 0;
  assert.equal(placeOnPs(st, spare.id).ok, true);
  assert.equal(emergencyQuarterback(st, team, new Set()), null, "no mid-game elevation");
  assert.equal(spare.status, "ps");
}
ok("mid-game: no practice-squad quarterback without a pre-kickoff elevation");

// (2) A season and a playoff run, headless: every box-score row was dressed at
// kickoff (not on the practice squad), and no game-day elevation outlives its week.
{
  const st = newGame({ seed: 42 });
  let rows = 0, gameday = 0, g = 0;
  const atKickoff = new Map<number, Map<number, string>>();
  const observe = (s: Readonly<GameState>, games: readonly Game[]) => {
    const status = new Map<number, string>();
    for (const p of s.players as Player[]) if (p.teamId !== null) status.set(p.id, p.status ?? "active");
    for (const gm of games) atKickoff.set(gm.id, status);
    gameday += (s.players as Player[]).filter((p) => p.gamedayElevation).length;
  };
  while (st.phase !== "offseason-recap" && g++ < 60) {
    advance(st, observe);
    for (const p of st.players) assert.equal(p.gamedayElevation, undefined, "reverted after the games");
  }
  for (const gm of st.games) {
    const status = atKickoff.get(gm.id);
    if (!status || !gm.boxScore) continue;
    for (const row of gm.boxScore.players) {
      rows++;
      assert.notEqual(status.get(row.playerId), "ps", `practice-squad player ${row.playerId} played in game ${gm.id} unelevated`);
    }
  }
  assert.ok(rows > 10_000);
  advanceOffseason(st);
  console.log(`      (${gameday} game-day elevations across the season)`);
}
ok("a season: no unelevated practice-squad player in any box score");

console.log("emergencyQb: all passed");
