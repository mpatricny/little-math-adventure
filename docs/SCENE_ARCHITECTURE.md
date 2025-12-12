# Scene Architecture & JSON Asset System

This document explains how scenes are built in the game and how they connect to the JSON asset files used for scene configuration and editing.

## Overview

The game uses a **data-driven architecture** where scenes are configured via JSON files rather than hardcoded values. This enables:

- Live editing without code changes
- Designer-friendly configuration
- Decoupled asset references
- Rapid iteration during development

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BOOT SEQUENCE                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  BootScene.preload()                                                │
│       │                                                             │
│       ├── Load assets.json ─────────────────┐                       │
│       ├── Load scene-layouts.json ──────────┼──► Phaser JSON Cache  │
│       ├── Load enemies.json ────────────────┤                       │
│       ├── Load items.json ──────────────────┤                       │
│       └── Load pets.json ───────────────────┘                       │
│                    │                                                │
│                    ▼                                                │
│  AssetLoaderScene.preload()                                         │
│       │                                                             │
│       └── Read assets.json from cache                               │
│           └── Load all images, spritesheets, audio                  │
│                    │                                                │
│                    ▼                                                │
│  AssetLoaderScene.create()                                          │
│       │                                                             │
│       └── Create all animations globally                            │
│                    │                                                │
│                    ▼                                                │
│  MenuScene ──► TownScene ──► BattleScene / ShopScene / etc.         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## JSON Configuration Files

### 1. `assets.json` - Asset Registry

Maps asset keys to file paths, decoupling code from actual filenames.

**Location:** `public/assets/data/assets.json`

```json
{
  "version": "1.0",
  "images": {
    "town-bg": "town/background.png",
    "shop-interior": "town/shop/shop-interior.png",
    "witch-hut-interior": "town/witch-hut-interior.png"
  },
  "spritesheets": {
    "knight-idle-sheet": {
      "path": "sprites/knight-idle.png",
      "frameWidth": 300,
      "frameHeight": 300
    },
    "slime-idle-sheet": {
      "path": "sprites/slime-idle.png",
      "frameWidth": 100,
      "frameHeight": 100
    }
  },
  "audio": {
    "battle-music": "audio/battle.mp3"
  }
}
```

**Benefits:**
- Rename asset files without changing code
- Single source of truth for asset paths
- Easy to see all game assets at a glance

---

### 2. `scene-layouts.json` - Scene Configuration

Defines every element in every scene by ID with position, scale, depth, and other properties.

**Location:** `public/assets/data/scene-layouts.json`

```json
{
  "version": "1.0",
  "scenes": {
    "TownScene": {
      "viewport": { "width": 1280, "height": 720 },
      "elements": [
        {
          "id": "background",
          "type": "tileSprite",
          "asset": "town-bg",
          "x": 0,
          "y": 0,
          "origin": [0, 0],
          "depth": -10,
          "width": 1280,
          "height": 720,
          "tileScale": [0.88, 0.88]
        },
        {
          "id": "knight",
          "type": "sprite",
          "asset": "knight-idle-sheet",
          "x": 80,
          "y": 675,
          "scale": 0.4,
          "origin": [0.5, 1],
          "depth": 5,
          "initialAnimation": "knight-idle"
        }
      ],
      "hotspots": [],
      "templates": {}
    }
  }
}
```

---

## Element Definition Schema

Each element in `scene-layouts.json` follows this structure:

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique identifier for the element |
| `type` | string | One of: `image`, `sprite`, `tileSprite`, `container`, `zone`, `text`, `graphics`, `nineslice` |
| `asset` | string | Key from `assets.json` |
| `x`, `y` | number | Position coordinates |
| `origin` | [number, number] | Origin point (0-1 for each axis) |
| `depth` | number | Z-order (higher = in front) |
| `scale` | number | Uniform scale factor |
| `scaleX`, `scaleY` | number | Non-uniform scale |
| `width`, `height` | number | Dimensions (for tileSprite, zone) |
| `alpha` | number | Opacity (0-1) |
| `flipX`, `flipY` | boolean | Mirror the element |
| `scrollFactor` | number or [number, number] | Parallax factor |
| `visible` | boolean | Initial visibility |
| `initialAnimation` | string | Animation to play on create |
| `interactive` | boolean or object | Enable input handling |

### Element Types

```
image       - Static image from texture
sprite      - Animated sprite with spritesheet
tileSprite  - Repeating tile pattern (backgrounds)
container   - Group of child elements
zone        - Invisible interactive area
text        - Text label
graphics    - Procedural shapes
nineslice   - Scalable UI panels
```

---

## SceneLayoutLoader

The core system that connects JSON configuration to Phaser game objects.

**Location:** `src/systems/SceneLayoutLoader.ts`

### Basic Usage

```typescript
import { SceneLayoutLoader } from '../systems/SceneLayoutLoader';

class TownScene extends Phaser.Scene {
  private layoutLoader!: SceneLayoutLoader;

  create(): void {
    // Initialize with scene name matching key in scene-layouts.json
    this.layoutLoader = new SceneLayoutLoader(this, 'TownScene');

    // Get element definition
    const knightDef = this.layoutLoader.getLayoutDef()?.elements
      .find(e => e.id === 'knight');

    // Create game object using definition values
    this.knight = this.add.sprite(
      knightDef?.x ?? 80,
      knightDef?.y ?? 675,
      knightDef?.asset ?? 'knight-idle-sheet'
    )
    .setScale(knightDef?.scale ?? 0.4)
    .setOrigin(...(knightDef?.origin ?? [0.5, 1]))
    .setDepth(knightDef?.depth ?? 5);

    // Play initial animation
    if (knightDef?.initialAnimation) {
      this.knight.play(knightDef.initialAnimation);
    }
  }
}
```

### API Reference

| Method | Description |
|--------|-------------|
| `constructor(scene, sceneName)` | Load layout from cache by scene name |
| `createAllElements()` | Create all static elements from layout |
| `createAllHotspots(callback?)` | Create all interactive zones |
| `createElement(def)` | Factory method for single element |
| `createFromTemplate(id, count?, overrides?)` | Generate elements from template |
| `getElement<T>(id)` | Retrieve created game object by ID |
| `getElementDef(id)` | Get definition of created element |
| `getRawElementDef(id)` | Get definition before creation |
| `getHotspot(id)` | Retrieve created hotspot zone |
| `getLayoutDef()` | Access full scene layout definition |
| `exportCurrentState()` | Export current positions for debugging |

---

## Complete Flow: JSON to Rendered Scene

### Step 1: Configuration in `scene-layouts.json`

```json
{
  "TownScene": {
    "elements": [
      {
        "id": "knight",
        "type": "sprite",
        "asset": "knight-idle-sheet",
        "x": 80,
        "y": 675,
        "scale": 0.4,
        "origin": [0.5, 1],
        "depth": 5,
        "initialAnimation": "knight-idle"
      }
    ]
  }
}
```

### Step 2: Asset Mapping in `assets.json`

```json
{
  "spritesheets": {
    "knight-idle-sheet": {
      "path": "sprites/knight-idle.png",
      "frameWidth": 300,
      "frameHeight": 300
    }
  }
}
```

### Step 3: Asset Loading (AssetLoaderScene)

```typescript
// AssetLoaderScene reads assets.json and loads all assets
const assets = this.cache.json.get('assets');

// Load each spritesheet
for (const [key, config] of Object.entries(assets.spritesheets)) {
  this.load.spritesheet(key, `assets/${config.path}`, {
    frameWidth: config.frameWidth,
    frameHeight: config.frameHeight
  });
}
```

### Step 4: Scene Uses Layout

```typescript
// TownScene.create()
this.layoutLoader = new SceneLayoutLoader(this, 'TownScene');

const def = this.layoutLoader.getLayoutDef()?.elements
  .find(e => e.id === 'knight');

this.knight = this.add.sprite(def.x, def.y, def.asset)
  .setScale(def.scale)
  .setOrigin(...def.origin)
  .setDepth(def.depth);

this.knight.play(def.initialAnimation);
```

### Step 5: Phaser Renders

```
SceneLayoutLoader.getLayoutDef()
       ↓
Returns element definition: { asset: 'knight-idle-sheet', x: 80, y: 675, ... }
       ↓
this.add.sprite(x, y, 'knight-idle-sheet')
       ↓
Phaser looks up 'knight-idle-sheet' in texture cache
       ↓
Texture found (loaded by AssetLoaderScene)
       ↓
Sprite rendered at position (80, 675)
```

---

## Hotspots (Interactive Zones)

Define interactive areas that trigger actions without visible elements.

```json
{
  "hotspots": [
    {
      "id": "shop-door",
      "type": "navigation",
      "shape": "rect",
      "bounds": [400, 300, 100, 150],
      "action": "enterShop",
      "active": true
    }
  ]
}
```

### Hotspot Types

| Type | Purpose |
|------|---------|
| `trigger` | Generic interaction area |
| `spawn` | Enemy/item spawn point |
| `dropZone` | Drag-and-drop target |
| `navigation` | Scene transition area |

---

## Templates (Dynamic Element Generation)

Create multiple elements from a single definition.

```json
{
  "templates": {
    "coin": {
      "element": {
        "type": "sprite",
        "asset": "coin-sheet",
        "origin": [0.5, 0.5],
        "scale": 0.5,
        "depth": 10
      },
      "generation": {
        "type": "grid",
        "rows": 3,
        "cols": 5,
        "spacing": [40, 40]
      }
    }
  }
}
```

### Generation Types

| Type | Description |
|------|-------------|
| `single` | One element at specified position |
| `grid` | Grid of rows x cols with spacing |
| `positions` | Specific coordinate list |
| `dynamic` | Created programmatically at runtime |

---

## Debug System (SceneDebugger)

The built-in editor for live element manipulation.

**Location:** `src/systems/SceneDebugger.ts`

### Activation

Press **D** to toggle debug mode in any scene.

### Controls

| Key | Action |
|-----|--------|
| D | Toggle debug mode |
| TAB | Cycle through elements |
| Arrow Keys | Move element (5px) |
| P / L | Scale up/down (0.01) |
| W / Q | Width up/down (10px) |
| E / R | Height up/down (10px) |
| Z / X | Depth up/down (1) |
| S | Save to localStorage + dev server |
| C | Copy layout JSON to clipboard |

### Integration Example

```typescript
import { SceneDebugger } from '../systems/SceneDebugger';

class BattleScene extends Phaser.Scene {
  private debugger!: SceneDebugger;

  create(): void {
    this.debugger = new SceneDebugger(this, 'BattleScene');

    // Register elements for debugging
    this.debugger.register('hero', this.heroSprite);
    this.debugger.register('enemy', this.enemySprite);

    // Battle-specific debug callbacks
    this.debugger.setBattleCallbacks(
      () => this.instantWin(),
      () => this.fullHeal()
    );
  }
}
```

### Workflow

1. Run game with `npm run dev`
2. Navigate to scene you want to edit
3. Press **D** to enable debug mode
4. Press **TAB** to select element
5. Use arrow keys and P/L to position/scale
6. Press **S** to save changes
7. Press **C** to copy JSON to clipboard
8. Update `scene-layouts.json` with new values

---

## Adding a New Scene

### 1. Create Scene Class

```typescript
// src/scenes/NewScene.ts
import { SceneLayoutLoader } from '../systems/SceneLayoutLoader';

export class NewScene extends Phaser.Scene {
  private layoutLoader!: SceneLayoutLoader;

  constructor() {
    super({ key: 'NewScene' });
  }

  create(): void {
    this.layoutLoader = new SceneLayoutLoader(this, 'NewScene');

    // Create elements using layout definitions
    const bgDef = this.layoutLoader.getLayoutDef()?.elements
      .find(e => e.id === 'background');

    if (bgDef) {
      this.add.image(bgDef.x, bgDef.y, bgDef.asset)
        .setOrigin(...bgDef.origin)
        .setDepth(bgDef.depth);
    }
  }
}
```

### 2. Add Layout to `scene-layouts.json`

```json
{
  "scenes": {
    "NewScene": {
      "viewport": { "width": 1280, "height": 720 },
      "elements": [
        {
          "id": "background",
          "type": "image",
          "asset": "new-scene-bg",
          "x": 640,
          "y": 360,
          "origin": [0.5, 0.5],
          "depth": -10
        }
      ],
      "hotspots": [],
      "templates": {}
    }
  }
}
```

### 3. Add Assets to `assets.json`

```json
{
  "images": {
    "new-scene-bg": "backgrounds/new-scene.png"
  }
}
```

### 4. Register Scene in `main.ts`

```typescript
import { NewScene } from './scenes/NewScene';

const config: Phaser.Types.Core.GameConfig = {
  scene: [
    BootScene,
    AssetLoaderScene,
    MenuScene,
    // ... other scenes
    NewScene  // Add here
  ]
};
```

---

## File Structure Reference

```
public/assets/
├── data/
│   ├── assets.json           # Asset key → file path mapping
│   ├── scene-layouts.json    # Scene element configurations
│   ├── debug-layout.json     # Debug mode saved positions
│   ├── enemies.json          # Enemy definitions
│   ├── items.json            # Shop item definitions
│   └── pets.json             # Pet definitions
├── sprites/                  # Spritesheets
├── town/                     # Town scene assets
├── backgrounds/              # Background images
└── ui/                       # UI elements

src/
├── scenes/
│   ├── BootScene.ts          # JSON loader
│   ├── AssetLoaderScene.ts   # Asset loader
│   ├── TownScene.ts          # Hub world
│   ├── BattleScene.ts        # Combat
│   ├── ShopScene.ts          # Item purchase
│   └── ...
├── systems/
│   ├── SceneLayoutLoader.ts  # JSON → Game objects
│   └── SceneDebugger.ts      # Live editor
└── types/
    └── layout.ts             # TypeScript definitions
```

---

## Best Practices

1. **Always use asset keys** - Never hardcode file paths in scene code
2. **Use SceneLayoutLoader** - Don't hardcode positions/scales
3. **Register debug elements** - Makes iteration faster
4. **Keep IDs descriptive** - `hero-knight` not `sprite1`
5. **Group related elements** - Use containers for complex UI
6. **Use templates** - For repeated elements (coins, enemies)
7. **Test with debugger** - Verify positions before committing

---

## Troubleshooting

### Element not appearing

1. Check `assets.json` has the asset key
2. Check asset file exists at the path
3. Verify `scene-layouts.json` has the element
4. Check depth value (might be behind other elements)

### Wrong position after save

1. Debug mode saves to `debug-layout.json`
2. Copy values to `scene-layouts.json` for permanence
3. Clear localStorage if stale values persist

### Animation not playing

1. Verify animation created in `AssetLoaderScene`
2. Check `initialAnimation` matches animation key
3. Ensure spritesheet has correct frame dimensions
