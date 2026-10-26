import { useId } from "react";

export type GaugeState = "active" | "frozen" | "stopped";

/** Circular budget gauge. `value` = share of the budget still available (0..1). Flat, no glow. */
export default function Gauge({ value, state, children }: { value: number; state: GaugeState; children?: React.ReactNode }) {
  const id = useId().replace(/:/g, "");
  const R = 62, C = 2 * Math.PI * R;
  const v = Math.max(0, Math.min(1, value));
  const frozen = state === "frozen";
  const stopped = state === "stopped";
  const stroke = frozen ? "var(--frost)" : stopped ? "var(--dim)" : "var(--accent)";
  return (
    <div className="gauge" role="img" aria-label={`Budget left ${(v * 100).toFixed(0)} percent, agent ${state}`}>
      <svg viewBox="0 0 160 160">
        <defs>
          <pattern id={id + "f"} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1" height="5" fill="var(--frost)" opacity=".35" /></pattern>
        </defs>
        <circle cx="80" cy="80" r="75" fill="none" stroke="var(--line-2)" strokeWidth="2" strokeDasharray="1 8.5" />
        <circle cx="80" cy="80" r={R} className="trk" strokeWidth="10" />
        {frozen && <circle cx="80" cy="80" r={R} fill="none" stroke={`url(#${id}f)`} strokeWidth="10" />}
        <circle
          cx="80" cy="80" r={R} className="arc" strokeWidth="10" stroke={stroke}
          strokeDasharray={`${C * v} ${C}`} transform="rotate(-90 80 80)"
          style={{ transition: "stroke-dasharray .7s cubic-bezier(.3,.7,.2,1), stroke .4s" }}
        />
      </svg>
      <div className="mid">{children}</div>
    </div>
  );
}
