/**
 * QB supply census. Read-only. One seed, headless.
 *
 * Recomputes `cpuBoardValue` in this file and checks it against
 * `cpuBoardShortlist` (the engine's own score). Does not edit a roster
 * the sim keeps: the drafted player is unmarked for the measurement and
 * restored before the next call. Cutdown labels are the same worth
 * function `moveWorstSurplus` uses, read off the spring 53.
 *
 *   npx tsx scripts/qbSupplyCensus.ts [seasons] [seed]
 *
 * Defaults: 12 seasons, seed 12345.
 */
import { newGame } from "../lib/core/newGame";
import { advance } from "../lib/core/season/engine";
import {
  advanceOffseason, availableProspects, buildDraftPicks, cpuBoardShortlist,
  DRAFT_UNTIL_USER_LIMIT, enterCampAfterDraft, FULL_DRAFT_PICK_GUARD, initDraft,
  isOffseason, runAllFaWaves, runOffseasonTrades, stepDraftUntilUser, stepFullDraft,
} from "../lib/core/offseason";
import { dropSpentInboxOffers, pruneStaleTradeInbox, runDraftDayTrades } from "../lib/core/trades";
import { settleWaivers } from "../lib/core/waivers";
import { Rng, clamp } from "../lib/core/rng";
import { POSITION_VALUE } from "../lib/core/ratings";
import {
  evaluate, frontOffice, Posture, REPLACEMENT_OVR, teamOutlook,
} from "../lib/core/frontOffice";
import { cpuExpectedView, riskDiscount } from "../lib/core/scouting";
import { isActiveRoster, positionCount } from "../lib/core/select";
import { draftCapitalHold } from "../lib/core/offseason/contracts";
import {
  GameState, Player, POSITION_MIN, POSITION_TARGET, STARTERS,
} from "../lib/core/types";
import { progress } from "./metrics";

const SEASONS = Number(process.argv[2] ?? 12);
const SEED = Number(process.argv[3] ?? 12345);

type Carrier = "thin" | "marginal" | "value";
type Label = Carrier | "base";
type KeepRule = "at-limit" | "hold" | "position-value" | "both" | "either" | "ability";

interface Comp {
  above: number;
  posScale: number;
  startsHere: number;
  bias: number;
  rebuildUpside: number;
  needWeight: number;
  marginal: number;
  thin: number;
  risk: number;
  incumbent: number;
  qbCount: number;
}

interface QbPick {
  classSeason: number;
  round: number;
  teamId: number;
  user: boolean;
  qbCount: number;
  starterOvr: number;
  marginal: number;
  thin: number;
  startsHere: number;
  trueOvr: number;
  carrier: Label;
  decisive: boolean;
  flip: Record<Carrier, boolean>;
  rank: number;
  pool: number;
}

interface ExtraQb {
  rank: number;
  ovr: number;
  rule: KeepRule;
  hold: number;
  rookie: boolean;
  draftedRound: number | null;
}

interface ClubSpring {
  teamId: number;
  user: boolean;
  active: number;
  ps: number;
  ir: number;
  extras: ExtraQb[];
}

interface SpringRow {
  season: number;
  kind: "opening" | "cutdown";
  drafted: number;
  pool: number;
  clubs: ClubSpring[];
}

const picks: QbPick[] = [];
const springs: SpringRow[] = [];
const poolByClass = new Map<number, number>();
const seen = new Set<number>();

/** The displaced starter, same read as `cpuBoardValue`. */
function startersAt(state: GameState, teamId: number, pos: Player["pos"]): number {
  const group = state.players
    .filter((p) => p.teamId === teamId && p.pos === pos && !p.retired && !p.prospect)
    .map((p) => p.ovr)
    .sort((a, b) => b - a);
  const jobs = STARTERS[pos];
  if (group.length < jobs) return REPLACEMENT_OVR;
  return group[jobs - 1];
}

/** Local copy of `cpuBoardValue`. Checked against the engine on every QB pick. */
function components(state: GameState, teamId: number, p: Player, posture: Posture): Comp {
  const fo = frontOffice(state, teamId);
  const view = cpuExpectedView(state, teamId, p);
  const room = Math.max(0, view.pot - view.ovr);
  const perceived = view.ovr + (fo.risk - 0.5) * room * 0.35;
  const upside = room * (0.18 + fo.risk * 0.30);
  const incumbent = startersAt(state, teamId, p.pos);
  const marginal = clamp((view.ovr - incumbent) / 20, -0.6, 1);
  const qbCount = positionCount(state, teamId, p.pos);
  const thin = qbCount < POSITION_TARGET[p.pos] ? 0.35 : 0;
  const needWeight = (1 - fo.bpaBias) * 0.55;
  const bias = fo.posBias[p.pos] ?? 1;
  const rebuildUpside = posture === "rebuild" ? 1 + room * 0.012 : 1;
  const startsHere = clamp((view.ovr - incumbent + 6) / 12, p.pos === "QB" ? 0 : 0.25, 1);
  const above = Math.max(1, perceived - REPLACEMENT_OVR + upside);
  return {
    above,
    posScale: Math.sqrt(POSITION_VALUE[p.pos]),
    startsHere,
    bias,
    rebuildUpside,
    needWeight,
    marginal,
    thin,
    risk: riskDiscount(p),
    incumbent,
    qbCount,
  };
}

function score(c: Comp, mode: "full" | "no-thin" | "no-marginal" | "no-value"): number {
  const marginal = mode === "no-marginal" ? 0 : c.marginal;
  const thin = mode === "no-thin" ? 0 : c.thin;
  const need = clamp(marginal + thin, -0.6, 1);
  const posScale = mode === "no-value" ? 1 : c.posScale;
  return c.above * posScale * c.startsHere * c.bias * c.rebuildUpside *
    (1 + need * c.needWeight) * c.risk;
}

/**
 * Which term put this quarterback over the best non-quarterback.
 * A term flips the pick when his full score beats that man and the
 * score with the term removed does not. Several flippers: the largest
 * drop. None: the largest positive drop, and the pick is not decisive.
 */
function carrierOf(
  full: number, alt: number | null, dropped: Record<Carrier, number>,
): { carrier: Label; decisive: boolean; flip: Record<Carrier, boolean> } {
  const terms: Carrier[] = ["thin", "marginal", "value"];
  const flip = {
    thin: alt != null && full > alt && dropped.thin < alt,
    marginal: alt != null && full > alt && dropped.marginal < alt,
    value: alt != null && full > alt && dropped.value < alt,
  };
  const flippers = terms.filter((t) => flip[t]);
  // No single term changes the pick. Do not call that "value" just because
  // the premium is the largest factor in the formula.
  if (!flippers.length) return { carrier: "base", decisive: false, flip };
  const carrier = flippers.slice().sort((a, b) => (full - dropped[b]) - (full - dropped[a]))[0];
  return { carrier, decisive: true, flip };
}

function observeQb(state: GameState): void {
  const d = state.draft;
  if (!d || d.onClock < 1) return;
  const slot = d.picks[d.onClock - 1];
  if (!slot || slot.playerId == null) return;
  const p = state.players.find((x) => x.id === slot.playerId);
  if (!p || p.pos !== "QB" || seen.has(p.id)) return;

  const savedTeam = p.teamId;
  const savedProspect = p.prospect;
  p.teamId = null;
  p.prospect = true;
  try {
    const teamId = slot.teamId;
    const { posture } = teamOutlook(state, teamId);
    const pool = availableProspects(state, d.season);
    const ranked = cpuBoardShortlist(state, teamId, pool, pool.length);
    const row = ranked.find((x) => x.p.id === p.id);
    if (!row) throw new Error(`drafted QB ${p.id} missing from recomputed board`);
    const comp = components(state, teamId, p, posture);
    const mine = score(comp, "full");
    if (Math.abs(mine - row.v) > 1e-6) {
      throw new Error(`board replica mismatch id=${p.id} engine=${row.v} mine=${mine}`);
    }
    const fourth = ranked[Math.min(3, ranked.length - 1)]?.v ?? row.v;
    if (row.v + 1e-6 < fourth) {
      throw new Error(`drafted QB ${p.id} scored ${row.v} under top-4 cutoff ${fourth}`);
    }
    let alt: number | null = null;
    for (const x of ranked) {
      if (x.p.pos === "QB") continue;
      if (alt == null || x.v > alt) alt = x.v;
    }
    const dropped = {
      thin: score(comp, "no-thin"),
      marginal: score(comp, "no-marginal"),
      value: score(comp, "no-value"),
    };
    const { carrier, decisive, flip } = carrierOf(row.v, alt, dropped);
    const rank = ranked.findIndex((x) => x.p.id === p.id) + 1;
    picks.push({
      classSeason: d.season,
      round: slot.round,
      teamId,
      user: teamId === state.userTeamId,
      qbCount: comp.qbCount,
      starterOvr: comp.incumbent,
      marginal: comp.marginal,
      thin: comp.thin,
      startsHere: comp.startsHere,
      trueOvr: p.ovr,
      carrier,
      decisive,
      flip,
      rank,
      pool: poolByClass.get(d.season) ?? pool.filter((x) => x.pos === "QB").length,
    });
    seen.add(p.id);
  } finally {
    p.teamId = savedTeam;
    p.prospect = savedProspect;
  }
}

/**
 * Why the 3rd or 4th active QB is still on the 53.
 * The line is the worst other surplus man (`evaluate` + `draftCapitalHold`).
 * He is at the limit when he is that man. Otherwise the term that is
 * necessary to stay above the line — hold, the 3.4× premium, or both.
 */
function keepRule(state: GameState, teamId: number, qb: Player): KeepRule {
  const { posture } = teamOutlook(state, teamId);
  const roster = state.players.filter(
    (p) => p.teamId === teamId && !p.retired && !p.prospect && isActiveRoster(p),
  );
  const surplus = roster.filter((p) => positionCount(state, teamId, p.pos) > POSITION_MIN[p.pos]);
  const worth = (p: Player, posValue: number, hold: boolean) =>
    evaluate(state, teamId, p, posture, posValue) + (hold ? draftCapitalHold(p, state.season) : 0);
  const full = (p: Player) => worth(p, POSITION_VALUE[p.pos], true);
  const others = surplus.filter((p) => p.id !== qb.id);
  if (!others.length || !surplus.some((p) => p.id === qb.id)) return "at-limit";
  const line = Math.min(...others.map(full));
  if (full(qb) <= line + 1e-9) return "at-limit";
  const holdNeeded = worth(qb, POSITION_VALUE.QB, false) < line;
  const valueNeeded = worth(qb, 1, true) < line;
  const bare = worth(qb, 1, false);
  if (holdNeeded && valueNeeded) return "both";
  if (holdNeeded) return "hold";
  if (valueNeeded) return "position-value";
  if (bare >= line - 1e-9) return "ability";
  return "either";
}

function recordSpring(state: GameState, kind: SpringRow["kind"]): void {
  const classSeason = state.season - 1;
  const drafted = kind === "cutdown"
    ? picks.filter((q) => q.classSeason === classSeason).length
    : 0;
  const clubs: ClubSpring[] = state.teams.map((t) => {
    const mine = state.players.filter(
      (p) => p.teamId === t.id && p.pos === "QB" && !p.retired && !p.prospect,
    );
    const active = mine.filter(isActiveRoster).sort((a, b) => b.ovr - a.ovr || a.id - b.id);
    const extras: ExtraQb[] = [];
    for (let i = 2; i < active.length && i < 4; i++) {
      const qb = active[i];
      extras.push({
        rank: i + 1,
        ovr: qb.ovr,
        rule: keepRule(state, t.id, qb),
        hold: draftCapitalHold(qb, state.season),
        rookie: qb.draftedRound != null && qb.draftClassSeason === classSeason,
        draftedRound: qb.draftedRound,
      });
    }
    return {
      teamId: t.id,
      user: t.id === state.userTeamId,
      active: active.length,
      ps: mine.filter((p) => p.status === "ps").length,
      ir: mine.filter((p) => p.status === "ir").length,
      extras,
    };
  });
  springs.push({
    season: state.season,
    kind,
    drafted,
    pool: kind === "cutdown" ? (poolByClass.get(classSeason) ?? 0) : 0,
    clubs,
  });
}

function enterDraftObserved(state: GameState): void {
  const rng = new Rng(state.rngState);
  if (!state.draft || state.draft.season !== state.season) {
    state.draft = initDraft(state, rng);
  }
  runDraftDayTrades(state, rng);
  if (state.draft) state.draft.picks = buildDraftPicks(state, state.draft.season);
  if (state.draft) {
    const pool = availableProspects(state, state.draft.season);
    poolByClass.set(state.draft.season, pool.filter((p) => p.pos === "QB").length);
  }
  let guard = 0;
  while (state.draft && !state.draft.complete && guard++ < DRAFT_UNTIL_USER_LIMIT) {
    const step = stepDraftUntilUser(state, rng);
    if (step !== "picked") break;
    observeQb(state);
  }
  state.rngState = rng.state;
  state.phase = "offseason-draft";
}

function simDraftObserved(state: GameState): void {
  const rng = new Rng(state.rngState);
  const d = state.draft;
  if (d) {
    let guard = 0;
    while (!d.complete && guard++ < FULL_DRAFT_PICK_GUARD) {
      if (!stepFullDraft(state, rng)) break;
      observeQb(state);
    }
    d.complete = true;
    dropSpentInboxOffers(state);
  }
  state.rngState = rng.state;
}

function advanceObserved(state: GameState): void {
  if (state.forcedMove?.retired) {
    advanceOffseason(state);
    return;
  }
  if (state.phase === "offseason-fa" || state.phase === "offseason-draft") {
    settleWaivers(state);
    pruneStaleTradeInbox(state);
    if (state.phase === "offseason-fa") {
      runAllFaWaves(state);
      runOffseasonTrades(state);
      enterDraftObserved(state);
    } else {
      simDraftObserved(state);
      const rng = new Rng(state.rngState);
      enterCampAfterDraft(state, rng);
      state.rngState = rng.state;
    }
    return;
  }
  const phase = state.phase;
  advanceOffseason(state);
  if (phase === "offseason-final") recordSpring(state, "cutdown");
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (n: number, d: number) => (d === 0 ? "—" : `${((n / d) * 100).toFixed(1)}%`);
const n1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : "—");
const n2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "—");

function share(rows: QbPick[], c: Label): string {
  return pct(rows.filter((q) => q.carrier === c).length, rows.length);
}

function run(): void {
  const st = newGame({ seed: SEED });
  const start = st.season;
  recordSpring(st, "opening");
  for (let i = 0; i < SEASONS; i++) {
    const season = st.season;
    let g = 0;
    while (st.phase !== "offseason-recap" && g++ < 80) advance(st);
    if (st.phase !== "offseason-recap") {
      throw new Error(`season ${season} did not reach recap (phase ${st.phase})`);
    }
    let o = 0;
    while (isOffseason(st.phase) && o++ < 12) advanceObserved(st);
    if (isOffseason(st.phase)) {
      throw new Error(`season ${season} offseason did not finish (phase ${st.phase})`);
    }
    const drafted = picks.filter((q) => q.classSeason === season).length;
    progress(`  season ${season} (${i + 1}/${SEASONS}) qb drafted ${drafted}`);
  }

  const cut = springs.filter((s) => s.kind === "cutdown");
  const classes = new Map<number, QbPick[]>();
  for (const q of picks) {
    const arr = classes.get(q.classSeason) ?? [];
    arr.push(q);
    classes.set(q.classSeason, arr);
  }
  const perClass = [...classes.values()].map((g) => g.length);
  const activeAll = cut.flatMap((s) => s.clubs.map((c) => c.active));
  const psAll = cut.flatMap((s) => s.clubs.map((c) => c.ps));
  const cpuClubs = cut.flatMap((s) => s.clubs.filter((c) => !c.user));
  const thirds = cut.flatMap((s) => s.clubs.flatMap((c) => c.extras.filter((e) => e.rank === 3)));
  const fourths = cut.flatMap((s) => s.clubs.flatMap((c) => c.extras.filter((e) => e.rank === 4)));

  const rules: KeepRule[] = ["at-limit", "hold", "position-value", "both", "either", "ability"];
  const carriers: Carrier[] = ["thin", "marginal", "value"];

  console.log(`\nQB SUPPLY CENSUS — ${SEASONS} seasons, seed ${SEED}, start ${start}`);
  console.log(`Replica matched the engine on ${picks.length} QB picks.`);
  console.log(`\n## Headlines (cutdown springs only; opening roster excluded)`);
  console.log(`QBs drafted per class     ${n2(mean(perClass))}   real 11.6   n=${perClass.length} classes`);
  console.log(`QBs per club on the 53    ${n2(mean(activeAll))}   real ~2.6   club-springs=${activeAll.length}`);
  console.log(`QBs per club on the PS    ${n2(mean(psAll))}   league PS mean ${n1(mean(cut.map((s) => s.clubs.reduce((n, c) => n + c.ps, 0))))}`);
  console.log(`CPU-only 53 / PS          ${n2(mean(cpuClubs.map((c) => c.active)))} / ${n2(mean(cpuClubs.map((c) => c.ps)))}`);

  console.log(`\n## By season`);
  console.log(`| season | kind | QB pool | drafted | /club 53 | league 53 | /club PS | league PS | clubs 3+ | clubs 4+ | IR |`);
  console.log(`|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|`);
  for (const s of springs) {
    const a = s.clubs.map((c) => c.active);
    const ps = s.clubs.reduce((n, c) => n + c.ps, 0);
    const ir = s.clubs.reduce((n, c) => n + c.ir, 0);
    const league53 = a.reduce((n, x) => n + x, 0);
    console.log(
      `| ${s.season} | ${s.kind} | ${s.kind === "cutdown" ? s.pool : "—"} | ${s.kind === "cutdown" ? s.drafted : "—"} | ${n2(mean(a))} | ${league53} | ${n2(ps / s.clubs.length)} | ${ps} | ${s.clubs.filter((c) => c.active >= 3).length} | ${s.clubs.filter((c) => c.active >= 4).length} | ${ir} |`,
    );
  }

  console.log(`\n## Drafted QBs by round`);
  console.log(`| round | n | share | mean QB count | mean starter | thin on | thin | marginal | value | base | board #1 | true OVR |`);
  console.log(`|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|`);
  const roundLine = (label: string, g: QbPick[], shareOf: number) =>
    `| ${label} | ${g.length} | ${pct(g.length, shareOf)} | ${n2(mean(g.map((q) => q.qbCount)))} | ${n1(mean(g.map((q) => q.starterOvr)))} | ${pct(g.filter((q) => q.thin > 0).length, g.length)} | ${share(g, "thin")} | ${share(g, "marginal")} | ${share(g, "value")} | ${share(g, "base")} | ${pct(g.filter((q) => q.rank === 1).length, g.length)} | ${n1(mean(g.map((q) => q.trueOvr)))} |`;
  for (let r = 1; r <= 7; r++) {
    const g = picks.filter((q) => q.round === r);
    if (!g.length) continue;
    console.log(roundLine(String(r), g, picks.length));
  }
  console.log(roundLine("all", picks, picks.length));

  console.log(`\n## Term that flips the pick (a pick can flip on more than one)`);
  for (const c of carriers) {
    console.log(`  ${c.padEnd(10)} ${pct(picks.filter((q) => q.flip[c]).length, picks.length)} of picks`);
  }
  console.log(`  stacked (no single term flips) ${pct(picks.filter((q) => !q.decisive).length, picks.length)}`);
  console.log(`  marginal was negative         ${pct(picks.filter((q) => q.marginal < 0).length, picks.length)}`);
  console.log(`  startsHere at the 0.25 floor  ${pct(picks.filter((q) => q.startsHere <= 0.250001).length, picks.length)}`);

  console.log(`\n## Carrier by active QB count at the pick`);
  console.log(`| QB count | n | thin on | thin | marginal | value | base | mean starter |`);
  console.log(`|---:|---:|---:|---:|---:|---:|---:|---:|`);
  const countKeys = [0, 1, 2, 3, 4];
  for (const k of countKeys) {
    const g = picks.filter((q) => (k === 4 ? q.qbCount >= 4 : q.qbCount === k));
    const label = k === 4 ? "4+" : String(k);
    console.log(
      `| ${label} | ${g.length} | ${pct(g.filter((q) => q.thin > 0).length, g.length)} | ${share(g, "thin")} | ${share(g, "marginal")} | ${share(g, "value")} | ${share(g, "base")} | ${n1(mean(g.map((q) => q.starterOvr)))} |`,
    );
  }

  console.log(`\n## Carrier by starter OVR at the pick`);
  console.log(`| starter | n | thin | marginal | value | base | thin on |`);
  console.log(`|---|---:|---:|---:|---:|---:|---:|`);
  const bands: [string, (q: QbPick) => boolean][] = [
    ["<65", (q) => q.starterOvr < 65],
    ["65–74", (q) => q.starterOvr >= 65 && q.starterOvr < 75],
    ["75–84", (q) => q.starterOvr >= 75 && q.starterOvr < 85],
    ["85+", (q) => q.starterOvr >= 85],
  ];
  for (const [label, pred] of bands) {
    const g = picks.filter(pred);
    console.log(
      `| ${label} | ${g.length} | ${share(g, "thin")} | ${share(g, "marginal")} | ${share(g, "value")} | ${share(g, "base")} | ${pct(g.filter((q) => q.thin > 0).length, g.length)} |`,
    );
  }

  console.log(`\n## Carrier by the prospect's true OVR`);
  console.log(`| true OVR | n | thin | marginal | value | base | mean round |`);
  console.log(`|---|---:|---:|---:|---:|---:|---:|`);
  const ovrBands: [string, (q: QbPick) => boolean][] = [
    ["≤52", (q) => q.trueOvr <= 52],
    ["53–60", (q) => q.trueOvr >= 53 && q.trueOvr <= 60],
    ["61–70", (q) => q.trueOvr >= 61 && q.trueOvr <= 70],
    ["71+", (q) => q.trueOvr >= 71],
  ];
  for (const [label, pred] of ovrBands) {
    const g = picks.filter(pred);
    console.log(
      `| ${label} | ${g.length} | ${share(g, "thin")} | ${share(g, "marginal")} | ${share(g, "value")} | ${share(g, "base")} | ${n2(mean(g.map((q) => q.round)))} |`,
    );
  }

  console.log(`\n## Active QB count on the 53 (cutdown club-springs)`);
  const hist = new Map<number, number>();
  for (const n of activeAll) hist.set(n, (hist.get(n) ?? 0) + 1);
  const keys = [...hist.keys()].sort((a, b) => a - b);
  console.log(`| QBs on 53 | club-springs | share |`);
  console.log(`|---:|---:|---:|`);
  for (const k of keys) {
    console.log(`| ${k} | ${hist.get(k)} | ${pct(hist.get(k) ?? 0, activeAll.length)} |`);
  }

  function ruleTable(title: string, rows: ExtraQb[]): void {
    console.log(`\n## ${title} (n=${rows.length})`);
    console.log(`| rule | n | share | mean OVR | rookie | mean hold |`);
    console.log(`|---|---:|---:|---:|---:|---:|`);
    for (const rule of rules) {
      const g = rows.filter((e) => e.rule === rule);
      if (!g.length) continue;
      console.log(
        `| ${rule} | ${g.length} | ${pct(g.length, rows.length)} | ${n1(mean(g.map((e) => e.ovr)))} | ${pct(g.filter((e) => e.rookie).length, g.length)} | ${n1(mean(g.map((e) => e.hold)))} |`,
      );
    }
    console.log(
      `| all | ${rows.length} | 100% | ${n1(mean(rows.map((e) => e.ovr)))} | ${pct(rows.filter((e) => e.rookie).length, rows.length)} | ${n1(mean(rows.map((e) => e.hold)))} |`,
    );
  }
  ruleTable("Cutdown rule keeping the 3rd QB", thirds);
  ruleTable("Cutdown rule keeping the 4th QB", fourths);

  const decisive = picks.filter((q) => q.decisive);
  console.log(`\n## Decisive picks only (n=${decisive.length})`);
  console.log(`thin ${share(decisive, "thin")}  marginal ${share(decisive, "marginal")}  value ${share(decisive, "value")}`);
  console.log(`mean QB count ${n2(mean(decisive.map((q) => q.qbCount)))}  mean starter ${n1(mean(decisive.map((q) => q.starterOvr)))}  mean true OVR ${n1(mean(decisive.map((q) => q.trueOvr)))}`);
}

run();
