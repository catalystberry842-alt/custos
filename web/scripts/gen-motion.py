#!/usr/bin/env python3
"""Generates app/motion.css (hero + per-section animations). Pure CSS keyframes, no JS. Base (no-animation) styles in
globals/landing.css show the FINAL state of each loop, so prefers-reduced-motion users get a meaningful still."""
import pathlib
out = []
def kf(name, stops):
    body = "".join(f"{p}%{{{c}}}" for p, c in stops)
    out.append(f"@keyframes {name}{{{body}}}")
def anim(sel, name, dur, extra="ease"):
    out.append(f"{sel}{{animation:{name} {dur}s {extra} infinite}}")
H = "opacity:0;transform:translateY(8px)"; V = "opacity:1;transform:none"
def show(sel, name, dur, a, b):
    kf(name, [(0, H), (max(a-0.01,0), H), (a+2.2, V), (b, V), (b+2, H), (100, H)]); anim(sel, name, dur)
def swap(sel, name, dur, a, b, first=False):
    if first: kf(name, [(0, "opacity:1"), (b, "opacity:1"), (b+2, "opacity:0"), (96, "opacity:0"), (100, "opacity:1")])
    else: kf(name, [(0, "opacity:0"), (a-0.01, "opacity:0"), (a+2, "opacity:1"), (b, "opacity:1"), (b+2, "opacity:0"), (100, "opacity:0")])
    anim(sel, name, dur)

# ───── hero (20 s): working → owner silent → frozen → guardians vote → handed over ─────
D = 20
for i, (a, b) in enumerate([(4, 94), (14, 94), (30, 94), (44, 94), (62, 94), (76, 94)], 1):
    kf(f"hp-l{i}", [(0, H), (a-0.01, H), (a+2.5, V), (b, V), (b+2, H), (100, H)]); anim(f".hp-l{i}", f"hp-l{i}", D)
for cls, (a, b, f) in {"w": (0, 40, True), "f": (42, 76, False), "h": (78, 94, False)}.items():
    swap(f".hp-p-{cls}", f"hp-p{cls}", D, a, b, f); swap(f".hp-s-{cls}", f"hp-s{cls}", D, a, b, f); swap(f".hp-r-{cls}", f"hp-r{cls}", D, a, b, f)
for cls, at in {"b": 56, "c": 62}.items():
    kf(f"hp-v{cls}", [(0, "background:var(--input);color:var(--mut);border-color:var(--line-2)"), (at-0.01, "background:var(--input);color:var(--mut);border-color:var(--line-2)"), (at+1, "background:var(--accent);color:var(--bg);border-color:var(--accent)"), (94, "background:var(--accent);color:var(--bg);border-color:var(--accent)"), (96, "background:var(--input);color:var(--mut);border-color:var(--line-2)"), (100, "background:var(--input);color:var(--mut);border-color:var(--line-2)")])
    anim(f".hp-av-{cls}", f"hp-v{cls}", D)
kf("hp-now", [(0, "left:12%"), (30, "left:50%"), (42, "left:70%"), (56, "left:84%"), (76, "left:94%"), (94, "left:94%"), (95, "left:12%"), (100, "left:12%")])
anim(".hp-now", "hp-now", D, "linear")
kf("hp-tlfill", [(0, "transform:scaleX(.12)"), (30, "transform:scaleX(.5)"), (42, "transform:scaleX(.7)"), (56, "transform:scaleX(.84)"), (76, "transform:scaleX(.94)"), (94, "transform:scaleX(.94)"), (95, "transform:scaleX(.12)"), (100, "transform:scaleX(.12)")])
anim(".hp-tlfill", "hp-tlfill", D, "linear")
kf("hp-lock", [(0, "opacity:0;transform:scale(.7)"), (41, "opacity:0;transform:scale(.7)"), (44, "opacity:1;transform:none"), (76, "opacity:1;transform:none"), (78, "opacity:0;transform:scale(.7)"), (100, "opacity:0;transform:scale(.7)")])
anim(".hp-lock", "hp-lock", D)

# ───── scenes (9 s each) ─────
T = 9
# 1 budget: 200 → 170 → 130, a refused payment
kf("s1-ring", [(0, "stroke-dashoffset:0"), (18, "stroke-dashoffset:0"), (26, "stroke-dashoffset:15"), (44, "stroke-dashoffset:15"), (52, "stroke-dashoffset:35"), (94, "stroke-dashoffset:35"), (98, "stroke-dashoffset:0"), (100, "stroke-dashoffset:0")])
anim(".s1-ring", "s1-ring", T)
swap(".s1-n0", "s1-n0", T, 0, 22, True); swap(".s1-n1", "s1-n1", T, 24, 48); swap(".s1-n2", "s1-n2", T, 50, 94)
show(".s1-r1", "s1-r1", T, 16, 94); show(".s1-r2", "s1-r2", T, 42, 94); show(".s1-r3", "s1-r3", T, 66, 94)
# 2 check-in
kf("s2-bar", [(0, "transform:scaleX(1)"), (50, "transform:scaleX(.18)"), (58, "transform:scaleX(.18)"), (64, "transform:scaleX(1)"), (100, "transform:scaleX(1)")])
anim(".s2-bar", "s2-bar", T, "ease-in-out")
swap(".s2-t0", "s2-t0", T, 0, 12, True); swap(".s2-t1", "s2-t1", T, 14, 58); swap(".s2-t2", "s2-t2", T, 62, 94)
kf("s2-btn", [(0, "transform:none;opacity:.55"), (50, "transform:none;opacity:.55"), (56, "transform:scale(.96);opacity:1"), (62, "transform:none;opacity:1"), (94, "transform:none;opacity:1"), (100, "transform:none;opacity:.55")])
anim(".s2-btn", "s2-btn", T)
show(".s2-toast", "s2-toast", T, 60, 94)
# 3 silence freezes
kf("s3-now", [(0, "left:4%"), (36, "left:56%"), (62, "left:84%"), (92, "left:84%"), (96, "left:4%"), (100, "left:4%")])
anim(".s3-now", "s3-now", T, "ease-in-out")
kf("s3-fill", [(0, "transform:scaleX(.04)"), (36, "transform:scaleX(.56)"), (62, "transform:scaleX(.84)"), (92, "transform:scaleX(.84)"), (96, "transform:scaleX(.04)"), (100, "transform:scaleX(.04)")])
anim(".s3-fill", "s3-fill", T, "ease-in-out")
swap(".s3-p0", "s3-p0", T, 0, 60, True); swap(".s3-p1", "s3-p1", T, 62, 94)
swap(".s3-m0", "s3-m0", T, 0, 60, True); swap(".s3-m1", "s3-m1", T, 62, 94)
kf("s3-card", [(0, "border-color:var(--line);background:var(--card)"), (60, "border-color:var(--line);background:var(--card)"), (66, "border-color:color-mix(in srgb,var(--frost) 55%,transparent);background:var(--frost-soft)"), (94, "border-color:color-mix(in srgb,var(--frost) 55%,transparent);background:var(--frost-soft)"), (98, "border-color:var(--line);background:var(--card)"), (100, "border-color:var(--line);background:var(--card)")])
anim(".s3-card", "s3-card", T)
# 4 vote
for cls, at in {"1": 14, "2": 38}.items():
    kf(f"s4-g{cls}", [(0, "background:var(--card);color:var(--text);border-color:var(--line-2)"), (at-0.01, "background:var(--card);color:var(--text);border-color:var(--line-2)"), (at+1.5, "background:var(--accent);color:var(--bg);border-color:var(--accent)"), (94, "background:var(--accent);color:var(--bg);border-color:var(--accent)"), (97, "background:var(--card);color:var(--text);border-color:var(--line-2)"), (100, "background:var(--card);color:var(--text);border-color:var(--line-2)")])
    anim(f".s4-b{cls}", f"s4-g{cls}", T)
swap(".s4-c0", "s4-c0", T, 0, 14, True); swap(".s4-c1", "s4-c1", T, 14.5, 38); swap(".s4-c2", "s4-c2", T, 38.5, 94)
kf("s4-ch", [(0, "transform:scaleX(0)"), (46, "transform:scaleX(0)"), (84, "transform:scaleX(1)"), (94, "transform:scaleX(1)"), (97, "transform:scaleX(0)"), (100, "transform:scaleX(0)")])
anim(".s4-ch", "s4-ch", T, "linear")
show(".s4-ready", "s4-ready", T, 48, 94)
# 5 outcome
kf("s5-a", [(0, "border-color:var(--line);background:var(--card)"), (30, "border-color:var(--line);background:var(--card)"), (36, "border-color:var(--accent);background:var(--accent-soft)"), (94, "border-color:var(--accent);background:var(--accent-soft)"), (98, "border-color:var(--line);background:var(--card)"), (100, "border-color:var(--line);background:var(--card)")])
anim(".s5-a", "s5-a", T)
kf("s5-b", [(0, "opacity:1"), (30, "opacity:1"), (36, "opacity:.42"), (94, "opacity:.42"), (98, "opacity:1"), (100, "opacity:1")])
anim(".s5-b", "s5-b", T)
swap(".s5-v0", "s5-v0", T, 0, 30, True); swap(".s5-v1", "s5-v1", T, 36, 94)
show(".s5-done", "s5-done", T, 44, 94)
kf("s5-tok", [(0, "opacity:0;transform:translate(0,0)"), (30, "opacity:0;transform:translate(0,0)"), (34, "opacity:1;transform:translate(0,0)"), (52, "opacity:1;transform:translate(var(--dx),0)"), (56, "opacity:0;transform:translate(var(--dx),0)"), (100, "opacity:0")])
anim(".s5-tok", "s5-tok", T, "ease-in-out")

pathlib.Path(__file__).resolve().parent.parent.joinpath("app/motion.css").write_text(
    "/* GENERATED by scripts/gen-motion.py, do not edit by hand. */\n" + "\n".join(out) + "\n")
print("motion.css:", sum(len(x) for x in out), "bytes")
