# Forest Journey - Implementation Plan

**Goal:** Implement full Verdant Forest journey as MVP endpoint
**Timeline:** By Monday Feb 9

---

## Architecture Overview

```
TownScene (Village)
    │
    ├── [Buy Supplies - 50 coins] ─► ForestGateScene (entry check)
    │
    └── ForestMapScene (journey hub)
            │
            ├── Stage 1: Forest Edge
            │   ├── Battle (Wolf)
            │   ├── Rest
            │   ├── Puzzle (Number Bridge)
            │   ├── Battle (Mushroom Giant)
            │   └── Rest
            │
            ├── Stage 2: Deep Woods
            │   ├── Battle (Thorn Sprite)
            │   ├── Chest
            │   ├── Rest
            │   ├── Puzzle (Balance Scale)
            │   ├── Battle (Wolf)
            │   ├── Rest
            │   ├── Battle (Wolf)
            │   └── Rest
            │
            ├── Stage 3: Ancient Grove
            │   ├── Puzzle (Path Choice)
            │   ├── Battle (Elder Treant)
            │   ├── Chest
            │   └── Rest (Full heal - Sacred Spring)
            │
            └── Stage 4: Guardian's Lair
                ├── Puzzle (Feeding - optional)
                └── Boss (Verdant Guardian - 3 phases)
                        │
                        └── Victory ─► Unlock Silverpond
```

---

## New Scenes Required

| Scene | Purpose | Complexity |
|-------|---------|------------|
| `ForestGateScene` | Entry check, buy supplies | Low |
| `ForestMapScene` | Journey progress hub | Medium |
| `ForestEncounterScene` | Generic encounter handler | Medium |
| `ForestPuzzleScene` | Puzzle mini-games | Medium |
| `ForestRestScene` | Campfire healing | Low |
| `ForestBossScene` | Multi-phase boss | High |
| `ForestVictoryScene` | Journey complete | Low |

**Alternative:** Reuse `BattleScene` with forest enemy data, create only forest-specific scenes.

---

## New Data Files

### 1. Enemy and encounter catalogs

All forest enemy base definitions use the shared `enemies.json` catalog:
`forest_wolf`, `giant_mushroom`, `ancient_treant`, and `verdant_guardian`.
Forest rosters and the guardian's phase-specific HP/attack/defense live in
`encounters.json` and are edited through the Scene Editor. There is no separate
regional enemy file.

### 2. `forest-journey.json`

```json
{
  "journey": {
    "id": "verdant_forest",
    "name": "Verdant Forest",
    "requirements": {
      "minLevel": 7,
      "arenaLevel": 2,
      "supplyCost": 50
    },
    "stages": [
      {
        "id": "forest_edge",
        "name": "Forest Edge",
        "encounters": [
          { "type": "battle", "encounterId": "forest-map-edge-wolf" },
          { "type": "rest", "healPercent": 40 },
          { "type": "puzzle", "puzzleId": "number_bridge" },
          { "type": "battle", "encounterId": "forest-map-edge-mushroom" },
          { "type": "rest", "healPercent": 30 }
        ]
      },
      {
        "id": "deep_woods",
        "name": "Deep Woods",
        "encounters": [
          { "type": "chest", "gold": 25 },
          { "type": "rest", "healPercent": 25 },
          { "type": "puzzle", "puzzleId": "balance_scale" },
          { "type": "battle", "encounterId": "forest-map-deep-wolf-1" },
          { "type": "rest", "healPercent": 20 },
          { "type": "battle", "encounterId": "forest-map-deep-wolf-2" },
          { "type": "rest", "healPercent": 40 }
        ]
      },
      {
        "id": "ancient_grove",
        "name": "Ancient Grove",
        "encounters": [
          { "type": "puzzle", "puzzleId": "path_choice" },
          { "type": "battle", "encounterId": "forest-map-grove-treant" },
          { "type": "chest", "gold": 40, "potionRefill": true },
          { "type": "rest", "healPercent": 100, "name": "Sacred Spring" }
        ]
      },
      {
        "id": "guardians_lair",
        "name": "Guardian's Lair",
        "encounters": [
          { "type": "puzzle", "puzzleId": "feeding_puzzle", "optional": true },
          { "type": "boss", "encounterId": "forest-map-guardian-boss" }
        ]
      }
    ],
    "rewards": {
      "unlock": "silverpond"
    }
  }
}
```

### 3. `forest-puzzles.json`

```json
{
  "puzzles": {
    "number_bridge": {
      "id": "number_bridge",
      "name": "Number Bridge",
      "type": "sequence",
      "difficulty": "easy",
      "timeLimit": 60,
      "failDamage": 3
    },
    "balance_scale": {
      "id": "balance_scale",
      "name": "Balance Scale",
      "type": "equation",
      "difficulty": "medium",
      "timeLimit": 45,
      "failDamage": 5,
      "successBonus": { "gold": 10 }
    },
    "path_choice": {
      "id": "path_choice",
      "name": "Path Choice",
      "type": "multiple_choice",
      "difficulty": "medium",
      "timeLimit": 30,
      "failDamage": 5,
      "failPenalty": { "extraBattle": "forest_wolf" }
    },
    "feeding_puzzle": {
      "id": "feeding_puzzle",
      "name": "Forest Spirit Offering",
      "type": "sum_to_target",
      "difficulty": "hard",
      "timeLimit": 90,
      "optional": true,
      "successBonus": { "bossAtkReduction": 1 }
    }
  }
}
```

---

## New System: JourneySystem

```typescript
// src/systems/JourneySystem.ts

interface JourneyState {
  journeyId: string;
  currentStage: number;
  currentEncounter: number;
  journeyHp: number;        // HP tracked through journey
  journeyMaxHp: number;
  completed: boolean;
  stageResults: StageResult[];
}

class JourneySystem {
  // Start new journey
  startJourney(journeyId: string): void;

  // Get current encounter
  getCurrentEncounter(): Encounter;

  // Advance to next encounter
  advanceEncounter(): void;

  // Apply damage/healing
  applyDamage(amount: number): void;
  applyHeal(percent: number): void;

  // Check if journey failed (HP <= 0)
  isJourneyFailed(): boolean;

  // Complete journey
  completeJourney(): JourneyRewards;
}
```

---

## Asset Requirements

### Backgrounds (1280x720)

| Asset | Scene | Priority |
|-------|-------|----------|
| `bg-forest-edge.png` | Stage 1 battles | High |
| `bg-deep-woods.png` | Stage 2 battles | High |
| `bg-ancient-grove.png` | Stage 3 battles | High |
| `bg-guardian-lair.png` | Boss battle | High |
| `bg-forest-map.png` | Journey map | Medium |
| `bg-campfire.png` | Rest scenes | Medium |

### Enemy Sprites

| Asset | Enemy | Priority |
|-------|-------|----------|
| `enemy-wolf.png` | Forest Wolf | High |
| `enemy-mushroom.png` | Mushroom Giant | High |
| `enemy-sprite.png` | Thorn Sprite | High |
| `enemy-treant.png` | Elder Treant | High |
| `boss-guardian.png` | Verdant Guardian | High |

### UI Elements

| Asset | Purpose | Priority |
|-------|---------|----------|
| `journey-map-node.png` | Stage markers | Medium |
| `journey-path.png` | Stage connections | Medium |
| `puzzle-frame.png` | Puzzle UI container | Medium |

---

## Implementation Phases

### Phase 1: Foundation (Day 1-2)
- [ ] Create data files (enemies, journey, puzzles)
- [ ] Create JourneySystem
- [ ] Create ForestGateScene (entry + supplies check)
- [ ] Add debug entry in TownScene

### Phase 2: Core Loop (Day 2-3)
- [ ] Create ForestMapScene (journey progress UI)
- [ ] Integrate BattleScene with forest enemies
- [ ] Create ForestRestScene
- [ ] Test Stage 1 flow

### Phase 3: Puzzles (Day 3-4)
- [ ] Create ForestPuzzleScene base
- [ ] Implement Number Bridge puzzle
- [ ] Implement Balance Scale puzzle
- [ ] Implement Path Choice puzzle
- [ ] Implement Feeding Puzzle

### Phase 4: Boss & Victory (Day 4-5)
- [ ] Extend BattleScene for multi-phase boss
- [ ] Create ForestVictoryScene
- [ ] Add rewards (XP, gold, diamonds, unlock)
- [ ] Test full journey flow

### Phase 5: Polish (Day 5-6)
- [ ] Add backgrounds when ready
- [ ] Add enemy sprites when ready
- [ ] Tune difficulty/balance
- [ ] Bug fixes

---

## Debug Entry Point

Add to `TownScene.ts` after line 112:

```typescript
// Debug: Forest Journey entrance
this.input.keyboard!.on('keydown-F', () => {
    // Start forest journey directly (skip requirements)
    this.scene.start('ForestGateScene', { debugMode: true });
});
```

---

## Questions for Marty

1. **Backgrounds:** Do you have forest backgrounds ready, or should I use placeholders?
2. **Enemy sprites:** Same question - ready or placeholders?
3. **Reuse BattleScene?** Should forest battles use existing BattleScene with forest enemy data, or create separate ForestBattleScene?
4. **Journey state persistence:** Save journey progress if player leaves mid-journey, or always restart?

---

## Files to Create

```
src/
├── scenes/
│   ├── ForestGateScene.ts      # Entry, buy supplies
│   ├── ForestMapScene.ts       # Journey hub
│   ├── ForestRestScene.ts      # Campfire healing
│   ├── ForestPuzzleScene.ts    # Puzzle mini-games
│   └── ForestVictoryScene.ts   # Journey complete
├── systems/
│   └── JourneySystem.ts        # Journey state management
public/assets/data/
├── enemies.json            # Shared base enemy definitions
├── encounters.json         # Forest rosters and boss phases
├── forest-journey.json
└── forest-puzzles.json
```
