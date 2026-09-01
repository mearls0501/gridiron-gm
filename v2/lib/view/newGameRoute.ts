/**
 * /new is the new-franchise screen even when a save is already loaded.
 * Shell's chrome is the loaded franchise; nesting the picker under it
 * leaves Start Franchise below the fold and the click looks dead.
 */
export function showNewGameScreen(pathname: string, hasFranchise: boolean): boolean {
  return !hasFranchise || pathname === "/new";
}
