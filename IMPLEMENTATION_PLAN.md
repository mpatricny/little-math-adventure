# CharacterSelectScene Implementation Plan

## Problem Summary

The scene editor creates UI Element templates (wooden panel, styled buttons) that the game cannot render. The game only supports standard asset types: sprite, image, button, text, panel, container, nineSlice.

## Current State

- **Scene Editor**: Has visual UI Elements with templates (Character select panel, Green_button, Back button)
- **Game**: Renders basic buttons/labels from scenes.json using AssetFactory
- **Gap**: UI Element templates (`type: 'uiElement'` with `templateId`) not supported in game

## Solution Options

### Option A: Full UI Element Support (Complex)
- Load ui-element-templates.json in game
- Implement template rendering with nine-slice layers
- Handle text areas and effects
- **Pros**: Full feature parity with editor
- **Cons**: Significant development effort, complexity

### Option B: Export UI Elements as Static Images (Medium)
- Export panel/buttons as PNG images
- Add as regular image assets
- **Pros**: Quick, maintains visual appearance
- **Cons**: Loses dynamic text, effects

### Option C: Use Existing Game Assets + Background (Recommended)
- Add background image as regular game asset
- Keep existing button/label system
- Position elements using scene-layouts.json overrides
- **Pros**: Minimal changes, works with existing system
- **Cons**: Buttons won't have fancy styling

## Recommended Implementation (Option C + partial B)

### Step 1: Copy Library Assets to Game
Copy these library images to `public/assets/images/`:
- `New_game_background-1280` -> `char-select-bg.png`
- `alternate title_scroll` -> `char-select-scroll.png` (optional)

### Step 2: Add to textures.json
```json
{
  "images": {
    "char-select-bg": "images/char-select-bg.png",
    "char-select-scroll": "images/char-select-scroll.png"
  }
}
```

### Step 3: Add Asset Definitions (assets.json)
```json
{
  "ui": {
    "backgrounds": {
      "char-select-bg": {
        "type": "image",
        "texture": "char-select-bg",
        "origin": [0.5, 0.5],
        "depth": -10
      }
    }
  }
}
```

### Step 4: Update scenes.json CharacterSelectScene
Add background element:
```json
{
  "elements": [
    {
      "id": "background",
      "asset": "ui.backgrounds.char-select-bg",
      "x": 640,
      "y": 360
    }
  ]
}
```

### Step 5: Keep UI Elements in 'ui' section
The existing buttons and labels continue to work via the current system.

## Files to Modify

1. `/public/assets/images/` - Add new image files
2. `/public/assets/data/textures.json` - Register new textures
3. `/public/assets/data/assets.json` - Add asset definitions
4. `/public/assets/data/scenes.json` - Add background element

## Testing

1. Run game and navigate to CharacterSelectScene
2. Verify background image displays
3. Verify character selection still works
4. Verify buttons still function

## Future Enhancement

To fully support UI Element templates in the game:
1. Add ui-element-templates.json loading in BootScene
2. Create UiElementFactory.ts for rendering templates
3. Extend SceneBuilder to detect type: 'uiElement' and use UiElementFactory
4. Implement nine-slice layer rendering
5. Handle text areas with overrides
