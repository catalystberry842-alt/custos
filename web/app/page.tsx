import Link from "next/link";
import SimBanner from "@/components/SimBanner";

const seg = (w: number, c: string) => ({ flex: w, background: c });

export default function Landing() {
  return (
    <main className="wrap wide">
      <section className="hero">
        <span className="pill hot" style={{ alignSelf: "flex-start" }}>Monad · non-custodial · open source MVP</span>
        <h1>Your crypto shouldn&apos;t<br />die with you.</h1>
        <p>
          Every year, coins vanish because their owner died or lost access and nobody else could ever reach them.
          Heirloom is a dead-man&apos;s switch: keep checking in and nothing changes. Go silent for too long and the
          people you trust can release your vault to the person you chose. No company holds your keys.
        </p>
        <div className="row wrapflex">
          <Link href="/dashboard" className="btn primary">Try the demo →</Link>
          <Link href="/setup" className="btn">Set up a vault</Link>
        </div>
        <SimBanner text="The demo runs entirely in your browser with simulated time and funds." />
      </section>

      <section className="section">
        <span className="label">The timeline</span>
        <div className="tl" aria-hidden>
          <div style={seg(6, "#3a3a40")} /><div style={seg(2, "#7a6330")} /><div style={seg(1.4, "var(--accent)")} /><div style={seg(0.4, "#fff")} />
        </div>
        <div className="tlkey">
          <span><i style={{ background: "#3a3a40" }} />check-in interval</span>
          <span><i style={{ background: "#7a6330" }} />grace period</span>
          <span><i style={{ background: "var(--accent)" }} />challenge window</span>
          <span><i style={{ background: "#fff" }} />release</span>
        </div>
        <div className="steps four">
          {[
            ["1", "Check in", "One tap, any time. It resets the clock and cancels any pending release."],
            ["2", "Reminders escalate", "A Telegram-style agent nudges you, then louder, then alerts your guardians."],
            ["3", "Guardians vote", "Only after interval + grace. N of M must agree. They can't pick the destination."],
            ["4", "Last chance", "A final challenge window. If you come back, one check-in cancels everything."],
          ].map(([n, t, d]) => (
            <div className="step" key={n}>
              <span className="n">{n}</span>
              <div><h3>{t}</h3><p className="mut s">{d}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <span className="label">What can and can&apos;t happen</span>
        <div className="grid2">
          <div className="card stack">
            <h3>Guardians can</h3>
            <div className="can"><span className="accent">✓</span><span className="mut">Vote to release, only after the deadline + grace has passed</span></div>
            <div className="can"><span className="accent">✓</span><span className="mut">Be replaced by you at any time</span></div>
          </div>
          <div className="card stack">
            <h3>Guardians can&apos;t</h3>
            <div className="can"><span className="dim">✕</span><span className="mut">Move funds anywhere but your beneficiary</span></div>
            <div className="can"><span className="dim">✕</span><span className="mut">Act early, even if all of them collude</span></div>
            <div className="can"><span className="dim">✕</span><span className="mut">Stop you cancelling while the window is open</span></div>
          </div>
        </div>
      </section>

      <section className="section">
        <span className="label">Why this design</span>
        <div className="stack mut">
          <p><b style={{ color: "var(--text)", fontWeight: 600 }}>Non-custodial.</b> Each owner gets their own small contract. We never see keys or seed phrases and never ask for them.</p>
          <p><b style={{ color: "var(--text)", fontWeight: 600 }}>No oracle.</b> The deadline is plain block time. The agent only reminds; if it&apos;s down, nothing is released early.</p>
          <p><b style={{ color: "var(--text)", fontWeight: 600 }}>Honest limits.</b> Unaudited MVP. Not legal advice and not a will. Local simulation only: no mainnet deployment, no token.</p>
        </div>
      </section>

      <footer className="section" style={{ paddingBottom: 28 }}>
        <p className="dim s">Heirloom is an experimental open-source prototype for Monad. Simulation mode uses fake funds and fake time. Read the README for security notes and limitations.</p>
      </footer>
    </main>
  );
}
