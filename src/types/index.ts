// ===== GAME STATE =====
export interface GameState {
    player: PlayerState;
    mathStats: MathStats;
    inventory: InventoryState;
    settings: GameSettings;
}

export interface GameSettings {
    soundEnabled: boolean;
    musicEnabled: boolean;
}

// ===== CURRENCY SYSTEM =====
export interface CoinCurrency {
    copper: number;   // Value: 1
    silver: number;   // Value: 5
    gold: number;     // Value: 10
    pouch: number;    // Value: 100
}

// ===== DIAMOND SYSTEM =====
export interface DiamondInventory {
    common: number;   // Běžný diamant (blue 💎)
    red: number;      // Červený diamant (❤️)
    green: number;    // Zelený diamant (💚)
}

export type DiamondType = 'common' | 'red' | 'green';

export interface DiamondCost {
    common: number;
    red: number;
    green: number;
}

export interface TransmutationRecipe {
    input: [DiamondType, DiamondType];  // Two diamonds required
    output: DiamondType;                 // Result diamond type
}

// ===== ARENA SYSTEM =====
export interface ArenaWaveResult {
    completed: boolean;       // Wave was completed
    perfectWave: boolean;     // No wrong answers during wave
    crystalsEarned: number;   // 1 (base) or 2 (base + perfect bonus)
}

export interface ArenaState {
    isActive: boolean;
    arenaLevel: number;         // Which arena level (1-5)
    currentBattle: number;      // 0-4 (5 battles per arena)
    playerHpAtStart: number;    // HP when arena started
    completedArenaLevels: number[];  // Tracks which arena levels have been completed
    waveResults?: ArenaWaveResult[]; // Index 0-4 for waves 1-5, tracks completion and perfect status
    waveResultsArenaLevel?: number;  // Which arena level the waveResults belong to (reset when different)
}

// ===== PET SYSTEM =====
export interface PetState {
    id: string;
    name: string;
}

export interface PetDefinition {
    id: string;              // e.g., 'pet_slime', 'pet_demon'
    name: string;            // Display name
    unlockedByEnemy?: string; // Enemy ID that unlocks purchase option
    unlockedByArenaLevel?: number;  // Arena level that unlocks purchase option
    unlockedByArenaLevels?: number[];  // Requires ALL listed arenas to be completed
    requiredAmulet: {        // Crystal required to bind the pet
        tier: CrystalTier;
        value: number;
    };
    requiredSpecialCrystal?: string;  // Additional special crystal required (for compound cost pets)
    spriteKey: string;       // Monster sprite to use for idle
    animPrefix: string;      // Animation prefix (e.g., 'slime', 'pink', 'purple', 'leafy')
    // Pet math problem (bonus attack)
    mathProblemType?: 'addition' | 'subtraction' | 'multiplication' | 'threeOperand';  // Problem type
    mathProblemMax?: number;     // Max result for pet problem
    damageMultiplier?: number;   // Damage multiplier (1 = normal, 2 = double, etc.)
    scale?: number;              // Character scale multiplier
    attackEffect?: {
        type: 'lightning' | 'fire' | 'ice';
        tint?: string;
    };
}

export type CharacterType = 'girl_knight' | 'boy_knight';

export interface PlayerState {
    name: string;
    characterType: CharacterType;
    level: number;
    xp: number;
    xpToNextLevel: number;
    hp: number;
    maxHp: number;
    coins: CoinCurrency;              // Replaces gold: number
    diamonds: DiamondInventory;       // LEGACY: Multi-tier diamond inventory (migrated to crystals)
    status: 'healthy' | 'přizabitý';  // Health status
    attack: number;
    defense: number;
    equippedWeapon: string | null;
    equippedArmor: string | null;
    equippedShield: string | null;
    equippedHelmet: string | null;
    readyToPromote: boolean;          // True when XP is capped and player must visit Guild
    potions: number;                  // Consumable potions for battle
    hasPotionSubscription: boolean;   // True once player buys potion at witch (enables auto-refill)
    pet: PetState | null;             // Active pet companion
    unlockedPets: string[];           // NEW: Enemy IDs defeated (unlocks purchase)
    ownedPets: string[];              // NEW: Pet IDs player has bought
    activePet: string | null;         // NEW: Currently equipped pet ID
    arena: ArenaState;                // Arena progress tracking
    lastBuildingId?: string;          // Track last visited building for return position
    lastTestingBuildingId?: string;   // Track last visited building in testing scene
    // === CRYSTAL & MANA SYSTEM ===
    crystals?: CrystalInventory;      // Crystal inventory with numeric values
    mana?: number;                    // Mana count for Crystal Forge operations (no max limit)
    groundCrystals?: Crystal[];       // Overflow crystals dropped on ground
    defeatedBosses?: string[];        // Track defeated boss IDs for progression
    // === STORY PROGRESS ===
    storyProgress?: StoryProgress;     // Track story milestones for visual storytelling
    // === TOWN PROGRESS ===
    townProgress?: TownProgress;       // Track building unlocks and progressive town growth
}

// ===== GUILD TRIAL SYSTEM =====
export interface TrialState {
    isActive: boolean;
    timeRemaining: number;    // seconds
    correctCount: number;
    wrongCount: number;
    totalProblems: number;
}

export interface MathStats {
    totalAttempts: number;
    correctAnswers: number;
    recentResults: boolean[];  // Last 10 (sliding window)
    currentDifficulty: number; // 1-10
    highestDifficulty: number; // Track mastery
    // Pool system
    problemStats: Record<string, ProblemStats>;  // keyed by problem ID
    currentPool: string[];                        // IDs of active problems
    poolCycle: number;                            // how many times pool reset
    // Daily tracking
    dailyAttempts: number;     // attempts made today
    lastAttemptDate: string;   // "YYYY-MM-DD" to detect day change
}

// ===== MATH POOL SYSTEM =====
export interface MathProblemDef {
    id: string;              // e.g., "add_3_5" or "sub_7_2"
    operand1: number;
    operand2: number;
    operator: '+' | '-';
    answer: number;
}

export interface ProblemStats {
    correctCount: number;
    wrongCount: number;
    lastAttempt: number;        // timestamp
    mastered: boolean;          // true if correctly answered this session
    manaCollected: number;      // 0, 1, 2, or 3 (tracks collected mana at 5x, 10x, 20x thresholds)
}

export interface InventoryState {
    items: InventoryItem[];
}

export interface InventoryItem {
    id: string;
    quantity: number;
}

// ===== MATH SYSTEM =====
export type MathOperator = '+' | '-' | '*';

export interface MathProblem {
    id: string;               // Problem ID for tracking (e.g., "add_3_5")
    operand1: number;
    operand2: number;
    operand3?: number;        // Optional 3rd operand (or right side of comparison)
    operator: MathOperator;
    operator2?: MathOperator; // Optional 2nd operator
    answer: number;
    choices: number[];        // 3 options (shuffled)
    showVisualHint: boolean;
    hintType: 'apples' | 'dots' | 'none';
    // Equipment bonus metadata
    damageMultiplier?: number;  // Damage multiplier (1 = normal, 2 = double, etc.)
    source?: 'player' | 'pet' | 'sword';  // Source of the problem for UI/tracking
    // Boss phase problem type
    problemType?: 'standard' | 'missing_operand' | 'comparison';
}

export interface DifficultyConfig {
    level: number;
    minNumber: number;
    maxNumber: number;
    operators: MathOperator[];
    allowThreeOperands: boolean; // New flag
    showVisualHint: boolean;
    hintFadeDelay: number;    // ms before hint fades (0 = always show)
}

// ===== BATTLE SYSTEM =====
export type BattlePhase =
    | 'start'
    | 'player_turn'
    | 'player_math'
    | 'player_attack'
    | 'player_miss'
    | 'pet_turn'           // Pet's turn after player
    | 'pet_math'           // Pet's math board
    | 'pet_attack'         // Pet executes attack
    | 'enemy_turn'
    | 'enemy_attack'
    | 'player_defend'
    | 'victory'
    | 'defeat';

// Configuration for problems per level
export interface LevelAttackConfig {
    level: number;
    additionCount: number;      // Number of addition problems
    additionMax: number;        // Max result for additions
    subtractionCount: number;   // Number of subtraction problems
    subtractionMax: number;     // Max result for subtractions
    threeOperandCount: number;  // Number of 3-operand problems
    threeOperandMax: number;    // Max result for 3-operand
}

// Enemy instance in battle (for multi-enemy support)
export interface BattleEnemy {
    id: string;
    name: string;
    spriteKey: string;
    hp: number;
    maxHp: number;
    attack: number;
    defense: number;
}

export interface BattleState {
    phase: BattlePhase;
    playerHp: number;
    enemies: BattleEnemy[];           // Array for multi-enemy support
    selectedEnemyIndex: number;       // Which enemy is targeted
    currentProblems: MathProblem[];   // Array of problems for current attack
    currentProblemIndex: number;      // Which problem is being solved
    damageDealt: number;              // Damage accumulated this turn
    turnCount: number;
}

// ===== ENEMIES =====
export interface EnemyDefinition {
    id: string;
    name: string;
    spriteKey: string;
    animPrefix?: string;           // Animation prefix (e.g., 'slime', 'pink', 'purple')
    hp: number;
    attack: number;
    defense: number;
    xpReward: number;
    goldReward: [number, number];  // [min, max]
    difficulty: number;            // Recommended player level
    scale?: number;                // Character scale multiplier
}

// ===== ITEMS =====
export type ItemType = 'consumable' | 'weapon' | 'armor' | 'shield' | 'helmet';

export interface ItemDefinition {
    id: string;
    name: string;
    type: ItemType;
    description: string;
    price: number;
    iconFrame: number;
    spriteKey?: string;  // Which spritesheet (e.g., 'shop-swords')
    // Consumable effects
    healAmount?: number;
    // Equipment stats
    attackBonus?: number;
    defenseBonus?: number;
    // Shield specific (block mechanic)
    blockTime?: number;      // Seconds to solve math problems
    blockAttempts?: number;  // Max problems to attempt
    // Sword math problem (bonus attack)
    mathProblemType?: 'addition' | 'subtraction' | 'multiplication' | 'threeOperand';  // Problem type for sword bonus
    mathProblemMax?: number;     // Max result for sword problem
    damageMultiplier?: number;   // Damage multiplier (1 = normal, 2 = double, etc.)
    // Shield-specific math config
    mathProblemTypes?: ('addition' | 'subtraction' | 'multiplication')[];
    mathProblemMin?: number;
}

// ===== TOWN SCENE =====
export interface BuildingConfig {
    id: string;
    name: string;
    textureKey: string;
    x: number;
}

export type TownState = 'exploring' | 'entering_building' | 'inside';

// ===== SAVE SYSTEM =====
export interface SaveSlotMeta {
    slotIndex: number;           // 0-7
    isEmpty: boolean;
    characterName: string;
    characterType: CharacterType;
    level: number;
    totalProblemsSolved: number; // from mathStats.totalAttempts
    lastPlayed: number;          // timestamp
}

export interface SaveSlotData {
    player: PlayerState;
    mathStats: MathStats;
    timestamp: number;
}

// ===== CRYSTAL SYSTEM =====
export type CrystalTier = 'shard' | 'fragment' | 'prism' | 'core' | 'special_porcupine';

export interface Crystal {
    id: string;
    tier: CrystalTier;
    value: number;
    locked: boolean;
    createdAt: number;
}

export interface CrystalInventory {
    crystals: Crystal[];
    maxCapacity: number;
}

// ===== MANA SYSTEM =====
// Mana is just a count (like crystals), no max limit
// Earned by solving math problems in Guild, spent in Crystal Forge

// ===== TOWN PROGRESS SYSTEM =====
// Tracks building unlocks and progressive town growth
export interface TownProgress {
    unlockedBuildings: string[];     // Building IDs that have been unlocked
    visitedBuildings: string[];      // Building IDs player has entered (clears NEW badge)
    totalWavesCompleted: number;     // Cumulative first-time arena wave completions
    wavesAfterForgeUnlock: number;   // Waves completed after Crystal Forge unlocked (Shop trigger)
}

// ===== STORY PROGRESS SYSTEM =====
// Tracks story milestones for visual storytelling (picture dialogs)
export interface StoryProgress {
    hasCompletedIntro: boolean;        // Comic + Crash Site tutorial done
    hasSeenArenaExplanation: boolean;  // Post-arena hints
    hasSeenPetUnlockHint: boolean;     // First pet freed
    hasSeenShopHint: boolean;          // Equipment hint
    hasSeenForgeIntro: boolean;        // Crystal Forge first visit
    hasSeenPythiaIntro: boolean;       // Pythia's Workshop first visit
    hasSeenPostArena1: boolean;        // After Arena 1 complete
    hasSeenPostArena2: boolean;        // After Arena 2 complete
}
