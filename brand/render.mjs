// node brand/render.mjs   (needs web/node_modules)
import { chromium } from "../web/node_modules/playwright/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";
const dir = new URL(".", import.meta.url).pathname;
const b = await chromium.launch();
const jobs = [
  ["icon.svg", "icon-512.png", 512, 512, null], ["icon.svg", "icon-180.png", 180, 180, null], ["icon.svg", "icon-1024.png", 1024, 1024, null],
  ["favicon.svg", "favicon-32.png", 32, 32, null], ["favicon.svg", "favicon-16.png", 16, 16, null],
  ["logo-mark.svg", "logo-mark.png", 512, 512, null],
  ["wordmark-dark.svg", "wordmark-dark.png", 1200, 360, "#070A12"], ["wordmark-light.svg", "wordmark-light.png", 1200, 360, "#F4F6FA"],
];
for (const [src, out, w, h, bg] of jobs) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const svg = readFileSync(dir + src, "utf8").replace(/width="\d+" height="\d+"/, 'width="100%" height="100%"');
  await p.setContent(`<body style="margin:0;background:${bg ?? "transparent"};display:grid;place-items:center;width:${w}px;height:${h}px">${svg}</body>`);
  await p.screenshot({ path: dir + out, omitBackground: bg === null });
  await p.close();
}
await b.close();
