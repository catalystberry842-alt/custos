#!/usr/bin/env node
/**
 * heirloom-agent CLI
 *   demo [--scenario silent|return|late] [--claude]   simulated story with a fake clock; no network
 *   serve [config.json]                               real clock; Telegram if TELEGRAM_BOT_TOKEN, else console
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { Agent } from "./agent.js";
import { ConsoleChannel, TelegramChannel, MockChannel, type Channel } from "./channels.js";
import { SimChain, ViemChainReader, type ChainReader } from "./chain.js";
import { DAY, HOUR, newSnapshot, status } from "./chainModel.js";
import { createCheckInServer } from "./server.js";
import { JsonFileStore, MemoryStore } from "./store.js";
import type { SwitchProfile } from "./types.js";
import { RulesWording, wordingFromEnv } from "./wording.js";

const args = process.argv.slice(2);
const cmd = args[0] ?? "demo";
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

function demoProfile(): SwitchProfile {
  const c = (id: string, name: string) => ({ id, name, endpoints: [{ channel: "mock", address: id }, { channel: "mock", address: id + "-email" }] });
  return { id: "demo-ada", owner: c("ada", "Ada"), beneficiary: c("emeka", "Emeka"), guardians: [c("bola", "Bola"), c("chidi", "Chidi"), c("dayo", "Dayo")] };
}

async function demo() {
  const scenario = flag("--scenario") ?? "silent";
  let clock = Date.UTC(2026, 10, 1, 9, 0);
  const t0 = clock;
  const when = () => { const m = clock - t0; return `Day ${String(Math.floor(m / DAY)).padStart(2, "0")} ${String(Math.floor((m % DAY) / HOUR)).padStart(2, "0")}:00`; };
  const profile = demoProfile();
  const chain = new SimChain();
  chain.add(profile.id, newSnapshot(clock, { guardianCount: 3, threshold: 2 }));
  const mock = new MockChannel("mock");
  const wording = args.includes("--claude") ? wordingFromEnv() : new RulesWording();
  const printer: Channel = {
    name: "mock",
    async send(to, msg) {
      await mock.send(to, msg);
    },
  };
  const approvals: { at: number; g: string }[] = [];
  const agent = new Agent({
    profiles: [profile], chain, channels: { mock: printer }, store: new MemoryStore(), wording,
    baseUrl: "https://checkin.heirloom.example", appUrl: "https://app.heirloom.example",
    linkSecret: "demo-secret-demo-secret", now: () => clock,
    onDelivery: (d) => {
      if (!d.address.endsWith("-email")) {
        const head = `[${when()}] → ${d.contactName} via ${d.channel}:${d.address}  <${d.audience}/${d.stage}> (${d.source})${d.urgent ? " URGENT" : ""}`;
        console.log(head);
        if (d.audience !== "guardians" || d.contactName === "Bola") console.log(d.text.split("\n").map((l) => "    " + l).join("\n") + "\n");
        else console.log("    (same message to this guardian)\n");
      }
      if (d.stage === "guardian_vote_open" && d.address === d.contactId) {
        const delay = d.contactId === "bola" ? 6 * HOUR : d.contactId === "chidi" ? 20 * HOUR : null;
        if (delay) approvals.push({ at: clock + delay, g: d.contactId });
      }
    },
  });
  console.log(`\n=== Heirloom agent demo (SIMULATED clock, mock channels, scenario=${scenario}, wording=${wording.name}) ===\n`);
  const end = t0 + 60 * DAY;
  let returned = false, lateDone = false, executed = false;
  while (clock <= end) {
    await agent.tick();
    const snap = await chain.read(profile.id);
    for (const a of approvals.filter((x) => x.at <= clock)) {
      approvals.splice(approvals.indexOf(a), 1);
      try {
        const r = chain.approve(profile.id, a.g, clock);
        console.log(`[${when()}] ⛓  guardian ${a.g} approves release${r.challengeStarted ? " → challenge window starts" : ""}\n`);
      } catch { /* ignore */ }
    }
    const st = status(snap, clock);
    if (scenario === "late" && !lateDone && st === "grace" && clock - snap.lastCheckIn > snap.intervalMs + 2 * DAY) {
      lateDone = true;
      console.log(`[${when()}] ✋ Ada replies "/checkin" to the bot`);
      console.log("    bot: " + (await agent.handleInbound("mock", "ada", "/checkin")) + "\n");
    }
    if (scenario === "return" && !returned && st === "challenge" && snap.challengeEnd! - clock <= 36 * HOUR) {
      returned = true;
      console.log(`[${when()}] ✋ Ada comes back and replies "I'm here"`);
      console.log("    bot: " + (await agent.handleInbound("mock", "ada", "I'm here")) + "\n");
      console.log(`    status check by Bola → ${await agent.handleInbound("mock", "bola", "/status")}\n`);
    }
    if (st === "executable" && !executed) {
      executed = true;
      chain.execute(profile.id, clock);
      console.log(`[${when()}] ⛓  anyone executes the release → funds go to ${profile.beneficiary.name}\n`);
    }
    if (st === "released" && (await agent.tick()) === 0) break;
    clock += 3 * HOUR;
  }
  const ok = mock.sent.length;
  console.log(`=== done: ${ok} messages delivered across mock channels; final status: ${status(await chain.read(profile.id), clock)} ===`);
}

async function serve() {
  const cfgPath = args[1] ?? process.env.HEIRLOOM_CONFIG ?? new URL("../examples/config.sample.json", import.meta.url).pathname;
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  const now = Date.now();
  let chain: ChainReader;
  if (cfg.mode === "chain") {
    if (!process.env.HEIRLOOM_RPC_URL) throw new Error("mode=chain needs HEIRLOOM_RPC_URL");
    chain = new ViemChainReader(process.env.HEIRLOOM_RPC_URL);
  } else {
    const sim = new SimChain();
    for (const p of cfg.profiles as SwitchProfile[]) {
      sim.add(p.id, newSnapshot(now, {
        intervalMs: (cfg.sim?.intervalDays ?? 30) * DAY, graceMs: (cfg.sim?.graceDays ?? 7) * DAY,
        challengeMs: (cfg.sim?.challengeDays ?? 3) * DAY, threshold: cfg.sim?.threshold ?? 2, guardianCount: p.guardians.length,
      }));
    }
    chain = sim;
  }
  const channels: Record<string, Channel> = { console: new ConsoleChannel(), mock: new MockChannel() };
  let tg: TelegramChannel | undefined;
  if (process.env.TELEGRAM_BOT_TOKEN) { tg = new TelegramChannel(process.env.TELEGRAM_BOT_TOKEN); channels.telegram = tg; }
  const secret = process.env.HEIRLOOM_LINK_SECRET ?? randomBytes(24).toString("hex");
  if (!process.env.HEIRLOOM_LINK_SECRET) console.warn("HEIRLOOM_LINK_SECRET not set: using a random per-run secret (old links die on restart).");
  const agent = new Agent({
    profiles: cfg.profiles, chain, channels,
    store: process.env.HEIRLOOM_STATE ? new JsonFileStore(process.env.HEIRLOOM_STATE) : new MemoryStore(),
    wording: wordingFromEnv(), baseUrl: cfg.baseUrl, appUrl: cfg.appUrl, linkSecret: secret,
  });
  const server = createCheckInServer(agent);
  server.listen(cfg.port ?? 8787, () => console.log(`check-in server on :${cfg.port ?? 8787} (mode=${cfg.mode}, telegram=${!!tg}, claude=${!!process.env.ANTHROPIC_API_KEY})`));
  const loop = async () => { try { await agent.tick(); } catch (e) { console.error("tick failed", e); } };
  await loop();
  setInterval(loop, (cfg.tickSeconds ?? 60) * 1000);
  if (tg) {
    let offset = 0;
    for (;;) {
      try {
        offset = await tg.poll(offset, async (chat, text) => {
          const reply = await agent.handleInbound("telegram", chat, text);
          await tg!.send({ channel: "telegram", address: chat }, { text: reply, urgent: false });
        });
      } catch (e) { console.error("telegram poll", (e as Error).message); await new Promise((r) => setTimeout(r, 5000)); }
    }
  }
}

if (cmd === "demo") await demo();
else if (cmd === "serve") await serve();
else { console.error("usage: demo [--scenario silent|return|late] | serve [config.json]"); process.exit(2); }
