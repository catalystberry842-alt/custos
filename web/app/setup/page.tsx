"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import SimBanner from "@/components/SimBanner";
import { DEFAULT_CFG, initSim, saveSim, type DemoConfig } from "@/lib/sim";

const STEPS = ["Guardians", "Beneficiary", "Timing", "Review"] as const;
const isAddr = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a);

function Chips({ value, options, onChange, suffix = "d" }: { value: number; options: number[]; onChange: (n: number) => void; suffix?: string }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o} type="button" className={`chip ${o === value ? "on" : ""}`} onClick={() => onChange(o)}>
          {o === 0 ? "Off" : `${o}${suffix}`}
        </button>
      ))}
    </div>
  );
}

export default function Setup() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [cfg, setCfg] = useState<DemoConfig>({ ...DEFAULT_CFG, guardians: DEFAULT_CFG.guardians.map((g) => ({ ...g })) });
  const set = (p: Partial<DemoConfig>) => setCfg((c) => ({ ...c, ...p }));

  const errors = useMemo(() => {
    const e: string[] = [];
    if (step === 0) {
      const names = cfg.guardians.map((g) => g.name.trim().toLowerCase());
      if (names.some((n) => !n)) e.push("Every guardian needs a name.");
      if (new Set(names).size !== names.length) e.push("Guardian names must be different.");
      cfg.guardians.forEach((g) => { if (g.address && !isAddr(g.address)) e.push(`${g.name || "Guardian"}: wallet address looks invalid.`); });
      if (cfg.threshold < 1 || cfg.threshold > cfg.guardians.length) e.push("Threshold must be between 1 and the number of guardians.");
    }
    if (step === 1) {
      if (!cfg.beneficiaryName.trim()) e.push("Beneficiary needs a name.");
      if (cfg.beneficiaryAddress && !isAddr(cfg.beneficiaryAddress)) e.push("Beneficiary address looks invalid (expected 0x + 40 hex characters).");
      if (cfg.guardians.some((g) => g.name.trim().toLowerCase() === cfg.beneficiaryName.trim().toLowerCase())) e.push("Beneficiary is also a guardian. Allowed, but see the warning in Review.");
    }
    return e;
  }, [cfg, step]);

  const hardErrors = errors.filter((x) => !x.includes("Allowed, but"));
  const warnings: string[] = [];
  if (cfg.threshold === 1) warnings.push("1-of-N means a single guardian can start a release (after the grace period).");
  if (cfg.threshold === cfg.guardians.length && cfg.guardians.length > 1) warnings.push("All guardians must act. If one loses their key you'll need to replace them, or use the fallback.");
  if (cfg.guardians.some((g) => g.name.trim().toLowerCase() === cfg.beneficiaryName.trim().toLowerCase())) warnings.push("The beneficiary is also a guardian: they'd count as a vote for their own inheritance.");
  if (cfg.intervalDays < 14) warnings.push("A short interval means you must check in often.");
  if (cfg.fallbackDays === 0) warnings.push("Fallback off: if guardians vanish, nobody can release the vault.");

  const setGuardian = (i: number, p: Partial<(typeof cfg.guardians)[number]>) =>
    set({ guardians: cfg.guardians.map((g, j) => (j === i ? { ...g, ...p } : g)) });
  const addGuardian = () => {
    if (cfg.guardians.length >= 7) return;
    const n = cfg.guardians.length + 1;
    set({ guardians: [...cfg.guardians, { id: `g${Date.now() % 100000}${n}`, name: "" }] });
  };
  const removeGuardian = (i: number) => {
    if (cfg.guardians.length <= 1) return;
    const gs = cfg.guardians.filter((_, j) => j !== i);
    set({ guardians: gs, threshold: Math.min(cfg.threshold, gs.length) });
  };

  const finish = () => {
    const clean: DemoConfig = { ...cfg, ownerName: cfg.ownerName.trim() || "You", guardians: cfg.guardians.map((g) => ({ ...g, name: g.name.trim() })) };
    saveSim(initSim(clean));
    router.push("/dashboard");
  };

  return (
    <main className="wrap">
      <div className="stack" style={{ padding: "12px 0 28px" }}>
        <SimBanner text="Setup only configures the local simulation. Nothing is deployed." />
        <div className="step-ind">{STEPS.map((_, i) => <i key={i} className={i <= step ? "on" : ""} />)}</div>
        <div className="row between">
          <h2>{STEPS[step]}</h2>
          <span className="s mut">Step {step + 1} of {STEPS.length}</span>
        </div>

        {step === 0 && (
          <div className="stack">
            <p className="mut">Pick people who know you and don&apos;t know each other well. They can only vote on a release, never choose where funds go.</p>
            <div className="field">
              <label className="s mut" htmlFor="owner">Your name</label>
              <input id="owner" className="input" value={cfg.ownerName} onChange={(e) => set({ ownerName: e.target.value })} />
            </div>
            <div className="stack" style={{ gap: 6 }}>
              {cfg.guardians.map((g, i) => (
                <div key={g.id} className="row">
                  <input aria-label={`Guardian ${i + 1} name`} className="input" style={{ flex: 1 }} placeholder={`Guardian ${i + 1} name`} value={g.name} onChange={(e) => setGuardian(i, { name: e.target.value })} />
                  <input aria-label={`Guardian ${i + 1} address`} className={`input ${g.address && !isAddr(g.address) ? "bad" : ""}`} style={{ flex: 1.2 }} placeholder="0x… (optional)" value={g.address ?? ""} onChange={(e) => setGuardian(i, { address: e.target.value.trim() })} />
                  <button className="btn sm ghost" onClick={() => removeGuardian(i)} disabled={cfg.guardians.length <= 1} aria-label="Remove guardian">✕</button>
                </div>
              ))}
              <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={addGuardian} disabled={cfg.guardians.length >= 7}>+ Add guardian</button>
            </div>
            <div className="field">
              <span className="s mut">Approvals needed</span>
              <div className="row">
                <button className="btn sm" onClick={() => set({ threshold: Math.max(1, cfg.threshold - 1) })} aria-label="Fewer approvals">−</button>
                <span style={{ minWidth: 70, textAlign: "center" }}><b>{cfg.threshold}</b> of <b>{cfg.guardians.length}</b></span>
                <button className="btn sm" onClick={() => set({ threshold: Math.min(cfg.guardians.length, cfg.threshold + 1) })} aria-label="More approvals">+</button>
              </div>
              <span className="s dim">Tip: 2-of-3 or 3-of-5 balances safety and lost-key tolerance.</span>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="stack">
            <p className="mut">The one person (or wallet) who receives everything on release. You can change this any time while you&apos;re active.</p>
            <div className="field">
              <label className="s mut" htmlFor="ben">Beneficiary name</label>
              <input id="ben" className="input" value={cfg.beneficiaryName} onChange={(e) => set({ beneficiaryName: e.target.value })} />
            </div>
            <div className="field">
              <label className="s mut" htmlFor="benaddr">Beneficiary wallet (0x…, optional in demo)</label>
              <input id="benaddr" className={`input ${cfg.beneficiaryAddress && !isAddr(cfg.beneficiaryAddress) ? "bad" : ""}`} placeholder="0x…" value={cfg.beneficiaryAddress ?? ""} onChange={(e) => set({ beneficiaryAddress: e.target.value.trim() })} />
              <span className="s dim">Use a wallet they control (EOA or Safe). Never share seed phrases here.</span>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="stack">
            <div className="field"><span className="s mut">Check in at least every</span><Chips value={cfg.intervalDays} options={[7, 14, 30, 60, 90]} onChange={(n) => set({ intervalDays: n })} /></div>
            <div className="field"><span className="s mut">Grace period after a missed check-in</span><Chips value={cfg.graceDays} options={[3, 7, 14, 30]} onChange={(n) => set({ graceDays: n })} /></div>
            <div className="field"><span className="s mut">Final challenge window</span><Chips value={cfg.challengeDays} options={[1, 3, 7, 14]} onChange={(n) => set({ challengeDays: n })} /></div>
            <div className="field"><span className="s mut">Guardian-less fallback (beneficiary can claim if guardians vanish)</span><Chips value={cfg.fallbackDays} options={[0, 30, 60, 90]} onChange={(n) => set({ fallbackDays: n })} /></div>
            <p className="s dim">Earliest possible release if you vanish today: {cfg.intervalDays + cfg.graceDays + cfg.challengeDays} days.</p>
          </div>
        )}

        {step === 3 && (
          <div className="stack">
            <div className="card stack" style={{ gap: 6 }}>
              <div className="row between"><span className="mut">Owner</span><b>{cfg.ownerName || "You"}</b></div>
              <hr className="hr" />
              <div className="row between"><span className="mut">Guardians</span><b>{cfg.guardians.map((g) => g.name).join(", ")}</b></div>
              <div className="row between"><span className="mut">Approvals needed</span><b>{cfg.threshold} of {cfg.guardians.length}</b></div>
              <hr className="hr" />
              <div className="row between"><span className="mut">Beneficiary</span><b>{cfg.beneficiaryName}</b></div>
              <hr className="hr" />
              <div className="row between"><span className="mut">Interval / grace / challenge</span><b>{cfg.intervalDays}d / {cfg.graceDays}d / {cfg.challengeDays}d</b></div>
              <div className="row between"><span className="mut">Fallback</span><b>{cfg.fallbackDays ? `${cfg.fallbackDays}d` : "Off"}</b></div>
            </div>
            {warnings.map((w) => <p key={w} className="s accent">⚠ {w}</p>)}
            <p className="s dim">Starting runs the <b>simulation</b>. Deploying a real vault needs the contracts deployed to Monad and an audit first (see README).</p>
          </div>
        )}

        {hardErrors.map((e) => <p key={e} className="s accent">⚠ {e}</p>)}

        <div className="row between">
          <button className="btn" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</button>
          {step < 3 ? (
            <button className="btn primary" disabled={hardErrors.length > 0} onClick={() => setStep((s) => s + 1)}>Next</button>
          ) : (
            <button className="btn primary" onClick={finish}>Start simulation →</button>
          )}
        </div>
      </div>
    </main>
  );
}
