# Image-generation prompt set

Všechny tři koncepty byly vytvořeny vestavěným `image_gen` nástrojem v režimu
`ui-mockup`. Český text a čísla byly následně přidány lokálně, aby nikdy nebyly
součástí generované produkční grafiky.

## 1. Forest crystal reward

```text
Use case: ui-mockup
Asset type: 1280x720 full-screen game UI concept for Little Math Adventure,
post-boss reward reveal.

Create the moment immediately after defeating the Verdant Guardian, when the
unique quest item Krystal lesa appears. Match the supplied Guardian Lair and
town UI references. Show the same enchanted forest shrine after victory, with
hostile corruption receded. One large emerald-green faceted quest crystal with
subtle golden leaf-vein inclusions floats above the root-and-stone shrine,
surrounded by restrained leaf particles and a turquoise-green aura.

Add one empty dark-wood title plaque with bronze trim at the top, one empty
dark story panel in a canonical wood-and-bronze frame at the lower center, and
one empty compact medieval action-button frame at the bottom right. Keep all
elements separated and leave clean areas for runtime Czech text.

High-quality painterly 2D children's fantasy game, dark teal forest, moss
green, muted wood, aged bronze, cyan/violet UI accents. No text, characters,
boss corpse, inventory HUD, fake letters, watermark, or logo.

Reuse one canonical frame/source across related controls. Production UI is
composed from stable reusable frames, aligned normal/active icon states,
runtime text, and code-driven interaction. Do not bake labels into artwork.
All static UI will be represented in scenes.json and positioned through
SceneBuilder.
```

## 2. Zyx rocket interlude

```text
Use case: ui-mockup
Asset type: 1280x720 full-screen narrative game scene concept for Little Math
Adventure, between Verdant Forest and Silverpond.

Keep the supplied crash-site recognizable as the same location and the same
rounded alien capsule. Show it visibly partly repaired with pale lavender patch
plates, a small wooden scaffold, brass tools, cyan-violet energy cables, and an
open service hatch. It must remain grounded, damaged, and not flight-ready.

Match the supplied Zyx reference: a friendly small pink-lavender crystal-shaped
alien mathematician with huge round glasses and blue eyes. Zyx points toward
the repaired section. A single chibi child knight faces Zyx and holds the large
emerald Krystal lesa with gold leaf veins. A stone path continues right toward
distant blue lake cliffs and Silverpond, with one inactive blue-and-bronze
right-facing exit arrow.

Add one wide empty dialogue panel along the bottom, using the canonical dark
wood, bronze, and crystal-accent frame. Include an empty circular Zyx portrait
socket and one empty compact action button. Do not overlap the characters.

High-quality painterly 2D children's fantasy adventure, warm afternoon light,
small cool alien-tech glow. No text, extra NPCs, duplicate rockets, fake
lettering, watermark, or logo. Keep text, labels, hit areas, localization, and
states in runtime layers. Static hosts live in scenes.json and read layout from
SceneBuilder.
```

### Rocket-shape revision

```text
Use case: precise-object-edit

Use the rocket-interlude concept as the edit target and the supplied opening
scene screenshot as the authoritative rocket-shape reference. Change only the
rocket body. Preserve the forest, Silverpond view, path, arrow, lighting, Zyx,
hero, Krystal lesa, vegetation, and complete blank dialogue UI.

Make the rocket a low horizontally elongated alien escape pod in side view,
with a rounded stacked ring-like rear, a broad curved upper shell, and a lower
wedge body tapering into a sloped blunt nose. Include exactly one large circular
side porthole with a pale brass ring and exactly one warm-white round headlight
near the nose. Use the intro vehicle's pearlescent white shell with pink,
lavender, and cyan reflections, plus visible cracks.

Retain restrained lavender repair plates, brass rivets, the small wooden work
scaffold, tools, and two blue-violet cables. Keep the vehicle unfinished and
grounded. Avoid a cylinder, sphere, barrel, large open front tunnel, second
porthole, wings, fins, or a flight-ready redesign. Do not add text or alter UI.
```

## 3. Crystal machine puzzle

```text
Use case: ui-mockup
Asset type: 1280x720 full-screen puzzle interface for Zyx's ship crystal
installation machine.

Create a close-up of a child-friendly alien control console inside the partly
repaired capsule. Use pale lavender curved metal, aged brass clamps, dark inset
panels, cyan-violet cables, and crystal lenses.

At the top, add one empty title plaque and exactly three identical large
quest-crystal sockets in a shared master frame. The left socket is open with an
emerald outline; the middle and right sockets are inactive behind simple metal
shutters.

In the center, add one large dark calibration board. Green energy enters from
the left, travels through exactly three identical chunky circular conduit
modules, and reaches one blank hexagonal target display on the right. Each
module has a clean blank number face; add two clean blank operator plates
between modules. Leave generous areas for runtime numerals and operators.

At the bottom left, place the unique emerald Krystal lesa with gold leaf veins
in an open cradle. Add exactly four identical selectable blank number tiles in
one row and one empty reusable action-button frame at the bottom right. Include
one small empty circular Zyx portrait socket.

High-quality painterly 2D children's fantasy-tech UI, strict alignment, tactile
controls, dark charcoal and wood, aged bronze, lavender metal, cyan-violet
cables, emerald-gold crystal. No text, numerals, operators, pseudo-writing,
characters, watermark, or logo.

Use reusable stable layers. Normal and active states share identical geometry;
only glow, light, and compact particles change. Runtime code owns text,
numbers, operators, localization, hit areas, layout, and disabled state.
Static hosts live in scenes.json and read position/depth from SceneBuilder.
```

## 4. Isolated production candidates

All isolated candidates use the built-in image-generation path on a perfectly
flat `#ff00ff` chroma background. The background was removed locally and each
result was normalized once on a fixed transparent canvas.

### Dialogue structure

```text
Recreate only the Zyx interlude's structural dialogue frame: one large circular
portrait medallion overlapping the left edge of a long low blank dialogue
panel. Match the dark walnut, aged bronze, cyan-violet crystal ornaments, and
dark green-black inset from the mock. No portrait, button, text, scene, glow,
or shadow. Straight front view with generous padding on uniform #ff00ff.
Runtime portrait, dialogue, speaker name, localization, and interaction remain
separate layers.
```

### Dialogue action frame

```text
Create one empty compact horizontal action-button frame matching the dialog
mock and isolated canonical frame: dark charcoal inset, dark-walnut rail, aged
bronze trim, angular end caps, and two tiny violet-blue crystal accents. No
text, icon, shadow, or alternate bitmap states. Straight front view with
generous padding on uniform #ff00ff. Hover and pressed feedback will be
code-driven without changing geometry.
```

### Krystal lesa

```text
Create exactly one isolated tall symmetrical emerald quest crystal matching the
reward and machine references: pointed top and bottom, broad faceted center,
cyan-mint edge highlights, translucent depth, and one branching golden
tree/leaf-vein inclusion through the center. No pedestal, cradle, particles,
outer glow, text, or extra objects. Straight front view with generous padding
on uniform #ff00ff. Runtime owns the aura, leaves, reward animation, and layout.
```

## 5. Clean rocket-interlude gameplay background

Generated with the built-in image-generation tool as a new 16:9 raster
background, then deterministically center-cropped and resized to `1280×720`
WebP. Characters, dialogue UI, text, and the carried crystal remain runtime
layers.

```text
Create a clean 16:9 gameplay background for a painterly 2D children's fantasy
adventure. Match the supplied opening-scene rocket silhouette: a low,
horizontally elongated alien escape pod in side view with a rounded ring-like
rear, broad curved pearlescent white shell, one large brass-rimmed circular
porthole, and a sloped blunt nose with one warm round headlight. The ship is
grounded and only partly repaired: visible cracks, restrained lavender repair
plates, a small wooden scaffold, tools, and a few blue-violet cables.

Place the ship on the left side of a bright forest clearing. Leave open,
walkable ground in the middle for Zyx and the hero. A clear dirt-and-stone path
must enter from the right edge and lead into the middle. Place one environmental
wood-and-bronze arrow sign on the far right pointing right toward distant
Silverpond and its blue lake. Warm storybook lighting, cohesive with Little
Math Adventure, crisp game-background composition.

No characters, no player, no Zyx, no crystal in the foreground, no dialogue
panel, no buttons, no title, no labels, no pseudo-writing, no HUD, no watermark,
no logo. Background only.
```

## 6. First-grade story pictograms

Generated in one built-in image-generation call as a shared `2×2` sheet, then
chroma-keyed and split by the exact grid into identical transparent `512×512`
canvases. The rocket screenshot, production Krystal lesa, and Verdant Guardian
spritesheet were supplied as visual references.

```text
Use case: illustration-story
Asset type: one 2x2 production pictogram sheet for a first-grade children's
game story UI.

Match the supplied Little Math Adventure painterly children's fantasy style.
Create exactly four isolated, immediately readable story pictograms arranged
in a strict 2x2 grid of four equal square cells:

TOP LEFT — the same low pearlescent damaged alien escape pod, clearly cracked,
with exactly one small emerald forest crystal falling away from it.
TOP RIGHT — the tree-like Verdant Guardian gently protecting the emerald forest
crystal with one curved arm; keep the crystal fully visible.
BOTTOM LEFT — Zyx with both hands open, happily waiting to receive the emerald
forest crystal floating just in front of him.
BOTTOM RIGHT — a simple child-friendly alien ship control machine with exactly
three large crystal sockets in one row; the first glows emerald and the other
two are dark and empty.

Each cell contains one centered compact icon composition at identical visual
scale with generous padding. Strong silhouettes and simplified details,
readable at 96–140 px. No text, letters, numbers, arrows, UI frames, cards,
panels, buttons, watermark, logo, scenery, or extra objects.

Use a perfectly flat solid #ff00ff chroma-key background with no cast shadow,
ambient scenery, ground plane, gradients, texture, or lighting variation.
Do not use #ff00ff in the subjects. Runtime code owns all text, labels, frames,
layout, hit areas, localization, and interaction.
```
