"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import SimBanner from "@/components/SimBanner";
import {
  advanceBy, countdownTarget, DAY, formatCountdown, guardianApprove, HOUR, initSim, loadSim, nextSuggestion,
  ownerCheckIn, pauseVault, saveSim, statusOf, executeRelease, type FeedItem, type SimState,
} from "@/lib/sim";
import { anchor, expiry, graceEnd, type Status } from "@/lib/agent/chainModel";

const WalletPanel = dynamic(() => import("@/components/WalletPanel"), { ssr: false, loading: () => <p className="s dim">Loading wallet tools…</p> });

const STATUS_LABEL: Record<Status, string> = {
  active: "Active", grace: "Overdue · grace", awaiting_guardians: "Guardians may vote", challenge: "Challenge window",
  executable: "Ready to release", paused: "Vacation mode", released: "Released", closed: "Closed",
};
const STATUS_EXPLAIN = (s: SimState): Record<Status, string> => ({
  active: `${s.cfg.ownerName} is checking in on time. Nothing can happen to the vault.`,
  grace: `${s.cfg.ownerName} missed the deadline. Reminders are escalating and guardians have been warned. Nothing is released and guardians cannot vote yet.`,
  awaiting_guardians: `Grace is over. ${s.snap.threshold} of ${s.snap.guardianCount} guardians can now approve a release to ${s.cfg.beneficiaryName}.`,
  challenge: `Enough guardians approved. ${s.cfg.ownerName} can still cancel by checking in. Otherwise the release can execute when the window ends.`,
  executable: `The window is closed. Anyone can now execute the release. ${s.cfg.ownerName} can still cancel until it is executed.`,
  paused: `${s.cfg.ownerName} is on vacation mode. The deadline moved out and reminders are paused.`,
  released: `The vault was released to ${s.cfg.beneficiaryName}. This is final.`,
  closed: `The owner closed the vault.`,
});

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (t: number) => { const d = new Date(t); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, "0")}:00`; };

function Feed({ items }: { items: FeedItem[] }) {
  return (
    <div className="feed">
      {items.map((f) => (
        <div key={f.id} className={`fi ${f.urgent ? "urgent" : ""}`}>
          <div className="h"><b style={{ fontWeight: 600 }}>{f.title}</b><span className="s dim">{short(f.t)}</span></div>
          <span className="kind">{f.kind === "agent" ? "agent message (simulated)" : f.kind === "chain" ? "contract event (simulated)" : f.kind === "you" ? "owner action" : "system"}</span>
          {f.body && <p className="body">{f.body}</p>}
          {f.steps && f.steps.length > 0 && (
            <details><summary>What happens next ▾</summary><ul>{f.steps.map((x, i) => <li key={i}>{x}</li>)}</ul></details>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [s, setS] = useState<SimState | null>(null);
  const [wallet, setWallet] = useState(false);

  useEffect(() => { setS(loadSim() ?? initSim()); }, []);
  useEffect(() => { if (s) saveSim(s); }, [s]);

  const apply = (f: (x: SimState) => SimState) => setS((x) => (x ? f(x) : x));
  const st = s ? statusOf(s) : "active";
  const sug = useMemo(() => (s ? nextSuggestion(s) : null), [s]);

  if (!s || !sug) return <main className="wrap"><p className="mut" style={{ padding: 20 }}>Loading simulation…</p></main>;

  const cd = countdownTarget(s);
  const total = s.snap.intervalMs + s.snap.graceMs + s.snap.challengeMs;
  const a = anchor(s.snap);
  const pos = Math.min(1, Math.max(0, (s.now - a) / total));
  const over = st === "released" || st === "closed";
  const hot = st !== "active" && st !== "paused";

  return (
    <main className="wrap wide">
      <div className="dash cols">
        <div className="stack" style={{ gridColumn: "1 / -1" }}>
          <SimBanner text="Simulated time, simulated funds, simulated messages. Nothing here touches a chain." />
        </div>

        <div className="stack">
          {/* countdown */}
          <section className="card stack" aria-label="Countdown">
            <div className="row between">
              <div>
                <span className="label">{s.cfg.ownerName}&apos;s vault</span>
                <p className="s mut">{s.vaultStable.toLocaleString()} USD stablecoin · fake</p>
              </div>
              <span className={`pill ${hot ? (over ? "solid" : "hot") : ""}`}>{STATUS_LABEL[st]}</span>
            </div>
            <div>
              <div className="count" data-testid="countdown">{cd.at !== null ? formatCountdown(cd.at - s.now) : st === "released" ? "Released" : st === "closed" ? "Closed" : "now"}</div>
              <p className="s mut">{cd.label}</p>
            </div>
            <div className="bar" aria-hidden>
              <div style={{ flex: s.snap.intervalMs, background: "#34343a" }} />
              <div style={{ flex: s.snap.graceMs, background: "#7a6330" }} />
              <div style={{ flex: s.snap.challengeMs, background: "var(--accent)" }} />
              <span className="mark" style={{ left: `calc(${(pos * 100).toFixed(2)}% - 1px)` }} />
            </div>
            <div className="tlkey">
              <span><i style={{ background: "#34343a" }} />interval {s.cfg.intervalDays}d</span>
              <span><i style={{ background: "#7a6330" }} />grace {s.cfg.graceDays}d</span>
              <span><i style={{ background: "var(--accent)" }} />challenge {s.cfg.challengeDays}d</span>
            </div>
            <div className="row wrapflex">
              <button className="btn primary" onClick={() => apply(ownerCheckIn)} disabled={over}>I&apos;m here · check in</button>
              <button className="btn" onClick={() => apply((x) => pauseVault(x, 14))} disabled={over}>Vacation 14d</button>
            </div>
            <p className="s dim">Deadline {short(expiry(s.snap))} · guardians can vote after {short(graceEnd(s.snap))} (sim time)</p>
          </section>

          {/* story */}
          <section className="card stack" aria-label="Guided story">
            <span className="label">What&apos;s happening</span>
            <p>{STATUS_EXPLAIN(s)[st]}</p>
            <p className="s mut">{sug.hint}</p>
            <div className="row wrapflex">
              <button className="btn primary" onClick={() => apply(sug.run)}>{sug.label} →</button>
              {sug.alt && <button className="btn" onClick={() => apply(sug.alt!.run)}>{sug.alt.label}</button>}
            </div>
          </section>

          {/* fast-forward */}
          <section className="card stack" aria-label="Fast-forward time">
            <div className="row between">
              <span className="label">Fast-forward time</span>
              <span className="pill hot">demo only</span>
            </div>
            <p className="s mut">Sim clock: <b style={{ color: "var(--text)" }}>{short(s.now)} UTC</b>. Jumps run the agent hour by hour, so every reminder fires.</p>
            <div className="row wrapflex">
              {[["+1 h", HOUR], ["+1 d", DAY], ["+7 d", 7 * DAY], ["+30 d", 30 * DAY]].map(([l, ms]) => (
                <button key={l as string} className="btn sm" onClick={() => apply((x) => advanceBy(x, ms as number))} disabled={over}>{l}</button>
              ))}
              <button className="btn sm ghost" onClick={() => apply((x) => initSim(x.cfg))}>Reset</button>
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="card stack" aria-label="Guardians">
            <div className="row between">
              <span className="label">Guardians · {s.snap.threshold} of {s.snap.guardianCount}</span>
              <span className="s mut">{s.snap.approvedBy.length} approved</span>
            </div>
            <div className="gl">
              {s.cfg.guardians.map((g) => {
                const voted = s.snap.approvedBy.includes(g.id);
                return (
                  <div className="g" key={g.id}>
                    <span><span className={`dot ${voted ? "on" : ""}`} />{g.name}<span className="s dim"> · {voted ? "approved" : "waiting"}</span></span>
                    <button className="btn sm" disabled={over || voted || st === "challenge" || st === "executable"} onClick={() => apply((x) => guardianApprove(x, g.id))}>Approve</button>
                  </div>
                );
              })}
            </div>
            <p className="s dim">Try approving early: the contract rejects it until deadline + grace. Beneficiary: <b style={{ color: "var(--mut)" }}>{s.cfg.beneficiaryName}</b> (fixed by the owner).</p>
            <div className="row">
              <button className="btn sm primary" onClick={() => apply(executeRelease)} disabled={over}>Execute release</button>
              <span className="s dim">anyone can call, only works after the window</span>
            </div>
          </section>

          <section className="card stack" aria-label="Activity">
            <div className="row between"><span className="label">Activity</span><span className="s dim">agent messages + contract events</span></div>
            <Feed items={s.feed.slice(0, 30)} />
          </section>

          <section className="card" aria-label="Real chain (optional)">
            <details className="opt" open={wallet} onToggle={(e) => setWallet((e.target as HTMLDetailsElement).open)}>
              <summary><span className="label">Real chain · optional</span><span className="s dim">{wallet ? "hide" : "show"}</span></summary>
              <div style={{ marginTop: 10 }}>{wallet && <WalletPanel />}</div>
            </details>
          </section>
          <p className="s dim"><Link href="/setup" style={{ textDecoration: "underline" }}>Re-run setup</Link> · Heirloom MVP · unaudited · simulation</p>
        </div>
      </div>
    </main>
  );
}
