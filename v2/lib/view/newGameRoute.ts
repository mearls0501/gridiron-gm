/**
 * /new is the new-franchise screen even when a save is already loaded.
 * Shell's chrome is the loaded franchise; nesting the picker under it
 * leaves Start Franchise below the fold and the click looks dead.
 */
export function showNewGameScreen(pathname: string, hasFranchise: boolean): boolean {
  return !hasFranchise || pathname === "/new";
}

/** Routes a fired or retired GM may open without being sent back to the desk. */
const FORCED_MOVE_OPEN = new Set(["/forced-move", "/saves", "/settings", "/new"]);

export function forcedMoveKeepsRoute(pathname: string): boolean {
  return FORCED_MOVE_OPEN.has(pathname);
}
