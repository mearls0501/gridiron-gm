/**
 * The Saves page must show the franchise already on screen even when
 * IndexedDB has not returned, returned nothing, or is behind the live week.
 *
 * Run: npx tsx lib/store/saveList.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "../core/newGame";
import { mergeSaveList } from "./save";

{
  const live = newGame({ seed: 42 });
  live.name = "Live franchise";
  live.updatedAt = 50;
  const rows = mergeSaveList(live, []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, live.id);
  assert.equal(rows[0].name, "Live franchise");
}

{
  const live = newGame({ seed: 42 });
  live.week = 8;
  live.updatedAt = 80;
  const stale = newGame({ seed: 42 });
  stale.id = live.id;
  stale.week = 1;
  stale.updatedAt = 10;
  const other = newGame({ seed: 7 });
  other.updatedAt = 90;
  const rows = mergeSaveList(live, [stale, other]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, other.id, "a newer other franchise sorts first");
  const current = rows.find((s) => s.id === live.id);
  assert.ok(current);
  assert.equal(current.week, 8, "the live week wins over the stale autosave");
}

{
  assert.equal(mergeSaveList(null, []).length, 0);
}

console.log("ok    saveList — live franchise shows when the disk list does not");
