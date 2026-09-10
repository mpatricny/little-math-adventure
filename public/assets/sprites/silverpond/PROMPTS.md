# Silverpond enemy frog sprites

## `frog-enemy-idle-sheet.png`

- Source enemy concept: `public/assets/images/concepts/silverpond-creatures/enemy-forms/01-lekninovy-zabak-enemy.png`
- Tamed-form reference: `public/assets/images/concepts/silverpond-creatures/01-lekninovy-zabak.png`
- Output: six 512 x 512 frames on one transparent 3072 x 512 horizontal spritesheet

Image generation prompt:

> Create a precise 6-frame idle animation sprite sheet for the supplied corrupted Silverpond enemy frog. Preserve the exact character design, colors, crystal growths, lily-pad hat, flower, proportions, three-quarter side-facing battle pose, rendering style, and light direction. The frog must remain confused and aggressively alert in every frame, clearly an enemy rather than a friendly pet. Arrange exactly six equally sized frames in a strict 3-column by 2-row grid, read left-to-right and top-to-bottom: neutral tense crouch; slight inhale with throat bubble expanding; peak inhale; quick suspicious blink; exhale with throat bubble contracting; return to neutral. Use only subtle breathing, throat-bubble pulsing, tiny crystal-glow variation, and one blink. Keep feet, body center, camera, silhouette scale, and ground baseline locked across all cells. No attacks, jumps, turns, extra limbs, duplicate characters, text, borders, shadows crossing cells, or cropped anatomy. Put the character on a perfectly flat solid chroma-green #00ff00 background with no texture, gradient, lighting, vignette, or cast shadow on the background. Crisp polished 2D fantasy game sprite art matching the source.

Post-processing notes:

- Removed the chroma-green background with the shared ImageGen chroma-key helper.
- Split the 3 x 2 source grid without independent trimming.
- Applied one shared 37 px vertical correction to the second row.
- Reassembled all frames on identical transparent canvases.
