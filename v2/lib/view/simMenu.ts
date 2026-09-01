/**
 * Hub Sim ▾ menu dismiss. The control had no outside-click or Escape
 * listener, so it stayed open after click-away and Esc. Choosing an
 * option still closes via runSim — this only answers whether a
 * document listener should close the menu.
 */
export function shouldDismissSimMenu(event: {
  type: string;
  key?: string;
  insideControl: boolean;
}): boolean {
  if (event.type === "keydown") return event.key === "Escape";
  if (event.type === "pointerdown" || event.type === "mousedown") {
    return !event.insideControl;
  }
  return false;
}
