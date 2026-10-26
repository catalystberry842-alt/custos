"use client";
import { useEffect, useState } from "react";

export const THEME_KEY = "custos-theme";
/** Inline script (set in <head>) so the saved theme applies before first paint. */
export const THEME_INIT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function ThemeToggle() {
  const [t, setT] = useState<"dark" | "light">("dark");
  useEffect(() => { setT((document.documentElement.dataset.theme as "dark" | "light") ?? "dark"); }, []);
  const flip = () => {
    const n = t === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = n;
    try { localStorage.setItem(THEME_KEY, n); } catch { /* ignore */ }
    setT(n);
  };
  return (
    <button className="icon-btn" onClick={flip} aria-label={t === "dark" ? "Switch to light theme" : "Switch to dark theme"} title="Theme">
      {t === "dark" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></svg>
      )}
    </button>
  );
}
