/**
 * Animated hero: an AI agent with a budget ring. The owner goes silent → the ring freezes → guardians vote → the
 * vault is handed to the successor. Pure SVG + CSS keyframes (18 s loop); see app/motion.css. With
 * prefers-reduced-motion the animation is off and the frozen state is shown.
 */
export default function HeroVisual() {
  return (
    <div className="hv glass" aria-label="Animation: an AI agent's budget freezes when its owner goes silent, then guardians hand over to a successor" role="img">
      <svg viewBox="0 0 520 470" className="hvs">
        <defs>
          <linearGradient id="hv-g" x1="0" y1="1" x2="1" y2="0"><stop stopColor="var(--signal)" /><stop offset="1" stopColor="var(--signal-2)" /></linearGradient>
          <radialGradient id="hv-glow"><stop stopColor="var(--signal)" stopOpacity=".28" /><stop offset="1" stopColor="var(--signal)" stopOpacity="0" /></radialGradient>
          <pattern id="hv-frost" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1.3" height="7" fill="var(--frost)" opacity=".3" /></pattern>
        </defs>
        <g className="hv-all">
          <circle cx="270" cy="250" r="170" fill="url(#hv-glow)" className="hv-halo" />

          {/* links */}
          <path d="M116 250H178" stroke="var(--line-2)" strokeWidth="1.5" strokeDasharray="3 5" />
          <path d="M338 214L412 152" stroke="var(--line-2)" strokeWidth="1.5" strokeDasharray="3 5" />
          <path d="M338 290L410 352" stroke="var(--line-2)" strokeWidth="1.5" strokeDasharray="3 5" />

          {/* owner */}
          <g className="hv-owner">
            <circle cx="84" cy="250" r="30" className="hv-beat" fill="none" stroke="var(--signal)" strokeWidth="2" />
            <circle cx="84" cy="250" r="30" className="node" />
            <circle cx="84" cy="243" r="7" fill="var(--text)" opacity=".85" /><path d="M70 267a14 11 0 0 1 28 0" fill="var(--text)" opacity=".85" />
            <circle cx="84" cy="250" r="38" fill="none" stroke="var(--ember)" strokeWidth="2.5" pathLength="100" strokeDasharray="100" className="hv-owner-ring" transform="rotate(-90 84 250)" strokeLinecap="round" />
          </g>
          <text x="84" y="304" textAnchor="middle" className="vtxt b">Ada</text>
          <g className="hv-cap-owner"><text x="84" y="320" textAnchor="middle" className="vtxt s hv-t-active">checks in</text><text x="84" y="320" textAnchor="middle" className="vtxt s hv-t-silent" fill="var(--ember)">silent</text></g>

          {/* payee */}
          <circle cx="440" cy="130" r="26" className="node" />
          <path d="M429 126h22v14a3 3 0 0 1-3 3h-16a3 3 0 0 1-3-3z M434 126v-4a6 6 0 0 1 12 0v4" fill="none" stroke="var(--mut)" strokeWidth="1.6" strokeLinejoin="round" />
          <text x="440" y="176" textAnchor="middle" className="vtxt b">Acme Cloud</text>
          <text x="440" y="192" textAnchor="middle" className="vtxt s">allowed payee</text>
          <circle r="5" cx="340" cy="212" fill="url(#hv-g)" className="hv-pk hv-pk1" />
          <circle r="5" cx="340" cy="212" fill="url(#hv-g)" className="hv-pk hv-pk2" />
          <circle r="5" cx="340" cy="212" fill="url(#hv-g)" className="hv-pk hv-pk3" />
          <circle r="5" cx="340" cy="212" fill="var(--ember)" className="hv-pk hv-blk" />
          <g className="hv-x" stroke="var(--ember)" strokeWidth="2.4" strokeLinecap="round"><path d="M368 188l12 12M380 188l-12 12" /></g>

          {/* agent + budget ring */}
          <g className="hv-agent">
            <circle cx="270" cy="250" r="84" className="trk" strokeWidth="15" />
            <circle cx="270" cy="250" r="84" fill="none" stroke="url(#hv-frost)" strokeWidth="15" className="hv-frost" />
            <circle cx="270" cy="250" r="84" className="arc hv-ring" strokeWidth="15" pathLength="100" strokeDasharray="100" transform="rotate(-90 270 250)" />
            <circle cx="270" cy="250" r="66" className="node" />
            {/* chip glyph */}
            <g className="hv-chip" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="252" y="236" width="36" height="30" rx="9" /><path d="M270 236v-8" /><circle cx="270" cy="226" r="2.6" fill="var(--text)" stroke="none" />
              <circle cx="262" cy="249" r="2.6" fill="var(--text)" stroke="none" /><circle cx="278" cy="249" r="2.6" fill="var(--text)" stroke="none" /><path d="M263 258h14" />
            </g>
            <g className="hv-lock" stroke="var(--frost)" strokeWidth="2.2" strokeLinecap="round" fill="none">
              <rect x="259" y="244" width="22" height="18" rx="4" fill="color-mix(in srgb, var(--bg-2) 85%, transparent)" /><path d="M264 244v-5a6 6 0 0 1 12 0v5" /><circle cx="270" cy="253" r="1.8" fill="var(--frost)" stroke="none" />
            </g>
          </g>
          <text x="270" y="360" textAnchor="middle" className="vtxt b">Atlas</text>
          <text x="270" y="376" textAnchor="middle" className="vtxt s">AI agent · $200 / day</text>

          {/* guardians */}
          <g className="hv-guard">
            <path d="M210 98Q270 140 330 98" fill="none" stroke="var(--line-2)" strokeWidth="1.2" strokeDasharray="2 5" />
            {[["B", 210], ["C", 270], ["D", 330]].map(([l, x], i) => (
              <g key={l} className={`hv-gd hv-gd${i + 1}`}>
                <circle cx={x as number} cy="84" r="14" className="hv-gc" />
                <text x={x as number} y="88" textAnchor="middle" className="vtxt b hv-gl">{l}</text>
              </g>
            ))}
            <text x="270" y="52" textAnchor="middle" className="vtxt s">guardians</text>
          </g>

          {/* successor */}
          <circle cx="440" cy="378" r="28" fill="none" stroke="var(--line-2)" strokeWidth="2" strokeDasharray="4 5" />
          <circle cx="440" cy="378" r="28" fill="none" stroke="url(#hv-g)" strokeWidth="3.5" pathLength="100" strokeDasharray="100" strokeLinecap="round" className="hv-succ" transform="rotate(-90 440 378)" />
          <circle cx="440" cy="378" r="21" className="node" />
          <circle cx="440" cy="372" r="6" fill="var(--text)" opacity=".85" /><path d="M428 392a12 9 0 0 1 24 0" fill="var(--text)" opacity=".85" />
          <text x="440" y="428" textAnchor="middle" className="vtxt b">Tunde</text>
          <text x="440" y="444" textAnchor="middle" className="vtxt s">named successor</text>
          <circle r="7" cx="338" cy="292" fill="url(#hv-g)" className="hv-token" />

        </g>
      </svg>
      <div className="hv-caps" aria-hidden>
        <span className="hv-c hv-c1"><b className="sig">Working</b> inside its budget</span>
        <span className="hv-c hv-c2"><b className="ember">Ada goes silent</b></span>
        <span className="hv-c hv-c3"><b className="frost">Frozen.</b> Nothing can be spent</span>
        <span className="hv-c hv-c4"><b className="sig">Guardians vote</b> 2 of 3</span>
        <span className="hv-c hv-c5"><b className="sig">Handed over</b> to Tunde</span>
      </div>
    </div>
  );
}
