// Real end-to-end run of /live against Robinhood Chain TESTNET with a scripted injected wallet.
// The wallet is a Node-side signer behind window.ethereum (EIP-1193). Keys come from env, never printed.
// Usage (from web/): OWNER_KEY=0x.. TESTER_KEY=0x.. node scripts/e2e-live.mjs http://localhost:3100 ../shots/live
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { createWalletClient, createPublicClient, http, hexToString, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const base = process.argv[2] ?? "http://localhost:3100";
const out = process.argv[3] ?? "../shots/live";
mkdirSync(out, { recursive: true });
const chain = defineChain({ id: 46630, name: "Robinhood Chain Testnet", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } } });
const pub = createPublicClient({ chain, transport: http() });
const txs = [];
const overflow = [];

async function attach(ctx, key, label) {
  const account = privateKeyToAccount(key);
  const wc = createWalletClient({ account, chain, transport: http() });
  await ctx.exposeFunction("__req", async (method, params) => {
    switch (method) {
      case "eth_requestAccounts": case "eth_accounts": return [account.address];
      case "eth_chainId": return "0xb626";
      case "wallet_switchEthereumChain": return null;
      case "eth_sendTransaction": {
        const t = params[0];
        const hash = await wc.sendTransaction({ to: t.to, data: t.data, value: t.value ? BigInt(t.value) : undefined });
        await pub.waitForTransactionReceipt({ hash });
        txs.push({ by: label, method, to: t.to, hash });
        return hash;
      }
      case "personal_sign": return await account.signMessage({ message: hexToString(params[0]) });
      default: return await pub.request({ method, params });
    }
  });
  await ctx.addInitScript(() => { window.ethereum = { request: ({ method, params }) => window.__req(method, params), on() {} }; });
  return account.address;
}
const shot = async (p, name, full = false) => { await p.screenshot({ path: `${out}/${name}.png`, fullPage: full }); };
const chk = async (p, tag) => { if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) overflow.push(tag); };
const runPreset = async (p, title) => {
  const n = await p.locator(".lv-run").count();
  await p.locator(".lv-pre", { hasText: title }).first().getByRole("button", { name: "Run" }).click();
  await p.waitForFunction((k) => document.querySelectorAll(".lv-run").length > k, n, { timeout: 90000 });
  await p.waitForFunction(() => ![...document.querySelectorAll(".lv-pre button")].some((b) => b.textContent === "Checking…"), null, { timeout: 90000 });
};
const confirmed = async (p) => { await p.waitForSelector(".fw-ok:has-text('confirmed')", { timeout: 90000 }); await p.waitForTimeout(600); };

const b = await chromium.launch();
const mk = async (vp, mobile, theme) => {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  await ctx.addInitScript((t) => { try { localStorage.setItem("custos-theme", t); } catch {} }, theme);
  return ctx;
};
const D = { width: 1440, height: 900 }, M = { width: 390, height: 844 };

const REAL = !process.env.SHOTS_ONLY;
/* ── 1. desktop, light: the vault OWNER (demo vault), real transactions ── */
if (REAL) {
  const ctx = await mk(D, false, "light");
  await attach(ctx, process.env.OWNER_KEY, "owner");
  const p = await ctx.newPage();
  await p.goto(base + "/live", { waitUntil: "networkidle" });
  await p.waitForSelector(".lv-feed li", { timeout: 60000 });
  await shot(p, "light-desktop-01-live-readonly"); await chk(p, "desktop live");
  await p.getByRole("button", { name: "Connect wallet" }).click();
  await p.waitForSelector(".pill:has-text('owner')");
  await runPreset(p, "Pay Acme 0.0002 ETH");
  await p.locator(".lv-run.approve a").first().waitFor({ timeout: 30000 });
  txs.push({ by: "agent (firewall approved)", method: "agentSpend 0.0002 ETH → Acme", hash: await p.locator(".lv-run.approve a").first().getAttribute("href").then((h) => h.split("/tx/")[1]) });
  for (const t of ["Pay Acme 0.002 ETH", "Prompt injection", "Unlimited token approval", "Replay the last payment"]) await runPreset(p, t);
  await runPreset(p, "Pay Landlord 0.0004 ETH");
  await p.waitForSelector(".lv-run.pending");
  await shot(p, "light-desktop-02-decisions");
  await p.getByRole("button", { name: "Approve with wallet" }).click();
  await p.waitForSelector(".lv-run.approve:has-text('Pay Landlord') a", { timeout: 90000 });
  const href = await p.locator(".lv-run.approve:has-text('Pay Landlord') a").first().getAttribute("href");
  txs.push({ by: "agent (owner-approved)", method: "agentSpend 0.0004 ETH → Landlord", hash: href.split("/tx/")[1] });
  await p.getByRole("button", { name: "Verify trail" }).click();
  await p.waitForSelector(".fw-ok:has-text('signed by the agent key')");
  await shot(p, "light-desktop-03-approved-verified");
  await p.getByRole("button", { name: "Kill switch" }).click(); await confirmed(p);
  await runPreset(p, "Pay Acme 0.0002 ETH");
  await shot(p, "light-desktop-04-frozen-blocked");
  await p.getByRole("button", { name: "Unfreeze agent" }).click(); await confirmed(p);
  await p.getByRole("button", { name: "Check in" }).click(); await confirmed(p);
  await shot(p, "light-desktop-05-activity"); await shot(p, "light-desktop-06-full", true); await chk(p, "desktop owner");
  await ctx.close();
}

/* ── 2. desktop, light: a fresh wallet creates its OWN vault (7 real txs) and pays through the firewall ── */
if (REAL) {
  const ctx = await mk(D, false, "light");
  await attach(ctx, process.env.TESTER_KEY, "tester");
  const p = await ctx.newPage();
  await p.goto(base + "/live", { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Connect wallet" }).click();
  await p.waitForSelector(".pill:has-text('0x00B1')");
  await p.getByRole("button", { name: "Create my vault" }).click();
  await p.locator("input[inputmode=decimal]").first().fill("0.0008");
  await shot(p, "light-desktop-07-create");
  await p.getByRole("button", { name: "Create and configure" }).click();
  await p.waitForSelector(".fw-ok:has-text('is live and configured')", { timeout: 240000 });
  await p.waitForSelector(".lv-feed li", { timeout: 60000 });
  await p.waitForTimeout(1000);
  await shot(p, "light-desktop-08-my-vault");
  await runPreset(p, "Pay Acme 0.0002 ETH");
  const href = await p.locator(".lv-run.approve a").first().getAttribute("href");
  txs.push({ by: "agent (firewall approved, tester vault)", method: "agentSpend 0.0002 ETH → Acme", hash: href.split("/tx/")[1] });
  await shot(p, "light-desktop-09-my-vault-paid"); await chk(p, "desktop tester");
  txs.push({ note: "tester vault", url: p.url(), vault: await p.locator(".lv-kv ~ .row a").first().getAttribute("href") });
  await ctx.close();
}

/* ── 3. mobile + dark: read-only and blocked decisions (no new on-chain txs) ── */
for (const [theme, vp, mobile, tag] of [["light", D, false, "desktop"], ["light", M, true, "mobile"], ["dark", M, true, "mobile"], ["dark", D, false, "desktop"]]) {
  const ctx = await mk(vp, mobile, theme);
  await attach(ctx, process.env.OWNER_KEY, "owner");
  const p = await ctx.newPage();
  await p.goto(base + "/live", { waitUntil: "networkidle" });
  await p.waitForSelector(".lv-feed li", { timeout: 60000 });
  await shot(p, `${theme}-${tag}-10-top`); await chk(p, `${theme} ${tag} top`);
  await p.getByRole("button", { name: "Connect wallet" }).click();
  await p.waitForSelector(".pill:has-text('owner')");
  for (const t of ["Pay Acme 0.002 ETH", "Prompt injection"]) await runPreset(p, t);
  await runPreset(p, "Pay Landlord 0.0004 ETH");
  await p.locator(".lv-run").first().scrollIntoViewIfNeeded();
  await shot(p, `${theme}-${tag}-11-decisions`);
  await shot(p, `${theme}-${tag}-12-full`, true); await chk(p, `${theme} ${tag} full`);
  await p.goto(base + "/firewall", { waitUntil: "networkidle" });
  await shot(p, `${theme}-${tag}-13-firewall-sim`); await chk(p, `${theme} ${tag} firewall`);
  await ctx.close();
}
await b.close();
if (REAL) writeFileSync("/tmp/e2e-txs.json", JSON.stringify(txs, null, 2));
console.log(JSON.stringify(txs, null, 1));
console.log(overflow.length ? "OVERFLOW: " + overflow.join(", ") : "no horizontal overflow");
