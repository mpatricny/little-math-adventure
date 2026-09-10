# Battle HUD v1 — generated asset provenance

Built-in ImageGen was used in reference-guided generation mode with:

- canonical visual reference:
  `docs/design-drafts/battle-ui-lightweight-concept-v4.png`
- raw generated sources:
  `tmp/imagegen/battle-hud-v1/*-source.png`
- transparent normalized production assets:
  `public/assets/ui/mock/battle-hud/v1/`

## Shared prompt constraints

Create one isolated production-ready 2D game HUD asset matching the approved
battle mock exactly in art direction and lightweight proportions. Reuse the
approved mock as the single canonical source. The bitmap is structural only:
no generated text, numbers, localization, hit areas, dynamic fills, or
unrelated scenery. Runtime code supplies all values and state. Keep circles
truly circular, use a thin dark-leather and restrained bronze silhouette with
small blue diamond accents, and render in a front-facing orthographic view.
Center the asset with generous padding on a perfectly uniform `#00FF00`
background, with no cast shadow or green inside the asset.

## Element-specific prompts

### Player vitals

One circular heart medallion attached to a thin empty HP rail with a blue
diamond endcap. Directly below it, exactly four evenly spaced identical empty
diamond rune sockets connected by a thin bronze line. No HP fill or charged
runes.

### Enemy vitals

One circular medallion containing only a faceted red crystal, attached to a
thin empty HP rail with a blue diamond endcap. No enemy portrait, label, speed
slots, or HP fill.

### Action dock

One thin horizontal dark-leather dock containing exactly three empty round
sockets: smaller potion socket, larger central attack socket, and smaller pet
socket. Leave room beside side sockets for runtime badges. No icons or glow.

### Preparation indicator

One compact empty circular socket that accepts the existing ShopScene
sword/shield icon as a separate layer. Exactly three empty diamond charge
sockets below it. No generated sword or shield.

### Rune state pair

Exactly two equal cells arranged horizontally. Both cells use identical
diamond silhouette, scale, canvas size, and placement. Left: dark empty rune.
Right: same rune with a compact amber-gold inner light. Only lighting changes.

### Pause

One compact circular dark-leather medallion with thin bronze rim, blue diamonds
at top and bottom, and two centered gold pause bars. No label or alternate
state.

## Normalization

The flat backgrounds were removed with the ImageGen skill's chroma-key helper
using border auto-keying, a soft matte, and despill. Individual structural
assets were trimmed, given deterministic transparent padding, and resized
once. Rune cells were extracted onto identical `64 × 64` transparent canvases
with their matching `369 × 411` source bounds centered identically.
