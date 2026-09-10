# Silverpond underwater — first playable slice assets

## Map passage corrections (2026-09-07)

Generated as four precise-object edits using the **imagegen skill, built-in tool mode**. Original backgrounds are preserved. Runtime paths below are selected in `textures.json`; the scene's independent hosts were aligned to the actual reviewed openings. No creature animation or UI text was generated. Full topology audit: [UNDERWATER_PASSAGES.md](UNDERWATER_PASSAGES.md).

Normalization: uniform cover and centered extent from 1672 × 941 to 1280 × 720, WebP quality 88. No non-uniform scaling, no paint edits or compositing outside the image model. All four results and their assembled game views were visually inspected.

### hub

Edit target: `public/assets/images/underwater/bell-hub.webp`.

Runtime asset: [bell-hub-passages.webp](/Users/datamole/little-math-adventure/public/assets/images/underwater/bell-hub-passages.webp).

Source: `/Users/datamole/.codex/generated_images/01a0634c-26ba-70b2-a3ad-2671b91e400b/exec-a0f19b5b-cfcd-4bfd-a0f8-fc02e956e52c.png`.

Final prompt:

```text
Use case: precise-object-edit. Asset type: production 16:9 full-bleed underwater RPG environment background. Image 1 is the EDIT TARGET. Preserve the existing polished painterly Silverpond art, turquoise freshwater light, patinated brass, pale stone, camera, proportions, floor perspective and scene geometry outside the specified edits. This is a precise architectural connectivity correction, NOT a redesign. Match the supplied game visual language and reuse its canonical architectural motifs. No text, labels, numbers, arrows, UI frames, characters, enemies, chests or loose puzzle props. Existing UI remains separately composed from stable reusable frames, aligned normal/active icons, runtime text, localized labels, hit areas, disabled states and code animation; all static positions/depths stay in SceneBuilder. No UI/control generation, no baked hover glow, no stretching. Keep the top HUD strip and lower traversable floor clear. Preserve the exact original framing/aspect ratio. Door positions below refer to a 1280x720 canvas and scale proportionally.
Keep all THREE current open walking passages exactly where they are: left x209 y406, central below the bell x658 y414, right x1090 y411. Keep the bell, tower, stairs, healing fountain at x895 y474 and all floor geometry unchanged. The small healing fountain is a closed-back niche with visible water, NOT a passage.
Add exactly THREE architectural connections:
1) A visibly CLOSED narrow monumental double door in the broken stone wall LEFT of the bell tower, centered x414 y365, inner width125 height205. Its top around250 and threshold470. Pale stone and restrained old bronze door panels, two empty round seal sockets. Clear solid doors, not a dark open tunnel. Small original-style stone steps join existing floor. Do not cover the left passage or bell tower.
2) An oval SHELL-CARVED return-current tunnel mouth at far LEFT x68 y432, inner width86 height116, pale nacre trim. Clearly a low outflow duct pointing into this courtyard, not another towering arch. This replaces a small patch of corner rubble/flowers only, does not cover the left main passage at209. Open dim turquoise inside, no grate. A short shallow stone runnel leads from it to courtyard floor.
3) An oval PATINATED BRASS return-current tunnel mouth at far RIGHT x1207 y432, inner width86 height116. Same tunnel geometry as left but concentric brass rims and subtle pipe connection instead of shell trim. Open dim turquoise inside, no grate. Short runnel into courtyard.
FINAL CONNECTION COUNT: three existing open main passages + one closed main double door + two low oval return-current mouths = SIX physical connections. No other doors. Integrate everything naturally; the three additions must not look pasted on.
```

### canal

Edit target: `public/assets/images/underwater/sunken-canal.webp`.

Runtime asset: [sunken-canal-passages.webp](/Users/datamole/little-math-adventure/public/assets/images/underwater/sunken-canal-passages.webp).

Source: `/Users/datamole/.codex/generated_images/01a0634c-26ba-70b2-a3ad-2671b91e400b/exec-e52db1d0-15c9-41bb-85a2-512efebf113b.png`.

Final prompt:

```text
Use case: precise-object-edit. Asset type: production 16:9 full-bleed underwater RPG environment background. Image 1 is the EDIT TARGET. Preserve the existing polished painterly Silverpond art, turquoise freshwater light, patinated brass, pale stone, camera, proportions, floor perspective and scene geometry outside the specified edits. This is a precise architectural connectivity correction, NOT a redesign. Match the supplied game visual language and reuse its canonical architectural motifs. No text, labels, numbers, arrows, UI frames, characters, enemies, chests or loose puzzle props. Existing UI remains separately composed from stable reusable frames, aligned normal/active icons, runtime text, localized labels, hit areas, disabled states and code animation; all static positions/depths stay in SceneBuilder. No UI/control generation, no baked hover glow, no stretching. Keep the top HUD strip and lower traversable floor clear. Preserve the exact original framing/aspect ratio. Door positions below refer to a 1280x720 canvas and scale proportionally.
Keep the THREE current walking passages unchanged: far left x170 y413, small rear right of wheel x877 y379, far right x1120 y430. Keep every pipe, central wheel housing position x650 y362 and floor.
Add exactly ONE fourth walkable-size opening at x361 y405, inner width106 height160, occupying only the low rubble/stairs between the far-left doorway and central wheel structure. It is a natural rough-stone arched grotto entrance, top325 threshold485, clearly CLOSED by a solid interlocking stone slab with subtle blue-violet mineral seams, not an open glowing portal. Integrate its rocky surround under the existing overhead pipe; no overlap with the left doorway or wheel housing. Make it a distinct fourth route.
Important: the central LARGE circular wheel socket is machinery, NOT a fifth walking route. Replace ONLY the view through its circular interior with a solid recessed dark blue-green stone backplate; preserve circular stone trim, teal roof and all surrounding architecture. The rotating wheel is a separate game sprite, do not paint a new wheel.
FINAL WALKING CONNECTION COUNT: three open arches + one visibly sealed rock doorway = FOUR. No new other openings.
```

### shrine

Edit target: `public/assets/images/underwater/shell-shrine.webp`.

Runtime asset: [shell-shrine-passages.webp](/Users/datamole/little-math-adventure/public/assets/images/underwater/shell-shrine-passages.webp).

Source: `/Users/datamole/.codex/generated_images/01a0634c-26ba-70b2-a3ad-2671b91e400b/exec-881e66a1-7ac0-411f-9852-f1054e20bbda.png`.

Final prompt:

```text
Use case: precise-object-edit. Asset type: production 16:9 full-bleed underwater RPG environment background. Image 1 is the EDIT TARGET. Preserve the existing polished painterly Silverpond art, turquoise freshwater light, patinated brass, pale stone, camera, proportions, floor perspective and scene geometry outside the specified edits. This is a precise architectural connectivity correction, NOT a redesign. Match the supplied game visual language and reuse its canonical architectural motifs. No text, labels, numbers, arrows, UI frames, characters, enemies, chests or loose puzzle props. Existing UI remains separately composed from stable reusable frames, aligned normal/active icons, runtime text, localized labels, hit areas, disabled states and code animation; all static positions/depths stay in SceneBuilder. No UI/control generation, no baked hover glow, no stretching. Keep the top HUD strip and lower traversable floor clear. Preserve the exact original framing/aspect ratio. Door positions below refer to a 1280x720 canvas and scale proportionally.
Keep the existing LEFT garden arch centered x224 y407 exactly unchanged. Preserve the giant scallop mosaic, central shallow altar centered x842 y445, steps, channels, pale paving and lighting.
Add ONE additional genuine return passage in the FAR RIGHT wall, centered x1150 y378, inner width112 height204, top276 threshold480. Replace only the rightmost decorative wall niche/foliage with a human-sized oval tunnel entrance framed in pale shell-carved stone and restrained nacre. This is the source of the shell return-current tunnel into the bell courtyard: same oval shell-carved rim motif, short channel going toward existing floor. Dim turquoise hollow interior with a gently curving tunnel, no view of another doorway, no painted gate/grate/kelp (a removable blocker is rendered separately in game). Keep it fully inside the image with generous edge margin. Do NOT cut or narrow the giant scallop mosaic or altar.
FINAL PASSAGE COUNT: exactly TWO: existing left garden arch and new right oval shell return tunnel. The giant central scallop remains visibly SOLID mosaic, NOT a doorway.
```

### chamber

Edit target: `public/assets/images/underwater/current-chamber.webp`.

Runtime asset: [current-chamber-passages.webp](/Users/datamole/little-math-adventure/public/assets/images/underwater/current-chamber-passages.webp).

Source: `/Users/datamole/.codex/generated_images/01a0634c-26ba-70b2-a3ad-2671b91e400b/exec-5e6faccf-7576-44ba-abfb-208f6fec106e.png`.

Final prompt:

```text
Use case: precise-object-edit. Asset type: production 16:9 full-bleed underwater RPG environment background. Image 1 is the EDIT TARGET. Preserve the existing polished painterly Silverpond art, turquoise freshwater light, patinated brass, pale stone, camera, proportions, floor perspective and scene geometry outside the specified edits. This is a precise architectural connectivity correction, NOT a redesign. Match the supplied game visual language and reuse its canonical architectural motifs. No text, labels, numbers, arrows, UI frames, characters, enemies, chests or loose puzzle props. Existing UI remains separately composed from stable reusable frames, aligned normal/active icons, runtime text, localized labels, hit areas, disabled states and code animation; all static positions/depths stay in SceneBuilder. No UI/control generation, no baked hover glow, no stretching. Keep the top HUD strip and lower traversable floor clear. Preserve the exact original framing/aspect ratio. Door positions below refer to a 1280x720 canvas and scale proportionally.
Keep the existing LEFT pipe-framed canal arch centered x224 y407 exactly unchanged, including the architecture visible beyond it. Preserve the large SOLID hydraulic wall mosaic, brass-turquoise channels, closed circular wall basins, central raised machine dais centered x820 y480, floor and lighting.
Add ONE additional genuine return passage in the FAR RIGHT wall, centered x1162 y364, inner width104 height202, top263 threshold465. Replace only the rightmost slender wall niche with an oval tunnel framed by concentric weathered brass rings, a discreet pipe connection and pale stone surround, fully inside the image. This is the source of the brass return-current tunnel into the bell courtyard: match the low oval brass-rimmed outflow motif but human-sized. Dim turquoise hollow interior and a curved tunnel, no second doorway visible inside. No gate/grate/kelp baked in because the removable blocker is a runtime layer. Leave the machine dais and the central wall mural unchanged.
FINAL PASSAGE COUNT: exactly TWO: existing left canal arch and new right brass oval return tunnel. All other decorative wall niches are SOLID closed shallow carvings, not passages.
```


## Two seals and joined lock (2026-09-07)

Generated with the **imagegen skill, built-in tool mode**. The garden is a targeted entrance edit; the two new rooms use the approved branch art as style and geographic reference. Old garden art remains available; the texture catalog now selects `reed-garden-v2.webp`. No creature animation was generated. Seals reuse the canonical shell/impeller and pearl as stable runtime compositions.

The lock has a single rusty backing with five forest metal bodies at an 86 px pitch (136 px source canvases). This deliberately joins the opaque frame bodies, not just their narrow side tabs. Separate 86 px hit areas meet without overlapping. The backing is independently positioned/depth-controlled by `wordBackingHost`; no complete decorative artwork is stretched.

Normalization: backgrounds use uniform cover resize and centered crop to 1280 × 720, WebP quality 88. Plate: skill `remove_chroma_key.py` (#00ff00, tolerance 75, despill, contract 1, feather 0.3), one trim, uniform contain in 560 × 146, centered on a 568 × 154 transparent canvas, WebP quality 88. Inputs, extracted plate and composed screens were visually inspected.

### Rusty lock backing

Runtime: `public/assets/images/underwater/lock-backing.webp`.

Original: `/Users/datamole/.codex/generated_images/01a0634c-26ba-70b2-a3ad-2671b91e400b/exec-e69412cf-8dbd-4a65-9d0f-4609b582e518.png`.

Exact final prompt:

Use case: stylized-concept. Asset type: a single reusable structural backing plate for a physical rotating letter lock in a children's underwater fairytale RPG. Input image 1 is ONLY the material reference for existing rusty metal lock frames; do not reproduce its slot, drum, glyphs or background. Make one long horizontal solid metal backing plate with gently rounded bevelled corners, aspect ratio about 3.8:1, dark weathered bronze with restrained orange surface rust and teal patina, tiny rivets only near its four corners. Quiet dark uninterrupted central surface, absolutely no holes, no slots, no letters, no numbers. Our five existing lock drums will be placed tightly touching on top of this backing in code. Match the supplied game UI reference and preserve one shared visual system. Create only this structural plate, no complete button and no lock mechanism. All stateful UI uses the SAME canonical plate with stable geometry; normal/active icon pairs if applicable must be together, with identical silhouette, pose, scale, cell size and placement and only light changes; this asset has no alternate states. Runtime text, labels, hit areas, layout, localization and disabled states belong in code and SceneBuilder, not in the art. Hover geometry stays fixed, effects are code-driven light, no whole-control scaling or recoloring. Use perfectly flat #00ff00 background with no cast shadow or ambient scenery, keep generous clear padding and no cropped ornaments. Result is chroma-keyed, one shared crop and uniform scale, centered on a transparent canvas, never independently trimmed states. Front-facing orthographic, no perspective skew, no exterior glow, no water or foliage. Plate fills middle 85 percent of image width, with ample green space above and below.

### Garden's shell passage

Runtime: `public/assets/images/underwater/reed-garden-v2.webp`.

Original: `/Users/datamole/.codex/generated_images/01a0634c-26ba-70b2-a3ad-2671b91e400b/exec-86f26b3b-3ee4-48b2-a432-83dd0e2cdf04.png`.

Exact final prompt:

Use case: precise-object-edit. Input image 1 is the EDIT TARGET, the approved 16:9 underwater reed garden background. Preserve the entire composition, colors, existing left and right teal-roofed arches, central basin, reeds, flowers, foreground paving, water rays, viewpoint, sharpness and framing. Change ONLY the distant narrow path in the rear CENTER behind the basin: at x50%, y47%, add a small but clearly traversable round pale stone doorway between the two existing ruined garden pillars, with a scalloped ivory shell carved over its lintel and lily roots hanging around it. Opening about 110px wide and 155px tall at 1280x720, dark teal inside, bottom at y59%. Its matching counterpart leads into a shell shrine. Keep the basin unchanged, it remains in front below and does NOT block the new opening. Do not alter any other paths or introduce more entrances. No characters, creatures, chests, UI, labels, text or digits. This is background architecture only; all lighting, click targets, blockers and text are separate runtime layers in SceneBuilder. Preserve original painterly storybook material quality, no stretched elements, no cropped scene.

### Shell shrine

Runtime: `public/assets/images/underwater/shell-shrine.webp`.

Original: `/Users/datamole/.codex/generated_images/01a0634c-26ba-70b2-a3ad-2671b91e400b/exec-cdc7bd31-973a-4b77-a17d-fc41486a491a.png`.

Exact final prompt:

Use case: stylized-concept. Asset type: NEW production 16:9 1280x720-background composition for Silverpond underwater fairytale RPG. Image 1 is ONLY reference for style, scale, lighting and the connecting garden doorway. Match the approved polished hand-painted pale weathered limestone, teal water, brass details and freshwater lilies. A beautiful LASTUROVA SVATYNE shell sanctuary beyond the reed garden. Nearly side-on exploration camera with a little broad floor visible, full-bleed landscape, no borders. EXACTLY ONE walk-through entrance on the LEFT centered x16%, y53%, about 125x200px at 1280 resolution, round pale stone arch with scalloped ivory shell carved on top, lily roots around it. Through the arch see the bright jade REED GARDEN with lily roots and the low basin, giving a clear return route. This is the reverse side of the garden's rear shell doorway. Central back wall is a grand carved scallop-shaped stone shrine, NOT another doorway: sealed solid nacre mosaic recess at x57%,y41%, with an EMPTY low scalloped altar/socket centered x55%,y62% for a separately rendered pearl mechanism. Right side solid worn stone wall, shell mosaics and roots, no extra portals or openings that suggest exits. Two graceful small water channels in the stone lead from altar toward foreground; all water is submerged. Plenty of uncluttered lower-third stone paving x20-90%, y68-88% for separately rendered heroes; subtle shafts from upper left, warm ivory shell highlights in turquoise, inviting and wondrous not spooky. No literal scales, no two balancing bowls, no painted creatures, people, chests, collectible seals, loose puzzle pieces, text, digits or UI. Reuse canonical blue enamel/pearl UI at runtime; keep interactive props, normal/active state layers, hit areas, text and SceneBuilder positions/depth separate. Do not bake controls or excessive glow into art.

### Current chamber

Runtime: `public/assets/images/underwater/current-chamber.webp`.

Original: `/Users/datamole/.codex/generated_images/01a0634c-26ba-70b2-a3ad-2671b91e400b/exec-b10fbc2f-b555-4c76-b10a-ffbccffe3c33.png`.

Exact final prompt:

Use case: stylized-concept. Asset type: NEW production 16:9 background for children's Silverpond underwater RPG. Image 1 is ONLY a style/material/geographic reference: existing sunken canal. Create its adjacent CURRENT CHAMBER beyond the SMALL round pale-stone back doorway to the right of the canal's wheel. Same polished hand-painted fairytale limestone, aged brass pipes with blue-green patina, underwater caustics, freshwater roots. Nearly side-on exploration camera and broad horizontal stone paving across lower third, full-bleed 16:9. EXACTLY ONE walkable entrance on LEFT centered x16%,y53%, about 125x200px at 1280 resolution: plain rounded weathered limestone opening, no tiled roof, a thick aged bronze supply pipe curling over it. Through the opening see the canal aqueduct and its big circular wheel housing as clear return landmark. Central and right chamber wall is a CLOSED elegant hydraulic mural with two branching channels and round empty mechanism sockets, NOT extra doorways. Distinct focal object: low broad stone control dais around x56%,y65%, empty surface for separate runtime puzzle prop. Paired shallow carved channels lead from dais to two decorative circular wall inlets; these are small solid inlets NOT people-sized portals. Keep foreground x22-90%,y68-89% clear for hero and two enemy sprites. Cool sapphire teal water with restrained amber pipe highlights, filtered diagonal light from upper left. Beautiful fantasy hydraulic hall, not industrial steampunk, not gloomy. No people, creatures, chests, moving gears or impellers, no seals, no UI, no labels, text, digits or arrows. Runtime props and effects use stable canonical assets, identical state geometry, uniform scaling and SceneBuilder-owned layout/text/hit areas, never bake UI or active states into the backdrop.





## Branch rooms and pump (2026-09-07)

Generated with the **imagegen skill, built-in imagegen mode**. Canonical style reference for all three: `public/assets/images/underwater/bell-hub.webp`. The existing fairy frame, pearl and creature animations are reused; no new creature video or animation was synthesized. The impeller uses one stable bitmap with runtime rotation and light.

### Reed garden

Runtime: `public/assets/images/underwater/reed-garden.webp`.

Original: `/Users/datamole/.codex/generated_images/01a0634c-26ba-70b2-a3ad-2671b91e400b/exec-5f88c080-b95b-4a22-ba79-ea6e11fd615b.png`.

Exact final prompt:

Use case: stylized-concept. Asset type: production 16:9 landscape background for Little Math Adventure's Silverpond underwater chapter. Input image 1 is ONLY a style/material reference of the existing bell courtyard, not an edit target. Generate a NEW room. Match its polished hand-painted fairytale RPG style, rounded weathered pale limestone, restrained brass/gold, detailed teal tiles and freshwater vegetation. Fully submerged magical freshwater lake, not marine coral reef. Side-on exploration camera with a little broad floor visible, similar perspective and scale as reference. Full-bleed 16:9 landscape, no borders. Lower third a clear wide horizontal sandy stone path for separately rendered heroes and enemies, from x15% to85%, y65% to88%. No people, no creatures, no treasure chests, no loose interactive items, text, digits, UI, logos or watermark. Interactive props and every label are separate runtime layers. Existing canonical blue enamel/pearl frames, stable aligned states, uniform artwork scaling and SceneBuilder-controlled layout will be reused; do not bake UI into the backdrop. Scene: the sunken REED GARDEN, a luminous enclosed old botanical terrace, jade reeds rising in elegant tall vertical clusters, lily leaves and long hanging lily roots forming a canopy. Left at x16%, y52% a clearly open ancient stone arch leads back to the bell courtyard. Right at x86%, y53% another clearly open slender arch curves into a pale aqueduct passage toward the canal. Leave the inside of both arches empty and dark teal so runtime light can illuminate them. In middle background x53%, y46%, a beautiful low oval stone garden basin with carved lily motifs, EMPTY central socket suitable for a separate pearly shell prop. Three or four large pearly white freshwater blossoms on the very outer edges, warm shafts of sunlight from upper left, subtle caustics. Garden is lush but middle foreground remains uncluttered. Distinct silhouette and vegetation from reference, no bell tower. Inviting quiet wonder, vibrant but muted jade, turquoise, pale warm stone.

### Sunken canal

Runtime: `public/assets/images/underwater/sunken-canal.webp`.

Original: `/Users/datamole/.codex/generated_images/01a0634c-26ba-70b2-a3ad-2671b91e400b/exec-ee580287-826a-4732-94cb-3758eef083c3.png`.

Exact final prompt:

Use case: stylized-concept. Asset type: production 16:9 landscape background for Little Math Adventure's Silverpond underwater chapter. Input image 1 is ONLY a style/material reference of the existing bell courtyard, not an edit target. Generate a NEW room. Match its polished hand-painted fairytale RPG style, rounded weathered pale limestone, restrained brass/gold, detailed teal tiles and freshwater vegetation. Fully submerged magical freshwater lake, not marine coral reef. Side-on exploration camera with a little broad floor visible, similar perspective and scale as reference. Full-bleed 16:9 landscape, no borders. Lower third a clear wide horizontal sandy stone path for separately rendered heroes and enemies, from x15% to85%, y65% to88%. No people, no creatures, no treasure chests, no loose interactive items, text, digits, UI, logos or watermark. Interactive props and every label are separate runtime layers. Existing canonical blue enamel/pearl frames, stable aligned states, uniform artwork scaling and SceneBuilder-controlled layout will be reused; do not bake UI into the backdrop. Scene: the submerged MILL CANAL, a splendid old hydraulic works built into silver-blue limestone ruins. A broad worn dry-looking stone terrace under water across foreground, shallow channel crossing behind it. Left at x16%, y52% clearly open narrow stone arch leads toward courtyard. Right at x86%, y53% clearly open arched passage leads into reed garden. Keep interiors empty for runtime portal lighting. Middle background x52%, y43% a large ornate circular EMPTY brass-and-stone wheel housing, around 230 screen pixels wide at 1280 render, set between curved pipes and aqueduct masonry; the actual turning impeller will be a separate sprite. Housing has no moving wheel, gears or glass. Patinated brass pipes curl around upper-middle; a distant aqueduct behind, delicate lily roots and sparse dark reeds along outer corners. Leave center-bottom and right-bottom clear for creatures and a separate reward chest. Cooler blue atmosphere than garden with soft gold highlights and diagonal filtered light shafts. Not steampunk factory, keep fairytale medieval charm, not gloomy or industrial. No bell tower.

### Pump impeller

Runtime: `public/assets/images/underwater/pump-impeller.webp`.

Original: `/Users/datamole/.codex/generated_images/01a0634c-26ba-70b2-a3ad-2671b91e400b/exec-da160ed3-1286-478e-9c31-47309dc1567c.png`.

Exact final prompt:

Use case: stylized-concept. Asset type: one isolated production interactive pump impeller prop for a children's underwater fairytale RPG. Image 1 is ONLY a style and material reference, not an edit target. One elegant antique circular six-bladed WATER IMPELLER, front facing, aged patinated bronze and brushed warm brass, broad beautifully curved paddle blades, luminous ivory nacre center hub, blue-green inlay, soft hand-painted dimensional shading, medieval Silverpond craftsmanship. Perfectly centered rotational axis. Complete circular silhouette, simple readable blades, no elaborate external cog teeth, no pipes, no housing, no text, no numbers, no water or scenery. Match the supplied game UI reference and preserve one shared visual system. Create only this canonical structural prop; do not add a frame. Runtime normal/active states reuse identical silhouette, pose, scale and placement; only code-driven light, glow and particles change. Use a perfectly flat #00ff00 background, no cast shadow or ambient scenery. Keep generous clear padding, nothing clipped. This will be chroma-keyed, uniformly contained in a transparent square canvas, no independent state trimming. Labels, hit areas, localization, disabled states and SceneBuilder position/depth stay in code. No baked exterior glow. Center the full prop inside 70 percent of a square image.

Normalization: backgrounds uniformly cover 1280 × 720 from 1672 × 941 sources, centered crop, WebP quality 88. Pump: skill `remove_chroma_key.py`, #00ff00, tolerance 75, despill, edge contract 1, feather 0.3; trim once, uniform contain at 468 × 468, centered on a transparent 512 × 512 WebP canvas. Source, extracted prop and room compositions were inspected.

### Existing forest lock parts reused after playtest

The underwater letter lock now reuses the actual `SpinLockPuzzleScene`/`spin-4` bitmap parts: `ba0defbd-11c09ddc.webp` (left), `8079d2f4-53b1f26a.webp` (middle), `f8527569-2691c918.webp` (right), and `ec482076-3216fa74.webp` (drum) from `public/assets/library/originals/`. Registered under `underwater-lock-*` keys. No new/generated bitmap, no stretching or recoloring. Runtime text rolls with the drum inside the same kind of mask as the forest lock; five independently positioned hosts replace the four-wheel forest layout. The canonical blue fairy frame is retained.

Generated with the built-in imagegen tool on 2026-09-06. Source reference: public/assets/images/mock/silverpond-town/silverpond-town-hub.webp. Both outputs were reviewed, then resized together to the game's 1280 × 720 viewport and encoded as WebP quality 88. No generated UI text, characters, chests or hit areas are baked into these backgrounds.

## Shallows

Runtime asset: [shallows.webp](/Users/datamole/little-math-adventure/public/assets/images/underwater/shallows.webp)

Source: /Users/datamole/.codex/generated_images/01a0634c-26ba-70b2-a3ad-2671b91e400b/exec-3ae33551-7e34-4868-a534-b93fec566fd7.png

### Final prompt

Use case: stylized-concept. Asset type: production 16:9 landscape background for a children's 2D point-and-click RPG, Silverpond underwater shallows. Image 1 is ONLY a style reference of the existing above-water town; create a NEW environment beneath that town, do not edit the town. Match its polished hand-painted fairytale storybook game style, soft expressive forms, detailed pale stone masonry, teal and gold medieval architecture. Camera side view with a little floor visible, NOT top down. Fully submerged freshwater lake, a luminous turquoise water ceiling high above with long gentle sunlight shafts. On the left, submerged weathered stone steps descend from the surface and pier supports. On the right in the distance, a half-buried stone arch leads toward ancient ruins. A broad clear sandy and pale stone horizontal traversable area across the lower third; large uncluttered space from x20% to85%, y55% to82% for separately rendered hero sprites and one fish enemy. Reeds and lily roots along outer edges, freshwater shells, gentle caustics on sand. Bright, wondrous, inviting not threatening. Sparse foreground foliage confined to very bottom corners, middle stays readable. No people, no creatures, no treasure chests, no interactive items, no numbers, no letters, no UI, no borders, no watermarks. Single seamless full-bleed environment, not a collage. All UI will be composed in code from existing canonical game frames with stable state layers, aligned icon states, runtime labels and hit areas via SceneBuilder; do NOT bake any controls or text into the backdrop.

## Bell hub

Runtime asset: [bell-hub.webp](/Users/datamole/little-math-adventure/public/assets/images/underwater/bell-hub.webp)

Source: /Users/datamole/.codex/generated_images/01a0634c-26ba-70b2-a3ad-2671b91e400b/exec-07b214eb-58de-411d-9d0e-eb054b82a0f7.png

### Final prompt

Use case: stylized-concept. Asset type: production 16:9 full-bleed background for children's 2D RPG. Input image 1 is ONLY a visual style reference for Silverpond, do not alter it; generate a NEW location fully underwater: the sunken bell tower courtyard, a safe exploration hub. Same polished hand-painted fairytale style, pale weathered stone, patinated brass and teal roofs, soft detailed forms. Central upper-middle landmark a beautiful squat ruined belfry with one clearly visible ancient bronze bell, lily roots and freshwater reeds growing around old architecture. The bell itself is static scenery; no puzzle numbers. Broad clear horizontal stone terrace across lower third for separate character sprites. Two distinct arches in mid-background toward left and right suggest diverging routes beyond the courtyard. A small calm illuminated spring niche just right of center. Deeper teal water than the shallows, amber sunlight shafts from upper left, luminous pale shells on outer edges. Inviting and magical, not dark or frightening. Camera nearly side-on with a little floor visible, not top-down. Keep lower middle and top band uncluttered for code-rendered hero/puzzle and HUD. No people, creatures, treasure chests, loose puzzle tokens, UI, text, labels, numbers, arrows, logos, watermarks. Single seamless composition. Existing canonical UI frames and aligned normal/active icon layers will be reused at runtime with SceneBuilder positions and text; no generated UI controls.

## Current art limits

Hero exploration reuses the existing idle animation inside a lightly floating magical aura; this is not a final swimming animation. The chest reuses the forest prop with a clearly marked claimed state. New production swimming/creature animations must follow docs/ASSET_CREATION.md (real image-to-video source, approved take, shared normalization).

## Hands-on interaction props (2026-09-06)

Generated through the built-in imagegen tool in reference-guided generation mode, not edits to the backdrop. Canonical reference for all three: `public/assets/images/underwater/bell-hub.webp`. Original generations are retained. Chroma extraction used the imagegen skill's `remove_chroma_key.py` with key #00ff00, tolerance 75, despill, edge contract 1, feather 0.3. Props were uniformly contained on transparent WebP canvases, never stretched. Both shells reuse exactly the same source; no alternative state bitmaps. Code supplies pearls, text, light, hit areas and animation.

### Bell instrument

Runtime: `public/assets/images/underwater/bell-instrument.webp` (512 × 512).

Original: `/Users/datamole/.codex/generated_images/01a0634c-26ba-70b2-a3ad-2671b91e400b/exec-44f27cbd-cc89-4fda-add4-b2f71abc7057.png`.

Exact final prompt:

Use case: stylized-concept. Asset type: isolated interactive game prop for Little Math Adventure's Silverpond underwater counting puzzle.
Image 1 is a STYLE reference only: the existing submerged belfry. Create a new close-up of its ancient bronze bell. One canonical front-facing full bell, complete hanging loop and small wooden suspension block, turquoise patina and restrained warm gold highlights, elegant engraved water-wave motifs, one tiny nacre gem, a visible clapper below the wide lip. Painterly polished fairytale RPG rendering, soft dimensional metal, child-friendly rounded silhouette. No environment, no masonry, no frame or plate, no text or numbers, no extra bells.
Match the supplied game reference and preserve one shared visual system. Create only the requested isolated structural prop; do not add text. Stateful light and interaction are composed in runtime code using this same silhouette; no alternate pose. Use a perfectly flat #00ff00 background with no cast shadow or ambient scenery. Keep generous clear padding on every side; no clipped loop, clapper, ornament, or effect. The result will be chroma-keyed with one shared crop and uniform scale, on a transparent square canvas. Labels, hit areas, disabled states, localization, position and depth are code and SceneBuilder-owned, not baked into art. No glow outside the bell silhouette; the game supplies animated lighting. Center the whole bell inside the middle 75% of a square image.

### Pearl shell

Runtime: `public/assets/images/underwater/pearl-shell.webp` (600 × 330).

Original: `/Users/datamole/.codex/generated_images/01a0634c-26ba-70b2-a3ad-2671b91e400b/exec-3d229875-b399-4618-9637-d78922c6a16c.png`.

Exact final prompt:

Use case: stylized-concept. Asset type: one isolated interactive pearl basin for a children's underwater game counting puzzle.
Image 1 is ONLY a style and material reference, the Silverpond submerged belfry. Create a single open freshwater fantasy clam shell as a shallow bowl, front view slightly from above. Broad oval nacre interior EMPTY so runtime pearls can be placed inside; the interior is dark desaturated teal with a luminous pearly rim, scalloped fan ribs outside, hand-painted dimensional edges, small gold/seafoam highlights. The open basin occupies the middle 75 percent width and 45 percent height of a square canvas. No pearls, no numbers, no text, no pedestal, no background scenery, no second shell.
Match the supplied game reference and preserve one shared visual system. Create only this structural game prop. All normal/active interactions will reuse exactly this silhouette with runtime light and particles, never swap shape. Use a perfectly flat #00ff00 background with no cast shadow or ambient scenery. Keep generous clear padding; no clipped shell tip or glow. This will be chroma-keyed, uniformly fitted to an identical transparent canvas and composed with runtime counters and pearls. Labels, hit areas, localization, disabled state, layout and depth belong in code/SceneBuilder. No generated text and no exterior glow.

### Sealed passage vegetation

Runtime: `public/assets/images/underwater/sealed-kelp.webp` (300 × 560).

Original: `/Users/datamole/.codex/generated_images/01a0634c-26ba-70b2-a3ad-2671b91e400b/exec-3b4e9d07-ad27-4840-978c-846bb15b8a50.png`.

Exact final prompt:

Use case: stylized-concept. One isolated production environment prop for the Silverpond underwater children's RPG. Use image 1 only as the canonical painterly style and color reference. Make a dense narrow upright tangle of freshwater aquatic plants that seals an abandoned doorway: tangled long curved jade and olive-green ribbon leaves, interwoven pliant stems, a few tiny pale blue freshwater flowers, old roots wrapped together near the bottom. Tall compact silhouette height roughly twice width. It must convincingly obstruct passage, not be a decorative outline around an empty center. Curved organic hand-painted leaves with soft dimensional shading, delicate gold-green highlights, cool deep teal shadows matching the existing ruined belfry. Complete plant mass contained inside image with generous clear padding. No doorway, no masonry, no frame, no scenery, no ground, no text, letters, numbers or UI. Perfectly flat #00ff00 key background, no cast shadow, no glow, no blur. Existing game design language is authoritative. Use one canonical prop silhouette; normal/active effects will reuse this asset via code, not image swaps. No generated text. Runtime labels, hit areas, disabled states, layout, position and depth belong in SceneBuilder/code. Uniform normalization and transparent padding, never stretch the silhouette. Only this plant obstruction, centered, no other objects.


## Nacre pearl — planning-puzzle revision (2026-09-06)

Generated using the **imagegen skill, built-in imagegen mode**. A single canonical bitmap replaces the former colored circles in the puzzle inventory, selected sockets, animated current and chapter progress lights. Normal, selected and feedback states reuse this same silhouette; code supplies labels and restrained effects.

Runtime: [pearl-nacre.webp](/Users/datamole/little-math-adventure/public/assets/images/underwater/pearl-nacre.webp), transparent 256 × 256 WebP, uniformly contained 224 px artwork.

Original: `/Users/datamole/.codex/generated_images/01a0634c-26ba-70b2-a3ad-2671b91e400b/exec-ded1a0f6-19dc-4ea8-9298-4eddcb09c8fe.png`.

Reference: `public/assets/images/underwater/pearl-shell.webp`. Normalization: skill `remove_chroma_key.py`, #00ff00, tolerance 75, despill, edge contract 1, feather 0.3; shared trim/translation, uniform resize into 224 × 224, centered on transparent 256 × 256. No independent state crops. Inspected on both a flat review background and the composed game screen.

Exact final prompt:

Use case: stylized-concept. Asset type: one isolated production pearl token for the Silverpond underwater children's RPG.
Input image 1: material and painterly style reference of our shell bowl, not an edit target.
Primary request: one beautiful natural freshwater pearl, slightly irregular round silhouette, creamy ivory nacre with subtle pink, gold and teal iridescence, softly shaded dimensional spherical body, layered pearly surface texture, one restrained soft reflection at upper left, cool underside. It must read as a hand-painted physical treasure, not a flat colored circle, bubble, glass sphere, metal ball or glowing orb. Polished fairytale RPG quality, readable when reduced to 24–60 pixels.
Match the supplied game UI reference and preserve one shared visual system. Create only this canonical isolated token, no text. Runtime state effects reuse this exact silhouette and placement: aligned normal/active geometry, only code-driven light, glow or compact particles change. Use a perfectly flat #00ff00 background with no cast shadow or ambient scenery. Keep generous padding around the entire pearl, no clipped highlight or ornament. The result will be chroma-keyed, uniformly scaled and centered on one transparent canvas; never independently trim states. Labels, hit areas, layout, disabled states, localization and SceneBuilder position/depth remain in code. Do not render a frame, shell, other objects, letters, digits, decorations, external glow or checkerboard. A single centered pearl occupies about 65 percent of the square image.
