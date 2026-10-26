// Screenshots of the demo: mobile (iPhone 13: 390x844 @3x -> saved at 2x) and desktop (1440x900).
// Usage: node scripts/shots.mjs http://localhost:3100 shots     (run from web/ so `playwright` resolves)
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:3100";
const out = process.argv[3] ?? "../shots";
const b = await chromium.launch();
const click = async (p, name) => { await p.getByRole("button", { name }).first().click(); await p.waitForTimeout(250); };
for (const [tag, vp, dpr, mobile] of [["mobile", { width: 390, height: 844 }, 2, true], ["desktop", { width: 1440, height: 900 }, 1, false]]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  const p = await ctx.newPage();
  const shot = (n, full = true) => p.screenshot({ path: `${out}/${tag}-${n}.png`, fullPage: full });

  await p.goto(base + "/", { waitUntil: "networkidle" });
  await shot("01-landing", false);
  await shot("01-landing-full");

  // wizard
  await p.goto(base + "/setup", { waitUntil: "networkidle" });
  await shot("02-setup-guardians", false);
  await click(p, "Next");
  await shot("03-setup-beneficiary", false);
  await click(p, "Next");
  await shot("04-setup-timing", false);
  await click(p, "Next");
  await shot("05-setup-review", false);
  await click(p, "Start simulation");
  await p.waitForURL("**/dashboard");
  await p.waitForSelector("[data-testid=countdown]");

  // demo story
  await shot("06-dashboard-active", false);
  await click(p, "goes silent");           // → overdue / grace
  await shot("07-dashboard-grace", false);
  await click(p, "Grace period runs out");  // → guardians alerted + vote open
  await shot("08-dashboard-voting-open", false);
  await click(p, "Guardians vote");         // → challenge window
  await shot("09-dashboard-challenge", false);
  await shot("09-dashboard-challenge-full");
  await click(p, "returns & cancels");     // owner comes back
  await shot("10-dashboard-cancelled", false);
  // second run to final release
  await click(p, "+30 d"); await click(p, "+30 d");
  await click(p, "Guardians vote");
  await click(p, "Let the window run out");
  await shot("11-dashboard-executable", false);
  await click(p, "Execute release");
  await shot("12-dashboard-released", false);
  await shot("12-dashboard-released-full");
  await ctx.close();
}
await b.close();
