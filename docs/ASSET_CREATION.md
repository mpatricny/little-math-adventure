# Asset Creation Workflow

This document captures the current workflow used for preparing game-ready bitmap UI assets from generated concept art.

## Creature Animation from a Video Model

For production creature idle, attack, hurt, and similar animation, the video-first
workflow means generating new motion with an actual image-to-video model. It does
not mean converting an existing spritesheet into a video container or simulating
motion with vertical stretching, affine transforms, frame morphing, or full-body
cross-fades.

Use a canonical full-body reference with generous padding and require a locked
camera, locked scale, locked ground baseline, stable anatomy, stable art style,
and the entire creature to remain safely inside the frame for the whole take.
Prompt attack effects and moving extremities with enough additional safety margin
for their maximum reach.

Review the source video before frame extraction. Reject the whole take if any
foot, limb, headwear, crystal, weapon, particle, shadow, or effect touches or
crosses a frame edge, or if the camera, anatomy, silhouette, textures, lighting,
or background drift. Do not attempt to rescue a rejected take by cropping frames
individually.

Only after the clip passes visual review should it be sampled into frames. Apply
one shared crop, translation, scale, origin, baseline, and transparent canvas to
the complete sequence, then inspect motion extremes and the assembled loop before
registering the spritesheet.

### Validated Sorceress and AutoSprite V3 Profile

The Silverpond Bubble Crab is the current production reference for this workflow.
Reuse this profile for new creatures unless their colors require a different flat
background:

1. Start from one approved, full-body canonical creature image. Choose a perfectly
   flat chroma color that is absent from the creature and its effects.
2. Generate each motion from that same image with Sorceress `autosprite_animate`,
   the `imagine-1.5` image-to-video model, `720p`, and a requested duration of one
   second. The model may return a longer physical clip; select one continuous
   action window of about one second instead of using the whole take.
3. Require a locked camera, character scale, ground baseline, lighting, palette,
   and anatomy. Keep generous empty background around the maximum motion extent.
   The complete creature and every effect must remain inside every source frame.
4. Reject the video before extraction if a contact sheet reveals edge clipping,
   framing drift, camera movement, duplicate or missing anatomy, palette/style
   drift, silhouette ghosting, or background motion.
5. Sample a continuous window every fourth source frame. At a 24 FPS source this
   produces a 6 FPS game animation. The crab uses 13 unique idle frames and seven
   frames for each one-shot combat action. A non-matching idle endpoint may use a
   forward-then-reverse playback sequence; do not duplicate the two turning frames.
6. Use AutoSprite V3 CorridorKey to estimate alpha, but retain the source video's
   RGB. Protect the high-confidence creature core, apply conservative chroma alpha
   and local despill, and remove only tiny disconnected alpha components. Do not
   recolor the whole subject or aggressively erase green-adjacent details.
7. Put every sampled frame on the same transparent `512x512` canvas with one shared
   transform, scale, origin, and baseline. Never crop or normalize frames
   independently.
8. Review the extracted first, last, and motion-extreme frames on both dark and
   light contact sheets, then review the assembled animation at 6 FPS.
9. Assemble frames horizontally and export WebP with quality `88`, method `6`,
   lossy RGB, and exact alpha. Register the sheet in `textures.json`, the motions
   in `animations.json`, the Scene Editor asset in `assets.json`, and the enemy in
   `enemies.json` plus localization.
10. For the current BattleScene contract, provide both `*-attack` and
    `*-attack-anim`. Keep a requested defense available as `*-defend` and alias it
    to `*-hurt`; keep defeat as `*-defeat` and alias it to `*-death`.

The reproducible Bubble Crab scripts are:

```text
scripts/sorceress-bubble-crab-combat.sh
scripts/build-bubble-crab-combat-autosprite3-every4.py
scripts/assemble-bubble-crab-production-sheets.py
```

API keys must be read interactively or from a non-versioned environment source;
never place them in scripts, metadata, documentation, or committed files.

## Mandatory UI Prompt Context

Before creating any visible UI, use the existing game design language and decide which parts are structural, stateful, and textual. Related controls must share one canonical frame/source. A production control is composed from a stable reusable frame, aligned normal/active icon states, runtime text, and code/template animation; it is not a set of independently generated complete button images.

When prompting an image model, include these requirements explicitly:

```text
Match the supplied game UI reference and preserve one shared visual system.
Create only the requested structural frame or isolated icon pair; do not add text.
For a state pair, generate both states together with identical silhouette, pose,
scale, cell size, and placement. Change only light, glow, or compact particles.
Use a perfectly flat #00ff00 background with no cast shadow or ambient scenery.
Keep generous clear padding around every asset and do not crop any ornament.
The result will be chroma-keyed, split with one shared crop, centered on identical
transparent canvases, and composed with runtime text and code-driven interaction.
```

After generation, use one shared crop/translation for each state pair, keep every canvas identical, and verify normal, hover, pressed, pointer-out, disabled, and localized-text states in the running game. Never independently trim active artwork by its larger glow bounds.

## Production Button Guidance

Full generated buttons are useful for visual exploration, but they should not be the final implementation for stateful game UI. They bake frame, icon, text, and hover state into one bitmap, which makes hover variants drift visually and prevents consistent reuse.

Preferred final approaches:

1. Use one complete reusable frame asset.
   - The frame includes the circular icon socket, wood/metal border, and empty gold label plate.
   - Add normal/active icons and runtime text as separate layers.
   - On hover, keep geometry stable: lift the surface by a few pixels, deepen the exact-frame shadow, cross-fade the aligned icon pair, and run one short highlight sweep. Do not scale or tint the whole root container.

2. Split that same frame into reusable structural parts.
   - Keep the circular cap fixed and place it above an overlapping 9-slice rail.
   - Stretch only the rail center; never stretch the circle, rivets, or end caps.
   - This supports labels of different lengths while preserving the same visual language.

In both approaches, generated art is an input to a deterministic component. Text, hit area, layout, and state transitions remain in code/template data.

The shop preparation buttons were first evaluated as three variants:

```text
Aktuální        full generated normal/hover bitmap, kept only as baseline
Alt 1: pevný rám  one complete frame + aligned normal/active icons + runtime text
Alt 2: 9-slice    fixed circular cap + overlapping 9-slice rail + the same icons/text
```

The production Shop Prep mock now uses `Alt 1`: one complete frame with separately aligned icons and runtime text. It renders the real `ShopScene` unchanged and adds compact instances of the same component directly below the existing sword and shield offers. Keep `Alt 2` only as a documented option when a future control genuinely needs variable width and a tested 9-slice rail.

The reusable implementation lives in `src/ui/MedievalActionButton.ts`. Configure its width, label, normal/active icon pair, accent color, depth, and click callback; keep placement in a `scenes.json` host. The Shop Prep mock uses the same component for both preparation actions and the medieval `KOUPIT` action.

## Prep Button V2 Generation Workflow

The V2 mock was built from three image-model outputs:

1. Frame edit: use the best existing complete button as the primary reference, remove its icon and lettering, and reconstruct an empty dark circular socket. Request one centered horizontal frame on flat `#00ff00`, with no glow or shadow.
2. Shield pair: generate exactly two copies of the same isolated shield side by side. The left is neutral; the right changes only by blue edge light and compact sparks.
3. Sword pair: generate exactly two copies of the same isolated sword side by side. The left is neutral; the right changes only by amber blade light and compact sparks.

For paired states, explicitly require the same silhouette, pose, scale, and equal square cells. Generate each normal/active pair together; do not generate the two states in separate calls.

Post-processing is deterministic:

1. Remove the flat background from the complete sheets with `remove_chroma_key.py`, soft matte, and despill.
2. Split each pair at the exact sheet midpoint.
3. Find one shared crop/translation per pair and apply it to both states. Do not independently trim and resize normal and active images, because their glow bounds differ and would make the underlying object jump.
4. Export both icon states on identical `256x256` transparent canvases.
5. Trim the frame once, fit it inside a `500x200` transparent canvas, then derive cap and rail assets from this normalized frame. This guarantees exact overlap in the 9-slice composition.
6. Verify the assets themselves and then verify normal, hover, pressed, and pointer-out states in the running scene.

## Chroma-Key Button Sheet Workflow

Use this workflow only for concept/prototype sheets or for extracting isolated decorative parts. Do not use it as the final implementation for interactive button hover states.

1. Generate one complete sprite sheet, not separate images per state.
   - For stateful UI, ask for all variants in one 2x2 sheet so the model keeps the same visual language, proportions, icon placement, and frame style.
   - Use a perfectly flat green background for later removal.

2. Clean the green background before alpha extraction.
   - Generated greens are often close to `#00ff00` but not exact.
   - Normalize the background locally, for example with ImageMagick `-fuzz` and `-opaque`, so chroma removal has one clear key color.

3. Remove the background with the Codex image helper.
   - Preferred helper:
     ```bash
     uv run --with pillow python "$CODEX_HOME/skills/.system/imagegen/scripts/remove_chroma_key.py" \
       --input <green-source.png> \
       --out <alpha-output.png> \
       --key-color '#00ff00' \
       --soft-matte \
       --transparent-threshold 18 \
       --opaque-threshold 180 \
       --despill \
       --edge-contract 1 \
       --force
     ```
   - Validate that the output has an alpha channel and transparent corners.

4. Split the sheet deterministically.
   - Crop each quadrant from the alpha sheet.
   - For state pairs, use one shared crop and scale for both cells; never normalize glow states independently.
   - Resize the shared crop to the target canvas and preserve transparent padding.

5. Add text locally, not with image generation.
   - Text generated by image models is unreliable and may change the button artwork.
   - Use Pillow for text overlay when ImageMagick font rendering is unavailable.
   - Keep normal and hover labels identical except for subtle color/shadow changes.

6. Preview before integration.
   - Build a checkerboard preview for transparency and cropping.
   - Check that state changes do not shift the button silhouette, icon placement, or text position.
   - If the preview reveals that active/inactive variants differ structurally, keep the best image as an icon/source layer and move the hover state into code/template animation.

## Current Prep Button Assets

The mock preparation buttons are stored in:

```text
public/assets/ui/mock/prep-buttons/
```

The current game-ready mock files are:

```text
shield-charge-normal.png
shield-charge-hover.png
sword-sharpen-normal.png
sword-sharpen-hover.png
```

Each file is `500x200` with transparent background and centered content.

Earlier extracted icon-only experiments (not used by the V2 alternatives):

```text
prep-icon-shield.png
prep-icon-sword.png
```

V2 component assets:

```text
v2/prep-frame-v2.png             500x200 complete frame
v2/prep-frame-cap-v2.png         fixed circular cap for Alt 2
v2/prep-frame-rail-v2.png        9-slice rail source for Alt 2
v2/prep-shield-normal-v2.png     256x256 aligned icon state
v2/prep-shield-active-v2.png     256x256 aligned icon state
v2/prep-sword-normal-v2.png      256x256 aligned icon state
v2/prep-sword-active-v2.png      256x256 aligned icon state
```
