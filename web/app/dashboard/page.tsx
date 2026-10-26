"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Gauge from "@/components/Gauge";
import { Mark } from "@/components/Logo";
import SimBanner from "@/components/SimBanner";
import Timeline from "@/components/Timeline";
import {
  advanceBy, agentPay, agentView, countdownTarget, DAY, formatCountdown, guardianApprove, guardianFreeze, HOUR, initSim, loadSim,
  nextSuggestion, ownerCheckIn, ownerFreeze, pauseVault, saveSim, statusOf, executeRelease, type FeedItem, type SimState,
} from "@/lib/sim";
import { fmtAmount } from "@/lib/agent/engine";
import { BRAND } from "@/lib/brand";
import type { AgentState } from "@/lib/agent/chainModel";
import { anchor, expiry, graceEnd, type Status } from "@/lib/agent/chainModel";

const WalletPanel = dynamic(() => import("@/components/WalletPanel"), { ssr: false, loading: () => <p className="xs dim">Loading wallet tools…</p> });

const STATUS_LABEL: Record<Status, string> = {
  active: "Active", grace: "Overdue · grace", awaiting_guardians: "Guardians may vote", challenge: "Challenge window",
  executable: "Ready to release", paused: "Vacation mode", released: "Released", closed: "Closed",
};
const STATUS_EXPLAIN = (s: SimState): Record<Status, string> => ({
  active: s.snap.handover
    ? `${s.snap.handover.toName} now owns the vault and checks in from here on. The same guardians still watch over it.`
    : s.snap.agent ? `${s.cfg.ownerName} is checking in on time, so ${s.snap.agent.name} may spend inside its limits. Nothing else can happen to the vault.` : `${s.cfg.ownerName} is checking in on time. Nothing can happen to the vault.`,
  grace: `${s.cfg.ownerName} missed the deadline. Reminders are escalating and guardians have been warned.${s.snap.agent ? ` ${s.snap.agent.name} is on a short leash: it freezes at the end of its allowance.` : ""} Nothing is released and guardians cannot vote yet.`,
  awaiting_guardians: s.snap.agent
    ? `Grace is over and ${s.snap.agent.name} is frozen. ${s.snap.threshold} of ${s.snap.guardianCount} guardians can now agree on an outcome ${s.cfg.ownerName} set in advance: hand over to ${s.cfg.agent?.successorName || "(no successor)"} or shut down and return funds to ${s.cfg.beneficiaryName}.`
    : `Grace is over. ${s.snap.threshold} of ${s.snap.guardianCount} guardians can now approve a release to ${s.cfg.beneficiaryName}.`,
  challenge: `Enough guardians approved ${s.snap.pendingOutcome === "handover" ? "a handover" : "a release"}. ${s.cfg.ownerName} can still cancel by checking in. Otherwise it can execute when the window ends.`,
  executable: `The window is closed. Anyone can now execute the ${s.snap.pendingOutcome === "handover" ? "handover" : "release"}. ${s.cfg.ownerName} can still cancel until it is executed.`,
  paused: `${s.cfg.ownerName} is on vacation mode. The deadline moved out and reminders are paused.`,
  released: `The vault was released to ${s.cfg.beneficiaryName}${s.snap.agent ? ` and ${s.snap.agent.name} was shut down` : ""}. This is final.`,
  closed: `The owner closed the vault.`,
});

const AGENT_LABEL: Record<AgentState, string> = {
  none: "No agent", active: "Working", frozen_owner: "FROZEN", frozen_guardian: "FROZEN", frozen_lapsed: "FROZEN", stopped: "Shut down",
};
const FROZEN_WHY = (s: SimState, st: AgentState): string =>
  st === "frozen_lapsed" ? `${s.cfg.ownerName} has been silent past the deadline, so the contract froze it. A check-in unfreezes it right away.`
  : st === "frozen_guardian" ? `A guardian froze it because ${s.cfg.ownerName} is overdue. Any owner action clears this.`
  : `${s.cfg.ownerName} froze it with the kill-switch. It stays frozen until ${s.cfg.ownerName} unfreezes it.`;

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (t: number) => { const d = new Date(t); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, "0")}:00`; };

function Feed({ items }: { items: FeedItem[] }) {
  return (
    <div className="chat">
      {items.map((f) => {
        const when = short(f.t);
        const steps = f.steps && f.steps.length > 0 && (
          <details><summary>What happens next</summary><ul>{f.steps.map((x, i) => <li key={i}>{x}</li>)}</ul></details>
        );
        if (f.kind === "you") {
          return (
            <div key={f.id} className="msg me"><div className="bub"><div className="who"><b>You</b><span>{when}</span></div>{f.title}{f.body && <p className="mut">{f.body}</p>}{steps}</div></div>
          );
        }
        if (f.kind === "agent") {
          return (
            <div key={f.id} className={`msg ${f.urgent ? "urgent" : ""}`}>
              <span className="mini-av"><Mark size={18} /></span>
              <div className="bub">
                <div className="who"><b>{BRAND.name} assistant</b><span>{when}</span></div>
                <div>{f.title}</div>
                {f.body && <p className="mut" style={{ marginTop: 2 }}>{f.body}</p>}
                {steps}
              </div>
            </div>
          );
        }
        return (
          <div key={f.id} className={`evt ${f.urgent ? "bad" : f.kind === "chain" ? "" : "sys"}`}>
            <b>{f.title}</b> <span className="dim">· {when}{f.kind === "chain" ? " · contract" : ""}</span>
            {f.body && <div>{f.body}</div>}
            {steps}
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const [s, setS] = useState<SimState | null>(null);
  const [wallet, setWallet] = useState(false);
  const [all, setAll] = useState(false);

  useEffect(() => { setS(loadSim() ?? initSim()); }, []);
  useEffect(() => { if (s) saveSim(s); }, [s]);

  const apply = (f: (x: SimState) => SimState) => setS((x) => (x ? f(x) : x));
  const st = s ? statusOf(s) : "active";
  const sug = useMemo(() => (s ? nextSuggestion(s) : null), [s]);

  if (!s || !sug) return <main className="wrap"><p className="mut" style={{ padding: 20 }}>Loading simulation…</p></main>;

  const cd = countdownTarget(s);
  const a = anchor(s.snap);
  const av = agentView(s);
  const handed = s.snap.handover;
  const over = st === "released" || st === "closed";
  const frozen = !!av && av.state.startsWith("frozen");
  const acfg = s.cfg.agent;
  const firstG = s.cfg.guardians[0]!;
  const late = s.now > expiry(s.snap);
  const hot = st !== "active" && st !== "paused";
  const ge = graceEnd(s.snap);
  const tone = hot && !over && !frozen ? "hot" : "";
  const pillTone = over ? "" : frozen ? "cold" : hot ? "warn" : "ok";

  return (
    <main className="wrap">
      <div className="app">
        <div className="app-head">
          <h2>{s.cfg.ownerName}&apos;s guardian{handed ? ` → ${handed.toName}` : ""}</h2>
          <SimBanner text="Simulated time, funds and messages. Nothing touches a chain." />
        </div>

        <div className="dash">
          <div className="stack" style={{ gap: 14 }}>
            <section className={`glass pad-l stack ${tone}`} aria-label="Countdown" style={{ gap: 14 }}>
              <div className="row between">
                <span className="lbl">{s.vaultStable.toLocaleString()} USD in the vault · fake</span>
                <span className={`pill ${pillTone}`}>{STATUS_LABEL[st]}</span>
              </div>
              <div className="stack" style={{ gap: 6 }}>
                <div className={`countdown ${over ? "" : frozen ? "cold" : hot ? "warn" : ""}`} data-testid="countdown">{cd.at !== null ? formatCountdown(cd.at - s.now) : st === "released" ? "Released" : st === "closed" ? "Closed" : "now"}</div>
                <p className="mut">{cd.label}</p>
              </div>
              <Timeline
                startMs={a} now={s.now} intervalMs={s.snap.intervalMs} graceMs={s.snap.graceMs} challengeMs={s.snap.challengeMs}
                freezeAt={av && av.state !== "stopped" ? av.cutoff : null}
                labels={{ due: short(expiry(s.snap)), grace: short(ge), challenge: short(ge + s.snap.challengeMs) }}
              />
              <div className="btns">
                <button className="btn primary" onClick={() => apply(ownerCheckIn)} disabled={over}>I&apos;m here · check in</button>
                <button className="btn" onClick={() => apply((x) => pauseVault(x, 14))} disabled={over}>Vacation 14d</button>
              </div>
            </section>

            {(av || handed) && (
              <section className={`glass pad-l stack ${frozen ? "cold" : ""}`} aria-label="AI agent" style={{ gap: 16 }}>
                {av && acfg ? (
                  <>
                    <div className="row between">
                      <span className="sect-t">{av.name}</span>
                      <span className={`pill ${frozen ? "cold" : av.state === "active" ? "ok" : ""}`} data-testid="agent-state">{AGENT_LABEL[av.state]}</span>
                    </div>
                    <div className="agent">
                      <Gauge value={av.perPeriod ? av.remaining / av.perPeriod : 0} state={frozen ? "frozen" : av.state === "stopped" ? "stopped" : "active"}>
                        <b>{fmtAmount(av.asset, av.remaining)}</b>
                        <span>left of {fmtAmount(av.asset, av.perPeriod)}</span>
                      </Gauge>
                      <dl className="kv" style={{ margin: 0 }}>
                        <dt>Per payment</dt><dd>max {fmtAmount(av.asset, av.perTx)}</dd>
                        <dt>Budget</dt><dd>{av.resetsAt ? `resets ${short(av.resetsAt)}` : "per " + (acfg.periodDays === 1 ? "day" : "week")}</dd>
                      </dl>
                    </div>
                    <div className="tags"><span className="xs dim" style={{ alignSelf: "center" }}>Pays only</span>{av.recipients.map((r) => <span className="tag" key={r}>{r}</span>)}</div>
                    {frozen && <p className="frostbar" data-testid="frozen-why">{FROZEN_WHY(s, av.state)}</p>}
                    {!frozen && av.state === "active" && late && <p className="note">Owner is late: it will freeze after {short(av.cutoff)}.</p>}
                    <div className="stack" style={{ gap: 8 }}>
                      <span className="xs dim">Simulate the AI</span>
                      <div className="btns">
                        <button className="btn sm" disabled={over} onClick={() => apply((x) => agentPay(x, acfg.recipients[0] ?? "Acme Cloud", Math.min(20, acfg.perTx)))}>Pays {acfg.recipients[0]} {fmtAmount(av.asset, Math.min(20, acfg.perTx))}</button>
                        <button className="btn sm" disabled={over} onClick={() => apply((x) => agentPay(x, acfg.recipients[0] ?? "Acme Cloud", acfg.perTx * 10))}>Tries {fmtAmount(av.asset, acfg.perTx * 10)}</button>
                        <button className="btn sm" disabled={over} onClick={() => apply((x) => agentPay(x, "Scam LLC", 10))}>Tries unknown payee</button>
                      </div>
                    </div>
                    <div className="btns">
                      {s.snap.agent?.ownerFrozen
                        ? <button className="btn sm primary" disabled={over} onClick={() => apply((x) => ownerFreeze(x, false))}>Unfreeze {av.name}</button>
                        : <button className="btn sm cold" disabled={over || frozen} onClick={() => apply((x) => ownerFreeze(x, true))}>Freeze {av.name} (kill-switch)</button>}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="row between"><span className="sect-t">{handed?.agentName ?? "Agent"}</span><span className="pill">Handed over</span></div>
                    <p className="mut">The vault and its funds now belong to <b style={{ color: "var(--text)" }}>{handed?.toName}</b>, the successor {s.cfg.ownerName} named in advance. {handed?.agentName ?? "The agent"} has no permissions until {handed?.toName} authorises one again.</p>
                  </>
                )}
              </section>
            )}

            <section className="glass pad-l stack" aria-label="Guided story" style={{ gap: 12 }}>
              <span className="sect-t">What&apos;s happening</span>
              <p>{STATUS_EXPLAIN(s)[st]}</p>
              <p className="mut">{sug.hint}</p>
              <div className="btns">
                <button className="btn primary" onClick={() => apply(sug.run)}>{sug.label} →</button>
                {sug.alt && <button className="btn" onClick={() => apply(sug.alt!.run)}>{sug.alt.label}</button>}
                {sug.alts?.map((a) => <button key={a.label} className="btn" onClick={() => apply(a.run)}>{a.label}</button>)}
              </div>
            </section>
          </div>

          <div className="stack" style={{ gap: 14 }}>
            <section className="glass pad-l stack" aria-label="Guardians" style={{ gap: 12 }}>
              <div className="row between">
                <span className="sect-t">Guardians</span>
                <span className="pill">{s.snap.approvedBy.length} of {s.snap.threshold} approved</span>
              </div>
              <div className="gl">
                {s.cfg.guardians.map((g) => {
                  const voted = s.snap.approvedBy.includes(g.id);
                  return (
                    <div className="g" key={g.id}>
                      <span className={`av ${voted ? "on" : ""}`}>{g.name.slice(0, 1).toUpperCase()}</span>
                      <span className="stack" style={{ gap: 0 }}><span>{g.name}</span><span className="xs dim">{voted ? "approved" : "waiting"}</span></span>
                      {s.cfg.agent ? (
                        <span className="row" style={{ gap: 6 }}>
                          <button className="btn sm" disabled={over || voted || st === "challenge" || st === "executable" || !s.cfg.agent.successorName} onClick={() => apply((x) => guardianApprove(x, g.id, "handover"))}>Hand over</button>
                          <button className="btn sm" disabled={over || voted || st === "challenge" || st === "executable"} onClick={() => apply((x) => guardianApprove(x, g.id, "release"))}>Shut down</button>
                        </span>
                      ) : (
                        <button className="btn sm" disabled={over || voted || st === "challenge" || st === "executable"} onClick={() => apply((x) => guardianApprove(x, g.id))}>Approve</button>
                      )}
                    </div>
                  );
                })}
              </div>
              {av && (
                <div className="btns">
                  <button className="btn sm cold" disabled={over || !late || s.snap.agent?.guardianFrozenEpoch === s.snap.epoch} onClick={() => apply((x) => guardianFreeze(x, firstG.id))}>Freeze {av.name} ({firstG.name})</button>
                </div>
              )}
              <p className="xs dim">
                Voting opens {short(ge)} (deadline + grace); the contract rejects earlier votes. {s.cfg.agent
                  ? <>Outcomes are fixed by the owner: <b style={{ color: "var(--mut)" }}>Hand over</b> → {s.cfg.agent.successorName || "none named"}, <b style={{ color: "var(--mut)" }}>Shut down</b> → funds to {s.cfg.beneficiaryName}.</>
                  : <>Beneficiary: <b style={{ color: "var(--mut)" }}>{s.cfg.beneficiaryName}</b> (fixed by the owner).</>}
              </p>
              <div className="btns" style={{ alignItems: "center" }}>
                <button className="btn sm primary" onClick={() => apply(executeRelease)} disabled={over}>{s.snap.pendingOutcome === "handover" ? "Execute handover" : "Execute release"}</button>
                <span className="xs dim">anyone can call it, once the window ends</span>
              </div>
            </section>

            <section className="glass pad-l stack" aria-label="Activity" style={{ gap: 14 }}>
              <div className="row between"><span className="sect-t">Activity</span><span className="xs dim">assistant + contract events</span></div>
              <Feed items={s.feed.slice(0, all ? 40 : 8)} />
              {s.feed.length > 8 && <button className="btn sm ghost seeall" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show ${Math.min(40, s.feed.length) - 8} older`}</button>}
            </section>

            <section className="glass pad-l" aria-label="Real chain (optional)">
              <details className="opt" open={wallet} onToggle={(e) => setWallet((e.target as HTMLDetailsElement).open)}>
                <summary className="row between" style={{ cursor: "pointer", listStyle: "none" }}><span className="sect-t">Real chain · optional</span><span className="xs dim">{wallet ? "hide" : "show"}</span></summary>
                <div style={{ marginTop: 12 }}>{wallet && <WalletPanel />}</div>
              </details>
            </section>
            <p className="xs dim"><Link href="/setup" style={{ textDecoration: "underline" }}>Re-run setup</Link> · {BRAND.name} MVP · unaudited · simulation</p>
          </div>
        </div>
      </div>

      <div className="dock" aria-label="Fast-forward time">
        <div className="glass">
          <div className="row between wrapflex" style={{ gap: 8 }}>
            <span className="badge sim"><i />Demo time · {short(s.now)} UTC</span>
            <div className="row" style={{ gap: 6 }}>
              {[["+1 h", HOUR], ["+1 d", DAY], ["+7 d", 7 * DAY], ["+30 d", 30 * DAY]].map(([l, ms]) => (
                <button key={l as string} className="btn sm" onClick={() => apply((x) => advanceBy(x, ms as number))} disabled={over}>{l}</button>
              ))}
              <button className="btn sm ghost" onClick={() => apply((x) => initSim(x.cfg))}>Reset</button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
