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

export interface PlayerState {
    name: string;
    level: number;
    xp: number;
    xpToNextLevel: number;
    hp: number;
    maxHp: number;
    gold: number;
    status: 'healthy' | 'přizabitý';  // Health status
    attack: number;
    defense: number;
    equippedWeapon: string | null;
    equippedArmor: string | null;
}

export interface MathStats {
    totalAttempts: number;
    correctAnswers: number;
    recentResults: boolean[];  // Last 10 (sliding window)
    currentDifficulty: number; // 1-10
    highestDifficulty: number; // Track mastery
}

export interface InventoryState {
    items: InventoryItem[];
}

export interface InventoryItem {
    id: string;
    quantity: number;
}

// ===== MATH SYSTEM =====
export type MathOperator = '+' | '-';

export interface MathProblem {
    operand1: number;
    operand2: number;
    operator: MathOperator;
    answer: number;
    choices: number[];        // 3 options (shuffled)
    showVisualHint: boolean;
    hintType: 'apples' | 'dots' | 'none';
}

export interface DifficultyConfig {
    level: number;
    minNumber: number;
    maxNumber: number;
    operators: MathOperator[];
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
    | 'enemy_turn'
    | 'enemy_attack'
    | 'player_defend'
    | 'victory'
    | 'defeat';

export interface BattleState {
    phase: BattlePhase;
    playerHp: number;
    enemyHp: number;
    enemyMaxHp: number;
    currentProblem: MathProblem | null;
    turnCount: number;
}

// ===== ENEMIES =====
export interface EnemyDefinition {
    id: string;
    name: string;
    spriteKey: string;
    hp: number;
    attack: number;
    defense: number;
    xpReward: number;
    goldReward: [number, number];  // [min, max]
    difficulty: number;            // Recommended player level
}

// ===== ITEMS =====
export type ItemType = 'consumable' | 'weapon' | 'armor';

export interface ItemDefinition {
    id: string;
    name: string;
    type: ItemType;
    description: string;
    price: number;
    iconFrame: number;
    // Consumable effects
    healAmount?: number;
    // Equipment stats
    attackBonus?: number;
    defenseBonus?: number;
}
