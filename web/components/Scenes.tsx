/** Five small explanatory animations (8 s loops, pure SVG + CSS in app/motion.css). */
const Defs = () => (
  <defs>
    <linearGradient id="sc-g" x1="0" y1="1" x2="1" y2="0"><stop stopColor="var(--signal)" /><stop offset="1" stopColor="var(--signal-2)" /></linearGradient>
  </defs>
);
const Person = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} fill="var(--text)" opacity=".85"><circle cx="0" cy="-5" r="5" /><path d="M-9 9a9 7 0 0 1 18 0z" /></g>
);
const Svg = ({ children, label }: { children: React.ReactNode; label: string }) => (
  <svg viewBox="0 0 400 220" className="sc" role="img" aria-label={label}><Defs />{children}</svg>
);

export function SceneBudget() {
  return (
    <Svg label="The agent has a budget ring. Payments to allowed payees drain it; a payment to an unknown payee is refused.">
      <circle cx="100" cy="110" r="58" fill="none" className="trk" strokeWidth="13" />
      <circle cx="100" cy="110" r="58" className="gv s1-ring" stroke="url(#sc-g)" strokeWidth="13" pathLength="100" strokeDasharray="100" transform="rotate(-90 100 110)" />
      <g textAnchor="middle" className="head" style={{ fill: "var(--text)" }}>
        <text x="100" y="116" fontSize="22" className="s1-t1">$200</text>
        <text x="100" y="116" fontSize="22" className="s1-t2">$150</text>
        <text x="100" y="116" fontSize="22" className="s1-t3">$110</text>
        <text x="100" y="134" fontSize="10" className="vtxt s" style={{ fill: "var(--dim)" }}>left today</text>
      </g>
      <g className="s1-r1"><rect x="190" y="40" width="190" height="36" rx="10" className="row-bg" /><text x="204" y="62" className="vtxt b">Acme Cloud</text><text x="368" y="62" textAnchor="end" className="vtxt" style={{ fill: "var(--signal)" }}>$30 ✓</text></g>
      <g className="s1-r2"><rect x="190" y="92" width="190" height="36" rx="10" className="row-bg" /><text x="204" y="114" className="vtxt b">Datafeed Inc</text><text x="368" y="114" textAnchor="end" className="vtxt" style={{ fill: "var(--signal)" }}>$40 ✓</text></g>
      <g className="s1-r3"><rect x="190" y="144" width="190" height="36" rx="10" className="row-bg" style={{ stroke: "var(--ember)" }} /><text x="204" y="166" className="vtxt b">Scam LLC</text><text x="368" y="166" textAnchor="end" className="vtxt" style={{ fill: "var(--ember)" }}>refused ✕</text></g>
    </Svg>
  );
}

export function SceneCheckIn() {
  return (
    <Svg label="The timer slowly drains. One tap on check-in refills it to full.">
      <circle cx="100" cy="110" r="58" fill="none" className="trk" strokeWidth="13" />
      <circle cx="100" cy="110" r="58" className="gv s2-ring" stroke="url(#sc-g)" strokeWidth="13" pathLength="100" strokeDasharray="100" transform="rotate(-90 100 110)" />
      <Person x={100} y={108} s={1.5} />
      <g className="s2-btn">
        <rect x="200" y="84" width="170" height="38" rx="11" fill="url(#sc-g)" />
        <text x="285" y="108" textAnchor="middle" className="vtxt" style={{ fill: "var(--signal-ink)", fontSize: 12, fontWeight: 560 }}>I&apos;m here · check in</text>
      </g>
      <circle cx="285" cy="103" r="30" fill="none" stroke="var(--signal)" strokeWidth="2" className="s2-tap" />
      <text x="285" y="152" textAnchor="middle" className="vtxt s2-ok" style={{ fill: "var(--signal)" }}>Timer back to 30 days ✓</text>
      <text x="285" y="62" textAnchor="middle" className="vtxt s">One tap. Any time.</text>
    </Svg>
  );
}

export function SceneFreeze() {
  return (
    <Svg label="The owner misses the deadline. When grace ends the agent freezes.">
      <rect x="20" y="63" width="210" height="14" rx="7" fill="var(--track)" />
      <rect x="234" y="63" width="86" height="14" rx="7" fill="color-mix(in srgb, var(--ember) 35%, var(--track))" />
      <rect x="324" y="63" width="56" height="14" rx="7" fill="var(--track)" />
      <rect x="20" y="63" width="300" height="14" rx="7" fill="url(#sc-g)" opacity=".55" className="s3-fill" />
      <g className="s3-cur"><rect x="19" y="52" width="2" height="36" rx="1" fill="var(--text)" /></g>
      <text x="20" y="104" className="vtxt s">check-in due</text>
      <text x="234" y="104" className="vtxt s">grace</text>
      <text x="324" y="104" className="vtxt s">vote</text>
      <g transform="translate(60 130)">
        <rect x="0" y="0" width="280" height="68" rx="14" className="row-bg" />
        <circle cx="38" cy="34" r="20" fill="none" className="trk" strokeWidth="6" />
        <circle cx="38" cy="34" r="20" fill="none" className="s3-ring" strokeWidth="6" strokeDasharray="95 126" strokeLinecap="round" transform="rotate(-90 38 34)" />
        <g className="s3-chip" fill="none" stroke="var(--text)" strokeWidth="1.5" strokeLinejoin="round"><rect x="30" y="28" width="16" height="13" rx="4" /><path d="M38 28v-4" /></g>
        <g className="s3-lock" fill="none" stroke="var(--frost)" strokeWidth="1.6" strokeLinecap="round"><rect x="31" y="32" width="14" height="11" rx="3" /><path d="M34 32v-3a4 4 0 0 1 8 0v3" /></g>
        <text x="72" y="30" className="vtxt b">Atlas</text>
        <text x="72" y="47" className="vtxt s s3-chip" style={{ fill: "var(--signal)" }}>working inside its budget</text>
        <text x="72" y="47" className="vtxt s s3-lock" style={{ fill: "var(--frost)" }}>frozen: nothing can be spent</text>
      </g>
    </Svg>
  );
}

export function SceneVote() {
  const av = (x: number, l: string, cls: string) => (
    <g className={cls}><circle cx={x} cy="52" r="22" className="gc" /><text x={x} y="57" textAnchor="middle" className="vtxt b">{l}</text></g>
  );
  return (
    <Svg label="Three guardians; two of three must agree before anything can happen. A challenge window follows, in which the owner can still cancel.">
      {av(110, "B", "s4-a1")}{av(200, "C", "s4-a2")}{av(290, "D", "s4-a3")}
      <g textAnchor="middle" className="head" style={{ fill: "var(--text)" }}>
        <text x="200" y="124" fontSize="22" className="s4-n0">0 of 2</text>
        <text x="200" y="124" fontSize="22" className="s4-n1">1 of 2</text>
        <text x="200" y="124" fontSize="22" className="s4-n2" style={{ fill: "var(--signal)" }}>2 of 2</text>
      </g>
      <text x="40" y="162" className="vtxt s">Challenge window · the owner can still cancel</text>
      <rect x="40" y="173" width="320" height="10" rx="5" fill="var(--track)" />
      <rect x="40" y="173" width="320" height="10" rx="5" fill="url(#sc-g)" className="s4-bar" />
    </Svg>
  );
}

export function SceneOutcome() {
  return (
    <Svg label="Two outcomes only, both chosen by the owner in advance: hand over to the successor, or shut down and return funds to the beneficiary.">
      <path d="M112 110C180 110 190 58 258 58" fill="none" stroke="var(--line-2)" strokeWidth="1.5" strokeDasharray="3 5" />
      <path d="M112 110C180 110 190 162 258 162" fill="none" stroke="var(--line-2)" strokeWidth="1.5" strokeDasharray="3 5" />
      <rect x="20" y="78" width="92" height="64" rx="16" className="row-bg" />
      <path d="M66 94a8 8 0 0 1 3.7 15l2.5 12h-12.4l2.5-12A8 8 0 0 1 66 94Z" fill="url(#sc-g)" />
      <text x="66" y="136" textAnchor="middle" className="vtxt s" style={{ fontSize: 10 }}>vault</text>
      <g className="s5-h1"><rect x="258" y="32" width="124" height="52" rx="14" className="row-bg" style={{ stroke: "var(--signal)" }} /><text x="274" y="54" className="vtxt b">Successor</text><text x="274" y="71" className="vtxt s">Tunde · gets the vault</text></g>
      <g className="s5-h2"><rect x="258" y="136" width="124" height="52" rx="14" className="row-bg" style={{ stroke: "var(--signal-2)" }} /><text x="274" y="158" className="vtxt b">Beneficiary</text><text x="274" y="175" className="vtxt s">Emeka · gets the funds</text></g>
      <text x="168" y="64" className="vtxt s" style={{ fill: "var(--signal)" }}>Hand over</text>
      <text x="162" y="168" className="vtxt s" style={{ fill: "var(--signal-2)" }}>Shut down</text>
      <circle r="7" cx="112" cy="110" fill="url(#sc-g)" className="s5-t1" />
      <circle r="7" cx="112" cy="110" fill="url(#sc-g)" className="s5-t2" />
    </Svg>
  );
}
