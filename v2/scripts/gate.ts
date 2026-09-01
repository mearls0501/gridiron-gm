/**
 * The gate.
 *
 * One command, one exit code. This is what decides whether a change is allowed
 * to exist — for a person, for a small model grinding on a task, and for CI.
 *
 *   npm run gate         fast tier  (~40s)  — run after every edit
 *   npm run gate:full    full tier  (~5m)   — run before review
 *   npm run gate:lock    re-lock baselines from the current run  (NOT for workers)
 *
 * Two things are checked, and a step must survive both:
 *
 *   1. EXIT CODE. Every harness that self-asserts must exit 0.
 *   2. METRICS.   Every harness emits `##M <name> <value>` lines (see
 *                 scripts/metrics.ts). Each one is compared against the locked
 *                 number in docs/baselines.json.
 *
 * Output on failure is one line per violation, in a fixed shape:
 *
 *   FAIL  calibrate.passYds  238.4  expected 232.1 +/-6
 *
 * That is deliberate. Prose is unreadable to an automated loop; this is not.
 *
 * A missing metric is a FAILURE, not a skip. If a harness stops emitting a
 * number the gate says so loudly, because a silently-degrading harness is worse
 * than no harness at all — which is exactly how the leverage probe stayed broken.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

interface Bound {
  target?: number;
  tol?: number;
  max?: number;
  min?: number;
  nfl?: number;
  note?: string;
}
interface Baselines {
  note: string;
  lockedAt: string;
  /** How many seeds each target was averaged over when it was locked. */
  lockedSeeds?: number;
  metrics: Record<string, Bound>;
}

interface Step {
  name: string;
  cmd: string;
  args: string[];
  /** false for steps that only report (their metrics still gate). */
  exitGates: boolean;
}

const FAST: Step[] = [
  { name: "typecheck",   cmd: "npx", args: ["tsc", "--noEmit"],                    exitGates: true },
  { name: "simtoast",    cmd: "npx", args: ["tsx", "lib/store/simToast.test.ts"],  exitGates: true },
  { name: "drafttoast",  cmd: "npx", args: ["tsx", "lib/view/draftToast.test.ts"], exitGates: true },
  { name: "newgame",     cmd: "npx", args: ["tsx", "lib/view/newGameRoute.test.ts"], exitGates: true },
  { name: "determinism", cmd: "npx", args: ["tsx", "scripts/determinism.ts", "2"], exitGates: true },
  { name: "verify",      cmd: "npx", args: ["tsx", "scripts/verify.ts", "3"],      exitGates: true },
  { name: "sweep",       cmd: "npx", args: ["tsx", "scripts/sweep.ts", "5", "2"],  exitGates: true },
  { name: "calibrate",   cmd: "npx", args: ["tsx", "scripts/calibrate.ts", "300"], exitGates: false },
  { name: "statcheck",   cmd: "npx", args: ["tsx", "scripts/statcheck.ts"],        exitGates: false },
  { name: "leverage",    cmd: "npx", args: ["tsx", "scripts/leverage.ts", "150"],  exitGates: false },
  // Cheap (one generated league + one headless draft) and it guards the four
  // claims the scouting system makes — including that no rendered surface can
  // reconstruct a prospect's true rating.
  { name: "scout",       cmd: "npx", args: ["tsx", "scripts/scoutcheck.ts"],       exitGates: true },
];

const FULL: Step[] = [
  { name: "typecheck",   cmd: "npx", args: ["tsc", "--noEmit"],                    exitGates: true },
  { name: "simtoast",    cmd: "npx", args: ["tsx", "lib/store/simToast.test.ts"],  exitGates: true },
  { name: "drafttoast",  cmd: "npx", args: ["tsx", "lib/view/draftToast.test.ts"], exitGates: true },
  { name: "newgame",     cmd: "npx", args: ["tsx", "lib/view/newGameRoute.test.ts"], exitGates: true },
  { name: "determinism", cmd: "npx", args: ["tsx", "scripts/determinism.ts", "3"], exitGates: true },
  { name: "verify",      cmd: "npx", args: ["tsx", "scripts/verify.ts", "10"],     exitGates: true },
  { name: "sweep",       cmd: "npx", args: ["tsx", "scripts/sweep.ts", "25", "2"], exitGates: true },
  { name: "calibrate",   cmd: "npx", args: ["tsx", "scripts/calibrate.ts", "300"], exitGates: false },
  { name: "statcheck",   cmd: "npx", args: ["tsx", "scripts/statcheck.ts"],        exitGates: false },
  { name: "leverage",    cmd: "npx", args: ["tsx", "scripts/leverage.ts", "150"],  exitGates: false },
  { name: "tails",       cmd: "npx", args: ["tsx", "scripts/tails.ts", "16"],      exitGates: false },
  { name: "conditions",  cmd: "npx", args: ["tsx", "scripts/conditions.ts", "6"],  exitGates: true },
  { name: "coherence",   cmd: "npx", args: ["tsx", "scripts/coherence.ts", "5"],   exitGates: true },
  { name: "drift",       cmd: "npx", args: ["tsx", "scripts/drift.ts", "20"],      exitGates: true },
  // The draft was the last major system with no regression protection: this
  // harness existed, printed a table, emitted nothing and was not wired in, so
  // the CPU board could be rewritten and the gate would stay green.
  //
  // It is also the most expensive step here by a distance — it plays 24 full
  // seasons and snapshots every career in the league every year. Budget for it
  // before running the full tier, and prefer `--seeds 1` or `--seeds 2` on a
  // small box. 24 is not negotiable downward: the harness discards an 8-season
  // burn-in (a new league is generated rather than drafted, so its filler
  // absorbs all the early churn) and cannot judge anyone inside his first four
  // years, so a shorter run measures almost nobody.
  { name: "careers",     cmd: "npx", args: ["tsx", "scripts/careers.ts", "24"],    exitGates: false },
  // Cheap next to `careers` — it plays two short leagues rather than one long
  // one — and it guards the one invariant the whole staff design rests on.
  { name: "staff",       cmd: "npx", args: ["tsx", "scripts/staffcheck.ts", "8"],  exitGates: true },
  { name: "scout",       cmd: "npx", args: ["tsx", "scripts/scoutcheck.ts"],       exitGates: true },
];

const BASELINES = "docs/baselines.json";
const mode = process.argv[2] ?? "fast";
const lock = process.argv.includes("--lock");
const steps = mode === "full" ? FULL : FAST;

/**
 * The seed panel.
 *
 * Fast tier stays single-seed: it is a smoke test run after every edit and has
 * to stay quick. The full tier sweeps a panel so its numbers mean something.
 * `--seeds N` overrides; `--seeds 1` restores the old single-sample behaviour.
 */
const seedArg = process.argv.findIndex((a) => a === "--seeds");
const PANEL = seedArg >= 0 ? Number(process.argv[seedArg + 1]) : mode === "full" ? 5 : 1;
const seeds = PANEL <= 1 ? [0] : Array.from({ length: PANEL }, (_, i) => 1 + i);

const baselines: Baselines = JSON.parse(readFileSync(BASELINES, "utf8"));

interface Result {
  step: Step;
  code: number;
  /** Mean of each metric across the seed panel. */
  metrics: Record<string, number>;
  /** Standard deviation of each metric across the panel. */
  spread: Record<string, number>;
  seeds: number;
  ms: number;
  tail: string;
}

function once(step: Step, seed: number): Promise<{ code: number; metrics: Record<string, number>; tail: string }> {
  return new Promise((resolve) => {
    const env = seed > 0 ? { ...process.env, GG_SEED: String(seed) } : { ...process.env };
    const child = spawn(step.cmd, step.args, { env });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => {
      const metrics: Record<string, number> = {};
      for (const line of out.split("\n")) {
        const m = /^##M (\S+) (\S+)$/.exec(line.trim());
        if (m) metrics[m[1]] = Number(m[2]);
      }
      resolve({
        code: code ?? 1,
        metrics,
        tail: out.split("\n").filter(Boolean).slice(-14).join("\n"),
      });
    });
  });
}

/**
 * Run a step once per seed in the panel and average.
 *
 * Every metric used to be a single sample from a single seed, which meant a
 * red number could not distinguish "you broke the game" from "your change
 * moved the RNG stream". Averaging across a panel gives each metric a real
 * sampling distribution, and the standard deviation it produces is what tells
 * a human whether a tolerance is tight enough to mean anything.
 *
 * Seeds run sequentially inside a step so the whole panel does not land on the
 * machine at once; steps still run in parallel with each other.
 */
function run(step: Step): Promise<Result> {
  return new Promise(async (resolve) => {
    const started = Date.now();
    const panel = seeds.length ? seeds : [0];
    const runs: Record<string, number>[] = [];
    let worstCode = 0;
    let tail = "";

    for (const seed of panel) {
      const r = await once(step, seed);
      runs.push(r.metrics);
      if (r.code !== 0 && worstCode === 0) { worstCode = r.code; tail = r.tail; }
      if (!tail) tail = r.tail;
    }

    const names = new Set<string>();
    for (const r of runs) for (const k of Object.keys(r)) names.add(k);
    const metrics: Record<string, number> = {};
    const spread: Record<string, number> = {};
    for (const n of names) {
      const vals = runs.map((r) => r[n]).filter((v) => Number.isFinite(v));
      if (!vals.length) continue;
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const varr = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, vals.length - 1);
      metrics[n] = mean;
      spread[n] = vals.length > 1 ? Math.sqrt(varr) : 0;
    }

    resolve({ step, code: worstCode, metrics, spread, seeds: panel.length, ms: Date.now() - started, tail });
  });
}

/** Returns a failure string, or null if the metric is within bounds. */
function checkBound(name: string, value: number, b: Bound): string | null {
  const show = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
  if (b.max !== undefined && value > b.max) {
    return `FAIL  ${name}  ${show(value)}  expected <= ${b.max}${b.note ? `  (${b.note})` : ""}`;
  }
  if (b.min !== undefined && value < b.min) {
    return `FAIL  ${name}  ${show(value)}  expected >= ${b.min}${b.note ? `  (${b.note})` : ""}`;
  }
  if (b.target !== undefined && b.tol !== undefined) {
    if (Math.abs(value - b.target) > b.tol) {
      return `FAIL  ${name}  ${show(value)}  expected ${show(b.target)} +/-${b.tol}` +
        (b.nfl !== undefined ? `  (NFL ~${b.nfl})` : "");
    }
  }
  return null;
}

(async () => {
  console.log(`\n=== gate (${mode}) ===\n`);
  const results = await Promise.all(steps.map(run));

  const failures: string[] = [];
  const seen: Record<string, number> = {};
  const noise: Record<string, number> = {};

  for (const r of results) {
    const secs = (r.ms / 1000).toFixed(0).padStart(3);
    const bad = r.step.exitGates && r.code !== 0;
    console.log(
      `  ${bad ? "FAIL" : "ok  "}  ${r.step.name.padEnd(12)} ${secs}s  ` +
      `${Object.keys(r.metrics).length} metrics` +
      `${r.seeds > 1 ? ` x${r.seeds} seeds` : ""}${bad ? `  (exit ${r.code})` : ""}`
    );
    if (bad) {
      failures.push(`FAIL  ${r.step.name}  exited ${r.code}`);
      console.log(r.tail.split("\n").map((l) => `        ${l}`).join("\n"));
    }
    Object.assign(seen, r.metrics);
    Object.assign(noise, r.spread);
  }

  if (lock) {
    // Re-lock every target from this run, keeping tolerances, max/min bounds
    // and notes exactly as they are. Only a human does this, and only after
    // deciding the new numbers are correct.
    let relocked = 0;
    for (const [name, b] of Object.entries(baselines.metrics)) {
      if (b.target !== undefined && seen[name] !== undefined) {
        b.target = Number(seen[name].toFixed(3));
        relocked++;
      }
    }
    baselines.lockedAt = new Date().toISOString().slice(0, 10);
    baselines.lockedSeeds = seeds.length > 1 ? seeds.length : 1;
    writeFileSync(BASELINES, JSON.stringify(baselines, null, 2) + "\n");
    console.log(`\nre-locked ${relocked} targets in ${BASELINES}`);
    process.exit(0);
  }

  // Every baseline whose harness ran in this tier must have been emitted.
  const ranHarnesses = new Set(steps.map((s) => s.name));
  for (const [name, b] of Object.entries(baselines.metrics)) {
    const harness = name.split(".")[0];
    if (!ranHarnesses.has(harness)) continue;
    if (seen[name] === undefined) {
      failures.push(`FAIL  ${name}  MISSING  the harness stopped emitting this metric`);
      continue;
    }
    const f = checkBound(name, seen[name], b);
    if (f) failures.push(f);
  }

  // ---- tolerance vs noise -------------------------------------------------
  // A tolerance narrower than the metric's own sampling spread cannot tell a
  // regression from a reshuffle: it will fail on a change that did nothing and
  // pass on one that did real damage. This does not fail the gate — it tells a
  // human which baselines are not yet measurements.
  // The gate compares the MEAN of the panel, so the relevant noise is the
  // standard error of that mean (sd / sqrt(n)), not the spread of one run.
  // Getting this wrong over-flags: a metric with a wide per-run spread can
  // still have a perfectly stable mean once it is averaged.
  const fragile: string[] = [];
  const panelN = seeds.length > 1 ? seeds.length : 1;
  for (const [name, b] of Object.entries(baselines.metrics)) {
    const sd = noise[name];
    if (b.tol === undefined || sd === undefined || sd === 0 || panelN < 2) continue;
    const sem = sd / Math.sqrt(panelN);
    if (b.tol < 2 * sem) {
      fragile.push(
        `NOISE ${name.padEnd(30)} tol +/-${b.tol}  but the panel mean has a ` +
        `standard error of ${sem.toFixed(2)} (per-run sd ${sd.toFixed(2)}, n=${panelN})` +
        `  (needs +/-${(2 * sem).toFixed(1)}, or a bigger panel)`
      );
    }
  }
  if (fragile.length) {
    console.log(`\n${fragile.length} baseline${fragile.length === 1 ? " is" : "s are"} tighter than their own noise:`);
    for (const f of fragile) console.log(`  ${f}`);
    console.log("  These cannot distinguish a regression from a stream shift.");
    console.log("  Widening one is a decision — orchestrator, then Matt.");
  }

  console.log("");
  if (failures.length === 0) {
    console.log(`GATE PASS  (${Object.keys(seen).length} metrics within baseline)`);
    process.exit(0);
  }
  for (const f of failures) console.log(f);
  console.log(`\nGATE FAIL  ${failures.length} problem${failures.length === 1 ? "" : "s"}`);
  console.log("Fix the cause. Do not edit docs/baselines.json or anything in scripts/.");
  process.exit(1);
})();
