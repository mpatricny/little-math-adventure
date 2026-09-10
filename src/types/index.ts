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
    arenaLevel: number;         // Highest unlocked global arena level (city-local levels are stored in encounters.json)
    currentBattle: number;      // 0-4 (5 battles per arena)
    playerHpAtStart: number;    // HP when arena started
    completedArenaLevels: number[];  // Tracks which arena levels have been completed
    waveResults?: ArenaWaveResult[]; // Index 0-4 for waves 1-5, tracks completion and perfect status
    waveResultsArenaLevel?: number;  // Which arena level the waveResults belong to (reset when different)
    /** Versioned encounter-keyed progress. Legacy waveResults remains dual-written during migration. */
    arenaProgressVersion?: 2;
    /** Stable encounter ID for the currently selected wave. */
    currentEncounterId?: string;
    /** Best historical result per encounter, retained across arena levels. */
    encounterResults?: Record<string, ArenaWaveResult>;
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

export type PreparationKind = 'sword' | 'shield';

export interface PreparationState {
    kind: PreparationKind | null;
    charges: number;
}

export interface PlayerState {
    puzzleProgress?: import('./puzzles').PuzzleProgress;
    name: string;
    characterType: CharacterType;
    level: number;
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
    /** Optional for save compatibility; normalized by PreparationSystem on load/use. */
    preparation?: PreparationState;
    potions: number;                  // Consumable potions for battle
    hasPotionSubscription: boolean;   // True once player buys potion at witch (enables auto-refill)
    pet: PetState | null;             // Active pet companion
    unlockedPets: string[];           // NEW: Enemy IDs defeated (unlocks purchase)
    perfectDefeats?: string[];        // Enemy IDs where flawless victory was achieved
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
    // === TRIAL HISTORY (mastery exams) ===
    trialHistory?: TrialHistory;
    // === STORY PROGRESS ===
    storyProgress?: StoryProgress;     // Track story milestones for visual storytelling
    underwaterProgress?: import('./underwater').UnderwaterProgress;
    // === TOWN PROGRESS ===
    townProgress?: TownProgress;       // Track building unlocks and progressive town growth
    // === CATACOMB TRIALS ===
    catacombPetUpgrades?: Record<string, number>;  // BandId → mastery upgrade count (0-4)
    // === DAILY LEARNING SUMMARY ===
    dailyProgressLog?: Record<string, {
        coinsEarned: number;
        manaEarned: number;
        crystalsEarned: number;
        milestones: string[];
    }>;
}

// ===== GUILD TRIAL SYSTEM =====
export type TrialTier = 'none' | 'bronze' | 'silver' | 'gold';

export interface TrialAttempt {
    level: number;           // Trial level (may differ from player level on retry)
    tier: TrialTier;
    correctCount: number;
    wrongCount: number;
    timestamp: number;
    isRetry: boolean;
    rewardsGiven: { hp: number; atk: number; mana: number };
}

export interface TrialHistory {
    attempts: TrialAttempt[];
    bestTiers: Record<number, TrialTier>;  // Best tier achieved per trial level
    failedTrialLevel: number | null;       // Fail block — must retry this level
    retryLevel: number | null;             // Retry for improvement (bronze/silver)
}

export interface TrialProblemResult {
    problemId: string;
    problem: MathProblem;
    wasCorrect: boolean;
    playerAnswer: number | null;
    correctAnswer: number;
    timeSpent: number;       // seconds spent on this problem
}

export interface TrialState {
    isActive: boolean;
    currentProblemIndex: number;     // 0-9
    totalProblems: number;           // 10
    timePerProblem: number;          // seconds per problem
    timeRemainingForProblem: number; // countdown for current problem
    correctCount: number;
    wrongCount: number;
    results: TrialProblemResult[];
    tier: TrialTier;
    phase: 'overview' | 'problem' | 'feedback' | 'results';
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
    // Mastery system
    masteryData?: MasteryData;  // Band/sub-atom mastery progression
}

// ===== MATH POOL SYSTEM =====
export interface MathProblemDef {
    id: string;              // e.g., "add_3_5" or "sub_7_2"
    operand1: number;
    operand2: number;
    operator: '+' | '-';
    answer: number;
    // Extended fields for diverse problem forms
    operand3?: number;
    operand4?: number;
    operator2?: string;
    operator3?: string;
    problemType?: 'standard' | 'missing_operand' | 'comparison' | 'comparison_eq_vs_eq' | 'three_operand';
}

export interface ProblemStats {
    correctCount: number;
    wrongCount: number;
    lastAttempt: number;        // timestamp
    mastered: boolean;          // true if correctly answered this session
    /** @deprecated Legacy save field; no longer affects mana rewards or problem selection. */
    manaCollected: number;
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
    operand4?: number;        // For equation-vs-equation: right side operand 2
    operator: MathOperator;
    operator2?: MathOperator; // Optional 2nd operator
    operator3?: MathOperator; // For equation-vs-equation: right side operator
    answer: number;
    choices: number[];        // 3 options (shuffled)
    showVisualHint: boolean;
    hintType: 'apples' | 'dots' | 'none';
    // Equipment bonus metadata
    damageMultiplier?: number;  // Damage multiplier (1 = normal, 2 = double, etc.)
    source?: 'player' | 'pet' | 'sword';  // Source of the problem for UI/tracking
    // Problem type (extended for mastery system)
    problemType?: 'standard' | 'missing_operand' | 'comparison' | 'comparison_eq_vs_eq';
    // Mastery problem key (if generated from mastery system)
    masteryKey?: string;        // e.g. "A1:3+2:result_unknown"
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
    | 'player_b_turn'      // Co-op: Player B's turn
    | 'player_b_math'      // Co-op: Player B's math board
    | 'player_b_attack'    // Co-op: Player B's attack
    | 'player_b_miss'      // Co-op: Player B's miss
    | 'pet_turn'           // Pet's turn after player (Player A's pet)
    | 'pet_math'           // Pet's math board
    | 'pet_attack'         // Pet executes attack
    | 'pet_b_turn'         // Co-op: Player B's pet turn
    | 'pet_b_math'         // Co-op: Player B's pet math
    | 'pet_b_attack'       // Co-op: Player B's pet attack
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
    playerBHp?: number;               // Co-op: Player B's HP
    playerBMaxHp?: number;            // Co-op: Player B's max HP
    enemies: BattleEnemy[];           // Array for multi-enemy support
    selectedEnemyIndex: number;       // Which enemy is targeted
    selectedEnemyIndexB?: number;     // Co-op: Player B's target
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
    goldReward: [number, number];  // [min, max]
    difficulty: number;            // Recommended player level
    /** Legacy fallback used by enemies not yet migrated to context-specific presentation. */
    scale?: number;
    /** Default scale in exploration/world scenes. */
    worldScale?: number;
    /** Default scale when rendered as a battle actor. */
    battleScale?: number;
    /** Battle-only correction relative to the configured spawn point. */
    battleOffsetX?: number;
    /** Battle-only correction relative to the configured spawn point. */
    battleOffsetY?: number;
    /** Transparent top padding above the full motion envelope, in source-frame pixels. */
    frameTopInset?: number;
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
    unlockedBuildings: string[];     // Building IDs that have been unlocked (condition met)
    revealedBuildings: string[];     // Building IDs visible to player (revealed one at a time)
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
    hasDefeatedVerdantGuardian: boolean;
    hasClaimedForestCrystal: boolean;
    hasInstalledForestCrystal: boolean;
    hasUnlockedSilverpond: boolean;
    hasSeenSilverpondQuest: boolean;
    hasFreedLakeFairy: boolean;
    hasWaterBreathingScale: boolean;
    hasSeenLakeFairyReward: boolean;
}

// ===== MASTERY SYSTEM =====
// Band/sub-atom mastery-based progression (replaces level-based system)

export type BandId = 'A' | 'B' | 'C' | 'D' | 'E';
export type SubAtomNumber = 1 | 2 | 3 | 4;
export type SubAtomId = `${BandId}${SubAtomNumber}`;
export type MasteryState = 'locked' | 'training' | 'secure' | 'fluent' | 'mastery';
export type ProblemForm = 'result_unknown' | 'missing_part' | 'compare_equation_vs_number' | 'compare_equation_vs_equation';
export type ExamType = 'sub_atom' | 'fluency_challenge' | 'mastery_challenge' | 'band_gate' | 'band_mastery';

export const ALL_BANDS: BandId[] = ['A', 'B', 'C', 'D', 'E'];
export const ALL_SUB_ATOM_NUMBERS: SubAtomNumber[] = [1, 2, 3, 4];
export const ALL_PROBLEM_FORMS: ProblemForm[] = ['result_unknown', 'missing_part', 'compare_equation_vs_number', 'compare_equation_vs_equation'];

/** A single attempt at solving a mastery problem */
export interface MasteryAttempt {
    timestamp: number;
    correct: boolean;
    responseTimeMs: number;
    context: 'battle' | 'battle_block' | 'battle_sword' | 'battle_pet'
        | 'shop_prep_sword' | 'shop_prep_shield'
        | 'mana_collection' | 'underwater_bell'
        | 'exam' | 'fluency' | 'mastery_challenge' | 'band_gate';
    sequenceIndex: number;      // globalSolveSequence at time of attempt
}

/** Tracks all attempts for a specific problem across all contexts */
export interface MasteryProblemRecord {
    problemKey: string;         // e.g. "A1:3+2:result_unknown"
    subAtomId: SubAtomId;
    form: ProblemForm;
    attempts: MasteryAttempt[];
}

/** State of a single sub-atom (e.g. A1, B3) */
export interface SubAtomState {
    id: SubAtomId;
    state: MasteryState;
    successfulSolves: number;
    examBestMedal: TrialTier | null;
    fluencyChallengeResult: 'pass' | 'fail' | null;
    masteryChallengeResult: 'pass' | 'fail' | null;
    fightsSinceSeen: number;
}

/** State of a band (A-E) */
export interface BandState {
    id: BandId;
    state: MasteryState;
    gateExamBestMedal: TrialTier | null;
    bandMasteryChallengeResult: 'pass' | 'fail' | null;
}

/** Root mastery data structure stored in MathStats */
export interface MasteryData {
    bands: Record<BandId, BandState>;
    subAtoms: Record<SubAtomId, SubAtomState>;
    problemRecords: Record<string, MasteryProblemRecord>;
    globalSolveSequence: number;
    fightCount: number;
    retryPool: string[];          // wrong answers pending retry
    slowPool: string[];           // slow answers pending faster solve
    currentPool: string[];        // current 10-problem pool (rolling, persists across fights)
    currentPoolIndex: number;     // next problem to draw from currentPool
    lastPoolProblems: string[];   // problems from previous pool (for dedup)
    lastStruggleOfferFight: number;   // fightCount when last struggle offer was shown
    coopAutoPromotionBases: Record<string, number>; // exam/challenge target key -> baseline solve sequence
    selectedStartBand?: BandId;       // band chosen at game start (optional for old saves)
}

/** Definition of a single problem in the mastery database */
export interface ProblemDefinition {
    key: string;                    // e.g. "A1:3+2:result_unknown"
    bandId: BandId;
    subAtomId: SubAtomId;
    form: ProblemForm;
    operand1: number;
    operand2: number;
    operand3?: number;              // for 3-operand or comparison right side
    operand4?: number;              // for equation-vs-equation right side
    operator: '+' | '-';
    operator2?: '+' | '-';          // for 3-operand
    operator3?: '+' | '-';          // for equation-vs-equation right side
    answer: number;                 // correct answer (or 0/1/2 for </=/>)
}

/** Exam configuration for different exam types */
export interface ExamConfig {
    type: ExamType;
    itemCount: number;
    timePerItem: number;            // seconds
    bronzeThreshold?: number;       // min correct for bronze (medal exams)
    silverThreshold?: number;       // min correct for silver
    goldThreshold?: number;         // min correct for gold
    passThreshold?: number;         // min correct to pass (pass/fail exams)
}

export const EXAM_CONFIGS: Record<ExamType, ExamConfig> = {
    sub_atom: { type: 'sub_atom', itemCount: 8, timePerItem: 15, bronzeThreshold: 5, silverThreshold: 6, goldThreshold: 7 },
    fluency_challenge: { type: 'fluency_challenge', itemCount: 10, timePerItem: 15, passThreshold: 8 },
    mastery_challenge: { type: 'mastery_challenge', itemCount: 10, timePerItem: 15, passThreshold: 9 },
    band_gate: { type: 'band_gate', itemCount: 12, timePerItem: 15, bronzeThreshold: 8, silverThreshold: 10, goldThreshold: 11 },
    band_mastery: { type: 'band_mastery', itemCount: 14, timePerItem: 15, passThreshold: 12 },
};

// ===== CATACOMB TRIAL SYSTEM =====
export interface CatacombTrialConfig {
    examType: 'fluency_challenge' | 'mastery_challenge';
    subAtomId: SubAtomId;
    creatureHp: number;      // Matches configured item count (currently 10)
    playerLives: number;     // 3 (fluency) or 2 (mastery)
    chargeTime: number;      // 15 seconds
    enemyId: string;         // creature enemy ID (per-band)
    backgroundKey: string;   // catacomb bg texture
    bandId: BandId;
}
