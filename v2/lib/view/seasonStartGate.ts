import { formatMoney, type RosterIssue } from "../core/select";
import type { Phase } from "../core/types";

/**
 * Hub advance block. Preseason already refuses an illegal book. Cutdown
 * (`offseason-final`) does the same, so Start the Season cannot release or
 * rewrite the user's deals to get under the cap. The over-cap line names
 * the overage. Any other block keeps the roster sentence.
 */
export function hubAdvanceBlock(phase: Phase, issues: readonly RosterIssue[]): string | null {
  const blocking = issues.filter((i) => i.kind !== "underLimit" || phase === "preseason");
  const capGate = phase === "preseason" || phase === "offseason-final";
  if (!(capGate && blocking.length > 0)) return null;
  const over = blocking.find((i) => i.kind === "overCap");
  if (over) return over.message;
  return "Fix your roster before the season starts.";
}

/** Auto-fix toast. A book that is still over is not "back in compliance". */
export function autoFixComplianceToast(space: number): string {
  if (space < 0) {
    return `Still over the salary cap by ${formatMoney(-space)}. Cut or restructure on /finances.`;
  }
  return "Roster and cap brought back into compliance";
}
