import Gauge from "./Gauge";
import { Mark } from "./Logo";
import Timeline from "./Timeline";

/** Static dashboard mockup in a window frame (same components as the real dashboard, frozen moment). */
export function DashPreview() {
  const d = 86400000;
  return (
    <div className="win dp" role="img" aria-label="Product preview of the dashboard: the agent is frozen and two of three guardians have approved a handover">
      <div className="win-bar"><i /><i /><i /><span>Ada&apos;s guardian · simulation</span></div>
      <div className="dash dp-body" aria-hidden>
        <div className="stack" style={{ gap: 16 }}>
          <div className="dp-card stack" style={{ gap: 14 }}>
            <div className="row between"><span className="lbl">1,180 USD in the vault · fake</span><span className="pill cold">Challenge window</span></div>
            <div className="countdown">2d 14h</div>
            <p className="mut">until Tunde can take over, unless Ada checks in</p>
            <Timeline startMs={0} now={38.2 * d} intervalMs={30 * d} graceMs={7 * d} challengeMs={3 * d} freezeAt={37 * d} labels={{ due: "25 Nov", grace: "2 Dec", challenge: "5 Dec" }} />
          </div>
          <div className="dp-card stack" style={{ gap: 16 }}>
            <div className="row between"><span className="sect-t">Atlas</span><span className="pill cold">Frozen</span></div>
            <div className="agent">
              <Gauge value={0.75} state="frozen"><b>$150</b><span>left of $200</span></Gauge>
              <dl className="kv" style={{ margin: 0 }}><dt>Per payment</dt><dd>max $50</dd><dt>Budget</dt><dd>$200 per day</dd></dl>
            </div>
            <p className="frostbar">Ada has been silent past the deadline, so the contract froze Atlas. A check-in unfreezes it right away.</p>
          </div>
        </div>
        <div className="stack dp-right" style={{ gap: 16 }}>
          <div className="dp-card stack" style={{ gap: 6 }}>
            <div className="row between"><span className="sect-t">Guardians</span><span className="pill">2 of 2 approved</span></div>
            <div className="gl">
              {[["B", "Bola", true], ["C", "Chidi", true], ["D", "Dayo", false]].map(([l, n, v]) => (
                <div className="g" key={n as string}>
                  <span className={`av ${v ? "on" : ""}`}>{l}</span>
                  <span className="stack" style={{ gap: 0 }}><span>{n}</span><span className="xs dim">{v ? "approved: Hand over" : "waiting"}</span></span>
                  <span className="btn sm" style={{ opacity: v ? 0.4 : 1 }}>Hand over</span>
                </div>
              ))}
            </div>
          </div>
          <div className="dp-card stack" style={{ gap: 14 }}>
            <span className="sect-t">Activity</span>
            <div className="chat">
              <div className="msg urgent"><span className="mini-av"><Mark size={18} /></span><div className="bub"><div className="who"><b>Custos assistant</b><span>3 Dec 00:00</span></div>Ada, Atlas is frozen and two guardians chose to hand over to Tunde. Check in now to stop it.</div></div>
              <div className="evt"><b>2 of 3 guardians approved</b> <span className="dim">· 3 Dec 09:00 · contract</span></div>
              <div className="msg me"><div className="bub"><div className="who"><b>You</b><span>3 Dec 09:30</span></div>Still waiting for Ada to respond</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Phone mockup: the assistant's messages get louder only when needed. */
export function PhonePreview() {
  return (
    <div className="phone" role="img" aria-label="Phone preview: reminders from the Custos assistant that escalate from a nudge to a freeze notice">
      <div className="phone-notch" />
      <div className="phone-top"><span className="mini-av"><Mark size={18} /></span><div className="stack" style={{ gap: 0 }}><b>Custos assistant</b><span className="xs dim">simulated Telegram chat</span></div></div>
      <div className="chat phone-chat" aria-hidden>
        <div className="evt sys">25 Nov</div>
        <div className="msg"><span className="mini-av" /><div className="bub">Quick check-in? Tap once to tell me you&apos;re here.</div></div>
        <div className="evt sys">2 Dec</div>
        <div className="msg urgent"><span className="mini-av" /><div className="bub"><b>Ada, you&apos;re overdue.</b> Atlas will freeze at 23:00 today unless you check in.</div></div>
        <div className="evt sys">3 Dec</div>
        <div className="msg urgent"><span className="mini-av" /><div className="bub"><b>Atlas is frozen.</b> Your guardians have been told. One check-in stops all of it.</div></div>
        <div className="msg me"><div className="bub">I&apos;m here · check in</div></div>
      </div>
    </div>
  );
}
