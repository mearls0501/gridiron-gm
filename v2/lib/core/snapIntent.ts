import { SnapInfo } from "./callSheet";
import { SnapCall } from "./types";

/**
 * Desk rules for /play. Each intent resolves to a SnapCall the engine
 * already runs: "run", "pass", or "auto". "auto" is the staff mix
 * (choosePass). These thresholds are the button, not an NFL rate and
 * not a sim dial. The play loop does not read this file.
 */

export type SnapIntent = "schedule" | "ground" | "air" | "score";

export interface SnapIntentChoice {
  id: SnapIntent;
  label: string;
  /** The whole policy, true on every down. */
  rule: string;
}

export const SNAP_INTENT_CHOICES: readonly SnapIntentChoice[] = [
  {
    id: "schedule",
    label: "Stay on schedule",
    rule: "Third or fourth and five or more is a pass. Third or fourth and two or fewer is a run. Second and eight or more is a pass. Two yards or fewer, or inside the two, is a run. Every other down is the coach.",
  },
  {
    id: "ground",
    label: "Lean on the ground",
    rule: "Third or fourth and seven or more is a pass. Every other down is a run.",
  },
  {
    id: "air",
    label: "Open it up",
    rule: "Two yards or fewer, or inside the three, is a run. Every other down is a pass.",
  },
  {
    id: "score",
    label: "Play the score",
    rule: "A lead of nine or more from the fourth quarter on, or fifteen or more in the third, is a run. Any lead with under five minutes left from the fourth on is a run. A deficit of nine or more from the fourth on, or any deficit with under five minutes left then, is a pass. Every other spot is the coach.",
  },
];

export interface ResolvedSnap {
  call: SnapCall;
  /** Why this snap, under the rule above. */
  because: string;
}

export function offenseMargin(info: SnapInfo): number {
  return info.offenseIsHome
    ? info.homeScore - info.awayScore
    : info.awayScore - info.homeScore;
}

export function snapSendWord(call: SnapCall): "Run" | "Pass" | "Coach" {
  if (call === "run") return "Run";
  if (call === "pass") return "Pass";
  return "Coach";
}

function yardsToGoal(info: SnapInfo): number {
  return 100 - info.yardLine;
}

function stayOnSchedule(info: SnapInfo): ResolvedSnap {
  if (info.down >= 3 && info.toGo >= 5) {
    return { call: "pass", because: "Third or fourth and five or more." };
  }
  if (info.down >= 3 && info.toGo <= 2) {
    return { call: "run", because: "Third or fourth and two or fewer." };
  }
  if (info.down === 2 && info.toGo >= 8) {
    return { call: "pass", because: "Second and eight or more." };
  }
  if (info.toGo <= 2) return { call: "run", because: "Two yards or fewer." };
  if (yardsToGoal(info) <= 2) return { call: "run", because: "Inside the two." };
  return { call: "auto", because: "A manageable down stays with the coach." };
}

function leanOnTheGround(info: SnapInfo): ResolvedSnap {
  if (info.down >= 3 && info.toGo >= 7) {
    return { call: "pass", because: "Third or fourth and seven or more." };
  }
  return { call: "run", because: "On the ground." };
}

function openItUp(info: SnapInfo): ResolvedSnap {
  if (info.toGo <= 2) return { call: "run", because: "Two yards or fewer." };
  if (yardsToGoal(info) <= 3) return { call: "run", because: "Inside the three." };
  return { call: "pass", because: "In the air." };
}

function playTheScore(info: SnapInfo): ResolvedSnap {
  const diff = offenseMargin(info);
  const late = info.quarter >= 4;
  if (diff >= 15 && info.quarter === 3) {
    return { call: "run", because: "Up fifteen or more in the third." };
  }
  if (diff >= 9 && late) {
    return { call: "run", because: "Up nine or more from the fourth on." };
  }
  if (diff > 0 && late && info.clock < 300) {
    return { call: "run", because: "Leading, under five minutes." };
  }
  if (diff <= -9 && late) {
    return { call: "pass", because: "Down nine or more from the fourth on." };
  }
  if (diff < 0 && late && info.clock < 300) {
    return { call: "pass", because: "Trailing, under five minutes." };
  }
  return { call: "auto", because: "The score stays with the coach." };
}

export function resolveSnapIntent(intent: SnapIntent, info: SnapInfo): ResolvedSnap {
  if (intent === "schedule") return stayOnSchedule(info);
  if (intent === "ground") return leanOnTheGround(info);
  if (intent === "air") return openItUp(info);
  return playTheScore(info);
}
