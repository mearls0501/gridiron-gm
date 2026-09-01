/**
 * Pause toast helpers for Hub simTo.
 *
 * A bulk-sim stop that is not the named target must always leave GM-readable
 * copy. `last` from advance() is optional decoration — an empty last must not
 * swallow the reason, and a stale auto-dismiss must not wipe a newer toast.
 */

export function formatSimPauseToast(reason: string, last: string): string {
  const body = `Simulation paused — ${reason}.`;
  return last ? `${body} (${last})` : body;
}

/** A dismiss timer may only clear the toast it was armed for. */
export function toastDismissApplies(shown: string, current: string | null): boolean {
  return current === shown;
}
