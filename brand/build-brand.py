#!/usr/bin/env python3
"""Generates the Custos brand SVGs (needs fonttools + brotli; DM Sans from web/node_modules). PNGs: see render.mjs."""
import math, pathlib
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

here = pathlib.Path(__file__).parent
SIGNAL, SIGNAL2 = "#3BE0F5", "#7C8CFF"
INK = "#070A12"

# ── mark: open ring (budget gauge with a gate) + keyhole (agent node) + travelling token in the gate ──
R, C = 19, 24
def pt(a): return (C + R*math.cos(math.radians(a)), C + R*math.sin(math.radians(a)))
(x0, y0), (x1, y1), (tx, ty) = pt(-15), pt(285), pt(-45)
RING = f"M{x0:.2f} {y0:.2f}A{R} {R} 0 1 1 {x1:.2f} {y1:.2f}"
KEY = "M24 15.6a5.4 5.4 0 0 1 2.5 10.2L28.2 34H19.8l1.7-8.2A5.4 5.4 0 0 1 24 15.6Z"

def mark_body(grad="g", stroke=3.4):
    return (f'<path d="{RING}" fill="none" stroke="url(#{grad})" stroke-width="{stroke}" stroke-linecap="round"/>'
            f'<circle cx="{tx:.2f}" cy="{ty:.2f}" r="2.7" fill="url(#{grad})"/>'
            f'<path d="{KEY}" fill="url(#{grad})"/>')
def defs(grad="g"):
    return (f'<defs><linearGradient id="{grad}" x1="6" y1="42" x2="42" y2="6" gradientUnits="userSpaceOnUse">'
            f'<stop stop-color="{SIGNAL}"/><stop offset="1" stop-color="{SIGNAL2}"/></linearGradient></defs>')

(here/"logo-mark.svg").write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="256" height="256" role="img" aria-label="Custos">{defs()}{mark_body()}</svg>\n')

# app icon: rounded square, ink with a soft glow, mark centred
icon = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="Custos">
<defs><linearGradient id="g" x1="6" y1="42" x2="42" y2="6" gradientUnits="userSpaceOnUse"><stop stop-color="{SIGNAL}"/><stop offset="1" stop-color="{SIGNAL2}"/></linearGradient>
<radialGradient id="bg" cx="30%" cy="12%" r="95%"><stop stop-color="#16213A"/><stop offset="1" stop-color="{INK}"/></radialGradient>
<linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".22"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
<rect width="512" height="512" rx="116" fill="url(#bg)"/><rect x="1.5" y="1.5" width="509" height="509" rx="114.5" fill="none" stroke="url(#rim)" stroke-width="3"/>
<g transform="translate(96 96) scale(6.667)">{mark_body()}</g></svg>
'''
(here/"icon.svg").write_text(icon)
# favicon: bolder mark on a simple tile so it survives 16px
fav = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><linearGradient id="g" x1="6" y1="42" x2="42" y2="6" gradientUnits="userSpaceOnUse"><stop stop-color="{SIGNAL}"/><stop offset="1" stop-color="{SIGNAL2}"/></linearGradient></defs><rect width="48" height="48" rx="11" fill="{INK}"/><g transform="translate(5 5) scale(.79)">{mark_body(stroke=4.6)}</g></svg>
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
def wordmark(fill, name):
    # mark 36px tall, text cap-height ~21 centred on it
    tw = w
    total = 36 + 10 + tw
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total:.1f} 36" width="{total*4:.0f}" height="144" role="img" aria-label="Custos">
{defs()}<g transform="scale(.75)">{mark_body()}</g><path transform="translate(46 24.6)" d="{d}" fill="{fill}"/></svg>
'''
    (here/name).write_text(svg)
wordmark("#EAF0FF", "wordmark-dark.svg")   # for dark backgrounds
wordmark("#0A0E16", "wordmark-light.svg")  # for light backgrounds
print("ok", w)
