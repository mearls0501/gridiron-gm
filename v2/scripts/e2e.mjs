/**
 * End-to-end smoke test against the running dev/prod server.
 *
 * Creates a franchise, plays a full season into the offseason, and visits every
 * route at several points in the calendar — asserting that no page throws, logs
 * a console error, or renders Next's error boundary. This is the check that
 * separates "it compiles" from "a person can play it".
 *
 * Wave 3.2 also smokes the Wave 1/2 desks: /staff, /history, /play last-snap
 * + PBP, /finances Offer/Restructure, a soft holdout→finances path, and
 * post-FA draft pick count in the mid-260s.
 *
 * Phase 1 PBP §7.1 (P4): /play opening kickoff stays row 1 across a snap
 * and coach-finish; user /game/[id] Drive Chart + text PBP; CPU Drive
 * Chart with no snap log (absence is a note, a CPU snap log fails).
 *
 *   node scripts/e2e.mjs [baseUrl]
 */
import { chromium } from "playwright";
import {
  checkDraftBoard,
  checkFinancesDesk,
  checkGamedayInactives,
  checkHistoryDesk,
  checkHoldoutPath,
  checkLeadingBid,
  checkPhase1BoxScores,
  checkPlayLastSnap,
  checkSeasonReviewOnce,
  checkStaffDesk,
  checkUnsignedFaNumber,
  tryFaOutbidToast,
  hubPhase,
  noteTagResignStep,
  pressFaRosterAutoFix,
  waitForHubPhaseChange,
} from "./e2e-desks.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";

const ROUTES = [
  "/", "/roster", "/week", "/depth-chart", "/schedule", "/standings", "/stats",
  "/records", "/history", "/playoffs", "/free-agency", "/draft", "/finances",
  "/staff", "/play", "/league", "/saves",
];

let failures = 0;
const problems = [];

function fail(msg) {
  failures++;
  problems.push(msg);
  console.log(`  FAIL  ${msg}`);
}

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM || undefined,
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") {
      const t = m.text();
      // Next dev overlay noise and favicon 404s are not app failures.
      if (/favicon|Download the React DevTools/i.test(t)) return;
      consoleErrors.push(t);
    }
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

  const checkPage = async (label) => {
    const before = consoleErrors.length;
    // Next renders a specific error boundary on a client exception.
    const body = await page.evaluate(() => document.body.innerText);
    if (/Application error|Unhandled Runtime Error|client-side exception/i.test(body)) {
      fail(`${label}: error boundary rendered`);
    }
    if (body.trim().length < 20) {
      fail(`${label}: page rendered essentially empty`);
    }
    const newErrors = consoleErrors.slice(before);
    if (newErrors.length) fail(`${label}: console error — ${newErrors[0].slice(0, 180)}`);
  };

  const visitAll = async (phaseLabel) => {
    for (const r of ROUTES) {
      await page.goto(BASE + r, { waitUntil: "networkidle" });
      await page.waitForTimeout(180);
      await checkPage(`${phaseLabel} ${r}`);
    }
  };

  console.log(`\n=== E2E against ${BASE} ===\n`);

  // ---- Create a franchise ---------------------------------------------------
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(400);

  const startBtn = page.getByRole("button", { name: /Start Franchise/i });
  if (!(await startBtn.count())) {
    fail("new game screen did not render a Start Franchise button");
  } else {
    await startBtn.click();
    await page.waitForTimeout(2500); // league generation
  }

  const hasHub = await page.getByRole("button", { name: /Start the Season/i }).count();
  if (!hasHub) fail("hub did not appear after creating a franchise");
  else console.log("  ok    franchise created, hub rendered");

  // Sit leftover: /saves New Franchise looked wired (router.push("/new")) but
  // Shell kept the loaded-franchise chrome, so the picker sat below the fold.
  await page.goto(BASE + "/saves", { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const newFran = page.getByRole("link", { name: /^New Franchise$/ });
  const newFranBtn = page.getByRole("button", { name: /^New Franchise$/ });
  const newFranCtl = (await newFran.count()) ? newFran : newFranBtn;
  if (!(await newFranCtl.count())) fail("/saves has no New Franchise control");
  else {
    await newFranCtl.click();
    await page.waitForTimeout(500);
    const landed = await page.evaluate(() => {
      const start = [...document.querySelectorAll("button")].find((b) =>
        /Start Franchise/i.test(b.textContent || "")
      );
      const r = start?.getBoundingClientRect();
      return {
        path: location.pathname,
        hasPicker: /Pick the team/i.test(document.body.innerText),
        hasStart: !!start,
        startInView: !!(r && r.top < window.innerHeight && r.bottom > 0),
        keepSave: /Continue|My Franchise/i.test(document.body.innerText),
        stillInChrome: /Saved Franchises|Cap Space/i.test(document.body.innerText),
      };
    });
    if (landed.path !== "/new") fail(`/saves New Franchise stayed on ${landed.path}`);
    else if (!landed.hasPicker || !landed.hasStart) fail("/saves New Franchise did not show the new-franchise UI");
    else if (!landed.startInView) fail("/saves New Franchise reached /new but Start Franchise is below the fold");
    else if (!landed.keepSave) fail("/saves New Franchise dropped the existing save");
    else if (landed.stillInChrome) fail("/saves New Franchise kept the loaded-franchise chrome on /new");
    else console.log("  ok    /saves New Franchise reaches /new with the loaded save kept");
  }
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(400);

  // Laptop/tablet leftover: nowrap + overflow-x-auto half-cut Front Office
  // and hid League. Wrap so every NAV label is fully on-screen.
  const NAV_LABELS = [
    "Hub", "This Week", "Roster", "Depth Chart", "Schedule", "Standings",
    "Stats", "Records", "History", "Playoffs", "Free Agency", "Trades", "Draft",
    "Finances", "Front Office", "Staff", "League",
  ];
  for (const width of [1024, 768]) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(120);
    const problemsAt = await page.evaluate((labels) => {
      const nav = document.querySelector("header nav");
      if (!nav) return ["no header nav"];
      const found = [...nav.querySelectorAll("a")].map((a) => a.textContent.trim());
      const missing = labels.filter((l) => !found.includes(l)).map((l) => `missing ${l}`);
      const vw = window.innerWidth;
      const clipped = [...nav.querySelectorAll("a")]
        .filter((a) => {
          const r = a.getBoundingClientRect();
          return r.right > vw + 1 || r.left < -1 || r.width < 8;
        })
        .map((a) => `clipped ${a.textContent.trim()}`);
      return [...missing, ...clipped];
    }, NAV_LABELS);
    if (problemsAt.length) fail(`nav @${width}: ${problemsAt.join(", ")}`);
    else console.log(`  ok    nav fully visible at ${width}px`);
  }
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(200);
  const phone = await page.evaluate(() => {
    const menu = [...document.querySelectorAll("header button")].find((b) =>
      /^Menu$/i.test((b.textContent || "").trim())
    );
    const record = document.querySelector("[data-record]");
    const bar = document.querySelector('header nav[data-nav="bar"]');
    const menuBox = menu?.getBoundingClientRect();
    return {
      menuVisible: !!(menuBox && menuBox.width > 8 && getComputedStyle(menu).display !== "none"),
      barHidden: !bar || getComputedStyle(bar).display === "none",
      recordText: (record?.textContent || "").trim(),
      recordOneLine: !!record && record.getClientRects().length === 1,
      recordNowrap: !!record && getComputedStyle(record).whiteSpace === "nowrap",
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  if (!phone.menuVisible) fail("phone nav @390: Menu button is not visible");
  else if (!phone.barHidden) fail("phone nav @390: the desktop bar is still showing");
  else if (!phone.recordOneLine || !phone.recordNowrap || !phone.recordText) {
    fail(`phone nav @390: record is not one line (${phone.recordText})`);
  } else if (phone.scrollWidth !== 390) fail(`hub @390 scrollWidth ${phone.scrollWidth}`);
  else console.log(`  ok    phone nav collapsed at 390px, record "${phone.recordText}" on one line`);
  await page.getByRole("button", { name: /^Menu$/ }).click();
  await page.waitForTimeout(150);
  const opened = await page.evaluate((labels) => {
    const menu = document.querySelector("#phone-nav");
    if (!menu || getComputedStyle(menu).display === "none") return ["menu did not open"];
    const found = [...menu.querySelectorAll("a")].map((a) => a.textContent.trim());
    const missing = labels.filter((l) => !found.includes(l)).map((l) => `missing ${l}`);
    const wide = document.documentElement.scrollWidth !== 390 ? [`scrollWidth ${document.documentElement.scrollWidth}`] : [];
    return [...missing, ...wide];
  }, NAV_LABELS);
  if (opened.length) fail(`phone menu @390: ${opened.join(", ")}`);
  else console.log("  ok    phone menu lists every nav label at 390px");
  await page.goto(BASE + "/stats", { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  const statsWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  if (statsWidth !== 390) fail(`/stats @390 scrollWidth ${statsWidth}`);
  else console.log("  ok    /stats scrollWidth is 390 at 390px");
  await page.setViewportSize({ width: 1440, height: 900 });

  const report = {
    fail,
    ok: (m) => console.log(`  ok    ${m}`),
  };

  await checkLeadingBid(page, BASE, report);
  await checkUnsignedFaNumber(page, BASE, report);
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(300);

  await visitAll("[preseason]");

  await checkStaffDesk(page, BASE, report);
  await checkHistoryDesk(page, BASE, report);
  await checkFinancesDesk(page, BASE, report, { click: true });
  await checkHoldoutPath(page, BASE, report);

  // ---- Start the season -----------------------------------------------------
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  const startSeason = page.getByRole("button", { name: /Start the Season/i });
  if (await startSeason.count()) {
    await startSeason.click();
    await page.waitForTimeout(250);
    const confirm = page.getByRole("button", { name: /^Confirm$/ });
    if (await confirm.count()) await confirm.click();
    await page.waitForTimeout(3000); // schedule generation
  }
  await checkPage("[start season] /");
  console.log("  ok    season started");

  let weeks = 0;
  let playSmoked = await checkPlayLastSnap(page, BASE, report);
  if (playSmoked === "committed") weeks = 1;

  const checkInactives = async () => {
    const result = await checkGamedayInactives(page, BASE);
    if (result === "ok") console.log("  ok    /week shows suggested scratches and Show all");
    else if (result === "bye") console.log("  note  /week is a bye — gameday inactives deferred (not a fail)");
    else fail(`week gameday inactives: ${result}`);
    return result;
  };
  let inactives = await checkInactives();

  // Sit leftover: Hub Sim ▾ stayed open after click-away and Esc.
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  const simMenuBtn = page.getByRole("button", { name: /^Sim/ }).filter({ hasNotText: /Round|Week/ });
  if (!(await simMenuBtn.count())) fail("hub has no Sim menu after season start");
  else {
    await simMenuBtn.click();
    await page.waitForTimeout(150);
    const opened = await page.getByText("Through the Playoffs").count();
    if (!opened) fail("Sim menu did not open");
    else {
      await page.locator("h1").first().click();
      await page.waitForTimeout(150);
      if (await page.getByText("Through the Playoffs").count()) {
        fail("Sim menu stayed open after click-away");
      }
      await simMenuBtn.click();
      await page.waitForTimeout(150);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);
      if (await page.getByText("Through the Playoffs").count()) {
        fail("Sim menu stayed open after Escape");
      } else {
        console.log("  ok    Hub Sim menu dismisses on click-away and Esc");
      }
    }
  }

  // ---- Play the regular season ---------------------------------------------
  for (let i = 0; i < 25; i++) {
    if (!playSmoked) {
      const again = await checkPlayLastSnap(page, BASE, report);
      if (again === "committed") weeks += 1;
      playSmoked = again;
    }
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(200);
    const btn = page.getByRole("button", { name: /^(Play Week|Advance Week)/ });
    if (!(await btn.count())) break;
    if (inactives !== "ok" && /Play Week/i.test((await btn.innerText()) || "")) {
      inactives = await checkInactives();
      if (inactives === "ok") console.log("  ok    /week shows suggested scratches and Show all");
      else if (inactives !== "bye") fail(`week gameday inactives: ${inactives}`);
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      await page.waitForTimeout(200);
    }
    const advanceBtn = page.getByRole("button", { name: /^(Play Week|Advance Week)/ });
    if (!(await advanceBtn.count())) break;
    await advanceBtn.click();
    await page.waitForTimeout(900);
    await checkPage(`[week ${i + 1}] /`);
    weeks++;
  }
  console.log(`  ok    played ${weeks} weeks`);
  if (weeks < 18) fail(`only advanced ${weeks} weeks — expected 18`);

  await visitAll("[midseason]");

  // ---- Playoffs -------------------------------------------------------------
  let rounds = 0;
  for (let i = 0; i < 6; i++) {
    // visitAll() above left the browser on another route; the advance control
    // only exists on the hub.
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    const btn = page.getByRole("button", { name: /Sim .* Round/i });
    if (!(await btn.count())) break;
    await btn.click();
    await page.waitForTimeout(1200);
    await checkPage(`[playoff round ${i + 1}] /`);
    rounds++;
  }
  console.log(`  ok    played ${rounds} playoff rounds`);
  if (rounds < 4) fail(`only ${rounds} playoff rounds — expected 4`);

  await page.goto(BASE + "/playoffs", { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await checkPage("[postseason] /playoffs");

  // ---- Box scores: user text PBP, CPU drive chart (§7.1) -------------------
  await checkPhase1BoxScores(page, BASE, report, (label) => checkPage(`[box score] ${label}`));

  // ---- A player page --------------------------------------------------------
  await page.goto(BASE + "/roster", { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const rosterTxt = await page.evaluate(() => document.body.innerText);
  if (!/Injured Reserve/.test(rosterTxt) || !/Practice Squad/.test(rosterTxt)) {
    fail("roster missing IR / practice-squad sections");
  } else {
    console.log("  ok    roster shows IR and practice squad");
  }
  const playerLink = page.locator('a[href^="/player/"]').first();
  if (await playerLink.count()) {
    await playerLink.click();
    await page.waitForTimeout(700);
    await checkPage("[player] /player/[id]");
    console.log("  ok    player page renders");
  } else {
    fail("no player links found on the roster");
  }

  // ---- Offseason ------------------------------------------------------------
  let steps = 0;
  let draftBoardChecked = false;
  let resignNoted = false;
  let reviewChecked = false;
  let outbidTried = false;
  for (let i = 0; i < 15; i++) {
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    if (!reviewChecked && (await hubPhase(page)) === "Season Review") {
      reviewChecked = true;
      await checkSeasonReviewOnce(page, report);
    }
    if (!outbidTried && (await hubPhase(page)) === "Free Agency") {
      outbidTried = true;
      await tryFaOutbidToast(page, BASE, report);
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
    }
    if ((await hubPhase(page)) === "Preseason" && steps > 0) break;
    if (!draftBoardChecked && await page.getByRole("button", { name: /Finish the Draft/i }).count()) {
      await checkDraftBoard(page, BASE, report);
      draftBoardChecked = true;
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      await page.waitForTimeout(300);
    }
    await pressFaRosterAutoFix(page);
    const btn = page
      .getByRole("button", { name: /Continue to|Finish the Draft|Play Preseason Week|Start the Season|Roster Cutdown|Continue$/i })
      .first();
    if (!(await btn.count())) break;
    if (!(await btn.isEnabled())) {
      fail(`offseason advance stayed disabled at step ${i + 1}`);
      break;
    }
    const label = ((await btn.innerText()) || "").replace(/\s+/g, " ").trim();
    if (/Continue to Free Agency/i.test(label) && !resignNoted) {
      resignNoted = true;
      await noteTagResignStep(page, report);
    }
    const phaseBefore = await hubPhase(page);
    const yielded = /Finish the Draft|Continue to the Draft/i.test(label);
    await btn.click();
    await page.waitForTimeout(250);
    const confirm = page.getByRole("button", { name: /^Confirm$/ });
    if (await confirm.count()) await confirm.click();
    const preseasonWeek = /Play Preseason Week (\d)/i.exec(label)?.[1];
    if (yielded && phaseBefore) {
      await waitForHubPhaseChange(page, phaseBefore);
    } else if (preseasonWeek) {
      // The user's result for that week appears on the hub's Preseason card.
      const row = new RegExp(`Week ${preseasonWeek} · (vs|at) [A-Z]{2,4} · \\d+-\\d+`);
      try {
        await page.waitForFunction((src) => new RegExp(src).test(document.body.innerText), row.source, { timeout: 60000 });
        report.ok(`preseason week ${preseasonWeek} played and shown on the hub`);
      } catch {
        fail(`preseason week ${preseasonWeek}: no result on the hub`);
      }
    } else {
      await page.waitForTimeout(2500);
    }
    await checkPage(`[offseason step ${i + 1}] /`);
    steps++;
    await visitAll(`[offseason ${i + 1}]`);
    // The hub's phase label, not page text: camp now shows a Preseason card.
    if ((await hubPhase(page)) === "Preseason" && i >= 2) break;
  }
  console.log(`  ok    completed ${steps} offseason steps`);
  if (steps < 4) fail(`only ${steps} offseason steps — expected 4`);

  // ---- Season 2 started? ----------------------------------------------------
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const body = await page.evaluate(() => document.body.innerText);
  if (!/Preseason/i.test(body)) fail("did not roll into the next preseason");
  else console.log("  ok    rolled into the next season");
  if (!reviewChecked) fail("never landed on Season Review to check awards / champion / waivers");

  const pickNews = await page.evaluate(() => {
    const t = document.body.innerText;
    const stored = t.match(/\b20\d{2} (?:R\d|#\d+)/);
    const labeled = t.match(/\b20\d{2} Draft (?:R\d|#\d+)/);
    return { stored: stored?.[0] ?? null, labeled: labeled?.[0] ?? null };
  });
  if (pickNews.stored) fail(`news still shows the stored pick year (${pickNews.stored})`);
  else if (pickNews.labeled) console.log(`  ok    news uses the draft-year label (${pickNews.labeled})`);
  else {
    await page.goto(BASE + "/league", { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    const leagueNews = await page.evaluate(() => {
      const t = document.body.innerText;
      const stored = t.match(/\b20\d{2} (?:R\d|#\d+)/);
      const labeled = t.match(/\b20\d{2} Draft (?:R\d|#\d+)/);
      return { stored: stored?.[0] ?? null, labeled: labeled?.[0] ?? null };
    });
    if (leagueNews.stored) fail(`league news still shows the stored pick year (${leagueNews.stored})`);
    else if (leagueNews.labeled) console.log(`  ok    league news uses the draft-year label (${leagueNews.labeled})`);
    else console.log("  note  no pick line in the news to check the draft-year label");
  }

  await checkHistoryDesk(page, BASE, report, { expectArchive: true });

  // ---- Prior-season standings from history --------------------------------
  await page.goto(BASE + "/league", { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await checkPage("[history] /league");
  const leagueText = await page.evaluate(() => document.body.innerText);
  if (!/\bROY\b/.test(leagueText)) fail("league history has no ROY column");
  const seasonLink = page.locator('a[href^="/standings?season="]').first();
  if (!(await seasonLink.count())) {
    fail("league history has no standings link for a prior season");
  } else {
    await seasonLink.click();
    await page.waitForTimeout(500);
    await checkPage("[history] /standings?season=");
    const standingsText = await page.evaluate(() => document.body.innerText);
    if (!/final/i.test(standingsText)) fail("archived standings did not label a prior season as final");
    else console.log("  ok    prior-season standings open from history");
  }

  // ---- Reload persistence ---------------------------------------------------
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const afterReload = await page.evaluate(() => document.body.innerText);
  if (/Start Franchise/i.test(afterReload)) fail("franchise did not persist across a reload");
  else console.log("  ok    save persisted across reload");

  // Retired (and pending) GMs used to bounce off /new back to the desk.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const retirePage = await ctx.newPage();
    retirePage.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
    await retirePage.goto(BASE + "/", { waitUntil: "networkidle" });
    await retirePage.waitForTimeout(400);
    await retirePage.getByRole("button", { name: /Start Franchise/i }).click();
    await retirePage.waitForTimeout(3000);
    await retirePage.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open("gridiron-gm", 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const id = await new Promise((resolve, reject) => {
        const tx = db.transaction("meta", "readonly");
        const req = tx.objectStore("meta").get("lastSaveId");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const save = await new Promise((resolve, reject) => {
        const tx = db.transaction("saves", "readonly");
        const req = tx.objectStore("saves").get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      save.forcedMove = { fromTeamId: save.userTeamId, season: save.season, openChairs: [] };
      await new Promise((resolve, reject) => {
        const tx = db.transaction("saves", "readwrite");
        tx.objectStore("saves").put(save);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    });
    await retirePage.goto(BASE + "/forced-move", { waitUntil: "networkidle" });
    await retirePage.waitForTimeout(600);
    const retireBtn = retirePage.getByRole("button", { name: /^Retire$/ });
    if (!(await retireBtn.count())) fail("retire flow never reached the Retire button");
    else {
      await retireBtn.click();
      await retirePage.waitForTimeout(400);
      const saves = retirePage.getByRole("button", { name: /^Saves$/ });
      if (await saves.count()) await saves.click();
      else await retirePage.goto(BASE + "/saves", { waitUntil: "networkidle" });
      await retirePage.waitForTimeout(400);
      const newFran = retirePage.getByRole("link", { name: /^New Franchise$/ });
      const newFranBtn = retirePage.getByRole("button", { name: /^New Franchise$/ });
      const ctl = (await newFran.count()) ? newFran : newFranBtn;
      if (!(await ctl.count())) fail("retire flow has no New Franchise control");
      else {
        await ctl.click();
        await retirePage.waitForTimeout(500);
        const landed = await retirePage.evaluate(() => ({
          path: location.pathname,
          text: document.body.innerText,
        }));
        if (landed.path !== "/new") fail(`retire → /new stayed on ${landed.path}`);
        else if (!/Start Franchise/i.test(landed.text) || !/Pick the team/i.test(landed.text)) {
          fail("retire → /new did not render NewGameScreen");
        } else if (/You've been fired|forced move/i.test(landed.text)) {
          fail("retire → /new still showed the forced-move desk");
        } else console.log("  ok    retire → /new renders NewGameScreen");
      }
    }
    await ctx.close();
  }

  await browser.close();

  console.log(`\n${failures === 0 ? "E2E PASSED" : `${failures} E2E FAILURES`}`);
  if (problems.length) {
    console.log("\nProblems:");
    for (const p of problems.slice(0, 25)) console.log("  - " + p);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("E2E harness crashed:", e);
  process.exit(1);
});
