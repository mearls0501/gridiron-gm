/**
 * Regression: Hub Sim ▾ stayed open after click-away and Esc
 * (GM UX production sit, save `GM UX PR25 0901`).
 *
 * Run: npx tsx lib/view/simMenu.test.ts
 */
import assert from "node:assert/strict";
import { shouldDismissSimMenu } from "./simMenu";

assert.equal(
  shouldDismissSimMenu({ type: "keydown", key: "Escape", insideControl: true }),
  true,
  "Escape closes the open menu",
);
assert.equal(
  shouldDismissSimMenu({ type: "keydown", key: "Escape", insideControl: false }),
  true,
  "Escape closes even if focus is outside the control",
);
assert.equal(
  shouldDismissSimMenu({ type: "keydown", key: "Enter", insideControl: true }),
  false,
  "other keys do not dismiss",
);
assert.equal(
  shouldDismissSimMenu({ type: "keydown", key: "Tab", insideControl: false }),
  false,
  "Tab is not a dismiss",
);

assert.equal(
  shouldDismissSimMenu({ type: "pointerdown", insideControl: false }),
  true,
  "click-away (pointerdown outside) closes",
);
assert.equal(
  shouldDismissSimMenu({ type: "mousedown", insideControl: false }),
  true,
  "click-away (mousedown outside) closes",
);
assert.equal(
  shouldDismissSimMenu({ type: "pointerdown", insideControl: true }),
  false,
  "pointer inside the control stays open so a SimOption click can run the sim",
);
assert.equal(
  shouldDismissSimMenu({ type: "mousedown", insideControl: true }),
  false,
  "mousedown on Through the Playoffs is not a dismiss",
);
assert.equal(
  shouldDismissSimMenu({ type: "click", insideControl: false }),
  false,
  "the listener is pointerdown, not click",
);

console.log("ok    Hub Sim menu dismisses on click-away and Esc");
