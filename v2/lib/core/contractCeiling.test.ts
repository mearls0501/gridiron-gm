/**
 * Wave 3.8 Packet 6 — contract ceilings.
 *
 * marketApy saturates at 0.21 of the cap for a QB (OTC top-five APY ≈ 20%).
 * MAX_CONTRACT_SHARE is 0.22 (record single-season hit ≈ 25%). A max QB's
 * first tag lands ≈ 21–22%, second ≈ 26%. A third-tag 28% bust does not
 * appear in 12 seasons on seed 12345. Seed 1 still third-tags (HANDOFF).
 * See nfl-reference.md §4.
 *
 * Run: npx tsx lib/core/contractCeiling.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { makeContract, marketApy } from "./generate";
import { Rng } from "./rng";
import { capHit, isActiveRoster, startSeason, teamCap } from "./select";
import { GameState, LEAGUE_MINIMUM, MAX_CONTRACT_SHARE, Player, salaryCap } from "./types";
import { applyFranchiseTag, franchiseTagSalary, negotiatedApy } from "./offseason/contracts";
import { advance } from "./season/engine";
import { advanceOffseason, isOffseason } from "./offseason";

function ok(label: string) { console.log("ok   ", label); }

function clubActive(st: GameState, teamId: number) {
  return st.players.filter((p) => p.teamId === teamId && !p.retired && !p.prospect && isActiveRoster(p));
}

function plantMaxQb(st: GameState, teamId: number): Player {
  const p = clubActive(st, teamId).find((x) => x.pos === "QB")
    ?? st.players.find((x) => x.pos === "QB" && !x.retired && !x.prospect);
  assert.ok(p, "need a quarterback");
  p.teamId = teamId;
  p.ovr = 99;
  p.age = 27;
  p.retired = false;
  p.prospect = false;
  return p;
}

function freeUserCap(st: GameState, keepId: number): void {
  st.teams[st.userTeamId].deadCap = 0;
  st.teams[st.userTeamId].capCarryover = 0;
  for (const x of clubActive(st, st.userTeamId)) {
    if (x.id === keepId || !x.contract) continue;
    x.contract.baseSalary = x.contract.baseSalary.map(() => LEAGUE_MINIMUM);
    x.contract.signingBonus = 0;
  }
}

// (1) marketApy saturates at the new positional ceilings. Below-knee
//     shape is not this file — a replacement-level body is untouched.
{
  const st = newGame({ seed: 31 });
  const cap = salaryCap(st.season, startSeason(st));
  const qb = marketApy(99, "QB", 27, st.season, startSeason(st)) / cap;
  const edge = marketApy(99, "EDGE", 27, st.season, startSeason(st)) / cap;
  const wr = marketApy(99, "WR", 27, st.season, startSeason(st)) / cap;
  const backup = marketApy(68, "QB", 27, st.season, startSeason(st)) / cap;
  assert.ok(qb >= 0.205 && qb <= 0.212, `QB ceiling ${qb.toFixed(3)} want ≈ 0.21`);
  assert.ok(edge >= 0.125 && edge <= 0.132, `EDGE ceiling ${edge.toFixed(3)} want ≈ 0.129`);
  assert.ok(wr >= 0.108 && wr <= 0.116, `WR ceiling ${wr.toFixed(3)} want ≈ 0.113`);
  assert.ok(backup < 0.08, `below-knee QB ${backup.toFixed(3)} must stay well under the ceiling`);
  ok(`marketApy ceilings QB ${(qb * 100).toFixed(1)}% EDGE ${(edge * 100).toFixed(1)}% WR ${(wr * 100).toFixed(1)}%`);
}

// (2) No negotiated APY, at any premium, exceeds MAX_CONTRACT_SHARE.
{
  const st = newGame({ seed: 32 });
  const cap = teamCap(st, st.userTeamId).cap;
  const ceiling = Math.round(cap * MAX_CONTRACT_SHARE);
  assert.equal(MAX_CONTRACT_SHARE, 0.22);
  const qb = plantMaxQb(st, st.userTeamId);
  const piled = negotiatedApy(st, st.userTeamId, qb, 5);
  assert.ok(piled <= ceiling, `negotiatedApy ${piled} exceeds ${ceiling}`);
  let n = 0;
  for (const p of st.players) {
    if (p.retired || p.prospect) continue;
    const apy = negotiatedApy(st, st.userTeamId, p, 5);
    assert.ok(apy <= ceiling, `${p.pos} ${p.ovr} negotiated ${apy} > ${ceiling}`);
    n++;
  }
  assert.ok(n > 200);
  ok(`no negotiated APY above ${MAX_CONTRACT_SHARE} of the cap (n=${n})`);
}

// (3) Year-0 top QB sits on the new ceiling; the top five stay under 22%.
{
  const st = newGame({ seed: 33 });
  const cap = salaryCap(st.season, startSeason(st));
  const qbs = st.players
    .filter((p) => p.pos === "QB" && !p.retired && !p.prospect)
    .map((p) => marketApy(p.ovr, p.pos, p.age, st.season, startSeason(st)) / cap)
    .sort((a, b) => b - a)
    .slice(0, 5);
  assert.equal(qbs.length, 5);
  const mean = qbs.reduce((s, v) => s + v, 0) / qbs.length;
  assert.ok(qbs[0] >= 0.19 && qbs[0] <= 0.212, `top QB market ${qbs[0].toFixed(3)} want ≈ 0.20–0.21`);
  assert.ok(mean >= 0.16 && mean <= 0.22, `top-five QB market mean ${mean.toFixed(3)}`);
  ok(`year-0 top QB ${(qbs[0] * 100).toFixed(1)}%, top-five mean ${(mean * 100).toFixed(1)}%`);
}

// (4) A max QB's first tag lands ≈ 21–22%; the second is ≈ 26% of that cap.
{
  const st = newGame({ seed: 34 });
  const cap = teamCap(st, st.userTeamId).cap;
  const p = plantMaxQb(st, st.userTeamId);
  p.contract = makeContract(new Rng(2), Math.round(cap * 0.08), 1, st.season, 0);
  p.contract.yearsRemaining = 1;
  freeUserCap(st, p.id);
  const peers = st.players
    .filter((x) => x.pos === "QB" && x.id !== p.id && x.teamId !== st.userTeamId && !x.retired && !x.prospect && x.contract)
    .slice(0, 5);
  assert.ok(peers.length >= 5, "need five other quarterbacks for the snapshot");
  for (const q of peers) {
    q.age = 27;
    q.retired = false;
    q.contract = makeContract(new Rng(1), Math.round(cap * 0.21), 1, st.season, 0);
  }
  delete st.franchiseTagSnapshot;

  const tender1 = franchiseTagSalary(st, p);
  const firstPct = tender1 / cap;
  assert.ok(firstPct >= 0.205 && firstPct <= 0.225, `first tag ${(firstPct * 100).toFixed(1)}% want ≈ 21–22`);
  const rng = new Rng(st.rngState);
  const tagged = applyFranchiseTag(st, st.userTeamId, p.id, rng);
  assert.equal(tagged.ok, true, tagged.reason ?? "first tag");
  assert.ok(Math.abs(capHit(p.contract) / cap - firstPct) < 0.01);

  st.season += 1;
  const tender2 = franchiseTagSalary(st, p);
  assert.equal(tender2, Math.round(tender1 * 1.2));
  const secondPct = tender2 / cap;
  assert.ok(secondPct >= 0.246 && secondPct <= 0.27, `second tag ${(secondPct * 100).toFixed(1)}% want ≈ 26`);
  const second = applyFranchiseTag(st, st.userTeamId, p.id, rng);
  assert.equal(second.ok, true, second.reason ?? "second tag");
  ok(`max QB first tag ${(firstPct * 100).toFixed(1)}%, second ${(secondPct * 100).toFixed(1)}%`);
}

function peakTopCap(seed: number, seasons: number): { peak: number; busts: number } {
  const st = newGame({ seed });
  let peak = 0;
  let busts = 0;
  for (let s = 0; s < seasons; s++) {
    let g = 0;
    while (st.phase !== "offseason-recap" && g++ < 50) advance(st);
    const cap = salaryCap(st.season, st.season - st.history.length);
    const A = st.players.filter((p) => !p.retired && !p.prospect && p.teamId !== null && isActiveRoster(p));
    const top = Math.max(0, ...A.map((p) => capHit(p.contract)));
    const pct = (top / cap) * 100;
    if (pct > peak) peak = pct;
    if (pct > 28) busts++;
    console.log(`  seed ${seed} season ${st.season} topCap ${pct.toFixed(1)}% peak ${peak.toFixed(1)}%`);
    let o = 0;
    while (isOffseason(st.phase) && o++ < 12) advanceOffseason(st);
  }
  return { peak, busts };
}

// (5) A third-tag bust does not occur in 12 seasons on seed 12345
//     (the default harness seed). Seed 1 still reached 34.5% / 2 bust
//     seasons on this packet — Finding 2 residue: CPU may still apply
//     a third tag when the 90% gate and surplus pass. Tag rules are
//     not this packet. Measured in HANDOFF, not asserted here.
{
  const { peak, busts } = peakTopCap(12345, 12);
  assert.equal(busts, 0, `seed 12345: ${busts} seasons over 28%, peak ${peak.toFixed(1)}%`);
  assert.ok(peak < 28, `seed 12345 peak ${peak.toFixed(1)}%`);
  ok(`12-season seed 12345: peak topCap ${peak.toFixed(1)}%, busts 0`);
}
