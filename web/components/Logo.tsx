import { useId } from "react";
import { BRAND } from "@/lib/brand";

/** Custos mark: an open ring (a budget gauge with a gate), a keyhole (the agent node) and a token waiting in the gate. */
export function Mark({ size = 28, frozen = false, title }: { size?: number; frozen?: boolean; title?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role={title ? "img" : "presentation"} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <linearGradient id={id} x1="6" y1="42" x2="42" y2="6" gradientUnits="userSpaceOnUse">
          <stop stopColor={frozen ? "#BCD3FF" : "#3BE0F5"} />
          <stop offset="1" stopColor={frozen ? "#8FA8E8" : "#7C8CFF"} />
        </linearGradient>
      </defs>
      <path d="M42.35 19.08A19 19 0 1 1 28.92 5.65" fill="none" stroke={`url(#${id})`} strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="37.44" cy="10.56" r="2.7" fill={`url(#${id})`} />
      <path d="M24 15.6a5.4 5.4 0 0 1 2.5 10.2L28.2 34H19.8l1.7-8.2A5.4 5.4 0 0 1 24 15.6Z" fill={`url(#${id})`} />
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
