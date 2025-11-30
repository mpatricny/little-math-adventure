# Little Math Adventure - Implementation Plan

## Decision: Migrate from Godot to Phaser 3

### Rationale
| Factor | Godot HTML5 | Phaser 3 |
|--------|-------------|----------|
| Export size | ~25-40 MB | ~1 MB |
| Load time | 5-15 sec | <1 sec |
| Mobile browser support | Inconsistent | Excellent |
| WebGL requirements | WebGL2 (excludes older devices) | WebGL1 fallback |

**Verdict:** Phaser 3 is the right choice for a kids' browser game where fast loading and broad device compatibility matter.

---

## Tech Stack (2025 Best Practices)

```
Phaser 3.87.0 + TypeScript 5.6 + Vite 6
```

**Base template:** [phaserjs/template-vite-ts](https://github.com/phaserjs/template-vite-ts)

---

## Project Structure

```
/little-math-adventure
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── public/
│   └── assets/
│       ├── sprites/
│       │   ├── knight-attack.png      (from Godot)
│       │   ├── slime.png              (from Godot)
│       │   └── visual-hints/          (apples, dots for counting)
│       ├── backgrounds/
│       │   ├── field.png              (from Godot)
│       │   ├── town.png               (new)
│       │   └── shop.png               (new)
│       ├── ui/
│       │   ├── math-board.png         (from Godot)
│       │   ├── buttons.png
│       │   └── icons.png
│       └── audio/
│           ├── hit.wav
│           ├── miss.wav
│           └── victory.wav
└── src/
    ├── main.ts                        # Phaser config & game init
    ├── scenes/
    │   ├── BootScene.ts               # Asset preloading
    │   ├── MenuScene.ts               # Main menu
    │   ├── TownScene.ts               # Hub (shop, heal, guild)
    │   ├── BattleScene.ts             # Combat
    │   └── VictoryScene.ts            # Post-battle rewards
    ├── ui/
    │   ├── MathBoard.ts               # Math problem overlay
    │   ├── HUD.ts                     # HP, XP, gold display
    │   └── ShopUI.ts                  # Shop interface
    ├── systems/
    │   ├── MathEngine.ts              # Problem generation + adaptation
    │   ├── ProgressionSystem.ts       # XP, leveling, unlocks
    │   └── SaveSystem.ts              # LocalStorage persistence
    ├── entities/
    │   ├── Hero.ts                    # Player character
    │   └── Enemy.ts                   # Monster base class
    ├── data/
    │   ├── enemies.json               # Enemy definitions
    │   └── items.json                 # Shop items, equipment
    └── types/
        └── index.ts                   # TypeScript interfaces
```

---

## Core Systems Design

### 1. MathEngine (Adaptive Difficulty)

```typescript
interface MathProblem {
  operand1: number;
  operand2: number;
  operator: '+' | '-';
  answer: number;
  visualHint: boolean;
  choices: number[];  // 3 options including correct answer
}

interface PlayerMathStats {
  totalAttempts: number;
  correctAnswers: number;
  recentResults: boolean[];  // Last 10 attempts (sliding window)
  currentDifficulty: number; // 1-10 scale
}
```

**Adaptation Logic:**
- Track last 10 attempts in sliding window
- If success rate < 50%: decrease difficulty (smaller numbers, show hints)
- If success rate > 80%: increase difficulty (larger numbers, hide hints)
- Never go below level 1 or above player's hero level

### 2. Battle Flow

```
┌─────────────┐
│ BattleScene │
└──────┬──────┘
       │
       ▼
┌──────────────┐    ┌─────────────┐
│ Player Turn  │───▶│  MathBoard  │
│ (ATTACK btn) │    │  appears    │
└──────────────┘    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
       ┌─────────────┐          ┌─────────────┐
       │   Correct   │          │   Wrong     │
       │ Hero attacks│          │ Hero misses │
       │ Enemy -HP   │          │ Show answer │
       └─────────────┘          └─────────────┘
              │                         │
              └────────────┬────────────┘
                           ▼
                   ┌──────────────┐
                   │ Enemy Turn   │
                   │ (DEFEND btn) │
                   └──────┬───────┘
                          │
                          ▼
                   ┌─────────────┐
                   │ Quick math  │
                   │ for defense │
                   └─────────────┘
```

### 3. Town Hub (Simplified for MVP)

Three clickable areas:
1. **Inn** - Heal HP (free, but shows "You have X/Y HP. Heal?" confirmation)
2. **Shop** - Buy potions/weapons with comparison math
3. **Arena** - Start battle (select enemy difficulty)

---

## Implementation Phases

### Phase 1: Project Setup & Battle Core
1. Initialize Phaser + Vite + TypeScript project
2. Port assets from Godot (sprites, backgrounds)
3. Create BootScene (asset loading)
4. Create BattleScene with static positions (Hero left, Enemy right)
5. Implement basic attack animation (spacebar → knight attack → slime hit)

### Phase 2: Math Integration
1. Build MathEngine with problem generation
2. Create MathBoard UI overlay
3. Connect: Attack → MathBoard → Correct/Wrong → Animation
4. Add visual hints (apple/dot sprites) for low levels
5. Implement wrong-answer feedback (show correct answer visually)

### Phase 3: Adaptive System & Combat Polish
1. Add PlayerMathStats tracking
2. Implement sliding-window adaptation algorithm
3. Add HP system (hero and enemy)
4. Implement defense mechanic (quick math on enemy turn)
5. Create VictoryScene with XP/gold rewards

### Phase 4: Progression & Town
1. Build ProgressionSystem (XP → Level, unlocks)
2. Create TownScene with 3 areas
3. Implement Shop with comparison-math mechanic
4. Build SaveSystem (localStorage)
5. Add inventory UI

### Phase 5: Polish & Content
1. Add more enemies (different HP, attack patterns)
2. Sound effects and basic music
3. Mobile touch controls
4. Victory/defeat animations
5. Tutorial for first-time players

---

## Assets to Migrate from Godot

| Godot File | Phaser Location | Notes |
|------------|-----------------|-------|
| `Sprites/knight attack sprite.png` | `public/assets/sprites/knight-attack.png` | 8-frame spritesheet |
| `Sprites/blob attack.png` | `public/assets/sprites/slime.png` | 2-frame animation |
| `field.png` | `public/assets/backgrounds/field.png` | Battle background |
| `math board.png` | `public/assets/ui/math-board.png` | Math overlay BG |

---

## New Assets Needed

- Visual hint sprites (apples, dots, stars) for counting
- Town background
- Shop interior background
- UI buttons (Attack, Defend, answer options)
- HP/XP bar graphics
- Potion and weapon icons
- Sound effects (hit, miss, victory, purchase)

---

## GDD Simplifications for MVP

1. **Skip world map** - Go directly from Town → Battle (enemy selection in Arena)
2. **Skip crafting/crystals** - Just gold currency for now
3. **Skip dungeons** - Single battle mode, no exploration
4. **Defense simplified** - "Click largest number" is fine for MVP
5. **No monetization yet** - Add later when core loop is fun

---

## Key Technical Decisions

1. **No React/Vue** - Pure Phaser scenes, simpler for game-focused UI
2. **LocalStorage for saves** - No backend needed for MVP
3. **Spritesheet animations** - Use Phaser's built-in animation system
4. **Scene-based architecture** - Each game state is a Phaser Scene
5. **JSON data files** - Enemies and items defined in data files, easy to expand

---

## Detailed Implementation Guide

### Phase 1: Project Setup & Battle Core

#### Step 1.1: Initialize Project

```bash
# Clone official template
npx degit phaserjs/template-vite-ts little-math-adventure-phaser
cd little-math-adventure-phaser
npm install
```

#### Step 1.2: Configure package.json

```json
{
  "name": "little-math-adventure",
  "version": "0.1.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "phaser": "^3.87.0"
  },
  "devDependencies": {
    "typescript": "~5.6.2",
    "vite": "^6.0.5"
  }
}
```

#### Step 1.3: Create Type Definitions (`src/types/index.ts`)

```typescript
// ===== GAME STATE =====
export interface GameState {
  player: PlayerState;
  mathStats: MathStats;
  inventory: InventoryState;
  settings: GameSettings;
}

export interface PlayerState {
  name: string;
  level: number;
  xp: number;
  xpToNextLevel: number;
  hp: number;
  maxHp: number;
  gold: number;
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
```

#### Step 1.4: Main Entry Point (`src/main.ts`)

```typescript
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { TownScene } from './scenes/TownScene';
import { BattleScene } from './scenes/BattleScene';
import { VictoryScene } from './scenes/VictoryScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,  // WebGL with Canvas fallback
  width: 800,
  height: 600,
  parent: 'game-container',
  backgroundColor: '#2d2d2d',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, MenuScene, TownScene, BattleScene, VictoryScene],
};

new Phaser.Game(config);
```

#### Step 1.5: Boot Scene - Asset Loading (`src/scenes/BootScene.ts`)

```typescript
import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Show loading progress
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const progressBar = this.add.graphics();
    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x222222, 0.8);
    progressBox.fillRect(width / 2 - 160, height / 2 - 25, 320, 50);

    this.load.on('progress', (value: number) => {
      progressBar.clear();
      progressBar.fillStyle(0x44aa44, 1);
      progressBar.fillRect(width / 2 - 150, height / 2 - 15, 300 * value, 30);
    });

    // === SPRITES ===
    // Knight: 8 frames, each 256x256
    this.load.spritesheet('knight', 'assets/sprites/knight-attack.png', {
      frameWidth: 256,
      frameHeight: 256,
    });

    // Slime: 2 frames for idle
    this.load.spritesheet('slime', 'assets/sprites/slime.png', {
      frameWidth: 64,  // Adjust based on actual sprite
      frameHeight: 64,
    });

    // Visual hints for math
    this.load.spritesheet('hints', 'assets/sprites/visual-hints.png', {
      frameWidth: 32,
      frameHeight: 32,
    });

    // === BACKGROUNDS ===
    this.load.image('bg-battle', 'assets/backgrounds/field.png');
    this.load.image('bg-town', 'assets/backgrounds/town.png');
    this.load.image('bg-shop', 'assets/backgrounds/shop.png');

    // === UI ===
    this.load.image('math-board', 'assets/ui/math-board.png');
    this.load.spritesheet('buttons', 'assets/ui/buttons.png', {
      frameWidth: 120,
      frameHeight: 50,
    });
    this.load.spritesheet('icons', 'assets/ui/icons.png', {
      frameWidth: 32,
      frameHeight: 32,
    });

    // === AUDIO ===
    this.load.audio('sfx-hit', 'assets/audio/hit.wav');
    this.load.audio('sfx-miss', 'assets/audio/miss.wav');
    this.load.audio('sfx-victory', 'assets/audio/victory.wav');
    this.load.audio('sfx-correct', 'assets/audio/correct.wav');
    this.load.audio('sfx-wrong', 'assets/audio/wrong.wav');

    // === DATA ===
    this.load.json('enemies', 'assets/data/enemies.json');
    this.load.json('items', 'assets/data/items.json');
  }

  create(): void {
    // Create global animations
    this.createAnimations();

    // Go to menu
    this.scene.start('MenuScene');
  }

  private createAnimations(): void {
    // Knight attack animation (8 frames)
    this.anims.create({
      key: 'knight-attack',
      frames: this.anims.generateFrameNumbers('knight', { start: 0, end: 7 }),
      frameRate: 12,
      repeat: 0,
    });

    // Knight idle (first frame)
    this.anims.create({
      key: 'knight-idle',
      frames: [{ key: 'knight', frame: 0 }],
      frameRate: 1,
    });

    // Slime idle animation (2 frames, looping)
    this.anims.create({
      key: 'slime-idle',
      frames: this.anims.generateFrameNumbers('slime', { start: 0, end: 1 }),
      frameRate: 3,
      repeat: -1,
    });

    // Slime hurt (flash effect handled in code)
    this.anims.create({
      key: 'slime-hurt',
      frames: [{ key: 'slime', frame: 0 }],
      frameRate: 1,
    });
  }
}
```

#### Step 1.6: Battle Scene - Core Structure (`src/scenes/BattleScene.ts`)

```typescript
import Phaser from 'phaser';
import { BattleState, BattlePhase, EnemyDefinition } from '../types';
import { MathEngine } from '../systems/MathEngine';
import { MathBoard } from '../ui/MathBoard';
import { HUD } from '../ui/HUD';

export class BattleScene extends Phaser.Scene {
  // Sprites
  private hero!: Phaser.GameObjects.Sprite;
  private enemy!: Phaser.GameObjects.Sprite;

  // UI Components
  private mathBoard!: MathBoard;
  private hud!: HUD;
  private attackButton!: Phaser.GameObjects.Container;

  // Systems
  private mathEngine!: MathEngine;

  // State
  private battleState!: BattleState;
  private currentEnemy!: EnemyDefinition;

  constructor() {
    super({ key: 'BattleScene' });
  }

  init(data: { enemyId: string }): void {
    // Get enemy data from JSON
    const enemies = this.cache.json.get('enemies') as EnemyDefinition[];
    this.currentEnemy = enemies.find(e => e.id === data.enemyId) || enemies[0];

    // Initialize battle state
    this.battleState = {
      phase: 'start',
      playerHp: this.registry.get('playerHp') || 100,
      enemyHp: this.currentEnemy.hp,
      enemyMaxHp: this.currentEnemy.hp,
      currentProblem: null,
      turnCount: 0,
    };
  }

  create(): void {
    // Background
    this.add.image(400, 300, 'bg-battle').setDisplaySize(800, 600);

    // Hero (left side)
    this.hero = this.add.sprite(150, 400, 'knight')
      .setScale(0.5)
      .play('knight-idle');

    // Enemy (right side)
    this.enemy = this.add.sprite(650, 400, 'slime')
      .setScale(2)
      .play('slime-idle');

    // Initialize systems
    this.mathEngine = new MathEngine(this.registry);

    // Create UI
    this.hud = new HUD(this, this.battleState);
    this.mathBoard = new MathBoard(this, this.onAnswerSelected.bind(this));
    this.createAttackButton();

    // Start battle
    this.time.delayedCall(500, () => this.setPhase('player_turn'));
  }

  private createAttackButton(): void {
    const button = this.add.rectangle(400, 550, 150, 50, 0x44aa44)
      .setInteractive({ useHandCursor: true });

    const text = this.add.text(400, 550, 'ÚTOK', {
      fontSize: '24px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.attackButton = this.add.container(0, 0, [button, text]);

    button.on('pointerdown', () => this.onAttackClicked());
    button.on('pointerover', () => button.setFillStyle(0x55bb55));
    button.on('pointerout', () => button.setFillStyle(0x44aa44));
  }

  private setPhase(phase: BattlePhase): void {
    this.battleState.phase = phase;

    switch (phase) {
      case 'player_turn':
        this.attackButton.setVisible(true);
        break;

      case 'player_math':
        this.attackButton.setVisible(false);
        this.battleState.currentProblem = this.mathEngine.generateProblem();
        this.mathBoard.show(this.battleState.currentProblem);
        break;

      case 'player_attack':
        this.playHeroAttack();
        break;

      case 'player_miss':
        this.playHeroMiss();
        break;

      case 'enemy_turn':
        this.time.delayedCall(500, () => this.playEnemyAttack());
        break;

      case 'victory':
        this.onVictory();
        break;

      case 'defeat':
        this.onDefeat();
        break;
    }
  }

  private onAttackClicked(): void {
    if (this.battleState.phase === 'player_turn') {
      this.setPhase('player_math');
    }
  }

  private onAnswerSelected(isCorrect: boolean): void {
    this.mathBoard.hide();
    this.mathEngine.recordResult(isCorrect);

    if (isCorrect) {
      this.setPhase('player_attack');
    } else {
      this.setPhase('player_miss');
    }
  }

  private playHeroAttack(): void {
    this.hero.play('knight-attack');

    this.hero.once('animationcomplete', () => {
      // Damage enemy
      const damage = this.registry.get('playerAttack') || 10;
      this.battleState.enemyHp -= damage;
      this.hud.updateEnemyHp(this.battleState.enemyHp, this.battleState.enemyMaxHp);

      // Enemy hit effect
      this.sound.play('sfx-hit');
      this.tweens.add({
        targets: this.enemy,
        tint: 0xff0000,
        duration: 100,
        yoyo: true,
        onComplete: () => this.enemy.clearTint(),
      });

      this.hero.play('knight-idle');

      // Check victory
      if (this.battleState.enemyHp <= 0) {
        this.setPhase('victory');
      } else {
        this.setPhase('enemy_turn');
      }
    });
  }

  private playHeroMiss(): void {
    this.sound.play('sfx-miss');

    // Hero stumbles animation
    this.tweens.add({
      targets: this.hero,
      x: this.hero.x - 20,
      duration: 100,
      yoyo: true,
      ease: 'Bounce',
      onComplete: () => this.setPhase('enemy_turn'),
    });

    // Show correct answer
    this.mathBoard.showCorrectAnswer(this.battleState.currentProblem!);
  }

  private playEnemyAttack(): void {
    // Enemy attack animation
    this.tweens.add({
      targets: this.enemy,
      x: this.enemy.x - 100,
      duration: 200,
      yoyo: true,
      ease: 'Power2',
    });

    this.time.delayedCall(200, () => {
      const damage = this.currentEnemy.attack;
      this.battleState.playerHp -= damage;
      this.hud.updatePlayerHp(this.battleState.playerHp);
      this.sound.play('sfx-hit');

      // Hero hurt effect
      this.tweens.add({
        targets: this.hero,
        tint: 0xff0000,
        duration: 100,
        yoyo: true,
        onComplete: () => this.hero.clearTint(),
      });

      // Check defeat
      if (this.battleState.playerHp <= 0) {
        this.setPhase('defeat');
      } else {
        this.battleState.turnCount++;
        this.setPhase('player_turn');
      }
    });
  }

  private onVictory(): void {
    this.sound.play('sfx-victory');

    // Calculate rewards
    const xpReward = this.currentEnemy.xpReward;
    const [minGold, maxGold] = this.currentEnemy.goldReward;
    const goldReward = Phaser.Math.Between(minGold, maxGold);

    // Pass to victory scene
    this.scene.start('VictoryScene', {
      xpReward,
      goldReward,
      enemyName: this.currentEnemy.name,
    });
  }

  private onDefeat(): void {
    // Fade to black, return to town with reduced gold
    this.cameras.main.fadeOut(1000, 0, 0, 0);
    this.time.delayedCall(1000, () => {
      this.scene.start('TownScene', { defeated: true });
    });
  }
}
```

---

### Phase 2: Math Integration Details

#### Step 2.1: MathEngine (`src/systems/MathEngine.ts`)

```typescript
import { MathProblem, MathStats, DifficultyConfig, MathOperator } from '../types';

const DIFFICULTY_CONFIGS: DifficultyConfig[] = [
  { level: 1, minNumber: 0, maxNumber: 3, operators: ['+'], showVisualHint: true, hintFadeDelay: 0 },
  { level: 2, minNumber: 0, maxNumber: 5, operators: ['+'], showVisualHint: true, hintFadeDelay: 0 },
  { level: 3, minNumber: 0, maxNumber: 5, operators: ['+'], showVisualHint: true, hintFadeDelay: 3000 },
  { level: 4, minNumber: 0, maxNumber: 7, operators: ['+'], showVisualHint: true, hintFadeDelay: 2000 },
  { level: 5, minNumber: 0, maxNumber: 10, operators: ['+'], showVisualHint: true, hintFadeDelay: 1500 },
  { level: 6, minNumber: 0, maxNumber: 10, operators: ['+'], showVisualHint: false, hintFadeDelay: 0 },
  { level: 7, minNumber: 0, maxNumber: 10, operators: ['+', '-'], showVisualHint: false, hintFadeDelay: 0 },
  { level: 8, minNumber: 0, maxNumber: 15, operators: ['+', '-'], showVisualHint: false, hintFadeDelay: 0 },
  { level: 9, minNumber: 0, maxNumber: 20, operators: ['+', '-'], showVisualHint: false, hintFadeDelay: 0 },
  { level: 10, minNumber: 0, maxNumber: 20, operators: ['+', '-'], showVisualHint: false, hintFadeDelay: 0 },
];

export class MathEngine {
  private registry: Phaser.Data.DataManager;
  private stats: MathStats;

  constructor(registry: Phaser.Data.DataManager) {
    this.registry = registry;
    this.stats = this.loadStats();
  }

  private loadStats(): MathStats {
    const saved = this.registry.get('mathStats');
    return saved || {
      totalAttempts: 0,
      correctAnswers: 0,
      recentResults: [],
      currentDifficulty: 1,
      highestDifficulty: 1,
    };
  }

  private saveStats(): void {
    this.registry.set('mathStats', this.stats);
  }

  generateProblem(): MathProblem {
    const config = this.getConfig();
    const operator = this.randomChoice(config.operators);

    let operand1: number, operand2: number, answer: number;

    if (operator === '+') {
      operand1 = this.randomInt(config.minNumber, config.maxNumber);
      operand2 = this.randomInt(config.minNumber, config.maxNumber - operand1);
      answer = operand1 + operand2;
    } else {
      // Subtraction: ensure non-negative result
      operand1 = this.randomInt(config.minNumber + 1, config.maxNumber);
      operand2 = this.randomInt(config.minNumber, operand1);
      answer = operand1 - operand2;
    }

    const choices = this.generateChoices(answer, config.maxNumber);

    return {
      operand1,
      operand2,
      operator,
      answer,
      choices,
      showVisualHint: config.showVisualHint,
      hintType: config.showVisualHint ? 'apples' : 'none',
    };
  }

  private generateChoices(correct: number, maxNum: number): number[] {
    const choices = new Set<number>([correct]);

    // Add plausible wrong answers (within ±3 of correct)
    while (choices.size < 3) {
      const offset = this.randomInt(-3, 3);
      const wrong = correct + offset;
      if (wrong >= 0 && wrong <= maxNum + 5 && wrong !== correct) {
        choices.add(wrong);
      }
    }

    // Shuffle
    return this.shuffle([...choices]);
  }

  recordResult(isCorrect: boolean): void {
    this.stats.totalAttempts++;
    if (isCorrect) this.stats.correctAnswers++;

    // Sliding window of last 10
    this.stats.recentResults.push(isCorrect);
    if (this.stats.recentResults.length > 10) {
      this.stats.recentResults.shift();
    }

    // Adapt difficulty
    this.adaptDifficulty();
    this.saveStats();
  }

  private adaptDifficulty(): void {
    if (this.stats.recentResults.length < 5) return; // Need data

    const recentCorrect = this.stats.recentResults.filter(r => r).length;
    const successRate = recentCorrect / this.stats.recentResults.length;
    const playerLevel = this.registry.get('playerLevel') || 1;

    if (successRate < 0.5 && this.stats.currentDifficulty > 1) {
      // Struggling: decrease difficulty
      this.stats.currentDifficulty--;
    } else if (successRate > 0.8 && this.stats.currentDifficulty < playerLevel) {
      // Doing great: increase difficulty (capped at player level)
      this.stats.currentDifficulty++;
      if (this.stats.currentDifficulty > this.stats.highestDifficulty) {
        this.stats.highestDifficulty = this.stats.currentDifficulty;
      }
    }
  }

  private getConfig(): DifficultyConfig {
    const idx = Math.min(this.stats.currentDifficulty - 1, DIFFICULTY_CONFIGS.length - 1);
    return DIFFICULTY_CONFIGS[idx];
  }

  getStats(): MathStats {
    return { ...this.stats };
  }

  // Utility methods
  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private randomChoice<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  private shuffle<T>(arr: T[]): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}
```

#### Step 2.2: MathBoard UI (`src/ui/MathBoard.ts`)

```typescript
import Phaser from 'phaser';
import { MathProblem } from '../types';

export class MathBoard {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private problemText!: Phaser.GameObjects.Text;
  private buttons: Phaser.GameObjects.Container[] = [];
  private hintContainer!: Phaser.GameObjects.Container;
  private onAnswer: (isCorrect: boolean) => void;

  constructor(scene: Phaser.Scene, onAnswer: (isCorrect: boolean) => void) {
    this.scene = scene;
    this.onAnswer = onAnswer;
    this.create();
  }

  private create(): void {
    // Main container (centered, hidden by default)
    this.container = this.scene.add.container(400, 200);
    this.container.setVisible(false);
    this.container.setDepth(100);

    // Background board
    const board = this.scene.add.image(0, 0, 'math-board')
      .setDisplaySize(500, 300);
    this.container.add(board);

    // Problem text
    this.problemText = this.scene.add.text(0, -80, '', {
      fontSize: '48px',
      color: '#333333',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.container.add(this.problemText);

    // Visual hint container
    this.hintContainer = this.scene.add.container(0, -20);
    this.container.add(this.hintContainer);

    // Answer buttons (3 buttons in a row)
    const buttonY = 80;
    const buttonSpacing = 140;
    const startX = -buttonSpacing;

    for (let i = 0; i < 3; i++) {
      const btn = this.createAnswerButton(startX + i * buttonSpacing, buttonY, i);
      this.buttons.push(btn);
      this.container.add(btn);
    }
  }

  private createAnswerButton(x: number, y: number, index: number): Phaser.GameObjects.Container {
    const bg = this.scene.add.rectangle(0, 0, 100, 60, 0x4488cc, 1)
      .setInteractive({ useHandCursor: true });

    const text = this.scene.add.text(0, 0, '', {
      fontSize: '32px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const container = this.scene.add.container(x, y, [bg, text]);
    container.setData('index', index);
    container.setData('text', text);
    container.setData('bg', bg);

    bg.on('pointerover', () => bg.setFillStyle(0x5599dd));
    bg.on('pointerout', () => bg.setFillStyle(0x4488cc));
    bg.on('pointerdown', () => this.handleAnswer(index));

    return container;
  }

  show(problem: MathProblem): void {
    // Set problem text
    this.problemText.setText(`${problem.operand1} ${problem.operator} ${problem.operand2} = ?`);

    // Set button values
    problem.choices.forEach((choice, i) => {
      const btn = this.buttons[i];
      btn.setData('value', choice);
      btn.setData('isCorrect', choice === problem.answer);
      (btn.getData('text') as Phaser.GameObjects.Text).setText(choice.toString());
    });

    // Show visual hints if enabled
    this.showVisualHints(problem);

    // Animate in
    this.container.setVisible(true);
    this.container.setAlpha(0);
    this.container.setScale(0.8);

    this.scene.tweens.add({
      targets: this.container,
      alpha: 1,
      scale: 1,
      duration: 200,
      ease: 'Back.easeOut',
    });
  }

  private showVisualHints(problem: MathProblem): void {
    this.hintContainer.removeAll(true);

    if (!problem.showVisualHint) return;

    const spacing = 28;
    const group1Start = -((problem.operand1 - 1) * spacing) / 2 - 40;
    const group2Start = ((problem.operand2 - 1) * spacing) / 2 + 40;

    // First operand (apples on left)
    for (let i = 0; i < problem.operand1; i++) {
      const apple = this.scene.add.image(
        group1Start + i * spacing,
        0,
        'hints',
        0  // Frame 0 = apple
      ).setScale(0.8);
      this.hintContainer.add(apple);
    }

    // Operator symbol
    const opSymbol = this.scene.add.text(0, 0, problem.operator, {
      fontSize: '32px',
      color: '#666666',
    }).setOrigin(0.5);
    this.hintContainer.add(opSymbol);

    // Second operand (apples on right)
    for (let i = 0; i < problem.operand2; i++) {
      const apple = this.scene.add.image(
        group2Start + i * spacing,
        0,
        'hints',
        0
      ).setScale(0.8);
      this.hintContainer.add(apple);
    }
  }

  private handleAnswer(index: number): void {
    const btn = this.buttons[index];
    const isCorrect = btn.getData('isCorrect') as boolean;
    const bg = btn.getData('bg') as Phaser.GameObjects.Rectangle;

    // Visual feedback
    if (isCorrect) {
      bg.setFillStyle(0x44aa44);
      this.scene.sound.play('sfx-correct');
    } else {
      bg.setFillStyle(0xaa4444);
      this.scene.sound.play('sfx-wrong');
    }

    // Disable all buttons
    this.buttons.forEach(b => {
      (b.getData('bg') as Phaser.GameObjects.Rectangle).disableInteractive();
    });

    // Delay then callback
    this.scene.time.delayedCall(500, () => {
      this.onAnswer(isCorrect);
    });
  }

  showCorrectAnswer(problem: MathProblem): void {
    // Highlight the correct button
    this.buttons.forEach(btn => {
      if (btn.getData('isCorrect')) {
        const bg = btn.getData('bg') as Phaser.GameObjects.Rectangle;
        this.scene.tweens.add({
          targets: bg,
          fillColor: 0x44aa44,
          duration: 200,
          yoyo: true,
          repeat: 2,
        });
      }
    });

    // Show animated counting
    this.animateCorrectAnswer(problem);
  }

  private animateCorrectAnswer(problem: MathProblem): void {
    // Simple animation showing the answer
    const answerText = this.scene.add.text(0, 120, `= ${problem.answer}`, {
      fontSize: '36px',
      color: '#44aa44',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.container.add(answerText);

    this.scene.tweens.add({
      targets: answerText,
      scale: 1.2,
      duration: 300,
      yoyo: true,
    });
  }

  hide(): void {
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      scale: 0.8,
      duration: 150,
      onComplete: () => {
        this.container.setVisible(false);
        // Re-enable buttons and reset colors
        this.buttons.forEach(btn => {
          const bg = btn.getData('bg') as Phaser.GameObjects.Rectangle;
          bg.setInteractive({ useHandCursor: true });
          bg.setFillStyle(0x4488cc);
        });
      },
    });
  }
}
```

---

### Phase 3: Save System & Progression

#### Step 3.1: SaveSystem (`src/systems/SaveSystem.ts`)

```typescript
import { GameState, PlayerState, MathStats, InventoryState } from '../types';

const SAVE_KEY = 'little-math-adventure-save';

export class SaveSystem {
  static getDefaultState(): GameState {
    return {
      player: {
        name: 'Hrdina',
        level: 1,
        xp: 0,
        xpToNextLevel: 100,
        hp: 100,
        maxHp: 100,
        gold: 50,
        attack: 10,
        defense: 5,
        equippedWeapon: null,
        equippedArmor: null,
      },
      mathStats: {
        totalAttempts: 0,
        correctAnswers: 0,
        recentResults: [],
        currentDifficulty: 1,
        highestDifficulty: 1,
      },
      inventory: {
        items: [],
      },
      settings: {
        soundEnabled: true,
        musicEnabled: true,
      },
    };
  }

  static save(state: GameState): void {
    try {
      const json = JSON.stringify(state);
      localStorage.setItem(SAVE_KEY, json);
    } catch (e) {
      console.error('Failed to save game:', e);
    }
  }

  static load(): GameState {
    try {
      const json = localStorage.getItem(SAVE_KEY);
      if (json) {
        return JSON.parse(json) as GameState;
      }
    } catch (e) {
      console.error('Failed to load game:', e);
    }
    return this.getDefaultState();
  }

  static exists(): boolean {
    return localStorage.getItem(SAVE_KEY) !== null;
  }

  static delete(): void {
    localStorage.removeItem(SAVE_KEY);
  }
}
```

#### Step 3.2: ProgressionSystem (`src/systems/ProgressionSystem.ts`)

```typescript
import { PlayerState } from '../types';

const XP_PER_LEVEL = [
  0,     // Level 1
  100,   // Level 2
  250,   // Level 3
  450,   // Level 4
  700,   // Level 5
  1000,  // Level 6
  1400,  // Level 7
  1900,  // Level 8
  2500,  // Level 9
  3200,  // Level 10
];

export class ProgressionSystem {
  static addXp(player: PlayerState, amount: number): { leveledUp: boolean; newLevel: number } {
    player.xp += amount;

    let leveledUp = false;

    while (player.xp >= player.xpToNextLevel && player.level < 10) {
      player.xp -= player.xpToNextLevel;
      player.level++;
      leveledUp = true;

      // Update stats on level up
      player.maxHp += 10;
      player.hp = player.maxHp;
      player.attack += 2;
      player.defense += 1;

      // Next level XP requirement
      player.xpToNextLevel = XP_PER_LEVEL[player.level] || player.xpToNextLevel * 1.5;
    }

    return { leveledUp, newLevel: player.level };
  }

  static getXpProgress(player: PlayerState): number {
    return player.xp / player.xpToNextLevel;
  }
}
```

---

### Data Files

#### `public/assets/data/enemies.json`

```json
[
  {
    "id": "slime_green",
    "name": "Zelený Sliz",
    "spriteKey": "slime",
    "hp": 30,
    "attack": 5,
    "defense": 0,
    "xpReward": 20,
    "goldReward": [5, 15],
    "difficulty": 1
  },
  {
    "id": "slime_blue",
    "name": "Modrý Sliz",
    "spriteKey": "slime",
    "hp": 50,
    "attack": 8,
    "defense": 2,
    "xpReward": 35,
    "goldReward": [10, 25],
    "difficulty": 3
  },
  {
    "id": "slime_red",
    "name": "Červený Sliz",
    "spriteKey": "slime",
    "hp": 80,
    "attack": 12,
    "defense": 5,
    "xpReward": 60,
    "goldReward": [20, 40],
    "difficulty": 5
  }
]
```

#### `public/assets/data/items.json`

```json
[
  {
    "id": "potion_small",
    "name": "Malý Lektvar",
    "type": "consumable",
    "description": "Obnoví 25 HP",
    "price": 20,
    "iconFrame": 0,
    "healAmount": 25
  },
  {
    "id": "potion_large",
    "name": "Velký Lektvar",
    "type": "consumable",
    "description": "Obnoví 75 HP",
    "price": 50,
    "iconFrame": 1,
    "healAmount": 75
  },
  {
    "id": "sword_wooden",
    "name": "Dřevěný Meč",
    "type": "weapon",
    "description": "+3 Útok",
    "price": 30,
    "iconFrame": 10,
    "attackBonus": 3
  },
  {
    "id": "sword_iron",
    "name": "Železný Meč",
    "type": "weapon",
    "description": "+8 Útok",
    "price": 100,
    "iconFrame": 11,
    "attackBonus": 8
  }
]
```

---

## Testing Checklist

### Phase 1 Completion Criteria
- [ ] Project runs with `npm run dev`
- [ ] Assets load without errors
- [ ] Hero and Slime visible on battle screen
- [ ] Attack button responds to clicks
- [ ] Knight attack animation plays

### Phase 2 Completion Criteria
- [ ] Math problems generate correctly
- [ ] 3 answer choices appear (shuffled)
- [ ] Correct answer triggers attack
- [ ] Wrong answer triggers miss + shows correct
- [ ] Visual hints appear for difficulty 1-5

### Phase 3 Completion Criteria
- [ ] HP bars display and update
- [ ] Damage calculations work
- [ ] Victory triggers on enemy HP = 0
- [ ] XP and gold rewards given
- [ ] Adaptive difficulty adjusts based on performance

### Phase 4 Completion Criteria
- [ ] Town scene with 3 areas
- [ ] Shop purchases work
- [ ] Comparison math in shop ("Enough gold?")
- [ ] Game saves to localStorage
- [ ] Game loads on refresh

### Phase 5 Completion Criteria
- [ ] Multiple enemy types
- [ ] Sound effects play
- [ ] Mobile touch works
- [ ] No console errors
- [ ] Loading time < 3 seconds
