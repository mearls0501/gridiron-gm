/**
 * Wave 1/2 desk smokes shared by e2e.mjs and e2e-interact.mjs.
 *
 * Presence + navigation, plus Phase 1 PBP §7.1 browser asserts
 * (checkPlayLastSnap, checkPhase1BoxScores). Soft-skip RNG-dependent
 * holdouts so the suite stays green. Do not import sim core from here.
 */

/** Opening emit in sim/game.ts — first PBP row on every game. */
const OPENING_KICKOFF = "Kickoff — touchback";

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
  const offer = page.getByRole("button", { name: /^Offer$/ });
  const rest = page.getByRole("button", { name: /^Restructure$/ });
  const offerN = await offer.count();
  const restN = await rest.count();
  if (!offerN || !restN) {
    fail(`/finances missing contract-office controls (Offer=${offerN} Restructure=${restN})`);
    return;
  }
  ok(`/finances Offer (${offerN}) and Restructure (${restN}) present`);

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
    for (let i = 0; i < offerN; i++) {
      if (await offer.nth(i).isEnabled()) {
        await offer.nth(i).click();
        clicked = "Offer";
        break;
      }
    }
  }
  if (!clicked) {
    console.log("  note  no enabled Offer/Restructure this roster — presence only");
    return;
  }
  await page.waitForTimeout(700);
  const after = await pageText(page);
  if (/Application error|Unhandled Runtime Error|client-side exception/i.test(after)) {
    fail(`${clicked} on /finances hit the error boundary`);
  } else if (!/Cap Space|Offer|Restructure/i.test(after)) {
    fail(`${clicked} on /finances left the desk empty`);
  } else {
    ok(`/finances ${clicked} smoke did not blow up the desk`);
  }
}

const HUB_PHASE_RE = /\b20\d{2}\s+(Preseason|Regular Season|Playoffs|Season Review|Franchise Tag|Free Agency|Draft|Roster Cutdown)\b/;

export function hubPhase(page) {
  return page.evaluate((source) => {
    const re = new RegExp(source);
    const h1 = document.querySelector("h1");
    const block = h1?.parentElement?.innerText ?? document.body.innerText;
    const m = block.match(re);
    return m ? m[1] : "";
  }, HUB_PHASE_RE.source);
}

/** FA hub shows a roster-count issue and Auto-fix. Press it so Continue can proceed. */
export async function pressFaRosterAutoFix(page) {
  const phase = await hubPhase(page);
  if (phase !== "Free Agency") return false;
  const body = await pageText(page);
  if (!/Roster (under|over) the limit/i.test(body)) return false;
  const fix = page.getByRole("button", { name: /^Auto-fix$/ }).first();
  if (!(await fix.count())) return false;
  await fix.click();
  await page.waitForTimeout(800);
  return true;
}

/**
 * Yielded offseason (FA continue, Finish the Draft) must land before the next
 * navigation. The hub paints the new phase, then the save commits. A goto in
 * between reloads the pre-sim franchise, so this also waits until IndexedDB
 * has that same phase.
 */
export async function waitForHubPhaseChange(page, before) {
  await page.waitForFunction((prev) => {
    const re = /\b20\d{2}\s+(Preseason|Regular Season|Playoffs|Season Review|Franchise Tag|Free Agency|Draft|Roster Cutdown)\b/;
    const h1 = document.querySelector("h1");
    const block = h1?.parentElement?.innerText ?? document.body.innerText;
    const m = block.match(re);
    const phase = m ? m[1] : "";
    return phase !== "" && phase !== prev;
  }, before, { timeout: 180000 });
  await page.waitForFunction((prev) => {
    const re = /\b20\d{2}\s+(Preseason|Regular Season|Playoffs|Season Review|Franchise Tag|Free Agency|Draft|Roster Cutdown)\b/;
    const labels = {
      preseason: "Preseason",
      regular: "Regular Season",
      playoffs: "Playoffs",
      "offseason-recap": "Season Review",
      "offseason-tag": "Franchise Tag",
      "offseason-fa": "Free Agency",
      "offseason-draft": "Draft",
      "offseason-final": "Roster Cutdown",
    };
    const h1 = document.querySelector("h1");
    const block = h1?.parentElement?.innerText ?? document.body.innerText;
    const m = block.match(re);
    const visible = m ? m[1] : "";
    if (!visible || visible === prev) return false;
    return new Promise((resolve) => {
      const req = indexedDB.open("gridiron-gm", 1);
      req.onerror = () => resolve(false);
      req.onsuccess = () => {
        const db = req.result;
        const meta = db.transaction("meta", "readonly").objectStore("meta").get("lastSaveId");
        meta.onerror = () => {
          db.close();
          resolve(false);
        };
        meta.onsuccess = () => {
          const id = meta.result;
          if (!id) {
            db.close();
            resolve(false);
            return;
          }
          const row = db.transaction("saves", "readonly").objectStore("saves").get(id);
          row.onerror = () => {
            db.close();
            resolve(false);
          };
          row.onsuccess = () => {
            db.close();
            resolve((labels[row.result?.phase] ?? "") === visible);
          };
        };
      };
    });
  }, before, { timeout: 180000 });
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
 * Live /play desk, read from the DOM. No sim imports.
 * `rowLines[0]` is the opening PBP row the §7.1 no-re-sim check watches.
 */
async function readLiveDesk(page) {
  return page.evaluate(() => {
    const collapse = (s) => (s || "").replace(/\s+/g, " ").trim();
    const sections = [...document.querySelectorAll("section")];
    const titled = (name) =>
      sections.find((s) => collapse(s.querySelector("h2")?.textContent) === name);
    const pbp = titled("Play by Play");
    const rowLines = pbp
      ? [...pbp.querySelectorAll("div")]
          .map((row) => {
            const spans = [...row.children].filter((el) => el.tagName === "SPAN");
            if (spans.length < 2) return "";
            return collapse(spans[spans.length - 1].textContent);
          })
          .filter(Boolean)
      : [];
    const snapCount = Number(
      (pbp?.querySelector("header p")?.textContent || "").match(/(\d+)\s+snaps/)?.[1] ?? 0
    );
    const sit = sections.find((s) =>
      /^(Q\d|OT)/.test(collapse(s.querySelector("h2")?.textContent))
    );
    const drive = titled("Drive Log");
    const label = [...document.querySelectorAll("div")].find(
      (d) => d.children.length === 0 && collapse(d.textContent) === "Last snap"
    );
    const liveP = label?.parentElement?.querySelector("p");
    const doneP = titled("Last snap")?.querySelector("p");
    return {
      rowLines,
      snapCount,
      clock: collapse(sit?.querySelector("h2")?.textContent),
      down: collapse(sit?.querySelector("header p")?.textContent),
      driveText: collapse(drive?.innerText),
      hasDrive: !!drive,
      hasPbp: !!pbp,
      lastSnap: collapse(liveP?.textContent || doneP?.textContent),
    };
  });
}

/**
 * Call user snaps and assert the §7.1 /play bar:
 * opening row is the kickoff touchback; Run/Pass updates Last snap;
 * that same row stays row 1; clock or Drive Log moves; continue
 * (Let the coach finish) does not rewrite the opening row.
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
  if (!(await snap.isEnabled())) {
    fail("/play Run/Pass was disabled before a snap");
    return true;
  }

  await page.getByRole("heading", { name: "Play by Play" }).waitFor({ timeout: 8000 }).catch(() => {});
  const before = await readLiveDesk(page);
  if (before.rowLines[0] !== OPENING_KICKOFF) {
    fail(
      `/play opening PBP row is ${JSON.stringify(before.rowLines[0] || "(missing)")}, expected ${OPENING_KICKOFF}`
    );
    return true;
  }

  await snap.click();
  try {
    await page.waitForFunction(() => {
      const collapse = (s) => (s || "").replace(/\s+/g, " ").trim();
      return [...document.querySelectorAll("div")].some(
        (d) => d.children.length === 0 && collapse(d.textContent) === "Last snap"
      );
    }, { timeout: 10000 });
  } catch {
    fail("/play Last snap did not appear after Run/Pass");
    return true;
  }

  const after = await readLiveDesk(page);
  const clockMoved = after.clock !== before.clock || after.down !== before.down;
  const driveMoved = after.hasDrive && after.driveText !== before.driveText;
  const lastSnapUpdated = /(\brun\b|\bpass\b|\bsacked\b)/i.test(after.lastSnap);
  if (!lastSnapUpdated) {
    fail(`/play Last snap did not update after Run/Pass [${after.lastSnap || "missing"}]`);
    return true;
  }
  if (after.rowLines[0] !== OPENING_KICKOFF) {
    fail(`/play opening row changed to ${JSON.stringify(after.rowLines[0])} after the snap (re-sim)`);
    return true;
  }
  if (!clockMoved && !driveMoved) {
    fail("/play clock and Drive Log did not move after the called snap");
    return true;
  }
  if (!after.hasDrive || !after.hasPbp) {
    fail("/play missing Drive Log or Play by Play after the called snap");
    return true;
  }
  if (!(after.snapCount > before.snapCount)) {
    fail(`/play snap count did not grow (${before.snapCount} → ${after.snapCount})`);
    return true;
  }
  ok(
    `/play Last snap updated; opening kickoff stayed row 1; clock ${before.clock || "?"} → ${after.clock || after.down}`
  );

  for (let i = 0; i < 2; i++) {
    if (!(await snap.count()) || !(await snap.isEnabled())) break;
    await snap.click();
    await page.waitForTimeout(500);
  }
  const mid = await readLiveDesk(page);
  if (mid.rowLines[0] !== OPENING_KICKOFF) {
    fail(`/play opening row changed to ${JSON.stringify(mid.rowLines[0])} across further snaps`);
    return true;
  }

  const finish = page.getByRole("button", { name: /Let the coach finish/i });
  if (!(await finish.count()) || !(await finish.isEnabled())) {
    fail("/play missing Let the coach finish after called snaps");
    return true;
  }
  await finish.click();
  try {
    await page.getByRole("heading", { name: "Game called" }).waitFor({ timeout: 25000 });
  } catch {
    fail("/play continue did not finish the called game");
    return true;
  }
  const done = await readLiveDesk(page);
  if (done.rowLines[0] !== OPENING_KICKOFF) {
    fail(`/play continue rewrote the opening kickoff row (${JSON.stringify(done.rowLines[0])})`);
  } else if (!/(\brun\b|\bpass\b|\bsacked\b)/i.test(done.lastSnap)) {
    fail("/play continue dropped Last snap");
  } else if (!done.hasDrive || !done.hasPbp) {
    fail("/play continue missing Drive Log or Play by Play");
  } else {
    ok("/play continue kept the opening kickoff as row 1; Last snap, Drive Log, and PBP still up");
  }
  return true;
}

/**
 * Box-score half of §7.1, after Play Week has written games.
 * User Recap must show Drive Chart + text PBP grouped by drive.
 * A non-user League Final must show Drive Chart; a missing snap log
 * is a note, not a fail (P5 is not signed). A CPU snap log fails.
 * Optional `onPage(label)` runs while that box is on screen (console check).
 */
export async function checkPhase1BoxScores(page, base, { fail, ok }, onPage) {
  await page.goto(base + "/schedule", { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const recap = page.getByRole("link", { name: /^Recap$/ }).first();
  if (!(await recap.count())) {
    fail("/game user: schedule has no Recap after Play Week");
    return;
  }
  await recap.click();
  await page.waitForTimeout(400);
  await page.getByRole("heading", { name: "Drive Chart" }).waitFor({ timeout: 8000 }).catch(() => {});
  if (onPage) await onPage("/game user");
  const userPath = await page.evaluate(() => location.pathname);
  const userBox = await readBoxScore(page);
  if (userBox.error) fail(`${userPath}: error boundary rendered`);
  else if (!userBox.hasStats) fail("box score has no stat sections");
  else if (!userBox.hasDrive || userBox.poss < 1) {
    fail(`/game user: Drive Chart missing (${userPath})`);
  } else if (!userBox.hasPbp || userBox.snaps < 1) {
    fail(`/game user: text Play by Play missing (${userPath})`);
  } else if (userBox.groups < 1) {
    fail(`/game user: Play by Play is not grouped by drive (${userPath})`);
  } else {
    ok(
      `/game user Drive Chart (${userBox.poss} possessions) + text PBP (${userBox.snaps} snaps, ${userBox.groups} drives)`
    );
  }

  await page.goto(base + "/schedule", { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  const league = page.getByRole("button", { name: /^League$/ });
  if (!(await league.count())) {
    fail("/game CPU: schedule has no League tab");
    return;
  }
  await league.click();
  await page.waitForTimeout(200);
  const week1 = page.getByRole("button", { name: "1", exact: true });
  if (await week1.count()) {
    await week1.click();
    await page.waitForTimeout(250);
  }
  const cpuHref = await page.evaluate((skip) => {
    for (const tr of document.querySelectorAll("tr")) {
      const a = tr.querySelector('a[href^="/game/"]');
      if (!a) continue;
      const href = a.getAttribute("href") || "";
      if (href === skip) continue;
      if (/accent/.test(tr.className)) continue;
      return href;
    }
    return null;
  }, userPath);
  if (!cpuHref) {
    fail("/game CPU: no non-user Final link on the league slate");
    return;
  }
  await page.goto(base + cpuHref, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.getByRole("heading", { name: "Drive Chart" }).waitFor({ timeout: 8000 }).catch(() => {});
  if (onPage) await onPage("/game CPU");
  const cpuBox = await readBoxScore(page);
  if (cpuBox.error) fail(`${cpuHref}: error boundary rendered`);
  else if (!cpuBox.hasStats) fail("CPU box score has no stat sections");
  else if (!cpuBox.hasDrive || cpuBox.poss < 1) {
    fail(`/game CPU: Drive Chart missing (${cpuHref})`);
  } else if (cpuBox.hasPbp) {
    fail(`/game CPU: snap log present (${cpuBox.snaps} snaps at ${cpuHref}); P5 is not signed`);
  } else {
    console.log("  note  CPU box snap log absent (OK — P5 not signed)");
    ok(`/game CPU Drive Chart (${cpuBox.poss} possessions); no snap log`);
  }
}

async function readBoxScore(page) {
  return page.evaluate(() => {
    const collapse = (s) => (s || "").replace(/\s+/g, " ").trim();
    const ownText = (el) =>
      collapse(
        [...el.childNodes]
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent)
          .join("")
      );
    const sections = [...document.querySelectorAll("section")];
    const titled = (name) =>
      sections.find((s) => collapse(s.querySelector("h2")?.textContent) === name);
    const drive = titled("Drive Chart");
    const pbp = titled("Play by Play");
    const poss = Number(
      (drive?.querySelector("header p")?.textContent || "").match(/(\d+)\s+possessions/)?.[1] ?? 0
    );
    const snaps = Number(
      (pbp?.querySelector("header p")?.textContent || "").match(/(\d+)\s+snaps/)?.[1] ?? 0
    );
    const groups = pbp
      ? [...pbp.querySelectorAll("div")].filter((d) => /^Drive \d+/.test(ownText(d))).length
      : 0;
    const body = document.body.innerText;
    return {
      hasStats: /Scoring|Passing|Rushing/i.test(body),
      error: /Application error|Unhandled Runtime Error|client-side exception/i.test(body),
      hasDrive: !!drive,
      poss,
      hasPbp: !!pbp,
      snaps,
      groups,
    };
  });
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
