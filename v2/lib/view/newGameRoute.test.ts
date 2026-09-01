/**
 * Regression: /saves New Franchise must reach the new-franchise UI
 * while a save is loaded. Shell used to keep the franchise chrome on
 * /new, which hid Start Franchise below the fold (sit: dead click).
 *
 * Run: npx tsx lib/view/newGameRoute.test.ts
 */
import assert from "node:assert/strict";
import { showNewGameScreen } from "./newGameRoute";

assert.equal(showNewGameScreen("/saves", true), false, "loaded save on /saves stays in chrome");
assert.equal(showNewGameScreen("/", true), false, "hub with a loaded save stays in chrome");
assert.equal(
  showNewGameScreen("/new", true),
  true,
  "/saves New Franchise → /new must drop chrome so the picker is the page",
);
assert.equal(showNewGameScreen("/new", false), true, "direct /new with no save still shows the picker");
assert.equal(showNewGameScreen("/", false), true, "first run on / is the picker");

console.log("ok    /saves New Franchise → /new with a loaded save");
