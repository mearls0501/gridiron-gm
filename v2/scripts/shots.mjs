import { chromium } from "playwright";
const BASE = "http://127.0.0.1:3000";
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", e => errs.push(e.message));
page.on("console", m => { if (m.type()==="error" && !/favicon/.test(m.text())) errs.push(m.text()); });

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.getByRole("button", { name: /Start Franchise/i }).click();
await page.waitForTimeout(3000);
await page.screenshot({ path: "/tmp/s1-hub-preseason.png" });

// start season + play 10 weeks
await page.getByRole("button", { name: /Start the Season/i }).click();
await page.waitForTimeout(200);
const c = page.getByRole("button", { name: /^Confirm$/ }); if (await c.count()) await c.click();
await page.waitForTimeout(3500);
for (let i=0;i<10;i++){
  const b = page.getByRole("button", { name: /^(Play Week|Advance Week)/ });
  if (!(await b.count())) break;
  await b.click(); await page.waitForTimeout(800);
}
await page.screenshot({ path: "/tmp/s2-hub-midseason.png" });

for (const [r,n] of [["/roster","s3-roster"],["/depth-chart","s4-depth"],["/standings","s5-standings"],["/stats","s6-stats"],["/finances","s7-finances"],["/schedule","s8-schedule"],["/free-agency","s9-fa"],["/draft","s10-draft"],["/league","s11-league"]]) {
  await page.goto(BASE+r,{waitUntil:"networkidle"}); await page.waitForTimeout(500);
  await page.screenshot({ path: `/tmp/${n}.png` });
}
await page.goto(BASE+"/schedule",{waitUntil:"networkidle"}); await page.waitForTimeout(400);
const gl = page.locator('a[href^="/game/"]').first();
if (await gl.count()) { await gl.click(); await page.waitForTimeout(800); await page.screenshot({ path: "/tmp/s12-box.png", fullPage:false }); }
await page.goto(BASE+"/roster",{waitUntil:"networkidle"}); await page.waitForTimeout(400);
const pl = page.locator('a[href^="/player/"]').first();
if (await pl.count()) { await pl.click(); await page.waitForTimeout(800); await page.screenshot({ path: "/tmp/s13-player.png" }); }
console.log("errors:", errs.length, errs.slice(0,5));
await browser.close();
