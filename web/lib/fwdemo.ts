// Demo glue around the firewall engine (web/lib/firewall is the SAME code as firewall/src). Pure and testable:
// the React page only renders this state. Everything here is a simulation: fake addresses, fake balances, fake time.
import {
  ADDR, CHAIN_ID, DEMO_AGENT, KNOWN_SELECTORS, SCENARIOS, T0, ThreatChecker, MockSimulator, Firewall, demoIntel, demoPolicy, demoWorld,
  encodeTransfer, makeClock, usdc, type AgentPolicy, type RawAction, type Scenario, type Verdict,
} from "./firewall";

export const MIN = 60_000;
export const NAMES: Record<string, string> = {
  [ADDR.usdc]: "USDC", [ADDR.router]: "Swap router", [ADDR.acme]: "Acme Ltd", [ADDR.rent]: "Landlord", [ADDR.attacker]: "Attacker wallet",
  [ADDR.lookalike]: "Lookalike wallet", [ADDR.yieldVault]: "Yield vault", [ADDR.drainer]: "Rewards claimer", [ADDR.broken]: "Broken pool",
};
export const nameOf = (a?: string) => (a ? NAMES[a.toLowerCase()] ?? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export interface ScenarioRun { id: string; verdicts: Verdict[]; matched: boolean; at: number; stoppedAfter?: number }
export interface Demo { fw: Firewall; nonce: number; t: number; runs: Record<string, ScenarioRun> }

const opts = () => ({ simulator: new MockSimulator(demoWorld()), threat: new ThreatChecker(demoIntel()), extraSelectors: KNOWN_SELECTORS });

export function createDemo(): Demo {
  const fw = new Firewall(opts());
  fw.registerAgent(DEMO_AGENT.id, DEMO_AGENT.name, demoPolicy(), T0);
  return { fw, nonce: 0, t: T0 + 5 * MIN, runs: {} };
}
export const agentOf = (d: Demo) => d.fw.agents.get(DEMO_AGENT.id)!;

export function saveDemo(d: Demo): string {
  return JSON.stringify({ v: 1, fw: d.fw.serialize(), nonce: d.nonce, t: d.t, runs: d.runs });
}
export function loadDemo(raw: string | null): Demo | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (o.v !== 1) return null;
    const fw = Firewall.restore(o.fw, opts());
    if (!fw.audit.verify().ok || !fw.agents.get(DEMO_AGENT.id)) return null;
    return { fw, nonce: o.nonce, t: o.t, runs: o.runs ?? {} };
  } catch { return null; }
}

/** Time passes: tests start later so quotas and the breaker window roll over, like real time would. */
export function advance(d: Demo, ms: number) { d.t += ms; }

export function pay(d: Demo, to: string, usd: number, intent: string): RawAction {
  return { agentId: DEMO_AGENT.id, nonce: ++d.nonce, ts: (d.t += 20_000), chainId: CHAIN_ID, to: ADDR.usdc, data: encodeTransfer(to, usdc(usd)), intent };
}
export async function submit(d: Demo, a: RawAction) { return d.fw.submit(a); }

export async function runScenarioDemo(d: Demo, s: Scenario): Promise<ScenarioRun> {
  advance(d, 15 * MIN);
  const ag = agentOf(d);
  if (ag.runtime.frozen && ag.runtime.frozenReason?.startsWith("circuit breaker")) d.fw.setKillSwitch(false, d.t, ag.id, "owner (demo: reset between tests)");
  const clock = makeClock(d.t, 20_000);
  // keep the demo's nonce continuous with the clock
  let nonce = d.nonce;
  const c = { nonce: () => ++nonce, ts: () => clock.ts(), peekNonce: () => nonce + 1 };
  const verdicts: Verdict[] = [];
  for (const a of s.build(c)) { const r = await d.fw.submit(a); verdicts.push(r.verdict); d.t = Math.max(d.t, a.ts); }
  d.nonce = nonce;
  const run: ScenarioRun = { id: s.id, verdicts, matched: verdicts.length === s.expect.length && verdicts.every((v, i) => v === s.expect[i]), at: d.t };
  d.runs[s.id] = run;
  return run;
}

export function setPolicy(d: Demo, p: AgentPolicy) { d.fw.updatePolicy(DEMO_AGENT.id, p, d.t += 1000, "owner"); }
export { SCENARIOS };
