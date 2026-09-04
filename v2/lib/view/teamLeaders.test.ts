/**
 * Regression: Team Leaders / receiving boards named defenders.
 *
 * Playtest chain 0903 (Kansas City Stampede): a LB/DB with leftover
 * recYds sorted above the club's WR. Receiving is WR/TE/RB only.
 *
 * Run: npx tsx lib/view/teamLeaders.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "../core/newGame";
import { blankSeasonLine, leaders } from "../core/season/stats";
import { receivingLeaders, teamLeaders } from "./teamLeaders";

function plantLine(
  st: ReturnType<typeof newGame>,
  pos: "WR" | "TE" | "RB" | "LB" | "CB" | "S" | "EDGE",
  recYds: number,
  extra: { rec?: number; tackles?: number; rushYds?: number; passYds?: number } = {},
) {
  const p = st.players.find((x) => x.teamId === st.userTeamId && x.pos === pos && !x.retired && !x.prospect);
  assert.ok(p, `need a rostered ${pos}`);
  const line = blankSeasonLine(st.season, st.userTeamId);
  line.games = 8;
  line.rec = extra.rec ?? (recYds > 0 ? 20 : 0);
  line.recYds = recYds;
  line.tackles = extra.tackles ?? 0;
  line.rushYds = extra.rushYds ?? 0;
  line.passYds = extra.passYds ?? 0;
  p.stats = [line];
  return p;
}

{
  const st = newGame({ seed: 1 });
  const lb = plantLine(st, "LB", 900, { rec: 60, tackles: 80 });
  const wr = plantLine(st, "WR", 400, { rec: 30 });

  const rec = receivingLeaders(st, { teamId: st.userTeamId });
  assert.equal(rec.length, 1, "only the WR qualifies");
  assert.equal(rec[0].player.id, wr.id);
  assert.ok(rec.every((r) => r.player.pos !== "LB"));

  const card = teamLeaders(st, st.userTeamId);
  const receiving = card.find((r) => r.kind === "receiving");
  assert.ok(receiving, "Team Leaders has a receiving row");
  assert.equal(receiving.player.id, wr.id, "Team Leaders receiving names the WR");
  assert.notEqual(receiving.player.id, lb.id);
  assert.ok(card.filter((r) => r.kind === "receiving").every((r) => r.player.pos !== "LB"));

  const league = leaders(st, "recYds");
  assert.ok(league.every((r) => r.player.pos === "WR" || r.player.pos === "TE" || r.player.pos === "RB"));
  assert.equal(league[0]?.player.id, wr.id);
}

{
  const st = newGame({ seed: 2 });
  plantLine(st, "CB", 1200, { rec: 80, tackles: 40 });
  const card = teamLeaders(st, st.userTeamId);
  assert.equal(card.find((r) => r.kind === "receiving"), undefined, "defender-only recYds → empty receiving");
  assert.equal(receivingLeaders(st, { teamId: st.userTeamId }).length, 0);
  assert.equal(leaders(st, "recYds").length, 0);
}

{
  const st = newGame({ seed: 3 });
  const te = plantLine(st, "TE", 350, { rec: 28 });
  plantLine(st, "S", 800, { rec: 50 });
  const rec = receivingLeaders(st, { teamId: st.userTeamId, limit: 5 });
  assert.equal(rec[0].player.id, te.id);
  assert.ok(rec.every((r) => r.player.pos === "WR" || r.player.pos === "TE" || r.player.pos === "RB"));
}

{
  const st = newGame({ seed: 4 });
  plantLine(st, "EDGE", 500, { rec: 40, rushYds: 700 });
  const rb = plantLine(st, "RB", 50, { rec: 8, rushYds: 200 });
  const card = teamLeaders(st, st.userTeamId);
  const rush = card.find((r) => r.kind === "rushing");
  assert.ok(rush);
  assert.equal(rush.player.id, rb.id, "rushing sit-class does not credit an EDGE");
  assert.equal(card.find((r) => r.kind === "receiving")?.player.id, rb.id);
}

console.log("ok    Team Leaders receiving names WR/TE/RB, never a defender");
