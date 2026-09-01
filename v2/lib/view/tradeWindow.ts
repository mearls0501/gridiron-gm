/**
 * /trades incoming-offer controls.
 *
 * The banner and Accept already shared `tradeWindowOpen`. Accept stayed
 * `variant="primary"` when disabled; Propose switches to `default` plus
 * extra opacity, so Accept still looked like a live blue button after
 * the deadline. Reject may clear a stale offer; it cannot complete one.
 */

export const CLOSED_WINDOW_ACTIONS =
  "Nothing on this page can be accepted or proposed until it reopens.";

export function incomingOfferAccept(windowOpen: boolean): {
  enabled: boolean;
  variant: "primary" | "default";
} {
  return windowOpen
    ? { enabled: true, variant: "primary" }
    : { enabled: false, variant: "default" };
}

export function incomingOfferReject(): {
  enabled: boolean;
  variant: "danger";
} {
  return { enabled: true, variant: "danger" };
}

export function proposeTradeControl(
  windowOpen: boolean,
  dealReady: boolean,
): { enabled: boolean; variant: "primary" | "default" } {
  const enabled = windowOpen && dealReady;
  return { enabled, variant: enabled ? "primary" : "default" };
}
