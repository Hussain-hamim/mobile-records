# Radefy MobileReg product icon

## Transparent home-header variant

`mobilereg-logo-transparent.png` is used in the home header. Its background and internal negative spaces have alpha transparency; the phone/R artwork is dark green for contrast on the light header. Source: built-in image editor output `exec-f90c4c8b-b75c-4aa7-8ad9-18de167e4dc3.png`.

Prompt direction: preserve the approved smartphone, company R, home button, speaker notch and mint check tab; recolor white artwork to #19372F and remove the square background and interior negative spaces to true transparency, retaining the original composition with smooth edges, no shadow or extra elements.

## Launcher artwork

Selected by the user: concept 4, Radefy Register (company R inside a phone).

- `mobilereg-icon.png`: unmodified selected concept from `output/logo-concepts/04-radefy-register.png`; main/iOS icon, web favicon and splash image.
- `mobilereg-icon-adaptive.png`: padded Android variant on dark forest green, prepared with the built-in image-generation tool.
- Android background and splash background: `#19372F`.
- The original Radefy Systems company logo remains in the company branding UI.
- Removed the old company-only monochrome icon override to avoid displaying a different product mark with themed icons.

A new native build is required for launcher/splash changes. These PNG assets are raster artwork, not vector masters.

## Adaptive variant prompt

Precise layout-only edit of approved app logo. Preserve this exact smartphone with R and mint check symbol, all shapes and colors unchanged. Only reduce the entire existing centered symbol to 56% of total canvas HEIGHT (leaving exactly 22% empty space above and below) for Android launcher safe padding. Put it on an entirely OPAQUE flat dark forest green #19372F square background. All dark negative spaces remain dark green, no transparency anywhere. Crisp smooth edges. No redesign, no extra shapes, no text, no artifacts, no textures. 1024x1024 square PNG.

Generated source: `exec-a1dae536-3c91-484a-aeee-470679dc3b79.png`. The generated output is 1254 × 1254; Expo performs target-platform resizing during build. The earlier transparent extraction was rejected during visual review and is not used.
