# UI refresh asset prompts — 12 November 2026

Generated with built-in `image_gen` (imagegen skill). The original generated sources remain in the tool's default generated_images location. Production files were normalized with Sharp using uniform fit/contain, preserving alpha and aspect ratio. No text is baked into these files.

## Learning panel

Production: `public/assets/ui/learning-refresh-v1/learning-panel-v1.png` (1160×640).

```
Use case: stylized-concept.
Asset type: production reusable frame/background for a children's fantasy maths game's player hub, learning map and daily progress. Generate ONE landscape panel, not a UI mockup and not a sprite sheet.
Match the game's supplied visual reference language: beautifully hand-painted storybook RPG artwork, tactile warm parchment, modest antique brass edging, restrained muted deep teal enamel accents. Preserve one shared visual system across related controls. The players cannot read or barely read; explanation will be pictures and demonstrated actions, never paragraphs. Do not generate any lettering, labels, numerals, symbols or buttons.
Exact composition: one front-facing flat landscape rectangular panel with outer aspect ratio 1160:640, fully visible with small generous transparent padding. A slim dimensional antique brass frame with rounded beveled corners and deep teal enamel along its outer rim. Four compact corner details, perhaps small polished turquoise cabochons integrated in metal. NO book spine, NO centre seam, NO title plaque, NO tabs, NO additional frames. Centre is one large softly luminous ivory parchment surface of very low-contrast fine texture. Approximately 93% of inner surface is clean unobstructed empty content area. Top and bottom edges are slim, balanced, nearly straight. Crisp clean border rendering that looks carefully crafted, restrained ornamentation, inviting gentle warmth, premium children’s game quality. Do not add scenery or shadows outside the panel.
Structural asset only. It will be composed with large runtime comparison signs (<, >, =) at least twice their former visible size, readable runtime counts, icons, and code-driven state animation. All labels, hit areas, disabled states, localization, layout belong to runtime code and SceneBuilder. Hover geometry stays stable. Do not bake text or UI states into art. If any paired icon states were present they would have identical silhouette, pose, scale, cell size, placement and differ only in light; here none are requested.
BACKGROUND: actual transparent background, clean alpha, preserve subtle edge antialiasing, no checkerboard. Complete frame and every corner must stay safely inside canvas. No cropped ornaments, no cast shadow, no neon, no saturated green, no heavy grunge, no excessively ornate dragon heads. Return a large high-resolution landscape PNG.
```

## Guide confirmation surface

Production: `public/assets/ui/learning-refresh-v1/guide-confirm-frame-v1.png` (500×200).

```
Use case: stylized-concept.
Asset type: one reusable empty confirmation-button surface for a hand-painted children's fantasy RPG maths game. Match the supplied game reference style of tactile medieval UI frames, modest dimensional antique metal, soft hand-painted gradients, stable geometry, polished clean silhouettes. It should harmonize with the new ivory parchment learning panel's antique brass and muted teal enamel.
Players cannot read or barely read, so confirmation will be communicated by one big runtime checkmark and the short runtime label OK. Generate NO text, lettering, numerals, checkmark or other icon. This is only the EMPTY structural frame, not an entire stateful UI.
One front-facing horizontal rounded button, outer ratio 500:200, centered with generous transparent padding. Broad clear rich emerald/teal green enamel centre occupying 80% of the surface, subtle darker inset depth at bottom and a warm soft upper sheen; slim substantial bevelled antique gold/brass border. Rounded corners, tiny restrained corner metal flourishes, no circular sockets, no wood, no separate plaque, no gems protruding into the centre. At actual game size 230×92, should look readable, inviting, premium, crisp and beautiful. Avoid noisy texture, elaborate filigree, oversized ornaments. Stable symmetric silhouette.
This canonical surface will be reused across guides. Runtime vector checkmark and text live in a separate layer moving with this frame on hover/press; the root hit area is stable. Layout/depth comes from SceneBuilder. Disabled is runtime. Do not create multiple entire button state bitmaps. Any paired states would have to be generated together with identical silhouette, pose, scale, cell size and placement, varying only light; none are requested now.
BACKGROUND actual transparent alpha, NO checkerboard or scenery, no cast shadow outside button. All edges and details completely inside canvas. Large high-resolution PNG.
```

