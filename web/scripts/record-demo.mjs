// Records a ~40 s screen video (1280x720) of the real landing demo + live page against PRODUCTION. Not posted anywhere.
// Usage (from web/): node scripts/record-demo.mjs https://custos-peach.vercel.app ../demo
import { chromium } from "playwright";
import { mkdirSync, readdirSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";
const base = process.argv[2] ?? "https://custos-peach.vercel.app";
const out = process.argv[3] ?? "../demo";
mkdirSync(out, { recursive: true });
const tmp = `${out}/.raw`; mkdirSync(tmp, { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: tmp, size: { width: 1280, height: 720 } } });
await ctx.addInitScript(() => { try { localStorage.setItem("custos-theme", "light"); } catch {} });
const p = await ctx.newPage();
const smooth = async (y, ms = 2500) => { await p.evaluate(([y, ms]) => new Promise((res) => { const s = scrollY, t0 = performance.now(); const f = (t) => { const k = Math.min(1, (t - t0) / ms); scrollTo(0, s + (y - s) * (k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2)); k < 1 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); }), [y, ms]); };
await p.goto(base + "/", { waitUntil: "networkidle" });
await p.waitForTimeout(3500);                                   // read the pitch
await p.getByRole("button", { name: /Pay Acme/ }).click();      // real payment
await p.waitForSelector(".hd-out.approve a, .hd-out.block", { timeout: 90000 });
await p.waitForTimeout(4500);
await p.getByRole("button", { name: /Try to drain/ }).click();
await p.waitForSelector(".hd-out.block", { timeout: 60000 });
await p.waitForTimeout(4000);
await p.getByRole("button", { name: /Unlimited approval/ }).click();
await p.waitForSelector(".hd-out.block", { timeout: 60000 });
await p.waitForTimeout(3500);
const y = (sel) => p.evaluate((s) => document.querySelector(s).getBoundingClientRect().top + scrollY - 80, sel);
await smooth(await y("#difference"), 2200); await p.waitForTimeout(3500);
await smooth(await y("#contracts"), 2500); await p.waitForTimeout(3000);
await p.getByRole("link", { name: "Live app" }).first().click();
await p.waitForSelector(".lv-feed li", { timeout: 60000 });
await p.waitForTimeout(3500);
await smooth(500, 2200); await p.waitForTimeout(3000);
await ctx.close(); await b.close();
const raw = readdirSync(tmp).find((f) => f.endsWith(".webm"));
renameSync(`${tmp}/${raw}`, `${out}/custos-demo.webm`);
execFileSync("ffmpeg", ["-y", "-i", `${out}/custos-demo.webm`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", "-movflags", "+faststart", "-an", `${out}/custos-demo.mp4`], { stdio: "ignore" });
console.log(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=width,height", "-of", "default=nw=1", `${out}/custos-demo.mp4`]).toString());
