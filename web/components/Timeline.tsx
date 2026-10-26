import { formatCountdown } from "@/lib/sim";

export interface TimelineProps {
  startMs: number; now: number;
  intervalMs: number; graceMs: number; challengeMs: number;
  /** when the agent freezes if the owner stays silent (absolute ms) */
  freezeAt?: number | null;
  labels: { due: string; grace: string; challenge: string };
}

const fill = (s: number, e: number, pos: number) => Math.max(0, Math.min(1, (pos - s) / (e - s)));

/** Proper visual timeline: interval → grace → challenge, a "now" marker, and where the agent freezes. */
export default function Timeline({ startMs, now, intervalMs, graceMs, challengeMs, freezeAt, labels }: TimelineProps) {
  const total = intervalMs + graceMs + challengeMs;
  const e1 = startMs + intervalMs, e2 = e1 + graceMs, e3 = e2 + challengeMs;
  const pct = (t: number) => Math.max(0, Math.min(100, ((t - startMs) / total) * 100));
  return (
    <div className="tlv" aria-label="Timeline">
      {freezeAt != null && (
        <span className="snow" style={{ left: `${pct(freezeAt)}%` }}>
          <svg width="12" height="12" viewBox="-8 -8 16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none"><path d="M0-7v14M-6-3.5l12 7M-6 3.5l12-7" /></svg>
          {Math.abs(pct(freezeAt) - pct(now)) > 16 && "agent freezes"}
        </span>
      )}
      <div className="segs">
        <div className="seg sg-a" style={{ flex: intervalMs }}><i style={{ width: `${fill(startMs, e1, now) * 100}%` }} /></div>
        <div className="seg sg-g" style={{ flex: graceMs }}><i style={{ width: `${fill(e1, e2, now) * 100}%` }} /></div>
        <div className="seg sg-c" style={{ flex: challengeMs }}><i style={{ width: `${fill(e2, e3, now) * 100}%` }} /></div>
      </div>
      <span className="now" style={{ left: `${pct(now)}%` }} />
      <div className="leg">
        <span><i className="d-a" />Check-in · {labels.due}</span>
        <span><i className="d-g" />Grace · {labels.grace}</span>
        <span><i className="d-c" />Challenge · {labels.challenge}</span>
      </div>
    </div>
  );
}
export { formatCountdown };
