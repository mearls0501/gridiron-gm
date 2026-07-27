/**
 * Save codec round-trip check.
 *
 * The codec earns its 3x only if it is genuinely lossless, and "genuinely" has
 * to mean deep equality against a real save — not a hand-built fixture, which
 * would never contain the one row that breaks it. So: play N seasons, encode,
 * decode, and assert the result is indistinguishable from the original state,
 * key for key, including key ORDER (the sim reads fields by name, but a
 * reordered row would mean the blank template and the live row had drifted
 * apart, which is exactly the failure this codec must not have).
 *
 *   npx tsx scripts/codeccheck.ts [seasons] [seed]
 */
import { newGame } from "../lib/core/newGame";
import { advance } from "../lib/core/season/engine";
import { advanceOffseason, isOffseason } from "../lib/core/offseason";
import { decodeSave, encodeSave } from "../lib/store/codec";
import { GameState } from "../lib/core/types";

const SEASONS = Number(process.argv[2] ?? 3);
const SEED = Number(process.argv[3] ?? 4242);

let failures = 0;
function check(ok: boolean, label: string, detail = ""): void {
  if (ok) { console.log(`  ok    ${label}${detail ? ` — ${detail}` : ""}`); return; }
  failures++;
  console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
}

/** First differing path, or null. Reports order mismatches on objects too. */
function diff(a: unknown, b: unknown, path = "$"): string | null {
  if (a === b) return null;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return `${path}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array/object mismatch`;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path}: length ${a.length} !== ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const d = diff(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) {
    const missing = ka.filter((k) => !kb.includes(k));
    const extra = kb.filter((k) => !ka.includes(k));
    return `${path}: key count ${ka.length} !== ${kb.length}` +
      (missing.length ? ` missing ${missing.join(",")}` : "") +
      (extra.length ? ` extra ${extra.join(",")}` : "");
  }
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return `${path}: key order ${ka[i]} !== ${kb[i]}`;
    const d = diff(
      (a as Record<string, unknown>)[ka[i]],
      (b as Record<string, unknown>)[kb[i]],
      `${path}.${ka[i]}`
    );
    if (d) return d;
  }
  return null;
}

function play(seasons: number): GameState {
  const st = newGame({ seed: SEED });
  for (let s = 0; s < seasons; s++) {
    let g = 0;
    while (st.phase !== "offseason-recap" && g++ < 40) advance(st);
    if (s === seasons - 1) break;
    let o = 0;
    while (isOffseason(st.phase) && o++ < 40) advanceOffseason(st);
  }
  return st;
}

console.log(`\ncodec round trip — ${SEASONS} seasons, seed ${SEED}\n`);

const state = play(SEASONS);
// The original, before anything can mutate it in place.
const original = JSON.parse(JSON.stringify(state)) as GameState;

const encoded = JSON.parse(JSON.stringify(encodeSave(state)));
// Sized before decoding: `decodeSave` rehydrates its argument in place, which
// is what `loadGame` wants but would make this measurement meaningless.
const sparseBytes = JSON.stringify(encoded).length;
const decoded = decodeSave(encoded);

const d = diff(original, decoded);
check(d === null, "decode(encode(state)) is deep-equal to state", d ?? "identical");

// Encoding must not disturb the live state — the store keeps playing on the
// same object after a save, and a codec that mutated it would corrupt a
// franchise one autosave at a time.
const after = JSON.parse(JSON.stringify(state)) as GameState;
const d2 = diff(original, after);
check(d2 === null, "encodeSave leaves the live state untouched", d2 ?? "unchanged");

// A save written before the codec existed is dense, and decoding it must be
// the identity — otherwise every existing franchise breaks on load.
const dense = JSON.parse(JSON.stringify(original));
const d3 = diff(original, decodeSave(dense));
check(d3 === null, "an old dense save decodes to itself", d3 ?? "identity");

const denseBytes = JSON.stringify(original).length;
const mb = (n: number) => (n / 1048576).toFixed(2);
console.log(
  `\n  ${mb(denseBytes)} MB in memory -> ${mb(sparseBytes)} MB on disk ` +
  `(${((1 - sparseBytes / denseBytes) * 100).toFixed(0)}% smaller)`
);

console.log(failures === 0 ? "\ncodec ok" : `\n${failures} CODEC FAILURES`);
process.exit(failures > 0 ? 1 : 0);
