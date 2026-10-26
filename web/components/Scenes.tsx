/** Per-section product animations (HTML + CSS, 9 s loops, keyframes in app/motion.css). Base styles = final state. */
const Bar = ({ t }: { t: string }) => <div className="win-bar"><i /><i /><i /><span>{t}</span></div>;
const R = 62;
const Ring = ({ cls, color = "var(--accent)", off = 35 }: { cls?: string; color?: string; off?: number }) => (
  <svg viewBox="0 0 160 160" aria-hidden>
    <circle cx="80" cy="80" r={R} fill="none" stroke="var(--track)" strokeWidth="11" />
    <circle className={cls} cx="80" cy="80" r={R} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" pathLength="100" strokeDasharray="100 100" strokeDashoffset={off} transform="rotate(-90 80 80)" />
  </svg>
);

export function SceneBudget() {
  return (
    <div className="win sc" aria-hidden>
      <Bar t="Atlas · budget" />
      <div className="sc-body sc-split">
        <div className="sc-gauge">
          <Ring cls="s1-ring" />
          <div className="sc-mid"><span className="stk"><b className="s1-n0">$200</b><b className="s1-n1">$170</b><b className="s1-n2">$130</b></span><span className="xs dim">left today</span></div>
        </div>
        <ul className="sc-list">
          <li className="s1-r1"><span>Acme Cloud</span><span>−$30</span><em className="ok">Paid</em></li>
          <li className="s1-r2"><span>Datafeed Inc</span><span>−$40</span><em className="ok">Paid</em></li>
          <li className="s1-r3 bad"><span>Scam LLC</span><span>−$10</span><em className="bad">Refused</em></li>
        </ul>
      </div>
    </div>
  );
}

export function SceneCheckIn() {
  return (
    <div className="win sc" aria-hidden>
      <Bar t="Ada · check-in" />
      <div className="sc-body">
        <div className="stk-l"><span className="xs dim">Next check-in due in</span>
          <span className="stk big-t"><b className="s2-t0">30d 00h</b><b className="s2-t1">6d 03h</b><b className="s2-t2">30d 00h</b></span></div>
        <div className="sc-track"><i className="s2-bar" /></div>
        <div className="row between">
          <span className="btn primary s2-btn">I&apos;m here · check in</span>
          <span className="xs s2-toast accent">Clock reset. Atlas keeps working.</span>
        </div>
      </div>
    </div>
  );
}

export function SceneFreeze() {
  return (
    <div className="win sc" aria-hidden>
      <Bar t="Atlas · status" />
      <div className="sc-body">
        <div className="sc-tl">
          <div className="sc-tlt"><i className="s3-fill" /><i className="s3-now" /></div>
          <div className="sc-tll"><span>Interval</span><span>Grace</span><span>Challenge</span></div>
        </div>
        <div className="sc-card s3-card">
          <div className="row between">
            <b className="sect-t">Atlas</b>
            <span className="stk"><span className="pill ok s3-p0">Working</span><span className="pill cold s3-p1">Frozen</span></span>
          </div>
          <span className="stk"><span className="s3-m0">Payments are allowed inside the budget.</span><span className="s3-m1">Ada is overdue. Every payment is refused.</span></span>
        </div>
      </div>
    </div>
  );
}

export function SceneVote() {
  return (
    <div className="win sc" aria-hidden>
      <Bar t="Guardians · 2 approvals needed" />
      <div className="sc-body">
        <div className="row between"><span className="stk"><b className="sect-t s4-c0">0 of 2 approved</b><b className="sect-t s4-c1">1 of 2 approved</b><b className="sect-t s4-c2">2 of 2 approved</b></span><span className="xs dim">Vote: Hand over</span></div>
        <div className="sc-gl">
          {[["B", "Bola", "s4-b1"], ["C", "Chidi", "s4-b2"], ["D", "Dayo", ""]].map(([l, n, c]) => (
            <div key={n} className="sc-g"><i className={`sc-av ${c}`}>{l}</i><span>{n}</span></div>
          ))}
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <div className="sc-track"><i className="s4-ch" /></div>
          <div className="row between xs"><span className="dim">Challenge window · Ada can still cancel</span><span className="s4-ready accent">Ready to execute</span></div>
        </div>
      </div>
    </div>
  );
}

export function SceneOutcome() {
  return (
    <div className="win sc" aria-hidden>
      <Bar t="Outcome · set by Ada in advance" />
      <div className="sc-body">
        <div className="sc-opt s5-a">
          <div className="stack" style={{ gap: 2 }}><b className="sect-t">Hand over</b><span className="xs dim">Vault and funds go to Tunde, the successor</span></div>
          <span className="stk r"><b className="s5-v0 mut">$1,180</b><b className="s5-v1 accent">Done</b></span>
        </div>
        <div className="sc-opt s5-b">
          <div className="stack" style={{ gap: 2 }}><b className="sect-t">Shut down</b><span className="xs dim">Agent stops, funds return to Emeka</span></div>
          <b className="mut">$1,180</b>
        </div>
        <span className="xs accent s5-done">Handed over to Tunde. Atlas has no access.</span>
      </div>
    </div>
  );
}
