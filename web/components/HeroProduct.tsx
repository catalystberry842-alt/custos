/**
 * Hero product visual: the Custos agent card in a window frame. 20 s CSS loop: Atlas works inside its budget →
 * Ada goes silent → the ring freezes → guardians vote → the vault is handed to Tunde. With prefers-reduced-motion
 * the animation is off and the final (handed over) state is shown. Keyframes: scripts/gen-motion.py → app/motion.css.
 */
const R = 80;
export default function HeroProduct() {
  return (
    <div className="win hp" role="img" aria-label="Product preview: an AI agent's budget freezes when its owner goes silent, then guardians hand the vault over to a successor">
      <div className="win-bar"><i /><i /><i /><span>Ada&apos;s guardian · simulation</span></div>
      <div className="hp-body" aria-hidden>
        <div className="hp-card">
          <div className="row between">
            <span className="sect-t">Atlas</span>
            <span className="hp-pills">
              <span className="pill ok hp-p-w">Working</span>
              <span className="pill cold hp-p-f">Frozen</span>
              <span className="pill hp-p-h">Handed over</span>
            </span>
          </div>
          <div className="hp-gauge">
            <svg viewBox="0 0 200 200">
              <circle cx="100" cy="100" r="96" fill="none" stroke="var(--line-2)" strokeWidth="2" strokeDasharray="1 9.1" />
              <circle cx="100" cy="100" r={R} fill="none" stroke="var(--track)" strokeWidth="14" />
              {(["w", "f", "h"] as const).map((k) => (
                <circle key={k} className={`hp-r hp-r-${k}`} cx="100" cy="100" r={R} fill="none" strokeWidth="14" strokeLinecap="round" pathLength="100" strokeDasharray="100 100" strokeDashoffset="25" transform="rotate(-90 100 100)" />
              ))}
            </svg>
            <div className="hp-mid">
              <b>$150</b>
              <span className="hp-subs">
                <span className="hp-s-w">left today</span>
                <span className="hp-s-f">frozen</span>
                <span className="hp-s-h">handed over</span>
              </span>
            </div>
            <svg className="hp-lock" viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="var(--frost)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
          </div>
          <div className="hp-meta">
            <div><span className="xs dim">Per payment</span><b>max $50</b></div>
            <div><span className="xs dim">Pays only</span><b>Acme Cloud, Datafeed</b></div>
          </div>
          <div className="hp-guard">
            <span className="xs dim">Guardians</span>
            <span className="hp-avs"><i className="hp-av hp-av-b">B</i><i className="hp-av hp-av-c">C</i><i className="hp-av">D</i></span>
          </div>
        </div>
        <div className="hp-feed">
          <span className="sect-t">Activity</span>
          <ul>
            <li className="hp-l1"><i className="ok" /><div><b>Atlas paid Acme Cloud $30</b><span>Inside budget and on the allowed list</span></div></li>
            <li className="hp-l2"><i className="bad" /><div><b>Refused: Scam LLC, $10</b><span>Not on the allowed list. Ada was told.</span></div></li>
            <li className="hp-l3"><i /><div><b>Ada missed her check-in</b><span>Grace period started, guardians warned</span></div></li>
            <li className="hp-l4"><i className="cold" /><div><b>Atlas is frozen</b><span>The contract refuses every payment</span></div></li>
            <li className="hp-l5"><i className="ok" /><div><b>2 of 3 guardians chose Hand over</b><span>Bola and Chidi approved</span></div></li>
            <li className="hp-l6"><i className="ok" /><div><b>Vault handed to Tunde</b><span>Atlas&apos;s access is revoked</span></div></li>
          </ul>
        </div>
      </div>
      <div className="hp-tl" aria-hidden>
        <div className="hp-track"><i className="hp-tlfill" /><i className="hp-now" /></div>
        <div className="hp-tll"><span>Check-in</span><span>Grace</span><span>Challenge</span></div>
      </div>
    </div>
  );
}
