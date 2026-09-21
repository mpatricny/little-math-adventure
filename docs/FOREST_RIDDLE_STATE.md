# ForestRiddleScene State Management

This document describes the complex state management in `ForestRiddleScene.ts`, particularly around puzzle completion, battle transitions, and SceneBuilder interactions.

## Scene Overview

ForestRiddleScene serves both `forest_riddle` and `ancient_bridge`. Every generated puzzle has seven sequence positions: five numbered fixed stones at indices 0, 2, 3, 4, 6 and two gaps at indices 1 and 5. Both gaps must be filled before validation/unlocking. After solving, a mushroom enemy appears if the room defines one.

`bridgePuzzle()` generates complete counting rows or repeating pairs/triples. Counting rows may reach 10 even for a player whose arithmetic is only up to 5 (explicit user-approved exception for this puzzle). Repeating cycles use familiar numbers; every cycle value must remain visible on at least one fixed stone. Never shorten the row, erase stone labels, or remove a gap to meet a numeric or diversity constraint. Ask the user before changing gameplay requirements when such constraints conflict.

Payload revision `layoutVersion: 2` invalidates the old shortened, single-gap instances together with their interaction state. World completion remains in JourneySystem and is not cleared. New instances preserve their payload and `state.placed` across scene transitions; this is not a persistent checkpoint of the entire forest journey after an application reload.

## State Flags

| Flag | Purpose | Initial Value |
|------|---------|---------------|
| `puzzleSolved` | Puzzle completed (correct values placed) | `false` |
| `bridgeUnlocked` | Player can cross bridge | `false` |
| `mushroomDefeated` | Enemy battle won | `false` |
| `hasCrossedBridge` | Player moved past bridge (no backtrack) | `false` |
| `battleWon` | Returning from a won battle | From scene data |
| `defeatedObjectId` | Which enemy was defeated | From scene data |

## Scene Lifecycle

### Phase 1: init()

The `init()` method runs FIRST and sets up state flags:

```
init() execution order:
1. Reset all flags to defaults (puzzleSolved = false, etc.)
2. Check journeySystem for persisted puzzle state
3. Check journeySystem for persisted mushroom defeat state
4. Handle battle return → infer puzzle state from context
```

**Critical**: If returning from mushroom battle, the puzzle MUST have been solved (mushroom only appears after puzzle completion). This is inferred, not stored:

```typescript
if (this.battleWon && this.defeatedObjectId === 'mushroom_1') {
    this.puzzleSolved = true;  // Inferred from battle context
    this.bridgeUnlocked = true;
}
```

### Phase 2: create()

The `create()` method builds the visual scene:

```
create() execution order:
1. SceneBuilder.buildScene() → Creates ALL elements from scenes.json
   └── This INCLUDES floating rock containers with default "2" text!
2. setupSteppingStones() → Creates/updates drop zones
3. Conditional: setupFloatingRocks() OR destroy rock containers
4. Create player, UI, etc.
```

## The SceneBuilder Problem

**Root cause of "floating rocks reappearing" bug:**

SceneBuilder reads `scenes.json` and creates ALL elements unconditionally. The floating rocks are defined in scenes.json, so they're created by SceneBuilder BEFORE any game logic runs.

```
scenes.json → SceneBuilder.buildScene() → Creates rock containers (with default "2" text)
                                        ↓
                             Game logic runs AFTER this
```

### Wrong Approach (causes bugs)

```typescript
// This doesn't work! Rocks already exist from SceneBuilder
if (!this.puzzleSolved) {
    this.setupFloatingRocks();  // Just updates values
}
// When puzzleSolved=true, rocks still exist with "2" text
```

### Correct Approach

```typescript
if (!this.puzzleSolved) {
    this.setupFloatingRocks();
    this.setupDragEvents();
} else {
    // Place correct answer rocks in drop zones, destroy distractors
    this.placeCorrectRocksInSolvedState();
}
```

The `placeCorrectRocksInSolvedState()` method:
1. Matches generated answer values to separate unused gaps, consuming one physical rock per gap.
2. Positions both rocks at the scene-editor gap hosts and sets each slot's `currentValue`.
3. Scales them uniformly to 0.7 and displays their generated numbers.
4. Destroys all unused rocks.

Duplicate answers are valid. For `1, ?, 1, 2, 1, ?, 1`, two distinct rocks displaying `2` must occupy two distinct gaps. Never use `indexOf(value)` alone to match them. Partial restoration similarly selects an unused rock (`placedInSlot === null`) for each saved value. A rejected attempt clears saved placements immediately; completing the puzzle settles both placed rocks at their gap coordinates before stopping their snap animations.

## Battle Transition Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    ForestRiddleScene                         │
│                                                              │
│  1. Player solves puzzle                                     │
│     └── onPuzzleSolved() saves state to journeySystem        │
│     └── puzzleSolved = true, bridgeUnlocked = true           │
│     └── Mushroom enemy appears                               │
│                                                              │
│  2. Player clicks mushroom                                   │
│     └── startMushroomBattle() called                         │
│     └── scene.start('BattleScene', {                         │
│           returnScene: 'ForestRiddleScene',                  │
│           returnData: { defeatedObjectId: 'mushroom_1' }     │
│         })                                                   │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                      BattleScene                             │
│                                                              │
│  Battle plays out...                                         │
│                                                              │
│  On victory:                                                 │
│     └── scene.start(returnScene, {                           │
│           battleWon: true,                                   │
│           ...returnData  // { defeatedObjectId: 'mushroom_1'}│
│         })                                                   │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│              ForestRiddleScene (re-created)                  │
│                                                              │
│  init() receives:                                            │
│     battleWon: true                                          │
│     defeatedObjectId: 'mushroom_1'                           │
│                                                              │
│  State inference:                                            │
│     "Mushroom battle won" → "Puzzle must be solved"          │
│     └── puzzleSolved = true                                  │
│     └── mushroomDefeated = true                              │
│                                                              │
│  create() then runs with correct state                       │
│     └── placeCorrectRocksInSolvedState() called              │
│         └── Rocks 4 & 12 positioned in drop zones            │
│         └── Distractor rocks (3, 7, 5) destroyed             │
│     └── Mushroom not created (already defeated)              │
└─────────────────────────────────────────────────────────────┘
```

## Element Layers

| Layer | Source | When Puzzle Unsolved | When Puzzle Solved |
|-------|--------|---------------------|-------------------|
| Fixed stones (2,6,8,10,14) | Template text areas | Show numbers | Show numbers |
| Drop zones | Programmatic | Show "?" with glow | Empty (rocks placed on top) |
| Correct answer rocks (4,12) | scenes.json + SceneBuilder | Draggable, floating | **Repositioned** to drop zones, scaled 0.7 |
| Distractor rocks (3,7,5) | scenes.json + SceneBuilder | Draggable, floating | **Destroyed** |
| Mushroom | Programmatic | Not visible | Visible (if not defeated) |

## Historical Rock Configuration (illustration only)

The floating-rock hosts remain in `scenes.json`. The following values describe the former hardcoded example, not the current runtime contract:

| Index | Element ID | Value | Type | Drop Zone |
|-------|------------|-------|------|-----------|
| 0 | `rock with number` | 4 | Correct answer | Drop zone 0 (between 2 and 6) |
| 1 | `rock with number_1` | 12 | Correct answer | Drop zone 1 (between 10 and 14) |
| 2 | `rock with number_2` | 3 | Distractor | N/A |
| 3 | `rock with number_3` | 7 | Distractor | N/A |
| 4 | `rock with number_4` | 5 | Distractor | N/A |

```typescript
// In ForestRiddleScene.ts
private floatingRockIds = [
    'rock with number',     // Value: 4 (correct)
    'rock with number_1',   // Value: 12 (correct)
    'rock with number_2',   // Value: 3 (distractor)
    'rock with number_3',   // Value: 7 (distractor)
    'rock with number_4',   // Value: 5 (distractor)
];
private floatingRockValues = [4, 12, 3, 7, 5];
```

**Current contract**: `bridgePuzzle().floatingRockValues` contains a shuffled multiset of two answer rocks and three distractors. No index has a permanently assigned answer role. Completion and restoration must consume separate rocks even when the values are equal.

## JourneySystem Persistence

State is persisted via JourneySystem for cross-scene consistency:

```typescript
// Save puzzle completion
this.journeySystem.setObjectState(this.roomId, 'bridge_riddle', {
    interacted: true,
    completed: true
});

// Save mushroom defeat
this.journeySystem.setObjectState(this.roomId, 'mushroom_1', {
    interacted: true,
    defeated: true
});
```

**Note**: JourneySystem persistence may not survive battle transitions reliably. Always infer state from battle context as a fallback.

## Common Bugs & Solutions

### Bug: Floating rocks reappear after battle
**Cause**: SceneBuilder creates rocks before game logic checks `puzzleSolved`
**Fix**: Use `placeCorrectRocksInSolvedState()` to reposition correct answer rocks and destroy distractors

### Bug: All floating rocks show "2"
**Cause**: `setupFloatingRocks()` updates text, but if skipped, template default remains
**Fix**: `placeCorrectRocksInSolvedState()` calls `updateRockText()` for correct answer rocks

### Bug: Correct answer rocks missing when puzzle solved
**Cause**: Destroying ALL rocks instead of just distractors
**Fix**: Only destroy rocks 2, 3, 4 (distractors). Keep rocks 0, 1 (correct answers) and reposition them

### Bug: Placed stones shake when walking
**Cause**: `hintAtPuzzle()` animates ALL rocks including placed ones
**Fix**: Check `rock.placedInSlot !== null` and skip placed rocks

### Bug: Puzzle state not restored after battle
**Cause**: JourneySystem state not found/persisted
**Fix**: Infer state from battle context (mushroom battle = puzzle solved)

## Testing Checklist

> **POVINNÁ PŘEJÍMKA UI OD 20. 9. 2026: DĚTI NEUMĚJÍ ČÍST. Žádný dlouhý text
> nikde v herním UI; vysvětlení musí být obrázkové a názorné. Všechny kontroly
> zahrnují [UI pro nečtenáře](UI_PRE_READER_GATES.md), včetně nejméně 2× větších `<`, `>` a `=`.
> Starší výsledky testů nejsou dokladem splnění této nové podmínky.**

1. [ ] Solve puzzle → mushroom appears
2. [ ] Defeat mushroom → scene restores correctly (no floating rocks)
3. [ ] Place one stone, walk → placed stone doesn't shake
4. [ ] Complete puzzle → correct values (4, 12) shown permanently
5. [ ] Cross bridge, try to go back → blocked
6. [ ] Re-enter scene after completion → shows solved state
