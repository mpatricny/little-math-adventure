# Little Math Adventure - Development Rules

## Scene Editor Compatibility

The game uses a **Scene Editor** (`/Users/datamole/SimpleGame/scene-editor`) to visually position elements. To ensure changes made in the scene editor are respected by the game code, follow these rules:

### Data Flow Architecture

```
scenes.json    → Single source of truth for all scene data (elements, positions, spawn points)
assets.json    → Defines asset properties (textures, types, defaults)
textures.json  → Maps texture keys to file paths
```

**Note**: Previously there was a separate `scene-layouts.json` for position overrides. This has been unified - all data is now in `scenes.json`.

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

### Rule 3: Read Depths from SceneBuilder Elements

Read depth from the element returned by SceneBuilder, which now contains all data from scenes.json:

```typescript
// Good - reads depth from scenes.json via sceneBuilder
const element = this.sceneBuilder.get('myElement');
const depth = element?.depth ?? 10;
this.myUI.setDepth(depth);

// Bad - hardcoded depth
this.myUI.setDepth(10);
```

### Rule 4: Pass Layout Values to Creation Functions

When creating complex UI in helper functions, pass positions and depths as parameters:

```typescript
// Good pattern
private create(): void {
    const panel = this.sceneBuilder.get('statsPanel');

    this.createStatsPanel(
        panel?.x ?? 800,
        panel?.y ?? 100,
        panel?.depth ?? 10
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
- If element has `width` and `height` in scenes.json, `setDisplaySize()` is used
- If only `scale` is present, `setScale()` is used
- Don't use both simultaneously - width/height will override scale effects

### Common Mistakes to Avoid

1. **Creating UI without scenes.json entry** - Scene editor won't see it
2. **Hardcoding depths in .ts files** - Scene editor changes won't apply
3. **Calculating positions relative to other elements** - Breaks element independence
4. **Using `setDepth()` with literal numbers** for static UI - Not scene editor controllable

## Spawn Points Architecture

The game has **three different ways** to define spawn points. Only use ONE per spawn point to avoid conflicts.

### Method 1: spawnPoints Object (Preferred for Battle Scenes)

```json
{
  "spawnPoints": {
    "player": { "x": 300, "y": 480 },
    "pet": { "x": 371, "y": 609 },
    "enemies": {
      "1": [{ "x": 900, "y": 480 }],
      "2": [{ "x": 873, "y": 472 }, { "x": 970, "y": 560 }]
    }
  }
}
```

Accessed via: `sceneBuilder.getSpawnPoints()`

### Method 2: Zones Array with Inline Coordinates

```json
{
  "zones": [
    { "id": "playerSpawn", "x": 80, "y": 615, "asset": "points.player-spawn-town" }
  ]
}
```

**Important**: The zone MUST have inline `x` and `y` values. If missing, `SceneBuilder.getZone()` returns `undefined`.

Accessed via: `sceneBuilder.getZone('playerSpawn')`

### Method 3: Elements (Avoid for Spawn Points)

```json
{
  "elements": [
    { "id": "playerSpawn", "asset": "points.player-spawn-town", "x": 80, "y": 615 }
  ]
}
```

**Warning**: If the asset path doesn't exist in assets.json, the game shows "MISSING: playerSpawn" error. Elements are for visual objects, not spawn points.

### Which Method to Use

| Scene Type | Recommended Method |
|------------|-------------------|
| BattleScene | `spawnPoints` object for player, pet, enemies |
| Town scenes | `zones` array with inline x,y |
| Other scenes | `zones` array with inline x,y |

### Common Spawn Point Bugs

1. **Duplicate spawn points**: Having both a zone AND an element with the same ID causes duplicates in the scene editor
2. **Missing zone coordinates**: Zone without inline `x,y` returns undefined from `getZone()`
3. **Invalid element asset**: Element with non-existent asset shows "MISSING" error

## Scale Properties

AssetFactory supports three scale properties with the following priority:

```
scaleX/scaleY > scale > def.scale
```

### Property Definitions

| Property | Type | Description |
|----------|------|-------------|
| `scale` | number | Uniform scale for both X and Y |
| `scaleX` | number | Individual X-axis scale (overrides `scale`) |
| `scaleY` | number | Individual Y-axis scale (overrides `scale`) |

### Example Usage

```json
{
  "id": "resultsTable",
  "asset": "ui.battle.results-table",
  "x": 640,
  "y": 250,
  "scaleX": 0.8,
  "scaleY": 0.5
}
```

### TileSprite Elements (Special Case)

TileSprites use `width` and `height` to define the display area. The `scale` property is **IGNORED**.

```json
{
  "id": "bgGrass",
  "asset": "environments.terrain.grass-layer",
  "x": 0,
  "y": 685,
  "width": 1280,
  "height": 80,
  "depth": -5,
  "origin": [0, 1]
}
```

**How tileSprites work in Phaser:**
1. `width` and `height` define the visible area
2. Texture scales to fit the height
3. Texture tiles horizontally to fill the width
4. `scale` property has NO effect

**Wrong** (redundant scale):
```json
{ "width": 1280, "height": 80, "scale": 1 }
```

**Correct** (width/height only):
```json
{ "width": 1280, "height": 80 }
```

## Known Recurring Bugs

### Hit Area Offset Bug (UI Elements)

**Symptom**: Hover/click effects trigger in the wrong position - offset by half the element size to the left and up from where the visual element appears.

**Root Cause**: Using a custom `Phaser.Geom.Rectangle` with origin offset values for the hit area. When Phaser transforms mouse coordinates to local space, the custom rectangle offset causes misalignment.

**Wrong (causes bug)**:
```typescript
container.setInteractive(
  new Phaser.Geom.Rectangle(originOffsetX, originOffsetY, width, height),
  Phaser.Geom.Rectangle.Contains
);
```

**Correct (let Phaser calculate)**:
```typescript
container.setSize(width, height);
container.setInteractive({ useHandCursor: true });
```

**History**: This bug has been fixed multiple times:
- Commit `86694f9` - Fixed in UiElementFactory.ts
- Commit `2a7ce65` - Fixed in UiElementBuilder.ts

**Prevention**: When making containers interactive, ALWAYS use `setInteractive({ useHandCursor: true })` and let Phaser calculate the hit area automatically based on container size. Never use custom Rectangle offsets.

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
