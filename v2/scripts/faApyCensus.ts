/**
 * Top-5 free-agent APY census. Read-only.
 *
 * Walks the same headless seasons `scripts/drift.ts` walks: `newGame` on
 * `seedFor(12345)` with `GG_SEED` set to each gate:full panel index, then
 * one `advance` / `advanceOffseason` loop per season. The observer adds
 * no draw of its own. It is not a gate step, and the gate does not import it.
 *
 *   npx tsx scripts/faApyCensus.ts [seasons] [panelIndex...]
 *   npx tsx scripts/faApyCensus.ts --combine a.txt b.txt
 *
 * Defaults: 20 seasons (drift's argument), panel indexes 1 2 3 4 5.
 * A signing is a player who was a street free agent when `offseason-fa`
 * opened and held a contract after that phase's advance (FA waves, the
 * trade burst, and entering the draft — the same `advanceOffseason`
 * call drift makes). APY is (sum of base salaries + signing bonus) / years.
 * Percent is that APY over `teamCap().cap` for the season, which is
 * `salaryCap` and does not include carryover.
 *
 * The 1.10× cap is `Math.round(positionalCeiling(pos, age, cap) * 1.10)`,
 * the same product `apyFromAsk` rounds before the 0.22 outer backstop.
 * Age is the player's age at the signing. K and P use the specialist
 * shares inside `positionalCeiling`. A deal is on that cap when the
 * absolute gap is at most $1,000.
 */
import { readFileSync } from "node:fs";
import { newGame } from "../lib/core/newGame";
import { advance } from "../lib/core/season/engine";
import { advanceOffseason, isOffseason } from "../lib/core/offseason";
import { positionalCeiling } from "../lib/core/generate";
import { freeAgents, teamCap } from "../lib/core/select";
import { Contract, MAX_CONTRACT_SHARE, Player, Position, POSITIONS } from "../lib/core/types";
import { seedFor } from "./metrics";

const PREMIUM_OVER_CEILING = 1.10;
/** Stated tolerance. $1,000 is about 0.0003% of a $300M cap. */
const ON_CAP_TOLERANCE = 1_000;

const ORDER: Position[] = [
  "QB", "EDGE", "OT", "WR", "CB", "DT", "S", "TE", "LB", "OG", "C", "RB", "K", "P",
];

interface Deal {
  pct: number;
  apy: number;
  premiumCap: number;
  bindCap: number;
  age: number;
}

interface PosBook {
  deals: Deal[];
  /** Offseasons with at least one signing and fewer than five. */
  shortBooks: number;
  /** Offseasons with no signing at this position. */
  emptyBooks: number;
}

interface SeedReport {
  panel: number;
  driftSeed: number;
  seasons: number;
  offseasons: number;
  positions: Record<Position, PosBook>;
}

function contractApy(c: Contract): number | null {
  if (c.years <= 0 || c.yearsRemaining !== c.years) return null;
  if (c.baseSalary.length !== c.years) return null;
  const base = c.baseSalary.reduce((a, b) => a + b, 0);
  return (base + c.signingBonus) / c.years;
}

function emptyBooks(): Record<Position, PosBook> {
  const out = {} as Record<Position, PosBook>;
  for (const pos of POSITIONS) out[pos] = { deals: [], shortBooks: 0, emptyBooks: 0 };
  return out;
}

function driftSeed(panel: number): number {
  const prev = process.env.GG_SEED;
  process.env.GG_SEED = String(panel);
  const seeded = seedFor(12345);
  if (prev === undefined) delete process.env.GG_SEED;
  else process.env.GG_SEED = prev;
  return seeded;
}

function runOne(panel: number, seasons: number): SeedReport {
  const seed = driftSeed(panel);
  const st = newGame({ seed });
  const positions = emptyBooks();
  let offseasons = 0;

  for (let s = 0; s < seasons; s++) {
    let g = 0;
    while (st.phase !== "regular" && g++ < 12) advance(st);
    while (st.phase === "regular" && g++ < 40) advance(st);
    while (st.phase !== "offseason-recap" && g++ < 40) advance(st);

    let street: Set<number> | null = null;
    let o = 0;
    while (isOffseason(st.phase) && o++ < 12) {
      const before = st.phase;
      advanceOffseason(st);
      if (before === "offseason-tag") {
        street = new Set(freeAgents(st).map((p) => p.id));
      }
      if (before === "offseason-fa" && street) {
        const cap = teamCap(st, st.userTeamId).cap;
        const byPos = new Map<Position, Deal[]>();
        for (const pos of POSITIONS) byPos.set(pos, []);
        const byId = new Map(st.players.map((p) => [p.id, p]));
        for (const id of street) {
          const p: Player | undefined = byId.get(id);
          if (!p || p.retired || p.prospect || p.teamId === null || !p.contract) continue;
          if (p.contract.signedSeason !== st.season) continue;
          const apy = contractApy(p.contract);
          if (apy === null || !(cap > 0)) continue;
          const premiumCap = Math.round(positionalCeiling(p.pos, p.age, cap) * PREMIUM_OVER_CEILING);
          const outer = Math.round(cap * MAX_CONTRACT_SHARE);
          byPos.get(p.pos)!.push({
            pct: (100 * apy) / cap,
            apy,
            premiumCap,
            bindCap: Math.min(premiumCap, outer),
            age: p.age,
          });
        }
        for (const pos of POSITIONS) {
          const signed = byPos.get(pos)!;
          const book = positions[pos];
          if (signed.length === 0) {
            book.emptyBooks += 1;
            continue;
          }
          if (signed.length < 5) book.shortBooks += 1;
          signed.sort((a, b) => b.apy - a.apy);
          book.deals.push(...signed.slice(0, 5));
        }
        offseasons += 1;
        street = null;
        process.stdout.write(
          `  panel ${panel} season ${s + 1}/${seasons} fa-signings ` +
          `${[...byPos.values()].reduce((n, a) => n + a.length, 0)}\n`
        );
      }
    }
  }

  return { panel, driftSeed: seed, seasons, offseasons, positions };
}

function mean(xs: number[]): number {
  if (!xs.length) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const b = [...xs].sort((x, y) => x - y);
  const mid = Math.floor(b.length / 2);
  if (b.length % 2 === 1) return b[mid];
  return (b[mid - 1] + b[mid]) / 2;
}

function onCap(d: Deal, capDollars: number): boolean {
  return Math.abs(d.apy - capDollars) <= ON_CAP_TOLERANCE;
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

function ceilingPct(pos: Position): number {
  return 100 * positionalCeiling(pos, 27, 1);
}

interface PooledPos {
  pos: Position;
  n: number;
  mean: number;
  median: number;
  max: number;
  onPremium: number;
  onPremiumExact: number;
  onBind: number;
  shortBooks: number;
  emptyBooks: number;
  offseasons: number;
}

function pool(reports: SeedReport[]): { rows: PooledPos[]; offseasons: number; seeds: number[] } {
  const offseasons = reports.reduce((n, r) => n + r.offseasons, 0);
  const rows: PooledPos[] = [];
  for (const pos of ORDER) {
    const deals: Deal[] = [];
    let shortBooks = 0;
    let emptyBooks = 0;
    for (const r of reports) {
      const book = r.positions[pos];
      deals.push(...book.deals);
      shortBooks += book.shortBooks;
      emptyBooks += book.emptyBooks;
    }
    const pcts = deals.map((d) => d.pct);
    rows.push({
      pos,
      n: deals.length,
      mean: mean(pcts),
      median: median(pcts),
      max: pcts.length ? Math.max(...pcts) : NaN,
      onPremium: deals.filter((d) => onCap(d, d.premiumCap)).length,
      onPremiumExact: deals.filter((d) => Math.abs(d.apy - d.premiumCap) < 1).length,
      onBind: deals.filter((d) => onCap(d, d.bindCap)).length,
      shortBooks,
      emptyBooks,
      offseasons,
    });
  }
  return { rows, offseasons, seeds: reports.map((r) => r.panel) };
}

function printTable(reports: SeedReport[]): void {
  const { rows, offseasons } = pool(reports);
  const totalN = rows.reduce((n, r) => n + r.n, 0);
  const totalOn = rows.reduce((n, r) => n + r.onPremium, 0);
  const totalExact = rows.reduce((n, r) => n + r.onPremiumExact, 0);
  const totalBind = rows.reduce((n, r) => n + r.onBind, 0);
  console.log("");
  console.log(
    `pooled offseasons ${offseasons}  top5-deals ${totalN}  ` +
    `on-1.10x ${totalOn} (exact ${totalExact})  on-apyFromAsk-cap ${totalBind}  ` +
    `tolerance $${ON_CAP_TOLERANCE}`
  );
  console.log("pos  ceiling  1.10x  n  mean  median  max  on110  exact  onBind  short  empty");
  for (const r of rows) {
    const ceil = ceilingPct(r.pos);
    console.log(
      `${r.pos.padEnd(4)} ${fmt(ceil).padStart(7)} ${fmt(ceil * PREMIUM_OVER_CEILING).padStart(6)} ` +
      `${String(r.n).padStart(4)} ${fmt(r.mean).padStart(6)} ${fmt(r.median).padStart(7)} ${fmt(r.max).padStart(6)} ` +
      `${String(r.onPremium).padStart(6)} ${String(r.onPremiumExact).padStart(6)} ${String(r.onBind).padStart(6)} ` +
      `${String(r.shortBooks).padStart(5)} ${String(r.emptyBooks).padStart(5)}`
    );
  }
}

function emitCensus(report: SeedReport): void {
  console.log(`##CENSUS ${JSON.stringify(report)}`);
}

function readReports(paths: string[]): SeedReport[] {
  const reports: SeedReport[] = [];
  for (const path of paths) {
    const text = readFileSync(path, "utf8");
    for (const line of text.split("\n")) {
      if (!line.startsWith("##CENSUS ")) continue;
      reports.push(JSON.parse(line.slice("##CENSUS ".length)) as SeedReport);
    }
  }
  return reports;
}

const argv = process.argv.slice(2);
if (argv[0] === "--combine") {
  const reports = readReports(argv.slice(1));
  if (!reports.length) {
    console.error("no ##CENSUS lines");
    process.exit(1);
  }
  reports.sort((a, b) => a.panel - b.panel);
  for (const r of reports) {
    console.log(`panel ${r.panel} driftSeed ${r.driftSeed} offseasons ${r.offseasons}`);
  }
  printTable(reports);
  process.exit(0);
}

const seasons = Number(argv[0] ?? 20);
const panels = argv.slice(1).map(Number);
const panelList = panels.length ? panels : [1, 2, 3, 4, 5];

for (const panel of panelList) {
  console.log(`\n=== panel ${panel} driftSeed ${driftSeed(panel)} seasons ${seasons} ===`);
  const report = runOne(panel, seasons);
  printTable([report]);
  emitCensus(report);
}
