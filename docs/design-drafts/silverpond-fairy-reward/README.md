# Silverpond Fairy Reward

Production story reward shown after the first completion of Silverpond Water
Arena 3 and available directly from the main menu as `SILVERPOND: DAR VÍLY`.

## Runtime assets

- `public/assets/images/story/silverpond-fairy-reward/arena-restored.webp`
- `public/assets/ui/story/silverpond-fairy-reward/`
- `public/assets/sprites/silverpond/lake-fairy-idle.webp`
- `public/assets/sprites/silverpond/lake-fairy-give.webp`

## Reproducible pipeline

1. `prepare-silverpond-fairy-reward-assets.py` normalizes the generated bitmap
   sources and exports transparent WebP UI layers.
2. `sorceress-lake-fairy-animations.sh` creates the one-second source motions.
3. `sorceress-lake-fairy-autosprite3-every4.sh` keys and samples them with
   AutoSprite V3 Every 4.
4. `assemble-lake-fairy-production-sheets.py` selects the approved continuous
   windows and exports the runtime sprite sheets.

No API key is stored in the repository. The scripts read it silently from stdin.

## Runtime layout review — 4 November 2026

The tablet photo in Downloads exposed dialogue crossing the decorative frame,
an action inside the same text area, and characters covered by the lower panel.
The scene now uses separate editor hosts and safe content areas, uniform artwork
scaling, constructor `resolution: 2` text, and short labels. A moving scale,
underwater hero, breathing bubbles and a check show the reward without reading.
The completed state stays visible until the player chooses to continue.

Sol 6.1 (xhigh) implemented the change. Independent parent review requested two
follow-ups: refresh the stale development asset manifest, and keep the received
scale above the underwater illustration while retaining a balanced completion
card. Both were corrected before acceptance. The development server on port
8001 was restarted and the full sequence checked again from a fresh context.

Actually inspected final captures, relative to the repository root:

- `artifacts/silverpond/fairy-review-tablet-intro.png`
- `artifacts/silverpond/fairy-review-tablet-pressed.png`
- `artifacts/silverpond/fairy-review-tablet-reward.png`
- `artifacts/silverpond/fairy-review-tablet-no-words.png`
- `artifacts/silverpond/fairy-review-tablet-disabled.png`
- `artifacts/silverpond/fairy-review-tablet-complete.png`

These independent captures use 1024 × 768 Chromium Canvas on port 8001. Labels
stay within their insets, characters and controls are separate, the button hit
area remains fixed through hover/press/pointer-out, and frame proportions are
preserved. The reward and its confirmation remain understandable with words
hidden and audio muted. Touch input successfully reached the reward, completion
and return scene. All checked text sources and styles report resolution 2; no
required texture was missing. Real player saves were isolated from the review.

Additional agent-reviewed captures use the prefixes
`artifacts/silverpond/fairy-desktop-webgl-` and
`artifacts/silverpond/fairy-tablet-canvas-`, including solo/co-op, 1280 × 800,
hover, pressed, pointer-out, disabled and completion states. The focused
`fairy-reward.spec.ts` suite passed 6/6 cases, and
`SilverpondProgressSystem.test.ts` passed 6/6. Save checks cover immediate ability
grant, seen-state on receipt, replay and unchanged saves in test mode.

No database migration is needed for these isolated frontend checks. The agent's
full TypeScript check still reported existing errors outside this scene, with no
diagnostic in the edited scene. Tablet coverage is browser emulation; the
physical device from the reference photo was not directly exercised.
