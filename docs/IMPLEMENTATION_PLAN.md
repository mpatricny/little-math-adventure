# Asset & Scene System Refactor - Implementation Plan

## Overview

This plan migrates the game from the current mixed-definition approach to a clean separation of concerns. The migration is **incremental** and **non-breaking** - the game remains functional throughout.

---

## Current State → Target State

| Current | Target |
|---------|--------|
| `assets.json` (texture paths only) | `textures.json` (file references) |
| Animations hardcoded in AssetLoaderScene | `animations.json` (data-driven) |
| `scene-layouts.json` + code fallbacks | `assets.json` (game objects) + `scenes.json` (compositions) |
| Hardcoded Czech strings | `localization/*.json` with keys |
| SceneLayoutLoader + manual creation | SceneBuilder (fully automated) |
| Hardcoded character positions | Zone-based spawning |

---

## Phase Summary

| Phase | Goal | Creates | Modifies |
|-------|------|---------|----------|
| **0** | Foundation types | `src/types/assets.ts` | - |
| **1** | Localization | `localization/*.json`, `LocalizationService.ts` | `BootScene.ts` |
| **2** | Textures & Animations | `textures.json`, `animations.json`, `AnimationLoader.ts` | `AssetLoaderScene.ts` |
| **3** | Asset Factory | `AssetFactory.ts` | - |
| **4** | Restructure assets.json | - | `assets.json` |
| **5** | Scene Builder | `scenes.json`, `SceneBuilder.ts` | - |
| **6** | Scene Migration | - | All scene files (one at a time) |
| **7** | Zone Spawning | - | Battle/Arena/Town scenes |
| **8** | Full Localization | - | All hardcoded strings |
| **9** | Cleanup | - | Remove deprecated code |

---

## Phase 0: Foundation Types

**Goal**: Create TypeScript interfaces without modifying existing code.

### Create: `src/types/assets.ts`

```typescript
// Texture definitions (textures.json)
export interface SpritesheetDef {
  path: string;
  frameWidth: number;
  frameHeight: number;
}

export interface TexturesFile {
  version: string;
  spritesheets: Record<string, SpritesheetDef>;
  images: Record<string, string>;
}

// Animation definitions (animations.json)
export interface AnimationFrames {
  start: number;
  end: number;
}

export interface AnimationDef {
  texture: string;
  frames: AnimationFrames;
  frameRate: number;
  repeat: number; // -1 for infinite
}

export interface AnimationsFile {
  version: string;
  player: Record<string, AnimationDef>;
  enemies: Record<string, Record<string, AnimationDef>>;
}

// Asset definitions (assets.json)
export type AssetCategory =
  | 'player' | 'enemy' | 'npc'
  | 'background' | 'terrain' | 'building' | 'interior' | 'prop'
  | 'ui.button' | 'ui.bar' | 'ui.panel' | 'ui.label' | 'ui.indicator'
  | 'item.weapon' | 'item.armor' | 'item.currency'
  | 'zone.spawn' | 'zone.drop' | 'zone.trigger';

export interface BaseAssetDef {
  type: string;
  category: AssetCategory;
  origin?: [number, number];
  depth?: number;
  scale?: { default: number; [variant: string]: number };
}

export interface AnimatedSpriteDef extends BaseAssetDef {
  type: 'animatedSprite';
  nameKey?: string;
  defaultTexture: string;
  animations: Record<string, string>; // role -> animation key
  defaultAnimation: string;
  hurtEffect?: { tint: string; duration: number };
}

export interface ButtonDef extends BaseAssetDef {
  type: 'button';
  width: number;
  height: number;
  textKey?: string;
  style: {
    fill: string;
    hoverFill?: string;
    pressedFill?: string;
    stroke?: { color: string; width: number };
  };
  textStyle?: Phaser.Types.GameObjects.Text.TextStyle;
}

// ... more asset types

// Scene composition (scenes.json)
export interface SceneElement {
  id: string;
  asset: string; // dot-path like "environments.backgrounds.battle-field"
  x: number;
  y: number;
  scale?: number;
  text?: string; // override or localization key
  visible?: boolean;
}

export interface SceneZoneRef {
  id: string;
  zone: string; // dot-path like "zones.spawns.player-spawn-battle"
}

export interface SceneDef {
  viewport: { width: number; height: number };
  elements: SceneElement[];
  zones: SceneZoneRef[];
  ui: SceneElement[];
}

export interface ScenesFile {
  version: string;
  scenes: Record<string, SceneDef>;
}
```

**Checkpoint**: `npm run build` succeeds.

---

## Phase 1: Localization Infrastructure

**Goal**: Create localization system that coexists with hardcoded strings.

### Step 1.1: Create Localization Files

**Create: `public/assets/data/localization/index.json`**
```json
{
  "defaultLanguage": "cs",
  "supportedLanguages": ["cs", "en"],
  "languages": {
    "cs": { "name": "Čeština", "file": "cs.json" },
    "en": { "name": "English", "file": "en.json" }
  }
}
```

**Create: `public/assets/data/localization/cs.json`**
```json
{
  "version": "1.0",
  "language": "cs",
  "ui": {
    "buttons": {
      "BTN_001": "ÚTOK",
      "BTN_002": "BLOKOVAT",
      "BTN_003": "ZPĚT",
      "BTN_004": "POKRAČOVAT",
      "BTN_007": "LÉČIT",
      "BTN_008": "KOUPIT"
    },
    "titles": {
      "TTL_001": "ARÉNA",
      "TTL_002": "PŘEHLED UČENÍ",
      "TTL_003": "CHALOUPKA ČARODĚJNICE"
    },
    "labels": {
      "LBL_011": "TVOJE PENÍZE",
      "LBL_012": "PLATBA",
      "LBL_013": "CELKEM"
    },
    "messages": {
      "MSG_001": "VÍTĚZSTVÍ!",
      "MSG_002": "PORÁŽKA",
      "MSG_003": "ZABLOKOVÁNO!"
    }
  },
  "buildings": {
    "BLD_001": "ČARODĚJNICE",
    "BLD_002": "CECH",
    "BLD_003": "HOSPODA",
    "BLD_004": "OBCHOD"
  },
  "characters": {
    "enemies": {
      "ENM_001": "Sliz",
      "ENM_002": "Růžák",
      "ENM_003": "Fialák",
      "ENM_004": "Listovák"
    }
  },
  "formats": {
    "FMT_001": "{0}/{1}",
    "FMT_003": "VLNA {0}"
  }
}
```

**Create: `public/assets/data/localization/en.json`**
```json
{
  "version": "1.0",
  "language": "en",
  "ui": {
    "buttons": {
      "BTN_001": "ATTACK",
      "BTN_002": "BLOCK",
      "BTN_003": "BACK",
      "BTN_004": "CONTINUE",
      "BTN_007": "HEAL",
      "BTN_008": "BUY"
    },
    "titles": {
      "TTL_001": "ARENA",
      "TTL_002": "LEARNING OVERVIEW",
      "TTL_003": "WITCH'S HUT"
    },
    "labels": {
      "LBL_011": "YOUR MONEY",
      "LBL_012": "PAYMENT",
      "LBL_013": "TOTAL"
    },
    "messages": {
      "MSG_001": "VICTORY!",
      "MSG_002": "DEFEAT",
      "MSG_003": "BLOCKED!"
    }
  },
  "buildings": {
    "BLD_001": "WITCH",
    "BLD_002": "GUILD",
    "BLD_003": "TAVERN",
    "BLD_004": "SHOP"
  },
  "characters": {
    "enemies": {
      "ENM_001": "Slime",
      "ENM_002": "Pinky",
      "ENM_003": "Purple",
      "ENM_004": "Leafy"
    }
  },
  "formats": {
    "FMT_001": "{0}/{1}",
    "FMT_003": "WAVE {0}"
  }
}
```

### Step 1.2: Create LocalizationService

**Create: `src/systems/LocalizationService.ts`**
```typescript
export class LocalizationService {
  private static instance: LocalizationService;
  private translations: Record<string, unknown> = {};
  private currentLanguage: string = 'cs';

  static getInstance(): LocalizationService {
    if (!this.instance) {
      this.instance = new LocalizationService();
    }
    return this.instance;
  }

  setLanguage(lang: string): void {
    this.currentLanguage = lang;
  }

  loadTranslations(data: Record<string, unknown>): void {
    this.translations = data;
  }

  t(key: string, ...params: unknown[]): string {
    const parts = key.split('.');
    let value: unknown = this.translations;

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = (value as Record<string, unknown>)[part];
      } else {
        console.warn(`[i18n] Missing key: ${key}`);
        return key;
      }
    }

    if (typeof value !== 'string') {
      console.warn(`[i18n] Invalid key: ${key}`);
      return key;
    }

    // Replace {0}, {1}, etc.
    return value.replace(/\{(\d+)\}/g, (_, i) => String(params[i] ?? ''));
  }

  resolve(text: string, ...params: unknown[]): string {
    if (text.startsWith('$')) {
      return this.t(text.slice(1), ...params);
    }
    return text;
  }
}
```

### Step 1.3: Load in BootScene

**Modify: `src/scenes/BootScene.ts`** (in preload)
```typescript
// Add to existing preload()
this.load.json('localization-cs', 'assets/data/localization/cs.json?v=' + Date.now());
this.load.json('localization-en', 'assets/data/localization/en.json?v=' + Date.now());
```

**Modify: `src/scenes/AssetLoaderScene.ts`** (in create, before animations)
```typescript
// Initialize localization
const i18n = LocalizationService.getInstance();
const csData = this.cache.json.get('localization-cs');
i18n.loadTranslations(csData); // Default to Czech
```

**Checkpoint**: `LocalizationService.getInstance().t('ui.buttons.BTN_001')` returns `'ÚTOK'`

---

## Phase 2: Textures & Animations Separation

**Goal**: Move texture paths and animation definitions to JSON files.

### Step 2.1: Create textures.json

**Create: `public/assets/data/textures.json`**

Copy structure from current `assets.json`, restructure slightly:
```json
{
  "version": "1.0",
  "spritesheets": {
    "knight-idle-sheet": {
      "path": "sprites/knight-idle.png",
      "frameWidth": 300,
      "frameHeight": 300
    }
    // ... all spritesheets
  },
  "images": {
    "bg-battle": "backgrounds/field.png"
    // ... all images
  }
}
```

### Step 2.2: Create animations.json

**Create: `public/assets/data/animations.json`**

Extract from `AssetLoaderScene.ts` lines 107-272:
```json
{
  "version": "1.0",
  "player": {
    "knight-idle": {
      "texture": "knight-idle-sheet",
      "frames": { "start": 0, "end": 5 },
      "frameRate": 8,
      "repeat": -1
    },
    "knight-attack": {
      "texture": "knight",
      "frames": { "start": 0, "end": 7 },
      "frameRate": 12,
      "repeat": 0
    }
  },
  "enemies": {
    "slime": {
      "slime-idle": { "texture": "slime", "frames": { "start": 0, "end": 3 }, "frameRate": 6, "repeat": -1 },
      "slime-attack-anim": { "texture": "slime", "frames": { "start": 4, "end": 7 }, "frameRate": 10, "repeat": 0 },
      "slime-hurt": { "texture": "slime", "frames": { "start": 8, "end": 9 }, "frameRate": 8, "repeat": 0 },
      "slime-death": { "texture": "slime", "frames": { "start": 10, "end": 13 }, "frameRate": 8, "repeat": 0 }
    }
    // ... pink, purple, leafy
  }
}
```

### Step 2.3: Create AnimationLoader

**Create: `src/systems/AnimationLoader.ts`**
```typescript
import { AnimationsFile, AnimationDef } from '../types/assets';

export class AnimationLoader {
  static createAll(scene: Phaser.Scene, data: AnimationsFile): void {
    // Player animations
    for (const [key, def] of Object.entries(data.player)) {
      this.createAnimation(scene, key, def);
    }

    // Enemy animations
    for (const [enemyType, anims] of Object.entries(data.enemies)) {
      for (const [key, def] of Object.entries(anims)) {
        this.createAnimation(scene, key, def);
      }
    }
  }

  private static createAnimation(scene: Phaser.Scene, key: string, def: AnimationDef): void {
    if (scene.anims.exists(key)) return;

    scene.anims.create({
      key,
      frames: scene.anims.generateFrameNumbers(def.texture, {
        start: def.frames.start,
        end: def.frames.end
      }),
      frameRate: def.frameRate,
      repeat: def.repeat
    });
  }
}
```

### Step 2.4: Update Loading

**Modify: `src/scenes/BootScene.ts`**
```typescript
// In preload(), add:
this.load.json('textures', 'assets/data/textures.json?v=' + Date.now());
this.load.json('animations', 'assets/data/animations.json?v=' + Date.now());
```

**Modify: `src/scenes/AssetLoaderScene.ts`**
```typescript
// Replace createAnimations() call with:
import { AnimationLoader } from '../systems/AnimationLoader';

// In create():
const animData = this.cache.json.get('animations');
AnimationLoader.createAll(this, animData);
```

**Checkpoint**: All animations play correctly.

---

## Phase 3: Asset Factory

**Goal**: Factory that creates Phaser objects from JSON definitions.

**Create: `src/systems/AssetFactory.ts`**
```typescript
import { LocalizationService } from './LocalizationService';

export class AssetFactory {
  private scene: Phaser.Scene;
  private assets: Record<string, unknown>;
  private i18n: LocalizationService;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.assets = scene.cache.json.get('assets');
    this.i18n = LocalizationService.getInstance();
  }

  getAssetDef(path: string): unknown {
    const parts = path.split('.');
    let obj: unknown = this.assets;
    for (const part of parts) {
      obj = (obj as Record<string, unknown>)?.[part];
    }
    return obj;
  }

  createImage(def: ImageAssetDef, x: number, y: number): Phaser.GameObjects.Image {
    const img = this.scene.add.image(x, y, def.texture);
    if (def.origin) img.setOrigin(...def.origin);
    if (def.depth !== undefined) img.setDepth(def.depth);
    if (def.scale?.default) img.setScale(def.scale.default);
    return img;
  }

  createSprite(def: AnimatedSpriteDef, x: number, y: number, scaleVariant = 'default'): Phaser.GameObjects.Sprite {
    const sprite = this.scene.add.sprite(x, y, def.defaultTexture);
    if (def.origin) sprite.setOrigin(...def.origin);
    if (def.depth !== undefined) sprite.setDepth(def.depth);

    const scale = def.scale?.[scaleVariant] ?? def.scale?.default ?? 1;
    sprite.setScale(scale);

    if (def.defaultAnimation && def.animations[def.defaultAnimation]) {
      sprite.play(def.animations[def.defaultAnimation]);
    }

    return sprite;
  }

  createButton(def: ButtonDef, x: number, y: number, textOverride?: string): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);

    const bg = this.scene.add.rectangle(0, 0, def.width, def.height,
      parseInt(def.style.fill.replace('#', ''), 16));
    bg.setInteractive({ useHandCursor: true });

    const text = this.scene.add.text(0, 0,
      textOverride ?? this.i18n.resolve(def.textKey ?? ''),
      def.textStyle ?? {}
    ).setOrigin(0.5);

    container.add([bg, text]);
    container.setDepth(def.depth ?? 50);

    // Hover effect
    if (def.style.hoverFill) {
      const hoverColor = parseInt(def.style.hoverFill.replace('#', ''), 16);
      const normalColor = parseInt(def.style.fill.replace('#', ''), 16);
      bg.on('pointerover', () => bg.setFillStyle(hoverColor));
      bg.on('pointerout', () => bg.setFillStyle(normalColor));
    }

    return container;
  }

  // ... more create methods
}
```

**Checkpoint**: Factory methods create valid Phaser objects.

---

## Phase 4: Restructure assets.json

**Goal**: Transform to full game object definition format.

**Modify: `public/assets/data/assets.json`**

Keep textures in `textures.json`. Restructure `assets.json` to contain:
```json
{
  "version": "2.0",
  "characters": {
    "player": { "knight": { ... } },
    "enemies": { "slime": { ... }, "pink": { ... } },
    "npcs": { ... }
  },
  "environments": {
    "backgrounds": { ... },
    "buildings": { ... }
  },
  "ui": {
    "buttons": { "attack-button": { ... } },
    "bars": { "health-bar": { ... } }
  },
  "zones": {
    "spawns": {
      "player-spawn-battle": { "point": [300, 480], ... },
      "enemy-spawn-battle": { "points": [[695, 445], [820, 545], [950, 445]], ... }
    }
  }
}
```

**Checkpoint**: Both old texture loading and new asset lookup work.

---

## Phase 5: Scene Builder

**Goal**: System that builds entire scenes from JSON.

### Step 5.1: Create scenes.json

**Create: `public/assets/data/scenes.json`**
```json
{
  "version": "1.0",
  "scenes": {
    "BattleScene": {
      "viewport": { "width": 1280, "height": 720 },
      "elements": [
        { "id": "bg", "asset": "environments.backgrounds.battle-field", "x": 640, "y": 360 }
      ],
      "zones": [
        { "id": "playerSpawn", "zone": "zones.spawns.player-spawn-battle" },
        { "id": "enemySpawn", "zone": "zones.spawns.enemy-spawn-battle" }
      ],
      "ui": [
        { "id": "attackBtn", "asset": "ui.buttons.attack-button", "x": 640, "y": 660 }
      ]
    }
  }
}
```

### Step 5.2: Create SceneBuilder

**Create: `src/systems/SceneBuilder.ts`**
```typescript
import { AssetFactory } from './AssetFactory';
import { SceneDef, SceneElement } from '../types/assets';

export class SceneBuilder {
  private scene: Phaser.Scene;
  private factory: AssetFactory;
  private elements: Map<string, Phaser.GameObjects.GameObject> = new Map();
  private scenesData: Record<string, SceneDef>;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.factory = new AssetFactory(scene);
    this.scenesData = scene.cache.json.get('scenes')?.scenes ?? {};
  }

  hasScene(name: string): boolean {
    return name in this.scenesData;
  }

  build(sceneName: string): void {
    const def = this.scenesData[sceneName];
    if (!def) {
      console.warn(`[SceneBuilder] Scene not found: ${sceneName}`);
      return;
    }

    // Create static elements
    for (const el of def.elements) {
      this.createElement(el);
    }

    // Create UI elements
    for (const el of def.ui) {
      this.createElement(el);
    }
  }

  private createElement(el: SceneElement): void {
    const assetDef = this.factory.getAssetDef(el.asset);
    if (!assetDef) {
      console.warn(`[SceneBuilder] Asset not found: ${el.asset}`);
      return;
    }

    let obj: Phaser.GameObjects.GameObject | null = null;

    // Create based on type
    const type = (assetDef as { type: string }).type;
    switch (type) {
      case 'staticImage':
      case 'interactiveImage':
        obj = this.factory.createImage(assetDef, el.x, el.y);
        break;
      case 'animatedSprite':
        obj = this.factory.createSprite(assetDef, el.x, el.y);
        break;
      case 'button':
        obj = this.factory.createButton(assetDef, el.x, el.y, el.text);
        break;
      // ... more types
    }

    if (obj) {
      this.elements.set(el.id, obj);
    }
  }

  get<T extends Phaser.GameObjects.GameObject>(id: string): T | null {
    return (this.elements.get(id) as T) ?? null;
  }

  spawnOnZone(characterPath: string, zoneId: string): Phaser.GameObjects.Sprite | null {
    const zoneDef = this.factory.getAssetDef(`zones.spawns.${zoneId}`);
    const charDef = this.factory.getAssetDef(characterPath);

    if (!zoneDef || !charDef) return null;

    const point = (zoneDef as { point: [number, number] }).point;
    return this.factory.createSprite(charDef, point[0], point[1]);
  }
}
```

**Checkpoint**: `SceneBuilder.build('BattleScene')` creates elements.

---

## Phase 6: Scene Migration

**Goal**: Migrate each scene to use SceneBuilder.

### Migration Order (simplest first):
1. TavernScene
2. VictoryScene
3. MenuScene
4. WitchHutScene
5. GuildScene
6. TownScene
7. ShopScene
8. BattleScene
9. ArenaScene

### Per-Scene Pattern:

```typescript
// Before:
create(): void {
  this.layoutLoader = new SceneLayoutLoader(this, 'TownScene');
  const def = this.layoutLoader.getLayoutDef()?.elements.find(e => e.id === 'background');
  this.add.image(def?.x ?? 0, def?.y ?? 0, 'town-bg');
}

// After:
create(): void {
  this.builder = new SceneBuilder(this);
  this.builder.build('TownScene');

  // Get references for runtime manipulation
  const bg = this.builder.get<Phaser.GameObjects.Image>('background');
}
```

**Checkpoint per scene**: Scene functions identically.

---

## Phase 7: Zone-Based Spawning

**Goal**: Characters spawn on zones, not hardcoded positions.

```typescript
// Before:
const heroDef = this.layoutLoader.getLayoutDef()?.elements.find(e => e.id === 'hero');
this.hero = this.add.sprite(heroDef?.x ?? 300, heroDef?.y ?? 480, 'knight');

// After:
this.hero = this.builder.spawnOnZone('characters.player.knight', 'player-spawn-battle');
```

**Checkpoint**: Characters at correct positions via zones.

---

## Phase 8: Full Localization

**Goal**: All text uses localization keys.

### Replacements:
| Location | Before | After |
|----------|--------|-------|
| TownScene.ts | `'ČARODĚJNICE'` | `$buildings.BLD_001` |
| BattleScene.ts | `'ÚTOK'` | `$ui.buttons.BTN_001` |
| ShopScene.ts | `'KOUPIT'` | `$ui.buttons.BTN_008` |

**Checkpoint**: Language switch updates all text.

---

## Phase 9: Cleanup

- Remove `SceneLayoutLoader` (deprecated)
- Remove fallback constants
- Remove inline animation creation
- Update documentation

---

## Testing Checkpoints

| Phase | Test |
|-------|------|
| 0 | `npm run build` succeeds |
| 1 | `t('ui.buttons.BTN_001')` → `'ÚTOK'` |
| 2 | All animations play |
| 3 | Factory creates objects |
| 4 | Asset lookup works |
| 5 | SceneBuilder creates scenes |
| 6 | Each scene works post-migration |
| 7 | Characters spawn on zones |
| 8 | Language switch works |
| 9 | No dead code |

---

## Non-Breaking Strategy

During migration, both systems coexist:

```typescript
create(): void {
  // New system
  if (this.builder.hasScene('TownScene')) {
    this.builder.build('TownScene');
  } else {
    // Old fallback
    this.layoutLoader = new SceneLayoutLoader(this, 'TownScene');
    this.createOldWay();
  }
}
```

---

## Estimated Effort

| Phase | Time |
|-------|------|
| 0-1 | 6 hours |
| 2-3 | 10 hours |
| 4-5 | 12 hours |
| 6 | 16 hours |
| 7-9 | 14 hours |
| **Total** | **~58 hours** |
