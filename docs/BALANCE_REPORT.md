# Little Math Adventure - Game Balance Report

Generated: 2026-01-17

---

## Test Setup

### Simulation Parameters

| Parameter | Value | Source |
|-----------|-------|--------|
| Runs per scenario | 50-100 | Statistical averaging |
| Max battles | 500 | Safety cap |
| Shop visit frequency | Every 10 battles | Simulated |
| Target level | 10 | End of Mathoria region |

### Accuracy Profiles

| Profile | Base Problems | Bonus Problems | Block Problems | Puzzles |
|---------|---------------|----------------|----------------|---------|
| High (95%) | 95% correct | 90% correct | 85% correct | 95% correct |
| Medium (75%) | 75% correct | 65% correct | 55% correct | 70% correct |
| Low (55%) | 55% correct | 40% correct | 30% correct | 50% correct |

### Simulation Limitations

**What IS simulated:**
- Sequential battles against level-appropriate enemies
- Damage calculation (correct answers only, no base ATK)
- NO healing between battles (matches actual game)
- XP fixed at 20 per battle (matches actual game)
- Coins: 1 small copper + random enemy gold drop (matches actual game)
- Guild trial: 60 seconds, 10 correct needed (binary pass/fail)
- Shop purchases (weapons, shields)

**What is NOT simulated:**
- Arena mode (5 waves with no healing between)
- Pet bonus problems
- Potion usage mid-battle
- Player retreating / choosing easier enemies

---

## Extracted Game Variables

### Player Starting Stats

| Stat | Value | Source File |
|------|-------|-------------|
| HP | 10 | ProgressionSystem.ts:249 |
| Max HP | 10 | ProgressionSystem.ts:250 |
| ATK | 1 | ProgressionSystem.ts:251 |
| Defense | 0 | ProgressionSystem.ts:252 |
| Coins | 0 | ProgressionSystem.ts:253 |
| Level | 1 | ProgressionSystem.ts:260 |
| XP | 0 | ProgressionSystem.ts:261 |

### Level-Up Requirements

| Level | XP Needed | Cumulative Battles (20 XP each) |
|-------|-----------|--------------------------------|
| 1→2 | 20 | 1 |
| 2→3 | 60 | 4 |
| 3→4 | 100 | 9 |
| 4→5 | 100 | 14 |
| 5→6 | 100 | 19 |
| 6→7 | 100 | 24 |
| 7→8 | 100 | 29 |
| 8→9 | 100 | 34 |
| 9→10 | 100 | 39 |

**Level-up gains:** +1 HP, +1 ATK, full heal

### Damage Formula

```
Damage = Sum of (damageMultiplier for each CORRECT answer)

- Base ATK does NOT add to damage directly
- Each correct problem = 1 × damageMultiplier
- Wrong answers = 0 damage
- Weapon bonus problem: adds multiplier (1x or 2x) if correct
- Pet bonus problem: adds multiplier (1x or 2x) if correct
```

**Source:** BattleScene.ts:779-813

### Healing

| Situation | Healing | Source |
|-----------|---------|--------|
| Between battles | **NONE** | No code for this |
| Between arena waves | **NONE** | ArenaScene.ts |
| After arena completion | Full heal | ArenaScene.ts |
| On level-up | Full heal | ProgressionSystem.ts:102-124 |
| Potion (small) | 25 HP | items.json |
| Potion (large) | 75 HP | items.json |

### Enemy Stats

| Enemy | HP | ATK | XP | Gold Drop | Difficulty |
|-------|----|----|-----|-----------|------------|
| Slime | 3 | 1 | 20 | 5-15 | 1 |
| Purple Demon | 4 | 2 | 40 | 15-35 | 2 |
| Pink Beast | 10 | 2 | 70 | 30-55 | 3 |
| Leafy | 15 | 3 | 100 | 50-80 | 4 |

**Note:** XP in table is from enemies.json, but actual game awards fixed 20 XP per battle.

### Weapon Stats

| Weapon | Cost | ATK Bonus | Bonus Problem | Max # | Damage Mult |
|--------|------|-----------|---------------|-------|-------------|
| Wooden Sword | 8 | +2 | Addition | ≤5 | 1x |
| Iron Sword | 80 | +5 | Subtraction | ≤5 | 1x |
| Steel Sword | 180 | +8 | Subtraction | ≤8 | 2x |
| Golden Sword | 400 | +12 | 3-Operand | ≤10 | 2x |

### Shield Stats

| Shield | Cost | Block Time | Block Attempts |
|--------|------|------------|----------------|
| Wooden Shield | 3 | 5 sec | 1 |
| Iron Shield | 100 | 6 sec | 2 |
| Steel Shield | 200 | 8 sec | 2 |
| Golden Shield | 450 | 10 sec | 3 |

### Problems Per Turn

| Level | Addition | Subtraction | 3-Operand | Total Base | With Pet/Sword |
|-------|----------|-------------|-----------|------------|----------------|
| 1 | 1 (≤5) | 0 | 0 | 1 | 2-3 |
| 2 | 2 (≤8) | 0 | 0 | 2 | 3-4 |
| 3 | 2 (≤8) | 1 (≤5) | 0 | 3 | 4-5 |
| 4 | 2 (≤8) | 1 (≤5) | 1 (≤8) | 4 | 5-6 |
| 5-10 | varies | varies | varies | 4 | 5-6 |

### Arena Configuration

**Arena Level 1 (5 waves, no healing between):**
1. Slime
2. Purple Demon
3. Slime × 2
4. Purple Demon + Slime
5. Purple Demon × 2

**Total enemy HP to clear:** 3 + 4 + 6 + 7 + 8 = **28 HP**
**Total enemy damage (if all hit):** ~10-15 damage across waves

### Coin System

| Source | Amount |
|--------|--------|
| Per battle (always) | 1 small copper |
| Enemy gold drop | Random in [coinMin, coinMax] |
| Level-up bonus | None (in current game) |
| Streak bonus | None (in current game) |

**Coin values:** Small copper = 1, Large copper = 2, Silver = 5, Gold = 10

### Guild Trial

| Parameter | Value |
|-----------|-------|
| Duration | 60 seconds |
| Required correct | 10 answers |
| Pass/Fail | Binary (no tiers in current game) |
| Reward | +1 level (+1 HP, +1 ATK, full heal) |

---

## Simulation Results (Arena-Based, Updated 2026-01-17)

The simulation now properly models the actual game loop:
1. **Enter Arena** → fight waves until hurt → retreat (or die)
2. **Return to Town** → get FREE heal + potion refill
3. **Buy gear** when affordable (shield 3 → potion 5 → sword 8)
4. **Retry Arena** with better stats/gear

### Summary by Accuracy

| Metric | High (95%) | Medium (75%) | Low (55%) |
|--------|------------|--------------|-----------|
| Waves to Level 5 | 22 | 21 | 21 |
| Waves to Level 10 | 72 | 63 | 58 |
| Deaths | 1 | 4 | 11 |
| Final Coins | 3450 | 2820 | 2435 |

**Note:** "Waves" counts arena waves completed, not individual arena attempts.

### Low Accuracy Detailed Results (50 runs)

| Metric | Value |
|--------|-------|
| Waves to Level 5 | 21 |
| Waves to Level 10 | 59 |
| Total Deaths | 10-11 |
| Average Accuracy | 55.0% |
| Final Coin Balance | ~2444 |
| Total Coins Earned | ~2618 |
| Total Coins Spent | 196 |

### Gear Progression (All Players)

| Item | Cost | Typical Purchase |
|------|------|------------------|
| Wooden Shield | 3 | After 1-2 arena attempts |
| Potion Subscription | 5 | After shield |
| Wooden Sword | 8 | After 2-3 arena attempts |
| Iron Sword | 80 | Mid-game (~level 5) |
| Iron Shield | 100 | Mid-game (~level 6) |

### Level Milestones (Low Accuracy)

| Level | Wave | Coins at Milestone | Trial Tier |
|-------|------|-------------------|------------|
| 2 | 1 | 15 | Silver |
| 3 | 5 | 99 | Silver |
| 4 | 11 | 190 | Silver |
| 5 | 21 | 400 | Silver |
| 6 | 31 | 696 | Silver |
| 7 | 38 | 1133 | Silver |
| 8 | 45 | 1567 | Silver |
| 9 | 52 | 2002 | Silver |
| 10 | 59 | 2444 | Silver |

### Bottlenecks Detected

| Issue | Frequency | Description |
|-------|-----------|-------------|
| Early arena deaths | ~47 runs | Dying at wave 2 (Purple Demon) at level 2 |
| Mid-game spikes | ~5 runs | Deaths at levels 6-8 when transitioning to Arena 2 |

---

## Analysis

### What the Simulation Now Models Correctly

1. ✅ **Arena mode** - 5 waves with NO healing between (except potions)
2. ✅ **Retreat mechanic** - Players retreat at 20% HP
3. ✅ **Town healing** - FREE full heal on town entry
4. ✅ **Potion subscription** - 5 coins once, refills FREE in town
5. ✅ **Gear progression** - Shield → Potion → Sword → Upgrades
6. ✅ **Deaths scale with skill** - Low (11) > Medium (4) > High (1)

### Key Findings

1. **Economy is healthy** - Players earn ~2500-3500 coins by level 10
   - Can afford all basic gear + upgrades
   - Journey supplies (50 coins) easily affordable

2. **Wave 2 is the skill gate** - Purple Demon (4 HP, 2 ATK)
   - Low-skill players frequently die here
   - This is intentional difficulty scaling

3. **Potion subscription is valuable** - For 5 coins:
   - Free refill every town visit
   - Enables deeper arena runs
   - High ROI purchase

4. **Arena 1 completion** - With basic gear + level 3-4:
   - High skill: Usually completes
   - Medium skill: Completes after 2-3 attempts
   - Low skill: May need 4-5 attempts

---

## Recommendations

### Balance is Generally Good

The current balance appears reasonable:
- Low-skill players CAN progress, just slower
- Gear prices are affordable
- Deaths happen but aren't punishing (FREE town heal)

### Potential Adjustments

1. **Consider tutorial for Purple Demon**
   - Many players die at wave 2 first time
   - Could show "Use your shield!" prompt

2. **Arena 2 transition may be steep**
   - Pink Beast at wave 1 (10 HP, 2 ATK)
   - Players going from Arena 1 → Arena 2 may struggle
   - Consider level-gating Arena 2 (require level 6?)

3. **Journey supplies cost is fine**
   - At level 5, players typically have 400+ coins
   - 50 coins is easily affordable

---

## Files Modified

### Simulation Code

```
src/simulation/
├── types.ts              # Game constants + town mechanics + potions
├── BattleSimulator.ts    # Battle outcome (correct damage formula)
├── ArenaSimulator.ts     # NEW: 5-wave arena with retreat/potion
├── ProgressionSimulator.ts # XP/level-up
├── EconomySimulator.ts   # Coin tracking
├── JourneySimulator.ts   # Journey mode simulation
└── GameSimulator.ts      # Main runner (arena-based loop)
```

### Run Commands

```bash
# All accuracy levels
npx tsx src/simulation/GameSimulator.ts --all

# Specific accuracy
npx tsx src/simulation/GameSimulator.ts --accuracy=low --level=10 --runs=100

# High accuracy detailed
npx tsx src/simulation/GameSimulator.ts --accuracy=high --level=10 --runs=100
```

---

## Validation Checklist

| Behavior | Expected | Simulation |
|----------|----------|------------|
| After 1 wave, can level up | Yes (20 XP) | ✅ Level 2 at wave 1 |
| Shield costs 3 coins | Yes | ✅ |
| Potion sub costs 5 coins | Yes | ✅ |
| Sword costs 8 coins | Yes | ✅ |
| Town heals for FREE | Yes | ✅ |
| Potion refills FREE if sub | Yes | ✅ |
| No healing between arena waves | Yes | ✅ |
| Retreat when HP low | Yes (20%) | ✅ |
| Low-skill players die more | Yes | ✅ (11 vs 1) |

---

## Next Steps

1. **Validate against real gameplay** - Compare with actual player sessions
2. **Add Arena 2/3 analysis** - Detailed breakdown of higher arenas
3. **Journey mode simulation** - Full journey with battles + puzzles
4. **Implement balance changes** - If any adjustments needed after validation
