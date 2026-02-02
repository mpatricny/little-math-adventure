# Forest Journey - Asset Requirements

> Appendix to Game Design Document v1.3  
> Last updated: 2026-02-02

This document lists all visual assets required for the Verdant Forest journey, including specifications, file names, and current status.

---

## Table of Contents

1. [Asset Overview](#asset-overview)
2. [Backgrounds](#backgrounds)
3. [Enemy Sprites](#enemy-sprites)
4. [Puzzle Assets](#puzzle-assets)
5. [UI Elements](#ui-elements)
6. [Scene-by-Scene Breakdown](#scene-by-scene-breakdown)
7. [Technical Specifications](#technical-specifications)

---

## Asset Overview

### Summary Table

| Category | Total Needed | Exists | Missing |
|----------|-------------|--------|---------|
| Backgrounds | 4 | 2 | 2 |
| Enemy Sprites | 5 | 2 | 3 |
| Puzzle Backgrounds | 4 | 0 | 4 |
| Puzzle Elements | 12 | 0 | 12 |
| UI Elements | 6 | 0 | 6 |
| **TOTAL** | **31** | **4** | **27** |

---

## Backgrounds

All backgrounds: **1280×720 px**, PNG format

### Battle Backgrounds

| Asset ID | File Name | Description | Status |
|----------|-----------|-------------|--------|
| `bg-forest-edge` | `bg-forest-edge.png` | Stage 1: Bright, open sky, forest entrance | ✅ EXISTS |
| `bg-deep-woods` | `bg-deep-woods.png` | Stage 2: Dark, dense forest | ✅ EXISTS |
| `bg-ancient-grove` | `bg-ancient-grove.png` | Stage 3: Mystical ancient trees, magical atmosphere | ❌ NEEDED |
| `bg-guardian-lair` | `bg-guardian-lair.png` | Stage 4: Boss arena, dramatic lighting, stone ruins | ❌ NEEDED |

### Puzzle Backgrounds (Optional - currently using forest backgrounds)

| Asset ID | File Name | Description | Status |
|----------|-----------|-------------|--------|
| `bg-puzzle-bridge` | `bg-puzzle-bridge.png` | River crossing with stepping stones | ❌ OPTIONAL |
| `bg-puzzle-scale` | `bg-puzzle-scale.png` | Mystical clearing with stone scale | ❌ OPTIONAL |
| `bg-puzzle-paths` | `bg-puzzle-paths.png` | Forest fork with 3 diverging paths | ❌ OPTIONAL |
| `bg-puzzle-obelisk` | `bg-puzzle-obelisk.png` | Stone obelisk in clearing for crystal offering | ❌ OPTIONAL |

---

## Enemy Sprites

All enemy sprites: **200×200 px** per frame, PNG with transparency  
Animation format: Horizontal spritesheet

### Regular Enemies

| Asset ID | File Name | Frames Needed | Description | Status |
|----------|-----------|---------------|-------------|--------|
| `forest-wolf` | `forest-wolf.png` | 4 (idle, attack, hurt, death) | Gray wolf with yellow eyes, menacing but cute | ✅ EXISTS (static) |
| `forest-sprite` | `forest-sprite.png` | 4 (idle, attack, hurt, death) | Green fairy with leaf wings | ✅ EXISTS (static) |
| `enemy-mushroom` | `enemy-mushroom.png` | 4 (idle, attack, hurt, death) | Large mushroom creature, friendly face but hostile | ❌ NEEDED |
| `enemy-treant` | `enemy-treant.png` | 4 (idle, attack, hurt, death) | Ancient tree creature, bark armor, glowing eyes | ❌ NEEDED |

### Boss Enemy

| Asset ID | File Name | Frames Needed | Description | Status |
|----------|-----------|---------------|-------------|--------|
| `boss-guardian` | `boss-guardian.png` | 6+ (idle, attack, hurt, phase-transition, death, special) | Large forest guardian, nature spirit, 3 visual phases | ❌ NEEDED |

#### Boss Phase Visuals

The Verdant Guardian has 3 phases. Consider visual variations:

| Phase | Name (CS) | Visual Suggestion |
|-------|-----------|-------------------|
| 1 | Probuzení (Awakening) | Calm, green glow, leaves floating |
| 2 | Zuřivost (Fury) | Red/orange tint, thorns visible, aggressive pose |
| 3 | Poslední vzdor (Final Stand) | Cracked bark, desperate, glowing core exposed |

---

## Puzzle Assets

### Number Bridge Puzzle

| Asset ID | File Name | Dimensions | Description | Status |
|----------|-----------|------------|-------------|--------|
| `puzzle-stone-filled` | `puzzle-stone-filled.png` | 100×80 px | Stone with number displayed | ❌ NEEDED |
| `puzzle-stone-empty` | `puzzle-stone-empty.png` | 100×80 px | Empty stone slot (shows ?) | ❌ NEEDED |
| `puzzle-answer-orb` | `puzzle-answer-orb.png` | 80×80 px | Floating answer option | ❌ NEEDED |

### Balance Scale Puzzle

| Asset ID | File Name | Dimensions | Description | Status |
|----------|-----------|------------|-------------|--------|
| `puzzle-scale-base` | `puzzle-scale-base.png` | 400×300 px | Full scale structure | ❌ NEEDED |
| `puzzle-scale-pan` | `puzzle-scale-pan.png` | 120×40 px | Scale pan (for animation) | ❌ NEEDED |
| `puzzle-weight` | `puzzle-weight.png` | 60×60 px | Weight/number block | ❌ NEEDED |

### Path Choice Puzzle

| Asset ID | File Name | Dimensions | Description | Status |
|----------|-----------|------------|-------------|--------|
| `puzzle-path-sign` | `puzzle-path-sign.png` | 200×150 px | Wooden sign with equation | ❌ NEEDED |
| `puzzle-path-left` | `puzzle-path-left.png` | 300×400 px | Left forest path | ❌ NEEDED |
| `puzzle-path-center` | `puzzle-path-center.png` | 300×400 px | Center forest path | ❌ NEEDED |
| `puzzle-path-right` | `puzzle-path-right.png` | 300×400 px | Right forest path | ❌ NEEDED |

### Crystal Offering Puzzle

| Asset ID | File Name | Dimensions | Description | Status |
|----------|-----------|------------|-------------|--------|
| `puzzle-obelisk` | `puzzle-obelisk.png` | 200×400 px | Stone obelisk with target number | ❌ NEEDED |
| `puzzle-crystal-red` | `puzzle-crystal-red.png` | 60×60 px | Red crystal gem | ❌ NEEDED |
| `puzzle-crystal-green` | `puzzle-crystal-green.png` | 60×60 px | Green crystal gem | ❌ NEEDED |
| `puzzle-crystal-blue` | `puzzle-crystal-blue.png` | 60×60 px | Blue crystal gem | ❌ NEEDED |
| `puzzle-crystal-purple` | `puzzle-crystal-purple.png` | 60×60 px | Purple crystal gem | ❌ NEEDED |
| `puzzle-crystal-diamond` | `puzzle-crystal-diamond.png` | 60×60 px | Diamond/white crystal | ❌ NEEDED |

---

## UI Elements

### Journey Map UI

| Asset ID | File Name | Dimensions | Description | Status |
|----------|-----------|------------|-------------|--------|
| `ui-stage-complete` | `ui-stage-complete.png` | 60×60 px | Green checkmark for completed stage | ❌ NEEDED |
| `ui-stage-current` | `ui-stage-current.png` | 60×60 px | Glowing marker for current stage | ❌ NEEDED |
| `ui-stage-locked` | `ui-stage-locked.png` | 60×60 px | Grayed/locked stage marker | ❌ NEEDED |
| `ui-encounter-battle` | `ui-encounter-battle.png` | 40×40 px | Sword icon for battle encounter | ❌ NEEDED |
| `ui-encounter-rest` | `ui-encounter-rest.png` | 40×40 px | Campfire icon for rest point | ❌ NEEDED |
| `ui-encounter-puzzle` | `ui-encounter-puzzle.png` | 40×40 px | Question mark/puzzle icon | ❌ NEEDED |
| `ui-encounter-chest` | `ui-encounter-chest.png` | 40×40 px | Treasure chest icon | ❌ NEEDED |
| `ui-encounter-boss` | `ui-encounter-boss.png` | 40×40 px | Skull/boss icon | ❌ NEEDED |

---

## Scene-by-Scene Breakdown

### 1. ForestGateScene (Entry Point)

**Purpose:** Requirements check before entering forest

| Asset | Used For | Priority |
|-------|----------|----------|
| `bg-forest-edge` | Background | HIGH |
| Player sprite | Character display | EXISTS |
| UI buttons | Start/Return | EXISTS (generic) |

### 2. ForestMapScene (Journey Hub)

**Purpose:** Shows journey progress, stage selection

| Asset | Used For | Priority |
|-------|----------|----------|
| `bg-deep-woods` | Background | MEDIUM |
| `ui-stage-*` | Stage markers | MEDIUM |
| `ui-encounter-*` | Encounter icons | LOW |
| HP bar | Journey health | EXISTS |

### 3. BattleScene (Forest Battles)

**Purpose:** Combat encounters with forest enemies

| Asset | Used For | Priority |
|-------|----------|----------|
| `bg-forest-edge` | Stage 1 battles | ✅ EXISTS |
| `bg-deep-woods` | Stage 2 battles | ✅ EXISTS |
| `bg-ancient-grove` | Stage 3 battles | HIGH |
| `bg-guardian-lair` | Boss battle | HIGH |
| `forest-wolf` | Enemy sprite | ✅ EXISTS |
| `forest-sprite` | Enemy sprite | ✅ EXISTS |
| `enemy-mushroom` | Enemy sprite | HIGH |
| `enemy-treant` | Enemy sprite | HIGH |
| `boss-guardian` | Boss sprite | HIGH |

### 4. ForestPuzzleScene - Number Bridge

**Purpose:** Complete number sequence to cross river

| Asset | Used For | Priority |
|-------|----------|----------|
| `bg-forest-edge` or `bg-puzzle-bridge` | Background | LOW (has fallback) |
| `puzzle-stone-filled` | Number stones | MEDIUM |
| `puzzle-stone-empty` | Empty slots | MEDIUM |
| `puzzle-answer-orb` | Answer options | MEDIUM |

### 5. ForestPuzzleScene - Balance Scale

**Purpose:** Find missing value to balance equation

| Asset | Used For | Priority |
|-------|----------|----------|
| `bg-deep-woods` or `bg-puzzle-scale` | Background | LOW |
| `puzzle-scale-base` | Scale visual | MEDIUM |
| `puzzle-scale-pan` | Animated pans | LOW |
| `puzzle-weight` | Number weights | MEDIUM |

### 6. ForestPuzzleScene - Path Choice

**Purpose:** Choose path with correct equation

| Asset | Used For | Priority |
|-------|----------|----------|
| `bg-ancient-grove` or `bg-puzzle-paths` | Background | MEDIUM |
| `puzzle-path-sign` | Equation signs | MEDIUM |
| `puzzle-path-*` | Path visuals | LOW |

### 7. ForestPuzzleScene - Crystal Offering

**Purpose:** Sum crystals to match target (optional pre-boss)

| Asset | Used For | Priority |
|-------|----------|----------|
| `bg-guardian-lair` or `bg-puzzle-obelisk` | Background | LOW |
| `puzzle-obelisk` | Target display | MEDIUM |
| `puzzle-crystal-*` | Selectable gems | HIGH (thematic) |

### 8. Boss Battle (Multi-Phase)

**Purpose:** Final encounter with Verdant Guardian

| Asset | Used For | Priority |
|-------|----------|----------|
| `bg-guardian-lair` | Battle background | HIGH |
| `boss-guardian` | Boss sprite (3 phases) | HIGH |
| Phase transition effects | Visual feedback | MEDIUM |

---

## Technical Specifications

### File Formats

| Type | Format | Color Mode |
|------|--------|------------|
| Backgrounds | PNG | RGB |
| Sprites | PNG | RGBA (transparent) |
| UI Elements | PNG | RGBA (transparent) |

### Dimensions

| Asset Type | Dimensions | Notes |
|------------|------------|-------|
| Backgrounds | 1280×720 px | 16:9 aspect ratio |
| Enemy sprites (per frame) | 200×200 px | Square for rotation |
| UI icons | 40-60 px | Consistent sizing |
| Puzzle elements | Varies | See individual specs |

### Animation Spritesheets

Enemy sprites use horizontal spritesheets:

```
[idle-1][idle-2][idle-3][idle-4][attack-1][attack-2]...
```

**Standard frames:**
- Idle: 4 frames
- Attack: 4-6 frames
- Hurt: 2 frames
- Death: 4 frames

**Boss additional:**
- Phase transition: 4-6 frames
- Special attack: 6-8 frames

### Naming Convention

```
{category}-{name}.png

Examples:
- bg-forest-edge.png
- enemy-mushroom.png
- puzzle-stone-filled.png
- ui-encounter-battle.png
- boss-guardian.png
```

---

## Priority Order for Asset Creation

### Phase 1 - Minimum Playable (HIGH)
1. `bg-ancient-grove.png` - Stage 3 background
2. `bg-guardian-lair.png` - Boss arena background
3. `enemy-mushroom.png` - Mushroom Giant sprite
4. `enemy-treant.png` - Elder Treant sprite
5. `boss-guardian.png` - Final boss sprite

### Phase 2 - Enhanced Visuals (MEDIUM)
6. `puzzle-stone-filled.png` / `puzzle-stone-empty.png`
7. `puzzle-scale-base.png`
8. `puzzle-crystal-*.png` (5 colors)
9. `ui-stage-*.png` (3 states)

### Phase 3 - Polish (LOW)
10. Dedicated puzzle backgrounds
11. `ui-encounter-*.png` icons
12. Animated enemy spritesheets (currently static)
13. Boss phase visual variations

---

## Notes for Artist

### Style Guide
- Match existing game art style (chibi, cute but slightly menacing enemies)
- Use the existing slime/pink/purple enemies as reference
- Forest theme: greens, browns, natural colors
- Magic elements: soft glows, particle effects

### Reference Images
The concept images for Number Bridge and Crystal Offering puzzles were provided and can be used as visual direction.

### Transparency
All sprites and UI elements need transparent backgrounds. Use Replicate's `gpt-image-1.5` model for AI generation with transparency support.

---

## Implementation Status

| Feature | Code Ready | Assets Ready | Notes |
|---------|------------|--------------|-------|
| Forest Gate | ✅ | ✅ | Working |
| Forest Map | ✅ | Partial | Needs UI icons |
| Regular Battles | ✅ | Partial | 2/4 enemies ready |
| Number Bridge | ✅ | ❌ | Uses primitives |
| Balance Scale | ✅ | ❌ | Uses primitives |
| Path Choice | ⚠️ BUGGY | ❌ | Needs debugging |
| Crystal Offering | ✅ | ❌ | Uses emojis |
| Boss Battle | ❌ TODO | ❌ | Multi-phase not implemented |

---

*Document generated for Little Math Adventure - Verdant Forest Journey*
