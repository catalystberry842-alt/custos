import { useId } from "react";

export type GaugeState = "active" | "frozen" | "stopped";

/** Circular budget gauge. `value` = share of the budget still available (0..1). */
export default function Gauge({ value, state, children }: { value: number; state: GaugeState; children?: React.ReactNode }) {
  const id = useId().replace(/:/g, "");
  const R = 60, C = 2 * Math.PI * R;
  const v = Math.max(0, Math.min(1, value));
  const frozen = state === "frozen";
  const stopped = state === "stopped";
  const stroke = frozen ? "var(--frost)" : stopped ? "var(--dim)" : `url(#${id})`;
  return (
    <div className="gauge" role="img" aria-label={`Budget left ${(v * 100).toFixed(0)} percent, agent ${state}`}>
      <svg viewBox="0 0 160 160">
        <defs>
          <linearGradient id={id} x1="0" y1="160" x2="160" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--signal)" /><stop offset="1" stopColor="var(--signal-2)" />
          </linearGradient>
          <pattern id={id + "f"} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1.2" height="6" fill="var(--frost)" opacity=".28" /></pattern>
        </defs>
        {/* tick ring */}
        <circle cx="80" cy="80" r="74" fill="none" stroke="var(--line-2)" strokeWidth="3" strokeDasharray="1 7.7" />
        <circle cx="80" cy="80" r={R} className="trk" strokeWidth="12" />
        {frozen && <circle cx="80" cy="80" r={R} fill="none" stroke={`url(#${id}f)`} strokeWidth="12" />}
        <circle
          cx="80" cy="80" r={R} className="arc" strokeWidth="12" stroke={stroke}
          strokeDasharray={`${C * v} ${C}`} transform="rotate(-90 80 80)"
          style={{ transition: "stroke-dasharray .7s cubic-bezier(.3,.7,.2,1), stroke .4s", filter: frozen || stopped ? "none" : "drop-shadow(0 0 7px color-mix(in srgb, var(--signal) 60%, transparent))" }}
        />
        {frozen && (
          <g transform="translate(138 22)" stroke="var(--frost)" strokeWidth="1.6" strokeLinecap="round" fill="none">
            <path d="M0-8v16M-6.9-4l13.8 8M-6.9 4l13.8-8" /><path d="M-2.5-6.5L0-4l2.5-2.5M-2.5 6.5L0 4l2.5 2.5" strokeWidth="1.2" />
          </g>
        )}
      </svg>
      <div className="mid">{children}</div>
    </div>
  );
}
