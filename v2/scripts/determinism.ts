/**
 * Determinism guard.
 *
 * Every other harness rests on this one. `verify`, `drift`, `sweep` and
 * `calibrate` are only meaningful because the same seed produces the same
 * league every time — that is what makes a bug reproducible and a regression
 * attributable. Nothing asserted it until now.
 *
 * The failure this catches is quiet and nasty: someone reaches for
 * `Math.random()` or `Date.now()` inside game logic, or iterates an object
 * whose key order depends on insertion history. Every harness still passes.
 * Replay dies, and nobody finds out until a save won't reproduce.
 *
 *   npx tsx scripts/determinism.ts [replays]
 *
 * Four checks:
 *   1. Generation      — the same seed builds a byte-identical league
 *   2. Simulation      — one regular season and the playoffs, replayed
 *   3. Serialisation   — the state survives a JSON round-trip unchanged
 *   4. Source          — nothing outside rng.ts calls a non-deterministic API
 *
 * `replays` defaults to 2 (the fast gate passes 2, the full gate passes 3).
 * Each replay leaves preseason, plays every regular-season week and every
 * playoff round, and stops once a champion is crowned. The played games are
 * still on the state — the offseason wipes the schedule — so the hash covers
 * the box scores and not an untouched league. One season, replayed, is enough
 * for a real nondeterminism to fail, and it stays short enough for CI.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { newGame } from "../lib/core/newGame";
import { advance } from "../lib/core/season/engine";
import { GameState } from "../lib/core/types";
import { emitAll } from "./metrics";

const requested = Number(process.argv[2] ?? 2);
const REPLAYS = Number.isFinite(requested) && requested >= 2 ? Math.floor(requested) : 2;
const SEED = 777001;

// `createdAt` and `updatedAt` are wall-clock save metadata, not game state —
// two identical leagues generated a millisecond apart must still compare equal.
// Everything else in the document is game state and must match exactly.
const META_KEYS = new Set(["createdAt", "updatedAt"]);
const hash = (s: GameState) => {
  const copy = { ...s } as Record<string, unknown>;
  for (const k of META_KEYS) delete copy[k];
  return createHash("sha256").update(JSON.stringify(copy)).digest("hex").slice(0, 16);
};

let failures = 0;
function check(ok: boolean, label: string, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

interface Replay {
  state: GameState;
  regular: number;
  playoff: number;
  unplayed: number;
}

/**
 * Play the regular season and the playoffs from a seed.
 *
 * `newGame` opens in preseason, and the week and round loops only move a
 * phase they already see. The opening `advance` is what starts the season.
 * Without it both loops are skipped, the hash is the generated league, and
 * the check passes having simulated nothing.
 */
function play(seed: number): Replay {
  const st = newGame({ seed });
  advance(st);
  let w = 0;
  while (st.phase === "regular" && w++ < 40) advance(st);
  let p = 0;
  while (st.phase === "playoffs" && p++ < 12) advance(st);
  let regular = 0;
  let playoff = 0;
  let unplayed = 0;
  for (const g of st.games) {
    if (!g.played) { unplayed++; continue; }
    if (g.playoffRound === null) regular++;
    else playoff++;
  }
  return { state: st, regular, playoff, unplayed };
}

console.log(`\n=== Determinism (${REPLAYS} replays, regular season + playoffs, seed ${SEED}) ===\n`);

// 1. Generation ---------------------------------------------------------------
const genA = hash(newGame({ seed: SEED }));
const genB = hash(newGame({ seed: SEED }));
check(genA === genB, "the same seed generates the same league", `${genA} vs ${genB}`);

// A different seed must produce a DIFFERENT league. Without this, a bug that
// ignores the seed entirely would sail through check 1.
const genC = hash(newGame({ seed: SEED + 1 }));
check(genA !== genC, "a different seed generates a different league");

// 2. Simulation ---------------------------------------------------------------
const runs = Array.from({ length: REPLAYS }, () => play(SEED));
const simA = runs[0].state;
const hashes = runs.map((r) => hash(r.state));
const hA = hashes[0];
check(
  hashes.every((h) => h === hA),
  `${REPLAYS} replays of the regular season and playoffs match`,
  hashes.join(" vs "),
);

const mismatch = hashes.findIndex((h) => h !== hA);
if (mismatch > 0) {
  // Narrow it down for whoever has to fix this.
  const other = runs[mismatch].state;
  const keys = Object.keys(simA) as (keyof GameState)[];
  const differing = keys.filter(
    (k) => JSON.stringify(simA[k]) !== JSON.stringify(other[k])
  );
  console.log(`        replay ${mismatch + 1} diverges: ${differing.join(", ") || "(none — key order?)"}`);
}

// These are what stops the check passing on an unplayed league. A matching
// pair of preseason hashes used to read as a clean replay.
const played = runs[0];
check(
  played.state.phase === "offseason-recap" && played.state.playoffs?.complete === true,
  "the replay ran through the playoffs to a champion",
  `phase=${played.state.phase}`,
);
check(played.regular > 0, "regular-season games were simulated", `${played.regular} played`);
check(played.playoff > 0, "playoff games were simulated", `${played.playoff} played`);
check(played.unplayed === 0, "every scheduled game was played", `${played.unplayed} unplayed`);
check(hA !== genA, "the replay is not the untouched preseason league");

// 3. Serialisation ------------------------------------------------------------
const roundTrip = JSON.parse(JSON.stringify(simA)) as GameState;
check(hash(roundTrip) === hA, "the state survives a JSON round-trip unchanged");

// The RNG state has to be ON the save, or a reloaded game diverges from one
// that was never closed. This is the mechanism the whole guard protects.
check(
  simA.rngState !== undefined && simA.rngState !== null,
  "the RNG state is persisted on the save",
  `rngState = ${JSON.stringify(simA.rngState)}`
);

// 4. Source scan --------------------------------------------------------------
// Anything here is a latent determinism bug even if today's harnesses pass.
const BANNED = [
  { re: /\bMath\.random\s*\(/g, name: "Math.random()" },
  { re: /\bDate\.now\s*\(/g, name: "Date.now()" },
  { re: /\bnew\s+Date\s*\(\s*\)/g, name: "new Date()" },
  { re: /\bperformance\.now\s*\(/g, name: "performance.now()" },
];
// rng.ts is where non-determinism is allowed to enter, and only to seed a NEW
// game. The store and the UI may stamp wall-clock times onto save metadata.
const ALLOWED = ["lib/core/rng.ts", "lib/store/save.ts", "lib/store/game.ts"];

// generate.ts has exactly three legitimate uses: the default seed when the
// player does not supply one, and the two save timestamps. A FOURTH is a bug,
// so the allowance is a count, not a blanket exemption.
const BUDGETED: Record<string, number> = { "lib/core/generate.ts": 3 };

// Comments and string literals are not code. `standings.ts` documents that it
// never calls Math.random(), and a naive scan reported it for saying so.
const strip = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");

const offenders: string[] = [];
function scan(dir: string): void {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { scan(full); continue; }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    const rel = full.replace(/^\.\//, "");
    if (ALLOWED.some((a) => rel.endsWith(a))) continue;
    const src = strip(readFileSync(full, "utf8"));
    const budget = Object.entries(BUDGETED).find(([k]) => rel.endsWith(k))?.[1] ?? 0;
    let total = 0;
    const found: string[] = [];
    for (const b of BANNED) {
      const hits = src.match(b.re);
      if (hits) { total += hits.length; found.push(`${hits.length}x ${b.name}`); }
    }
    if (total > budget) {
      offenders.push(
        `${rel}: ${found.join(", ")}${budget ? ` (budget ${budget})` : ""}`
      );
    }
  }
}
scan("lib");
scan("app");
scan("components");

check(offenders.length === 0, "no non-deterministic API outside rng.ts and the store");
for (const o of offenders) console.log(`        ${o}`);

emitAll({
  "determinism.failures": failures,
  "determinism.bannedApiUses": offenders.length,
});

console.log(failures === 0 ? "\nDETERMINISTIC" : `\n${failures} DETERMINISM FAILURES`);
process.exit(failures > 0 ? 1 : 0);
