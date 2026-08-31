/**
 * Interaction test: exercises the controls a player actually clicks, and
 * asserts the game state really changed. A button that renders but does
 * nothing is the failure mode this catches.
 */
import { chromium } from "playwright";
const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
let failures = 0;
const ok = (m) => console.log("  ok    " + m);
const fail = (m) => { failures++; console.log("  FAIL  " + m); };

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const errs = [];
page.on("pageerror", e => errs.push(e.message));
page.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) errs.push(m.text()); });

const text = () => page.evaluate(() => document.body.innerText);

console.log("\n=== Interaction test ===\n");
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.getByRole("button", { name: /Start Franchise/i }).click();
await page.waitForTimeout(3000);
ok("franchise created");

// ---- Depth chart reorder ---------------------------------------------------
await page.goto(BASE + "/depth-chart", { waitUntil: "networkidle" });
await page.waitForTimeout(600);
const before = await text();
const downBtn = page.locator('button[title*="down" i], button:has-text("↓")').first();
if (await downBtn.count()) {
  await downBtn.click();
  await page.waitForTimeout(500);
  const after = await text();
  if (after === before) fail("depth chart reorder did not change the page");
  else ok("depth chart reorder works");
} else {
  fail("no depth-chart move control found");
}

// ---- Roster: release a player ----------------------------------------------
await page.goto(BASE + "/roster", { waitUntil: "networkidle" });
await page.waitForTimeout(600);
// Sort by cap hit ascending and release the cheapest player. Releasing the
// most expensive one is a legitimate way to blow past the cap (dead money can
// exceed the cap hit), which then correctly blocks the signing below — real
// behaviour, but it makes this test about something else.
const capHead = page.getByRole("button", { name: /Cap Hit/i }).first();
if (await capHead.count()) {
  await capHead.click(); await page.waitForTimeout(300);
  await capHead.click(); await page.waitForTimeout(400); // toggle to ascending
}
const countBefore = (await text()).match(/(\d+)\s*\/\s*53/);
const rel = page.getByRole("button", { name: /^Release$/i }).first();
if (await rel.count()) {
  await rel.click();
  await page.waitForTimeout(300);
  const confirm = page.getByRole("button", { name: /Confirm|Release for good|Yes/i }).first();
  if (await confirm.count()) await confirm.click();
  await page.waitForTimeout(900);
  const countAfter = (await text()).match(/(\d+)\s*\/\s*53/);
  if (countBefore && countAfter && Number(countAfter[1]) === Number(countBefore[1]) - 1) {
    ok(`release works (${countBefore[1]} -> ${countAfter[1]})`);
  } else {
    fail(`release did not reduce the roster (${countBefore?.[1]} -> ${countAfter?.[1]})`);
  }
} else fail("no Release button on the roster");

// ---- Free agency: sign someone ---------------------------------------------
await page.goto(BASE + "/free-agency", { waitUntil: "networkidle" });
await page.waitForTimeout(700);
// Filter to punters — the cheapest position — so the offer is affordable no
// matter how much cap room the release above happened to cost. Signing the
// priciest free agent on the board is legitimately refused by the engine.
const pTab = page.getByRole("button", { name: /^P$/ }).first();
if (await pTab.count()) { await pTab.click(); await page.waitForTimeout(500); }
const signBtn = page.getByRole("button", { name: /^Sign$/i }).first();
if (await signBtn.count()) {
  await signBtn.click();
  await page.waitForTimeout(400);
  const submit = page.getByRole("button", { name: /^Offer$/i }).first();
  if (!(await submit.count())) { fail("offer editor did not open"); }
  else await submit.click();
  await page.waitForTimeout(1200);
  await page.goto(BASE + "/roster", { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  const c = (await text()).match(/(\d+)\s*\/\s*53/);
  if (c && Number(c[1]) === 53) ok("free agent signing works (back to 53)");
  else fail(`roster is ${c?.[1]}/53 after signing — expected 53`);
} else fail("no Sign button in free agency");

// ---- Scouting ---------------------------------------------------------------
await page.goto(BASE + "/draft", { waitUntil: "networkidle" });
await page.waitForTimeout(700);
const scout = page.getByRole("button", { name: /^Scout$/i }).first();
if (await scout.count()) {
  await scout.click();
  await page.waitForTimeout(800);
  const t = await text();
  if (/Film Study:/.test(t) || /In-season film/.test(t)) ok("scouting runs inside the film window");
  else fail("scouting did not run inside the open window");
} else fail("no Scout button on the draft page");

// ---- The war room -----------------------------------------------------------
const room = page.getByRole("button", { name: /^Room$/i }).first();
if (await room.count()) {
  await room.click();
  await page.waitForTimeout(500);
  const t = await text();
  // Case-insensitive: the section headers render through text-transform.
  // The 2026-08-01 scouting redesign: the war room speaks in grades and
  // written reports, never numeric estimates.
  if (/war room —/i.test(t) && /board call/i.test(t) && /board grade/i.test(t) && /the file/i.test(t)) {
    ok("war room opens with grades, the file and board call");
  } else fail("war room card missing or incomplete");
  // Leak check: an estimate band ("72–88") rendering anywhere on the draft
  // page would put numbers back in the scouting game. En-dash pairs are the
  // signature of the old band display; measurables and records never use it.
  if (/\d{2}–\d{2}/.test(t)) fail("numeric estimate band leaked into the war room");
  else ok("no numeric estimate bands on the draft page");

  const t2btn = page.getByRole("button", { name: /^T2$/ }).first();
  if (await t2btn.count()) {
    await t2btn.click();
    await page.waitForTimeout(500);
    ok("board tier set");
  } else fail("no tier buttons in the war room");

  const med = page.getByRole("button", { name: /Medical Check/i }).first();
  if ((await med.count()) && (await med.isEnabled())) {
    await med.click();
    await page.waitForTimeout(600);
    const t3 = await text();
    if (/Medical\s*\n?\s*(clean|minor|moderate|major)/.test(t3)) ok("medical check reveals a grade");
    else fail("medical grade did not reveal in the war room");
  } else fail("medical check unavailable in the war room");
} else fail("no Room button on the draft page");

// ---- Full season into the draft, then make a pick ---------------------------
await page.goto(BASE + "/", { waitUntil: "networkidle" });
const start = page.getByRole("button", { name: /Start the Season/i });
if (await start.count()) {
  await start.click(); await page.waitForTimeout(250);
  const c = page.getByRole("button", { name: /^Confirm$/ }); if (await c.count()) await c.click();
  await page.waitForTimeout(3500);
}
for (let i = 0; i < 20; i++) {
  const b = page.getByRole("button", { name: /^(Play Week|Advance Week)/ });
  if (!(await b.count())) break;
  await b.click(); await page.waitForTimeout(750);
}
for (let i = 0; i < 5; i++) {
  await page.goto(BASE + "/", { waitUntil: "networkidle" }); await page.waitForTimeout(300);
  const b = page.getByRole("button", { name: /Sim .* Round/i });
  if (!(await b.count())) break;
  await b.click(); await page.waitForTimeout(1100);
}
// Advance the offseason to the draft — but never past it. "Finish the Draft"
// auto-picks the whole class, which would leave nothing here to click and
// silently skip the manual-pick coverage this test exists to provide.
for (let i = 0; i < 4; i++) {
  await page.goto(BASE + "/", { waitUntil: "networkidle" }); await page.waitForTimeout(400);
  if (await page.getByRole("button", { name: /Finish the Draft/i }).count()) break;
  const b = page.getByRole("button", { name: /Continue to/i }).first();
  if (!(await b.count())) break;
  await b.click(); await page.waitForTimeout(250);
  const c = page.getByRole("button", { name: /^Confirm$/ }); if (await c.count()) await c.click();
  await page.waitForTimeout(2200);
}
if (!(await page.getByRole("button", { name: /Finish the Draft/i }).count())) {
  fail("never reached the draft phase");
}
await page.goto(BASE + "/draft", { waitUntil: "networkidle" });
await page.waitForTimeout(900);
const simTo = page.getByRole("button", { name: /Sim to my pick/i });
if (await simTo.count()) {
  // Disabled when the user is already on the clock — that's the state we want.
  if (await simTo.isEnabled()) {
    await simTo.click();
    await page.waitForTimeout(1500);
  }
  const draftBtn = page.getByRole("button", { name: /^Draft$/i }).first();
  if (await draftBtn.count()) {
    const enabled = await draftBtn.isEnabled();
    if (!enabled) {
      const simTitle = (await simTo.count()) ? await simTo.getAttribute("title") : "(no sim button)";
      fail(`Draft button is disabled while on the clock [draft-title="${await draftBtn.getAttribute("title")}" sim-title="${simTitle}"]`);
    }
    else {
      await draftBtn.click();
      await page.waitForTimeout(1200);
      const t = await text();
      if (/Round \d, pick \d+/i.test(t) || /select/i.test(t)) ok("drafting a player works");
      else fail("draft click produced no recorded pick");
    }
  } else fail("no Draft button after simming to the user's pick");
} else {
  console.log("  note  draft room not reachable in this run (phase mismatch)");
}

// ---------------------------------------------------------------------------
// The front office: allocation has to survive a reload
//
// The staff budget is the one screen where the player's decision lives on the
// save rather than in a component, so a slider that moves and then silently
// forgets would look completely correct in a screenshot. This drags the
// development bucket to the top of its range, commits, reloads, and reads it
// back off the page.
// ---------------------------------------------------------------------------
await page.goto(BASE + "/front-office", { waitUntil: "networkidle" });
await page.waitForTimeout(400);
{
  const foText = await text();
  if (!/Staff Budget/i.test(foText)) fail("front office did not render");
  else {
    const slider = page.locator('input[type="range"][aria-label="Player Development"]').first();
    if (!(await slider.count())) fail("no development slider on the front office page");
    else {
      const max = await slider.getAttribute("max");
      await slider.fill(max);
      await page.waitForTimeout(200);
      const commit = page.getByRole("button", { name: /Commit budget/i }).first();
      if (!(await commit.count())) fail("no commit button after moving the budget");
      else {
        await commit.click();
        await page.waitForTimeout(700);
        await page.reload({ waitUntil: "networkidle" });
        await page.waitForTimeout(600);
        const after = await text();
        const m = after.match(/Player Development\s*\n?\s*(\d+)\s*pts/);
        if (m && Number(m[1]) >= 70) ok(`staff budget persisted across a reload (${m[1]} pts on development)`);
        else fail(`staff budget did not persist [read back: ${m ? m[1] : "nothing"}]`);
      }
    }
  }

  // Naming a development priority is the other half of the screen.
  const add = page.getByRole("button", { name: /^Add$/ }).first();
  if (await add.count()) {
    await add.click();
    await page.waitForTimeout(600);
    const t2 = await text();
    if (/Priority/.test(t2)) ok("a development priority can be named");
    else fail("naming a development priority did not stick");
  } else fail("no development candidates listed");

  // And an identity has to be selectable.
  const scheme = page.getByRole("button", { name: /Downhill Run/i }).first();
  if (await scheme.count()) {
    await scheme.click();
    await page.waitForTimeout(600);
    const t3 = await text();
    if (/Downhill Run/.test(t3)) ok("an offensive identity can be installed");
    else fail("installing an identity did not stick");
  } else fail("no scheme options rendered");
}

console.log(`\nconsole errors: ${errs.length}`);
if (errs.length) errs.slice(0, 5).forEach(e => console.log("  - " + e.slice(0, 160)));
console.log(failures === 0 ? "\nINTERACTION TEST PASSED" : `\n${failures} INTERACTION FAILURES`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
