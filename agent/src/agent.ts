import { createHmac, timingSafeEqual } from "node:crypto";
import { DAY, agentAllowance, agentState, expiry, graceEnd, humanDuration, status as chainStatus, type Snapshot } from "./chainModel.js";
import { Dispatcher, type Channel, type Delivery } from "./channels.js";
import { isSimWritable, type ChainReader } from "./chain.js";
import { actionKey, buildFacts, decide, effectiveProfile, fmtAmount, fmtDate, periodWord } from "./engine.js";
import type { ManagedAgentAdapter } from "./managed.js";
import { BRAND } from "./brand.js";
import { nextSteps } from "./explain.js";
import type { SentStore } from "./store.js";
import type { Action, Audience, Contact, OutMessage, Stage, SwitchProfile } from "./types.js";
import type { Wording } from "./wording.js";
import { RulesWording } from "./wording.js";

export interface AgentDeps {
  profiles: SwitchProfile[];
  chain: ChainReader;
  channels: Record<string, Channel>;
  store: SentStore;
  wording?: Wording;
  /** Optional: where the managed AI agent's activity comes from (mock adapter in demos). */
  managed?: ManagedAgentAdapter;
  /** Pinned origin of the check-in page this agent serves (links are ONLY ever built from this). */
  baseUrl: string;
  /** Optional app URL for guardians / on-chain check-in (real-chain mode). */
  appUrl?: string;
  /** HMAC secret for check-in links. Required; generate randomly per deployment. */
  linkSecret: string;
  now?: () => number;
  /** called for every delivery attempt */
  onDelivery?: (d: Delivery & { stage: Stage; audience: Audience; source: string }) => void;
}

const ESCALATED: Stage[] = ["overdue", "final_warning", "challenge_started", "executable"];

export class Agent {
  readonly log: (Delivery & { stage: Stage; audience: Audience; source: string })[] = [];
  private wording: Wording;
  private now: () => number;
  private dispatcher: Dispatcher;
  private pendingMeta: { stage: Stage; audience: Audience; source: string } = { stage: "nudge", audience: "owner", source: "rules" };

  constructor(private d: AgentDeps) {
    if (!d.linkSecret || d.linkSecret.length < 16) throw new Error("linkSecret must be ≥16 chars");
    this.wording = d.wording ?? new RulesWording();
    this.now = d.now ?? Date.now;
    this.dispatcher = new Dispatcher(d.channels, this.now, (x) => {
      const rec = { ...x, ...this.pendingMeta };
      this.log.push(rec);
      d.onDelivery?.(rec);
    });
  }

  // ───────────────────────── links ─────────────────────────

  private sig(id: string, epoch: number): string {
    return createHmac("sha256", this.d.linkSecret).update(`${id}:${epoch}`).digest("base64url").slice(0, 22);
  }

  tokenFor(id: string, epoch: number): string {
    return `${id}.${this.sig(id, epoch)}`;
  }

  /** Verifies a link token against the CURRENT epoch (links die once the owner checks in). */
  async verifyToken(token: string): Promise<{ profile: SwitchProfile; snap: Snapshot } | null> {
    const i = token.lastIndexOf(".");
    if (i < 1) return null;
    const id = token.slice(0, i);
    const profile = this.d.profiles.find((p) => p.id === id);
    if (!profile) return null;
    const snap = await this.d.chain.read(profile.vault ?? profile.id);
    const want = Buffer.from(this.sig(id, snap.epoch));
    const got = Buffer.from(token.slice(i + 1));
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    return { profile, snap };
  }

  private ownerLink(p: SwitchProfile, s: Snapshot): string {
    if (isSimWritable(this.d.chain)) return `${this.d.baseUrl}/c/${this.tokenFor(p.id, s.epoch)}`;
    return `${this.d.appUrl ?? this.d.baseUrl}/dashboard?vault=${encodeURIComponent(p.vault ?? p.id)}&checkin=1`;
  }

  // ───────────────────────── composing ─────────────────────────

  async render(a: Action, p: SwitchProfile, s: Snapshot): Promise<OutMessage> {
    const intro = await this.wording.intro(a.facts);
    this.pendingMeta.source = (this.wording as { lastSource?: string }).lastSource ?? this.wording.name;
    const steps = nextSteps(a.facts);
    let text = `${intro}\n\nWhat happens next:\n${steps.map((x) => `• ${x}`).join("\n")}`;
    const buttons: OutMessage["buttons"] = [];
    const NO_CHECKIN = ["released", "all_clear", "agent_spent", "agent_near_limit", "agent_blocked", "agent_unfrozen", "agent_handover"];
    const REVIEW = ["agent_spent", "agent_near_limit", "agent_blocked"];
    const ownerActionable = a.audience === "owner" && !NO_CHECKIN.includes(a.stage) && !(a.stage === "agent_frozen" && a.facts.freezeReason === "owner");
    const appLink = this.d.appUrl ? `${this.d.appUrl}/dashboard?vault=${encodeURIComponent(p.vault ?? p.id)}` : undefined;
    if (a.audience === "owner" && REVIEW.includes(a.stage) && appLink) {
      text += `\n\nReview activity: ${appLink}`;
      buttons.push({ label: "Review activity", url: appLink });
    } else if (a.audience === "successor" && appLink) {
      text += `\n\nOpen ${BRAND.name}: ${appLink}`;
      buttons.push({ label: `Open ${BRAND.name}`, url: appLink });
    } else if (ownerActionable) {
      const url = this.ownerLink(p, s);
      text += `\n\nCheck in: ${url}`;
      buttons.push({ label: "I'm here ✓", url });
    } else if (a.audience === "guardians" && this.d.appUrl && !["released", "all_clear", "agent_unfrozen", "agent_handover"].includes(a.stage)) {
      const url = `${this.d.appUrl}/dashboard?vault=${encodeURIComponent(p.vault ?? p.id)}`;
      text += `\n\nOpen ${BRAND.name}: ${url}`;
      buttons.push({ label: `Open ${BRAND.name}`, url });
    }
    return { text, urgent: a.level >= 3, buttons: buttons.length ? buttons : undefined };
  }

  private contactsFor(p: SwitchProfile, aud: Audience): Contact[] {
    return aud === "owner" ? [p.owner] : aud === "beneficiary" ? [p.beneficiary] : aud === "successor" ? (p.successor ? [p.successor] : []) : p.guardians;
  }

  private async fire(a: Action, p: SwitchProfile, s: Snapshot): Promise<boolean> {
    this.pendingMeta = { stage: a.stage, audience: a.audience, source: "rules" };
    const base = await this.render(a, p, s);
    let anyOk = false;
    for (const c of this.contactsFor(p, a.audience)) {
      // personalise the recipient name for guardians/beneficiary
      const facts = { ...a.facts, recipientName: c.name };
      const msg = c.name === a.facts.recipientName ? base : await this.render({ ...a, facts }, p, s);
      const res = await this.dispatcher.deliver(c, msg, a.level);
      if (res.some((r) => r.ok)) anyOk = true;
    }
    return anyOk;
  }

  // ───────────────────────── scheduler tick ─────────────────────────

  /** Idempotent. Call as often as you like (every minute is fine). Returns the number of messages fired. */
  async tick(): Promise<number> {
    let fired = 0;
    for (const p of this.d.profiles) fired += await this.tickOne(p);
    return fired;
  }

  private async tickOne(p: SwitchProfile): Promise<number> {
    const now = this.now();
    const snap = await this.d.chain.read(p.vault ?? p.id);
    const store = this.d.store;
    let fired = 0;

    // owner came back? → all-clear
    const prev = store.lastEpoch(p.id);
    if (prev === undefined) store.setLastEpoch(p.id, snap.epoch);
    else if (snap.epoch !== prev && !snap.released && !snap.closed && !(snap.handover && snap.handover.epoch === snap.epoch)) {
      const keys = store.keys(p.id);
      const had = (aud: Audience, stages: Stage[]) =>
        [...keys].some((k) => {
          const [e, au, st] = k.split(":");
          return Number(e) === prev && au === aud && stages.includes(st as Stage);
        });
      const ownerEsc = had("owner", ESCALATED);
      const guardEsc = had("guardians", ["guardian_heads_up", "guardian_vote_open", "challenge_started", "executable"]);
      const auds: Audience[] = [];
      if (ownerEsc) auds.push("owner");
      if (guardEsc) auds.push("guardians");
      for (const aud of auds) {
        const key = actionKey(snap.epoch, { audience: aud, stage: "all_clear", step: 0 });
        if (store.has(p.id, key)) continue;
        const a: Action = {
          key, stage: "all_clear", audience: aud, level: 1, tone: "friendly",
          facts: buildFacts(p, snap, now, "all_clear", aud, 1, aud === "owner" ? p.owner.name : "guardian"),
        };
        if (await this.fire(a, p, snap)) { store.add(p.id, key); fired++; }
      }
      store.setLastEpoch(p.id, snap.epoch);
    } else if (snap.epoch !== prev) store.setLastEpoch(p.id, snap.epoch);

    const events = this.d.managed ? await this.d.managed.activity(p.id) : [];
    const plan = decide(p, snap, now, store.keys(p.id), undefined, events);
    for (const k of plan.skip) store.add(p.id, k);
    for (const a of plan.send) {
      if (await this.fire(a, p, snap)) {
        store.add(p.id, a.key);
        fired++;
      }
      // all channels failed → NOT marked sent → retried next tick
    }
    return fired;
  }

  // ───────────────────────── inbound ─────────────────────────

  private who(channel: string, address: string): { p: SwitchProfile; role: Audience; c: Contact } | null {
    for (const p of this.d.profiles) {
      for (const [role, cs] of [["owner", [p.owner]], ["guardians", p.guardians], ["beneficiary", [p.beneficiary]], ["successor", p.successor ? [p.successor] : []]] as [Audience, Contact[]][]) {
        for (const c of cs) if (c.endpoints.some((e) => e.channel === channel && e.address === address)) return { p, role, c };
      }
    }
    return null;
  }

  async statusText(p: SwitchProfile, role: Audience): Promise<string> {
    const now = this.now();
    const s = await this.d.chain.read(p.vault ?? p.id);
    const st = chainStatus(s, now);
    const who = role === "owner" ? "Your" : `${p.owner.name}'s`;
    const agentLine = this.agentLine(s, now, role);
    return (await this.statusCore(p, s, now, st, who, role)) + agentLine;
  }

  private agentLine(s: Snapshot, now: number, role: Audience): string {
    if (s.handover) return `\nThe vault was handed to ${s.handover.toName}; the agent's permissions were removed.`;
    if (!s.agent) return "";
    const a = s.agent;
    const ast = agentState(s, now);
    const who = role === "owner" ? "Your agent" : "The agent";
    const budget = a.limits.map((l) => {
      const al = agentAllowance(s, now, l.asset)!;
      return `${fmtAmount(l.asset, Math.max(al.remaining, 0))} of ${fmtAmount(l.asset, l.perPeriod)} left per ${periodWord(a.periodMs)}`;
    }).join(", ");
    const label: Record<string, string> = {
      active: "is working inside its limits", frozen_lapsed: "is FROZEN (the owner has not checked in)",
      frozen_guardian: "is FROZEN by a guardian", frozen_owner: "is FROZEN by its owner", stopped: "has been shut down", none: "",
    };
    return `\n${who} ${a.name} ${label[ast]}. ${budget}.`;
  }

  private async statusCore(p: SwitchProfile, s: Snapshot, now: number, st: ReturnType<typeof chainStatus>, who: string, role: Audience): Promise<string> {
    switch (st) {
      case "active": return `${who} timer is healthy. Next check-in due ${fmtDate(expiry(s))} (${humanDuration(expiry(s) - now)} left).`;
      case "grace": return `${who} check-in is overdue. Grace period ends ${fmtDate(graceEnd(s))} (${humanDuration(graceEnd(s) - now)} left). Nothing has been released.`;
      case "awaiting_guardians": return `Grace period is over. Guardians may vote: ${s.approvedBy.length}/${s.threshold} approvals so far.`;
      case "challenge": return `Release approved. It can execute after ${fmtDate(s.challengeEnd!)} unless ${role === "owner" ? "you check" : p.owner.name + " checks"} in.`;
      case "executable": return `Challenge window over. The release can be executed at any moment.`;
      case "paused": return `${who} vault is in vacation mode until ${fmtDate(s.pausedUntil)}.`;
      case "released": return `The vault was released to ${p.beneficiary.name}.`;
      case "closed": return `The vault was closed by its owner.`;
    }
  }

  /** Transport-agnostic command handler (Telegram/web/chat). Returns reply text. */
  async handleInbound(channel: string, address: string, text: string): Promise<string> {
    const w = this.who(channel, address);
    if (!w) return "Sorry, I don't recognise this chat, so I can't share anything here.";
    const t = text.trim().toLowerCase().replace(/^\//, "");
    const word = t.split(/\s+/)[0] ?? "";
    const now = this.now();

    if (word === "start" || word === "help") {
      return w.role === "owner"
        ? `Hi! I'm the ${BRAND.name} check-in assistant. Commands: /checkin (I'm here), /status, /freeze and /unfreeze (your AI agent), /pause <days> (vacation mode, max 90). I never ask for keys or seed phrases. Ever.`
        : `Hi ${w.c.name}! I'll message you only if ${w.p.owner.name} goes silent. Commands: /status. I never ask for keys or seed phrases. Ever.`;
    }
    if (word === "status") return this.statusText(w.p, w.role);

    if (w.role === "owner" && (word === "checkin" || /^(i'?m here|im here|alive|here)$/.test(t))) {
      if (isSimWritable(this.d.chain)) {
        try {
          this.d.chain.checkIn(w.p.id, now);
        } catch (e) {
          return `Couldn't check in: ${(e as Error).message}.`;
        }
        await this.tickOne(w.p); // fires the all-clear immediately if needed
        const s = await this.d.chain.read(w.p.id);
        return `✓ Checked in (simulated). Timer reset. Next deadline ${fmtDate(expiry(s))}.`;
      }
      const s = await this.d.chain.read(w.p.vault ?? w.p.id);
      return `Check-ins are signed in your own wallet; I can't do it for you. Open: ${this.ownerLink(w.p, s)}`;
    }
    if (w.role === "owner" && (word === "freeze" || word === "unfreeze")) {
      if (!isSimWritable(this.d.chain)) return `Freezing is signed in your wallet. Open: ${this.d.appUrl ?? this.d.baseUrl}/dashboard`;
      try {
        if (word === "freeze") this.d.chain.ownerFreezeAgent(w.p.id, now);
        else this.d.chain.ownerUnfreezeAgent(w.p.id, now);
      } catch (e) {
        return `Couldn't ${word}: ${(e as Error).message}.`;
      }
      await this.tickOne(w.p);
      return word === "freeze" ? "✓ Your agent is frozen (simulated). It cannot spend until you unfreeze it." : "✓ Your agent is unfrozen (simulated). It works inside its limits again.";
    }
    if (w.role === "owner" && word === "pause") {
      const days = Number(t.split(/\s+/)[1]);
      if (!Number.isFinite(days) || days < 1 || days > 90) return "Usage: /pause <days>, between 1 and 90.";
      if (!isSimWritable(this.d.chain)) return `Pausing is signed in your wallet. Open: ${this.d.appUrl ?? this.d.baseUrl}/dashboard`;
      this.d.chain.pause(w.p.id, now, days * DAY);
      return `Vacation mode on for ${days} days (simulated). I'll stop reminders until it ends.`;
    }
    if (w.role === "guardians" && (word === "approve" || word === "vote")) {
      return `Voting happens on-chain from your own wallet in the ${BRAND.name} app, never via chat. I'll tell you when it opens. ${this.d.appUrl ? this.d.appUrl + "/dashboard" : ""}`.trim();
    }
    return "I didn't understand that. Try /status or /help.";
  }

  /** Web check-in (POST only; GET just renders). Returns a user-facing result. */
  async checkInViaToken(token: string): Promise<{ ok: boolean; message: string }> {
    const v = await this.verifyToken(token);
    if (!v) return { ok: false, message: `This link is no longer valid (you may already have checked in). Open the latest message from ${BRAND.name}.` };
    if (!isSimWritable(this.d.chain)) return { ok: false, message: `Check-ins for on-chain vaults are signed in your wallet via the ${BRAND.name} app.` };
    try {
      this.d.chain.checkIn(v.profile.id, this.now());
    } catch (e) {
      return { ok: false, message: `Couldn't check in: ${(e as Error).message}` };
    }
    await this.tickOne(v.profile);
    const s = await this.d.chain.read(v.profile.id);
    return { ok: true, message: `Checked in. Your next deadline is ${fmtDate(expiry(s))}.` };
  }
}
