# Little Math Adventure - Game Design Document

**Version:** 1.4
**Status:** Full Game Design - Arena Wave System, Crystal & Pet Systems, Forest Journey Room-Based Exploration

---

## Table of Contents

1. [Game Overview](#1-game-overview)
2. [Story: The Starfall Scholar](#2-story-the-starfall-scholar)
3. [Characters](#3-characters)
4. [Core Mechanics](#4-core-mechanics)
5. [Mana System](#5-mana-system) *(NEW)*
6. [Crystal System](#6-crystal-system) *(EXPANDED)*
7. [Pet System](#7-pet-system) *(EXPANDED)*
8. [Buildings & Locations](#8-buildings--locations)
9. [Regions & Progression](#9-regions--progression)
10. [Visual Design](#10-visual-design)
11. [UI Specifications](#11-ui-specifications)
12. [Asset Requirements](#12-asset-requirements)
13. [Implementation Priority](#13-implementation-priority)

---

## 1. Game Overview

### Concept

**Little Math Adventure** is an educational math game for children (ages 5-10) where players solve arithmetic problems to battle creatures, collect crystals, and help a stranded alien return home.

### Core Loop

```
Battle → Earn Crystals/Coins → Upgrade Gear → Bind Pets → Explore New Regions
```

### Target Audience

- Pre-readers and early readers (ages 5-8 primary)
- Visual storytelling with minimal text
- Math difficulty scales with progression

### Key Features

- Math battles (addition, subtraction, multiplication)
- Pet companions that help in battle
- Crystal collecting and combining
- **Room-based exploration** - walk within scenes, click objects to interact, exit points to next area
- Journey/adventure mode with puzzles
- Treasure chests with letter-lock puzzles
- Waypoint system for fast travel
- Multi-phase boss battles
- Wordless comic storytelling

---

## 2. Story: The Starfall Scholar

### Premise

A brilliant alien mathematician named **Zyx** crash-landed in Mathoria when his ship's *Calculation Core* malfunctioned. The crash released **Numera Energy** - a strange mathematical force that transformed peaceful forest creatures into aggressive beasts driven by unsolved equations swirling in their minds.

### How Story Explains Mechanics

| Game Mechanic | Story Explanation |
|---------------|-------------------|
| Math battles | Solving equations calms the Numera Energy in creatures |
| Creatures become pets | Once freed from corruption, they're grateful and loyal |
| Leveling up | Player becomes more attuned to Numera Energy |
| Guild trials (Arena) | Zyx tests your mathematical strength |
| Regions unlock | Following scattered ship fragments |
| Boss battles | Creatures that absorbed massive Numera Energy |
| Crystals (diamonds) | Shards of Zyx's shattered Calculation Core |
| Crystal values | Each shard contains a specific amount of Numera Energy (a number) |
| Crystal Forge math | Combining crystals requires precise calculations - "mathematical magic" |
| Mana | Player's connection to Numera Energy, spent to power forge spells |
| Amulets | Crystals tuned to exact values that resonate with specific creatures |
| Final goal | Solve the Grand Equation to repair Zyx's ship |

### Story Beats

```
MATHORIA (Levels 1-10)
├── Intro: Wake up near crashed ship, meet Zyx
├── Learn: "Math calms the corrupted creatures!"
├── Goal: Find first ship fragment in Arena
└── Boss: Corrupted Slime King (absorbed fragment energy)

VERDANT FOREST (Levels 7-15)
├── Discovery: Fragment trail leads into forest
├── Mystery: Why are forest creatures MORE corrupted?
├── Reveal: Second fragment buried deep in Ancient Grove
└── Boss: Verdant Guardian (ancient tree protecting fragment)

SILVERPOND (Levels 15-25)
├── Journey: Following underwater energy signature
├── Challenge: Aquatic creatures, harder equations
└── Boss: Crystal Serpent (fragment fused into its body)

FINAL: THE GRAND EQUATION
├── All fragments collected
├── Zyx reveals the ship needs one final calculation
├── Player must solve a complex multi-step puzzle
└── Ending: Zyx departs, leaves gift (unlocks endless mode)
```

---

## 3. Characters

### Zyx - The Alien Mathematician

**Role:** Mentor, quest giver, runs the Arena/Guild

**Appearance:**
- Small floating geometric crystal creature
- Single large expressive eye
- Soft blue-purple glow
- Tiny professor glasses
- Translucent body with swirling equations inside

**Personality:**
- Quirky, speaks in math puns
- Genuinely kind but desperate to go home
- Gets excited when player solves problems

**Expressions needed:**
- Happy (eye crinkled, celebrating)
- Sad (eye drooping, tear)
- Worried (eye wide, sweat drop)
- Excited (eye sparkling)

### Pythia - The Crystal Witch

**Role:** Runs Witch Hut, binds pets, sells potions

**Appearance:**
- Tall, elegant elderly witch
- Purple robes with crystal embroidery
- Wild silver hair with crystals woven in
- Large round glasses, kind eyes
- Staff with crystal orb

**Backstory:**
- Found Zyx's crash site years ago
- Learned to harness Numera Energy through crystals
- Has been quietly protecting the region

**Personality:**
- Grandmotherly and wise
- Speaks in gentle encouragement
- Knows secrets about the crystals

**Expressions needed:**
- Welcoming (arms open)
- Crafting (focused on work)
- Proud (beaming at success)
- Thoughtful (considering)

### The Player

**Role:** The hero, a child with mathematical talent

**Appearance:**
- Customizable child character
- Simple, expressive design
- Wears adventurer outfit

---

## 4. Core Mechanics

### Math Battles

**Flow:**
1. Corrupted creature appears (swirling numbers around it)
2. Math problem displays
3. Player selects answer from 4 choices
4. Correct = deal damage, Wrong = take damage
5. Defeat creature = corruption fades, creature calms

**Problem Types by Region:**

| Region | Operations | Difficulty |
|--------|------------|------------|
| Mathoria | Addition (≤10) | 2+3, 5+4 |
| Forest | Addition/Subtraction (≤15) | 8+7, 12-5 |
| Silverpond | Multiplication (≤5×5) | 3×4, 5×5 |
| Mountains | Division (≤20÷5) | 15÷3, 20÷4 |
| Caves | Mixed operations | 6+4×2 |

### Problem Format Variability

To keep the game engaging, problems vary in **format** (not just difficulty):

| Format | Example | UI Layout | Introduced |
|--------|---------|-----------|------------|
| **Standard** | 5 + 3 = ? | 4 number buttons | Level 1 |
| **Missing Operand** | 5 + ? = 8 | 4 number buttons | Level 3 |
| **Comparison** | 5 + 3 ○ 7 | 3 buttons: < = > | Level 5 |
| **True/False** | 5 + 3 = 9 | 2 buttons: YES/NO | Level 4 |

**Format Selection by Level:**

```typescript
// Higher levels include more format variety
const FORMAT_WEIGHTS: Record<number, FormatWeight[]> = {
  1: [{ type: 'standard', weight: 1.0 }],
  2: [{ type: 'standard', weight: 0.9 }, { type: 'missing_operand', weight: 0.1 }],
  3: [{ type: 'standard', weight: 0.7 }, { type: 'missing_operand', weight: 0.3 }],
  4: [{ type: 'standard', weight: 0.5 }, { type: 'missing_operand', weight: 0.3 },
      { type: 'true_false', weight: 0.2 }],
  5: [{ type: 'standard', weight: 0.4 }, { type: 'missing_operand', weight: 0.25 },
      { type: 'true_false', weight: 0.2 }, { type: 'comparison', weight: 0.15 }],
};
```

**UI Layout Variants:**

*Missing Operand:*
```
┌─────────────────────────────────┐
│       5  +  ?  =  8            │
│           ▲ (pulsing slot)     │
├─────────────────────────────────┤
│  [2]    [3]    [5]    [6]      │
└─────────────────────────────────┘
```

*Comparison:*
```
┌─────────────────────────────────┐
│      5 + 3    ○    7           │
│         (empty circle)          │
├─────────────────────────────────┤
│    [ < ]    [ = ]    [ > ]     │
└─────────────────────────────────┘
```

*True/False:*
```
┌─────────────────────────────────┐
│        5 + 3 = 9               │
│     (true or false?)           │
├─────────────────────────────────┤
│      [YES ✓]    [NO ✗]         │
│      (green)    (red)          │
└─────────────────────────────────┘
```

### Combat Stats

| Stat | Description |
|------|-------------|
| HP | Health points, lose when wrong |
| ATK | Base damage per correct answer |
| Shield | Block time (seconds to answer) |
| Pet Bonus | Extra damage/problems from pet |

### Progression

- **XP:** 20 per enemy defeated
- **Coins:** 1 per enemy defeated
- **Crystals:** 10% drop chance + boss rewards
- **Level Up:** +1 HP, sometimes +1 ATK

---

## 5. Mana System

### What is Mana?

Mana represents the player's attunement to **Numera Energy** - the mathematical force that powers all crystal magic. As Pythia explains: *"The crystals respond to those who understand their language - the language of numbers."*

### Mana Icon

⚡ (lightning bolt) - represents the spark of mathematical insight

### Mana Pool

| Player Level | Max Mana |
|--------------|----------|
| 1-5 | 10 ⚡ |
| 6-10 | 15 ⚡ |
| 11-15 | 20 ⚡ |
| 16+ | 25 ⚡ |

### Mana Sources

| Source | Mana Gained |
|--------|-------------|
| Win battle | +1 ⚡ |
| Correct answer streak (5+) | +1 ⚡ bonus |
| Rest at campsite | +2 ⚡ |
| Complete arena wave | +2 ⚡ |
| Level up | Full restore |
| Daily login | +3 ⚡ |

### Mana Costs (Crystal Forge)

| Operation | Cost | Notes |
|-----------|------|-------|
| Merge Shards | 1 ⚡ | Basic operation |
| Split Shard | 1 ⚡ | Basic operation |
| Create Fragment | 2 ⚡ | Unlocks after Boss I |
| Split Fragment | 2 ⚡ | Unlocks after Boss I |
| Refine (trim value) | 2 ⚡ | Unlocks after Boss II |
| Create Prism | 3 ⚡ | Unlocks after Boss III |

### Design Philosophy: No Punishment

**IMPORTANT:** Mana is only consumed on **successful** operations.

- Wrong math answer = "The spell fizzles..." (no mana lost)
- Crystals return to inventory
- Child feels safe to experiment and try again

This prevents frustration and encourages mathematical exploration.

---

## 6. Crystal System

### What Are Numera Crystals?

When Zyx's ship crashed, the Calculation Core shattered. Large pieces became **Ship Fragments** (quest items). Small shards scattered as **Numera Crystals** - each containing a specific amount of mathematical energy represented by a **numeric value**.

### Crystal Tiers & Values

Each crystal has both a **tier** and a **numeric value**:

| Crystal | Icon | Value Range | Display Example |
|---------|------|-------------|-----------------|
| **Shard** | 💎 | 1-20 | 💎(7), 💎(13), 💎(4) |
| **Fragment** | 💠 | 10-50 | 💠(14), 💠(25), 💠(38) |
| **Prism** | 🔮 | 30-99 | 🔮(45), 🔮(72), 🔮(88) |
| **Core** | ⭐ | 100 (unique) | ⭐(100) - only ONE exists |

### The Core - Ultimate Reward

The **Numera Core** ⭐ is the heart of Zyx's Calculation Core. There is only ONE in the entire game, awarded after defeating the **Final Boss**. It's required to complete the Grand Equation and send Zyx home.

### Crystal Forge Operations

The Crystal Forge uses **mathematical magic** - players must solve equations to combine or split crystals.

#### Basic Operations (Available from Start)

| Operation | Input | Output | Math Problem |
|-----------|-------|--------|--------------|
| **Merge Shards** | 💎(a) + 💎(b) | 💎(a+b) | "6 + 4 = ?" → 💎(10) |
| **Split Shard** | 💎(a) | 💎(b) + 💎(a-b) | "12 - 5 = ?" → 💎(7) + 💎(5) |

#### Advanced Operations (Unlock after Bosses)

| Operation | Unlock | Input | Output | Math |
|-----------|--------|-------|--------|------|
| **Create Fragment** | Boss I | 💎 + 💎 + 💎 | 💠 | a + b + c = ? |
| **Split Fragment** | Boss I | 💠 | 💎 + 💎 + 💎 | Division into 3 |
| **Refine** | Boss II | 💎(a) or 💠(a) | Smaller value | a - x = target |
| **Create Prism** | Boss III | 💠 + 💠 + 💠 | 🔮 | Complex sum |

#### Operation Examples

**Merge:** Player has 💎(6) and 💎(4). Drags both to forge.
- Screen shows: `6 + 4 = ?`
- Player answers: `10`
- Result: 💎(10) ✓

**Split:** Player has 💎(12), needs smaller crystals.
- Player chooses split amount: `5`
- Screen shows: `12 - 5 = ?`
- Player answers: `7`
- Result: 💎(7) + 💎(5) ✓

**Refine:** Player has 💎(15), needs exactly 💎(11) for an amulet.
- Player sets target: `11`
- Screen shows: `15 - ? = 11`
- Player answers: `4`
- Result: 💎(11) + 💎(4) ✓

### Crystal Uses

| Use | Requirement |
|-----|-------------|
| Bind Pet (see Pet System) | **Amulet** with exact value matching pet |
| Unlock Forest | 💠 with any value (resonance) |
| Unlock Silverpond | 🔮 with any value (resonance) |
| Complete Grand Equation | ⭐ Core (unique, from Final Boss) |

### Crystal Sources

| Source | Drop |
|--------|------|
| Regular battle | 💎(1-5) - 10% chance |
| Arena completion | 💎(3-8) ×2-3 |
| Boss I (Slime King) | 💠(12-18) guaranteed |
| Boss II (Verdant Guardian) | 💠(20-30) guaranteed |
| Boss III (Crystal Serpent) | 🔮(40-60) guaranteed |
| Final Boss | ⭐(100) - THE Core |
| Journey completion | 💎(5-12) ×2 |
| Hidden chest | 💎(2-10) |

### Locked Crystals

Players can **lock** important crystals to prevent accidental use:

- 🔒 Locked crystal cannot be used in forge
- Useful for saving crystals needed for specific amulets
- Toggle lock with single tap on crystal in inventory

---

## 7. Pet System

### The Problem: Freed But Unstable

When you solve a creature's equations, the Numera corruption fades - but the creature's mind is still chaotic. They've been flooded with mathematical energy and can't think clearly without it.

### The Solution: Amulet Binding

Pythia discovered that Numera Crystals can be "tuned" to specific frequencies. Each creature has a unique **resonance value** - only an amulet with the **exact matching number** can stabilize their mind.

*"Every creature hums with its own number, child. Find it, craft it, and you'll have a friend for life."* — Pythia

### Pet States

| State | Visual | Location | Description |
|-------|--------|----------|-------------|
| Unknown | ??? silhouette | Bestiary | Never encountered |
| Corrupted | 😠 + swirling numbers | Battle | Enemy in combat |
| Freed | 😵 + fading numbers | Pythia's Hut | Defeated, confused, waiting |
| Bound | 😊 + crystal pendant | Companions | Loyal pet, can equip |

### Bestiary

The **Bestiary** tracks all creatures:
- **Unknown (???)**: Silhouette only, haven't met yet
- **Seen**: Encountered in battle, stats visible
- **Freed**: Defeated at least once, can be bound
- **Bound**: Your companion, shows abilities

### Pet Tiers & Amulet Requirements

Each pet requires an **Amulet** - a crystal with a **specific exact value**:

| Tier | Amulet Type | Example Pets | Required Amulet |
|------|-------------|--------------|-----------------|
| Common | 💎 Shard | Slime Buddy | 💎(8) |
| Common | 💎 Shard | Baby Imp | 💎(12) |
| Uncommon | 💠 Fragment | Owl | 💠(14) |
| Uncommon | 💠 Fragment | Wolf | 💠(18) |
| Uncommon | 💠 Fragment | Bodlina | 💠(21) |
| Rare | 🔮 Prism | Forest Spirit | 🔮(45) |
| Rare | 🔮 Prism | Mushroom Giant | 🔮(52) |
| Legendary | ⭐ Core | Phoenix | ⭐(100) - requires THE Core |

### Why Exact Values?

This creates a **crafting goal**:
1. Player sees: "Owl needs 💠(14)"
2. Player has: 💎(6), 💎(5), 💎(8), 💎(3)
3. Player thinks: "How do I make exactly 14?"
4. Solution: 💎(6) + 💎(5) + 💎(3) = 💎(14) → upgrade to 💠(14)

This connects **combat** (earning crystals), **crafting** (math in forge), and **collection** (binding pets).

### Pet Abilities

| Pet | Ability | Effect | Cooldown |
|-----|---------|--------|----------|
| Slime Buddy | Goo Shield | Block 1 damage | 3 turns |
| Owl | Calming Spark | Enemy slower 1 turn | 3 turns |
| Wolf | Fierce Bite | +5 bonus damage | 2 turns |
| Mushroom Giant | Healing Spores | Restore 10 HP | 4 turns |
| Forest Spirit | Nature's Gift | +1 crystal drop | 3 turns |
| Phoenix | Rebirth Flame | Revive with 5 HP (once per battle) | - |

### Binding Ceremony Flow

```
1. Defeat creature in battle → freed creature appears in Pythia's "Waiting" section
2. Player visits Pythia's Hut, sees the creature with its required amulet value
3. If player has the exact amulet:
   a. Player selects creature
   b. Amulet slot lights up, player drags amulet in
   c. Animation: Pythia waves staff, crystal becomes pendant
   d. Creature's confusion fades, happy expression
   e. Pet moves to "Companions" section
4. If player doesn't have the amulet:
   a. UI shows: "Needs: 💠(14)" with hint button
   b. Hint: "Try combining in the Crystal Forge!"
   c. Quick link to Crystal Forge with target value displayed
```

### Party System

- Player can equip **1 pet** at a time (2 pets at level 15+)
- Equipped pet appears in battle next to player
- Pet ability button appears when cooldown ready
- Pets gain XP too (shown as happiness hearts)

---

## 8. Buildings & Locations

### Witch Hut (Pythia's Hut)

**Owner:** Pythia
**Functions:**
- Pet binding ceremony (with amulets)
- Bestiary viewing
- Potion purchases (subscription system)
- Hint system for amulet crafting

**Visual:** Cozy witch cottage interior with potions, hanging herbs, bubbling cauldron, soft candlelight. Ritual circle in center for binding ceremony.

**UI Sections:**
- Left: Bestiary / Waiting creatures
- Center: Ritual circle with amulet slot
- Right: Selected creature details + required amulet

### Crystal Forge

**Owner:** Unmanned (ancient Numera technology activated by player's Numera attunement)

**Functions:**
- Mathematical crystal operations (merge, split, refine)
- Create higher-tier crystals
- Craft specific amulets for pets

**Visual:** Magical crystal workshop with glowing forge altar in center. Crystals grow from walls providing ambient light. Equation display floats above the forge.

**UI Layout - Three Zones:**

```
┌─────────────┬──────────────────────┬─────────────┐
│  INVENTORY  │       FORGE          │    GOAL     │
│             │                      │             │
│  [Tier      │   ┌───┐    ┌───┐    │  Target:    │
│   filters]  │   │ 6 │ +  │ 4 │    │  Owl 🦉     │
│             │   └───┘    └───┘    │  💠(14)     │
│  💎(3)      │                      │             │
│  💎(6)      │    6 + 4 = ?        │  [💡 Hint]  │
│  💎(7)      │                      │             │
│  💎(9)      │   Result: 💎(10)    │             │
│             │                      │             │
│  [🔒 Lock]  │   Cost: ⚡1 mana     │             │
└─────────────┴──────────────────────┴─────────────┘
│           OPERATIONS (6 buttons)                 │
│  [Merge] [Split] [Create💠🔒] [Split💠🔒]       │
│  [Refine🔒] [Create🔮🔒]                         │
└──────────────────────────────────────────────────┘
│           [ ✨ Cast Spell ]  ⚡1                  │
└──────────────────────────────────────────────────┘
```

**Interaction Flow:**
1. Select operation (e.g., "Merge")
2. Click crystals in inventory → they move to forge slots
3. Equation appears above forge
4. Player calculates answer mentally
5. Tap "Cast Spell" → if correct, new crystal appears
6. If wrong: "The spell fizzles..." (no penalty, try again)

### Arena (Guild)

**Owner:** Zyx
**Functions:**
- Battle waves of enemies
- Earn XP, coins, crystals
- Progress through arena levels

**Wave System (Implemented):**

Each arena level contains 5 waves with unique enemy compositions:

| Wave | Description | Enemies |
|------|-------------|---------|
| 1 | Introduction | 1 weak enemy |
| 2 | Duo | 2 enemies |
| 3 | Trio | 2-3 mixed enemies |
| 4 | Challenge | 2-3 stronger enemies |
| 5 | Mini-boss | Boss-tier enemy |

**Wave Progress Table UI:**

```
+---------------------------+
|          WAVES            |
|           ✓  ★            |
+---------------------------+
| 1  [S]           ✓  ★    |  <- Completed, Perfect
| 2  [P][S]        ✓  ☆    |  <- Completed, had mistakes
| 3  [S][S]  >>>   ○  ☆    |  <- Current (highlighted)
| 4  [P][S]        ○  ☆    |  <- Future (dimmed)
| 5  [P][P]        ○  ☆    |  <- Future (dimmed)
+---------------------------+

✓ = completed (green)  ○ = not completed (gray)
★ = perfect (gold)     ☆ = not perfect (gray)
```

**Crystal Rewards:**
- **Base crystal (💎 value 1)**: Awarded on first wave completion
- **Perfect bonus (💎 value 1)**: Awarded when achieving perfect (no wrong answers)
- Crystals only awarded for **improvements** - replaying already-perfect waves yields no additional crystals
- Historical best results preserved between arena runs

**Perfect Wave Criteria:**
- Zero wrong answers during the wave (player math + pet math)
- Tracked via `waveWrongAnswerCount` reset per wave

### Shop

**Functions:**
- Buy weapons (swords)
- Buy shields
- Buy journey supplies

### Town Square

**Functions:**
- Access to all buildings
- Story events trigger here

---

## 9. Regions & Progression

### Region Overview

| # | Region | Levels | Unlock Requirement | Theme | Math Focus |
|---|--------|--------|-------------------|-------|------------|
| 1 | **Mathoria** (Village) | 1-10 | Start | Green meadows, cozy town | Addition ≤10 |
| 2 | **Verdant Forest** | 7-15 | Arena 2 + 💠 | Dense magical forest | Addition/Subtraction ≤15 |
| 3 | **Silverpond** | 12-20 | Forest Boss + 🔮 | Lake, underwater ruins | Multiplication ≤5×5 |
| 4 | **Iron Mountains** | 18-25 | Silverpond Boss | Rocky highlands, peaks | Division introduced |
| 5 | **Dwarven City** | 22-28 | Mountains Boss | Underground city | Mixed operations |
| 6 | **Crystal Caves** | 26-32 | Dwarven City Boss + ⭐ | Glowing caverns | Complex equations |
| 7 | **Last Outpost** | 30-35 | Caves Boss + ⭐×2 | Alien ruins | All operations |
| 8 | **Zyx's Ship** (Final) | 35+ | All Ship Fragments | Repaired spaceship | Grand Equation |

### Region Progression Map

```
┌──────────────┐
│   MATHORIA   │  Starting village - Zyx's crash site
│   Lv 1-10    │  Arena, Shop, Witch Hut, Crystal Forge
└──────┬───────┘
       │ (💠 Fragment required)
       ▼
┌──────────────┐
│VERDANT FOREST│  First journey - puzzles introduced
│   Lv 7-15    │  Boss: Verdant Guardian
└──────┬───────┘
       │ (🔮 Prism required)
       ▼
┌──────────────┐
│  SILVERPOND  │  Underwater theme - multiplication
│  Lv 12-20    │  Boss: Crystal Serpent
└──────┬───────┘
       │
       ▼
┌──────────────┐
│IRON MOUNTAINS│  Highland adventure - division
│  Lv 18-25    │  Boss: Stone Golem
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ DWARVEN CITY │  Underground civilization - mixed ops
│  Lv 22-28    │  Boss: Forge Master
└──────┬───────┘
       │ (⭐ Core Piece required)
       ▼
┌──────────────┐
│CRYSTAL CAVES │  Deep underground - complex math
│  Lv 26-32    │  Boss: Crystal Wyrm
└──────┬───────┘
       │ (⭐×2 Core Pieces required)
       ▼
┌──────────────┐
│ LAST OUTPOST │  Ancient alien ruins - all skills
│  Lv 30-35    │  Boss: Corrupted Guardian
└──────┬───────┘
       │ (All Ship Fragments + Complete Core)
       ▼
┌──────────────┐
│  ZYX'S SHIP  │  Final challenge - Grand Equation
│   Lv 35+     │  Boss: The Numera Anomaly
└──────────────┘
       │
       ▼
    ENDING: Zyx goes home, player becomes Master Mathematician Knight
```

### Ship Fragments Location

| Fragment | Region | Source |
|----------|--------|--------|
| Fragment 1 | Mathoria | Arena Level 3 completion |
| Fragment 2 | Verdant Forest | Verdant Guardian (Boss) |
| Fragment 3 | Silverpond | Crystal Serpent (Boss) |
| Fragment 4 | Iron Mountains | Hidden cave puzzle |
| Fragment 5 | Dwarven City | Forge Master (Boss) |
| Core Shard 1 | Crystal Caves | Crystal Wyrm (Boss) |
| Core Shard 2 | Last Outpost | Corrupted Guardian (Boss) |
| **Complete Core** | Zyx's Ship | The Numera Anomaly (Final Boss) |

### Verdant Forest Details

*Full balance data in FOREST_DESIGN.md*

**Entry Requirements:**
- Level 7+
- Arena 2 complete
- Journey Supplies (50 coins)
- 💠 Fragment (for resonance)

**Enemies:**

| Enemy | HP | ATK | XP | Gold |
|-------|----|----|-----|------|
| Forest Wolf | 10 | 3 | 25 | 8-18 |
| Mushroom Giant | 12 | 2 | 35 | 15-25 |
| Thorn Sprite | 8 | 4 | 30 | 12-22 |
| Elder Treant | 15 | 2 | 50 | 25-40 |

**Boss: Verdant Guardian**
- 3 phases (10 HP / 10 HP / 12 HP)
- 8 HP heal between phases
- Total: 32 HP
- Rewards: 150 XP, 80-120 gold, 5 💎, Special Treant Crystal, Silverpond unlock

---

### Forest Journey - Room-Based Exploration System

**Core Concept:** The Forest Journey uses a **room-based exploration** mechanic. Each area is a self-contained full-screen scene (1280×720) where the player can walk around and interact with objects. Clicking exit points transitions to the next area.

**Interaction Model:**
- Each "room" is one full-screen background with interactive objects
- Player character visible in the scene, can walk within the room
- **Click on object** → Character walks to it → Interaction triggers
- **Click on exit point** (path, arrow, bridge) → Transition to next room
- Fade/slide transitions between rooms

---

### Forest Journey Structure (Detailed)

---

## **PART 1: Forest Edge & Deep Forest**

#### **Scene 1: Forest Edge** (`forest_edge`) ✅

*Background: `forest-edge-bg` - Bright forest entrance with pond, sunlight filtering through*

1. **Wolf Encounter** ✅
   - Forest Wolf blocks the path ahead (x: 850, y: 540)
   - **Aggro system**: Battle triggers when player walks within 150px
   - Battle Scene uses `forest-edge-battleground`
   - Victory → Player spawns at wolf's position, path is clear
   - Exit → Riddle Bridge

#### **Scene 2: Riddle Bridge** (`forest_riddle`) ✅

*Background: `misc.forest-riddle` - River with stepping stones, mystical atmosphere*

1. **Number Bridge Puzzle** (`ForestRiddleScene`) ✅
   - Standalone explorable room with player movement
   - Stepping stones showing sequence: 2, _, 6, 8, 10, _, 14
   - Floating magical stones with numbers (4, 12 correct + distractors)
   - **Drag-and-drop** stones into gaps to complete sequence
   - Wrong answer → Screen shake, stones reset
   - Correct answer → Blue particles, bridge unlocks
   - Player walks across bridge with elevation change (path-based Y movement)
   - **One-way progression**: Cannot backtrack after crossing

2. **Mushroom Giant Battle**
   - After solving puzzle, Mushroom Giant appears on far side of bridge
   - Blocks path forward with **aggro radius** (150px)
   - Battle Scene uses `deep-forest-battleground`
   - Victory → Path to Deep Forest opens

#### **Scene 3: Deep Forest** (`deep_forest`) ✅

*Background: `forest-deep-path` - Dense, darker forest with filtered light*

1. **Thorn Sprite Battle**
   - Thorn Sprite blocks the path (x: 450, y: 620, aggro radius 150px)
   - Quick enemy, high ATK but low HP
   - Battle Scene uses `forest-deep-battleground`
   - Victory → Path to Forest Camp opens

2. **Treasure Chest** (Letter-Lock) - Visible from start
   - Ornate chest visible behind the Thorn Sprite (x: 700, y: 620)
   - **Spin-lock mechanism** with 4-letter answer
   - Riddle: "Má čtyři nohy, ale nechodí. Co to je?" (Answer: STUL)
   - Letter wheels rotate through alphabet
   - Success → Opens → Gold + 💎 reward
   - Fail → Lock resets, can retry

#### **Scene 4: Forest Camp** (`forest_camp`) - Waypoint

*Background: Cozy forest clearing with warm lighting*

1. **Treasure Chest** (Regular)
   - Simple wooden chest, no puzzle required
   - Click → Opens → Gold reward (25-40)

2. **Campfire** 🔥
   - Visual centerpiece, ambient crackling
   - Decorative element

3. **Rest Mat** 🛏️
   - Click mat → Rest animation → **Full HP heal**
   - Save point created
   - **Waypoint unlocked** - can fast-travel here from town

**END OF PART 1**

---

## **PART 2: Ancient Grove** (Future Implementation)

#### **Scene 5: Ancient Grove Path**

*Background: Mystical ancient trees, magical atmosphere, glowing moss*

- Elder Treant Battle
- Crystal Offering Puzzle
- Sacred Well (healing)
- Path Finding Puzzle

#### **Scene 6: Guardian's Lair**

*Background: Dramatic stone ruins, ancient forest shrine*

- **Verdant Guardian Boss Battle**
  - Multi-phase boss (3 phases)
  - Epic battle with phase transitions
  - Victory → Part 2 Complete!

---

### Journey Victory & Rewards

**On Completion:**
- 🏆 Victory Screen: "Zelený les dokončena!"
- Unlock message: "Cesta k Stříbrnému jezeru je nyní otevřená!"
- Rewards distributed:
  - Total XP accumulated
  - Total Gold accumulated
  - 💎 Forest Treant Crystal (for Treant pet binding)
  - 💠 Fragments earned from puzzles
  - Silverpond region unlocked

---

### Puzzle Details

**1. Number Bridge**
- Type: `sequence`
- Complete arithmetic sequences
- Example: 2, ?, 6, 8, ?, 12 (answer: 4, 10)
- Time limit: 60 seconds

**2. Balance Scale** (Enhanced)
- Type: `equation`
- Physical scale visualization
- Player clicks stones to validate
- Scale animates based on answer
- Correct → Scale balances, bridge appears

**3. Letter-Lock Puzzle** (NEW)
- Type: `word_lock`
- Riddle-based answer (always 3 letters)
- Rotating letter wheels (A-E, F-J, etc.)
- Example: "Rainbow outside color" → RED

**4. Crystal Offering**
- Type: `sum_to_target`
- Select colored crystals to match target
- Multiple valid solutions possible
- Optional puzzle (skip with penalty)

**5. Path Choice**
- Type: `multiple_choice`
- Choose path with correct equation
- Wrong choice adds extra battle

---

## 10. Visual Design

### Art Style

- Children's book illustration
- Soft rounded shapes
- Warm friendly colors
- Big expressive eyes
- Studio Ghibli-inspired simplicity
- Cute, never scary

### Visual Storytelling for Non-Readers

The game uses **wordless comics** to tell the story. Kids who can't read understand through:
- Big emotional expressions
- Clear cause → effect panels
- Universal symbols

### Universal Symbol Dictionary

**Emotions:**
| Symbol | Meaning |
|--------|---------|
| 😊 | Happy, good, safe |
| 😠 | Angry, danger |
| 😢 | Sad, needs help |
| 😵 | Confused, dizzy |

**Actions:**
| Symbol | Meaning |
|--------|---------|
| ✓ | Correct, yes |
| ✗ | Wrong, no |
| ❤️ | Friend, love |
| 💭 | Thinking |

**Items:**
| Symbol | Meaning |
|--------|---------|
| 💎 | Crystal shard (with value, e.g., 💎(7)) |
| 💠 | Crystal fragment (with value) |
| 🔮 | Crystal prism (with value) |
| ⭐ | Crystal core (unique, value 100) |
| ⚡ | Mana (magical energy) |
| 🪙 | Coin |
| 🧪 | Potion |
| 🐾 | Pet |
| 🎯 | Crafting target/goal |

**Progress:**
| Symbol | Meaning |
|--------|---------|
| ⬜ | Not done |
| ✅ | Complete |
| 🔒 | Locked |
| 🔓 | Unlocked |

---

## 11. UI Specifications

### Pet Binding UI

```
┌─────────────────────────────────────────────────────────┐
│  🐾 BIND PET                                    [ ✕ ]  │
│  ═══════════════════════════════════════════════════   │
│                                                         │
│   WAITING TO BE BOUND                                   │
│   ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐                  │
│   │ 😵  │  │ 😵  │  │ 😵  │  │  ?  │                  │
│   │slime│  │bodli│  │ imp │  │     │                  │
│   └──┬──┘  └──┬──┘  └──┬──┘  └─────┘                  │
│      │        │        │     (empty)                   │
│   💎×3     💠×1     💠×1                               │
│                                                         │
│   YOUR COMPANIONS                                       │
│   ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐                  │
│   │ 😊  │  │  🔒 │  │  🔒 │  │  🔒 │                  │
│   │buddy│  │     │  │     │  │     │                  │
│   └─────┘  └─────┘  └─────┘  └─────┘                  │
│   ACTIVE                                               │
│                                                         │
│   Your crystals:  💎×8   💠×2   🔮×0                   │
└─────────────────────────────────────────────────────────┘
```

**Creature Frame States:**
- Waiting: Gray border, confused expression (😵)
- Selected: Golden glow, pulsing
- Bound: Green border, happy expression (😊), pendant
- Locked: Dark gray, lock icon
- Empty: Dotted outline, "?"

### Crystal Forge UI (Expanded with Math)

**Three-Zone Layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│  💎 KRYSTALOVÁ KOVÁRNA                              ⚡12  [ ✕ ] │
│  ═══════════════════════════════════════════════════════════   │
├───────────────┬─────────────────────────┬───────────────────────┤
│   INVENTÁŘ    │         KOVADLINA       │      CÍL CRAFTU       │
│               │                         │                       │
│  Filtr:       │    Aktivní sloty:       │  🎯 Aktuální cíl:     │
│  [T1][T2][T3] │                         │                       │
│               │    ┌─────┐   ┌─────┐   │  Amulet pro: 🦉 Owl   │
│  💎(3)  💎(6) │    │  6  │ + │  4  │   │  Potřebuji: 💠(14)    │
│  💎(7)  💎(9) │    └─────┘   └─────┘   │                       │
│  💎(4) 💎(11) │                         │  ─────────────────    │
│  💎(8) 💎(2)  │   ══════════════════   │                       │
│               │      6  +  4  =  ?      │  [💡 Nápověda]        │
│  ─────────    │   ══════════════════   │  "Zkus: 6+5+3"        │
│  💠(12)       │                         │                       │
│  💠(18) 🔒    │    Výsledek:            │  ─────────────────    │
│               │    ┌───────────┐        │                       │
│  ─────────    │    │  💎(10)   │        │  [Zrušit cíl]         │
│  🔮(45)       │    │  preview  │        │                       │
│               │    └───────────┘        │                       │
├───────────────┴─────────────────────────┴───────────────────────┤
│                         OPERACE                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │  Spojit  │ │ Rozdělit │ │ Vytvořit │ │ Rozdělit │           │
│  │ T1 (2→1) │ │ T1 (1→2) │ │ T2  🔒   │ │ T2  🔒   │           │
│  │   ⚡1    │ │   ⚡1    │ │   ⚡2    │ │   ⚡2    │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│  ┌──────────┐ ┌──────────┐                                      │
│  │  Refine  │ │ Vytvořit │  🔒 = Odemkneš po bossovi           │
│  │   🔒     │ │ T3  🔒   │                                      │
│  │   ⚡2    │ │   ⚡3    │                                      │
│  └──────────┘ └──────────┘                                      │
├─────────────────────────────────────────────────────────────────┤
│              [ ✨ Proveď kouzlo ]     Cena: ⚡1 mana            │
│                                                                  │
│  ↩️ Zpět do inventáře (klik na krystal ve slotu)                │
└─────────────────────────────────────────────────────────────────┘
```

**Zone Descriptions:**

| Zone | Purpose | Interactions |
|------|---------|--------------|
| **Inventory (Left)** | Shows all owned crystals | Click to add to forge, tier filters, lock toggle |
| **Forge (Center)** | Active crafting area | Slots fill based on operation, equation displays, result preview |
| **Goal (Right)** | Optional target tracking | Set target amulet, get hints, quick navigation |

**UI States:**

| State | Visual |
|-------|--------|
| Operation selected | Correct number of slots appear |
| Crystal in slot | Large number, glow effect |
| Valid combination | "Cast Spell" button enabled, green |
| Invalid combination | "Cast Spell" disabled, hint text |
| Success | Sparkle animation, new crystal appears |
| Failure (wrong math) | Puff of smoke, "Try again!" text, crystals return |

**Child-Friendly Design:**

- Large tap targets (crystals are big cards, not tiny icons)
- Click-based (no drag-drop required, though supported as bonus)
- No punishment for wrong answers (crystals return, no mana lost)
- Undo button always visible (return last crystal to inventory)
- Hint system suggests combinations from current inventory

### Journey Exploration UI (Room-Based System)

**Overview:** The journey uses **room-based exploration** where each area is a full-screen scene (1280×720). The player walks within the room and clicks exit points to move to the next area.

```
┌─────────────────────────────────────────────────────────────────┐
│  🌲 FOREST EDGE - Wolf Encounter            HP: ████░░ 14/20   │
│  ═══════════════════════════════════════════════════════════   │
│                                                                  │
│                              🐺                                  │
│                            Wolf                                  │
│                          (clickable)                             │
│                                                                  │
│        🧍                                           →           │
│      Player                                    (exit to         │
│                                                next area)       │
│  ══════════════════════════════════════════════════════════    │
│      🌿      🪨    🌳      🌲🌲      🍄      🌿               │
│  ────────────────────────────────────────────────────────────  │
│                                                                  │
│   Click: 🐺 Enemy → Battle  |  → Exit → Next Area              │
│                                                                  │
│  Area: 1/12   Stage: Forest Edge              [🚪 Abandon]     │
└─────────────────────────────────────────────────────────────────┘
```

**Room-Based Interaction Flow:**
1. Full-screen background shows current area
2. Player character visible in scene (can walk within room)
3. Interactive objects placed in scene (enemies, puzzles, chests)
4. **Click object** → Character walks to it → Interaction triggers
5. **Click exit point** → Fade/slide transition → Next room loads
6. After battle/puzzle → Return to same room (object removed/changed)

**Object Visual Indicators:**
| Object | Visual | Interaction |
|--------|--------|-------------|
| Enemy | Animated creature sprite | Battle scene transition |
| Puzzle | Glowing object/structure | Puzzle UI overlay |
| Chest | Wooden/ornate chest | Opens with reward |
| Rest Point | Campfire/mat/clearing | Heal + save menu |
| Waypoint | Stone marker + glow | Fast travel option |

**Forest Camp Waypoint UI:**
```
┌─────────────────────────────────────────┐
│         🏕️ FOREST CAMP                  │
│                                          │
│           🔥                             │
│        (campfire)                        │
│                                          │
│      🛏️ Rest Mat                        │
│                                          │
│   ┌──────────┐ ┌──────────┐ ┌────────┐ │
│   │ 💤 Rest  │ │ 🏠 Town  │ │ ▶ Go   │ │
│   │  (+50%)  │ │ (return) │ │(cont.) │ │
│   └──────────┘ └──────────┘ └────────┘ │
│                                          │
│   ✓ Waypoint unlocked - can return here │
└─────────────────────────────────────────┘
```

**Treasure Scene UI (Two Chests):**
```
┌─────────────────────────────────────────────────────────┐
│  💰 TREASURE CLEARING                                    │
│                                                          │
│        ┌─────────┐              ┌─────────┐             │
│        │ 📦      │              │ 🔒📦    │             │
│        │ Regular │              │ Locked  │             │
│        │  Chest  │              │  Chest  │             │
│        └────┬────┘              └────┬────┘             │
│             │                        │                   │
│         [Open]                   [Solve]                │
│                                                          │
│  Regular: Contains gold                                  │
│  Locked: Requires letter-lock puzzle                     │
└─────────────────────────────────────────────────────────┘
```

**Letter-Lock Puzzle UI:**
```
┌─────────────────────────────────────────────────────────┐
│  🔒 PUZZLE LOCK                                          │
│                                                          │
│   "Which color of the rainbow is on the outside?"       │
│                                                          │
│              ┌───┐ ┌───┐ ┌───┐                          │
│              │ R │ │ E │ │ D │  ← Answer wheels         │
│              │ ▲ │ │ ▲ │ │ ▲ │                          │
│              │ ▼ │ │ ▼ │ │ ▼ │                          │
│              └───┘ └───┘ └───┘                          │
│                                                          │
│   Letters per wheel: Q R S T U (rotates)                │
│                                                          │
│                   [ UNLOCK ]                             │
└─────────────────────────────────────────────────────────┘
```

### Pythia's Hut UI (Pet Binding)

**Three-Zone Layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│  🐾 CHALOUPKA PYTHIE                                    [ ✕ ]  │
│  ═══════════════════════════════════════════════════════════   │
│                                                                  │
│  [ 🐾 Ochočení ]  [ 🧪 Lektvary ]                               │
│  ════════════════════════════════                               │
├───────────────┬─────────────────────────┬───────────────────────┤
│   BESTIÁŘ     │     RITUÁLNÍ KRUH       │   DETAIL TVORA        │
│               │                         │                       │
│  Čekají:      │         ╭───╮          │  🦉 Sovička           │
│  ┌─────┐      │       ╭─┤   ├─╮        │  Tier: Uncommon       │
│  │ 😵  │      │      │  ╲___╱  │        │                       │
│  │slime│      │      │  Ghost  │        │  ─────────────────    │
│  │💎(8)│      │       ╰───────╯         │  Schopnost:           │
│  └─────┘      │                         │  ⚡ Uklidňující jiskra │
│  ┌─────┐      │    ┌─────────────┐     │  "Nepřítel je 1 kolo  │
│  │ 😵  │      │    │  Slot pro   │     │   pomalejší"          │
│  │ owl │◀     │    │   amulet    │     │  Cooldown: ●●●○       │
│  │💠(14)│     │    │   💠(?)     │     │                       │
│  └─────┘      │    └─────────────┘     │  ─────────────────    │
│               │                         │  Potřebuje:           │
│  Ochočení:    │    Mana: ⚡4            │  Amulet: 💠(14)       │
│  ┌─────┐      │                         │                       │
│  │ 😊  │      │                         │  [Jít do Kovárny →]   │
│  │buddy│      │                         │                       │
│  │ACTIVE│     │                         │                       │
│  └─────┘      │                         │                       │
├───────────────┴─────────────────────────┴───────────────────────┤
│                    [ 🌀 Ochočit ]                                │
│               Cena: ⚡4 mana + 💠(14) amulet                    │
│                                                                  │
│  "Každý tvor hučí svým vlastním číslem..." — Pythia            │
└─────────────────────────────────────────────────────────────────┘
```

**Creature Card States:**

| State | Border | Expression | Badge |
|-------|--------|------------|-------|
| Unknown | Dark gray | ??? silhouette | 🔒 |
| Waiting | Gray | 😵 confused | Required amulet |
| Selected | Golden glow | 😵 with hope | Pulsing amulet |
| Bound | Green | 😊 happy | ✓ pendant |
| Active | Blue | 😊 with star | ACTIVE label |

**Binding Animation Sequence:**
1. Player drags amulet to slot (or clicks "Bind" with amulet in inventory)
2. Pythia raises staff, magical circle glows
3. Amulet floats up, transforms into pendant
4. Pendant floats to creature's neck
5. Creature's confusion spirals fade
6. Happy expression, sparkles
7. Card moves from "Waiting" to "Companions"

---

## 12. Asset Requirements

### Characters

| Asset | Variants | Description |
|-------|----------|-------------|
| Zyx | 4 expressions | Alien mentor |
| Pythia | 4 expressions | Crystal witch |
| Player | customizable | Child hero |

### Enemies - Mathoria

| Asset | Description |
|-------|-------------|
| Slime | Basic enemy, green blob |
| Imp | Small fire creature |
| Goblin | Green humanoid |

### Enemies - Forest

| Asset | Description |
|-------|-------------|
| Forest Wolf | Gray/brown wolf |
| Mushroom Giant | Large mushroom creature |
| Thorn Sprite | Small magical sprite |
| Elder Treant | Ancient tree creature |
| Verdant Guardian | Boss, large nature spirit |

### Backgrounds

| Asset | Description |
|-------|-------------|
| Witch Hut Interior | Cozy, potions, cauldron |
| Crystal Forge Interior | Glowing crystals, forge |
| Forest Edge | Light forest beginning |
| Deep Woods | Dense darker forest |
| Ancient Grove | Mystical grove |
| Guardian's Lair | Boss arena |

### UI Elements

| Asset | Description |
|-------|-------------|
| Creature frame (4 states) | Waiting, selected, bound, locked |
| Crystal icons (4 types) | Shard, fragment, prism, core |
| Bind button | Large, friendly |
| Forge button | Glowing, magical |

### Intro Comics (7 panels)

| Panel | Description |
|-------|-------------|
| 1 | Happy spaceship in space |
| 2 | Ship malfunction, falling |
| 3 | Crash in meadow, crystals scatter |
| 4A | Happy animals before |
| 4B | Confused animals after |
| 5 | Sad Zyx by broken ship |
| 6 | Player arrives, hope |

---

## 13. Implementation Priority

### Phase 1: Story Foundation
1. Intro comic sequence (7 panels)
2. Zyx character + expressions
3. Updated dialogue/story hooks

### Phase 2: Mana System
1. Mana pool tracking (player state)
2. Mana UI display (⚡ icon + number)
3. Mana regeneration on battle win / rest
4. Mana cost integration with Crystal Forge

### Phase 3: Crystal System with Values
1. Crystal data structure with numeric values
2. Crystal inventory UI with value display
3. Crystal drop system (enemies drop valued crystals)
4. Crystal locking mechanism

### Phase 4: Crystal Forge Math Operations
1. Crystal Forge scene (3-zone layout)
2. Merge operation (a + b = ?)
3. Split operation (a - b = ?)
4. Equation display and validation
5. Success/failure animations
6. Operation unlock system (after bosses)
7. Advanced operations: Create Fragment, Refine, Create Prism

### Phase 5: Pet System with Amulets
1. Pythia character + Witch Hut background
2. Bestiary system (unknown/seen/freed/bound states)
3. Amulet requirement per pet
4. Pet binding UI with ritual circle
5. Binding ceremony animation
6. "Goal" system linking Forge ↔ Pythia's Hut
7. Hint system for amulet crafting

### Phase 6: Verdant Forest - Room-Based Exploration
1. **Room-Based Exploration System**
   - Each area is a full-screen scene (1280×720)
   - Player character walks within room
   - Click-to-walk interaction model
   - Exit points trigger room transitions (fade/slide)
2. Forest enemies (4 types + boss)
3. Forest backgrounds (4 stages + treasure clearing + camp)
4. **Interactive Objects**
   - Enemy sprites on path (clickable → battle)
   - Chest objects (regular + puzzle-locked)
   - Rest points (campfire, mats)
   - Waypoint markers
5. **Puzzle Scenes** (5 types)
   - Number Bridge (sequence)
   - Balance Scale (walk to scale, click stones)
   - Letter-Lock (3-wheel rotating letters)
   - Crystal Offering (sum to target)
   - Path Choice (correct equation)
6. **Forest Camp Waypoint**
   - Unlockable fast-travel point
   - Rest/Town/Continue options
7. Multi-phase boss battle ✅ (implemented)
8. Boss rewards (Treant Crystal, Fragments, operation unlocks)

### Phase 7: Polish
1. Sound effects (forge spells, binding ceremony)
2. Music for each region
3. Particle effects (crystal sparkles, mana glow)
4. Achievement tracking
5. Tutorial for Crystal Forge math

---

## AI Image Prompts

### Style Keywords (Apply to All)

```
children's book illustration, soft rounded shapes, warm friendly
colors, simple clean lines, cute cartoon style, big expressive
eyes, fantasy adventure game, cozy wholesome atmosphere,
Studio Ghibli inspired simplicity
```

### Zyx Character

```
"Friendly alien mathematician character, children's game.
Small floating geometric crystal creature with one large
expressive eye. Soft blue-purple glow. Tiny glasses perched
above the eye. Translucent crystalline body. Friendly and
slightly nerdy. On transparent background."
```

### Pythia Character

```
"Friendly elderly witch character, children's game style.
Flowing purple robes with subtle sparkle. Wild silver hair
with tiny crystals woven in. Large round glasses, kind eyes,
warm smile. Pointed hat with crystal decoration. Grandmotherly
and magical. On transparent background."
```

### Witch Hut Interior

```
"Cozy witch cottage interior, children's game background.
Warm cluttered space with potions, hanging herbs, bubbling
cauldron, soft candlelight. Shelves with colorful bottles.
Mystical but homey. Purple and warm orange color scheme.
Empty center area for UI overlay."
```

### Crystal Forge Interior

```
"Magical crystal workshop interior, children's game background.
A glowing forge made of crystals dominates the space. Crystals
grow from walls and ceiling providing colorful light. Sparkles
and soft magical glow. Empty center area for UI overlay."
```

### Intro Comic Panels

**Panel 1:** "Cute spaceship flying peacefully through colorful space. Friendly stars twinkle. Children's book illustration."

**Panel 2:** "Same cute spaceship now shaking and sparking. Falling toward planet below. Cartoon danger, not scary."

**Panel 3:** "Aerial view of green meadow with crashed spaceship. Colorful crystals scattered like confetti. Forest animals peeking from edges."

**Panel 4A:** "Happy forest animals in sunny meadow. Slime, rabbit, fox playing together. Bright cheerful colors."

**Panel 4B:** "Same forest animals now confused. Swirling numbers around their heads. Crystals nearby. Frustrated expressions."

**Panel 5:** "Small crystal alien sitting sadly next to broken spaceship. One big tear. Thought bubble with house and question mark. Sunset lighting."

**Panel 6:** "Crystal alien looking up hopefully at child silhouette on hill. Sunlight behind child. Dawn colors. Beginning of adventure feeling."

---

## Data Structures

### crystal-tiers.json

```json
{
  "tiers": [
    {
      "id": "shard",
      "name": "Numera Shard",
      "icon": "💎",
      "spriteKey": "crystal_shard",
      "valueRange": { "min": 1, "max": 20 },
      "upgradeToTier": "fragment",
      "upgradeRequires": 3
    },
    {
      "id": "fragment",
      "name": "Numera Fragment",
      "icon": "💠",
      "spriteKey": "crystal_fragment",
      "valueRange": { "min": 10, "max": 50 },
      "upgradeToTier": "prism",
      "upgradeRequires": 3,
      "unlockCondition": "boss_1_defeated"
    },
    {
      "id": "prism",
      "name": "Numera Prism",
      "icon": "🔮",
      "spriteKey": "crystal_prism",
      "valueRange": { "min": 30, "max": 99 },
      "upgradeToTier": null,
      "unlockCondition": "boss_3_defeated"
    },
    {
      "id": "core",
      "name": "Numera Core",
      "icon": "⭐",
      "spriteKey": "crystal_core",
      "valueRange": { "min": 100, "max": 100 },
      "unique": true,
      "source": "final_boss"
    }
  ]
}
```

### forge-operations.json

```json
{
  "operations": [
    {
      "id": "merge_shard",
      "name": "Merge Shards",
      "nameCs": "Spojit Shardy",
      "inputTier": "shard",
      "inputCount": 2,
      "outputTier": "shard",
      "mathType": "addition",
      "manaCost": 1,
      "unlockCondition": null
    },
    {
      "id": "split_shard",
      "name": "Split Shard",
      "nameCs": "Rozdělit Shard",
      "inputTier": "shard",
      "inputCount": 1,
      "outputTier": "shard",
      "outputCount": 2,
      "mathType": "subtraction",
      "manaCost": 1,
      "unlockCondition": null
    },
    {
      "id": "create_fragment",
      "name": "Create Fragment",
      "nameCs": "Vytvořit Fragment",
      "inputTier": "shard",
      "inputCount": 3,
      "outputTier": "fragment",
      "mathType": "addition_three",
      "manaCost": 2,
      "unlockCondition": "boss_1_defeated"
    },
    {
      "id": "split_fragment",
      "name": "Split Fragment",
      "nameCs": "Rozdělit Fragment",
      "inputTier": "fragment",
      "inputCount": 1,
      "outputTier": "shard",
      "outputCount": 3,
      "mathType": "division",
      "manaCost": 2,
      "unlockCondition": "boss_1_defeated"
    },
    {
      "id": "refine",
      "name": "Refine",
      "nameCs": "Odsekat",
      "inputTier": "any",
      "inputCount": 1,
      "outputTier": "same",
      "outputCount": 2,
      "mathType": "subtraction_target",
      "manaCost": 2,
      "unlockCondition": "boss_2_defeated"
    },
    {
      "id": "create_prism",
      "name": "Create Prism",
      "nameCs": "Vytvořit Prismus",
      "inputTier": "fragment",
      "inputCount": 3,
      "outputTier": "prism",
      "mathType": "addition_three",
      "manaCost": 3,
      "unlockCondition": "boss_3_defeated"
    }
  ]
}
```

### pets.json

```json
{
  "pets": [
    {
      "id": "slime_buddy",
      "name": "Slime Buddy",
      "nameCs": "Slizoun",
      "tier": "common",
      "requiredAmulet": { "tier": "shard", "value": 8 },
      "ability": {
        "id": "goo_shield",
        "name": "Goo Shield",
        "nameCs": "Slizový štít",
        "description": "Block 1 damage",
        "descriptionCs": "Zablokuje 1 poškození",
        "effect": "block",
        "power": 1,
        "cooldown": 3
      },
      "spriteKey": "pet_slime"
    },
    {
      "id": "owl",
      "name": "Owl",
      "nameCs": "Sovička",
      "tier": "uncommon",
      "requiredAmulet": { "tier": "fragment", "value": 14 },
      "ability": {
        "id": "calming_spark",
        "name": "Calming Spark",
        "nameCs": "Uklidňující jiskra",
        "description": "Enemy slower for 1 turn",
        "descriptionCs": "Nepřítel je 1 kolo pomalejší",
        "effect": "slow",
        "power": 1,
        "cooldown": 3
      },
      "spriteKey": "pet_owl"
    },
    {
      "id": "wolf",
      "name": "Forest Wolf",
      "nameCs": "Lesní vlk",
      "tier": "uncommon",
      "requiredAmulet": { "tier": "fragment", "value": 18 },
      "ability": {
        "id": "fierce_bite",
        "name": "Fierce Bite",
        "nameCs": "Divoké kousnutí",
        "description": "+5 bonus damage",
        "descriptionCs": "+5 bonusové poškození",
        "effect": "damage",
        "power": 5,
        "cooldown": 2
      },
      "spriteKey": "pet_wolf"
    },
    {
      "id": "mushroom",
      "name": "Mushroom Spirit",
      "nameCs": "Houbový duch",
      "tier": "rare",
      "requiredAmulet": { "tier": "prism", "value": 45 },
      "ability": {
        "id": "healing_spores",
        "name": "Healing Spores",
        "nameCs": "Léčivý prach",
        "description": "Restore 10 HP",
        "descriptionCs": "Obnoví 10 HP",
        "effect": "heal",
        "power": 10,
        "cooldown": 4
      },
      "spriteKey": "pet_mushroom"
    },
    {
      "id": "phoenix",
      "name": "Phoenix",
      "nameCs": "Fénix",
      "tier": "legendary",
      "requiredAmulet": { "tier": "core", "value": 100 },
      "ability": {
        "id": "rebirth_flame",
        "name": "Rebirth Flame",
        "nameCs": "Plamen znovuzrození",
        "description": "Revive with 5 HP (once per battle)",
        "descriptionCs": "Oživení s 5 HP (jednou za boj)",
        "effect": "revive",
        "power": 5,
        "cooldown": null,
        "usesPerBattle": 1
      },
      "spriteKey": "pet_phoenix"
    }
  ]
}
```

### player-state.json (save structure)

```json
{
  "player": {
    "name": "Hero",
    "level": 5,
    "xp": 450,
    "hp": 85,
    "maxHp": 100,
    "mana": 12,
    "maxMana": 15,
    "gold": 230
  },
  "crystalInventory": [
    { "id": "c001", "tier": "shard", "value": 7, "locked": false },
    { "id": "c002", "tier": "shard", "value": 12, "locked": true },
    { "id": "c003", "tier": "fragment", "value": 18, "locked": false }
  ],
  "bestiary": {
    "slime": { "state": "bound", "timesDefeated": 12 },
    "owl": { "state": "freed", "timesDefeated": 3 },
    "wolf": { "state": "seen", "timesDefeated": 1 },
    "phoenix": { "state": "unknown", "timesDefeated": 0 }
  },
  "pets": {
    "active": "slime_buddy",
    "bound": ["slime_buddy"]
  },
  "unlocks": {
    "boss_1_defeated": true,
    "boss_2_defeated": false,
    "boss_3_defeated": false,
    "final_boss_defeated": false
  },
  "forgeHints": {
    "currentTarget": { "tier": "fragment", "value": 14, "forPet": "owl" }
  }
}
```

---

*See also: FOREST_DESIGN.md for detailed journey balance data.*
