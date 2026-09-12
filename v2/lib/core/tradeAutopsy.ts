/**
 * Throwaway TRADE_AUTOPSY=1 counters for Wave 3.6 Packet 2.
 * Zero RNG. Silent unless the env flag is set. Do not merge as an engine change.
 */

export type AutopsyShape = "swap" | "trade" | "cutdown";

export function autopsyOn(): boolean {
  return typeof process !== "undefined" && process.env.TRADE_AUTOPSY === "1";
}

export function autopsyPrint(line: string): void {
  if (!autopsyOn()) return;
  const msg = line.endsWith("\n") ? line : `${line}\n`;
  if (typeof process !== "undefined" && process.stdout?.write) {
    process.stdout.write(msg);
  } else {
    console.log(line);
  }
}

function bump(map: Record<string, number>, key: string, n = 1): void {
  map[key] = (map[key] ?? 0) + n;
}

function fmtHist(map: Record<string, number>, limit = 8): string {
  const rows = Object.entries(map).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return "-";
  return rows
    .slice(0, limit)
    .map(([k, v]) => `${k.replace(/[^A-Za-z0-9_.:<>+/-]/g, "_")}=${v}`)
    .join(",");
}

export interface AutopsyWindow {
  season: number;
  phase: string;
  week: number;
  kind: string;
  attempts: number;
  swapTry: number;
  tradeTry: number;
  cutdownTry: number;
  swapProp: number;
  tradeProp: number;
  cutdownProp: number;
  accept: number;
  exec: number;
  execFail: number;
  acceptFailLegal: number;
  acceptFailIllegal: number;
  nulls: Record<string, number>;
  rejects: Record<string, number>;
}

function emptyWindow(season: number, phase: string, week: number, kind: string): AutopsyWindow {
  return {
    season,
    phase,
    week,
    kind,
    attempts: 0,
    swapTry: 0,
    tradeTry: 0,
    cutdownTry: 0,
    swapProp: 0,
    tradeProp: 0,
    cutdownProp: 0,
    accept: 0,
    exec: 0,
    execFail: 0,
    acceptFailLegal: 0,
    acceptFailIllegal: 0,
    nulls: {},
    rejects: {},
  };
}

let current: AutopsyWindow | null = null;
const seasonRollup = new Map<number, AutopsyWindow>();

export function autopsySeasonRollup(season: number): AutopsyWindow | undefined {
  return seasonRollup.get(season);
}

function rollupOf(season: number): AutopsyWindow {
  let r = seasonRollup.get(season);
  if (!r) {
    r = emptyWindow(season, "season", 0, "all");
    seasonRollup.set(season, r);
  }
  return r;
}

function mergeInto(dst: AutopsyWindow, src: AutopsyWindow): void {
  dst.attempts += src.attempts;
  dst.swapTry += src.swapTry;
  dst.tradeTry += src.tradeTry;
  dst.cutdownTry += src.cutdownTry;
  dst.swapProp += src.swapProp;
  dst.tradeProp += src.tradeProp;
  dst.cutdownProp += src.cutdownProp;
  dst.accept += src.accept;
  dst.exec += src.exec;
  dst.execFail += src.execFail;
  dst.acceptFailLegal += src.acceptFailLegal;
  dst.acceptFailIllegal += src.acceptFailIllegal;
  for (const [k, v] of Object.entries(src.nulls)) bump(dst.nulls, k, v);
  for (const [k, v] of Object.entries(src.rejects)) bump(dst.rejects, k, v);
}

export function autopsyLine(w: AutopsyWindow, tag: string): string {
  return (
    `AUTOPSY ${tag} season=${w.season} phase=${w.phase} week=${w.week} kind=${w.kind}` +
    ` attempts=${w.attempts}` +
    ` swapTry=${w.swapTry} tradeTry=${w.tradeTry} cutdownTry=${w.cutdownTry}` +
    ` swapProp=${w.swapProp} tradeProp=${w.tradeProp} cutdownProp=${w.cutdownProp}` +
    ` accept=${w.accept} exec=${w.exec} execFail=${w.execFail}` +
    ` failLegal=${w.acceptFailLegal} failIllegal=${w.acceptFailIllegal}` +
    ` nulls=${fmtHist(w.nulls, 12)}` +
    ` rejects=${fmtHist(w.rejects, 8)}`
  );
}

export function autopsyBeginWindow(season: number, phase: string, week: number, kind: string): void {
  if (!autopsyOn()) return;
  current = emptyWindow(season, phase, week, kind);
}

export function autopsyEndWindow(extra = ""): void {
  if (!autopsyOn() || !current) return;
  autopsyPrint(`${autopsyLine(current, "window")}${extra ? ` ${extra}` : ""}`);
  mergeInto(rollupOf(current.season), current);
  current = null;
}

export function autopsyAttempt(shape: AutopsyShape): void {
  if (!autopsyOn() || !current) return;
  current.attempts++;
  if (shape === "swap") current.swapTry++;
  else if (shape === "trade") current.tradeTry++;
  else current.cutdownTry++;
}

export function autopsyProposed(shape: AutopsyShape): void {
  if (!autopsyOn() || !current) return;
  if (shape === "swap") current.swapProp++;
  else if (shape === "trade") current.tradeProp++;
  else current.cutdownProp++;
}

export function autopsyNull(shape: AutopsyShape, reason: string): void {
  if (!autopsyOn() || !current) return;
  bump(current.nulls, `${shape}:${reason}`);
}

export function autopsyAccept(ok: boolean, legal: boolean, reason?: string): void {
  if (!autopsyOn() || !current) return;
  if (ok) {
    current.accept++;
    return;
  }
  if (legal) current.acceptFailLegal++;
  else {
    current.acceptFailIllegal++;
    if (reason) bump(current.rejects, reason);
  }
}

export function autopsyCheckReject(reason: string): void {
  if (!autopsyOn() || !current) return;
  bump(current.rejects, reason);
}

export function autopsyExec(ok: boolean): void {
  if (!autopsyOn() || !current) return;
  if (ok) current.exec++;
  else current.execFail++;
}
