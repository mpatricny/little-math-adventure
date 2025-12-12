# Asset Organization Structure

This document defines how assets should be organized in `assets.json` based on their **type**, **function**, and **behavior**, with full localization support.

---

## Core Design Principles

1. **Assets define WHAT things are** - appearance, behavior, animations
2. **Zones define WHERE things appear** - spawn points, drop areas, triggers
3. **Characters spawn on zones** - no hardcoded positions for dynamic entities
4. **Text uses localization keys** - no hardcoded strings, all text is localized
5. **Static elements have positions** - backgrounds, props, UI components

---

## File Structure

```
public/assets/data/
├── textures.json            # Raw texture file references (images, spritesheets)
├── animations.json          # Animation definitions (frames, frameRate, repeat)
├── assets.json              # Asset definitions (characters, environments, ui, items, zones)
├── scenes.json              # Scene compositions (what goes where)
├── localization/
│   ├── index.json           # Language metadata
│   ├── cs.json              # Czech translations
│   └── en.json              # English translations
├── enemies.json             # Enemy stats and game data
├── items.json               # Item stats and prices
└── pets.json                # Pet definitions
```

### File Responsibilities

| File | Contains | Purpose |
|------|----------|---------|
| `textures.json` | Image paths, spritesheet configs | Loading raw files |
| `animations.json` | Frame ranges, timing, repeats | Creating Phaser animations |
| `assets.json` | Characters, UI, environments, zones | Defining game objects |
| `scenes.json` | Element placements, zone references | Composing scenes |
| `localization/*.json` | Translated strings | Multi-language support |

---

## Organization Hierarchy

```
assets.json
├── textures          # Raw image/spritesheet files (loading only)
├── characters        # Player, enemies, NPCs (spawnable entities)
├── environments      # Backgrounds, terrain, buildings, props
├── ui                # User interface components
├── items             # Equipment, consumables, currencies
├── effects           # Visual effects, particles, indicators
└── zones             # Spawn points, drop areas, triggers
```

---

## LOCALIZATION SYSTEM

### Localization File Structure

**`localization/index.json`** - Language registry
```json
{
  "defaultLanguage": "cs",
  "supportedLanguages": ["cs", "en"],
  "languages": {
    "cs": {
      "name": "Čeština",
      "file": "cs.json"
    },
    "en": {
      "name": "English",
      "file": "en.json"
    }
  }
}
```

**`localization/cs.json`** - Czech translations
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
      "BTN_005": "NOVÁ HRA",
      "BTN_006": "NAČÍST HRU",
      "BTN_007": "LÉČIT",
      "BTN_008": "KOUPIT",
      "BTN_009": "VYBRAT"
    },

    "labels": {
      "LBL_001": "ŽIVOTY",
      "LBL_002": "ÚTOK",
      "LBL_003": "OBRANA",
      "LBL_004": "ÚROVEŇ",
      "LBL_005": "ZKUŠENOSTI",
      "LBL_006": "ZLATO",
      "LBL_007": "ČAS",
      "LBL_008": "BLOKUJI",
      "LBL_009": "VLNA",
      "LBL_010": "PŘÍKLAD",
      "LBL_011": "TVOJE PENÍZE",
      "LBL_012": "PLATBA",
      "LBL_013": "CELKEM",
      "LBL_014": "DNES",
      "LBL_015": "CELKOVĚ"
    },

    "titles": {
      "TTL_001": "ARÉNA",
      "TTL_002": "PŘEHLED UČENÍ",
      "TTL_003": "CHALOUPKA ČARODĚJNICE",
      "TTL_004": "LÉČENÍ",
      "TTL_005": "MAZLÍČCI",
      "TTL_006": "TVOJE DIAMANTY"
    },

    "messages": {
      "MSG_001": "VÍTĚZSTVÍ!",
      "MSG_002": "PORÁŽKA",
      "MSG_003": "ZABLOKOVÁNO!",
      "MSG_004": "PŘIPRAVUJEME...",
      "MSG_005": "STAV: ZDRAVÝ",
      "MSG_006": "STAV: ZRANĚNÝ",
      "MSG_007": "VIDÍM, ŽE JSI ZESÍLIL.\nUKAŽ MI, CO UMÍŠ!"
    }
  },

  "buildings": {
    "BLD_001": "ČARODĚJNICE",
    "BLD_002": "CECH",
    "BLD_003": "HOSPODA",
    "BLD_004": "OBCHOD"
  },

  "items": {
    "weapons": {
      "WPN_001": "Dřevěný meč",
      "WPN_002": "Železný meč",
      "WPN_003": "Ocelový meč"
    },
    "armor": {
      "ARM_001": "Dřevěný štít",
      "ARM_002": "Železný štít",
      "ARM_003": "Ocelový štít"
    },
    "currency": {
      "CUR_001": "měďák",
      "CUR_002": "stříbrňák",
      "CUR_003": "zlaťák"
    }
  },

  "characters": {
    "enemies": {
      "ENM_001": "Sliz",
      "ENM_002": "Růžák",
      "ENM_003": "Fialák",
      "ENM_004": "Listovák"
    },
    "npcs": {
      "NPC_001": "Kovář",
      "NPC_002": "Mistr cechu"
    }
  },

  "stats": {
    "STT_001": "HP",
    "STT_002": "útok",
    "STT_003": "obrana",
    "STT_004": "blok",
    "STT_005": "čas bloku"
  },

  "formats": {
    "FMT_001": "{0}/{1}",
    "FMT_002": "ČAS: {0}S",
    "FMT_003": "VLNA {0}",
    "FMT_004": "CELKEM: {0} měďáků",
    "FMT_005": "ÚROVEŇ: {0}   |   CYKLUS: {1}   |   {2}%"
  }
}
```

**`localization/en.json`** - English translations
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
      "BTN_005": "NEW GAME",
      "BTN_006": "LOAD GAME",
      "BTN_007": "HEAL",
      "BTN_008": "BUY",
      "BTN_009": "SELECT"
    },

    "labels": {
      "LBL_001": "HEALTH",
      "LBL_002": "ATTACK",
      "LBL_003": "DEFENSE",
      "LBL_004": "LEVEL",
      "LBL_005": "EXPERIENCE",
      "LBL_006": "GOLD",
      "LBL_007": "TIME",
      "LBL_008": "BLOCKING",
      "LBL_009": "WAVE",
      "LBL_010": "PROBLEM",
      "LBL_011": "YOUR MONEY",
      "LBL_012": "PAYMENT",
      "LBL_013": "TOTAL",
      "LBL_014": "TODAY",
      "LBL_015": "ALL TIME"
    },

    "titles": {
      "TTL_001": "ARENA",
      "TTL_002": "LEARNING OVERVIEW",
      "TTL_003": "WITCH'S HUT",
      "TTL_004": "HEALING",
      "TTL_005": "PETS",
      "TTL_006": "YOUR DIAMONDS"
    },

    "messages": {
      "MSG_001": "VICTORY!",
      "MSG_002": "DEFEAT",
      "MSG_003": "BLOCKED!",
      "MSG_004": "COMING SOON...",
      "MSG_005": "STATUS: HEALTHY",
      "MSG_006": "STATUS: INJURED",
      "MSG_007": "I SEE YOU'VE GROWN STRONGER.\nSHOW ME WHAT YOU CAN DO!"
    }
  },

  "buildings": {
    "BLD_001": "WITCH",
    "BLD_002": "GUILD",
    "BLD_003": "TAVERN",
    "BLD_004": "SHOP"
  },

  "items": {
    "weapons": {
      "WPN_001": "Wooden Sword",
      "WPN_002": "Iron Sword",
      "WPN_003": "Steel Sword"
    },
    "armor": {
      "ARM_001": "Wooden Shield",
      "ARM_002": "Iron Shield",
      "ARM_003": "Steel Shield"
    },
    "currency": {
      "CUR_001": "copper",
      "CUR_002": "silver",
      "CUR_003": "gold"
    }
  },

  "characters": {
    "enemies": {
      "ENM_001": "Slime",
      "ENM_002": "Pinky",
      "ENM_003": "Purple",
      "ENM_004": "Leafy"
    },
    "npcs": {
      "NPC_001": "Blacksmith",
      "NPC_002": "Guildmaster"
    }
  },

  "stats": {
    "STT_001": "HP",
    "STT_002": "attack",
    "STT_003": "defense",
    "STT_004": "block",
    "STT_005": "block time"
  },

  "formats": {
    "FMT_001": "{0}/{1}",
    "FMT_002": "TIME: {0}S",
    "FMT_003": "WAVE {0}",
    "FMT_004": "TOTAL: {0} copper",
    "FMT_005": "LEVEL: {0}   |   CYCLE: {1}   |   {2}%"
  }
}
```

### Using Localization Keys in Assets

Text in assets uses `$KEY` format:

```json
{
  "ui": {
    "buttons": {
      "attack-button": {
        "type": "button",
        "text": "$ui.buttons.BTN_001"
      }
    },
    "labels": {
      "building-label-shop": {
        "type": "text",
        "text": "$buildings.BLD_004"
      }
    }
  }
}
```

### Using Localization in Scenes

```json
{
  "TownScene": {
    "ui": [
      { "id": "witch-label", "asset": "ui.labels.building-label", "x": 220, "y": 430, "text": "$buildings.BLD_001" },
      { "id": "guild-label", "asset": "ui.labels.building-label", "x": 454, "y": 446, "text": "$buildings.BLD_002" },
      { "id": "tavern-label", "asset": "ui.labels.building-label", "x": 655, "y": 420, "text": "$buildings.BLD_003" },
      { "id": "shop-label", "asset": "ui.labels.building-label", "x": 882, "y": 442, "text": "$buildings.BLD_004" }
    ]
  }
}
```

### Localization Service

```typescript
// src/systems/LocalizationService.ts

export class LocalizationService {
  private static instance: LocalizationService;
  private currentLanguage: string = 'cs';
  private translations: Record<string, any> = {};

  static getInstance(): LocalizationService {
    if (!this.instance) {
      this.instance = new LocalizationService();
    }
    return this.instance;
  }

  setLanguage(lang: string): void {
    this.currentLanguage = lang;
    // Load translations from cache
  }

  /**
   * Get translated text
   * @param key - Localization key like "ui.buttons.BTN_001"
   * @param params - Optional parameters for format strings
   */
  t(key: string, ...params: any[]): string {
    const path = key.split('.');
    let value = this.translations;

    for (const segment of path) {
      value = value?.[segment];
    }

    if (typeof value !== 'string') {
      console.warn(`Missing translation: ${key}`);
      return key;
    }

    // Replace {0}, {1}, etc. with params
    return value.replace(/\{(\d+)\}/g, (_, index) => params[index] ?? '');
  }

  /**
   * Resolve localization key if string starts with $
   */
  resolve(text: string, ...params: any[]): string {
    if (text.startsWith('$')) {
      return this.t(text.slice(1), ...params);
    }
    return text;
  }
}
```

---

## 1. TEXTURES (`textures.json`)

Separate file containing raw image/spritesheet file references. Used only for loading assets into Phaser's texture cache.

**File: `public/assets/data/textures.json`**

```json
{
  "version": "1.0",
  "spritesheets": {
      "knight-idle-sheet": {
        "path": "sprites/knight-idle.png",
        "frameWidth": 300,
        "frameHeight": 300
      },
      "knight-attack-sheet": {
        "path": "sprites/knight-attack.png",
        "frameWidth": 256,
        "frameHeight": 256
      },
      "slime-sheet": {
        "path": "sprites/slime.png",
        "frameWidth": 256,
        "frameHeight": 256
      },
      "pink-idle-sheet": {
        "path": "sprites/pink-idle.png",
        "frameWidth": 320,
        "frameHeight": 304
      },
      "pink-attack-sheet": {
        "path": "sprites/pink-attack.png",
        "frameWidth": 320,
        "frameHeight": 300
      },
      "pink-hit-sheet": {
        "path": "sprites/pink-hit.png",
        "frameWidth": 320,
        "frameHeight": 304
      },
      "purple-attack-sheet": {
        "path": "sprites/Purple-attack.png",
        "frameWidth": 300,
        "frameHeight": 320
      },
      "purple-hit-sheet": {
        "path": "sprites/purple-hit-fall.png",
        "frameWidth": 300,
        "frameHeight": 300
      },
      "leafy-idle-sheet": {
        "path": "sprites/leafy-idle.png",
        "frameWidth": 330,
        "frameHeight": 300
      },
      "leafy-attack-sheet": {
        "path": "sprites/leafy-attack.png",
        "frameWidth": 330,
        "frameHeight": 300
      },
      "leafy-hit-sheet": {
        "path": "sprites/leafy-hit.png",
        "frameWidth": 330,
        "frameHeight": 300
      },
      "hint-items-sheet": {
        "path": "sprites/hint-items.png",
        "frameWidth": 200,
        "frameHeight": 200
      },
      "shop-coins-sheet": {
        "path": "town/shop/coins sprite.png",
        "frameWidth": 221,
        "frameHeight": 222
      },
      "shop-swords-sheet": {
        "path": "town/shop/sword-set.png",
        "frameWidth": 239,
        "frameHeight": 300
      },
      "shop-shields-sheet": {
        "path": "town/shop/shield-set.png",
        "frameWidth": 260,
        "frameHeight": 232
      }
    },

    "images": {
      "bg-battle": "backgrounds/field.png",
      "bg-arena": "backgrounds/arena-view.png",
      "bg-town": "town/background.png",
      "terrain-grass": "town/grass.png",

      "building-witch-hut": "town/witch-hut.png",
      "building-guild": "town/guild.png",
      "building-tavern": "town/tavern.png",
      "building-shop": "town/weapon-shop.png",

      "interior-witch-hut": "town/witch-hut-interior.png",
      "interior-guild": "town/guild/guild-interior.png",
      "interior-tavern": "town/tavern-interior.png",
      "interior-shop": "town/shop/shop-interior.png",

      "npc-blacksmith": "town/shop/blacksmith.png",
      "npc-guildmaster": "town/guild/Dialog - guildmaster.png",

      "shop-table-pouch": "town/shop/table-with-pouch.png",
      "shop-table-top": "town/shop/table-top.png",
      "shop-coin-tray": "town/shop/coin-tray.png",
      "shop-inventory": "town/shop/empty inventory.png",

      "ui-math-board": "ui/math-board-larger.png",
      "ui-button": "ui/small_board_button.png",
      "ui-button-pressed": "ui/small_board_button_pressed.png",
      "ui-results-table": "ui/results-table.png",
      "ui-stone-bar-frame": "ui/stone-bar-frame.png",
      "ui-exclamation": "ui/exclamation-mark.png"
  }
}
```

---

## 2. ANIMATIONS (`animations.json`)

Separate file containing all animation definitions. References textures from `textures.json`.

**File: `public/assets/data/animations.json`**

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
      "texture": "knight-attack-sheet",
      "frames": { "start": 0, "end": 7 },
      "frameRate": 12,
      "repeat": 0
    }
  },

  "enemies": {
    "slime": {
      "slime-idle": {
        "texture": "slime-sheet",
        "frames": { "start": 0, "end": 3 },
        "frameRate": 6,
        "repeat": -1
      },
      "slime-attack-anim": {
        "texture": "slime-sheet",
        "frames": { "start": 4, "end": 7 },
        "frameRate": 10,
        "repeat": 0
      },
      "slime-hurt": {
        "texture": "slime-sheet",
        "frames": { "start": 8, "end": 9 },
        "frameRate": 8,
        "repeat": 0
      },
      "slime-death": {
        "texture": "slime-sheet",
        "frames": { "start": 10, "end": 13 },
        "frameRate": 8,
        "repeat": 0
      }
    },

    "pink": {
      "pink-idle": {
        "texture": "pink-idle-sheet",
        "frames": { "start": 0, "end": 5 },
        "frameRate": 8,
        "repeat": -1
      },
      "pink-attack-anim": {
        "texture": "pink-attack-sheet",
        "frames": { "start": 0, "end": 5 },
        "frameRate": 10,
        "repeat": 0
      },
      "pink-hurt": {
        "texture": "pink-hit-sheet",
        "frames": { "start": 0, "end": 3 },
        "frameRate": 8,
        "repeat": 0
      },
      "pink-death": {
        "texture": "pink-hit-sheet",
        "frames": { "start": 4, "end": 7 },
        "frameRate": 8,
        "repeat": 0
      }
    },

    "purple": {
      "purple-idle": {
        "texture": "purple-attack-sheet",
        "frames": { "start": 0, "end": 5 },
        "frameRate": 8,
        "repeat": -1
      },
      "purple-attack-anim": {
        "texture": "purple-attack-sheet",
        "frames": { "start": 0, "end": 5 },
        "frameRate": 10,
        "repeat": 0
      },
      "purple-hurt": {
        "texture": "purple-hit-sheet",
        "frames": { "start": 0, "end": 3 },
        "frameRate": 8,
        "repeat": 0
      },
      "purple-death": {
        "texture": "purple-hit-sheet",
        "frames": { "start": 4, "end": 7 },
        "frameRate": 8,
        "repeat": 0
      }
    },

    "leafy": {
      "leafy-idle": {
        "texture": "leafy-idle-sheet",
        "frames": { "start": 0, "end": 5 },
        "frameRate": 8,
        "repeat": -1
      },
      "leafy-attack-anim": {
        "texture": "leafy-attack-sheet",
        "frames": { "start": 0, "end": 5 },
        "frameRate": 10,
        "repeat": 0
      },
      "leafy-hurt": {
        "texture": "leafy-hit-sheet",
        "frames": { "start": 0, "end": 3 },
        "frameRate": 8,
        "repeat": 0
      },
      "leafy-death": {
        "texture": "leafy-hit-sheet",
        "frames": { "start": 4, "end": 7 },
        "frameRate": 8,
        "repeat": 0
      }
    }
  }
}
```

---

## 3. CHARACTERS (`assets.json` - Spawnable Entities)

Characters are defined by their appearance and behavior - they spawn on zones at runtime.
Now animations are referenced by key from `animations.json` instead of being embedded.

### Key Concept: Characters Don't Have Positions

Characters are **spawned** onto **spawn zones** defined in the scene.

**File: `public/assets/data/assets.json`** (characters section)

```json
{
  "version": "1.0",

  "characters": {
    "player": {
      "knight": {
        "type": "animatedSprite",
        "category": "player",
        "nameKey": "$characters.player.PLR_001",
        "origin": [0.5, 1],
        "scale": {
          "default": 0.4,
          "battle": 0.6,
          "arena": 0.79
        },
        "depth": 5,
        "defaultTexture": "knight-idle-sheet",
        "animations": {
          "idle": "knight-idle",
          "attack": "knight-attack"
        },
        "defaultAnimation": "idle",
        "hurtEffect": {
          "tint": "#ff0000",
          "duration": 100
        }
      }
    },

    "enemies": {
      "slime": {
        "type": "animatedSprite",
        "category": "enemy",
        "nameKey": "$characters.enemies.ENM_001",
        "origin": [0.5, 0.5],
        "scale": {
          "default": 0.5,
          "arena": 1.35
        },
        "depth": 5,
        "defaultTexture": "slime-sheet",
        "animations": {
          "idle": "slime-idle",
          "attack": "slime-attack-anim",
          "hurt": "slime-hurt",
          "death": "slime-death"
        },
        "defaultAnimation": "idle"
      },

      "pink": {
        "type": "animatedSprite",
        "category": "enemy",
        "nameKey": "$characters.enemies.ENM_002",
        "origin": [0.5, 0.5],
        "scale": { "default": 0.5 },
        "depth": 5,
        "defaultTexture": "pink-idle-sheet",
        "animations": {
          "idle": "pink-idle",
          "attack": "pink-attack-anim",
          "hurt": "pink-hurt",
          "death": "pink-death"
        },
        "defaultAnimation": "idle"
      },

      "purple": {
        "type": "animatedSprite",
        "category": "enemy",
        "nameKey": "$characters.enemies.ENM_003",
        "origin": [0.5, 0.5],
        "scale": { "default": 0.5 },
        "depth": 5,
        "defaultTexture": "purple-attack-sheet",
        "animations": {
          "idle": "purple-idle",
          "attack": "purple-attack-anim",
          "hurt": "purple-hurt",
          "death": "purple-death"
        },
        "defaultAnimation": "idle"
      },

      "leafy": {
        "type": "animatedSprite",
        "category": "enemy",
        "nameKey": "$characters.enemies.ENM_004",
        "origin": [0.5, 0.5],
        "scale": { "default": 0.5 },
        "depth": 5,
        "defaultTexture": "leafy-idle-sheet",
        "animations": {
          "idle": "leafy-idle",
          "attack": "leafy-attack-anim",
          "hurt": "leafy-hurt",
          "death": "leafy-death"
        },
        "defaultAnimation": "idle"
      }
    },

    "npcs": {
      "blacksmith": {
        "type": "staticImage",
        "category": "npc",
        "nameKey": "$characters.npcs.NPC_001",
        "texture": "npc-blacksmith",
        "origin": [0.5, 1],
        "scale": { "default": 1 },
        "depth": 5
      },
      "guildmaster": {
        "type": "staticImage",
        "category": "npc",
        "nameKey": "$characters.npcs.NPC_002",
        "texture": "npc-guildmaster",
        "origin": [0.5, 0.5],
        "scale": { "default": 0.4 },
        "depth": 10
      }
    }
  }
}
```

---

## 3. ZONES (Spawn Points, Drop Areas, Triggers)

Zones define WHERE characters appear and WHERE interactions happen.

```json
{
  "zones": {
    "spawns": {
      "player-spawn-battle": {
        "type": "playerSpawn",
        "category": "zone.spawn",
        "character": "characters.player.knight",
        "scaleVariant": "battle",
        "point": [300, 480],
        "facing": "right"
      },

      "player-spawn-arena": {
        "type": "playerSpawn",
        "category": "zone.spawn",
        "character": "characters.player.knight",
        "scaleVariant": "arena",
        "point": [235, 575],
        "facing": "right"
      },

      "player-spawn-town": {
        "type": "playerSpawn",
        "category": "zone.spawn",
        "character": "characters.player.knight",
        "scaleVariant": "default",
        "point": [80, 675],
        "facing": "right"
      },

      "enemy-spawn-battle": {
        "type": "enemySpawn",
        "category": "zone.spawn",
        "maxEnemies": 3,
        "points": [
          [695, 445],
          [820, 545],
          [950, 445]
        ],
        "facing": "left"
      },

      "enemy-spawn-arena": {
        "type": "enemySpawn",
        "category": "zone.spawn",
        "maxEnemies": 3,
        "points": [
          [850, 425],
          [950, 525],
          [1050, 425]
        ],
        "facing": "left"
      },

      "npc-spawn-guildmaster": {
        "type": "npcSpawn",
        "category": "zone.spawn",
        "character": "characters.npcs.guildmaster",
        "point": [557, 235]
      }
    },

    "dropZones": {
      "payment-zone": {
        "type": "dropZone",
        "category": "zone.drop",
        "shape": "rect",
        "bounds": [224, 549, 164, 80],
        "accepts": ["items.currency.coin"],
        "onDrop": "addToPayment"
      },

      "table-zone": {
        "type": "dropZone",
        "category": "zone.drop",
        "shape": "rect",
        "bounds": [94, 529, 1044, 206],
        "accepts": ["items.currency.coin"],
        "onDrop": "returnToTable"
      }
    },

    "itemSpawns": {
      "coin-spawn-shop": {
        "type": "itemSpawn",
        "category": "zone.spawn",
        "item": "items.currency.coin",
        "bounds": [838, 582, 200, 100],
        "spawnPattern": "scattered"
      }
    },

    "triggers": {
      "arena-trigger": {
        "type": "trigger",
        "category": "zone.trigger",
        "shape": "rect",
        "bounds": [1180, 300, 80, 120],
        "action": "enterScene:ArenaScene"
      }
    }
  }
}
```

---

## 4. ENVIRONMENTS

Static backgrounds, terrain, and world objects.

```json
{
  "environments": {
    "backgrounds": {
      "battle-field": {
        "type": "staticImage",
        "category": "background",
        "texture": "bg-battle",
        "origin": [0.5, 0.5],
        "displaySize": [1280, 720],
        "depth": -10
      },
      "arena": {
        "type": "staticImage",
        "category": "background",
        "texture": "bg-arena",
        "origin": [0.5, 0.5],
        "depth": -10
      },
      "town": {
        "type": "tileSprite",
        "category": "background",
        "texture": "bg-town",
        "origin": [0, 0],
        "tileScale": [0.88, 0.88],
        "depth": -10,
        "scrollFactor": 0
      }
    },

    "terrain": {
      "grass-layer": {
        "type": "tileSprite",
        "category": "terrain",
        "texture": "terrain-grass",
        "origin": [0, 1],
        "tileScale": [0.14, 0.18],
        "scrollFactor": 0
      }
    },

    "buildings": {
      "witch-hut": {
        "type": "interactiveImage",
        "category": "building",
        "labelKey": "$buildings.BLD_001",
        "texture": "building-witch-hut",
        "origin": [0.5, 1],
        "scale": { "default": 0.224 },
        "depth": 0,
        "interactive": { "useHandCursor": true },
        "hoverEffect": {
          "scaleMultiplier": 1.05,
          "tint": "#ffffcc"
        },
        "action": "enterScene:WitchHutScene"
      },
      "guild": {
        "type": "interactiveImage",
        "category": "building",
        "labelKey": "$buildings.BLD_002",
        "texture": "building-guild",
        "origin": [0.5, 1],
        "scale": { "default": 0.224 },
        "depth": 0,
        "interactive": { "useHandCursor": true },
        "hoverEffect": {
          "scaleMultiplier": 1.05,
          "tint": "#ffffcc"
        },
        "action": "enterScene:GuildScene"
      },
      "tavern": {
        "type": "interactiveImage",
        "category": "building",
        "labelKey": "$buildings.BLD_003",
        "texture": "building-tavern",
        "origin": [0.5, 1],
        "scale": { "default": 0.224 },
        "depth": 0,
        "interactive": { "useHandCursor": true },
        "hoverEffect": {
          "scaleMultiplier": 1.05,
          "tint": "#ffffcc"
        },
        "action": "enterScene:TavernScene"
      },
      "shop": {
        "type": "interactiveImage",
        "category": "building",
        "labelKey": "$buildings.BLD_004",
        "texture": "building-shop",
        "origin": [0.5, 1],
        "scale": { "default": 0.184 },
        "depth": 0,
        "interactive": { "useHandCursor": true },
        "hoverEffect": {
          "scaleMultiplier": 1.05,
          "tint": "#ffffcc"
        },
        "action": "enterScene:ShopScene"
      }
    },

    "interiors": {
      "witch-hut-interior": {
        "type": "staticImage",
        "category": "interior",
        "texture": "interior-witch-hut",
        "origin": [0.5, 0.5],
        "depth": -10
      },
      "guild-interior": {
        "type": "staticImage",
        "category": "interior",
        "texture": "interior-guild",
        "origin": [0.5, 0.5],
        "depth": -10
      },
      "tavern-interior": {
        "type": "staticImage",
        "category": "interior",
        "texture": "interior-tavern",
        "origin": [0.5, 0.5],
        "depth": -10
      },
      "shop-interior": {
        "type": "staticImage",
        "category": "interior",
        "texture": "interior-shop",
        "origin": [0.5, 0.5],
        "depth": -10
      }
    },

    "props": {
      "shop-table-pouch": {
        "type": "staticImage",
        "category": "prop",
        "texture": "shop-table-pouch",
        "origin": [0.5, 0.5],
        "depth": 5
      },
      "shop-table-top": {
        "type": "staticImage",
        "category": "prop",
        "texture": "shop-table-top",
        "origin": [0.5, 0.5],
        "depth": 5
      },
      "shop-coin-tray": {
        "type": "staticImage",
        "category": "prop",
        "texture": "shop-coin-tray",
        "origin": [0.5, 0.5],
        "depth": 5
      }
    }
  }
}
```

---

## 5. UI COMPONENTS

Reusable interface elements with localized text.

```json
{
  "ui": {
    "buttons": {
      "attack-button": {
        "type": "button",
        "category": "ui.button",
        "width": 150,
        "height": 50,
        "textKey": "$ui.buttons.BTN_001",
        "style": {
          "fill": "#44aa44",
          "hoverFill": "#55bb55",
          "pressedFill": "#338833"
        },
        "textStyle": {
          "fontSize": "24px",
          "fontFamily": "Arial, sans-serif",
          "color": "#ffffff",
          "fontStyle": "bold"
        },
        "depth": 50
      },

      "back-button": {
        "type": "button",
        "category": "ui.button",
        "width": 150,
        "height": 50,
        "textKey": "$ui.buttons.BTN_003",
        "style": {
          "fill": "#444444",
          "hoverFill": "#555555",
          "stroke": { "color": "#ffffff", "width": 2 }
        },
        "textStyle": {
          "fontSize": "24px",
          "fontFamily": "Arial, sans-serif",
          "color": "#ffffff"
        },
        "depth": 50
      },

      "heal-button": {
        "type": "button",
        "category": "ui.button",
        "width": 120,
        "height": 40,
        "textKey": "$ui.buttons.BTN_007",
        "style": {
          "fill": "#aa44aa",
          "hoverFill": "#bb55bb"
        },
        "textStyle": {
          "fontSize": "20px",
          "fontFamily": "Arial, sans-serif",
          "color": "#ffffff",
          "fontStyle": "bold"
        },
        "depth": 15
      },

      "buy-button": {
        "type": "button",
        "category": "ui.button",
        "width": 100,
        "height": 40,
        "textKey": "$ui.buttons.BTN_008",
        "style": {
          "fill": "#44aa44",
          "hoverFill": "#55bb55"
        },
        "textStyle": {
          "fontSize": "18px",
          "fontFamily": "Arial, sans-serif",
          "color": "#ffffff",
          "fontStyle": "bold"
        },
        "depth": 20
      }
    },

    "bars": {
      "health-bar": {
        "type": "progressBar",
        "category": "ui.bar",
        "width": 100,
        "height": 12,
        "style": {
          "background": "#333333"
        },
        "fillColors": {
          "high": "#44cc44",
          "medium": "#cccc44",
          "low": "#cc4444"
        },
        "thresholds": {
          "medium": 0.5,
          "low": 0.25
        },
        "showText": true,
        "textFormat": "$formats.FMT_001",
        "textStyle": {
          "fontSize": "10px",
          "fontFamily": "Arial, sans-serif",
          "color": "#ffffff"
        },
        "depth": 10,
        "attachTo": "character",
        "offset": [0, -90]
      }
    },

    "panels": {
      "dark-overlay": {
        "type": "panel",
        "category": "ui.panel",
        "fill": "#000000",
        "alpha": 0.5,
        "depth": -5
      },

      "info-panel": {
        "type": "panel",
        "category": "ui.panel",
        "fill": "#000000",
        "alpha": 0.7,
        "stroke": {
          "color": "#886688",
          "width": 2
        },
        "depth": 5
      },

      "dialog-panel": {
        "type": "panel",
        "category": "ui.panel",
        "fill": "#000000",
        "alpha": 0.85,
        "stroke": {
          "color": "#5a99aa",
          "width": 2
        },
        "depth": 100
      }
    },

    "labels": {
      "title-label": {
        "type": "text",
        "category": "ui.label",
        "style": {
          "fontSize": "32px",
          "fontFamily": "Arial, sans-serif",
          "color": "#ffd700",
          "fontStyle": "bold",
          "stroke": "#000000",
          "strokeThickness": 4
        },
        "origin": [0.5, 0.5],
        "depth": 10
      },

      "building-label": {
        "type": "text",
        "category": "ui.label",
        "style": {
          "fontSize": "18px",
          "fontFamily": "Arial, sans-serif",
          "color": "#ffffff",
          "fontStyle": "bold",
          "stroke": "#000000",
          "strokeThickness": 4
        },
        "origin": [0.5, 1],
        "depth": 10,
        "floatAnimation": {
          "y": -5,
          "duration": 1500,
          "ease": "Sine.easeInOut"
        }
      },

      "damage-label": {
        "type": "text",
        "category": "ui.label",
        "style": {
          "fontSize": "28px",
          "fontFamily": "Arial, sans-serif",
          "color": "#ff4444",
          "fontStyle": "bold",
          "stroke": "#000000",
          "strokeThickness": 3
        },
        "origin": [0.5, 0.5],
        "depth": 200,
        "animation": {
          "type": "floatAndFade",
          "y": -40,
          "duration": 800
        }
      },

      "gold-label": {
        "type": "text",
        "category": "ui.label",
        "style": {
          "fontSize": "16px",
          "fontFamily": "Arial, sans-serif",
          "color": "#ffd700",
          "fontStyle": "bold"
        },
        "origin": [0.5, 0.5],
        "depth": 10
      }
    },

    "indicators": {
      "notification-badge": {
        "type": "container",
        "category": "ui.indicator",
        "components": [
          {
            "type": "circle",
            "radius": 28,
            "fill": "#ff3333",
            "stroke": { "color": "#880000", "width": 4 }
          },
          {
            "type": "text",
            "content": "!",
            "style": {
              "fontSize": "42px",
              "fontFamily": "Arial, sans-serif",
              "color": "#ffffff",
              "fontStyle": "bold"
            },
            "offsetY": -2
          }
        ],
        "depth": 80,
        "pulseAnimation": {
          "y": -8,
          "scale": 1.1,
          "duration": 500
        }
      },

      "close-button": {
        "type": "text",
        "category": "ui.indicator",
        "content": "✕",
        "style": {
          "fontSize": "32px",
          "fontFamily": "Arial, sans-serif",
          "color": "#ff6666",
          "fontStyle": "bold"
        },
        "hoverColor": "#ff8888",
        "depth": 100
      }
    }
  }
}
```

---

## 6. ITEMS

Equipment, consumables, and currencies with localized names.

```json
{
  "items": {
    "weapons": {
      "sword": {
        "type": "spriteItem",
        "category": "item.weapon",
        "texture": "shop-swords-sheet",
        "variants": {
          "wooden": { "frame": 0, "nameKey": "$items.weapons.WPN_001" },
          "iron": { "frame": 1, "nameKey": "$items.weapons.WPN_002" },
          "steel": { "frame": 2, "nameKey": "$items.weapons.WPN_003" }
        },
        "origin": [0.5, 0.5],
        "scale": { "default": 0.3 },
        "depth": 10
      }
    },

    "armor": {
      "shield": {
        "type": "spriteItem",
        "category": "item.armor",
        "texture": "shop-shields-sheet",
        "variants": {
          "wooden": { "frame": 0, "nameKey": "$items.armor.ARM_001" },
          "iron": { "frame": 1, "nameKey": "$items.armor.ARM_002" },
          "steel": { "frame": 2, "nameKey": "$items.armor.ARM_003" }
        },
        "origin": [0.5, 0.5],
        "scale": { "default": 0.3 },
        "depth": 10
      }
    },

    "currency": {
      "coin": {
        "type": "draggableSprite",
        "category": "item.currency",
        "texture": "shop-coins-sheet",
        "variants": {
          "copper": { "frame": 0, "nameKey": "$items.currency.CUR_001", "value": 1 },
          "silver": { "frame": 1, "nameKey": "$items.currency.CUR_002", "value": 10 },
          "gold": { "frame": 2, "nameKey": "$items.currency.CUR_003", "value": 100 }
        },
        "origin": [0.5, 0.5],
        "scale": { "default": 0.25 },
        "depth": 15,
        "draggable": true
      }
    }
  }
}
```

---

## 7. EFFECTS

Visual effects and feedback.

```json
{
  "effects": {
    "tweens": {
      "float-and-fade": {
        "type": "tweenEffect",
        "props": {
          "y": "-=40",
          "alpha": 0
        },
        "duration": 800,
        "ease": "Power2"
      },

      "pulse": {
        "type": "tweenEffect",
        "props": {
          "scaleX": 1.1,
          "scaleY": 1.1
        },
        "duration": 500,
        "yoyo": true,
        "repeat": -1,
        "ease": "Sine.easeInOut"
      },

      "bob": {
        "type": "tweenEffect",
        "props": {
          "y": "-=8"
        },
        "duration": 400,
        "yoyo": true,
        "repeat": -1,
        "ease": "Sine.inOut"
      }
    },

    "flashes": {
      "damage-flash": {
        "type": "tintEffect",
        "tint": "#ff0000",
        "duration": 100,
        "yoyo": true
      },

      "heal-flash": {
        "type": "tintEffect",
        "tint": "#00ff00",
        "duration": 200,
        "yoyo": true
      }
    }
  }
}
```

---

## Scene Definition with Localization

```json
{
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
    },

    "TownScene": {
      "viewport": { "width": 1280, "height": 720 },

      "elements": [
        { "id": "bg", "asset": "environments.backgrounds.town", "x": 0, "y": 0, "width": 1280, "height": 720 },
        { "id": "bgGrass", "asset": "environments.terrain.grass-layer", "x": 0, "y": 685, "width": 1280, "height": 80, "depth": -5, "alpha": 0.8 },
        { "id": "witch", "asset": "environments.buildings.witch-hut", "x": 220, "y": 670 },
        { "id": "guild", "asset": "environments.buildings.guild", "x": 455, "y": 700 },
        { "id": "tavern", "asset": "environments.buildings.tavern", "x": 655, "y": 665 },
        { "id": "shop", "asset": "environments.buildings.shop", "x": 880, "y": 670 },
        { "id": "fgGrass", "asset": "environments.terrain.grass-layer", "x": 0, "y": 705, "width": 1280, "height": 70, "depth": 5 }
      ],

      "zones": [
        { "id": "playerSpawn", "zone": "zones.spawns.player-spawn-town" }
      ],

      "ui": [
        { "id": "witch-label", "asset": "ui.labels.building-label", "x": 220, "y": 430, "text": "$buildings.BLD_001" },
        { "id": "guild-label", "asset": "ui.labels.building-label", "x": 454, "y": 446, "text": "$buildings.BLD_002" },
        { "id": "tavern-label", "asset": "ui.labels.building-label", "x": 655, "y": 420, "text": "$buildings.BLD_003" },
        { "id": "shop-label", "asset": "ui.labels.building-label", "x": 882, "y": 442, "text": "$buildings.BLD_004" },
        { "id": "arena-label", "asset": "ui.labels.building-label", "x": 1220, "y": 410, "text": "$ui.titles.TTL_001" }
      ]
    },

    "WitchHutScene": {
      "viewport": { "width": 1280, "height": 720 },

      "elements": [
        { "id": "interior", "asset": "environments.interiors.witch-hut-interior", "x": 640, "y": 360 },
        { "id": "overlay", "asset": "ui.panels.dark-overlay", "x": 640, "y": 360, "width": 1280, "height": 720 }
      ],

      "ui": [
        { "id": "title", "asset": "ui.labels.title-label", "x": 640, "y": 40, "text": "$ui.titles.TTL_003" },
        { "id": "healingTitle", "asset": "ui.labels.title-label", "x": 280, "y": 160, "text": "$ui.titles.TTL_004", "fontSize": "24px", "color": "#ff88ff" },
        { "id": "petsTitle", "asset": "ui.labels.title-label", "x": 800, "y": 140, "text": "$ui.titles.TTL_005", "fontSize": "24px", "color": "#ff88ff" },
        { "id": "healBtn", "asset": "ui.buttons.heal-button", "x": 280, "y": 320 },
        { "id": "backBtn", "asset": "ui.buttons.back-button", "x": 640, "y": 630 }
      ]
    }
  }
}
```

---

## Complete Hierarchy Summary

```
public/assets/data/
│
├── textures.json                    # RAW FILE REFERENCES
│   ├── spritesheets/               # Animated sprite sources
│   └── images/                     # Static image sources
│
├── animations.json                  # ANIMATION DEFINITIONS
│   ├── player/                     # Knight animations
│   └── enemies/                    # Enemy animations by type
│       ├── slime/
│       ├── pink/
│       ├── purple/
│       └── leafy/
│
├── assets.json                      # GAME OBJECT DEFINITIONS
│   ├── characters/
│   │   ├── player/                 # Knight (references animations)
│   │   ├── enemies/                # Enemy types (references animations)
│   │   └── npcs/                   # Static NPCs
│   ├── environments/
│   │   ├── backgrounds/            # Full-screen backgrounds
│   │   ├── terrain/                # Ground, grass layers
│   │   ├── buildings/              # Interactive town buildings
│   │   ├── interiors/              # Interior backgrounds
│   │   └── props/                  # Tables, decorations
│   ├── ui/
│   │   ├── buttons/                # Primary, secondary, danger
│   │   ├── bars/                   # Health, XP, timer
│   │   ├── panels/                 # Overlays, dialogs
│   │   ├── labels/                 # Text styles
│   │   └── indicators/             # Notifications, targets
│   ├── items/
│   │   ├── weapons/                # Swords (by tier)
│   │   ├── armor/                  # Shields (by tier)
│   │   └── currency/               # Coins (draggable)
│   ├── effects/
│   │   ├── tweens/                 # Reusable animations
│   │   └── flashes/                # Tint effects
│   └── zones/
│       ├── spawns/                 # Player, enemy, NPC spawns
│       ├── dropZones/              # Drag-and-drop targets
│       ├── itemSpawns/             # Item spawn areas
│       └── triggers/               # Scene transitions
│
├── scenes.json                      # SCENE COMPOSITIONS
│   └── [SceneName]/
│       ├── elements/               # Static placements
│       ├── zones/                  # Zone references
│       └── ui/                     # UI placements
│
├── localization/                    # TRANSLATIONS
│   ├── index.json                  # Language registry
│   ├── cs.json                     # Czech
│   └── en.json                     # English
│
└── [Game Data]/
    ├── enemies.json                # Enemy stats
    ├── items.json                  # Item stats & prices
    └── pets.json                   # Pet definitions
```

### Data Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  textures.json  │────▶│  animations.json │────▶│   assets.json   │
│  (file paths)   │     │ (frame configs)  │     │ (game objects)  │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │   scenes.json   │
                                                 │  (compositions) │
                                                 └────────┬────────┘
                                                          │
                        ┌─────────────────┐               │
                        │ localization/   │───────────────┤
                        │   (strings)     │               │
                        └─────────────────┘               ▼
                                                 ┌─────────────────┐
                                                 │  SceneBuilder   │
                                                 │    (runtime)    │
                                                 └─────────────────┘
```

---

## Localization Key Naming Convention

| Prefix | Category | Example |
|--------|----------|---------|
| `BTN_` | Buttons | `BTN_001` = "ÚTOK" / "ATTACK" |
| `LBL_` | Labels | `LBL_001` = "ŽIVOTY" / "HEALTH" |
| `TTL_` | Titles | `TTL_001` = "ARÉNA" / "ARENA" |
| `MSG_` | Messages | `MSG_001` = "VÍTĚZSTVÍ!" / "VICTORY!" |
| `BLD_` | Buildings | `BLD_001` = "ČARODĚJNICE" / "WITCH" |
| `WPN_` | Weapons | `WPN_001` = "Dřevěný meč" / "Wooden Sword" |
| `ARM_` | Armor | `ARM_001` = "Dřevěný štít" / "Wooden Shield" |
| `CUR_` | Currency | `CUR_001` = "měďák" / "copper" |
| `ENM_` | Enemies | `ENM_001` = "Sliz" / "Slime" |
| `NPC_` | NPCs | `NPC_001` = "Kovář" / "Blacksmith" |
| `STT_` | Stats | `STT_001` = "HP" / "HP" |
| `FMT_` | Formats | `FMT_001` = "{0}/{1}" |
