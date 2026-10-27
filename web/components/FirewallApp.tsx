"use client";
import { useEffect, useRef, useState } from "react";
import ModeSwitch from "@/components/ModeSwitch";
import { verifyChain, type AgentPolicy, type AuditEntry, type Verdict } from "@/lib/firewall";
import { ADDR } from "@/lib/firewall";
import { advance, agentOf, createDemo, loadDemo, nameOf, pay, runScenarioDemo, saveDemo, setPolicy, submit, SCENARIOS, type Demo } from "@/lib/fwdemo";

const KEY = "custos-firewall-v1";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const clock = (t: number) => { const d = new Date(t); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PILL: Record<Verdict, [string, string]> = { approve: ["ok", "Approved"], block: ["warn", "Blocked"], pending: ["cold", "Needs you"] };

function title(e: AuditEntry): string {
  const a = e.action;
  if (!a) return e.summary;
  if (a.fn === "transfer" || a.fn === "native_transfer" || a.fn === "transferFrom") return `Pay ${usd(a.usd ?? 0)} to ${nameOf(a.recipient)}`;
  if (a.fn === "approve" || a.fn === "increaseAllowance" || a.fn === "permit" || a.fn === "setApprovalForAll") return `${a.fn === "permit" ? "Sign a permit" : a.fn === "setApprovalForAll" ? "Approve all" : "Approve"} ${nameOf(a.asset)} for ${nameOf(a.spender)}`;
  return `Call ${a.fn} on ${nameOf(a.to)}`;
}

const FN_OPTIONS = ["transfer", "native_transfer", "approve", "swapExactTokensForTokens", "deposit", "claim"];
const RECIPIENTS = [[ADDR.acme, "Acme Ltd"], [ADDR.rent, "Landlord"], [ADDR.attacker, "Attacker wallet"]] as const;
const CONTRACTS = [[ADDR.router, "Swap router"], [ADDR.yieldVault, "Yield vault"], [ADDR.drainer, "Rewards claimer"]] as const;

function Num({ label, v, on, suffix, help }: { label: string; v: number | undefined; on: (n: number | undefined) => void; suffix?: string; help?: string }) {
  return (
    <label className="field" style={{ gap: 6 }}>
      <span className="xs mut">{label}</span>
      <span className="row" style={{ gap: 6 }}>
        <input className="input" inputMode="decimal" style={{ height: 38 }} value={v === undefined ? "" : String(v)} placeholder="off"
          onChange={(e) => { const t = e.target.value.trim(); on(t === "" ? undefined : Number.isFinite(Number(t)) && Number(t) >= 0 ? Number(t) : v); }} />
        {suffix && <span className="xs dim">{suffix}</span>}
      </span>
      {help && <span className="xs dim">{help}</span>}
    </label>
  );
}
function Toggle({ on, label, set }: { on: boolean; label: string; set: (b: boolean) => void }) {
  return <button type="button" className={`chip ${on ? "on" : ""}`} aria-pressed={on} onClick={() => set(!on)}>{label}</button>;
}
const flip = (list: string[], a: string, on: boolean) => (on ? [...new Set([...list, a])] : list.filter((x) => x !== a));

export default function FirewallApp() {
  const ref = useRef<Demo | null>(null);
  const [, bump] = useState(0);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<AgentPolicy | null>(null);
  const [verify, setVerify] = useState<string | null>(null);
  const [tamper, setTamper] = useState<{ entries: AuditEntry[]; at: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let d: Demo | null = null;
    try { d = loadDemo(localStorage.getItem(KEY)); } catch { /* ignore */ }
    ref.current = d ?? createDemo();
    setDraft(structuredClone(agentOf(ref.current).policy));
    setReady(true);
  }, []);

  const act = async (fn: (d: Demo) => Promise<unknown> | unknown) => {
    const d = ref.current!; setBusy(true);
    try { await fn(d); } finally { try { localStorage.setItem(KEY, saveDemo(d)); } catch { /* ignore */ } setBusy(false); bump((v) => v + 1); }
  };

  if (!ready || !ref.current || !draft) return <main className="wrap"><div className="app"><p className="xs dim">Loading firewall…</p></div></main>;
  const d = ref.current;
  const fw = d.fw;
  const ag = agentOf(d);
  const policy = ag.policy;
  const dirty = JSON.stringify(draft) !== JSON.stringify(policy);
  const entries = fw.audit.entries;
  const decisions = entries.filter((e) => e.type === "decision" || e.type === "resolution");
  const feed = [...entries].reverse().filter((e) => e.type === "decision" || e.type === "resolution" || e.type === "control" || e.type === "policy");
  const count = (v: Verdict) => entries.filter((e) => e.type === "decision" && e.decision === v).length;
  const dayUsd = ag.runtime.spends.filter((s) => s.ts > d.t - 86_400_000).reduce((a, s) => a + s.usd, 0);
  const open = fw.pending.filter((p) => p.status === "open");
  const frozen = fw.killAll || ag.runtime.frozen;
  const shown = showAll ? [...entries].reverse() : [...entries].reverse().slice(0, 8);
  const chain = tamper ? tamper.entries : entries;

  const cap = (t?: string) => (t ? t[0]!.toUpperCase() + t.slice(1) : "");
  const runVerify = () => {
    const r = verifyChain(chain);
    setVerify(r.ok ? `ok|${r.checked} entries verified. Every entry links to the one before it and none was changed. Head ${r.head.slice(0, 16)}…` : `bad|${cap(r.reason)}. Everything from entry ${r.brokenAt} on can no longer be trusted.`);
  };
  const doTamper = () => {
    const i = entries.map((e) => e.type === "decision" && e.decision === "block").lastIndexOf(true);
    if (i < 0) { setVerify("bad|Nothing blocked yet to tamper with. Run an attack test first."); return; }
    const copy: AuditEntry[] = JSON.parse(JSON.stringify(entries));
    copy[i] = { ...copy[i]!, decision: "approve", reasons: [] };
    setTamper({ entries: copy, at: i });
    setVerify(`bad|${cap(verifyChain(copy).reason)}. Everything from entry ${i} on can no longer be trusted.`);
  };

  return (
    <main className="wrap"><div className="app fw">
      <div className="app-head">
        <div className="stack" style={{ gap: 6 }}>
          <h2>Agent Firewall</h2>
          <p className="mut" style={{ maxWidth: "62ch" }}>Every action your agent proposes is checked here before it can reach the signer. The rules run outside the AI model, so a tricked agent still can&apos;t sign what they refuse.</p>
        </div>
        <div className="btns">
          <button className={`btn ${frozen ? "primary" : "warn"}`} onClick={() => act((x) => x.fw.setKillSwitch(!fw.killAll, x.t += 1000))}>{fw.killAll ? "Release kill switch" : "Kill switch"}</button>
          <button className="btn ghost" onClick={() => { localStorage.removeItem(KEY); const n = createDemo(); ref.current = n; setDraft(structuredClone(agentOf(n).policy)); setVerify(null); setTamper(null); bump((v) => v + 1); }}>Reset demo</button>
        </div>
      </div>

      <div className="row between wrapflex" style={{ gap: 10 }}>
        <ModeSwitch mode="sim" />
        <span className="xs dim">Fake agent, funds and time · simulated time {clock(d.t)} UTC</span>
      </div>


      {frozen && (
        <div className="note" role="status" style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <span>{fw.killAll ? "Kill switch is ON: every action from every agent is blocked." : `Atlas is frozen: ${ag.runtime.frozenReason}.`}</span>
          {!fw.killAll && <button className="btn sm" onClick={() => act((x) => x.fw.setKillSwitch(false, x.t += 1000, ag.id))}>Unfreeze Atlas</button>}
        </div>
      )}

      <div className="fw-stats">
        <div className="glass"><span className="xs mut">Approved</span><b>{count("approve")}</b></div>
        <div className="glass"><span className="xs mut">Blocked</span><b className="danger">{count("block")}</b></div>
        <div className="glass"><span className="xs mut">Waiting for you</span><b className="frost">{open.length}</b></div>
        <div className="glass"><span className="xs mut">Spent in 24 h</span><b>{usd(dayUsd)}<small> of {usd(policy.dailyUsd)}</small></b></div>
      </div>

      <div className="fw-grid">
        <div className="fw-col">
        {/* ── attack tests + manual actions ── */}
        <section className="glass pad-l stack fw-a" aria-labelledby="fw-att">
          <div className="row between wrapflex"><h3 id="fw-att" className="sect-t">Attack tests</h3>
            <button className="btn sm primary" disabled={busy} onClick={() => act(async (x) => { for (const s of SCENARIOS) await runScenarioDemo(x, s); })}>Run all</button></div>
          <p className="xs mut">Each test replays a real attack against Atlas&apos;s current policy. Time moves 15 minutes between tests and a tripped breaker is reset.</p>
          <div className="fw-att">
            {SCENARIOS.map((s) => {
              const r = d.runs[s.id];
              return (
                <div className="fw-sc" key={s.id}>
                  <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                    <b>{s.title}</b>
                    <span className="xs mut">{s.story}</span>
                    {r && (
                      <span className="fw-vs" aria-label="Result">
                        {r.verdicts.map((v, i) => <i key={i} className={v} title={v} />)}
                        <span className="xs dim">{r.verdicts.filter((v) => v === "block").length} blocked{r.verdicts.some((v) => v === "pending") ? ", 1 waiting for you" : ""}{r.verdicts.some((v) => v === "approve") ? `, ${r.verdicts.filter((v) => v === "approve").length} allowed` : ""}{r.matched ? "" : " · differs from the default policy"}</span>
                      </span>
                    )}
                  </div>
                  <button className="btn sm" disabled={busy} onClick={() => act((x) => runScenarioDemo(x, s))}>{r ? "Run again" : "Run"}</button>
                </div>
              );
            })}
          </div>
          <hr className="hr" />
          <span className="xs mut">Or send a normal payment as Atlas</span>
          <div className="btns">
            <button className="btn sm" disabled={busy} onClick={() => act(async (x) => { await submit(x, pay(x, ADDR.acme, 20, "Pay Acme's invoice, 20 USDC.")); })}>Pay Acme $20</button>
            <button className="btn sm" disabled={busy} onClick={() => act(async (x) => { await submit(x, pay(x, ADDR.rent, 45, "Pay this month's rent share, 45 USDC.")); })}>Pay landlord $45</button>
            <button className="btn sm" disabled={busy} onClick={() => act(async (x) => { await submit(x, pay(x, ADDR.acme, 75, "Pay Acme's bigger invoice, 75 USDC.")); })}>Pay Acme $75</button>
            <button className="btn sm ghost" disabled={busy} onClick={() => act((x) => advance(x, 24 * 3_600_000))}>+24 h</button>
          </div>
        </section>

        {/* ── pending approvals ── */}
        <section className="glass pad-l stack fw-b" aria-labelledby="fw-pen">
          <div className="row between"><h3 id="fw-pen" className="sect-t">Waiting for you</h3><span className={`pill ${open.length ? "cold" : ""}`}>{open.length} open</span></div>
          {open.length === 0 && <p className="xs mut">Nothing to decide. Actions that are allowed in principle but unusual land here: an amount above your threshold, an unknown contract, an approval to a new spender.</p>}
          {open.map((p) => {
            const e = entries[p.auditIndex]!;
            return (
              <div className="fw-pen" key={p.id}>
                <div className="stack" style={{ gap: 4 }}>
                  <b>{title(e)}</b>
                  {p.action.intent && <span className="xs dim">Agent says: &ldquo;{p.action.intent}&rdquo;</span>}
                  {p.reasons.map((r, i) => <span className="xs frost" key={i}>{r}</span>)}
                </div>
                <div className="btns">
                  <button className="btn sm primary" disabled={busy} onClick={() => act((x) => x.fw.resolvePending(p.id, "approve", "owner", x.t += 5000))}>Approve</button>
                  <button className="btn sm" disabled={busy} onClick={() => act((x) => x.fw.resolvePending(p.id, "deny", "owner", x.t += 5000))}>Deny</button>
                </div>
              </div>
            );
          })}
          {fw.pending.some((p) => p.status !== "open") && <span className="xs dim">{fw.pending.filter((p) => p.status !== "open").length} resolved earlier. See the audit trail.</span>}
        </section>

        {/* ── policy editor ── */}
        <section className="glass pad-l stack fw-d" aria-labelledby="fw-pol">
          <div className="row between wrapflex"><h3 id="fw-pol" className="sect-t">Policy for Atlas</h3><span className="mono dim" title="SHA-256 of the policy">policy {ag.policyHash.slice(0, 8)}</span></div>
          <div className="fw-form">
            <Num label="Per transaction" v={draft.perTxUsd} suffix="USD" on={(n) => setDraft({ ...draft, perTxUsd: n ?? 0 })} />
            <Num label="Per day" v={draft.dailyUsd} suffix="USD" on={(n) => setDraft({ ...draft, dailyUsd: n ?? 0 })} />
            <Num label="Lifetime cap" v={draft.cumulativeUsd} suffix="USD" on={(n) => setDraft({ ...draft, cumulativeUsd: n ?? 0 })} />
            <Num label="Ask me above" v={draft.humanApprovalAboveUsd} suffix="USD" on={(n) => setDraft({ ...draft, humanApprovalAboveUsd: n })} />
            <Num label="Max transactions" v={draft.quota.maxTx} on={(n) => setDraft({ ...draft, quota: { ...draft.quota, maxTx: Math.max(1, Math.round(n ?? 1)) } })} />
            <Num label="…per window" v={Math.round(draft.quota.windowMs / 60_000)} suffix="min" on={(n) => setDraft({ ...draft, quota: { ...draft.quota, windowMs: Math.max(1, n ?? 1) * 60_000 } })} />
          </div>
          <div className="field" style={{ gap: 8 }}>
            <span className="xs mut">Unknown contract</span>
            <div className="chips">
              <Toggle on={draft.unknownContract === "pending"} label="Ask me" set={() => setDraft({ ...draft, unknownContract: "pending" })} />
              <Toggle on={draft.unknownContract === "block"} label="Block" set={() => setDraft({ ...draft, unknownContract: "block" })} />
            </div>
          </div>
          <div className="field" style={{ gap: 8 }}><span className="xs mut">May pay (recipients)</span>
            <div className="chips">{RECIPIENTS.map(([a, n]) => <Toggle key={a} label={n} on={draft.recipients.includes(a)} set={(b) => setDraft({ ...draft, recipients: flip(draft.recipients, a, b) })} />)}</div></div>
          <div className="field" style={{ gap: 8 }}><span className="xs mut">May call (contracts)</span>
            <div className="chips">{CONTRACTS.map(([a, n]) => <Toggle key={a} label={n} on={draft.contracts.includes(a)} set={(b) => setDraft({ ...draft, contracts: flip(draft.contracts, a, b) })} />)}</div></div>
          <div className="field" style={{ gap: 8 }}><span className="xs mut">Allowed functions</span>
            <div className="chips">{FN_OPTIONS.map((f) => <Toggle key={f} label={f} on={draft.functions.includes(f)} set={(b) => setDraft({ ...draft, functions: flip(draft.functions, f, b) })} />)}</div></div>
          <div className="field" style={{ gap: 8 }}><span className="xs mut">Approvals allowed to (spenders)</span>
            <div className="chips"><Toggle label="Swap router" on={draft.spenders.includes(ADDR.router)} set={(b) => setDraft({ ...draft, spenders: flip(draft.spenders, ADDR.router, b) })} /></div></div>
          <p className="xs dim">Unlimited approvals, permits and approve-all are always blocked. That is not a setting.</p>
          {draft.perTxUsd > draft.dailyUsd && <p className="note">The per-transaction limit is above the daily limit, so the daily limit will be what bites.</p>}
          <div className="btns">
            <button className="btn primary sm" disabled={!dirty || busy} onClick={() => act((x) => setPolicy(x, structuredClone(draft)))}>Apply policy</button>
            <button className="btn sm ghost" disabled={!dirty} onClick={() => setDraft(structuredClone(policy))}>Discard</button>
          </div>
        </section>

        </div>
        <div className="fw-col">
        {/* ── live feed ── */}
        <section className="glass pad-l stack fw-c" aria-labelledby="fw-feed">
          <div className="row between"><h3 id="fw-feed" className="sect-t">Live feed</h3><span className="xs dim">{decisions.length} decisions</span></div>
          {feed.length === 0 && <p className="xs mut">No activity yet. Run an attack test.</p>}
          <div className="fw-feed">
            {feed.slice(0, 40).map((e) => {
              if (e.type === "control" || e.type === "policy") return <div className="evt sys" key={e.index}>{e.summary}</div>;
              const v = e.decision!;
              const [cls, label] = PILL[v];
              const failed = e.rules?.filter((r) => !r.ok) ?? [];
              return (
                <article className={`fw-item ${v}`} key={e.index}>
                  <div className="row between" style={{ alignItems: "flex-start", gap: 10 }}>
                    <b style={{ minWidth: 0 }}>{e.type === "resolution" ? `You decided: ${title(e)}` : title(e)}</b>
                    <span className={`pill ${cls}`}>{label}</span>
                  </div>
                  {e.action?.intent && <span className="xs dim">Agent says: &ldquo;{e.action.intent}&rdquo;</span>}
                  {v !== "approve" && <ul className="fw-why">{(e.reasons ?? []).map((r, i) => <li key={i}>{r}</li>)}</ul>}
                  <details>
                    <summary>{e.rules ? `${e.rules.length - failed.length} of ${e.rules.length} rules passed` : "Details"} · {clock(e.ts)}</summary>
                    <ul className="fw-rules">{e.rules?.map((r) => <li key={r.rule} className={r.ok ? "ok" : r.severity}><i />{r.detail}</li>)}</ul>
                  </details>
                </article>
              );
            })}
          </div>
        </section>

        {/* ── audit trail ── */}
        <section className="glass pad-l stack fw-e" aria-labelledby="fw-aud">
          <div className="row between wrapflex"><h3 id="fw-aud" className="sect-t">Proof of Agent: audit trail</h3><span className="xs dim">{entries.length} entries</span></div>
          <p className="xs mut">Each entry holds the hash of the one before it. It proves what the firewall decided and that no one rewrote it since. It does not prove the agent is honest.</p>
          <div className="btns">
            <button className="btn sm primary" onClick={runVerify}>Verify chain</button>
            {!tamper ? <button className="btn sm warn" onClick={doTamper}>Try tampering</button> : <button className="btn sm" onClick={() => { setTamper(null); setVerify(null); }}>Undo tampering</button>}
          </div>
          {verify && <p className={verify.startsWith("ok") ? "fw-ok" : "note"} role="status">{verify.slice(verify.indexOf("|") + 1)}</p>}
          <ol className="fw-aud">
            {shown.map((e) => {
              const shownE = tamper ? tamper.entries[e.index]! : e;
              const bad = tamper && e.index === tamper.at;
              return (
                <li key={e.index} className={bad ? "bad" : ""}>
                  <span className="mono dim">#{e.index}</span>
                  <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                    <span className="fw-ell">{e.type === "decision" ? `${title(e)}` : e.summary}</span>
                    <span className="mono dim fw-ell">{e.type}{shownE.decision ? ` · ${shownE.decision}` : ""} · {e.hash.slice(0, 12)}… ← {e.prevHash.slice(0, 6)}…</span>
                  </span>
                  {bad && <span className="pill warn">edited</span>}
                </li>
              );
            })}
          </ol>
          {entries.length > 8 && <button className="btn sm ghost" style={{ alignSelf: "flex-start" }} onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : `Show all ${entries.length}`}</button>}
        </section>
        </div>
      </div>

      <p className="xs dim" style={{ maxWidth: "80ch" }}>Honest limits: a daily spend limit is not a loss limit. A compromised payee you allowlisted can&apos;t be detected. The simulator here is a mock, not a real chain. The on-chain contract still enforces its own hard caps even if this firewall were bypassed.</p>
    </div></main>
  );
}
