import Link from "next/link";
import HeroProduct from "@/components/HeroProduct";
import { Wordmark } from "@/components/Logo";
import { SceneBudget, SceneCheckIn, SceneFreeze, SceneOutcome, SceneVote } from "@/components/Scenes";
import { DashPreview, PhonePreview } from "@/components/Previews";
import SimBanner from "@/components/SimBanner";
import { BRAND } from "@/lib/brand";

const FEATURES: { title: string; body: string; points: string[]; scene: React.ReactNode }[] = [
  {
    title: "Give your agent a budget",
    body: "Your AI agent pays from a vault, not from your wallet. You decide how much, to whom and in what.",
    points: ["A cap per payment and a cap per day, per token", "A short list of payees it may pay, nobody else", "You can pause, change or replace the agent any time"],
    scene: <SceneBudget />,
  },
  {
    title: "You check in. That's the only chore",
    body: "One tap resets the clock. While you keep checking in, the agent just works.",
    points: ["Reminders by chat, getting louder only if needed", "A vacation mode that expires by itself", "The agent paying is never counted as you being alive"],
    scene: <SceneCheckIn />,
  },
  {
    title: "Silence freezes it",
    body: "Miss your check-in and the agent stops spending when the grace period ends. Not later, not maybe: the contract enforces it.",
    points: ["You choose: freeze at the deadline, or at the end of grace", "Any guardian can freeze it sooner once you are overdue", "If you come back, one check-in unfreezes it"],
    scene: <SceneFreeze />,
  },
  {
    title: "Guardians vote",
    body: "People you chose, say two of three, decide what happens to a frozen agent. They can't spend a cent themselves.",
    points: ["Voting only opens after the deadline plus grace", "Then a challenge window: your check-in cancels everything", "Even if all guardians collude, they can't pick a new destination"],
    scene: <SceneVote />,
  },
  {
    title: "Hand over, or shut down",
    body: "Two outcomes, both written by you in advance. Guardians only choose between them.",
    points: ["Hand over: the vault and its funds go to your named successor", "Shut down: the agent stops for good and funds go to your beneficiary", "No admin key, no upgrade, no company in the middle"],
    scene: <SceneOutcome />,
  },
];

const WHY = [
  ["The agent's key leaks", "It can still only pay allowed payees, up to the daily cap. You replace the key in one transaction."],
  ["Hidden instructions fool the agent", "A prompt-injected agent that tries to pay an attacker hits the allowlist and is refused, and you are told."],
  ["The agent's code has a bug", "A loop that tries to spend everything runs into the per-payment and per-day caps."],
  ["You disappear", "The agent freezes by itself. Nothing keeps spending unattended, and nothing is stuck forever."],
];
const FAQ = [
  ["Does Custos hold my keys or funds?", "No. Each owner gets a small contract of their own. We never see keys or seed phrases, and nothing in this project asks for them."],
  ["What stops my AI agent from draining the vault?", "The contract. It refuses any payment above the per-payment or per-day cap, to anyone not on your list, or while frozen. The agent's own software has no say."],
  ["Can the AI model decide to unfreeze, or move funds?", "No. An AI model, if configured, only writes the wording of the messages you receive. Every decision comes from deterministic code and the contract."],
  ["What happens if I forget to check in?", "You get reminders first. After the deadline the agent freezes when grace ends. Guardians can then vote, after which a challenge window lets you cancel with one check-in."],
  ["Can guardians steal?", "They can't send funds anywhere. They can freeze an overdue agent and vote between the two outcomes you set: hand over to your successor, or return funds to your beneficiary."],
  ["Is this live?", "No. This is an unaudited MVP and the demo is a browser simulation with fake time, funds and AI. Nothing is deployed to a live network and there is no token."],
  ["Why Robinhood Chain?", "It is the chain this prototype is designed around: an Arbitrum-style L2 where deadlines use block timestamps only. Everything here has been tested locally only."],
];

const STATS = [
  ["$200", "a day. The most Atlas can ever spend, enforced by the contract."],
  ["2 of 3", "guardians must agree before anything happens to a frozen agent."],
  ["0", "admin keys. Nobody, including us, can override your rules."],
  ["1 tap", "is all it takes to prove you are still here."],
];

export default function Landing() {
  return (
    <main>
      <div className="wrap">
        <section className="hero">
          <h1>A guardian for your AI agent.</h1>
          <p className="lead">Give your agent a budget it can&apos;t exceed. If you go silent, it freezes and people you trust decide what happens next.</p>
          <div className="btns">
            <Link href="/dashboard" className="btn primary lg">Try the demo</Link>
            <Link href="/setup" className="btn lg">Set up your agent</Link>
          </div>
          <div className="hero-stage"><HeroProduct /></div>
        </section>

        <section className="sec" style={{ paddingTop: 72 }} aria-label="Key numbers">
          <div className="stats">
            {STATS.map(([n, t]) => (<div className="stat" key={n}><span className="n">{n}</span><p>{t}</p></div>))}
          </div>
        </section>

        <section className="sec" id="product">
          <div className="sec-head">
            <span className="eyebrow">The product</span>
            <h2>One screen tells the whole story.</h2>
            <p>Countdown, budget, guardians and a plain-language activity feed. Here, Ada has been silent for a week and the guardians have already voted.</p>
          </div>
          <DashPreview />
        </section>

        <section className="sec" id="how">
          <div className="sec-head">
            <span className="eyebrow">How it works</span>
            <h2>From &ldquo;go do your job&rdquo; to &ldquo;I&apos;m gone&rdquo;, in five steps.</h2>
            <p>Every step is enforced by a contract. The demo runs exactly this, with fake money and fake time.</p>
          </div>
          <div className="stack" style={{ gap: 56 }}>
            {FEATURES.map((f, i) => (
              <article key={f.title} className={`feature ${i % 2 ? "rev" : ""}`}>
                <div className="txt">
                  <span className="xs dim">Step {i + 1} of 5</span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                  <ul className="points" style={{ padding: 0 }}>{f.points.map((p) => <li key={p}>{p}</li>)}</ul>
                </div>
                <div className="vis">{f.scene}</div>
              </article>
            ))}
          </div>
        </section>

        <section className="sec" id="alerts">
          <article className="feature rev" style={{ borderTop: 0, paddingTop: 0 }}>
            <div className="txt">
              <span className="eyebrow">Reminders</span>
              <h3>Messages that get louder only when needed.</h3>
              <p>A gentle nudge first, a clear warning before the deadline, plain words if the agent freezes. Every message says what happened and what to do.</p>
              <ul className="points" style={{ padding: 0 }}>
                <li>Chat reminders you can answer with one tap</li>
                <li>Guardians are told when you are overdue, never before</li>
                <li>An AI model only helps with wording; it never decides anything</li>
              </ul>
            </div>
            <div className="vis"><PhonePreview /></div>
          </article>
        </section>

        <section className="sec" id="why">
          <div className="sec-head">
            <span className="eyebrow">Why on-chain limits</span>
            <h2>Trust is a bad guardrail. A contract isn&apos;t.</h2>
            <p>Agents get hacked, tricked and misconfigured. So the limits can&apos;t live inside the agent, or in a service you have to trust.</p>
          </div>
          <div className="cmp">
            <div className="glass col">
              <h3>If you trust the agent</h3>
              {WHY.map(([a]) => <div className="rowi" key={a}><b>{a}</b><span>Everything it can reach is at risk.</span></div>)}
            </div>
            <div className="glass col inv">
              <h3>With Custos</h3>
              {WHY.map(([a, b]) => <div className="rowi" key={a}><b>{a}</b><span>{b}</span></div>)}
            </div>
          </div>
        </section>

        <section className="sec" id="roles">
          <div className="sec-head">
            <span className="eyebrow">Who does what</span>
            <h2>What the AI does, and what code does.</h2>
            <p>The AI is useful and never in charge. Anything that moves money or time is plain code you can read.</p>
          </div>
          <div className="split">
            <div className="glass col">
              <span className="badge"><i />The AI</span>
              <h3 style={{ fontSize: "var(--t-lg)" }}>Works and talks</h3>
              <p>Your agent does its job and asks to pay. The check-in assistant, optionally using a language model, writes friendly wording for the messages you receive.</p>
              <div className="tags"><span className="tag">asks to pay</span><span className="tag">writes message wording</span><span className="tag">explains what happened</span></div>
            </div>
            <div className="glass col inv">
              <span className="badge"><i />The code</span>
              <h3 style={{ fontSize: "var(--t-lg)" }}>Decides everything else</h3>
              <p>Limits, allowlists, deadlines, the freeze, who may vote and where funds can go. Deterministic, tested, and the same whether or not any AI is online.</p>
              <div className="tags"><span className="tag">per-payment and daily caps</span><span className="tag">allowlist</span><span className="tag">auto-freeze</span><span className="tag">votes and timers</span><span className="tag">destinations</span></div>
            </div>
          </div>
        </section>

        <section className="sec" id="limits">
          <div className="sec-head">
            <span className="eyebrow">Honest limits</span>
            <h2>What Custos does not do.</h2>
            <p>Safety tooling should be clear about its edges.</p>
          </div>
          <div className="limits">
            {[
              ["Bounded loss, not zero loss", "A leaked agent key can still spend up to one period's budget, to your allowed payees. Pick small budgets."],
              ["It can't judge intent", "If an allowed payee is itself compromised, or the agent overpays a real vendor within limits, the contract can't tell."],
              ["Unaudited MVP", "Tested with unit, fuzz and local-chain tests only. Don't put real value in it before an independent audit."],
              ["Simulation only", "This site runs in your browser with fake time, funds and AI. Nothing is deployed to any network."],
              ["Monitoring is a mock", "The assistant reads a simulated agent's activity. A real activity feed is not built yet."],
              ["Not legal advice", "It's not a will. Inheritance and tax law still apply, and there is no token."],
            ].map(([t, d]) => (
              <div key={t}><h3>{t}</h3><p>{d}</p></div>
            ))}
          </div>
        </section>

        <section className="sec" id="faq">
          <div className="sec-head"><span className="eyebrow">FAQ</span><h2>Questions, answered plainly.</h2></div>
          <div className="faq">
            {FAQ.map(([q, a]) => (
              <details key={q}><summary>{q}</summary><p>{a}</p></details>
            ))}
          </div>
        </section>

        <section className="sec">
          <div className="cta">
            <h2>See it freeze in under a minute.</h2>
            <p>Fast-forward time in the demo and watch the agent spend, get stopped, freeze and hand over.</p>
            <div className="btns">
              <Link href="/dashboard" className="btn primary lg">Open the demo</Link>
              <Link href="/setup" className="btn lg">Set up your agent</Link>
            </div>
            <SimBanner text="Fake time, funds and AI. Nothing is on-chain." />
          </div>
        </section>

        <footer className="foot">
          <div className="row between wrapflex" style={{ gap: 20, alignItems: "flex-start" }}>
            <div className="stack" style={{ gap: 10 }}>
              <Wordmark />
              <span>{BRAND.tagline}</span>
            </div>
            <div className="cols">
              <Link href="/dashboard">Demo</Link><Link href="/setup">Set up</Link><a href="#how">How it works</a><a href="#faq">FAQ</a>
            </div>
          </div>
          <p style={{ maxWidth: "80ch" }}>{BRAND.name} is an experimental, unaudited open-source security prototype designed for Robinhood Chain. Simulation mode uses fake funds, fake time and a fake AI agent. Not legal or financial advice. There is no token, and nothing here promises a price or return.</p>
        </footer>
      </div>
    </main>
  );
}
