# Verdant Forest - Journey Design

**Status:** Simulation-verified, ready for implementation

## Entry Requirements

| Requirement | Value | Rationale |
|-------------|-------|-----------|
| Player Level | 7+ | After Arena 2 completion |
| Arena 2 Complete | Yes | Unlocks forest gate |
| Journey Supplies | 1 | Consumed on entry (50 coins) |

## Completion Rates (Simulated)

| Level | Low (55%) | Medium (75%) | High (95%) |
|-------|-----------|--------------|------------|
| 7 | 14% | 98% | 100% |
| 8 | 20% | 100% | 100% |
| 9 | 29% | 100% | 100% |
| 10 | 50% | 100% | 100% |

*Low-skill players are encouraged to level up more before attempting, but can try early for a challenge.*

## Expected Player Stats at Entry

Based on simulation data (after Arena 2):

| Stat | Minimum | Typical | Maximum |
|------|---------|---------|---------|
| Level | 7 | 8 | 10 |
| HP | 17 | 18 | 20 |
| ATK | 8 | 9 | 11 |
| Coins | 80+ | 120 | 200 |

### Recommended Gear

| Slot | Item | Cost | Stats |
|------|------|------|-------|
| Weapon | Iron Sword | 80 | +5 ATK, 1x mult, subtraction ≤5 |
| Shield | Iron Shield | 100 | 6s block, 2 attempts |
| Pet | Bodlina | 3 diamonds | 2x mult, subtraction ≤5 |
| Potion | Subscription | 5 (one-time) | 25 HP heal |

### Expected Damage Output

With Iron Sword + Bodlina (both 2x multiplier when correct):

| Accuracy | Problems/Turn | Expected Damage |
|----------|---------------|-----------------|
| High (95%) | 4 base + 2 bonus | ~5.5 per turn |
| Medium (75%) | 4 base + 2 bonus | ~4.2 per turn |
| Low (55%) | 4 base + 2 bonus | ~3.1 per turn |

---

## Forest Enemies (Simulation-Verified)

### 1. Forest Wolf
*Fast pack hunter*

| Stat | Value | Notes |
|------|-------|-------|
| HP | 10 | ~3 turns to defeat |
| ATK | 3 | Manageable with shield |
| XP | 25 | Slightly more than arena |
| Gold | 8-18 | Better than slime |
| Difficulty | 5 | Level 7+ |

**Win rates:** Low 100%, Medium 100%, High 100%

### 2. Mushroom Giant
*Slow but durable tank*

| Stat | Value | Notes |
|------|-------|-------|
| HP | 12 | ~4 turns to defeat |
| ATK | 2 | Low damage, tankier |
| XP | 35 | Rewarding |
| Gold | 15-25 | Good reward |
| Difficulty | 5 | Patient fight |

**Win rates:** Low 100%, Medium 100%, High 100%

### 3. Thorn Sprite
*Magical glass cannon*

| Stat | Value | Notes |
|------|-------|-------|
| HP | 8 | Quick to defeat |
| ATK | 4 | High damage! |
| XP | 30 | Good XP |
| Gold | 12-22 | Medium reward |
| Difficulty | 6 | Dangerous |

**Win rates:** Low 100%, Medium 100%, High 100%
*High ATK but low HP - kill fast or take heavy damage*

### 4. Elder Treant
*Ancient mini-boss*

| Stat | Value | Notes |
|------|-------|-------|
| HP | 15 | ~5 turns to defeat |
| ATK | 2 | Moderate damage |
| XP | 50 | High XP |
| Gold | 25-40 | Great reward |
| Difficulty | 7 | Tough but fair |

**Win rates:** Low 95%, Medium 100%, High 100%

---

## Forest Boss: Verdant Guardian (Simulation-Verified)

*Ancient protector of the forest - 3 phase battle with healing between phases*

**Total HP:** 32 (10 + 10 + 12)
**Win rates:** Low 98%, Medium 100%, High 100%

### Phase 1: "Awakening"

| Stat | Value |
|------|-------|
| HP | 10 |
| ATK | 2 |

- Introduction phase, standard battle
- Flavor text: *"The ancient tree stirs..."*
- After defeat: Player heals 8 HP

### Phase 2: "Fury"

| Stat | Value |
|------|-------|
| HP | 10 |
| ATK | 3 |

- Harder hits, faster pace
- Flavor text: *"The forest fights back!"*
- After defeat: Player heals 8 HP

### Phase 3: "Final Stand"

| Stat | Value |
|------|-------|
| HP | 12 |
| ATK | 3 |

- Final phase, no healing after
- Flavor text: *"The Guardian's light fades..."*
- Victory: Full rewards

### Boss Rewards

| Reward | Amount |
|--------|--------|
| XP | 150 |
| Gold | 80-120 |
| Diamonds | 5 |
| Unlock | Access to Silverpond |

---

## Journey Structure (Final - Simulation-Verified)

### Stage 1: Forest Edge
*Introduction to forest dangers*

| # | Encounter | Details |
|---|-----------|---------|
| 1 | Battle | Forest Wolf (10 HP, 3 ATK) |
| 2 | Rest | Heal 40% HP |
| 3 | Puzzle | Number Bridge (easy) |
| 4 | Battle | Mushroom Giant (12 HP, 2 ATK) |
| 5 | Rest | Heal 30% HP |

### Stage 2: Deep Woods
*Harder enemies, better rewards*

| # | Encounter | Details |
|---|-----------|---------|
| 1 | Battle | Thorn Sprite (8 HP, 4 ATK) |
| 2 | Chest | 25 gold |
| 3 | Rest | Heal 25% HP (campsite) |
| 4 | Puzzle | Balance Scale (medium) |
| 5 | Battle | Forest Wolf |
| 6 | Rest | Heal 20% HP |
| 7 | Battle | Forest Wolf |
| 8 | Rest | Heal 40% HP |

*Note: Potion auto-used if HP < 50% after Thorn Sprite*

### Stage 3: Ancient Grove
*Mini-boss and preparation*

| # | Encounter | Details |
|---|-----------|---------|
| 1 | Puzzle | Path Choice (medium) |
| 2 | Battle | Elder Treant (15 HP, 2 ATK) |
| 3 | Chest | 40 gold + Potion refill |
| 4 | Rest | **Full heal** (sacred spring) |

### Stage 4: Guardian's Lair
*Final boss*

| # | Encounter | Details |
|---|-----------|---------|
| 1 | Puzzle | Feeding Puzzle (optional bonus) |
| 2 | Boss | Verdant Guardian Phase 1 |
| 3 | Heal | 8 HP between phases |
| 4 | Boss | Verdant Guardian Phase 2 |
| 5 | Heal | 8 HP between phases |
| 6 | Boss | Verdant Guardian Phase 3 |

**Total Journey Rewards:**
- XP: ~490 (all enemies + boss)
- Gold: ~275 (enemies + chests + boss)
- Diamonds: 5 (boss reward)
- Unlock: Silverpond region

---

## Puzzles

### 1. Number Bridge (Forest Edge)
*Cross the river by completing the sequence*

```
Difficulty: Easy
Time Limit: 60 seconds

    ~~~~~ RIVER ~~~~~

    [2] [?] [6] [8] [?] [12]
     🪨  ⬜  🪨  🪨  ⬜  🪨

    Available: [4] [10] [5] [9]
```

**Solution:** 4, 10 (pattern: +2)
**Reward:** Proceed to next encounter
**Fail:** Take 3 damage, retry

### 2. Balance Scale (Deep Woods)
*Balance the magical scale to open the path*

```
Difficulty: Medium
Time Limit: 45 seconds

           ⚖️
          /  \
    [7 + ?]  [5 + 8]

    Choose: [5] [6] [7] [8]
```

**Solution:** 6 (7 + 6 = 13 = 5 + 8)
**Reward:** Proceed + 10 bonus gold
**Fail:** Take 5 damage, retry with different puzzle

### 3. Path Choice (Ancient Grove)
*Choose the correct path*

```
Difficulty: Medium
Time Limit: 30 seconds

         🌲🌲🌲
        /   |   \
    [4+5=8] [3×3=9] [12-4=7]
      A       B       C

    "Which path shows the CORRECT equation?"
```

**Solution:** B (3×3=9)
**Reward:** Shortcut (skip one battle)
**Fail:** Take 5 damage, must fight extra Forest Wolf

### 4. Feeding Puzzle (Guardian's Lair)
*Feed the forest spirit to gain entry*

```
Difficulty: Hard
Time Limit: 90 seconds

    🌳 "I hunger for exactly 20!"

    Hunger: [████████░░░░] 12/20

    Available food:
    🍎5  🍊3  🍋7  🍇4  🍓6

    Fed so far: 🍎🍋 = 12
    Need: 8 more (exactly!)
```

**Solution:** Feed 🍊+🍓 (3+5... wait, need to match)
Let me recalculate: Already at 12, need exactly 8 more.
- 🍊3 + 🍓6 = 9 ❌
- 🍇4 + 🍇4 = can't use twice
- 🍊3 + 🍋7 = 10 ❌ (already used 🍋)

Better puzzle setup:
```
    🌳 "I hunger for exactly 15!"

    Available food (use each once):
    🍎2  🍊4  🍋6  🍇3  🍓5

    Multiple solutions: 2+4+6+3=15, or 4+6+5=15, etc.
```

**Reward:** Guardian awakens peacefully (Phase 1 ATK reduced by 1)
**Fail:** Guardian attacks immediately (no Phase 1 reduction)

---

## Data Files to Create

```
public/assets/data/
├── forest-enemies.json     # New enemy definitions
├── forest-journey.json     # Stage/encounter structure
└── forest-puzzles.json     # Puzzle configurations
```

## Implementation Priority

1. **Forest enemies** (data + sprites)
2. **Journey map UI** (stage selection)
3. **Puzzle scenes** (4 types)
4. **Boss battle** (multi-phase)
5. **Rewards + Silverpond unlock**
