# ForestRiddleScene State Management

This document describes the complex state management in `ForestRiddleScene.ts`, particularly around puzzle completion, battle transitions, and SceneBuilder interactions.

## Scene Overview

ForestRiddleScene is a puzzle room where the player must fill in missing numbers (4 and 12) in a sequence (2, ?, 6, 8, 10, ?, 14). After solving, a mushroom enemy appears that must be defeated before proceeding.

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
1. Keeps rocks 0 and 1 (values 4 and 12 - the correct answers)
2. Positions them at the drop zone locations
3. Scales them down (0.7) like when placed during gameplay
4. Updates their text to show correct values
5. Destroys rocks 2, 3, 4 (distractors with values 3, 7, 5)

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

## Rock Configuration

The floating rocks are defined in `scenes.json` and mapped to values in `ForestRiddleScene.ts`:

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

**Key insight**: Rocks at indices 0-1 are correct answers, indices 2-4 are distractors. This ordering is used by `placeCorrectRocksInSolvedState()` to know which rocks to keep vs destroy.

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

1. [ ] Solve puzzle → mushroom appears
2. [ ] Defeat mushroom → scene restores correctly (no floating rocks)
3. [ ] Place one stone, walk → placed stone doesn't shake
4. [ ] Complete puzzle → correct values (4, 12) shown permanently
5. [ ] Cross bridge, try to go back → blocked
6. [ ] Re-enter scene after completion → shows solved state
