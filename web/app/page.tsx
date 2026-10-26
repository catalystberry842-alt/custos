import Link from "next/link";
import SimBanner from "@/components/SimBanner";
import { BRAND } from "@/lib/brand";

const seg = (w: number, c: string) => ({ flex: w, background: c });

export default function Landing() {
  return (
    <main className="wrap wide">
      <section className="hero">
        <span className="pill hot" style={{ alignSelf: "flex-start" }}>Robinhood Chain · non-custodial · open source MVP</span>
        <h1>{BRAND.tagline}</h1>
        <p>
          {BRAND.blurb} The allowance is enforced by a contract, not by trust, and no company holds your keys.
        </p>
        <div className="row wrapflex">
          <Link href="/dashboard" className="btn primary">Try the demo →</Link>
          <Link href="/setup" className="btn">Set up your agent</Link>
        </div>
        <SimBanner text="The demo runs entirely in your browser with simulated time, funds and AI." />
      </section>

      <section className="section">
        <span className="label">How it works</span>
        <div className="steps four">
          {[
            ["1", "Give it a budget", "Per-payment and per-day limits, and a list of who it may pay. Enforced on-chain."],
            ["2", "You check in", "One tap. While you are around, the agent works inside its limits."],
            ["3", "Silence freezes it", "Miss your check-in and the agent freezes. Your check-in assistant tells you in plain words."],
            ["4", "Guardians decide", "Hand everything to the successor you named, or shut the agent down and return funds. Never anywhere else."],
          ].map(([n, t, d]) => (
            <div className="step" key={n}>
              <span className="n">{n}</span>
              <div><h3>{t}</h3><p className="mut s">{d}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <span className="label">The timeline</span>
        <div className="tl" aria-hidden>
          <div style={seg(6, "#3a3a40")} /><div style={seg(2, "#7a6330")} /><div style={seg(1.4, "var(--accent)")} /><div style={seg(0.4, "#fff")} />
        </div>
        <div className="tlkey">
          <span><i style={{ background: "#3a3a40" }} />check-in interval · agent works</span>
          <span><i style={{ background: "#7a6330" }} />grace · agent freezes at the end</span>
          <span><i style={{ background: "var(--accent)" }} />challenge window</span>
          <span><i style={{ background: "#fff" }} />handover or shutdown</span>
        </div>
      </section>

      <section className="section">
        <span className="label">What can and can&apos;t happen</span>
        <div className="grid2">
          <div className="card stack">
            <h3>Your AI agent can</h3>
            <div className="can"><span className="accent">✓</span><span className="mut">Pay allowed payees, up to the per-payment and per-day limits</span></div>
            <div className="can"><span className="accent">✓</span><span className="mut">Keep working while you check in</span></div>
            <h3 style={{ marginTop: 6 }}>Your AI agent can&apos;t</h3>
            <div className="can"><span className="dim">✕</span><span className="mut">Exceed its limits or pay anyone else, even if its key leaks or it is tricked by a prompt</span></div>
            <div className="can"><span className="dim">✕</span><span className="mut">Change its own limits, or count as you being alive</span></div>
          </div>
          <div className="card stack">
            <h3>Guardians can</h3>
            <div className="can"><span className="accent">✓</span><span className="mut">Freeze the agent once you are overdue</span></div>
            <div className="can"><span className="accent">✓</span><span className="mut">Vote to hand over to your successor, or shut the agent down, after deadline + grace</span></div>
            <h3 style={{ marginTop: 6 }}>Guardians can&apos;t</h3>
            <div className="can"><span className="dim">✕</span><span className="mut">Send funds anywhere you did not name, even if all of them collude</span></div>
            <div className="can"><span className="dim">✕</span><span className="mut">Stop you from coming back: one check-in unfreezes and cancels</span></div>
          </div>
        </div>
      </section>

      <section className="section">
        <span className="label">Why this design</span>
        <div className="stack mut">
          <p><b style={{ color: "var(--text)", fontWeight: 600 }}>The contract is the guard.</b> The AI is never trusted to behave. Limits and allowlists live in the contract, so a hacked key or a prompt-injected agent can only lose what you allowed it to hold for a day.</p>
          <p><b style={{ color: "var(--text)", fontWeight: 600 }}>Non-custodial, no oracle.</b> Each owner gets their own small contract. Deadlines use block timestamps only (block numbers are an estimate on Robinhood Chain). We never see keys or seed phrases.</p>
          <p><b style={{ color: "var(--text)", fontWeight: 600 }}>The assistant only talks.</b> A deterministic program decides when to message you; an AI model, if configured, only chooses friendly wording. If it is down, nothing moves.</p>
          <p><b style={{ color: "var(--text)", fontWeight: 600 }}>Honest limits.</b> Unaudited MVP. Not legal advice. Also works as plain crypto inheritance: skip the agent step. The demo is a simulation, nothing is deployed to a live network, and there is no token.</p>
        </div>
      </section>

      <footer className="section" style={{ paddingBottom: 28 }}>
        <p className="dim s">{BRAND.name} is an experimental open-source security prototype designed for Robinhood Chain. Simulation mode uses fake funds, fake time and a fake AI agent. Read the README for security notes and limitations.</p>
      </footer>
    </main>
  );
}
