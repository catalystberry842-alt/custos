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
  const shot = async (n, full = true) => { if (!full) await p.evaluate(() => window.scrollTo(0, 0)); return p.screenshot({ path: `${out}/${tag}-${n}.png`, fullPage: full }); };

  await p.goto(base + "/", { waitUntil: "networkidle" });
  await p.waitForTimeout(8200); // let the hero loop reach the freeze/vote moment
  await shot("01-landing", false);
  await shot("01-landing-full");

  // wizard
  await p.goto(base + "/setup", { waitUntil: "networkidle" });
  await shot("02-setup-agent", false);
  await shot("02-setup-agent-full");
  await click(p, "Next");
  await shot("03-setup-guardians", false);
  await click(p, "Next");
  await shot("04-setup-beneficiary", false);
  await click(p, "Next");
  await shot("05-setup-timing", false);
  await click(p, "Next");
  await shot("06-setup-review", false);
  await click(p, "Start simulation");
  await p.waitForURL("**/dashboard");
  await p.waitForSelector("[data-testid=countdown]");

  // story A: owner silent → agent frozen → guardians vote → handover to the successor
  await shot("07-dashboard-active", false);
  await click(p, "works for a day");          // agent pays, gets blocked, owner is told
  await shot("08-dashboard-agent-activity", false);
  await shot("08-dashboard-agent-activity-full");
  await click(p, "goes silent");              // → overdue / grace (agent still inside allowance)
  await shot("09-dashboard-grace", false);
  await click(p, "Grace period runs out");    // → agent FROZEN, guardians alerted
  await shot("10-dashboard-agent-frozen", false);
  await shot("10-dashboard-agent-frozen-full");
  await click(p, /^Guardians hand over/);     // → challenge window
  await shot("11-dashboard-challenge", false);
  await click(p, "Let the window run out");
  await click(p, "Execute handover");
  await shot("12-dashboard-handed-over", false);
  await shot("12-dashboard-handed-over-full");

  // story B: owner silent → agent frozen → owner returns and unfreezes
  await click(p, "Reset");
  await click(p, "works for a day");
  await click(p, "goes silent");
  await click(p, "Grace period runs out");
  await click(p, "returns & unfreezes");
  await p.evaluate(() => window.scrollTo(0, 0));
  await shot("13-dashboard-owner-returned", false);

  // optional Real chain panel (Robinhood Chain testnet default; mainnet shows a real-funds warning)
  await p.getByText("Real chain · optional").click();
  await p.waitForSelector("[aria-label=Network]");
  await p.locator("[aria-label=Network]").scrollIntoViewIfNeeded();
  await shot("14-realchain-testnet", false);
  await p.getByRole("radio", { name: /Mainnet/ }).click();
  await p.waitForTimeout(200);
  await shot("15-realchain-mainnet-warning", false);
  await ctx.close();
}
await b.close();
