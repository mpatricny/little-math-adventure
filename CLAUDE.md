# Little Math Adventure - Development Rules

## Scene Editor Compatibility

The game uses a **Scene Editor** (`/Users/datamole/SimpleGame/scene-editor`) to visually position elements. To ensure changes made in the scene editor are respected by the game code, follow these rules:

### Data Flow Architecture

```
scenes.json       → Defines elements and their assets
assets.json       → Defines asset properties (textures, types, etc.)
textures.json     → Maps texture keys to file paths
scene-layouts.json → Scene editor overrides (position, depth, scale)
```

**Priority**: `scene-layouts.json` overrides take precedence over `scenes.json` values.

### Rule 1: All Visible UI Elements Must Be in scenes.json

Every element that should be positionable in the scene editor must have an entry in `scenes.json`:

```json
{
  "id": "myElement",
  "asset": "ui.myAsset",
  "x": 100,
  "y": 200,
  "depth": 10
}
```

Even programmatically-created UI should have a placeholder element in scenes.json so the scene editor can see and position it.

### Rule 2: Read Positions from SceneBuilder

For programmatic UI, read positions from sceneBuilder placeholder elements:

```typescript
// Good - reads from JSON
const element = this.sceneBuilder.get('myElement') as Phaser.GameObjects.Container;
const x = element?.x ?? 100; // fallback if not found
const y = element?.y ?? 200;
this.myUI = this.add.container(x, y);

// Bad - hardcoded positions
this.myUI = this.add.container(100, 200);
```

### Rule 3: Read Depths from getLayoutOverride()

**Critical**: Don't read depth from game objects - they get initial values from scenes.json, not scene-layouts.json. Use `getLayoutOverride()` to read depths directly from scene-layouts.json:

```typescript
// Good - reads depth from scene-layouts.json
const depth = this.sceneBuilder.getLayoutOverride('myElement')?.depth ?? 10;
this.myUI.setDepth(depth);

// Bad - reads from game object (gets scenes.json value, ignores layout overrides)
const element = this.sceneBuilder.get('myElement');
this.myUI.setDepth(element?.depth ?? 10);

// Bad - hardcoded depth
this.myUI.setDepth(10);
```

### Rule 4: Pass Layout Values to Creation Functions

When creating complex UI in helper functions, pass positions and depths as parameters:

```typescript
// Good pattern
private create(): void {
    const panel = this.sceneBuilder.get('statsPanel');
    const panelDepth = this.sceneBuilder.getLayoutOverride('statsPanel')?.depth ?? 10;

    this.createStatsPanel(
        panel?.x ?? 800,
        panel?.y ?? 100,
        panelDepth
    );
}

private createStatsPanel(x: number, y: number, depth: number): void {
    this.statsPanel = this.add.container(x, y);
    this.statsPanel.setDepth(depth);
    // ... rest of creation
}
```

### Rule 5: Dynamic vs Static Elements

**Static UI** (menus, panels, buttons): Should follow rules above for scene editor control.

**Dynamic elements** (battle animations, particles, temporary effects): Can use hardcoded depths since they're not positioned via scene editor.

### Rule 6: Width/Height vs Scale

In SceneBuilder, `width/height` takes precedence over `scale`:
- If element has `width` and `height` in scene-layouts.json, `setDisplaySize()` is used
- If only `scale` is present, `setScale()` is used
- Don't use both simultaneously - width/height will override scale effects

### Common Mistakes to Avoid

1. **Creating UI without scenes.json entry** - Scene editor won't see it
2. **Hardcoding depths in .ts files** - Scene editor changes won't apply
3. **Reading depth from `element?.depth`** - Gets scenes.json value, not layout override
4. **Calculating positions relative to other elements** - Break element independence
5. **Using `setDepth()` with literal numbers** for static UI - Not scene editor controllable

### Example: GuildScene Pattern

```typescript
// In create()
const totalStatsPanel = this.sceneBuilder.get('totalStatsPanel');
const collectButton = this.sceneBuilder.get('collectButton');

// Read depths from layout overrides (scene-layouts.json)
const panelDepth = this.sceneBuilder.getLayoutOverride('totalStatsPanel')?.depth ?? 15;
const buttonDepth = this.sceneBuilder.getLayoutOverride('collectButton')?.depth ?? 15;

// Pass to creation function
this.createTotalStats(
    totalStatsPanel?.x ?? 800,
    totalStatsPanel?.y ?? 650,
    collectButton?.x ?? 950,
    panelDepth,
    buttonDepth
);
```

## File Locations

- **Game source**: `/Users/datamole/little-math-adventure/src/`
- **Scenes**: `/Users/datamole/little-math-adventure/src/scenes/`
- **Data files**: `/Users/datamole/little-math-adventure/public/assets/data/`
- **Scene Editor**: `/Users/datamole/SimpleGame/scene-editor/`

## Running the Project

```bash
# Game (port 8001)
cd /Users/datamole/little-math-adventure && npm run dev -- --port 8001

# Scene Editor (port 5174)
cd /Users/datamole/SimpleGame/scene-editor && npm run dev
```
