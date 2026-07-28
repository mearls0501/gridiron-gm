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
  { name: "determinism", cmd: "npx", args: ["tsx", "scripts/determinism.ts", "2"], exitGates: true },
  { name: "verify",      cmd: "npx", args: ["tsx", "scripts/verify.ts", "3"],      exitGates: true },
  { name: "sweep",       cmd: "npx", args: ["tsx", "scripts/sweep.ts", "5", "2"],  exitGates: true },
  { name: "calibrate",   cmd: "npx", args: ["tsx", "scripts/calibrate.ts", "300"], exitGates: false },
  { name: "statcheck",   cmd: "npx", args: ["tsx", "scripts/statcheck.ts"],        exitGates: false },
  { name: "leverage",    cmd: "npx", args: ["tsx", "scripts/leverage.ts", "150"],  exitGates: false },
];

const FULL: Step[] = [
  { name: "typecheck",   cmd: "npx", args: ["tsc", "--noEmit"],                    exitGates: true },
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
];

const BASELINES = "docs/baselines.json";
const mode = process.argv[2] ?? "fast";
const lock = process.argv.includes("--lock");
const steps = mode === "full" ? FULL : FAST;

const baselines: Baselines = JSON.parse(readFileSync(BASELINES, "utf8"));

interface Result {
  step: Step;
  code: number;
  metrics: Record<string, number>;
  ms: number;
  tail: string;
}

function run(step: Step): Promise<Result> {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(step.cmd, step.args, { env: process.env });
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
        step,
        code: code ?? 1,
        metrics,
        ms: Date.now() - started,
        tail: out.split("\n").filter(Boolean).slice(-14).join("\n"),
      });
    });
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

  for (const r of results) {
    const secs = (r.ms / 1000).toFixed(0).padStart(3);
    const bad = r.step.exitGates && r.code !== 0;
    console.log(
      `  ${bad ? "FAIL" : "ok  "}  ${r.step.name.padEnd(12)} ${secs}s  ` +
      `${Object.keys(r.metrics).length} metrics${bad ? `  (exit ${r.code})` : ""}`
    );
    if (bad) {
      failures.push(`FAIL  ${r.step.name}  exited ${r.code}`);
      console.log(r.tail.split("\n").map((l) => `        ${l}`).join("\n"));
    }
    Object.assign(seen, r.metrics);
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
