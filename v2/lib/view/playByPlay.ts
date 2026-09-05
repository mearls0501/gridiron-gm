import {
  DriveResult, DriveSummary, PlayEvent, PlayKind, PlayResult, Team,
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

export function formatPlay(e: PlayEvent, names: (id: number) => string): string {
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
      return `Punt ${e.yards} yds`;
    case "fg":
      return `${who || "Kicker"} ${e.yards} yd field goal is ${e.result === "good" ? "GOOD" : "NO GOOD"}`;
    case "xp":
      return e.result === "good" ? "Extra point good" : "Extra point MISSED";
    case "two":
      return e.result === "good" ? "Two-point conversion GOOD" : "Two-point conversion FAILED";
    case "kneel":
      return `${who || "QB"} kneels ${signedYards(e.yards)}`;
    case "penalty":
      return `Penalty — ${Math.abs(e.yards)} yards`;
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
