import { BRAND } from "@/lib/brand";

/** Custos mark: an open ring (a budget gauge with a gate), a keyhole (the agent) and a token in the gate.
 *  Ring + keyhole follow the text colour; only the token carries the accent (frost when `frozen`). */
export function Mark({ size = 28, frozen = false, title }: { size?: number; frozen?: boolean; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role={title ? "img" : "presentation"} aria-label={title} aria-hidden={title ? undefined : true}>
      <path d="M42.35 19.08A19 19 0 1 1 28.92 5.65" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="37.44" cy="10.56" r="3" fill={frozen ? "var(--frost)" : "var(--accent)"} />
      <path d="M24 15.6a5.4 5.4 0 0 1 2.5 10.2L28.2 34H19.8l1.7-8.2A5.4 5.4 0 0 1 24 15.6Z" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ size = 26 }: { size?: number }) {
  return (
    <span className="logo">
      <Mark size={size} />
      <span>{BRAND.name}</span>
    </span>
  );
}
