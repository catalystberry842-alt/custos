import { Agent } from "../src/agent.js";
import { MockChannel } from "../src/channels.js";
import { SimChain } from "../src/chain.js";
import { DAY, HOUR, newSnapshot } from "../src/chainModel.js";
import { MemoryStore } from "../src/store.js";
import type { SwitchProfile } from "../src/types.js";
import type { Wording } from "../src/wording.js";

export const T0 = Date.UTC(2026, 10, 1, 9, 0);

const c = (id: string, name: string) => ({ id, name, endpoints: [{ channel: "mock", address: id }] });
export const profile = (): SwitchProfile => ({
  id: "s1", owner: c("ada", "Ada"), beneficiary: c("emeka", "Emeka"),
  guardians: [c("bola", "Bola"), c("chidi", "Chidi"), c("dayo", "Dayo")],
});

export function setup(opts: { wording?: Wording; channel?: MockChannel } = {}) {
  const clock = { now: T0 };
  const chain = new SimChain();
  chain.add("s1", newSnapshot(T0, { guardianCount: 3, threshold: 2 }));
  const channel = opts.channel ?? new MockChannel("mock");
  const agent = new Agent({
    profiles: [profile()], chain, channels: { mock: channel }, store: new MemoryStore(), wording: opts.wording,
    baseUrl: "https://checkin.test", appUrl: "https://app.test", linkSecret: "test-secret-test-secret", now: () => clock.now,
  });
  const advance = async (ms: number, step = 3 * HOUR) => {
    for (let t = 0; t < ms; t += step) { clock.now += Math.min(step, ms - t); await agent.tick(); }
  };
  const to = (id: string) => channel.sent.filter((s) => s.to.address === id);
  return { clock, chain, channel, agent, advance, to, DAY, HOUR };
}
