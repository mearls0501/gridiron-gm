/**
 * Wave 1/2 desk smokes shared by e2e.mjs and e2e-interact.mjs.
 *
 * Presence + navigation only. Soft-skip RNG-dependent holdouts so the
 * suite stays green. Do not import sim core from here.
 */

export function pageText(page) {
  return page.evaluate(() => document.body.innerText);
}

export function parseDraftPickCount(text) {
  const ofN = text.match(/pick\s+\d+\s+of\s+(\d+)/i);
  if (ofN) return Number(ofN[1]);
  const made = text.match(/\d+\s+of\s+(\d+)\s+picks made/i);
  if (made) return Number(made[1]);
  return null;
}

/** Comp + slot scale land after FA; published board is mid-260s, not 224. */
export const DRAFT_PICK_MIN = 248;
export const DRAFT_PICK_MAX = 290;

export async function checkStaffDesk(page, base, { fail, ok }) {
  await page.goto(base + "/staff", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const t = await pageText(page);
  if (!/\bStaff\b/.test(t) || !/Head Coach/i.test(t) || !/\bOwner\b/.test(t)) {
    fail("/staff missing people-layer chrome");
  } else if (!/Offensive Coordinator/i.test(t) || !/Defensive Coordinator/i.test(t)) {
    fail("/staff missing coordinator chairs");
  } else {
    ok("/staff people desk loaded");
  }
}

export async function checkHistoryDesk(page, base, { fail, ok }, { expectArchive = false } = {}) {
  await page.goto(base + "/history", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const t = await pageText(page);
  if (!/Franchise History/i.test(t) || !/Hall of Fame/i.test(t)) {
    fail("/history missing franchise archive / HoF");
  } else {
    ok("/history franchise archive loaded");
  }
  if (expectArchive && /No seasons in the books yet/i.test(t)) {
    fail("/history still empty after a completed season");
  }
}

export async function checkFinancesDesk(page, base, { fail, ok }, { click = false } = {}) {
  await page.goto(base + "/finances", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const extend = page.getByRole("button", { name: /^Extend$/ });
  const rest = page.getByRole("button", { name: /^Restructure$/ });
  const extendN = await extend.count();
  const restN = await rest.count();
  if (!extendN || !restN) {
    fail(`/finances missing contract-office controls (Extend=${extendN} Restructure=${restN})`);
    return;
  }
  ok(`/finances Extend (${extendN}) and Restructure (${restN}) present`);

  if (!click) return;

  let clicked = null;
  for (let i = 0; i < restN; i++) {
    if (await rest.nth(i).isEnabled()) {
      await rest.nth(i).click();
      clicked = "Restructure";
      break;
    }
  }
  if (!clicked) {
    for (let i = 0; i < extendN; i++) {
      if (await extend.nth(i).isEnabled()) {
        await extend.nth(i).click();
        clicked = "Extend";
        break;
      }
    }
  }
  if (!clicked) {
    console.log("  note  no enabled Extend/Restructure this roster — presence only");
    return;
  }
  await page.waitForTimeout(700);
  const after = await pageText(page);
  if (/Application error|Unhandled Runtime Error|client-side exception/i.test(after)) {
    fail(`${clicked} on /finances hit the error boundary`);
  } else if (!/Cap Space|Extend|Restructure/i.test(after)) {
    fail(`${clicked} on /finances left the desk empty`);
  } else {
    ok(`/finances ${clicked} smoke did not blow up the desk`);
  }
}

/**
 * Holdouts are seed/club dependent. If one surfaces, the briefing must
 * reach /finances. If not, note it — do not fail the suite.
 */
export async function checkHoldoutPath(page, base, { fail, ok }) {
  await page.goto(base + "/week", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const holdout = page.locator('a[href="/finances"]').filter({ hasText: /holdout/i });
  if (!(await holdout.count())) {
    console.log("  note  no holdout on /week this seed — psych path skipped (not a fail)");
    return;
  }
  await holdout.first().click();
  await page.waitForTimeout(600);
  const path = await page.evaluate(() => location.pathname);
  const t = await pageText(page);
  if (path !== "/finances") {
    fail(`holdout briefing left us on ${path}, not /finances`);
  } else if (/Application error|Unhandled Runtime Error|client-side exception/i.test(t)) {
    fail("holdout → /finances rendered the error boundary");
  } else {
    ok("holdout briefing reaches /finances");
  }
}

/**
 * Call a couple of user snaps so last-snap + the live log exist.
 * Does not commit Play Week. Returns false on bye / no game so the
 * caller can retry after Advance Week — do not fail the suite on bye.
 */
export async function checkPlayLastSnap(page, base, { fail, ok }) {
  await page.goto(base + "/play", { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  const t = await pageText(page);

  if (/Bye week|No game to call/i.test(t)) {
    console.log("  note  /play has no live snaps this week — last-snap deferred (not a fail)");
    return false;
  }

  const run = page.getByRole("button", { name: /^Run$/ });
  const pass = page.getByRole("button", { name: /^Pass$/ });
  if (!(await run.count()) && !(await pass.count())) {
    fail("/play missing Run/Pass snap controls");
    return false;
  }

  const snap = (await run.count()) ? run.first() : pass.first();
  for (let i = 0; i < 3; i++) {
    if (!(await snap.count()) || !(await snap.isEnabled())) break;
    await snap.click();
    await page.waitForTimeout(700);
  }

  const after = await pageText(page);
  const lastSnap = /Last snap/i.test(after);
  const liveLog = /Play by Play/i.test(after) || /Drive Log/i.test(after);
  if (!lastSnap && !liveLog) {
    fail("/play called snaps but last-snap / PBP log did not appear");
    return false;
  }
  if (!lastSnap) fail("/play missing Last snap after called plays");
  else if (!liveLog) fail("/play missing Play by Play / Drive Log after called plays");
  else ok("/play last-snap and live PBP log visible");
  return true;
}

export async function checkDraftBoard(page, base, { fail, ok }) {
  await page.goto(base + "/draft", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const open = page.getByRole("button", { name: /Open the draft room/i });
  if (await open.count()) {
    await open.click();
    await page.waitForTimeout(1200);
  }
  const t = await pageText(page);
  const n = parseDraftPickCount(t);
  if (n == null) {
    fail("/draft did not show a pick count (expected pick X of N after FA)");
    return;
  }
  if (n < DRAFT_PICK_MIN || n > DRAFT_PICK_MAX) {
    fail(`/draft pick count ${n} is not mid-260s (expected ${DRAFT_PICK_MIN}–${DRAFT_PICK_MAX}; 224 means comps missing)`);
  } else {
    ok(`/draft board is ${n} picks (comp / slot-scale range)`);
  }
  if (/\bComp\b/i.test(t)) ok("/draft shows a compensatory slot");
  else console.log("  note  no Comp label on the draft desk this seed");
}
