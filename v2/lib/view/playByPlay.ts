import {
  DriveResult, DriveSummary, PlayEvent, PlayKind, PlayResult, ScoringPlay, Team,
} from "../core/types";

export function clockLabel(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function quarterLabel(q: number): string {
  if (q <= 4) return `Q${q}`;
  return q === 5 ? "OT" : `OT${q - 4}`;
}

/** True when the box or the play log left regulation. */
export function wentToOvertime(
  box: { quarters: { home: number[]; away: number[] }; plays?: { q: number }[] },
  plays?: { q: number }[],
): boolean {
  const otPoints = (box.quarters.home[4] ?? 0) + (box.quarters.away[4] ?? 0);
  if (otPoints > 0) return true;
  return (plays ?? box.plays ?? []).some((e) => e.q >= 5);
}

/**
 * Finished-game line on /play. Higher score first.
 * "SD 32, NYS 29 · Loss (OT)" — Loss is the user club.
 */
export function playedResultLine(args: {
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number;
  awayScore: number;
  userIsHome: boolean;
  ot: boolean;
}): string {
  const home = { abbr: args.homeAbbr, score: args.homeScore };
  const away = { abbr: args.awayAbbr, score: args.awayScore };
  const hi = away.score > home.score ? away : home;
  const lo = hi === home ? away : home;
  const userScore = args.userIsHome ? args.homeScore : args.awayScore;
  const oppScore = args.userIsHome ? args.awayScore : args.homeScore;
  const outcome = userScore > oppScore ? "Win" : userScore < oppScore ? "Loss" : "Tie";
  return `${hi.abbr} ${hi.score}, ${lo.abbr} ${lo.score} · ${outcome}${args.ot ? " (OT)" : ""}`;
}

/** Field position from the offense's 0–100 spot. */
export function spotLabel(yl: number): string {
  const n = Math.max(1, Math.min(99, Math.round(yl)));
  if (n === 50) return "50";
  if (n < 50) return `own ${n}`;
  return `opp ${100 - n}`;
}

export function downDistance(e: Pick<PlayEvent, "down" | "toGo" | "kind">): string {
  if (e.kind === "kickoff" || e.kind === "xp" || e.kind === "two") return "—";
  return `${e.down} & ${e.toGo}`;
}

function nameOf(id: number | undefined, names: (id: number) => string): string {
  if (id == null) return "";
  return names(id) || "Unknown";
}

function signedYards(n: number): string {
  if (n > 0) return `for ${n} yard${n === 1 ? "" : "s"}`;
  if (n < 0) return `for a loss of ${-n}`;
  return "for no gain";
}

export interface PlaySides {
  abbr: (id: number) => string;
  homeId: number;
  awayId: number;
}

/** The club that committed the foul, when both sides of the game are known. */
export function penaltyTeamId(e: PlayEvent, sides: PlaySides): number | null {
  if (e.kind !== "penalty") return null;
  const defenseId = e.offenseId === sides.homeId ? sides.awayId : e.offenseId === sides.awayId ? sides.homeId : null;
  if (e.yards < 0) return e.offenseId;
  if (e.yards > 0) return defenseId;
  return null;
}

export interface VisiblePlay {
  event: PlayEvent;
  /** The following "Turnover on downs" row was folded into this line. */
  turnoverOnDowns: boolean;
}

/**
 * Drop the standalone "Turnover on downs" row. The note rides on the
 * 4th-down play that produced it. The stored log is not rewritten.
 */
export function visiblePlays(plays: PlayEvent[]): VisiblePlay[] {
  const out: VisiblePlay[] = [];
  for (const e of plays) {
    if (e.kind === "downs") {
      const prev = out[out.length - 1];
      if (prev && prev.event.kind !== "downs") prev.turnoverOnDowns = true;
      else out.push({ event: e, turnoverOnDowns: false });
      continue;
    }
    out.push({ event: e, turnoverOnDowns: false });
  }
  return out;
}

export function formatPlay(
  e: PlayEvent,
  names: (id: number) => string,
  sides?: PlaySides,
): string {
  if (e.returnerId !== undefined) {
    const { returnerId, returnYards, ...snap } = e;
    const how = returnYards === undefined ? "returns it" : `returns it ${returnYards} yd`;
    return `${formatPlay(snap, names, sides)} — ${nameOf(returnerId, names) || "defender"} ${how} for a TD`;
  }
  const who = nameOf(e.playerId, names);
  const tgt = nameOf(e.targetId, names);

  switch (e.kind) {
    case "kickoff":
      if (e.result === "touchback") return "Kickoff — touchback";
      if (e.result === "td") return `${who || "Returner"} ${e.yards} yd kickoff return TD`;
      return `${who || "Returner"} ${e.yards} yd kickoff return`;
    case "punt":
      if (e.result === "touchback") return `Punt ${e.yards} yds — touchback`;
      if (e.result === "td") return `${who || "Returner"} ${e.yards} yd punt return TD`;
      if (e.result === "return") return `Punt ${e.yards} yds — ${who || "returner"} returns`;
      if (e.result === "fair_catch") return `Punt ${e.yards} yds — fair catch`;
      return `Punt ${e.yards} yds`;
    case "fg":
      return `${who || "Kicker"} ${e.yards} yd field goal is ${e.result === "good" ? "GOOD" : e.result === "blocked" ? "BLOCKED" : "NO GOOD"}`;
    case "xp":
      if (e.result === "blocked") return "Extra point BLOCKED";
      return e.result === "good" ? "Extra point good" : "Extra point MISSED";
    case "two":
      return e.result === "good" ? "Two-point conversion GOOD" : "Two-point conversion FAILED";
    case "kneel":
      return `${who || "QB"} kneels ${signedYards(e.yards)}`;
    case "penalty": {
      const yds = Math.abs(e.yards);
      const teamId = sides ? penaltyTeamId(e, sides) : null;
      const team = teamId != null && sides ? sides.abbr(teamId) : "";
      // The engine records the club and the yards. It does not record a foul type.
      return team ? `Penalty — ${team}, ${yds} yards` : `Penalty — ${yds} yards`;
    }
    case "safety":
      return who ? `Safety — tackled by ${who}` : "Safety";
    case "downs":
      return "Turnover on downs";
    case "sack":
      return `${who || "QB"} sacked ${signedYards(e.yards)}`;
    case "run":
      if (e.result === "fumble") return `${who || "Runner"} run, fumble`;
      if (e.result === "td") return `${who || "Runner"} ${e.yards} yd TD run`;
      return `${who || "Runner"} run ${signedYards(e.yards)}`;
    case "pass":
      if (e.result === "int") return `${who || "QB"} pass intercepted${tgt ? ` (intended for ${tgt})` : ""}`;
      if (e.result === "incomplete") return `${who || "QB"} pass incomplete${tgt ? ` intended for ${tgt}` : ""}`;
      if (e.result === "fumble") {
        return `${who || "QB"} pass complete to ${tgt || "receiver"} ${signedYards(e.yards)}, fumble`;
      }
      if (e.result === "td") {
        return `${tgt || "Receiver"} ${e.yards} yd TD reception from ${who || "QB"}`;
      }
      return `${who || "QB"} pass complete to ${tgt || "receiver"} ${signedYards(e.yards)}`;
    default:
      return `${e.kind} ${e.result}`;
  }
}

export function formatVisiblePlay(
  row: VisiblePlay,
  names: (id: number) => string,
  sides?: PlaySides,
): string {
  const base = formatPlay(row.event, names, sides);
  if (!row.turnoverOnDowns) return base;
  return `${base} — Turnover on downs`;
}

export function driveResultLabel(r: DriveResult): string {
  switch (r) {
    case "touchdown": return "TD";
    case "field_goal": return "FG";
    case "missed_fg": return "Missed FG";
    case "punt": return "Punt";
    case "turnover": return "TO";
    case "downs": return "Downs";
    case "safety": return "Safety";
    case "end_half": return "End half";
    case "end_game": return "End";
    case "return_td": return "Return TD";
  }
}

export function driveResultTone(r: DriveResult): "good" | "bad" | "warn" | "default" {
  if (r === "touchdown" || r === "field_goal" || r === "return_td") return "good";
  if (r === "turnover" || r === "safety" || r === "downs") return "bad";
  if (r === "missed_fg") return "warn";
  return "default";
}

export interface DriveLabelSource {
  /** Snap log. Present on a user game and on the latest week's CPU games. */
  plays?: PlayEvent[] | null;
  /** Kept after the snap log is dropped. A block is a non-scoring line. */
  scoringPlays?: ScoringPlay[] | null;
  /** The chart being labeled. Needed only when the snap log is gone. */
  drives?: DriveSummary[] | null;
}

/**
 * The chart tag. A blocked field goal is stored as `missed_fg` — the same
 * result as a kick that sailed wide — so the label has to read the snap.
 * When that log has been dropped, the scoring summary still says BLOCKED
 * and names the drive the kick belongs to. An older save, with neither,
 * stays "Missed FG".
 */
export function driveResultLabelFor(d: DriveSummary, source: DriveLabelSource = {}): string {
  if (d.result === "missed_fg" && driveIsBlockedFg(d, source)) return "Blocked FG";
  return driveResultLabel(d.result);
}

function driveIsBlockedFg(d: DriveSummary, source: DriveLabelSource): boolean {
  const plays = source.plays;
  // A bounded slice. An old drive row with no `to` must not scan the rest of the log.
  if (plays && plays.length > 0 && typeof d.from === "number" && typeof d.to === "number") {
    return drivePlays(plays, d).some((e) => e.kind === "fg" && e.result === "blocked");
  }
  const drives = source.drives;
  const scoring = source.scoringPlays;
  if (!drives?.length || !scoring?.length) return false;
  return blockedFgDriveNums(drives, scoring).has(d.n);
}

/** Earlier moments are larger. The gap is wider than a quarter, so 0:00 still precedes the next quarter's 15:00. */
function kickMoment(q: number, clock: number): number {
  return (8 - q) * 1000 + clock;
}

/**
 * Which missed-FG drives the scoring summary calls blocked.
 * The kick ends the drive, so it belongs to the missed-FG possession of
 * that club that started latest at or before the kick — including one
 * that opened in the previous quarter.
 */
function blockedFgDriveNums(drives: DriveSummary[], scoring: ScoringPlay[]): Set<number> {
  const used = new Set<number>();
  const blocks = scoring
    .map((sp, i) => ({ sp, i }))
    .filter(({ sp }) => sp.desc.endsWith("field goal is BLOCKED"));
  blocks.sort((a, b) => kickMoment(b.sp.q, b.sp.clock) - kickMoment(a.sp.q, a.sp.clock) || a.i - b.i);
  for (const { sp } of blocks) {
    const at = kickMoment(sp.q, sp.clock);
    let best: DriveSummary | null = null;
    let bestAt = Infinity;
    for (const d of drives) {
      if (used.has(d.n) || d.result !== "missed_fg" || d.offenseId !== sp.teamId) continue;
      const started = kickMoment(d.q, d.clock);
      if (started < at) continue;
      if (
        started < bestAt ||
        (started === bestAt && best !== null && d.n > best.n)
      ) {
        best = d;
        bestAt = started;
      }
    }
    if (best) used.add(best.n);
  }
  return used;
}

/** 0–100 bar: start and end from the offense's spot. */
export function driveBar(d: DriveSummary): { left: number; width: number } {
  const a = Math.max(0, Math.min(100, d.startYl));
  const b = Math.max(0, Math.min(100, d.endYl));
  const left = Math.min(a, b);
  const width = Math.max(2, Math.abs(b - a));
  return { left, width };
}

export function drivePlays(plays: PlayEvent[], d: DriveSummary): PlayEvent[] {
  const from = d.from ?? 0;
  const to = d.to ?? plays.length;
  return plays.slice(from, to);
}

export function teamAbbr(teams: Team[], id: number): string {
  return teams[id]?.abbr ?? "?";
}

export type { PlayEvent, DriveSummary, PlayKind, PlayResult };
