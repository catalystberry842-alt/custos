# Custos brand kit

Mark: an open budget-gauge ring (the gate) around a keyhole agent, with a small token riding the gate = budget + guardian + handover.
Gradient: #3BE0F5 → #7C8CFF.

Files: logo-mark.svg/png, icon.svg + icon-180/512/1024.png (app icon), favicon.svg + favicon-16/32.png,
wordmark-dark/light.svg/png (DM Sans 600 outlines, letter-spacing -4%). `palette.json` has all colours.
Regenerate: `python3 build-brand.py && node render.mjs`.

## Palette (Ink + Beacon)
| role | dark | light |
|---|---|---|
| background | #070A12 / #0B1020 | #F2F5FB / #E8EDF7 |
| text / muted / dim | #EAF0FF / #9AA6C2 / #66718D | #0A0E1A / #4A5671 / #7A86A1 |
| signal (brand, active) | #3BE0F5 → #7C8CFF | #0592B3 → #5465E6 |
| frost (agent frozen) | #BCD3FF | #4C6CB8 |
| ember (blocked/urgent) | #FF7A59 | #D8451F |

## Fonts (self-hosted via @fontsource-variable, SIL OFL)
- Headings and wordmark: **DM Sans** variable, weight ~560, letter-spacing -0.04em, line-height ~1.
- Body/UI: **Inter** variable, weight 400. Type scale: 12 / 14 / 18 / 30 / hero (clamp 42–84px).
