/**
 * End-to-end smoke test against the running dev/prod server.
 *
 * Creates a franchise, plays a full season into the offseason, and visits every
 * route at several points in the calendar — asserting that no page throws, logs
 * a console error, or renders Next's error boundary. This is the check that
 * separates "it compiles" from "a person can play it".
 *
 *   node scripts/e2e.mjs [baseUrl]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";

const ROUTES = [
  "/", "/roster", "/depth-chart", "/schedule", "/standings", "/stats",
  "/records", "/playoffs", "/free-agency", "/draft", "/finances", "/league", "/saves",
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

  // Laptop/tablet leftover: nowrap + overflow-x-auto half-cut Front Office
  // and hid League. Wrap so every NAV label is fully on-screen.
  const NAV_LABELS = [
    "Hub", "This Week", "Roster", "Depth Chart", "Schedule", "Standings",
    "Stats", "Records", "Playoffs", "Free Agency", "Trades", "Draft",
    "Finances", "Front Office", "League",
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
  await page.setViewportSize({ width: 1440, height: 900 });

  await visitAll("[preseason]");

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

  // ---- Play the regular season ---------------------------------------------
  let weeks = 0;
  for (let i = 0; i < 25; i++) {
    const btn = page.getByRole("button", { name: /^(Play Week|Advance Week)/ });
    if (!(await btn.count())) break;
    await btn.click();
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

  // ---- A box score ----------------------------------------------------------
  await page.goto(BASE + "/schedule", { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  const gameLink = page.locator('a[href^="/game/"]').first();
  if (await gameLink.count()) {
    await gameLink.click();
    await page.waitForTimeout(700);
    await checkPage("[box score] /game/[id]");
    const txt = await page.evaluate(() => document.body.innerText);
    if (!/Scoring|Passing|Rushing/i.test(txt)) fail("box score has no stat sections");
    else console.log("  ok    box score renders");
  } else {
    fail("no game links found on the schedule");
  }

  // ---- A player page --------------------------------------------------------
  await page.goto(BASE + "/roster", { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
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
  for (let i = 0; i < 8; i++) {
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    const btn = page
      .getByRole("button", { name: /Continue to|Finish the Draft|Start the Season|Roster Cutdown|Continue$/i })
      .first();
    if (!(await btn.count())) break;
    await btn.click();
    await page.waitForTimeout(250);
    const confirm = page.getByRole("button", { name: /^Confirm$/ });
    if (await confirm.count()) await confirm.click();
    await page.waitForTimeout(2500);
    await checkPage(`[offseason step ${i + 1}] /`);
    steps++;
    await visitAll(`[offseason ${i + 1}]`);
    const body = await page.evaluate(() => document.body.innerText);
    if (/Preseason/i.test(body) && i >= 2) break;
  }
  console.log(`  ok    completed ${steps} offseason steps`);
  if (steps < 4) fail(`only ${steps} offseason steps — expected 4`);

  // ---- Season 2 started? ----------------------------------------------------
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const body = await page.evaluate(() => document.body.innerText);
  if (!/Preseason/i.test(body)) fail("did not roll into the next preseason");
  else console.log("  ok    rolled into the next season");

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
