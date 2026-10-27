// Screenshots of every page. Usage (from web/): node scripts/shots-pages.mjs http://localhost:3100 ../shots/site [themes]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://localhost:3100";
const out = process.argv[3] ?? "../shots/site";
const THEMES = (process.argv[4] ?? "light,dark").split(",");
mkdirSync(out, { recursive: true });
const PAGES = [["home", "/"], ["live", "/live"], ["firewall", "/firewall"], ["dashboard", "/dashboard"], ["setup", "/setup"]];
const b = await chromium.launch();
const bad = [];
for (const theme of THEMES) for (const [vtag, vp, dpr, mobile] of [["mobile", { width: 390, height: 844 }, 2, true], ["desktop", { width: 1440, height: 900 }, 1, false]]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  await ctx.addInitScript((t) => { try { localStorage.setItem("custos-theme", t); } catch {} }, theme);
  const p = await ctx.newPage();
  for (const [name, path] of PAGES) {
    await p.goto(base + path, { waitUntil: "networkidle" });
    await p.waitForTimeout(name === "live" ? 2500 : 600);
    if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) bad.push(`${theme}-${vtag} ${name}`);
    await p.screenshot({ path: `${out}/${theme}-${vtag}-${name}-top.png` });
    await p.screenshot({ path: `${out}/${theme}-${vtag}-${name}-full.png`, fullPage: true });
  }
  await ctx.close();
}
await b.close();
console.log(bad.length ? "OVERFLOW: " + bad.join(", ") : "no horizontal overflow");
