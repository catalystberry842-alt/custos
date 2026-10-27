// Landing demo states against production: approved real payment, blocked drain, blocked unlimited approval.
// Usage (from web/): node scripts/shots-home-demo.mjs https://custos-peach.vercel.app ../shots/site
import { chromium } from "playwright";
const base = process.argv[2] ?? "https://custos-peach.vercel.app";
const out = process.argv[3] ?? "../shots/site";
const b = await chromium.launch();
const bad = [];
for (const theme of ["light", "dark"]) for (const [tag, vp, dpr, mobile] of [["mobile", { width: 390, height: 844 }, 2, true], ["desktop", { width: 1440, height: 900 }, 1, false]]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  await ctx.addInitScript((t) => { try { localStorage.setItem("custos-theme", t); } catch {} }, theme);
  const p = await ctx.newPage();
  await p.goto(base + "/", { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${out}/${theme}-${tag}-home-demo-0-idle.png` });
  for (const [k, re, sel] of [["1-paid", /Pay Acme/, ".hd-out.approve"], ["2-drain-blocked", /Try to drain/, ".hd-out.block"], ["3-approval-blocked", /Unlimited approval/, ".hd-out.block"]]) {
    await p.getByRole("button", { name: re }).click();
    await p.waitForSelector(sel, { timeout: 90000 });
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${out}/${theme}-${tag}-home-demo-${k}.png` });
  }
  if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) bad.push(`${theme}-${tag}`);
  await ctx.close();
}
await b.close();
console.log(bad.length ? "OVERFLOW " + bad : "no overflow");
