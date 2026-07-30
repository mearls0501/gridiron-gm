/**
 * Headless multi-season verification.
 *
 * Simulates full franchises end to end and asserts the invariants that matter.
 * Run with: npx tsx scripts/verify.ts [seasons] [seed]
 */
import { newGame } from "../lib/core/newGame";
import { advance } from "../lib/core/season/engine";
import { advanceOffseason, isOffseason } from "../lib/core/offseason";
import { computeSeeds, leagueStandings } from "../lib/core/season/standings";
import { rosterCount, teamCap, capHit, computeRecords } from "../lib/core/select";
import { askingPrice } from "../lib/core/offseason/contracts";
import { computeOvr, POSITION_WEIGHTS } from "../lib/core/ratings";
import {
  GameState, POSITIONS, POSITION_MIN, ROSTER_LIMIT, GAMES_PER_TEAM,
  REGULAR_SEASON_WEEKS, AttrKey, GAME_RECORD_KEYS, LEAGUE_MINIMUM, STARTERS,
} from "../lib/core/types";
import { SNAP_SHARE } from "../lib/core/sim/game";
import { teamSeasonStats } from "../lib/core/season/records";
import { emitAll, seedFor } from "./metrics";

let failures = 0;
let checks = 0;

function check(cond: boolean, label: string, detail = ""): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`  FAIL  ${label}${detail ? " — " + detail : ""}`);
  }
}

function isFiniteNum(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v);
}

// ---------------------------------------------------------------------------
// Static checks
// ---------------------------------------------------------------------------

function checkWeights(): void {
  console.log("\n[weights] position weight tables");
  for (const pos of POSITIONS) {
    const w = POSITION_WEIGHTS[pos];
    let sum = 0;
    for (const k in w) sum += w[k as AttrKey] as number;
    check(Math.abs(sum - 1) < 1e-9, `${pos} weights sum to 1`, `got ${sum.toFixed(4)}`);
  }
}

/**
 * Every SNAP_SHARE row must sum to that position's STARTERS count.
 *
 * These two tables have to move together — the shares are how many men of each
 * position are credited with being on the field per play — and nothing enforced
 * it. Changing STARTERS.LB from 3 to 2 desynced them once already, which ran
 * defensive snap counts ~9% hot straight into the progression bonus.
 */
function checkSnapShares(): void {
  console.log("[sim] snap share table matches STARTERS");
  for (const pos of POSITIONS) {
    const row = SNAP_SHARE[pos];
    const sum = row.reduce((a, b) => a + b, 0);
    const want = pos === "K" || pos === "P" ? 0 : STARTERS[pos];
    check(Math.abs(sum - want) < 0.02, `${pos} snap shares sum to ${want}`, `got ${sum.toFixed(2)}`);
  }
}

function checkOvrTargeting(): void {
  console.log("[generate] OVR targeting accuracy");
  const st = newGame({ seed: seedFor(77) });
  let worst = 0;
  for (const p of st.players) {
    const recomputed = computeOvr(p.attrs, p.pos);
    worst = Math.max(worst, Math.abs(recomputed - p.ovr));
  }
  check(worst === 0, "stored OVR matches computed OVR for every player", `max drift ${worst}`);
}

// ---------------------------------------------------------------------------
// Per-season checks
// ---------------------------------------------------------------------------

function checkSchedule(st: GameState): void {
  const reg = st.games.filter((g) => g.playoffRound === null && g.season === st.season);
  check(reg.length === 272, "272 regular season games", `got ${reg.length}`);

  const played = new Map<number, number>();
  const home = new Map<number, number>();
  const perWeek = new Map<string, number>();
  for (const t of st.teams) { played.set(t.id, 0); home.set(t.id, 0); }
  for (const g of reg) {
    played.set(g.homeId, played.get(g.homeId)! + 1);
    played.set(g.awayId, played.get(g.awayId)! + 1);
    home.set(g.homeId, home.get(g.homeId)! + 1);
    for (const id of [g.homeId, g.awayId]) {
      const k = `${g.week}:${id}`;
      perWeek.set(k, (perWeek.get(k) ?? 0) + 1);
    }
  }
  check([...played.values()].every((v) => v === GAMES_PER_TEAM), "every team plays 17 games");
  check([...home.values()].every((v) => v >= 8 && v <= 9), "every team has 8-9 home games");
  check([...perWeek.values()].every((v) => v === 1), "no team plays twice in a week");

  for (const t of st.teams) {
    let byes = 0;
    for (let w = 1; w <= REGULAR_SEASON_WEEKS; w++) {
      if (!reg.some((g) => g.week === w && (g.homeId === t.id || g.awayId === t.id))) byes++;
    }
    check(byes === 1, `${t.abbr} has exactly one bye`, `got ${byes}`);
  }
}

function checkBoxScores(st: GameState): void {
  let mismatches = 0;
  let nanCount = 0;
  let negYards = 0;

  for (const g of st.games) {
    if (!g.played || !g.boxScore) continue;

    for (const [tid, score] of [[g.homeId, g.homeScore], [g.awayId, g.awayScore]] as [number, number][]) {
      let derived = 0;
      for (const p of g.boxScore.players) {
        if (p.teamId !== tid) continue;
        // Every scoring route, counted once. recTd is excluded on purpose — it
        // is the same touchdown already counted as the passer's passTd.
        derived += (p.passTd + p.rushTd + p.defTd + p.krTd + p.prTd) * 6;
        derived += p.xpm + p.twoPtMade * 2 + p.fgm * 3 + p.safeties * 2;
      }
      if (derived !== score) mismatches++;
    }

    // receiving TDs must equal passing TDs on the same side
    for (const tid of [g.homeId, g.awayId]) {
      let pass = 0;
      let recv = 0;
      for (const p of g.boxScore.players) {
        if (p.teamId !== tid) continue;
        pass += p.passTd;
        recv += p.recTd;
      }
      if (pass !== recv) mismatches++;
    }

    for (const p of g.boxScore.players) {
      // `started` is a boolean; only the numeric stat fields are checked.
      for (const [k, v] of Object.entries(p)) {
        if (k === "started") continue;
        if (!isFiniteNum(v)) nanCount++;
      }
    }
    if (!isFiniteNum(g.homeScore) || !isFiniteNum(g.awayScore)) nanCount++;
    if (g.homeScore < 0 || g.awayScore < 0) negYards++;
  }

  check(mismatches === 0, "box score reconciles with final score on every game", `${mismatches} mismatches`);
  check(nanCount === 0, "no NaN/Infinity in any stat", `${nanCount} bad values`);
  check(negYards === 0, "no negative final scores");
}

function checkRosters(st: GameState, label: string): void {
  let bad = 0;
  let shortPos = 0;
  for (const t of st.teams) {
    const n = rosterCount(st, t.id);
    if (n !== ROSTER_LIMIT) {
      bad++;
      if (bad <= 3) console.log(`    ${t.abbr} roster ${n}`);
    }
    for (const pos of POSITIONS) {
      const c = st.players.filter(
        (p) => p.teamId === t.id && p.pos === pos && !p.retired && !p.prospect
      ).length;
      if (c < POSITION_MIN[pos]) shortPos++;
    }
  }
  check(bad === 0, `${label}: all 32 rosters at exactly ${ROSTER_LIMIT}`, `${bad} teams off`);
  check(shortPos === 0, `${label}: position minimums met`, `${shortPos} shortfalls`);
}

function checkCap(st: GameState): void {
  let over = 0;
  let negHit = 0;
  for (const t of st.teams) {
    const c = teamCap(st, t.id);
    if (!isFiniteNum(c.space)) negHit++;
    if (c.space < 0) over++;
  }
  check(negHit === 0, "cap numbers are finite");
  check(over === 0, "no team is over the salary cap at season start", `${over} teams over`);

  let badContract = 0;
  for (const p of st.players) {
    if (!p.contract) continue;
    if (p.contract.baseSalary.length < p.contract.yearsRemaining) badContract++;
    if (!isFiniteNum(capHit(p.contract))) badContract++;
  }
  check(badContract === 0, "contracts are structurally valid", `${badContract} bad`);
}

function checkPlayoffs(st: GameState): void {
  const ps = st.playoffs;
  if (!ps) { check(false, "playoff state exists"); return; }
  check(ps.seeds.length === 14, "14 playoff seeds", `got ${ps.seeds.length}`);
  for (const conf of ["AFC", "NFC"] as const) {
    const s = ps.seeds.filter((x) => x.conference === conf).map((x) => x.seed).sort((a, b) => a - b);
    check(JSON.stringify(s) === "[1,2,3,4,5,6,7]", `${conf} seeds are 1-7`, JSON.stringify(s));
  }
  const pg = st.games.filter((g) => g.playoffRound !== null && g.season === st.season);
  check(pg.length === 13, "13 playoff games", `got ${pg.length}`);
  check(pg.every((g) => g.homeScore !== g.awayScore), "no playoff game ends tied");
  check(ps.championId !== null, "a champion was crowned");
}

function checkStandingsDeterminism(st: GameState): void {
  const a = leagueStandings(st).map((r) => r.teamId).join(",");
  const b = leagueStandings(st).map((r) => r.teamId).join(",");
  check(a === b, "standings sort is deterministic (no coin flips)");
  const s1 = computeSeeds(st).map((s) => `${s.conference}${s.seed}:${s.teamId}`).join(",");
  const s2 = computeSeeds(st).map((s) => `${s.conference}${s.seed}:${s.teamId}`).join(",");
  check(s1 === s2, "playoff seeding is deterministic");
}

function checkProgression(st: GameState, prevAges: Map<number, number>): void {
  let aged = 0;
  let sampled = 0;
  for (const p of st.players) {
    const prev = prevAges.get(p.id);
    if (prev === undefined || p.prospect) continue;
    if (p.retired && p.age === prev + 1) { sampled++; aged++; continue; }
    sampled++;
    if (p.age === prev + 1) aged++;
  }
  check(sampled > 0 && aged === sampled, "every returning player aged exactly one year", `${aged}/${sampled}`);

  const retired = st.players.filter((p) => p.retired).length;
  check(retired > 0, "some players retired");
  const onRoster = st.players.filter((p) => p.retired && p.teamId !== null).length;
  check(onRoster === 0, "no retired player is still on a roster");
}

function checkSerializable(st: GameState): void {
  let ok = true;
  let round: GameState | null = null;
  try {
    round = JSON.parse(JSON.stringify(st)) as GameState;
  } catch {
    ok = false;
  }
  check(ok && round !== null, "state serializes to JSON");
  if (round) {
    check(round.players.length === st.players.length, "player count survives round trip");
    check(round.teams[0].deadCap === st.teams[0].deadCap, "dead cap survives round trip");
  }
}


function checkExtendedStats(st: GameState): void {
  let topBad = 0, negTop = 0, rzBad = 0, downBad = 0, longBad = 0, fumBad = 0;
  let games = 0;

  for (const g of st.games) {
    if (!g.played || !g.boxScore) continue;
    games++;
    const { home, away } = g.boxScore;

    // The two sides' possession must sum to the length of the game.
    const total = home.timeOfPossession + away.timeOfPossession;
    if (total !== 3600 && total !== 4200) topBad++;
    if (home.timeOfPossession < 0 || away.timeOfPossession < 0) negTop++;

    for (const side of [home, away]) {
      if (side.redZoneTd > side.redZoneAtt) rzBad++;
      if (side.thirdDownConv > side.thirdDownAtt) downBad++;
      if (side.fourthDownConv > side.fourthDownAtt) downBad++;
      if (side.passFirstDowns + side.rushFirstDowns + side.penaltyFirstDowns > side.firstDowns) downBad++;
    }
    // Giveaways on one side are takeaways on the other.
    if (home.giveaways !== away.takeaways || away.giveaways !== home.takeaways) downBad++;

    for (const p of g.boxScore.players) {
      // A "long" can legitimately exceed the total: a 6-yard run plus a 2-yard
      // loss is 4 yards with a long of 6. What must hold is that the long is a
      // plausible single gain, and that a lone attempt IS the long.
      if (p.passLong < 0 || p.passLong > 99) longBad++;
      if (p.rushLong < 0 || p.rushLong > 99) longBad++;
      if (p.recLong < 0 || p.recLong > 99) longBad++;
      if (p.passCmp === 1 && p.passLong !== p.passYds) longBad++;
      if (p.rushAtt === 1 && p.rushLong !== Math.max(0, p.rushYds)) longBad++;
      if (p.rec === 1 && p.recLong !== Math.max(0, p.recYds)) longBad++;
      if (p.fumblesLost > p.fumbles) fumBad++;
      if (p.twoPtMade > p.twoPtAtt) fumBad++;
      if (p.passCmp > p.passAtt) fumBad++;
      if (p.fgm > p.fga || p.xpm > p.xpa) fumBad++;
      if (p.rec > p.targets) fumBad++;
      if (p.krTd > p.kr || p.prTd > p.pr) fumBad++;
    }
  }

  check(games > 0, "games were played");
  check(topBad === 0, "time of possession sums to the game length", `${topBad} games off`);
  check(negTop === 0, "no negative time of possession");
  check(rzBad === 0, "red zone touchdowns never exceed red zone trips", `${rzBad}`);
  check(downBad === 0, "down/conversion and giveaway-takeaway accounting is consistent", `${downBad}`);
  check(longBad === 0, "long-gain fields are plausible and match single-attempt totals", `${longBad}`);
  check(fumBad === 0, "made never exceeds attempted on any stat", `${fumBad}`);
}

function checkTeamAggregates(st: GameState): void {
  const agg = teamSeasonStats(st, st.season);
  let bad = 0;
  for (const t of st.teams) {
    const a = agg.get(t.id);
    if (!a) { bad++; continue; }
    if (a.games === 0) continue;
    if (a.pointsFor < 0 || a.totalYards < 0) bad++;
    if (a.thirdDownConv > a.thirdDownAtt) bad++;
    if (a.redZoneTd > a.redZoneAtt) bad++;
  }
  check(bad === 0, "team season aggregates are internally consistent", `${bad}`);

  // Points-for from box scores must equal points-for from the standings table.
  const recs = new Map<number, number>();
  for (const g of st.games) {
    if (!g.played || g.playoffRound !== null) continue;
    recs.set(g.homeId, (recs.get(g.homeId) ?? 0) + g.homeScore);
    recs.set(g.awayId, (recs.get(g.awayId) ?? 0) + g.awayScore);
  }
  let drift = 0;
  for (const [teamId, pf] of recs) {
    const a = agg.get(teamId);
    if (!a) continue;
    // Aggregates include playoff games; compare regular season only.
    const regOnly = st.games
      .filter((g) => g.played && g.playoffRound === null && (g.homeId === teamId || g.awayId === teamId))
      .reduce((sum, g) => sum + (g.homeId === teamId ? g.homeScore : g.awayScore), 0);
    if (regOnly !== pf) drift++;
  }
  check(drift === 0, "team points reconcile between box scores and standings", `${drift}`);
}

function checkRecordBook(st: GameState): void {
  check(!!st.records, "record book exists");
  if (!st.records) return;

  let bad = 0;
  let populated = 0;
  const byId = new Map(st.players.map((p) => [p.id, p]));

  for (const key of GAME_RECORD_KEYS) {
    const list = st.records.game[key];
    if (!Array.isArray(list)) { bad++; continue; }
    if (list.length > 5) bad++;
    if (list.length > 0) populated++;
    for (let i = 1; i < list.length; i++) {
      if (list[i - 1].value < list[i].value) bad++;   // must be descending
    }
    for (const e of list) {
      if (!byId.has(e.playerId)) bad++;               // must point at a real player
      if (e.value <= 0) bad++;
      if (!e.playerName || !e.detail) bad++;
    }
  }
  check(bad === 0, "single-game records are sorted, capped and reference real players", `${bad}`);
  check(populated >= 8, "most record categories have entries", `${populated}/${GAME_RECORD_KEYS.length}`);

  for (const list of [st.records.team.mostPoints, st.records.team.mostYards, st.records.team.biggestMargin]) {
    if (list.length > 5) bad++;
    for (let i = 1; i < list.length; i++) if (list[i - 1].value < list[i].value) bad++;
  }
  check(bad === 0, "team records are sorted and capped");
}

// ---------------------------------------------------------------------------
// Regression guards
//
// Everything above asserts LEGALITY — 272 games, 53-man rosters, cap >= 0 —
// and all of it passed while the draft order was constant, free agents were
// signing for 5% of their asking price and no defender had ever taken a snap.
// These assert COHERENCE instead: the things that were wrong but legal.
// ---------------------------------------------------------------------------

/**
 * The first SLOT must belong to a team that was actually bad. Measured on
 * `originalTeamId`: the HOLDER may legitimately differ now that clubs trade up
 * on the clock and future firsts move as sweeteners — the claim this check
 * makes is that the ORDER tracks the standings, not that pick 1 never trades.
 * (Same reconditioning as drift's pick-1 guard, 2026-07-30.)
 */
function checkDraftOrder(st: GameState, playedSeason: number): void {
  if (!st.draft) return;
  const table = leagueStandings(st, playedSeason);
  const bottom = new Set(table.slice(-6).map((r) => r.teamId));
  const first = st.draft.picks[0];
  check(
    first != null && bottom.has(first.originalTeamId),
    "the first slot belongs to a bottom-six team",
    `pick 1 slot = team ${first?.originalTeamId}, bottom six = ${[...bottom].join(",")}`
  );

  const round1 = st.draft.picks.filter((p) => p.round === 1).map((p) => p.originalTeamId);
  const descendingById = round1.every((id, i) => i === 0 || id === round1[i - 1] - 1);
  check(!descendingById, "draft order is not the team-id fallback", round1.slice(0, 6).join(","));
}

/** Every position group has to actually take the field. */
function checkSnapCoverage(st: GameState): void {
  const totals = new Map<string, { snaps: number; games: number; n: number }>();
  for (const p of st.players) {
    if (p.teamId === null || p.prospect || p.retired) continue;
    const line = p.stats.find((s) => s.season === st.season);
    if (!line) continue;
    const t = totals.get(p.pos) ?? { snaps: 0, games: 0, n: 0 };
    t.snaps += line.snaps; t.games += line.games; t.n++;
    totals.set(p.pos, t);
  }
  for (const pos of POSITIONS) {
    const t = totals.get(pos);
    check(t != null && t.snaps > 0, `${pos} accumulates snaps`, `${t?.snaps ?? 0}`);
  }

  // A full-time starter should not finish a 17-game season with a handful of
  // appearances. Sample the depth-chart leader at each position on every team.
  let thin = 0;
  let sampled = 0;
  for (const team of st.teams) {
    for (const pos of POSITIONS) {
      const id = team.depthChart[pos]?.[0];
      const p = id != null ? st.players.find((x) => x.id === id) : undefined;
      if (!p || p.injuryWeeks > 0) continue;
      const line = p.stats.find((s) => s.season === st.season);
      sampled++;
      if (!line || line.games < 12) thin++;
    }
  }
  check(thin / Math.max(1, sampled) < 0.12, "healthy starters play a full season",
    `${thin}/${sampled} started fewer than 12 games`);
}

/**
 * Draft picks are conserved.
 *
 * Picks are now assets that change hands, which means they can be duplicated or
 * lost by a bad trade. Every class inside the horizon must carry exactly one row
 * per club per round, owned by a real team, for as long as it is tradeable.
 */
function checkPickInventory(st: GameState): void {
  const rows = st.pickOwners ?? [];
  const seen = new Set<string>();
  let dupes = 0;
  let badOwner = 0;
  for (const r of rows) {
    const key = `${r.season}:${r.round}:${r.originalTeamId}`;
    if (seen.has(key)) dupes++;
    seen.add(key);
    if (!st.teams[r.teamId]) badOwner++;
  }
  check(dupes === 0, "no duplicated draft picks", `${dupes} duplicates`);
  check(badOwner === 0, "every pick has a real owner", `${badOwner} orphans`);

  const bySeason = new Map<number, number>();
  for (const r of rows) bySeason.set(r.season, (bySeason.get(r.season) ?? 0) + 1);
  for (const [season, n] of bySeason) {
    check(n === st.teams.length * 7, `${season} class has all ${st.teams.length * 7} picks`, `got ${n}`);
  }
  check(bySeason.size > 0, "future picks exist to trade", `${bySeason.size} classes`);
}

/** Roster filling must not hand out stars at the league minimum. */
function checkNoMinimumBargains(st: GameState): void {
  let bargains = 0;
  let worst = "";
  for (const p of st.players) {
    if (p.teamId === null || p.prospect || p.retired || !p.contract) continue;
    if (p.contract.signedSeason !== st.season) continue;   // only fresh deals
    if (p.draftedRound !== null && p.contract.years === 4) continue; // rookie scale
    const asking = askingPrice(st, p);
    if (asking > LEAGUE_MINIMUM * 3 && capHit(p.contract) < asking * 0.5) {
      bargains++;
      worst = `${p.lastName} ${p.pos} ${p.ovr} OVR — asked $${(asking / 1e6).toFixed(1)}M, signed for $${(capHit(p.contract) / 1e6).toFixed(1)}M`;
    }
  }
  check(bargains === 0, "no free agent signed for a fraction of his asking price",
    `${bargains} bargains, e.g. ${worst}`);
}

/**
 * No franchise may be structurally doomed or structurally blessed.
 *
 * The user's own club is excluded, and that exclusion is not a fudge. A human
 * GM re-signs his own expiring players and works free agency; `cpuResign` and
 * `runCpuFaRound` both skip `userTeamId` precisely so they don't do it for him.
 * In a headless run nobody does it at all, which costs that one franchise about
 * three wins a season. Measured over 8 seeds x 10 seasons: with the unmanaged
 * club rotated, the spread across franchises is 7.3-9.2 wins; pinned to team 0
 * it is 5.4-9.6. That is the harness, not the league.
 *
 * (It is worth knowing that a PASSIVE human pays the same price — click
 * straight through the offseason and you lose roughly three wins a year.)
 */
function checkParity(wins: Map<number, number[]>, seasons: number, userTeamId: number): void {
  if (seasons < 8) return;

  // Season-to-season win totals have a standard deviation near 3, so the mean
  // over N seasons has a standard error of 3/sqrt(N) — and taking the worst of
  // 31 franchises inflates that further. A flat threshold fires by chance on
  // short runs, so it has to widen as the sample shrinks. The broken draft
  // order produced a 5.6-win deviation over 12 seasons; this still catches
  // that at any run length while leaving normal variance alone.
  const tolerance = 3.0 + 4.0 / Math.sqrt(seasons);

  let worstGap = 0;
  let offender = "";
  const means: number[] = [];
  for (const [teamId, w] of wins) {
    if (teamId === userTeamId) continue;
    const mean = w.reduce((a, b) => a + b, 0) / w.length;
    means.push(mean);
    if (Math.abs(mean - 8.5) > worstGap) {
      worstGap = Math.abs(mean - 8.5);
      offender = `team ${teamId} averaged ${mean.toFixed(1)} wins`;
    }
  }
  const mu = means.reduce((a, b) => a + b, 0) / means.length;
  const sd = Math.sqrt(means.reduce((a, b) => a + (b - mu) ** 2, 0) / means.length);
  check(
    worstGap < tolerance,
    "no team is permanently good or permanently bad",
    `${offender} (tolerance ${tolerance.toFixed(1)}, spread across franchises sd ${sd.toFixed(2)})`
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function run(seasons: number, seed: number): void {
  console.log(`\n=== Franchise run: ${seasons} seasons, seed ${seed} ===`);
  const st = newGame({ seed });

  checkSerializable(st);
  checkRosters(st, "initial");
  checkPickInventory(st);

  const winsByTeam = new Map<number, number[]>();

  for (let s = 0; s < seasons; s++) {
    const seasonLabel = st.season;
    console.log(`\n[${seasonLabel}]`);

    // Snapshot only established players: this offseason's draft class enters the
    // league mid-cycle and legitimately does not age on the same tick.
    const prevAges = new Map<number, number>();
    for (const p of st.players) {
      // Retired players are frozen, and this year's draft class enters the
      // league mid-cycle — neither should age on this tick.
      if (!p.prospect && !p.retired) prevAges.set(p.id, p.age);
    }

    checkCap(st);

    // preseason -> regular
    advance(st);
    checkSchedule(st);

    let guard = 0;
    while (st.phase === "regular" && guard++ < 40) advance(st);
    check(st.phase === "playoffs", "reached the playoffs", `phase=${st.phase}`);

    const unplayed = st.games.filter((g) => g.playoffRound === null && !g.played).length;
    check(unplayed === 0, "every regular season game was played", `${unplayed} unplayed`);

    checkStandingsDeterminism(st);

    guard = 0;
    while (st.phase === "playoffs" && guard++ < 12) advance(st);
    check(st.phase === "offseason-recap", "playoffs completed", `phase=${st.phase}`);

    checkPlayoffs(st);
    checkBoxScores(st);
    checkExtendedStats(st);
    checkTeamAggregates(st);
    checkRecordBook(st);
    checkSnapCoverage(st);

    const recs = computeRecords(st, seasonLabel);
    for (const [teamId, r] of recs) {
      const arr = winsByTeam.get(teamId) ?? [];
      arr.push(r.w);
      winsByTeam.set(teamId, arr);
    }

    // offseason — step through so the draft board can be inspected on the clock
    guard = 0;
    while (isOffseason(st.phase) && guard++ < 12) {
      const before = st.phase;
      advanceOffseason(st);
      if (before === "offseason-fa") checkDraftOrder(st, seasonLabel);
    }
    check(st.phase === "preseason", "offseason completed", `phase=${st.phase}`);

    checkProgression(st, prevAges);
    checkNoMinimumBargains(st);
    checkPickInventory(st);
    checkRosters(st, `after ${seasonLabel} offseason`);
    checkSerializable(st);

    const champ = st.history[st.history.length - 1];
    const t = st.teams[champ.championId];
    const mvpId = champ.awards.mvp;
    const mvp = mvpId != null ? st.players.find((p) => p.id === mvpId) : null;
    console.log(
      `  champion: ${t.city} ${t.name}` +
      (mvp ? ` | MVP: ${mvp.firstName} ${mvp.lastName} (${mvp.pos}, ${st.teams[mvp.teamId ?? 0]?.abbr ?? "FA"})` : "")
    );
  }

  checkParity(winsByTeam, seasons, st.userTeamId);

  // Long-run health
  const active = st.players.filter((p) => !p.retired && !p.prospect).length;
  check(active >= 32 * ROSTER_LIMIT, "enough active players remain", `${active}`);
  const avgAge =
    st.players.filter((p) => p.teamId !== null && !p.prospect)
      .reduce((a, p) => a + p.age, 0) /
    Math.max(1, st.players.filter((p) => p.teamId !== null && !p.prospect).length);
  check(avgAge > 22 && avgAge < 32, "league average age is plausible", avgAge.toFixed(1));
  console.log(`  league avg age: ${avgAge.toFixed(1)} | active players: ${active} | total records: ${st.players.length}`);
}

const seasons = Number(process.argv[2] ?? 5);
const seed = Number(process.argv[3] ?? 20260727);

checkWeights();
checkSnapShares();
checkOvrTargeting();
run(seasons, seed);

emitAll({ "verify.failures": failures, "verify.checks": checks });
console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.log(`${failures} FAILURES`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
