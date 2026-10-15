import { CoachRole } from "../core/types";

/** What the staff card prints. STC does not show scheme, pass bias, or shadow. */
export function staffCardFields(role: CoachRole): { scheme: boolean; dials: readonly string[] } {
  if (role === "stc") return { scheme: false, dials: ["Off", "Def", "Dev", "Agg"] };
  return { scheme: true, dials: ["Off", "Def", "Dev", "Agg", "Pass", "Shad"] };
}

/**
 * A coordinator hired this offseason has not coached a year of the new
 * deal. The card shows the full term (`years`), not the leftover
 * `yearsRemaining` the market body arrived with. Display only.
 */
export function coachTermLabel(
  person: { role: CoachRole; years: number; yearsRemaining: number; hiredSeason: number },
  season: number,
): { value: string; sub: string } {
  const hiredThisOffseason = person.role !== "hc" && person.hiredSeason > season;
  if (hiredThisOffseason) {
    const y = person.years;
    return { value: `${y} yr`, sub: `${y} year deal · full term` };
  }
  return {
    value: `${person.yearsRemaining} yr left`,
    sub: `${person.years} year deal`,
  };
}
