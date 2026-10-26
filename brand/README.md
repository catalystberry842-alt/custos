# Custos brand kit (Paper + Ink)

Mark: an open budget-gauge ring (the gate) around a keyhole agent, with a small token in the gate = budget + guardian + handover.
Monochrome-friendly: ring and keyhole take the ink colour, only the token carries the accent. No gradients.

Files: `logo-mark.svg/png` (on light), `logo-mark-dark.svg/png` (on dark), `logo-mark-mono.svg` (single colour),
`icon.svg` + `icon-180/512/1024.png` (ink tile, paper mark, sage token), `favicon.svg` + `favicon-16/32.png`,
`wordmark-light.svg/png`, `wordmark-dark.svg/png` (DM Sans 600 outlines, tracking -4%), `palette.json`.
Regenerate: `python3 build-brand.py && node render.mjs`.

## Palette
| role | light (default) | dark |
|---|---|---|
| background | #F7F6F3 (paper), #EFEDE8 | #0A0A0A, #111111 |
| card | #FFFFFF | #131313 |
| text / muted / dim | #0E0E10 / #55555B / #75757B | #F2F1EE / #A4A4A9 / #7E7E84 |
| hairline | rgba(14,14,16,.09) | rgba(255,255,255,.09) |
| accent (forest / sage) | #1C5240 | #8FD1AE |
| frost (frozen) | #4F6B8A | #9DB4D1 |
| danger (muted brick) | #A8412B | #E58B72 |

## Fonts (self-hosted via @fontsource-variable, SIL OFL)
- Headings and wordmark: **DM Sans** variable, weight ~560, tracking -0.04em, line-height ~1.
- Body/UI: **Inter** variable, weight 400, 16px body. Scale: 13 / 16 / 20 / 36 / hero (clamp 46-96px).
