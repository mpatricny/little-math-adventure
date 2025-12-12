# Asset & Scene System Refactor Plan

## Problem Analysis

The current architecture has several issues that make it difficult to maintain and extend:

### 1. Scattered Definitions
- **Asset properties are duplicated** - The same asset (e.g., "knight") is defined with scale, origin, animations in every scene that uses it
- **Code has fallback values** - Pattern like `def?.x ?? 80` everywhere means the "truth" is split between JSON and code
- **No single source of truth** - A "button" is hardcoded in BattleScene, ShopScene, etc. with similar but not identical properties

### 2. Missing Asset Type Definitions
- `assets.json` only maps keys to file paths
- Programmatic assets (buttons, health bars, overlays, panels) are entirely defined in code
- No way to reuse UI components consistently

### 3. Scenes Do Too Much
```typescript
// Current pattern - scene manually creates everything
const def = this.layoutLoader.getLayoutDef()?.elements.find(e => e.id === 'knight');
this.knight = this.add.sprite(def?.x ?? 80, def?.y ?? 675, def?.asset ?? 'knight-idle-sheet')
    .setScale(def?.scale ?? 0.4)
    .setOrigin(...(def?.origin ?? [0.5, 1]))
    .setDepth(def?.depth ?? 5);
```

This defeats the purpose of having JSON configuration - the code still needs to know about every property.

---

## Proposed Architecture

### Core Principle: Separation of Concerns

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ASSET DEFINITIONS                            │
│                     (assets.json - WHAT)                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  "knight": {                                                        │
│    "type": "sprite",                                                │
│    "texture": "knight-idle-sheet",                                  │
│    "frameWidth": 300, "frameHeight": 300,                           │
│    "origin": [0.5, 1],                                              │
│    "scale": 0.4,                                                    │
│    "animations": { "idle": "knight-idle", "attack": "knight-attack" }│
│  }                                                                  │
│                                                                     │
│  "attack-button": {                                                 │
│    "type": "button",                                                │
│    "width": 150, "height": 50,                                      │
│    "style": { "fill": "#44aa44", "hoverFill": "#55bb55" },          │
│    "text": { "content": "ÚTOK", "style": {...} }                    │
│  }                                                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       SCENE COMPOSITIONS                            │
│                    (scenes.json - WHERE)                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  "BattleScene": {                                                   │
│    "elements": [                                                    │
│      { "id": "hero", "asset": "knight", "x": 300, "y": 480 },       │
│      { "id": "attackBtn", "asset": "attack-button", "x": 640 },     │
│      { "id": "heroHp", "asset": "health-bar", "x": 300, "y": 390 }  │
│    ]                                                                │
│  }                                                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         SCENE BUILDER                               │
│                  (Code creates from JSON)                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  // Scene code becomes minimal:                                     │
│  create() {                                                         │
│    this.builder.buildScene('BattleScene');                          │
│    this.hero = this.builder.get('hero');                            │
│    this.builder.on('attackBtn', 'click', () => this.onAttack());    │
│  }                                                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## New JSON Schema

### 1. `assets.json` - Asset Definitions

```json
{
  "version": "2.0",

  "textures": {
    "knight-idle-sheet": {
      "path": "sprites/knight-idle.png",
      "type": "spritesheet",
      "frameWidth": 300,
      "frameHeight": 300
    },
    "town-bg": {
      "path": "town/background.png",
      "type": "image"
    }
  },

  "assets": {
    "knight": {
      "type": "sprite",
      "texture": "knight-idle-sheet",
      "origin": [0.5, 1],
      "scale": 0.4,
      "depth": 5,
      "animations": {
        "idle": "knight-idle",
        "attack": "knight-attack"
      },
      "initialAnimation": "idle"
    },

    "town-background": {
      "type": "tileSprite",
      "texture": "town-bg",
      "origin": [0, 0],
      "depth": -10,
      "tileScale": [0.88, 0.88]
    },

    "building": {
      "type": "image",
      "origin": [0.5, 1],
      "scale": 0.224,
      "interactive": { "useHandCursor": true },
      "hoverEffect": {
        "scale": 1.05,
        "tint": "#ffffcc"
      }
    },

    "attack-button": {
      "type": "button",
      "width": 150,
      "height": 50,
      "style": {
        "fill": "#44aa44",
        "hoverFill": "#55bb55"
      },
      "text": {
        "content": "ÚTOK",
        "style": {
          "fontSize": "24px",
          "fontFamily": "Arial, sans-serif",
          "color": "#ffffff",
          "fontStyle": "bold"
        }
      }
    },

    "health-bar": {
      "type": "healthBar",
      "width": 100,
      "height": 12,
      "colors": {
        "background": "#333333",
        "high": "#44cc44",
        "medium": "#cccc44",
        "low": "#cc4444"
      },
      "thresholds": {
        "medium": 0.5,
        "low": 0.25
      }
    },

    "panel": {
      "type": "panel",
      "fill": "#000000",
      "alpha": 0.7,
      "stroke": {
        "color": "#886688",
        "width": 2
      }
    },

    "label": {
      "type": "text",
      "style": {
        "fontSize": "18px",
        "fontFamily": "Arial, sans-serif",
        "color": "#ffffff",
        "fontStyle": "bold",
        "stroke": "#000000",
        "strokeThickness": 4
      }
    }
  },

  "animations": {
    "knight-idle": {
      "texture": "knight-idle-sheet",
      "frames": { "start": 0, "end": 5 },
      "frameRate": 8,
      "repeat": -1
    },
    "knight-attack": {
      "texture": "knight-attack-sheet",
      "frames": { "start": 0, "end": 7 },
      "frameRate": 12,
      "repeat": 0
    }
  }
}
```

### 2. `scenes.json` - Scene Compositions

```json
{
  "version": "2.0",

  "scenes": {
    "TownScene": {
      "viewport": { "width": 1280, "height": 720 },

      "elements": [
        {
          "id": "background",
          "asset": "town-background",
          "x": 0,
          "y": 0,
          "width": 1280,
          "height": 720
        },
        {
          "id": "knight",
          "asset": "knight",
          "x": 80,
          "y": 675
        },
        {
          "id": "witch-hut",
          "asset": "building",
          "texture": "building-witch",
          "x": 220,
          "y": 670,
          "events": {
            "click": "enterWitchHut"
          }
        },
        {
          "id": "witch-label",
          "asset": "label",
          "x": 220,
          "y": 430,
          "text": "ČARODĚJNICE"
        }
      ],

      "hotspots": []
    },

    "BattleScene": {
      "viewport": { "width": 1280, "height": 720 },

      "elements": [
        {
          "id": "background",
          "asset": "battle-background",
          "x": 640,
          "y": 360
        },
        {
          "id": "hero",
          "asset": "knight",
          "x": 300,
          "y": 480,
          "scale": 0.6
        },
        {
          "id": "heroHpBar",
          "asset": "health-bar",
          "x": 300,
          "y": 390,
          "data": { "entityId": "hero" }
        },
        {
          "id": "attackButton",
          "asset": "attack-button",
          "x": 640,
          "y": 660,
          "events": {
            "click": "onAttack"
          }
        }
      ],

      "templates": {
        "enemy": {
          "asset": "enemy",
          "positions": [[695, 445], [820, 545], [950, 445]]
        }
      }
    }
  }
}
```

---

## New TypeScript Types

### `src/types/assets.ts`

```typescript
// Base asset types
type AssetType =
  | 'image'
  | 'sprite'
  | 'tileSprite'
  | 'text'
  | 'button'
  | 'healthBar'
  | 'panel'
  | 'container'
  | 'zone'
  | 'trigger';

// Texture definition (raw file reference)
interface TextureDef {
  path: string;
  type: 'image' | 'spritesheet';
  frameWidth?: number;
  frameHeight?: number;
}

// Base asset definition
interface BaseAssetDef {
  type: AssetType;
  origin?: [number, number];
  scale?: number;
  depth?: number;
  visible?: boolean;
  alpha?: number;
}

// Specific asset types
interface SpriteAssetDef extends BaseAssetDef {
  type: 'sprite';
  texture: string;
  animations?: Record<string, string>;
  initialAnimation?: string;
}

interface ButtonAssetDef extends BaseAssetDef {
  type: 'button';
  width: number;
  height: number;
  style: {
    fill: string;
    hoverFill?: string;
    stroke?: { color: string; width: number };
  };
  text?: {
    content: string;
    style: Phaser.Types.GameObjects.Text.TextStyle;
  };
}

interface HealthBarAssetDef extends BaseAssetDef {
  type: 'healthBar';
  width: number;
  height: number;
  colors: {
    background: string;
    high: string;
    medium: string;
    low: string;
  };
  thresholds: {
    medium: number;
    low: number;
  };
}

// ... more asset types

type AssetDef =
  | SpriteAssetDef
  | ButtonAssetDef
  | HealthBarAssetDef
  | ImageAssetDef
  | TileSpriteAssetDef
  | TextAssetDef
  | PanelAssetDef;

// Asset file structure
interface AssetsFile {
  version: string;
  textures: Record<string, TextureDef>;
  assets: Record<string, AssetDef>;
  animations: Record<string, AnimationDef>;
}
```

### `src/types/scenes.ts`

```typescript
// Scene element placement
interface SceneElement {
  id: string;
  asset: string;  // References key in assets.json
  x: number;
  y: number;

  // Optional overrides (scene-specific)
  scale?: number;
  depth?: number;
  visible?: boolean;
  texture?: string;  // Override default texture
  text?: string;     // Override default text content
  width?: number;
  height?: number;

  // Event bindings
  events?: Record<string, string>;  // eventName -> handlerName

  // Arbitrary data for runtime use
  data?: Record<string, unknown>;
}

interface SceneDef {
  viewport: { width: number; height: number };
  elements: SceneElement[];
  hotspots?: HotspotDef[];
  templates?: Record<string, TemplateDef>;
}

interface ScenesFile {
  version: string;
  scenes: Record<string, SceneDef>;
}
```

---

## New Systems

### 1. `AssetFactory` - Creates game objects from asset definitions

```typescript
// src/systems/AssetFactory.ts

export class AssetFactory {
  private scene: Phaser.Scene;
  private assetDefs: Record<string, AssetDef>;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.assetDefs = scene.cache.json.get('assets').assets;
  }

  /**
   * Create a game object from an asset definition
   */
  create(assetKey: string, placement: SceneElement): GameObject {
    const assetDef = this.assetDefs[assetKey];
    if (!assetDef) throw new Error(`Unknown asset: ${assetKey}`);

    switch (assetDef.type) {
      case 'sprite':
        return this.createSprite(assetDef, placement);
      case 'button':
        return this.createButton(assetDef, placement);
      case 'healthBar':
        return this.createHealthBar(assetDef, placement);
      // ... other types
    }
  }

  private createSprite(def: SpriteAssetDef, placement: SceneElement): Sprite {
    const texture = placement.texture ?? def.texture;
    const sprite = this.scene.add.sprite(placement.x, placement.y, texture);

    sprite.setOrigin(...(def.origin ?? [0.5, 0.5]));
    sprite.setScale(placement.scale ?? def.scale ?? 1);
    sprite.setDepth(placement.depth ?? def.depth ?? 0);

    if (def.initialAnimation && def.animations) {
      sprite.play(def.animations[def.initialAnimation]);
    }

    return sprite;
  }

  private createButton(def: ButtonAssetDef, placement: SceneElement): Container {
    const container = this.scene.add.container(placement.x, placement.y);

    const bg = this.scene.add.rectangle(
      0, 0,
      placement.width ?? def.width,
      placement.height ?? def.height,
      Phaser.Display.Color.HexStringToColor(def.style.fill).color
    );
    bg.setInteractive({ useHandCursor: true });

    // Hover effects
    if (def.style.hoverFill) {
      const hoverColor = Phaser.Display.Color.HexStringToColor(def.style.hoverFill).color;
      const normalColor = Phaser.Display.Color.HexStringToColor(def.style.fill).color;
      bg.on('pointerover', () => bg.setFillStyle(hoverColor));
      bg.on('pointerout', () => bg.setFillStyle(normalColor));
    }

    // Text
    if (def.text) {
      const text = this.scene.add.text(
        0, 0,
        placement.text ?? def.text.content,
        def.text.style
      ).setOrigin(0.5);
      container.add(text);
    }

    container.add(bg);
    container.setDepth(placement.depth ?? def.depth ?? 0);

    return container;
  }

  // ... other create methods
}
```

### 2. `SceneBuilder` - Builds entire scene from JSON

```typescript
// src/systems/SceneBuilder.ts

export class SceneBuilder {
  private scene: Phaser.Scene;
  private factory: AssetFactory;
  private elements: Map<string, GameObject> = new Map();
  private eventHandlers: Map<string, Function> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.factory = new AssetFactory(scene);
  }

  /**
   * Register event handlers that can be referenced in JSON
   */
  registerHandler(name: string, handler: Function): void {
    this.eventHandlers.set(name, handler);
  }

  /**
   * Build all elements for a scene
   */
  buildScene(sceneName: string): void {
    const scenesFile = this.scene.cache.json.get('scenes') as ScenesFile;
    const sceneDef = scenesFile.scenes[sceneName];

    if (!sceneDef) {
      console.error(`Scene not found: ${sceneName}`);
      return;
    }

    // Create all elements
    for (const element of sceneDef.elements) {
      const gameObject = this.factory.create(element.asset, element);
      this.elements.set(element.id, gameObject);

      // Bind events
      if (element.events) {
        this.bindEvents(gameObject, element.events);
      }
    }
  }

  /**
   * Get a created element by ID
   */
  get<T extends GameObject>(id: string): T | undefined {
    return this.elements.get(id) as T;
  }

  /**
   * Bind events from JSON to registered handlers
   */
  private bindEvents(obj: GameObject, events: Record<string, string>): void {
    for (const [eventName, handlerName] of Object.entries(events)) {
      const handler = this.eventHandlers.get(handlerName);
      if (handler) {
        if ('on' in obj) {
          (obj as any).on(`pointer${eventName}`, handler);
        }
      }
    }
  }
}
```

### 3. Updated Scene Pattern

```typescript
// src/scenes/BattleScene.ts (refactored)

export class BattleScene extends Phaser.Scene {
  private builder!: SceneBuilder;
  private hero!: Phaser.GameObjects.Sprite;

  create(): void {
    // Initialize builder
    this.builder = new SceneBuilder(this);

    // Register event handlers
    this.builder.registerHandler('onAttack', () => this.onAttackClicked());

    // Build scene from JSON - this creates EVERYTHING
    this.builder.buildScene('BattleScene');

    // Get references for runtime manipulation
    this.hero = this.builder.get<Phaser.GameObjects.Sprite>('hero')!;

    // Scene-specific logic that can't be in JSON
    this.initializeBattleState();
  }

  private onAttackClicked(): void {
    // Battle logic...
  }
}
```

---

## Migration Strategy

### Phase 1: Asset Definition Migration
1. Create new `assets.json` schema with all asset types
2. Move texture definitions from current `assets.json` to `textures` section
3. Define all reusable assets (knight, enemies, buttons, health bars, panels)
4. Keep old system working during migration

### Phase 2: Scene Migration
1. Create new `scenes.json` with simplified element references
2. Update SceneLayoutLoader to use new schema OR create new SceneBuilder
3. Migrate one scene at a time (start with simplest - MenuScene)
4. Remove hardcoded fallback values from scene code

### Phase 3: UI Component Migration
1. Define programmatic assets (button, healthBar, panel) in assets.json
2. Create factory methods for each type
3. Replace inline UI creation with factory calls
4. Ensure consistent styling across all scenes

### Phase 4: Cleanup
1. Remove old SceneLayoutLoader (or refactor)
2. Remove fallback values from all scenes
3. Update debugger to work with new system
4. Update documentation

---

## Benefits of New Architecture

| Aspect | Before | After |
|--------|--------|-------|
| Asset definition | Scattered in JSON + code | Single source in assets.json |
| Scene creation | Manual + fallbacks | Automated from JSON |
| UI consistency | Copy-paste code | Shared asset definitions |
| Adding new scene | Copy patterns, update fallbacks | Add to scenes.json |
| Changing asset | Update every scene | Update once in assets.json |
| Button styling | Different in each scene | Consistent via asset def |
| Debug/edit | Per-scene | Global asset tweaking |

---

## File Structure After Refactor

```
public/assets/data/
├── assets.json          # Asset definitions (WHAT things are)
├── scenes.json          # Scene compositions (WHERE things go)
├── enemies.json         # Game content (unchanged)
├── items.json           # Game content (unchanged)
└── pets.json            # Game content (unchanged)

src/systems/
├── AssetFactory.ts      # Creates objects from asset defs
├── SceneBuilder.ts      # Builds scenes from JSON
├── AssetLoader.ts       # Loads textures (replaces AssetLoaderScene)
└── SceneDebugger.ts     # Updated for new system

src/types/
├── assets.ts            # Asset definition types
├── scenes.ts            # Scene composition types
└── index.ts             # Game entity types (unchanged)
```

---

## Questions to Resolve

1. **Animation definitions** - Should animations be in assets.json or separate file?
2. **Localization** - Text content in assets.json vs separate i18n file?
3. **Inheritance** - Should assets support extending other assets?
   ```json
   "iron-sword-button": {
     "extends": "button",
     "text": { "content": "Iron Sword" }
   }
   ```
4. **Variants** - How to handle asset variants (e.g., different colored slimes)?
5. **Debug mode** - How does SceneDebugger export changes to new format?
