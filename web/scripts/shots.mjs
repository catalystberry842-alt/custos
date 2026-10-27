// Screenshots of the demo: mobile (iPhone 13: 390x844 @3x -> saved at 2x) and desktop (1440x900).
// Usage: node scripts/shots.mjs http://localhost:3100 shots     (run from web/ so `playwright` resolves)
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:3100";
const out = process.argv[3] ?? "../shots";
const b = await chromium.launch();
const click = async (p, name) => { await p.getByRole("button", { name }).first().click(); await p.waitForTimeout(250); };
const THEMES = (process.argv[4] ?? "light,dark").split(",");
const overflow = [];
for (const theme of THEMES) for (const [vtag, vp, dpr, mobile] of [["mobile", { width: 390, height: 844 }, 2, true], ["desktop", { width: 1440, height: 900 }, 1, false]]) {
  const tag = `${theme}-${vtag}`;
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  await ctx.addInitScript((t) => { try { localStorage.setItem("custos-theme", t); } catch {} }, theme);
  const p = await ctx.newPage();
  const chk = async (n) => { if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) overflow.push(`${tag} ${n}`); };
  const shot = async (n, full = true) => { if (!full) await p.evaluate(() => window.scrollTo(0, 0)); return p.screenshot({ path: `${out}/${tag}-${n}.png`, fullPage: full }); };

  await p.goto(base + "/", { waitUntil: "networkidle" });
  await chk("landing");
  await shot("01-landing", false);
  await p.waitForTimeout(9000); // hero loop: ring frozen
  await p.locator(".hero-stage").screenshot({ path: `${out}/${tag}-01b-hero-frozen.png` });
  await p.waitForTimeout(7800); // hero loop: handed over to Tunde
  await p.locator(".hero-stage").screenshot({ path: `${out}/${tag}-01c-hero-handover.png` });
  await shot("01-landing-full");

  // wizard
  await p.goto(base + "/setup", { waitUntil: "networkidle" });
  await chk("setup");
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
  await chk("dashboard");
  await shot("07-dashboard-active", false);
  await click(p, "works for a day");          // agent pays, gets blocked, owner is told
  await shot("08-dashboard-agent-activity", false);
  await shot("08-dashboard-agent-activity-full");
  await click(p, "goes silent");              // → overdue / grace (agent still inside allowance)
  await shot("09-dashboard-grace", false);
  await click(p, "Grace period runs out");    // → agent FROZEN, guardians alerted
  await chk("dashboard-frozen");
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

  // Agent Firewall: attack tests, pending queue, audit viewer
  await p.goto(base + "/firewall", { waitUntil: "networkidle" });
  await chk("firewall");
  await shot("16-firewall-empty", false);
  await click(p, "Run all");
  await p.waitForSelector(".fw-item");
  await p.waitForTimeout(300);
  await chk("firewall-ran");
  await shot("17-firewall-after-attacks", false);
  await shot("17-firewall-after-attacks-full");
  await click(p, "Verify chain");
  await click(p, "Try tampering");
  await p.locator("#fw-aud").scrollIntoViewIfNeeded();
  await p.locator(".fw-e").screenshot({ path: `${out}/${tag}-18-firewall-audit-tamper.png` });
  await p.locator(".fw-d").screenshot({ path: `${out}/${tag}-19-firewall-policy.png` });
  await chk("firewall-audit");
  await p.goto(base + "/#firewall", { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  await p.locator("#firewall").screenshot({ path: `${out}/${tag}-20-landing-firewall.png` });

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
console.log(overflow.length ? "OVERFLOW: " + overflow.join(", ") : "no horizontal overflow on any page/viewport/theme");
