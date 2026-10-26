#!/usr/bin/env python3
"""Generates the Custos brand SVGs (needs fonttools + brotli; DM Sans from web/node_modules). PNGs: see render.mjs."""
import math, pathlib
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

here = pathlib.Path(__file__).parent

# ── mark: open ring (budget gauge with a gate) + keyhole (agent node) + token in the gate. Monochrome-friendly:
#    ring + keyhole take the ink colour, only the token carries the accent. ──
PAPER, INK, ACCENT, ACCENT_DK = "#F7F6F3", "#0E0E10", "#1C5240", "#8FD1AE"
R, C = 19, 24
def pt(a): return (C + R*math.cos(math.radians(a)), C + R*math.sin(math.radians(a)))
(x0, y0), (x1, y1), (tx, ty) = pt(-15), pt(285), pt(-45)
RING = f"M{x0:.2f} {y0:.2f}A{R} {R} 0 1 1 {x1:.2f} {y1:.2f}"
KEY = "M24 15.6a5.4 5.4 0 0 1 2.5 10.2L28.2 34H19.8l1.7-8.2A5.4 5.4 0 0 1 24 15.6Z"

def mark_body(fg, tok, stroke=3.4):
    return (f'<path d="{RING}" fill="none" stroke="{fg}" stroke-width="{stroke}" stroke-linecap="round"/>'
            f'<circle cx="{tx:.2f}" cy="{ty:.2f}" r="3" fill="{tok}"/>'
            f'<path d="{KEY}" fill="{fg}"/>')
def svg48(fg, tok, name, bg=None):
    rect = f'<rect width="48" height="48" fill="{bg}"/>' if bg else ""
    (here/name).write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="256" height="256" role="img" aria-label="Custos">{rect}{mark_body(fg, tok)}</svg>\n')
svg48(INK, ACCENT, "logo-mark.svg")                 # on light
svg48(PAPER, ACCENT_DK, "logo-mark-dark.svg")        # on dark
svg48("#000", "#000", "logo-mark-mono.svg")          # one colour, token included

# app icon: ink tile, paper mark, sage token. Flat, no glow.
icon = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="Custos">
<rect width="512" height="512" rx="116" fill="{INK}"/>
<g transform="translate(96 96) scale(6.667)">{mark_body(PAPER, ACCENT_DK)}</g></svg>
'''
(here/"icon.svg").write_text(icon)
fav = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="11" fill="{INK}"/><g transform="translate(5 5) scale(.79)">{mark_body(PAPER, ACCENT_DK, stroke=4.6)}</g></svg>
'''
(here/"favicon.svg").write_text(fav)

# ── wordmark: outlines from DM Sans 600, tracking -4% ──
f = TTFont(here.parent/"web/node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2")
inst = instancer.instantiateVariableFont(f, {"wght": 600})
gs, cmap, upm = inst.getGlyphSet(), inst.getBestCmap(), inst["head"].unitsPerEm
def text_path(t, size, x0, y0, track=-0.04):
    s, x, d = size/upm, x0, []
    for ch in t:
        g = cmap[ord(ch)]; pen = SVGPathPen(gs, ntos=lambda v: ("%.2f" % v).rstrip("0").rstrip("."))
        gs[g].draw(TransformPen(pen, (s, 0, 0, -s, x, y0))); d.append(pen.getCommands()); x += gs[g].width*s + track*size
    return " ".join(d), x - track*size
d, w = text_path("Custos", 30, 0, 0)
def wordmark(fg, tok, name):
    total = 36 + 10 + w
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total:.1f} 36" width="{total*4:.0f}" height="144" role="img" aria-label="Custos">
<g transform="scale(.75)">{mark_body(fg, tok)}</g><path transform="translate(46 24.6)" d="{d}" fill="{fg}"/></svg>
'''
    (here/name).write_text(svg)
wordmark(PAPER, ACCENT_DK, "wordmark-dark.svg")   # for dark backgrounds
wordmark(INK, ACCENT, "wordmark-light.svg")       # for light backgrounds
print("ok", w)
