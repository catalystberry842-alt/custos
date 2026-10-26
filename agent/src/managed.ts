/**
 * managed.ts — where the managed AI agent's activity comes from.
 * The monitoring agent only READS this feed (to tell the owner what their AI did). Real-chain event ingestion is not
 * implemented (it would need log queries by block range); `MockManagedAgent` drives demos and tests.
 */
import { blockReasonOf, type AgentEvent } from "./chainModel.js";
import type { SimChain } from "./chain.js";

export interface ManagedAgentAdapter {
  readonly name: string;
  activity(switchId: string): Promise<AgentEvent[]>;
}

/** A simulated AI agent acting on a SimChain vault. Every attempt is recorded; the vault rules decide the outcome. */
export class MockManagedAgent implements ManagedAgentAdapter {
  readonly name = "mock";
  private events = new Map<string, AgentEvent[]>();
  private seq = 0;
  constructor(private chain: SimChain, private clock: () => number = Date.now) {}

  async activity(id: string): Promise<AgentEvent[]> {
    return structuredClone(this.events.get(id) ?? []);
  }

  /** The AI tries to pay `to`. Returns what the contract rules decided. */
  attempt(id: string, asset: string, to: string, amount: number): { ok: true } | { ok: false; reason: string } {
    const at = this.clock();
    const list = this.events.get(id) ?? [];
    this.events.set(id, list);
    try {
      this.chain.agentSpend(id, at, asset, to, amount);
      list.push({ id: ++this.seq, at, kind: "spend", asset, to, amount });
      return { ok: true };
    } catch (e) {
      if (e instanceof Error && ["NotAgent", "Finished"].includes(e.message)) return { ok: false, reason: "revoked" }; // agent no longer authorised: nothing to log
      const reason = blockReasonOf(e);
      if (!reason) throw e;
      list.push({ id: ++this.seq, at, kind: "blocked", asset, to, amount, reason });
      return { ok: false, reason };
    }
  }
}
