/**
 * Toast copy for "Sim entire draft".
 *
 * The header Stat counts filled slots (`playerId !== null`). This toast must
 * use the same number — not the picks remaining on this click.
 */

export function simEntireDraftToast(
  picks: ReadonlyArray<{ playerId: number | null; teamId: number }>,
  userTeamId: number,
): string {
  const made = picks.filter((p) => p.playerId !== null).length;
  const classSize = picks.filter(
    (p) => p.teamId === userTeamId && p.playerId !== null,
  ).length;
  return `Draft complete — ${made} pick${made === 1 ? "" : "s"} made, ${classSize} in your class`;
}
