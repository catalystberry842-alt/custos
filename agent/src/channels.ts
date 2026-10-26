import type { Contact, Endpoint, OutMessage } from "./types.js";

/** Transport adapter. Implementations must not hold wallet keys: they only deliver words. */
export interface Channel {
  readonly name: string;
  send(to: Endpoint, msg: OutMessage): Promise<void>;
}

export interface Delivery {
  at: number;
  contactId: string;
  contactName: string;
  channel: string;
  address: string;
  text: string;
  urgent: boolean;
  ok: boolean;
  error?: string;
}

/** In-memory channel for tests/demos/mock mode: keeps a transcript, nothing leaves the process. */
export class MockChannel implements Channel {
  readonly sent: { to: Endpoint; msg: OutMessage }[] = [];
  constructor(readonly name = "mock", private failWith?: string) {}
  async send(to: Endpoint, msg: OutMessage): Promise<void> {
    if (this.failWith) throw new Error(this.failWith);
    this.sent.push({ to, msg });
  }
  setFailure(err?: string) { this.failWith = err; }
}

export class ConsoleChannel implements Channel {
  constructor(readonly name = "console", private out: (s: string) => void = console.log) {}
  async send(to: Endpoint, msg: OutMessage): Promise<void> {
    this.out(`\n┌─ → ${to.channel}:${to.address}${msg.urgent ? "  [URGENT]" : ""}\n${msg.text.split("\n").map((l) => "│ " + l).join("\n")}\n└─`);
  }
}

/** Telegram Bot API adapter (plain fetch). Needs TELEGRAM_BOT_TOKEN; never used in mock mode. */
export class TelegramChannel implements Channel {
  readonly name = "telegram";
  constructor(private readonly token: string, private readonly fetchImpl: typeof fetch = fetch) {}
  async send(to: Endpoint, msg: OutMessage): Promise<void> {
    const body: Record<string, unknown> = {
      chat_id: to.address,
      text: msg.text,
      disable_web_page_preview: true,
    };
    if (msg.buttons?.length) {
      body.reply_markup = { inline_keyboard: [msg.buttons.map((b) => ({ text: b.label, url: b.url }))] };
    }
    const res = await this.fetchImpl(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`telegram http ${res.status}`);
  }

  /** Long-poll helper for inbound commands. Returns the next offset. */
  async poll(offset: number, onText: (chatId: string, text: string) => Promise<void>): Promise<number> {
    const res = await this.fetchImpl(
      `https://api.telegram.org/bot${this.token}/getUpdates?timeout=20&offset=${offset}`,
      { signal: AbortSignal.timeout(30_000) },
    );
    if (!res.ok) throw new Error(`telegram http ${res.status}`);
    const j = (await res.json()) as { result?: { update_id: number; message?: { chat: { id: number }; text?: string } }[] };
    let next = offset;
    for (const u of j.result ?? []) {
      next = Math.max(next, u.update_id + 1);
      if (u.message?.text) await onText(String(u.message.chat.id), u.message.text);
    }
    return next;
  }
}

/** Routes a message to a contact's endpoints by escalation level. */
export class Dispatcher {
  constructor(private channels: Record<string, Channel>, private clock: () => number, private onDelivery?: (d: Delivery) => void) {}

  async deliver(c: Contact, msg: OutMessage, level: number): Promise<Delivery[]> {
    const eps = level >= 2 ? c.endpoints : c.endpoints.slice(0, 1);
    const out: Delivery[] = [];
    for (const ep of eps) {
      const d: Delivery = {
        at: this.clock(), contactId: c.id, contactName: c.name, channel: ep.channel, address: ep.address,
        text: msg.text, urgent: msg.urgent, ok: true,
      };
      const ch = this.channels[ep.channel];
      try {
        if (!ch) throw new Error(`no adapter for channel "${ep.channel}"`);
        await ch.send(ep, msg);
      } catch (e) {
        d.ok = false;
        d.error = (e as Error).message;
      }
      out.push(d);
      this.onDelivery?.(d);
    }
    return out;
  }
}
