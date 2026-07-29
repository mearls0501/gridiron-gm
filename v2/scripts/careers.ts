/**
 * Career outcome harness.
 *
 * Plays a long franchise, follows every drafted player and undrafted free
 * agent through his whole career, and prints the distribution of outcomes
 * against the real NFL rates the design was researched from.
 *
 * This measures the FRANCHISE, not the scouting model: it asks whether a
 * simulated career looks like a real one. If round 1 produces 95% starters,
 * no amount of fog over the draft will make the draft interesting, because
 * there is nothing to be wrong about.
 *
 *   npx tsx scripts/careers.ts [seasons] [seed]
 *
 * Targets are cited in `docs/front-office-design-2026-07-28.md`. Where the
 * real number does not exist in public data it is left blank rather than
 * invented — an honest gap beats a fake target.
 */
import { emitAll, seedFor } from "./metrics";
import { newGame } from "../lib/core/newGame";
import { advance } from "../lib/core/season/engine";
import { advanceOffseason, isOffseason } from "../lib/core/offseason";
import { GameState, Player, Position, POSITIONS } from "../lib/core/types";
import {
  Career, ROOKIE_DEAL_YEARS, careerLength, everStar, fullTimeSnapBaseline,
  isBust, isHit, isMultiYearStarter, positionRanks, rosteredInYear, snapshot,
  starterSeasons, withDrafterInYear, yearsToFirstStar,
} from "../lib/core/outcomes";

const SEASONS = Number(process.argv[2] ?? 25);
const SEED = seedFor(Number(process.argv[3] ?? 12345));

const pad = (s: string | number, n: number) => String(s).padStart(n);
const pct = (num: number, den: number) => (den === 0 ? "—" : `${((num / den) * 100).toFixed(1)}%`);
const bar = (label: string) => console.log(`\n${label}\n${"─".repeat(label.length)}`);

// ---------------------------------------------------------------------------
// Real NFL targets.
//
// Every number here is computed in `docs/nfl-reference.md` from the nflverse
// mirror of Pro Football Reference's draft tables, classes 2011-2019
// (n=2,289). Post-2011 only: the rookie wage scale changed behaviour at the top
// of the draft, and pooling 2000-2010 inflates every bust rate.
//
// Three of these tables used to be wrong, one of them badly, and the sim had
// been tuned toward them. See `docs/nfl-reference.md` §3. Do not edit a number
// here without adding the computation that produced it to that file.
// ---------------------------------------------------------------------------

/**
 * Became a 4+ year starter — PFR `seasons_started >= 4`.
 * Reference §2.1. This table was already correct; the recomputation confirmed
 * it to within 1.5 points in six of seven rounds.
 */
const TARGET_MULTIYEAR: Record<number, number> = {
  1: 69.3, 2: 47.4, 3: 32.5, 4: 19.5, 5: 16.2, 6: 8.1, 7: 5.4,
};

/**
 * Still playing in season index 3 — the fourth season, which is what
 * `rosteredInYear(c, 3)` asks. Reference §2.2.
 *
 * WAS `85/68.8/68.8/42.6/42.6/42.6/42.6`. The flat 42.6% across rounds 4-7
 * appears to trace back to an LLM-generated statistic in a blog post that
 * carried its own "verify this" disclaimer, and the roster churn model was
 * tuned against it — about twice as harsh as reality in rounds 4-6.
 */
const TARGET_ROSTERED_Y3: Record<number, number> = {
  1: 94.4, 2: 89.5, 3: 79.6, 4: 70.7, 5: 65.2, 6: 53.6, 7: 38.1,
};

/**
 * Second contract with the drafting club. Reference §2.3 — no source publishes
 * a full round-by-round series, so this is stitched from three partial studies
 * that disagree with each other. Widest tolerance of anything here.
 */
const TARGET_SECOND_DEAL: Record<number, number> = {
  1: 40.0, 2: 14.0, 3: 14.0, 4: 8.9, 5: 8.9, 6: 8.9, 7: 1.5,
};

/**
 * Median career span in seasons. Reference §2.2.
 *
 * WAS `8/4/3/5/4/3/3` — non-monotonic, with round 4 outlasting round 3. Rounds
 * 2 and 3 were three to four seasons short.
 */
const TARGET_CAREER_LEN: Record<number, number> = {
  1: 8, 2: 7, 3: 7, 4: 5, 5: 5, 6: 4, 7: 2,
};

/** Round 1 hit rate by position — PFF snap-share definition. Reference §2.5. */
const TARGET_R1_HIT: Partial<Record<Position, number>> = {
  TE: 73.3, OT: 73.0, S: 71.4, OG: 70.0, C: 70.0, QB: 63.3,
  DT: 63.2, RB: 60.6, LB: 57.9, WR: 56.9, CB: 50.0, EDGE: 49.3,
};

/**
 * Round 1 positional composition, share of the round. Reference §2.4, 15
 * drafts 2011-2025. Grouped coarsely because PFR collapses to generic OL/DL
 * from about 2021 and a fine-grained 15-year table would double-count.
 */
const TARGET_R1_SHARE: Record<string, number> = {
  DL: 24.5, OL: 20.3, DB: 16.7, WR: 13.4, QB: 10.3, LB: 7.7, RB: 4.2, TE: 2.7,
};

/** Which coarse group each position belongs to, for TARGET_R1_SHARE. */
const GROUP: Record<string, string> = {
  QB: "QB", RB: "RB", FB: "RB", WR: "WR", TE: "TE",
  OT: "OL", OG: "OL", C: "OL",
  EDGE: "DL", DT: "DL",
  LB: "LB", CB: "DB", S: "DB",
  K: "ST", P: "ST",
};

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const st = newGame({ seed: SEED });
const careers = new Map<number, Career>();
const startSeason = st.season;

/**
 * Pick up everyone drafted this year, plus the undrafted who caught on.
 *
 * Called after the rollover, so `state.season` is already the season these
 * rookies will actually play. Their draft class is stamped with the season
 * just finished — using that as the draft year put every rookie season at
 * `yearsIn === 1` and made the rookie-year column read a flat 0%.
 */
function enrol(state: GameState, season: number): void {
  for (const p of state.players) {
    if (p.prospect || careers.has(p.id)) continue;
    if (p.draftClassSeason !== season) continue;
    careers.set(p.id, {
      playerId: p.id,
      pos: p.pos,
      round: p.draftedRound,
      pick: p.draftedPick,
      draftSeason: state.season,
      draftAge: p.age,
      trueOvrAtDraft: p.ovr,
      truePotAtDraft: p.pot,
      draftTeamId: p.teamId ?? -1,
      seasons: [],
      retiredSeason: null,
      secondContract: "unresolved",
    });
  }
}

function record(state: GameState, season: number): void {
  const baseline = fullTimeSnapBaseline(state, season);
  const ranks = positionRanks(state, season);
  const byId = new Map<number, Player>();
  for (const p of state.players) byId.set(p.id, p);

  for (const c of careers.values()) {
    if (c.retiredSeason !== null) continue;
    const p = byId.get(c.playerId);
    if (!p) continue;
    c.seasons.push(snapshot(p, season, c.draftSeason, baseline, ranks));
    if (p.retired) c.retiredSeason = season;

    // The rookie deal runs out four years after the draft. Ask the question
    // once, the season it expires, before he can sign anywhere.
    if (season - c.draftSeason === ROOKIE_DEAL_YEARS && c.secondContract === "unresolved") {
      if (p.retired || p.teamId === null) c.secondContract = "none";
      else if (p.teamId === c.draftTeamId) c.secondContract = "drafting-team";
      else c.secondContract = "elsewhere";
    }
  }
}

for (let s = 0; s < SEASONS; s++) {
  const season = st.season;
  let g = 0;
  while (st.phase !== "offseason-recap" && g++ < 40) advance(st);
  record(st, season);
  let o = 0;
  while (isOffseason(st.phase) && o++ < 40) advanceOffseason(st);
  // The draft happens in the offseason, so new rookies appear only now.
  enrol(st, season);
}

/**
 * Two filters, and the second one matters more than it looks.
 *
 * The obvious one: a man drafted in the last four seasons has not had his four
 * years yet, so he cannot be judged.
 *
 * The subtle one: a NEW league is populated by generated players, not drafted
 * ones. For the first several seasons an incoming draft class competes against
 * that filler rather than against other draft picks, so it survives at a rate
 * no real class ever would — 184 undrafted players lost their jobs in the first
 * offseason of a run against 40 by the eighth, with drafted cuts rising as the
 * filler drained. Measuring across those years is measuring a transient, and
 * tuning against it would have meant tuning the wrong thing.
 */
const BURN_IN = 8;
const CUTOFF = st.season - ROOKIE_DEAL_YEARS - 1;
const mature = [...careers.values()].filter(
  (c) => c.draftSeason <= CUTOFF && c.draftSeason >= startSeason + BURN_IN
);
const drafted = mature.filter((c) => c.round !== null);
const undrafted = mature.filter((c) => c.round === null);

console.log(`\nCAREER OUTCOMES — ${SEASONS} seasons, seed ${SEED}`);
console.log(`${mature.length} careers, drafted between ${startSeason + BURN_IN} and ${CUTOFF} (${drafted.length} drafted, ${undrafted.length} undrafted)`);
console.log(`Burn-in of ${BURN_IN} seasons discarded — a new league is generated, not drafted, and its filler absorbs all the early churn.`);

// ---------------------------------------------------------------------------

bar("BY ROUND — sim vs real NFL");
console.log("  rd     n   4+yr starter        rostered y3        2nd deal (own)     med career    hit    bust    ever star");
/** Absolute gaps against the reference, collected for the gate. */
const gapStarter: number[] = [];
const gapSurvival: number[] = [];
const gapCareerLen: number[] = [];
for (let r = 1; r <= 7; r++) {
  const g = drafted.filter((c) => c.round === r);
  if (!g.length) continue;
  const ms = g.filter(isMultiYearStarter).length;
  const ry = g.filter((c) => rosteredInYear(c, 3)).length;
  const sd = g.filter((c) => c.secondContract === "drafting-team").length;
  const lens = g.map(careerLength).sort((a, b) => a - b);
  const med = lens[Math.floor(lens.length / 2)] ?? 0;
  gapStarter.push(Math.abs((ms / g.length) * 100 - TARGET_MULTIYEAR[r]));
  gapSurvival.push(Math.abs((ry / g.length) * 100 - TARGET_ROSTERED_Y3[r]));
  gapCareerLen.push(Math.abs(med - TARGET_CAREER_LEN[r]));
  console.log(
    `  ${pad(r, 2)}  ${pad(g.length, 4)}   ${pad(pct(ms, g.length), 6)} vs ${pad(TARGET_MULTIYEAR[r].toFixed(1) + "%", 6)}   ` +
    `${pad(pct(ry, g.length), 6)} vs ${pad(TARGET_ROSTERED_Y3[r].toFixed(1) + "%", 6)}   ` +
    `${pad(pct(sd, g.length), 6)} vs ${pad(TARGET_SECOND_DEAL[r].toFixed(1) + "%", 6)}   ` +
    `${pad(med, 3)} vs ${pad(TARGET_CAREER_LEN[r], 2)}   ` +
    `${pad(pct(g.filter(isHit).length, g.length), 6)}  ${pad(pct(g.filter(isBust).length, g.length), 6)}  ` +
    `${pad(pct(g.filter(everStar).length, g.length), 6)}`
  );
}
if (undrafted.length) {
  const g = undrafted;
  console.log(
    `  UD  ${pad(g.length, 4)}   ${pad(pct(g.filter(isMultiYearStarter).length, g.length), 6)} vs      —   ` +
    `${pad(pct(g.filter((c) => rosteredInYear(c, 3)).length, g.length), 6)} vs      —   ` +
    `${pad(pct(g.filter((c) => c.secondContract === "drafting-team").length, g.length), 6)} vs      —`
  );
}

// ---------------------------------------------------------------------------

bar("SECOND CONTRACT — the three-way split (no public target exists)");
console.log("  rd    own team    elsewhere    out of league");
for (let r = 1; r <= 7; r++) {
  const g = drafted.filter((c) => c.round === r && c.secondContract !== "unresolved");
  if (!g.length) continue;
  const own = g.filter((c) => c.secondContract === "drafting-team").length;
  const els = g.filter((c) => c.secondContract === "elsewhere").length;
  const non = g.filter((c) => c.secondContract === "none").length;
  console.log(`  ${pad(r, 2)}    ${pad(pct(own, g.length), 7)}      ${pad(pct(els, g.length), 7)}      ${pad(pct(non, g.length), 7)}`);
}

// ---------------------------------------------------------------------------

bar("ROUND 1 HIT RATE BY POSITION — sim vs PFF");
console.log("  pos     n     sim      real     gap");
const r1 = drafted.filter((c) => c.round === 1);
for (const pos of POSITIONS) {
  const g = r1.filter((c) => c.pos === pos);
  if (g.length < 3) continue;
  const h = g.filter(isHit).length;
  const simPct = (h / g.length) * 100;
  const real = TARGET_R1_HIT[pos];
  const gap = real === undefined ? "—" : `${simPct - real >= 0 ? "+" : ""}${(simPct - real).toFixed(1)}`;
  console.log(
    `  ${pad(pos, 4)}  ${pad(g.length, 4)}  ${pad(simPct.toFixed(1) + "%", 6)}  ` +
    `${pad(real === undefined ? "—" : real.toFixed(1) + "%", 6)}  ${pad(gap, 6)}`
  );
}

// ---------------------------------------------------------------------------

bar("BREAKOUT TIMING — years to first star season, by position");
console.log("  The real WR curve: 77.9% of breakouts by year 3, 4.3% in year 6+.");
console.log("  QBs are expected to skew later. Everyone else should look like the WR.\n");
console.log("  pos     n stars   y0    y1    y2    y3    y4    y5   y6+    by y3");
for (const pos of POSITIONS) {
  const g = mature.filter((c) => c.pos === pos);
  const years = g.map(yearsToFirstStar).filter((y): y is number => y !== null);
  if (years.length < 5) continue;
  const at = (n: number) => years.filter((y) => y === n).length;
  const late = years.filter((y) => y >= 6).length;
  const byY3 = years.filter((y) => y <= 3).length;
  console.log(
    `  ${pad(pos, 4)}  ${pad(years.length, 6)}  ` +
    [0, 1, 2, 3, 4, 5].map((n) => pad(pct(at(n), years.length), 5)).join(" ") +
    ` ${pad(pct(late, years.length), 5)}   ${pad(pct(byY3, years.length), 6)}`
  );
}

// ---------------------------------------------------------------------------

bar("ROOKIE-YEAR SHARE OF CAREER VALUE");
console.log("  Real: rookies are ~16% of a class's first-4-year value pooled,");
console.log("  but RB rookie production is 88% of that back's career average.\n");
console.log("  pos      n   rookie snaps as % of his own best season");
for (const pos of POSITIONS) {
  const g = mature.filter((c) => c.pos === pos && c.seasons.length >= 3);
  if (g.length < 5) continue;
  const shares: number[] = [];
  for (const c of g) {
    const best = Math.max(...c.seasons.map((s) => s.snaps), 0);
    if (best <= 0) continue;
    const rookie = c.seasons.find((s) => s.yearsIn === 0)?.snaps ?? 0;
    shares.push((rookie / best) * 100);
  }
  if (!shares.length) continue;
  const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
  console.log(`  ${pad(pos, 4)}  ${pad(g.length, 5)}   ${pad(mean.toFixed(1) + "%", 7)}`);
}

// ---------------------------------------------------------------------------

bar("DRAFT AGE — does being younger actually help here?");
console.log("  Real: a 24-year-old prospect is worth ~36% less at QB, ~29% WR, ~5% iOL.\n");
console.log("  age      n   4+yr starter   ever star");
for (let age = 20; age <= 25; age++) {
  const g = drafted.filter((c) => c.draftAge === age);
  if (g.length < 10) continue;
  console.log(
    `  ${pad(age, 3)}  ${pad(g.length, 5)}   ${pad(pct(g.filter(isMultiYearStarter).length, g.length), 7)}      ` +
    `${pad(pct(g.filter(everStar).length, g.length), 7)}`
  );
}

// ---------------------------------------------------------------------------

bar("IS THE DRAFT EVEN INFORMATIVE?");
const withStars = drafted.filter((c) => c.round !== null);
const r1s = withStars.filter((c) => c.round === 1);
const late = withStars.filter((c) => (c.round ?? 0) >= 5);
console.log(`  Round 1 true OVR at draft:  ${(r1s.reduce((a, c) => a + c.trueOvrAtDraft, 0) / Math.max(1, r1s.length)).toFixed(1)}`);
console.log(`  Round 5-7 true OVR at draft: ${(late.reduce((a, c) => a + c.trueOvrAtDraft, 0) / Math.max(1, late.length)).toFixed(1)}`);
console.log(`  Round 1 true POT at draft:  ${(r1s.reduce((a, c) => a + c.truePotAtDraft, 0) / Math.max(1, r1s.length)).toFixed(1)}`);
console.log(`  Round 5-7 true POT at draft: ${(late.reduce((a, c) => a + c.truePotAtDraft, 0) / Math.max(1, late.length)).toFixed(1)}`);
console.log(`  Starter seasons, round 1 mean:   ${(r1s.reduce((a, c) => a + starterSeasons(c), 0) / Math.max(1, r1s.length)).toFixed(2)}`);
console.log(`  Starter seasons, round 5-7 mean: ${(late.reduce((a, c) => a + starterSeasons(c), 0) / Math.max(1, late.length)).toFixed(2)}`);
console.log("");

// ---------------------------------------------------------------------------
// Metrics
//
// The draft is the centre of this game and until now it was the only major
// system with no regression protection at all: this harness existed, printed a
// table, emitted nothing, and was not wired into the gate. A model could
// rewrite the CPU draft board and the gate would stay green.
//
// The round-by-round tables collapse to a mean absolute error against the
// reference rather than seven separate guards. Seven guards on seven
// correlated numbers fail together and say nothing extra; one MAE has the
// property the gate actually needs, which is that any change moving the draft
// toward reality moves it down.
// ---------------------------------------------------------------------------

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

bar("METRICS");

const r1Counts: Record<string, number> = {};
for (const c of r1) {
  const grp = GROUP[c.pos] ?? "ST";
  r1Counts[grp] = (r1Counts[grp] ?? 0) + 1;
}
const shareGaps = Object.entries(TARGET_R1_SHARE).map(([grp, want]) =>
  Math.abs(((r1Counts[grp] ?? 0) / Math.max(1, r1.length)) * 100 - want)
);

const r1Starts = avg(r1s.map(starterSeasons));
const lateStarts = avg(late.map(starterSeasons));

emitAll({
  // Sample-size floors. A harness measuring nothing has to fail loudly rather
  // than report a flattering zero — that is exactly how the leverage probe
  // stayed broken for weeks.
  "careers.matureCareers": mature.length,
  "careers.draftedCareers": drafted.length,

  // The draft-value curve, one number per table.
  "careers.starterRateMae": avg(gapStarter),
  "careers.survivalMae": avg(gapSurvival),
  "careers.careerLenMae": avg(gapCareerLen),

  // The shape of round 1.
  "careers.r1ShareMae": avg(shareGaps),
  "careers.r1QbSharePct": ((r1Counts.QB ?? 0) / Math.max(1, r1.length)) * 100,
  "careers.r1BustPct": (r1.filter(isBust).length / Math.max(1, r1.length)) * 100,

  // Is the draft informative at all? If this ever inverts, every scouting
  // feature built on top of it is decoration.
  "careers.draftSignal": r1Starts - lateStarts,
});
