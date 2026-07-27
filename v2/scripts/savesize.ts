/**
 * Save-size composition harness.
 *
 * `drift.ts` tells you the save grows ~1 MB a season. It does not tell you
 * WHERE the bytes are, and the answer decides what housekeeping is worth
 * writing. This runs N seasons and, at each rollover, sizes every top-level
 * field of GameState plus the interesting sub-fields.
 *
 *   npx tsx scripts/savesize.ts [seasons] [seed]
 */
import { newGame } from "../lib/core/newGame";
import { advance } from "../lib/core/season/engine";
import { advanceOffseason, isOffseason } from "../lib/core/offseason";
import { GameState } from "../lib/core/types";
import { encodeSave } from "../lib/store/codec";

const SEASONS = Number(process.argv[2] ?? 20);
const SEED = Number(process.argv[3] ?? 12345);

const kb = (v: unknown) => JSON.stringify(v ?? null).length / 1024;
const pad = (s: string | number, n: number) => String(s).padStart(n);

interface Row {
  season: number;
  total: number;
  /** What `save.ts` actually writes — the same state with its stat rows shrunk. */
  disk: number;
  players: number;
  playersRetired: number;
  playersActive: number;
  playerStats: number;
  playerAttrs: number;
  games: number;
  boxScores: number;
  log: number;
  history: number;
  records: number;
  teams: number;
  pickOwners: number;
  nPlayers: number;
  nRetired: number;
  nStatLines: number;
  nLog: number;
  nGames: number;
}

function measure(st: GameState): Row {
  const retired = st.players.filter((p) => p.retired);
  const activeP = st.players.filter((p) => !p.retired);
  return {
    season: st.season,
    total: kb(st),
    disk: kb(encodeSave(st)),
    players: kb(st.players),
    playersRetired: kb(retired),
    playersActive: kb(activeP),
    playerStats: kb(st.players.map((p) => p.stats)),
    playerAttrs: kb(st.players.map((p) => p.attrs)),
    games: kb(st.games),
    boxScores: kb(st.games.map((g) => g.boxScore)),
    log: kb(st.log),
    history: kb(st.history),
    records: kb(st.records),
    teams: kb(st.teams),
    pickOwners: kb(st.pickOwners),
    nPlayers: st.players.length,
    nRetired: retired.length,
    nStatLines: st.players.reduce((n, p) => n + p.stats.length, 0),
    nLog: st.log.length,
    nGames: st.games.length,
  };
}

const st = newGame({ seed: SEED });
const rows: Row[] = [];

for (let s = 0; s < SEASONS; s++) {
  let g = 0;
  while (st.phase !== "offseason-recap" && g++ < 40) advance(st);
  rows.push(measure(st));
  let o = 0;
  while (isOffseason(st.phase) && o++ < 40) advanceOffseason(st);
}

const MB = (k: number) => (k / 1024).toFixed(2);

console.log("\nSAVE COMPOSITION (MB), measured at the end of each regular season\n");
console.log(
  "  season   total    disk  players  (retired  active   stats   attrs)   games  (boxes)     log  history  records   teams   picks"
);
for (const r of rows) {
  console.log(
    `  ${pad(r.season, 6)}  ${pad(MB(r.total), 6)}  ${pad(MB(r.disk), 6)}  ${pad(MB(r.players), 7)}  ${pad(MB(r.playersRetired), 8)}  ${pad(MB(r.playersActive), 6)}  ${pad(MB(r.playerStats), 6)}  ${pad(MB(r.playerAttrs), 6)}  ${pad(MB(r.games), 6)}  ${pad(MB(r.boxScores), 6)}  ${pad(MB(r.log), 6)}  ${pad(MB(r.history), 7)}  ${pad(MB(r.records), 7)}  ${pad(MB(r.teams), 6)}  ${pad(MB(r.pickOwners), 6)}`
  );
}

console.log("\nCOUNTS\n");
console.log("  season  players  retired  statLines     log   games");
for (const r of rows) {
  console.log(
    `  ${pad(r.season, 6)}  ${pad(r.nPlayers, 7)}  ${pad(r.nRetired, 7)}  ${pad(r.nStatLines, 9)}  ${pad(r.nLog, 6)}  ${pad(r.nGames, 6)}`
  );
}

const first = rows[0];
const last = rows[rows.length - 1];
const n = rows.length - 1;
const per = (a: number, b: number) => ((b - a) / n / 1024).toFixed(3);

console.log(`\nGROWTH per season over ${n} rollovers (MB/season)\n`);
const lines: [string, number, number][] = [
  ["total (in memory)", first.total, last.total],
  ["total (on disk)", first.disk, last.disk],
  ["players", first.players, last.players],
  ["  retired players", first.playersRetired, last.playersRetired],
  ["  active players", first.playersActive, last.playersActive],
  ["  player.stats", first.playerStats, last.playerStats],
  ["games (box scores)", first.games, last.games],
  ["log", first.log, last.log],
  ["history", first.history, last.history],
  ["records", first.records, last.records],
];
for (const [label, a, b] of lines) {
  const share = ((b - a) / (last.total - first.total)) * 100;
  console.log(
    `  ${label.padEnd(20)} +${per(a, b).padStart(6)}   ${pad(share.toFixed(1), 5)}% of growth   (final ${MB(b)} MB)`
  );
}
