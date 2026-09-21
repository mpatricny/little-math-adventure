# Little Math Adventure - Development Rules

## BLOCKING UI RULE: CHILDREN CANNOT RELY ON READING

**The primary players are small children who cannot read, or can barely read.
NO LONG TEXT MAY APPEAR ANYWHERE IN PLAYER-FACING UI. This is a release-blocking
requirement, not a copywriting preference.** It applies to every region, lesson,
dialog, tooltip, hint, wrong-answer explanation, menu, shop, map and result state.

- Teach by pictures, objects, spatial relationships and short demonstrated actions.
  Optional spoken guidance may supplement a complete visual explanation; neither
  reading nor audio may be required to understand the task.
- Keep visible labels to 1–3 familiar words (at most 4 for a short title). No
  paragraphs, multiline instructions or sequences of short labels that form a
  paragraph. Do not hide long text behind a tooltip, smaller font or a mask.
- **Every design review, code review, visual test, playtest and release checklist
  must apply [docs/UI_PRE_READER_GATES.md](docs/UI_PRE_READER_GATES.md).** Test the
  task with prose hidden and audio muted; it must still explain the action and
  its result. Automated success never substitutes for this visual review.
- All comparison signs `<`, `>` and `=` must be **at least 2× their previous
  visible size in the same context**: prompts, answer controls, hints, feedback,
  exams, battle, co-op and learning map. Enlarge layout hosts with them; never
  shrink a symbol to retain an old crowded layout.
  The baseline is the original small in-game sign, not the preceding mockup.
  **Author correction: a filled relation between numerals must not dwarf them.**
  Aim for roughly the numerals' visible height; reserve the larger mouth for
  the illustrated teaching steps. Measure the drawn sign, not its empty slot.
- The crocodile teaching sequence is fixed: **one larger object → more objects
  → objects with their count numeral → numerals alone**. Open jaws face the
  larger side; equality needs a visible demonstration of sameness and `=`.
- **Reuse the shared MathBoard for this chapter.** Keep its canonical parchment,
  common answer flow and evaluation; enlarge/replace answer controls as needed.
  Before an answer, the relation host must be visibly **empty** (for example a
  dashed slot), never occupied by a neutral crocodile or a preselected relation.
  The introductory animation demonstrates a mouth entering that same slot,
  eating the larger offer, both orientations and equality, without long text.

These requirements supersede older text-heavy UI examples in design documents.
The approved crocodile redesign is integrated through MathBoard and
SequentialMathView. See docs/COMPARISON_IMPLEMENTATION.md for runtime behavior.

Comparison chapter follow-up: a sequential presentation may show one question
at a time while retaining the complete attack batch, its first-answer results
and one completion callback. A demo cannot earn damage or mastery. See
`docs/COMPARISON_BATTLE_INTEGRATION.md` before implementing this flow.
For answer-button hover/press, move the frame surface and its symbol together
inside one visual container; keep the root hit area stable and restore both
on pointer-out, disabling and reuse.
Transitional symbol support may show matching crocodile forms above all three
choices together, never identify the correct choice. Reserve the hint space;
cancel stale timers and record assistance only when it actually appears.
Confirmed delay schedule: 4 → 8 → 16 → 24 seconds → off. Two correct first
answers move one step up; every wrong first answer moves one step down. Keep
tuning in src/data/comparison-learning.json and progress per player in the save.

Author's visual refinement (21 September): unequal size-comparison apples must
have an unmistakable difference (2:1 linear size), while equal apples remain
identical. Count-comparison pieces keep the same size. Answer glyphs use 90% of
the initially integrated size so they fit comfortably inside their frames.
The first size lesson runs 30% more slowly. Keep a separate bonus area in the
shared board; its shield variant shows one known problem, incoming damage and
block power. The first-answer, quick-block and attack-charge rules still apply.

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
- **Defaults to the highest unlocked arena and its first incomplete wave**
- Completed-but-imperfect waves are offered as optional practice, never as a progression gate
- **Historical waveResults are preserved** (not reset)
- Only awards crystals for improvements over historical best

### Encounter Source of Truth

`public/assets/data/encounters.json` is the single source of truth for arena waves,
forest room and legacy map battles, enemy order, boss phases/mechanics, completion
links/bonuses, and multiplayer policy. Enemy base stats remain in
`public/assets/data/enemies.json`.

- Keep `sceneOrder` in first-appearance order: `ArenaScene`, `ForestRoomScene`, then `ForestMapScene`. The optional `UnderwaterRoomScene` group is appended fourth; schema v3 readers still accept documents without it.
- Every enemy reference uses `source: "core"` and must resolve to one stable ID in `enemies.json`; do not add a regional enemy catalog.
- Edit arena, forest room/map, and boss compositions in the Scene Editor's **Encounters** tab; it saves directly to `encounters.json`.
- Forest room/map data stores stable `encounterId` links. Save progress continues to use room/object or journey indices, so encounter edits do not invalidate saves.
- `ArenaScene`, forest scenes, and `BattleScene` must resolve every combat roster through `EncounterCatalog`.
- `ArenaSimulator` and `JourneySimulator` must resolve the same catalog through `ProductionEncounterAdapter`; do not add copied or fallback rosters/phases.
- Keep reusable multi-phase boss mechanics and phase HP/attack/defense in `bosses` inside `encounters.json`, not in enemy stat files or scene code.
- Tests must derive production roster/stat expectations from `encounters.json` and `enemies.json`. Never change production encounter data merely to satisfy an old golden composition or fixed HP total.
- After saving encounters, reload a running game or restart the simulation/test process so its in-memory JSON cache is refreshed.

### UI: Wave Progress Table

Located in ArenaScene, uses the `misc.arena-with-title` frame element. Shows:
- 5 rows (one per wave)
- Enemy sprite previews for each wave
- Completion indicator (✓ for completed, ○ for pending)
- Perfect indicator (★ for perfect, ☆ for non-perfect)
- Current wave highlighted, future waves dimmed

### Adding New Arenas

To add a new arena level:
1. Add the arena, its five waves, completion metadata, and multiplayer policy reference to `encounters.json` (prefer the Scene Editor).
2. Reference enemies by IDs defined in `enemies.json`.
3. The runtime preview, BattleScene, Wave Progress Table, rewards, and simulator resolve the change from the catalog automatically.

All arena levels share the same:
- Wave Progress Table UI positioning
- Crystal reward calculation logic
- Wrong answer tracking
- Historical progress preservation

## Shop Battle Preparation

The production `ShopScene` lets a player prepare exactly one equipped item for a
future battle. Preparation tuning lives in `src/data/preparation.json`; both runtime
logic and tests must import that file instead of copying charge or bonus constants.

- Sword preparation requires an equipped weapon. Each stored rune adds `+1` damage to one successful player attack.
- Shield preparation requires an equipped shield. Each stored rune automatically blocks `1` otherwise-unblocked damage.
- A rune is consumed only when its effect is useful. Missed attacks and already-fully-blocked hits do not spend one.
- Preparation persists across scenes and arena waves until consumed or replaced by completing the other preparation.
- Shop problems come from `MasterySystem.drawPreparationProblems()` and each displayed problem records one attempt, including first-answer correctness and response time. A wrong answer adds a fresh problem; it is never converted into a second successful solve.
- Co-op stores preparation independently on player A and player B. Battle indicators must follow the active player.
- Static shop and battle indicator hosts stay in `scenes.json`; positions and depths must be read through `SceneBuilder`.

## Battle Damage and Enemy Defense

- Enemy defense is subtracted once from the complete accumulated attack damage: `max(0, totalDamage - defense)`.
- The same rule applies to Player A, Player B, melee pets, and spell pets. Never subtract defense separately for each solved problem.
- A sword preparation charge is consumed only when its bonus increases the final post-defense damage.
- Keep the shared formula in `CombatDamageSystem`; do not duplicate defense arithmetic in scenes.

## ForestRiddleScene Architecture

The riddle bridge scene (`ForestRiddleScene.ts`) is a standalone puzzle room with player movement. It demonstrates several reusable patterns.

### Movement System

For detailed movement/walking implementation patterns, see **`docs/MOVEMENT_SYSTEM.md`**.

Quick reference:
- Tween only X, update Y via `onUpdate` callback using path function
- Use `getPathY(x)` to define terrain curves
- Filter interactive objects in click-to-move handlers

### Path-Based Movement

Player Y position is constrained by X position using `getPathY(x)`:

```typescript
private getPathY(x: number): number {
    if (x < bridgeStartX) return 620;           // Before bridge
    else if (x < bridgePeakX) return 620 - rise; // Ascending
    else if (x < bridgeEndX) return 580 + fall;  // Descending
    else return 630;                             // After bridge
}
```

This creates a 2.5D effect where the player walks "over" the bridge.

### Drag-and-Drop Puzzle Structure

**User-required puzzle contract:** Both illustrated bridges always show five numbered fixed stones and two missing stones (seven sequence positions, holes at indices 1 and 5). Both gaps must be filled before success. Never leave an illustrated stone blank or remove a gap to satisfy numeric limits or a pool-size target. For this puzzle, counting rows up to 10 are explicitly allowed even for players whose arithmetic is only up to 5; repeating pairs/triples of familiar numbers are also appropriate. Equal answers require two separate draggable stones and must restore into separate gaps.

If a future generation, difficulty, diversity, or layout constraint would undermine a puzzle's logical meaning or required interactions, ask the user before changing those gameplay requirements. Do not silently weaken the puzzle to satisfy a technical constraint.

The puzzle has three distinct layers:

| Layer | Source | Purpose |
|-------|--------|---------|
| **Fixed stones** | Template text areas | Display sequence numbers (2, 6, 8, 10, 14) |
| **Drop zones** | Created programmatically | Gaps between stones where rocks can be placed |
| **Floating rocks** | Scene editor elements | Draggable answer options |

**Important**: Drop zones are positioned BETWEEN the template text areas, not on them.

### One-Way Progression (No Backtracking)

Once the player crosses the bridge, they cannot go back:

1. `hasCrossedBridge` flag set when player X > 900 after solving
2. Click-to-move blocks movement left of bridge after crossing
3. Left exit check disabled after crossing
4. `init()` redirects to next room if `fromDirection === 'right'`
5. `forest-rooms.json` has no left exit from `deep_forest_1`

### Click-to-Move with Interactive Object Filtering

To prevent character movement when clicking draggable objects:

```typescript
// In setupClickToMove()
const hitObjects = this.input.hitTestPointer(pointer);
if (hitObjects.length > 0) return; // Don't move if clicking interactive object
```

### Drag State Management

When picking up a placed rock, clear its slot in `dragstart`:

```typescript
this.input.on('dragstart', (pointer, gameObject) => {
    this.tweens.killTweensOf(gameObject);

    // Clear slot if rock was placed
    const rock = this.floatingRocks[gameObject.getData('rockIndex')];
    if (rock.placedInSlot !== null) {
        const stone = this.steppingStones[rock.placedInSlot];
        stone.currentValue = null;
        rock.placedInSlot = null;
        // Restore "?" text...
    }
});
```

This prevents animation conflicts and state desync.

### State Management & Battle Return

**CRITICAL**: SceneBuilder creates ALL elements from scenes.json BEFORE any conditional logic runs. This includes floating rocks. See **`docs/FOREST_RIDDLE_STATE.md`** for full details.

Key points:
1. `init()` sets state flags BEFORE `create()` runs
2. `sceneBuilder.buildScene()` creates floating rock containers unconditionally
3. When puzzle is solved, reposition correct answer rocks and destroy distractors
4. When returning from battle, infer puzzle state from battle context (mushroom battle = puzzle was solved)

```typescript
// In create() - handle SceneBuilder-created rocks based on puzzle state
if (!this.puzzleSolved) {
    this.setupFloatingRocks();
    this.setupDragEvents();
} else {
    // Assign a separate matching rock to each gap, then destroy unused rocks.
    this.placeCorrectRocksInSolvedState();
}
```

The `placeCorrectRocksInSolvedState()` method matches generated answer values to two distinct rocks and two distinct gaps, including duplicate values; positions them at the editor hosts with scale 0.7; and destroys unused distractors. Never assume fixed answer values or fixed answer-option indices.

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

### UiElementBuilder Click Handler Bug

**Symptom**: Button visually responds to clicks (animation plays, hover effects work), but the click handler function is never called.

**Root Cause**: When you create a UI element using `UiElementBuilder.buildFromTemplate()`, the returned object is a `Phaser.GameObjects.Container` containing multiple child objects (layers, text areas). Attaching a `pointerdown` event directly to the container doesn't work because child layers inside the container receive the click events, not the container itself.

**Wrong (handler never fires)**:
```typescript
const button = builder.buildFromTemplate(templateId, x, y);
button.setInteractive({ useHandCursor: true });
button.on('pointerdown', () => doSomething());  // ❌ DOESN'T WORK!
```

**Correct (use sceneBuilder.bindClick)**:
```typescript
this.sceneBuilder.bindClick('Green_button_1', () => {
    this.doSomething();
});
```

**Why bindClick works**: `SceneBuilder.bindClick()` properly sets up click handling by finding all interactive layers within the container and attaching the click handler to each layer.

**Full documentation**: See `docs/UIELEMENT_CLICK_HANDLING.md` for complete patterns including dynamic handlers.

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

### SLIDE_ANIMATION.md

Location: `docs/SLIDE_ANIMATION.md`

Slide-out/slide-in animation pattern for carousel-style pagination:
- How Phaser tweens work (FROM current TO target)
- Two-phase animation: slide-out then slide-in
- **Critical**: Kill previous tweens before repositioning
- Direction logic (opposite side entry for carousel effect)
- Visual masking to hide content outside bounds

### FOREST_RIDDLE_STATE.md

Location: `docs/FOREST_RIDDLE_STATE.md`

ForestRiddleScene state management and battle transition handling:
- Scene lifecycle (init vs create order)
- **SceneBuilder problem**: Creates elements BEFORE game logic runs
- Battle return flow and state inference
- Why floating rocks must be DESTROYED when puzzle is solved
- Common bugs and solutions

## File Locations

- **Game source**: `/Users/datamole/little-math-adventure/src/`
- **Scenes**: `/Users/datamole/little-math-adventure/src/scenes/`
- **Data files**: `/Users/datamole/little-math-adventure/public/assets/data/`
- **Design docs**: `/Users/datamole/little-math-adventure/docs/`
- **Scene Editor**: `/Users/datamole/SimpleGame/scene-editor/`

## Visual Quality Rule

When creating or modifying any visual elements (buttons, panels, labels, overlays):

1. **No overlapping**: Buttons and UI elements must not overlap each other. Check positions and sizes.
2. **Consistent aesthetics**: New UI should match the existing game style (dark panels, colored borders, Georgia/Arial fonts, muted color palette).
3. **Test visually**: After any visual change, use the Playwright MCP browser tools to verify the result looks correct — take a screenshot or navigate to the scene and inspect.
4. **Button text**: If reusing a scene definition with different behavior, override button labels to match the new context (e.g., "HRÁT" → "ZVOLIT" in co-op setup).

### Visual acceptance gates (not replaced by functional tests)

- **BLOCKER: pre-reader gates in `docs/UI_PRE_READER_GATES.md` must pass in every
  UI state. No long text anywhere in player UI; explanations must work visually.
  Comparison signs `<`, `>` and `=` must all meet the 2× visible-size rule.**

- Preserve bitmap aspect ratios. Use uniform `setScale(min(width / sourceWidth, height / sourceHeight))` for complete artwork; only a deliberately authored and reviewed 9-slice may stretch its center. Never stretch a complete decorative frame to a new aspect ratio.
- Define a frame's **safe content inset**, not only its outer bounds. Titles, body copy, portraits, answer choices, feedback, and footer actions must fit inside that inset and occupy separate layout regions in `scenes.json`.
- Measure actual rendered text bounds, including localized/long text and feedback states. Do not squeeze text with non-uniform scaling or hide overflow behind a mask. Fix the layout/copy instead.
- Set high-resolution Phaser text through the **constructor style** (`resolution: 2`), not a late `.setResolution(2)`. In the installed Phaser version the late setter leaves `frame.source.resolution` stale for Canvas rendering; the glyphs can render twice as large while `getBounds()` still passes. Check that texture/source resolution equals style resolution and visually verify both Canvas fallback and WebGL.
- Review the actual screenshots at desktop and tablet sizes: normal, hover, pressed, pointer-out, disabled, selected/correct, wrong-answer, and completion states. Inspect proportions, borders, text, visual hierarchy, and regional art consistency. Merely capturing a screenshot is not a visual review.
- Automated bounds/aspect checks are necessary but cannot approve aesthetics. Record the reviewed images and any remaining visual limitations before declaring a UI ready.
- Underwater reference: `src/ui/UnderwaterTheme.ts`, `UnderwaterOverlay` safe-area host, `UnderwaterLayout.test.ts`, and `npm run test:e2e:underwater`. Reuse the blue enamel/pearl Silverpond art; do not introduce generic wooden action rails into this chapter.

## Production Creature Animation Workflow

Production idle, attack, hurt, and similar creature animations must use a real
image-to-video model as the motion source when following the video workflow.
The generated video is an intermediate source that is visually approved before
it is split into frames and normalized into a spritesheet.

1. Start from one canonical full-body creature image and generate motion with an
   actual video model. Do not create a fake "video" by repackaging an existing
   spritesheet, vertically or horizontally stretching a still, affine-warping a
   still, morphing frames, or cross-fading whole silhouettes.
2. Prompt for a locked camera, locked character scale, locked ground baseline,
   stable anatomy, generous transparent/chroma-key padding, and the complete
   creature visible for the entire clip.
3. No body part, equipment, crystal, particle, shadow, or effect may touch or
   cross the frame boundary. A clipped foot, limb, hat, crystal, or attack effect
   rejects the entire take; never repair it by independently cropping frames.
4. Reject takes with camera movement, zoom, framing drift, anatomy drift,
   duplicate limbs, texture/style changes, background motion, edge clipping,
   or silhouette ghosting before extracting any frames.
5. After approval, sample the video into frames and apply one shared crop,
   translation, scale, canvas size, origin, and baseline to the whole sequence.
   Never trim or normalize frames independently.
6. Inspect the first, last, motion-extreme, and effect-extreme frames plus the
   assembled loop before registering the spritesheet in game data.

This video-model workflow supersedes procedural stretching or spritesheet-to-video
experiments for production creature animation.

The validated Sorceress + AutoSprite V3 implementation profile, including Every 4
sampling, conservative alpha extraction, WebP export, and runtime animation aliases,
is documented in `docs/ASSET_CREATION.md` under "Validated Sorceress and AutoSprite
V3 Profile".

## Mandatory UI Creation Context

For every task that creates or changes visible UI, read `docs/ASSET_CREATION.md` before designing or prompting. The following rules are mandatory prompt context, not optional guidance:

1. Start from the existing game design language and reuse one canonical frame/source across related controls. Do not generate each button independently.
2. Build stateful UI from stable layers: reusable frame, aligned normal/active icon pair, runtime text, and code/template animation.
3. Generate paired icon states together in one image-model call. Require identical silhouette, pose, scale, cell size, and placement; only light, glow, or compact particles may change.
4. Keep generated text out of production assets. Labels, hit areas, layout, disabled state, and localization belong in code or UI templates.
5. Normalize assets deterministically: remove the flat background, use one shared crop/translation for every state pair, and export identical transparent canvases. Never trim normal and active states independently.
6. Keep hover geometry stable. Animate a small surface lift, shadow, highlight sweep, and icon cross-fade; do not swap complete button bitmaps, scale the root, or tint the whole control.
7. Keep all static UI represented in `scenes.json` and read position/depth from `SceneBuilder` hosts so the Scene Editor remains authoritative.
8. Verify the extracted assets themselves and then the composed normal, hover, pressed, pointer-out, disabled, and localized-text states in the running game.

Whenever an image model is used for a UI element, include these constraints explicitly in the image prompt and add the element-specific requirements after them. The production reference implementation is `src/ui/MedievalActionButton.ts`; scenes should position it through `SceneBuilder` hosts as demonstrated in `src/scenes/ShopPrepMockScene.ts`.

## Running the Project

```bash
# Game (port 8001)
cd /Users/datamole/little-math-adventure && npm run dev -- --port 8001

# Scene Editor (port 5174)
cd /Users/datamole/SimpleGame/scene-editor && npm run dev
```
