import Link from "next/link";
import HeroDemo from "@/components/HeroDemo";
import { Wordmark } from "@/components/Logo";
import { BRAND } from "@/lib/brand";
import { DEPLOY, addrUrl } from "@/lib/live/config";

const REPO = "https://github.com/catalystberry842-alt/custos";

const STEPS = [
  ["Fund a small vault", "You put in a little money and set the rules: a cap per payment, a cap per hour, and a short list of people the agent may pay."],
  ["The agent proposes, the firewall checks", "Every payment is first simulated on the real chain, then checked against your rules. Hidden instructions and unlimited approvals are refused."],
  ["Only approved payments are signed", "Small payments to people on your list go through. Larger ones wait for your signature. The contract enforces the caps either way."],
  ["Go silent and it freezes", "Check in now and then. If you stop, the agent freezes by itself, and guardians you chose decide what happens next."],
];

const CONTRACTS: [string, string, string][] = [
  ["Factory", DEPLOY.factory, "Creates a vault for any wallet. Source verified on the explorer."],
  ["Demo vault", DEPLOY.demoVault, "The vault the demo above pays from."],
  ["Demo agent", DEPLOY.agent, "A throwaway testnet key. It can only call this vault's spend function."],
];

const FAQ = [
  ["Does Custos hold my keys or funds?", "No. Each owner gets a small contract of their own. Custos never sees a key or seed phrase, and nothing here asks for one."],
  ["What stops my agent from draining the vault?", "Two layers. The firewall refuses anything outside your rules before the agent signs. Behind it, the contract itself refuses any payment over the caps, to anyone not on your list, or while frozen."],
  ["Can the AI model decide to unfreeze or move funds?", "No. Decisions come from plain code and the contract. A model, if you use one, never has a say."],
  ["What happens if I forget to check in?", "After the deadline and a grace period the agent freezes. Guardians can then vote between two outcomes you wrote in advance, and your next check-in cancels it."],
  ["What is real in the demo?", "The vault, the node simulation and the payment are real, on Robinhood Chain testnet with test ETH. The firewall rules run on our server, not on-chain. The Simulation pages use fake money and fake time."],
  ["Is it audited? Is there a token?", "It is an unaudited prototype on testnet only. Nothing is deployed to mainnet and there is no token."],
];

export default function Landing() {
  return (
    <main>
      <div className="wrap">
        <section className="hero">
          <h1>Your AI agent can spend. It can&apos;t drain you.</h1>
          <p className="lead">Give it a small budget and a short list of people it may pay. Anything else is refused before it moves.</p>
          <HeroDemo />
        </section>

        <section className="sec" id="difference" aria-labelledby="diff-h">
          <div className="sec-head">
            <h2 id="diff-h">A postcard, or a sealed envelope.</h2>
            <p>Most agents send instructions anyone can read and change. With Custos the rules are sealed in a contract the agent cannot open.</p>
          </div>
          <div className="vs">
            <div className="glass vs-c no">
              <div className="vs-k"><h3>Without Custos</h3><span className="xs mut">A postcard: open to anyone who handles it</span></div>
              <ul className="vs-l">
                <li>The agent holds a key that can move everything in the wallet.</li>
                <li>One hidden line on a web page can tell it to send funds to a stranger.</li>
                <li>A bug or a loop can spend it all in minutes.</li>
                <li>If you disappear, it keeps spending.</li>
              </ul>
            </div>
            <div className="glass vs-c yes">
              <div className="vs-k"><h3>With Custos</h3><span className="xs mut">A sealed envelope: only what you wrote gets through</span></div>
              <ul className="vs-l">
                <li>The agent spends from a small vault, never more than the cap you set.</li>
                <li>It can pay only people on your list. Anyone else is refused before it signs.</li>
                <li>A loop hits the cap and the call limit, and stops.</li>
                <li>Miss your check-in and it freezes by itself.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="sec" id="how" aria-labelledby="how-h">
          <div className="sec-head"><h2 id="how-h">How it works</h2></div>
          <ol className="steps">
            {STEPS.map(([t, d], i) => (<li key={t}><span className="steps-n">{i + 1}</span><div><b>{t}</b><p>{d}</p></div></li>))}
          </ol>
        </section>

        <section className="sec" id="contracts" aria-labelledby="ct-h">
          <div className="sec-head">
            <h2 id="ct-h">Contracts on Robinhood Chain testnet</h2>
            <p>Chain {DEPLOY.chainId}, test ETH only. Every address and transaction is on the <a className="lv-link" href={DEPLOY.explorer} target="_blank" rel="noreferrer noopener">explorer</a>.</p>
          </div>
          <div className="glass ct">
            {CONTRACTS.map(([n, a, d]) => (
              <div className="ct-r" key={a}>
                <div><b>{n}</b><span className="xs mut">{d}</span></div>
                <a className="lv-link mono" href={addrUrl(a)} target="_blank" rel="noreferrer noopener" title={a}>{a.slice(0, 10)}…{a.slice(-8)} ↗</a>
              </div>
            ))}
          </div>
          <p className="xs mut">Full list of transactions and what is on-chain versus off-chain: <a className="lv-link" href={`${REPO}/blob/master/docs/testnet.md`} target="_blank" rel="noreferrer noopener">docs/testnet.md</a>.</p>
        </section>

        <section className="sec" id="faq" aria-labelledby="faq-h">
          <div className="sec-head"><h2 id="faq-h">Questions</h2></div>
          <div className="faq">
            {FAQ.map(([q, a]) => (<details key={q}><summary>{q}</summary><p>{a}</p></details>))}
          </div>
        </section>

        <footer className="foot">
          <div className="row between wrapflex" style={{ gap: 20, alignItems: "flex-start" }}>
            <div className="stack" style={{ gap: 10 }}>
              <Wordmark />
              <span>{BRAND.tagline}</span>
            </div>
            <div className="cols">
              <Link href="/live">Live app</Link><Link href="/firewall">Firewall simulation</Link><Link href="/dashboard">Dashboard simulation</Link><Link href="/setup">Set up</Link>
              <a href={REPO} target="_blank" rel="noreferrer noopener">GitHub</a><a href={`${REPO}/blob/master/docs/testnet.md`} target="_blank" rel="noreferrer noopener">Docs</a>
            </div>
          </div>
          <p style={{ maxWidth: "80ch" }}>{BRAND.name} is an experimental, unaudited open-source prototype for Robinhood Chain. The live app uses testnet ETH. The simulation pages use fake funds and fake time. Not legal or financial advice. There is no token, and nothing here promises a price or return.</p>
        </footer>
      </div>
    </main>
  );
}
