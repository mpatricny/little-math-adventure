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
