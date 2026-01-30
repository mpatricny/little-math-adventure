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

## Arena System Architecture

The game features multiple arena levels throughout the regions. All arenas share the same system architecture to ensure consistent behavior.

### Wave System

Each arena consists of **5 waves** with configurable enemy compositions. The system tracks:

- **Current wave progress** (0-4) - which wave the player is on
- **Historical best results** - preserved between arena runs for achievement tracking
- **Crystal rewards** - based on improvement, not repetition

### Wave Results Tracking

```typescript
interface ArenaWaveResult {
    completed: boolean;       // Wave was completed
    perfectWave: boolean;     // No wrong answers during wave
    crystalsEarned: number;   // Cumulative crystals from this wave
}
```

Historical results are stored in `player.arena.waveResults[]` (index 0-4 for waves 1-5).

### Crystal Reward Logic

Crystals are **only awarded for improvements**, not for repeated completions:

| Scenario | Crystals Awarded |
|----------|------------------|
| First completion of wave | +1 💎 (base) |
| First perfect completion | +1 💎 (bonus) |
| Repeat completion (not perfect → perfect) | +1 💎 (now achieved perfect) |
| Repeat completion (already perfect) | 0 💎 (no improvement) |

This encourages replaying for perfection without infinite farming.

### Wrong Answer Tracking

Wrong answers are tracked per wave via `waveWrongAnswerCount` in BattleScene:
- Reset when entering a new battle from arena
- Incremented on wrong player math OR wrong pet math
- Used at victory to determine if wave was "perfect"

### Arena Start Behavior

When player enters an arena (from TownScene):
- **Always starts from wave 0** (first wave)
- **Historical waveResults are preserved** (not reset)
- Only awards crystals for improvements over historical best

### UI: Wave Progress Table

Located in ArenaScene, uses the `misc.arena-with-title` frame element. Shows:
- 5 rows (one per wave)
- Enemy sprite previews for each wave
- Completion indicator (✓ for completed, ○ for pending)
- Perfect indicator (★ for perfect, ☆ for non-perfect)
- Current wave highlighted, future waves dimmed

### Adding New Arenas

To add a new arena level:
1. Add wave configuration to `ARENA_WAVES` in ArenaScene.ts
2. Configure enemies per wave in format: `{ level: number, waves: EnemyDefinition[][] }`
3. The Wave Progress Table and reward system work automatically

All arena levels share the same:
- Wave Progress Table UI positioning
- Crystal reward calculation logic
- Wrong answer tracking
- Historical progress preservation

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

## Design Documents

### GAME_DESIGN_DOCUMENT.md

Location: `docs/GAME_DESIGN_DOCUMENT.md`

The master design document containing:
- **Story**: The Starfall Scholar - Zyx the alien, Numera Energy, corrupted creatures
- **Characters**: Zyx (mentor), Pythia (crystal witch), Player
- **8 Regions**: Mathoria → Forest → Silverpond → Mountains → Dwarven City → Caves → Last Outpost → Zyx's Ship
- **Crystal System**: Shards (💎) → Fragments (💠) → Prisms (🔮) → Core (⭐) with numeric values
- **Mana System**: Energy for crystal forge operations
- **Pet System**: Binding freed creatures with exact-value amulets
- **Buildings**: Pythia's Workshop (pet binding, potions), Crystal Forge (crystal math operations)
- **Problem Variability**: Standard, Missing Operand, Comparison, True/False formats
- **UI Specifications**: Pet binding UI, Crystal Forge UI, Journey Map
- **AI Image Prompts**: For generating game assets
- **Data Structures**: JSON schemas for crystals, pets, forge operations

### FOREST_DESIGN.md

Location: `docs/FOREST_DESIGN.md`

Detailed balance data for Verdant Forest journey including:
- Entry requirements and completion rates
- Enemy stats (simulation-verified)
- Boss phases and mechanics
- Puzzle descriptions

### BALANCE_REPORT.md

Location: `docs/BALANCE_REPORT.md`

Simulation results for game economy and progression balance.

## File Locations

- **Game source**: `/Users/datamole/little-math-adventure/src/`
- **Scenes**: `/Users/datamole/little-math-adventure/src/scenes/`
- **Data files**: `/Users/datamole/little-math-adventure/public/assets/data/`
- **Design docs**: `/Users/datamole/little-math-adventure/docs/`
- **Scene Editor**: `/Users/datamole/SimpleGame/scene-editor/`

## Running the Project

```bash
# Game (port 8001)
cd /Users/datamole/little-math-adventure && npm run dev -- --port 8001

# Scene Editor (port 5174)
cd /Users/datamole/SimpleGame/scene-editor && npm run dev
```
