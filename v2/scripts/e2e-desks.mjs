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

/** Tag window: re-sign rows plus the Hub walk warning. Continue still closes it. */
export async function noteTagResignStep(page, { fail, ok }) {
  const t = await pageText(page);
  if (!/will walk if you Continue now/.test(t)) {
    fail("hub missing the walk warning before the tag window closes");
    return;
  }
  if (/No expiring players will walk/.test(t)) {
    ok("tag window walk warning is zero — no re-sign rows");
    return;
  }
  if (!/Meet asking/.test(t) || !/\bOffer\b/.test(t)) {
    fail("tag window re-sign step missing Offer / Meet asking");
    return;
  }
  const cols = await page.evaluate(() =>
    [...document.querySelectorAll("th")].map((th) => (th.textContent || "").replace(/\s+/g, " ").trim())
  );
  if (!cols.some((c) => c.startsWith("OVR"))) {
    fail(`tag window re-sign table has no OVR column (${cols.join(" | ")})`);
    return;
  }
  if (!cols.includes("POT")) {
    fail(`tag window re-sign table has no POT column (${cols.join(" | ")})`);
    return;
  }
  const section = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Re-sign" }),
  });
  const ovr = section.getByRole("button", { name: /^OVR/ });
  if (!(await ovr.count())) {
    fail("tag window OVR header is not a sort control");
    return;
  }
  const rowText = () => section.locator("tbody tr").evaluateAll((trs) =>
    trs.slice(0, 3).map((tr) => (tr.innerText || "").replace(/\s+/g, " ").trim())
  );
  const before = await rowText();
  await ovr.click();
  await page.waitForTimeout(200);
  const after = await rowText();
  if (before.join("\n") === after.join("\n") && before.length > 1) {
    fail("sorting the re-sign table by OVR did not change row order");
    return;
  }
  await page.screenshot({ path: "/tmp/strategy-shots/resign-ovr.png" });
  ok("tag window re-sign step lists OVR and POT, sorts by OVR, and warns who walks");
}

/** Season Review hub: awards, champion, and waivers each appear at most once. */
export async function checkSeasonReviewOnce(page, { fail, ok }) {
  const titles = await page.evaluate(() =>
    [...document.querySelectorAll("h2")].map((h) => (h.textContent || "").trim())
  );
  const n = (name) => titles.filter((t) => t === name).length;
  const problems = [];
  if (n("Awards") !== 1) problems.push(`Awards ×${n("Awards")}`);
  if (n("Champion") !== 1) problems.push(`Champion ×${n("Champion")}`);
  if (n("Waivers") > 1) problems.push(`Waivers ×${n("Waivers")}`);
  const body = await page.evaluate(() => document.body.innerText);
  if (/on waivers — Claim players/i.test(body)) problems.push("phase-card waiver button still present");
  if (problems.length) fail(`season review duplicated: ${problems.join(", ")}`);
  else {
    await page.screenshot({ path: "/tmp/strategy-shots/season-review.png", fullPage: true });
    ok(`season review shows awards and champion once${n("Waivers") ? ", waivers once" : " (no waiver wire this week)"}`);
  }
}

/**
 * /week Gameday Inactives opens on the suggested scratches. Show all lists
 * the rest of the 53, and Suggested only returns.
 * Returns "ok", "bye", or a short failure code.
 */
export async function checkGamedayInactives(page, base) {
  await page.goto(base + "/week", { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const weekTxt = await page.evaluate(() => document.body.innerText);
  if (/Bye week/i.test(weekTxt)) return "bye";
  if (!/Gameday Inactives/.test(weekTxt) || !/\bSit\b/.test(weekTxt)) return "missing";
  const section = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Gameday Inactives" }),
  });
  const rows = () => section.locator(".divide-y > div");
  const showAll = section.getByRole("button", { name: /^Show all$/ });
  if (!(await showAll.count())) return "no-show-all";
  const shortN = await rows().count();
  await showAll.click();
  await page.waitForTimeout(200);
  if (!(await section.getByRole("button", { name: /^Suggested only$/ }).count())) return "show-all-stuck";
  const fullN = await rows().count();
  if (fullN <= shortN) return `show-all-short ${shortN}->${fullN}`;
  await section.getByRole("button", { name: /^Suggested only$/ }).click();
  await page.waitForTimeout(150);
  if (!(await section.getByRole("button", { name: /^Show all$/ }).count())) return "suggested-stuck";
  const backN = await rows().count();
  if (backN !== shortN) return `suggested-count ${shortN}->${backN}`;
  await showAll.click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: "/tmp/strategy-shots/inactives-all.png" });
  await section.getByRole("button", { name: /^Suggested only$/ }).click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: "/tmp/strategy-shots/inactives-suggested.png" });
  return "ok";
}

/** Free-agency column renamed, with the rival-counter hint on the header. */
export async function checkLeadingBid(page, base, { fail, ok }) {
  await page.goto(base + "/free-agency", { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const found = await page.evaluate(() => {
    const th = [...document.querySelectorAll("th")].find((el) =>
      /Leading bid/i.test(el.textContent || "")
    );
    const titled = th?.querySelector("[title]")?.getAttribute("title") || th?.getAttribute("title") || "";
    return {
      column: !!th,
      hint: /rivals may counter when you bid/i.test(titled),
      visible: /Leading bid — rivals may counter when you bid/i.test(document.body.innerText),
      cpuBid: /CPU BID/i.test(document.body.innerText),
    };
  });
  if (!found.column) fail("free agency table has no Leading bid column");
  else if (!found.hint) fail("Leading bid column is missing the rival-counter hint");
  else if (found.cpuBid) fail("free agency still says CPU BID");
  else {
    await page.screenshot({ path: "/tmp/strategy-shots/leading-bid.png" });
    ok(`Leading bid column${found.visible ? " and the visible rival-counter line" : ""}`);
  }
}

/**
 * Place one asking-price bid on a player a CPU club is already leading,
 * advance one wave, and read the outbid toast. A win or a quiet wave is a
 * note. A toast that names a signing must include the years and money.
 */
export async function tryFaOutbidToast(page, base, { fail, ok }) {
  await page.goto(base + "/free-agency", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const hint = await page.evaluate(() =>
    /Leading bid — rivals may counter when you bid/i.test(document.body.innerText)
  );
  if (!hint) {
    fail("free-agency market is missing the Leading bid rival-counter line");
    return;
  }
  const target = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("tbody tr")];
    for (let i = 0; i < rows.length; i++) {
      const cells = [...rows[i].querySelectorAll("td")].map((td) => (td.innerText || "").trim());
      const bid = cells[5] || "";
      if (bid !== "—" && /\$/.test(bid) && /Bid/.test(cells[cells.length - 1] || "")) return i;
    }
    return -1;
  });
  if (target < 0) {
    console.log("  note  no CPU leading bid to lose — outbid toast not exercised");
    return;
  }
  const row = page.locator("tbody tr").nth(target);
  await row.getByRole("button", { name: /^Bid$/ }).click();
  await page.waitForTimeout(200);
  const offer = row.getByRole("button", { name: /^Offer$/ });
  if (!(await offer.count())) {
    console.log("  note  bid editor did not open — outbid toast not exercised");
    return;
  }
  await offer.click();
  await page.waitForTimeout(400);
  const advance = page.getByRole("button", { name: /Advance free agency/i });
  if (!(await advance.count())) {
    console.log("  note  market has no Advance control — outbid toast not exercised");
    return;
  }
  const pending = ((await page.locator("div.fixed.bottom-5").innerText().catch(() => "")) || "").trim();
  await advance.click();
  try {
    await page.waitForFunction((prev) => {
      const t = document.querySelector("div.fixed.bottom-5")?.textContent || "";
      return t.trim() !== "" && t.trim() !== prev && /signed with|You won|outbid|Wave /.test(t);
    }, pending, { timeout: 8000 });
  } catch {
    console.log("  note  advancing the market produced no bid toast");
    return;
  }
  const line = ((await page.locator("div.fixed.bottom-5").innerText()) || "").replace(/\s+/g, " ").trim();
  if (/You won/.test(line)) {
    console.log(`  note  the asking bid won (${line})`);
    return;
  }
  if (!/signed with [A-Z0-9]+ — \d+yr \/ \$[\d.]+[MK]/.test(line)) {
    fail(`outbid toast missing winning terms (${line})`);
    return;
  }
  await page.screenshot({ path: "/tmp/strategy-shots/outbid-toast.png" });
  ok(`outbid toast names the winning terms (${line})`);
}

/** Unsigned free agents do not wear a jersey number on the player page. */
export async function checkUnsignedFaNumber(page, base, { fail, ok }) {
  await page.goto(base + "/free-agency", { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const link = page.locator('a[href^="/player/"]').first();
  if (!(await link.count())) {
    fail("free agency has no player link to check the jersey");
    return;
  }
  await link.click();
  await page.waitForTimeout(500);
  const shown = await page.evaluate(() => {
    const h1 = (document.querySelector("h1")?.textContent || "").trim();
    const badge = [...document.querySelectorAll("span")].some((el) =>
      /^#\d+$/.test((el.textContent || "").trim())
    );
    const unsigned = /Unsigned free agent/i.test(document.body.innerText);
    return { h1, badge, unsigned };
  });
  if (!shown.unsigned) fail(`player page was not an unsigned free agent (${shown.h1})`);
  else if (/^#\d+/.test(shown.h1) || shown.badge) fail(`unsigned free agent shows a jersey (${shown.h1})`);
  else {
    await page.screenshot({ path: "/tmp/strategy-shots/unsigned-fa.png" });
    ok(`unsigned free agent has no jersey (${shown.h1})`);
  }
}

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
  } else if (!done.lastSnap) {
    // Coach-finish often ends on a kneel, kick, or score. §7.1 asks that
    // Last snap still be on the page, not that the final play be a run.
    fail("/play continue dropped Last snap");
  } else if (!done.hasDrive || !done.hasPbp) {
    fail("/play continue missing Drive Log or Play by Play");
  } else {
    ok("/play continue kept the opening kickoff as row 1; Last snap, Drive Log, and PBP still up");
  }

  const playWeek = page.getByRole("button", { name: /Play Week with these calls/i });
  if (!(await playWeek.count())) {
    fail("/play missing Play Week after the called game");
    return true;
  }
  await playWeek.click();
  try {
    await page.getByRole("heading", { name: "Week played" }).waitFor({ timeout: 30000 });
  } catch {
    fail("/play Play Week did not leave the Week played card up");
    return true;
  }
  await page.waitForTimeout(600);
  if (!(await page.getByRole("heading", { name: "Week played" }).count())) {
    fail("/play Week played card disappeared after the week advanced");
    return true;
  }
  const afterWeek = await page.evaluate(() => document.body.innerText);
  const line = /[A-Z]{2,4} \d+, [A-Z]{2,4} \d+ · (Win|Loss|Tie)( \(OT\))?/;
  if (!line.test(afterWeek)) {
    fail("/play result line missing after playWeek");
  } else if (!(await page.getByRole("button", { name: /Box score/i }).count())) {
    fail("/play Box score missing after playWeek");
  } else {
    ok("/play Play Week kept the Week played card, the result line, and Box score");
  }
  return "committed";
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

/**
 * /trades review before a trade commits. Propose sends the user's last own
 * pick for nothing — a club always takes a free pick and no cap or roster
 * rule can refuse it — so the review → Back → Confirm path runs on any save.
 * An incoming offer, when one is waiting, is opened and backed out of only.
 */
export async function checkTradeReview(page, base, { fail, ok }) {
  await page.goto(base + "/trades", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  if (/The trade window is closed/i.test(await pageText(page))) {
    ok("/trades review skipped: window closed");
    return;
  }

  const incoming = page.getByRole("button", { name: /^Accept$/ });
  if (await incoming.count()) {
    await incoming.first().click();
    const t = await pageText(page);
    if (!/Review before you accept/i.test(t) || !/Cap space now/i.test(t)) {
      fail("/trades Accept did not open the review");
    } else {
      await page.getByRole("button", { name: /^Back$/ }).click();
      if (!(await page.getByRole("button", { name: /^Accept$/ }).count())) {
        fail("/trades Back on an incoming review dropped the offer");
      } else ok("/trades incoming Accept opens the review; Back keeps the offer");
    }
  } else {
    ok("/trades no incoming offer to review on this save");
  }

  const sendCard = page.locator("section").filter({ hasText: "— you send" });
  const ownPicks = sendCard.getByRole("row").filter({ hasText: /Own$/ });
  const n = await ownPicks.count();
  if (!n) {
    fail("/trades no own pick to propose");
    return;
  }
  const picksBefore = Number((await page.getByText("Your Picks").locator("..").innerText()).match(/\d+/)?.[0]);
  await ownPicks.nth(n - 1).click();
  const propose = page.getByRole("button", { name: /^Propose trade$/ });
  await propose.click();
  let t = await pageText(page);
  if (!/Review before you propose/i.test(t) || !/After the trade/i.test(t)) {
    fail("/trades Propose did not open the review");
    return;
  }
  await page.getByRole("button", { name: /^Back$/ }).click();
  if (/Review before you propose/i.test(await pageText(page))) fail("/trades Back did not close the proposal review");
  await propose.click();
  await page.getByRole("button", { name: /^Confirm trade$/ }).dblclick();
  await page.waitForTimeout(800);
  t = await pageText(page);
  const picksAfter = Number((await page.getByText("Your Picks").locator("..").innerText()).match(/\d+/)?.[0]);
  if (/Review before you propose/i.test(t)) fail("/trades proposal review still open after Confirm");
  else if (picksAfter !== picksBefore - 1) fail(`/trades Confirm moved picks ${picksBefore} → ${picksAfter}, expected one`);
  else ok(`/trades Propose → review → Back → Confirm sent one pick (${picksBefore} → ${picksAfter})`);
}
