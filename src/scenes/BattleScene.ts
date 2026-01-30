import Phaser from 'phaser';
import { BattleState, BattlePhase, BattleEnemy, EnemyDefinition, ItemDefinition, PetDefinition, MathProblem } from '../types';
import { MathEngine } from '../systems/MathEngine';
import { MathBoard } from '../ui/MathBoard';
import { GameStateManager } from '../systems/GameStateManager';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { SceneDebugger } from '../systems/SceneDebugger';
import { SceneBuilder } from '../systems/SceneBuilder';
import { getPlayerSpriteConfig, PlayerSpriteConfig } from '../utils/characterUtils';
import { PauseMenu } from '../ui/PauseMenu';

// HP Bar component attached to character
interface HpBar {
    container: Phaser.GameObjects.Container;
    bg: Phaser.GameObjects.Rectangle;
    fill: Phaser.GameObjects.Rectangle;
    text: Phaser.GameObjects.Text;
}

export class BattleScene extends Phaser.Scene {
    // Character containers (sprite + HP bar)
    private heroContainer!: Phaser.GameObjects.Container;
    private enemyContainers: Phaser.GameObjects.Container[] = [];
    private hero!: Phaser.GameObjects.Sprite;
    private enemies: Phaser.GameObjects.Sprite[] = [];
    private heroHpBar!: HpBar;
    private enemyHpBars: HpBar[] = [];

    // UI Components
    private mathBoard!: MathBoard;
    private attackButton!: Phaser.GameObjects.Container;
    private potionButton!: Phaser.GameObjects.Container;
    private blockUI!: Phaser.GameObjects.Container;
    private blockDamageText!: Phaser.GameObjects.Text;
    private blockTimerText!: Phaser.GameObjects.Text;
    private blockAttemptsText!: Phaser.GameObjects.Text;
    private targetIndicator!: Phaser.GameObjects.Image;

    // Systems
    private mathEngine!: MathEngine;
    private gameState!: GameStateManager;
    private sceneBuilder!: SceneBuilder;

    // State
    private battleState!: BattleState;
    private enemyDefs: EnemyDefinition[] = [];
    private enemyAnimPrefixes: string[] = [];

    // Block state
    private isBlockPhase: boolean = false;
    private blockCorrectCount: number = 0;
    private blockMaxAttempts: number = 0;
    private blockAttemptsMade: number = 0;
    private blockTimeRemaining: number = 0;
    private blockTimerEvent: Phaser.Time.TimerEvent | null = null;
    private pendingDamage: number = 0;

    // Multi-enemy attack tracking
    private currentAttackingEnemyIndex: number = 0;

    // Animation definitions with movement data
    private animationDefs: Record<string, any> = {};

    // Player character sprite configuration
    private playerSpriteConfig!: PlayerSpriteConfig;

    // Universal debugger
    private debugger!: SceneDebugger;

    // Pause menu
    private pauseMenu!: PauseMenu;

    // Cached spawn points for battle positioning
    private cachedSpawnPoints: {
        player: { x: number; y: number };
        pet: { x: number; y: number };
        enemies: { x: number; y: number }[];
    } | null = null;

    // Pet companion
    private petContainer: Phaser.GameObjects.Container | null = null;
    private petSprite: Phaser.GameObjects.Sprite | null = null;
    private equippedPetDef: PetDefinition | null = null;

    // Pet turn system
    private petTargetIndex: number = 0;
    private petMathProblem: MathProblem | null = null;

    // Active character highlighting
    private activeHighlight: Phaser.GameObjects.Graphics | null = null;
    private activeHighlightTween: Phaser.Tweens.Tween | null = null;

    constructor() {
        super({ key: 'BattleScene' });
    }

    // Arena mode data
    private fromArena: boolean = false;
    private arenaLevel: number = 1;
    private arenaWave: number = 0;

    // Enemy attack tween tracking for mid-attack pause
    private enemyAttackTweens: Phaser.Tweens.Tween[] = [];
    private blockPhaseResumeCallback?: () => void;
    private enemyAttackStartPosition: { x: number; y: number } = { x: 0, y: 0 };

    init(data: { enemyId?: string; enemyDefs?: EnemyDefinition[]; fromArena?: boolean; arenaLevel?: number; wave?: number }): void {
        // Get global game state
        this.gameState = GameStateManager.getInstance();
        const player = this.gameState.getPlayer();

        // Store arena data if coming from arena
        this.fromArena = data.fromArena || false;
        this.arenaLevel = data.arenaLevel || 1;
        this.arenaWave = data.wave || 0;

        // Get enemy data - either from arena or single enemy
        if (data.enemyDefs && data.enemyDefs.length > 0) {
            this.enemyDefs = data.enemyDefs;
        } else {
            const enemies = this.cache.json.get('enemies') as EnemyDefinition[];
            const enemyId = data.enemyId || 'slime_green';
            this.enemyDefs = [enemies.find(e => e.id === enemyId) || enemies[0]];
        }

        // Use animPrefix if available (new format), fallback to parsing spriteKey (legacy)
        this.enemyAnimPrefixes = this.enemyDefs.map(def => {
            if (def.animPrefix) {
                return def.animPrefix;
            }
            // Legacy fallback: derive from spriteKey
            const spriteKey = def.spriteKey;
            return spriteKey.includes('-') ? spriteKey.split('-')[0] : spriteKey;
        });

        // Create battle enemies from definitions
        const battleEnemies: BattleEnemy[] = this.enemyDefs.map((def, index) => ({
            id: `${def.id}_${index}`,
            name: def.name,
            spriteKey: def.spriteKey,
            hp: def.hp,
            maxHp: def.hp,
            attack: def.attack,
            defense: def.defense,
        }));

        // Initialize battle state
        this.battleState = {
            phase: 'start',
            playerHp: player.hp,
            enemies: battleEnemies,
            selectedEnemyIndex: 0,
            currentProblems: [],
            currentProblemIndex: 0,
            damageDealt: 0,
            turnCount: 0,
        };
    }

    create(): void {
        // Clear arrays from previous battle
        this.enemyContainers = [];
        this.enemies = [];
        this.enemyHpBars = [];

        // Get animation definitions (including movement data) from registry
        this.animationDefs = this.registry.get('animationDefs') || {};

        // Initialize SceneBuilder
        this.sceneBuilder = new SceneBuilder(this);

        // Register handlers before building
        this.sceneBuilder.registerHandler('onAttack', () => this.onAttackClicked());

        this.sceneBuilder.buildScene();

        const player = this.gameState.getPlayer();

        // Get spawn points from scene-layouts.json (preferred) or fallback to zones
        const enemyCount = this.battleState.enemies.length;
        const spawnPoints = this.sceneBuilder.getSpawnPoints(undefined, enemyCount);

        // Hero position from spawn points or fallback
        let heroX: number, heroY: number;
        if (spawnPoints) {
            heroX = spawnPoints.player.x;
            heroY = spawnPoints.player.y;
        } else {
            const playerSpawn = this.sceneBuilder.getZone('playerSpawn');
            heroX = playerSpawn ? playerSpawn.x : 300;
            heroY = playerSpawn ? playerSpawn.y : 480;
        }

        // Get player sprite configuration based on selected character
        this.playerSpriteConfig = getPlayerSpriteConfig(player.characterType);

        // Get hero scale from character definition
        const charactersData = this.cache.json.get('characters') as Array<{ id: string; scale?: number }>;
        const characterDef = charactersData?.find(c => c.id === player.characterType);
        const HERO_BASE_SCALE = 1.0;
        const heroScale = (characterDef?.scale ?? 1.0) * HERO_BASE_SCALE;

        // Create hero container with sprite and HP bar
        this.heroContainer = this.add.container(heroX, heroY);
        this.hero = this.add.sprite(0, 0, this.playerSpriteConfig.idleTexture)
            .setScale(heroScale)
            .play(this.playerSpriteConfig.idleAnim);
        this.heroHpBar = this.createHpBar(0, -90, this.battleState.playerHp, player.maxHp, '#44cc44');
        this.heroContainer.add([this.hero, this.heroHpBar.container]);

        // Pet position from spawn points or default relative to hero
        let petX: number, petY: number;
        if (spawnPoints) {
            petX = spawnPoints.pet.x;
            petY = spawnPoints.pet.y;
        } else {
            petX = heroX - 80;
            petY = heroY + 20;
        }

        // Create pet companion if player has one equipped
        this.createPetCompanion(player, petX, petY);

        // Initialize cached spawn points
        this.cachedSpawnPoints = {
            player: { x: heroX, y: heroY },
            pet: { x: petX, y: petY },
            enemies: []
        };

        // Create enemy containers using configured spawn points
        this.battleState.enemies.forEach((enemy, index) => {
            // Use spawn points if available, otherwise calculate positions
            let x: number, y: number;
            if (spawnPoints && spawnPoints.enemies[index]) {
                x = spawnPoints.enemies[index].x;
                y = spawnPoints.enemies[index].y;
            } else {
                // Fallback: center enemies around a base position
                const enemySpawn = this.sceneBuilder.getZone('enemySpawn');
                const baseEnemyX = enemySpawn ? enemySpawn.x : 900;
                const baseEnemyY = enemySpawn ? enemySpawn.y : 480;
                const enemySpacing = 140;
                const startX = baseEnemyX - ((enemyCount - 1) * enemySpacing) / 2;
                x = startX + index * enemySpacing;
                y = baseEnemyY;
            }

            // Cache the enemy position for use in finishEnemyAttack
            this.cachedSpawnPoints!.enemies.push({ x, y });

            const def = this.enemyDefs[index];
            const animPrefix = this.enemyAnimPrefixes[index];

            // Get enemy scale from definition
            const ENEMY_BASE_SCALE = 1.0;
            const enemyScale = (def.scale ?? 1.0) * ENEMY_BASE_SCALE;

            const container = this.add.container(x, y);
            const sprite = this.add.sprite(0, 0, def.spriteKey).setScale(enemyScale).play(`${animPrefix}-idle`);
            const hpBar = this.createHpBar(0, -80, enemy.hp, enemy.maxHp, '#cc4444');
            container.add([sprite, hpBar.container]);

            // Make enemy clickable to select as target
            sprite.setInteractive({ useHandCursor: true });
            sprite.on('pointerdown', () => this.selectTarget(index));

            this.enemyContainers.push(container);
            this.enemies.push(sprite);
            this.enemyHpBars.push(hpBar);
        });

        // Create target indicator (iron sword pointing down at selected enemy)
        this.targetIndicator = this.add.image(0, 0, 'shop-swords-sheet', 1)  // frame 1 = iron sword
            .setScale(0.2)
            .setAngle(180)  // upside down, pointing down
            .setDepth(50);

        // Add bobbing animation
        this.tweens.add({
            targets: this.targetIndicator,
            y: '-=8',
            duration: 400,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.inOut'
        });

        this.updateTargetIndicator();

        // Set player level in registry for MathEngine's adaptive difficulty
        this.registry.set('playerLevel', player.level);

        // Initialize systems
        this.mathEngine = new MathEngine(this.registry);

        // Create math board with multi-problem callback (but we'll use showSingle)
        this.mathBoard = new MathBoard(this, this.onMathComplete.bind(this));

        // Get attack button from SceneBuilder (already has click handler bound via registerHandler)
        const builderAttackBtn = this.sceneBuilder.get('attackBtn');
        if (builderAttackBtn) {
            this.attackButton = builderAttackBtn as Phaser.GameObjects.Container;
        } else {
            this.createAttackButton();
        }

        this.createBlockUI();
        this.createPotionButton();

        // Setup universal debugger
        this.setupDebugger();

        // Start battle
        this.time.delayedCall(500, () => this.setPhase('player_turn'));
    }

    private createHpBar(x: number, y: number, hp: number, maxHp: number, color: string): HpBar {
        const width = 100;
        const height = 12;
        const container = this.add.container(x, y);

        const bg = this.add.rectangle(0, 0, width + 4, height + 4, 0x333333).setOrigin(0.5);
        const fillColor = color === '#44cc44' ? 0x44cc44 : 0xcc4444;
        const fill = this.add.rectangle(-width / 2, 0, width * (hp / maxHp), height, fillColor).setOrigin(0, 0.5);
        const text = this.add.text(0, 0, `${hp}/${maxHp}`, {
            fontSize: '10px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
        }).setOrigin(0.5);

        container.add([bg, fill, text]);
        return { container, bg, fill, text };
    }

    private updateHpBar(hpBar: HpBar, hp: number, maxHp: number): void {
        const width = 100;
        const percent = Math.max(0, hp / maxHp);
        hpBar.fill.setSize(width * percent, 12);
        hpBar.text.setText(`${Math.max(0, hp)}/${maxHp}`);

        // Color based on health percentage
        if (percent > 0.5) {
            hpBar.fill.setFillStyle(0x44cc44);
        } else if (percent > 0.25) {
            hpBar.fill.setFillStyle(0xcccc44);
        } else {
            hpBar.fill.setFillStyle(0xcc4444);
        }
    }

    private createPetCompanion(player: { activePet: string | null }, petX: number, petY: number): void {
        // Reset pet references
        this.petContainer = null;
        this.petSprite = null;
        this.equippedPetDef = null;

        if (!player.activePet) return;

        // Get pet definition
        const petsData = this.cache.json.get('pets') as PetDefinition[];
        const petDef = petsData.find(p => p.id === player.activePet);
        if (!petDef) return;

        this.equippedPetDef = petDef;

        // Create pet container at the specified position
        this.petContainer = this.add.container(petX, petY);

        // Get pet scale from definition
        const PET_BASE_SCALE = 0.5;
        const petScale = (petDef.scale ?? 1.0) * PET_BASE_SCALE;

        // Create pet sprite - flipped horizontally (facing right like hero)
        // Use spriteKey (spritesheet) with frame 0, then play idle animation
        this.petSprite = this.add.sprite(0, 0, petDef.spriteKey, 0)
            .setScale(petScale)
            .setFlipX(true);  // Flip to face right (same direction as hero)

        // Play idle animation if it exists
        const idleAnim = `${petDef.animPrefix}-idle`;
        if (this.anims.exists(idleAnim)) {
            this.petSprite.play(idleAnim);
        }

        this.petContainer.add(this.petSprite);
        this.petContainer.setDepth(-1);  // Behind hero
    }

    /**
     * Return pet to its starting position after attack
     */
    private returnPetToPosition(startX: number, startY: number, onComplete: () => void): void {
        if (!this.petContainer) {
            onComplete();
            return;
        }

        this.tweens.add({
            targets: this.petContainer,
            x: startX,
            y: startY,
            duration: 300,
            ease: 'Quad.easeIn',
            onComplete: () => {
                // Reset depth
                this.petContainer?.setDepth(-1);
                onComplete();
            }
        });
    }

    /**
     * Show pet's dedicated math problem
     */
    private showPetMathProblem(): void {
        if (!this.equippedPetDef) {
            this.transitionToEnemyTurn();
            return;
        }

        // Show active highlight on pet
        if (this.petContainer) {
            this.showActiveHighlight(this.petContainer.x, this.petContainer.y + 30, 'green');
        }

        // Generate pet's single problem
        this.petMathProblem = this.mathEngine.generatePetTurnProblem(this.equippedPetDef);

        // Show in MathBoard with pet styling
        this.mathBoard.showSingle(this.petMathProblem, this.onPetMathComplete.bind(this));
    }

    /**
     * Handle pet math problem completion
     */
    private onPetMathComplete(isCorrect: boolean): void {
        this.mathBoard.hide();
        this.hideActiveHighlight();

        if (this.petMathProblem) {
            this.mathEngine.recordResultForProblem(this.petMathProblem.id, isCorrect);
        }

        if (isCorrect) {
            this.setPhase('pet_attack');
        } else {
            // Pet misses turn
            this.showPetMissMessage();
            this.time.delayedCall(500, () => this.transitionToEnemyTurn());
        }
    }

    /**
     * Show "miss" message for pet
     */
    private showPetMissMessage(): void {
        if (!this.petContainer) return;

        const missText = this.add.text(this.petContainer.x, this.petContainer.y - 50, 'VEDLE!', {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaaaaa',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0.5);

        this.tweens.add({
            targets: missText,
            y: missText.y - 30,
            alpha: 0,
            duration: 600,
            onComplete: () => missText.destroy(),
        });
    }

    /**
     * Execute pet's attack
     */
    private executePetAttack(): void {
        if (!this.equippedPetDef || !this.petMathProblem) {
            this.transitionToEnemyTurn();
            return;
        }

        const damage = this.petMathProblem.damageMultiplier || 1;
        const targetIdx = this.petTargetIndex;

        // Check for spell attack effect (like Bodlina's lightning)
        if (this.equippedPetDef.attackEffect) {
            this.playPetSpellAttack(targetIdx, damage, () => {
                this.transitionToEnemyTurn();
            });
        } else {
            this.playPetMeleeAttack(targetIdx, damage, () => {
                this.transitionToEnemyTurn();
            });
        }
    }

    /**
     * Play pet melee attack (same as original playPetAttack but with damage)
     */
    private playPetMeleeAttack(targetIdx: number, damage: number, onComplete: () => void): void {
        if (!this.petSprite || !this.equippedPetDef || !this.petContainer) {
            onComplete();
            return;
        }

        const enemyContainer = this.enemyContainers[targetIdx];
        if (!enemyContainer) {
            onComplete();
            return;
        }

        const animPrefix = this.equippedPetDef.animPrefix;
        const startX = this.petContainer.x;
        const startY = this.petContainer.y;

        // Target position - offset slightly to the left of enemy
        const targetX = enemyContainer.x - 40;
        const targetY = enemyContainer.y;

        // Get movement data from pet's attack animation definition
        const attackAnimDef = this.animationDefs[`${animPrefix}-attack`];
        const movement = attackAnimDef?.movement;
        const moveDuration = movement?.duration || 300;

        // Pet appears on top during attack
        this.petContainer.setDepth(10);

        // Play attack animation immediately during approach
        const attackAnim = `${animPrefix}-attack`;
        if (this.anims.exists(attackAnim)) {
            this.petSprite.play(attackAnim);
        }

        // Move to enemy position
        this.tweens.add({
            targets: this.petContainer,
            x: targetX,
            y: targetY,
            duration: moveDuration,
            ease: movement?.ease || 'Quad.easeOut',
            onComplete: () => {
                // Apply damage
                this.applyPetDamageToEnemy(targetIdx, damage);

                // Brief pause at enemy (100ms), then return
                this.time.delayedCall(100, () => {
                    this.petSprite!.play(`${animPrefix}-idle`);
                    this.returnPetToPosition(startX, startY, onComplete);
                });
            }
        });
    }

    /**
     * Play pet spell attack (lightning for Bodlina)
     */
    private playPetSpellAttack(targetIdx: number, damage: number, onComplete: () => void): void {
        if (!this.petSprite || !this.equippedPetDef || !this.petContainer) {
            onComplete();
            return;
        }

        const enemyContainer = this.enemyContainers[targetIdx];
        if (!enemyContainer) {
            onComplete();
            return;
        }

        const animPrefix = this.equippedPetDef.animPrefix;
        const attackEffect = this.equippedPetDef.attackEffect;

        // Play attack animation in place (pet doesn't move for spells)
        const attackAnim = `${animPrefix}-attack`;
        if (this.anims.exists(attackAnim)) {
            this.petSprite.play(attackAnim);
        }

        // Play effect based on type
        if (attackEffect?.type === 'lightning') {
            const tintColor = attackEffect.tint ? parseInt(attackEffect.tint, 16) : 0x44ff44;
            this.playLightningEffect(
                this.petContainer.x,
                this.petContainer.y - 30,
                enemyContainer.x,
                enemyContainer.y,
                tintColor,
                () => {
                    // Apply damage after effect
                    this.applyPetDamageToEnemy(targetIdx, damage);

                    // Return to idle
                    this.time.delayedCall(200, () => {
                        this.petSprite!.play(`${animPrefix}-idle`);
                        onComplete();
                    });
                }
            );
        } else {
            // Fallback to melee if effect type not recognized
            this.playPetMeleeAttack(targetIdx, damage, onComplete);
        }
    }

    /**
     * Play lightning effect from start to end position
     */
    private playLightningEffect(
        startX: number,
        startY: number,
        endX: number,
        endY: number,
        tintColor: number,
        onComplete: () => void
    ): void {
        const graphics = this.add.graphics();
        graphics.setDepth(50);

        // Generate jagged lightning path with 12 segments
        const segments = 12;
        const points: { x: number; y: number }[] = [{ x: startX, y: startY }];

        for (let i = 1; i < segments; i++) {
            const t = i / segments;
            const baseX = startX + (endX - startX) * t;
            const baseY = startY + (endY - startY) * t;

            // Add random offset (±35 perpendicular, ±25 parallel)
            const perpOffset = (Math.random() - 0.5) * 70;
            const paraOffset = (Math.random() - 0.5) * 50;

            // Calculate perpendicular direction
            const dx = endX - startX;
            const dy = endY - startY;
            const len = Math.sqrt(dx * dx + dy * dy);
            const perpX = -dy / len;
            const perpY = dx / len;

            points.push({
                x: baseX + perpX * perpOffset + (dx / len) * paraOffset,
                y: baseY + perpY * perpOffset + (dy / len) * paraOffset,
            });
        }
        points.push({ x: endX, y: endY });

        // Draw 4 layers: outer glow (20px), middle (12px), main (6px), core (2px)
        const layers = [
            { width: 20, alpha: 0.2 },
            { width: 12, alpha: 0.4 },
            { width: 6, alpha: 0.8 },
            { width: 2, alpha: 1.0 },
        ];

        layers.forEach(layer => {
            graphics.lineStyle(layer.width, tintColor, layer.alpha);
            graphics.beginPath();
            graphics.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                graphics.lineTo(points[i].x, points[i].y);
            }
            graphics.strokePath();
        });

        // Camera shake
        this.cameras.main.shake(100, 0.005);

        // Fade out and destroy
        this.tweens.add({
            targets: graphics,
            alpha: 0,
            duration: 300,
            onComplete: () => {
                graphics.destroy();
                onComplete();
            },
        });
    }

    /**
     * Apply damage from pet to enemy
     */
    private applyPetDamageToEnemy(targetIdx: number, damage: number): void {
        const enemy = this.battleState.enemies[targetIdx];
        const enemyContainer = this.enemyContainers[targetIdx];
        const enemySprite = this.enemies[targetIdx];
        const animPrefix = this.enemyAnimPrefixes[targetIdx];

        enemy.hp -= damage;
        this.updateHpBar(this.enemyHpBars[targetIdx], enemy.hp, enemy.maxHp);

        // Show damage number
        const dmgText = this.add.text(enemyContainer.x, enemyContainer.y - 50, `-${damage}`, {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#44ff44', // Green for pet damage
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0.5);

        this.tweens.add({
            targets: dmgText,
            y: dmgText.y - 30,
            alpha: 0,
            duration: 600,
            onComplete: () => dmgText.destroy(),
        });

        // Enemy hit effect
        if (enemy.hp > 0) {
            enemySprite.play(`${animPrefix}-hurt`);
            enemySprite.setTint(0xff0000);
            this.time.delayedCall(100, () => {
                enemySprite.clearTint();
            });
            enemySprite.once('animationcomplete', () => {
                if (enemy.hp > 0) {
                    enemySprite.play(`${animPrefix}-idle`);
                }
            });
        }
    }

    /**
     * Transition to enemy turn after pet attack
     */
    private transitionToEnemyTurn(): void {
        const targetIdx = this.petTargetIndex;
        const enemy = this.battleState.enemies[targetIdx];
        const enemySprite = this.enemies[targetIdx];
        const animPrefix = this.enemyAnimPrefixes[targetIdx];

        // Check if target enemy died from pet attack
        if (enemy.hp <= 0) {
            enemySprite.play(`${animPrefix}-death`);
            enemySprite.once('animationcomplete', () => {
                // Fade out the defeated monster after 1 second
                this.time.delayedCall(1000, () => {
                    this.tweens.add({
                        targets: this.enemyContainers[targetIdx],
                        alpha: 0,
                        duration: 500,
                        onComplete: () => {
                            this.checkVictoryOrContinue();
                        }
                    });
                });
            });
        } else {
            this.setPhase('enemy_turn');
        }
    }

    /**
     * Show active character highlight (pulsing ellipse on ground)
     */
    private showActiveHighlight(x: number, y: number, color: 'green' | 'red'): void {
        this.hideActiveHighlight();

        this.activeHighlight = this.add.graphics();
        this.activeHighlight.setDepth(-2); // Behind characters

        const fillColor = color === 'green' ? 0x44aa44 : 0xaa4444;

        // Draw ellipse
        this.activeHighlight.fillStyle(fillColor, 0.3);
        this.activeHighlight.fillEllipse(x, y, 80, 30);

        // Pulsing animation
        this.activeHighlightTween = this.tweens.add({
            targets: this.activeHighlight,
            alpha: { from: 0.6, to: 0.2 },
            duration: 600,
            yoyo: true,
            repeat: -1,
        });
    }

    /**
     * Hide active character highlight
     */
    private hideActiveHighlight(): void {
        if (this.activeHighlightTween) {
            this.activeHighlightTween.stop();
            this.activeHighlightTween = null;
        }
        if (this.activeHighlight) {
            this.activeHighlight.destroy();
            this.activeHighlight = null;
        }
    }

    /**
     * Play hero defense animation when player successfully blocks damage
     */
    private playHeroDefense(): void {
        this.hero.play(this.playerSpriteConfig.defendAnim);

        // Blue tint for defense effect
        this.hero.setTint(0x4488ff);
        this.time.delayedCall(200, () => this.hero.clearTint());

        // Return to idle when animation completes
        this.hero.once('animationcomplete', () => {
            this.hero.play(this.playerSpriteConfig.idleAnim);
        });
    }

    private setupDebugger(): void {
        this.debugger = new SceneDebugger(this, 'BattleScene');

        // Create pause menu (ESC key to toggle)
        this.pauseMenu = new PauseMenu(this);

        // Register containers (sprite + HP bar move together)
        this.debugger.register('hero', this.heroContainer);
        this.enemyContainers.forEach((container, index) => {
            this.debugger.register(`enemy${index}`, container);
        });
        this.debugger.register('attackButton', this.attackButton);
        this.debugger.register('mathBoard', this.mathBoard.getContainer());

        // Set battle-specific callbacks (W for win, H for heal)
        this.debugger.setBattleCallbacks(
            () => this.debugInstantWin(),
            () => this.debugFullHeal()
        );

        // Additional battle debug keys (not handled by SceneDebugger)
        this.input.keyboard?.on('keydown-K', () => this.debugKillEnemy());
    }

    private debugInstantWin(): void {
        console.log('[DEBUG] Instant win triggered');
        this.battleState.enemies.forEach(e => e.hp = 0);
        this.setPhase('victory');
    }

    private debugKillEnemy(): void {
        console.log('[DEBUG] Kill current enemy');
        const idx = this.battleState.selectedEnemyIndex;
        const enemy = this.battleState.enemies[idx];
        enemy.hp = 0;
        this.updateHpBar(this.enemyHpBars[idx], 0, enemy.maxHp);

        // Play death animation
        const animPrefix = this.enemyAnimPrefixes[idx];
        this.enemies[idx].play(`${animPrefix}-death`);

        // Fade out the defeated monster after 1 second
        this.enemies[idx].once('animationcomplete', () => {
            this.time.delayedCall(1000, () => {
                this.tweens.add({
                    targets: this.enemyContainers[idx],
                    alpha: 0,
                    duration: 500,
                    onComplete: () => {
                        this.checkVictoryOrContinue();
                    }
                });
            });
        });
    }

    private debugFullHeal(): void {
        console.log('[DEBUG] Full heal');
        const player = this.gameState.getPlayer();
        this.battleState.playerHp = player.maxHp;
        this.updateHpBar(this.heroHpBar, player.maxHp, player.maxHp);
    }

    private selectTarget(index: number): void {
        // Only allow selecting alive enemies during player turn
        if (this.battleState.phase !== 'player_turn') return;
        if (this.battleState.enemies[index].hp <= 0) return;

        this.battleState.selectedEnemyIndex = index;
        this.updateTargetIndicator();
    }

    private updateTargetIndicator(): void {
        const idx = this.battleState.selectedEnemyIndex;
        const container = this.enemyContainers[idx];

        // Position sword above the enemy's head
        this.targetIndicator.setPosition(container.x, container.y - 100);

        // Hide indicator if target is dead
        if (this.battleState.enemies[idx].hp <= 0) {
            this.targetIndicator.setVisible(false);
        } else {
            this.targetIndicator.setVisible(true);
        }
    }

    private createBlockUI(): void {
        // Centered for 1280x720
        this.blockUI = this.add.container(640, 80);
        this.blockUI.setVisible(false);
        this.blockUI.setDepth(90);

        const bg = this.add.rectangle(0, 0, 340, 70, 0x000000, 0.8)
            .setStrokeStyle(2, 0x4488ff);
        this.blockUI.add(bg);

        this.blockDamageText = this.add.text(0, -20, 'ÚTOK: 5 DMG', {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#ff6666',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        this.blockUI.add(this.blockDamageText);

        this.blockTimerText = this.add.text(-100, 10, 'ČAS: 10S', {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
        }).setOrigin(0, 0.5);
        this.blockUI.add(this.blockTimerText);

        this.blockAttemptsText = this.add.text(30, 10, 'BLOKUJI: 0 DMG', {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaffaa',
        }).setOrigin(0, 0.5);
        this.blockUI.add(this.blockAttemptsText);
    }

    private createAttackButton(): void {
        // Centered for 1280x720
        const button = this.add.rectangle(640, 660, 150, 50, 0x44aa44)
            .setInteractive({ useHandCursor: true });

        const text = this.add.text(640, 660, 'ÚTOK', {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        this.attackButton = this.add.container(0, 0, [button, text]);

        button.on('pointerdown', () => this.onAttackClicked());
        button.on('pointerover', () => button.setFillStyle(0x55bb55));
        button.on('pointerout', () => button.setFillStyle(0x44aa44));
    }

    private createPotionButton(): void {
        const player = this.gameState.getPlayer();

        // Get position from sceneBuilder (fallback to left of attack button)
        const potionBtnEl = this.sceneBuilder.get('potionBtn');
        const btnX = potionBtnEl?.x ?? 480;
        const btnY = potionBtnEl?.y ?? 660;
        const btnDepth = this.sceneBuilder.getLayoutOverride('potionBtn')?.depth ?? 50;

        this.potionButton = this.add.container(btnX, btnY);
        this.potionButton.setDepth(btnDepth);

        const hasPotion = player.potions > 0;
        const btnColor = hasPotion ? 0x8844aa : 0x444444;

        const bg = this.add.rectangle(0, 0, 100, 50, btnColor)
            .setStrokeStyle(2, 0xffffff);

        // Potion icon
        const icon = this.add.text(-25, 0, '🧪', {
            fontSize: '24px'
        }).setOrigin(0.5);

        // Count text
        const countText = this.add.text(20, 0, hasPotion ? '1' : '0', {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: hasPotion ? '#ffffff' : '#666666',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.potionButton.add([bg, icon, countText]);

        if (hasPotion) {
            bg.setInteractive({ useHandCursor: true })
                .on('pointerover', () => bg.setFillStyle(0xaa66cc))
                .on('pointerout', () => bg.setFillStyle(0x8844aa))
                .on('pointerdown', () => this.usePotion());
        }

        // Hide initially - show during player_turn
        this.potionButton.setVisible(false);
    }

    private usePotion(): void {
        // Only allow during player_turn phase
        if (this.battleState.phase !== 'player_turn') return;

        const player = this.gameState.getPlayer();
        if (player.potions <= 0) return;

        // Use potion - heal to full
        player.potions = 0;
        this.battleState.playerHp = player.maxHp;

        // Update HP bar
        this.updateHpBar(this.heroHpBar, this.battleState.playerHp, player.maxHp);

        // Save state (potion used)
        this.gameState.save();

        // Hide potion button (no more potions)
        this.potionButton.setVisible(false);

        // Visual feedback
        const healText = this.add.text(this.heroContainer.x, this.heroContainer.y - 80, 'VYLÉČEN!', {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#44ff44',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);

        this.tweens.add({
            targets: healText,
            y: healText.y - 40,
            alpha: 0,
            duration: 1200,
            onComplete: () => healText.destroy()
        });

        // Green flash on hero
        this.hero.setTint(0x44ff44);
        this.time.delayedCall(200, () => {
            this.hero.clearTint();
        });
    }

    private setPhase(phase: BattlePhase): void {
        this.battleState.phase = phase;

        switch (phase) {
            case 'player_turn':
                this.attackButton.setVisible(true);
                // Show potion button if player has a potion
                const playerForTurn = this.gameState.getPlayer();
                this.potionButton.setVisible(playerForTurn.potions > 0);
                this.hideActiveHighlight();
                break;

            case 'player_math':
                this.attackButton.setVisible(false);
                this.potionButton.setVisible(false);
                this.showAttackProblems();
                break;

            case 'player_attack':
                this.playHeroAttack();
                break;

            case 'player_miss':
                this.playHeroMiss();
                break;

            case 'pet_turn':
                // Pet automatically targets same enemy as hero
                this.petTargetIndex = this.battleState.selectedEnemyIndex;
                // Go directly to pet math
                this.setPhase('pet_math');
                break;

            case 'pet_math':
                // Show pet's dedicated math problem
                this.showPetMathProblem();
                break;

            case 'pet_attack':
                // Pet executes attack
                this.executePetAttack();
                break;

            case 'enemy_turn':
                this.hideActiveHighlight();
                // Start enemy attacks from first alive enemy
                this.currentAttackingEnemyIndex = this.findNextAliveEnemy(-1);
                if (this.currentAttackingEnemyIndex >= 0) {
                    this.time.delayedCall(500, () => this.playEnemyAttack());
                } else {
                    // No alive enemies (shouldn't happen, but safety)
                    this.setPhase('player_turn');
                }
                break;

            case 'victory':
                this.hideActiveHighlight();
                this.onVictory();
                break;

            case 'defeat':
                this.hideActiveHighlight();
                this.onDefeat();
                break;
        }
    }

    private onAttackClicked(): void {
        if (this.battleState.phase === 'player_turn') {
            this.setPhase('player_math');
        }
    }

    private showAttackProblems(): void {
        const player = this.gameState.getPlayer();

        // Store equipped pet definition for pet turn (but don't include in player's attack problems)
        if (player.activePet) {
            const petsData = this.cache.json.get('pets') as PetDefinition[];
            this.equippedPetDef = petsData.find(p => p.id === player.activePet) || null;
        } else {
            this.equippedPetDef = null;
        }

        // Get equipped sword definition
        let equippedSword: ItemDefinition | null = null;
        if (player.equippedWeapon) {
            const itemsData = this.cache.json.get('items') as ItemDefinition[];
            equippedSword = itemsData.find(i => i.id === player.equippedWeapon && i.type === 'weapon') || null;
        }

        // Generate problems WITHOUT pet (pet has its own turn now)
        const problems = this.mathEngine.generateAttackProblems(player.level, null, equippedSword);
        this.battleState.currentProblems = problems;
        this.mathBoard.show(problems);
    }

    private onMathComplete(damageDealt: number, results: boolean[]): void {
        // Handle block phase completion
        if (this.isBlockPhase) {
            // Count correct answers for blocking
            let correctCount = 0;
            results.forEach((isCorrect, index) => {
                const problem = this.battleState.currentProblems[index];
                if (problem) {
                    this.mathEngine.recordResultForProblem(problem.id, isCorrect);
                }
                if (isCorrect) correctCount++;
            });
            this.blockCorrectCount = correctCount;
            this.blockAttemptsMade = results.length;

            // Update UI with final count
            const currentBlock = Math.min(this.blockCorrectCount, this.pendingDamage);
            this.blockAttemptsText.setText(`BLOKUJI: ${currentBlock} DMG`);

            // End block phase
            this.endBlockPhase();
            return;
        }

        this.mathBoard.hide();

        // Calculate total damage with multipliers
        let totalDamage = 0;

        results.forEach((isCorrect, index) => {
            const problem = this.battleState.currentProblems[index];
            if (problem) {
                // Record results for stats
                this.mathEngine.recordResultForProblem(problem.id, isCorrect);

                // Add damage with multiplier if correct
                if (isCorrect) {
                    const multiplier = problem.damageMultiplier || 1;
                    totalDamage += multiplier;
                }
            }
        });

        this.battleState.damageDealt = totalDamage;

        if (totalDamage > 0) {
            this.setPhase('player_attack');
        } else {
            this.setPhase('player_miss');
        }
    }

    private getEquippedShield(): ItemDefinition | null {
        const player = this.gameState.getPlayer();
        if (!player.equippedShield) return null;

        const items = this.cache.json.get('items') as ItemDefinition[];
        return items.find(item => item.id === player.equippedShield) || null;
    }

    private startBlockPhase(damage: number): void {
        const shield = this.getEquippedShield();
        if (!shield) {
            // No shield - apply damage directly and resume enemy attack sequence
            this.applyDamageToPlayer(damage);
            if (this.blockPhaseResumeCallback) {
                this.blockPhaseResumeCallback();
                this.blockPhaseResumeCallback = undefined;
            }
            return;
        }

        this.isBlockPhase = true;
        this.pendingDamage = damage;
        this.blockCorrectCount = 0;
        this.blockAttemptsMade = 0;
        this.blockMaxAttempts = shield.blockAttempts || 1;
        this.blockTimeRemaining = shield.blockTime || 5;

        // Show block UI
        this.blockUI.setVisible(true);
        this.blockDamageText.setText(`ÚTOK: ${damage} DMG`);
        this.blockTimerText.setText(`ČAS: ${this.blockTimeRemaining}S`);
        this.blockAttemptsText.setText(`BLOKUJI: 0 DMG`);

        // Start timer
        this.blockTimerEvent = this.time.addEvent({
            delay: 1000,
            callback: () => {
                this.blockTimeRemaining--;
                this.blockTimerText.setText(`ČAS: ${this.blockTimeRemaining}S`);

                if (this.blockTimeRemaining <= 0) {
                    this.endBlockPhase(); // endBlockPhase handles mathBoard.hide()
                }
            },
            repeat: this.blockTimeRemaining - 1,
        });

        // Generate ALL block problems at once and show them together
        const problems = this.mathEngine.generateBlockProblems(this.blockMaxAttempts, shield);
        this.battleState.currentProblems = problems;
        this.mathBoard.show(problems);
    }

    private endBlockPhase(): void {
        // Guard against being called twice (timer + answer callback race)
        if (!this.isBlockPhase) return;

        this.isBlockPhase = false;
        this.blockUI.setVisible(false);
        this.mathBoard.hide(); // Always hide math board when block phase ends

        // Stop timer
        if (this.blockTimerEvent) {
            this.blockTimerEvent.destroy();
            this.blockTimerEvent = null;
        }

        // Each correct answer blocks 1 damage, max is the shield's blockAttempts or incoming damage
        const damageBlocked = Math.min(this.blockCorrectCount, this.pendingDamage);
        const finalDamage = this.pendingDamage - damageBlocked;

        // Play defense animation if player blocked at least 1 damage
        if (damageBlocked > 0) {
            this.playHeroDefense();
        }

        // Show block result only if player actually blocked something
        if (damageBlocked > 0) {
            const blockMessage = finalDamage === 0
                ? 'ZABLOKOVÁNO!'
                : `-${damageBlocked} dmg`;

            const blockText = this.add.text(640, 180, blockMessage.toUpperCase(), {
                fontSize: '28px',
                fontFamily: 'Arial, sans-serif',
                color: '#4488ff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 4,
            }).setOrigin(0.5).setDepth(200);

            this.tweens.add({
                targets: blockText,
                alpha: 0,
                y: 100,
                duration: 1500,
                onComplete: () => blockText.destroy(),
            });
        }

        // Apply remaining damage
        this.applyDamageToPlayer(finalDamage);

        // Resume the attack sequence (continue movement, play attack anim, return enemy)
        if (this.blockPhaseResumeCallback) {
            this.blockPhaseResumeCallback();
            this.blockPhaseResumeCallback = undefined;
        }
    }

    private applyDamageToPlayer(damage: number): void {
        if (damage > 0) {
            this.battleState.playerHp -= damage;
            const player = this.gameState.getPlayer();
            this.updateHpBar(this.heroHpBar, this.battleState.playerHp, player.maxHp);

            // Hero hurt effect
            this.hero.setTint(0xff0000);
            this.time.delayedCall(100, () => {
                this.hero.clearTint();
            });
        }
        // Note: Enemy return is handled by blockPhaseResumeCallback -> returnEnemyToPosition
    }

    // Helper to get current target enemy index (first alive enemy)
    private getCurrentEnemyIndex(): number {
        const idx = this.battleState.selectedEnemyIndex;
        // If current target is dead, find next alive enemy
        if (this.battleState.enemies[idx].hp <= 0) {
            const aliveIdx = this.battleState.enemies.findIndex(e => e.hp > 0);
            if (aliveIdx >= 0) {
                this.battleState.selectedEnemyIndex = aliveIdx;
                return aliveIdx;
            }
        }
        return idx;
    }

    // Find next alive enemy after the given index (-1 to start from beginning)
    private findNextAliveEnemy(afterIndex: number): number {
        for (let i = afterIndex + 1; i < this.battleState.enemies.length; i++) {
            if (this.battleState.enemies[i].hp > 0) {
                return i;
            }
        }
        return -1; // No more alive enemies
    }

    // Check if all enemies are dead or continue battle
    private checkVictoryOrContinue(): void {
        const allDead = this.battleState.enemies.every(e => e.hp <= 0);
        if (allDead) {
            this.targetIndicator.setVisible(false);
            this.setPhase('victory');
        } else {
            // Select next alive enemy and update indicator
            this.getCurrentEnemyIndex();
            this.updateTargetIndicator();
            this.setPhase('enemy_turn');
        }
    }

    private finishEnemyAttack(): void {
        const idx = this.currentAttackingEnemyIndex;

        // Get the cached enemy position (set during create())
        const enemyPos = this.cachedSpawnPoints?.enemies[idx];
        const startX = enemyPos?.x ?? 900;
        const startY = enemyPos?.y ?? 480;

        // Slide back to starting position
        this.tweens.add({
            targets: this.enemyContainers[idx],
            x: startX,
            y: startY,
            duration: 500,
            ease: 'Quad.easeOut',
            onComplete: () => {
                // Reset depth
                this.enemyContainers[idx].setDepth(0);

                if (this.battleState.playerHp <= 0) {
                    this.setPhase('defeat');
                } else {
                    // Check if there are more enemies to attack
                    const nextEnemyIdx = this.findNextAliveEnemy(idx);
                    if (nextEnemyIdx >= 0) {
                        // More enemies to attack
                        this.currentAttackingEnemyIndex = nextEnemyIdx;
                        this.time.delayedCall(300, () => this.playEnemyAttack());
                    } else {
                        // All enemies have attacked, back to player turn
                        this.battleState.turnCount++;
                        this.setPhase('player_turn');
                    }
                }
            }
        });
    }

    private playHeroAttack(): void {
        const idx = this.getCurrentEnemyIndex();
        const enemyContainer = this.enemyContainers[idx];
        const enemySprite = this.enemies[idx];
        const enemyHpBar = this.enemyHpBars[idx];
        const animPrefix = this.enemyAnimPrefixes[idx];

        const startX = this.heroContainer.x;
        const startY = this.heroContainer.y;
        // Move to enemy's actual position (offset slightly to the left)
        const targetX = enemyContainer.x - 50;
        const targetY = enemyContainer.y;

        // Hero appears on top during attack
        this.heroContainer.setDepth(10);

        // Start animation immediately
        this.hero.play(this.playerSpriteConfig.attackAnim);

        // Get movement data from animation definition
        const attackAnim = this.animationDefs[this.playerSpriteConfig.attackAnim];
        const movement = attackAnim?.movement;
        const jumpDuration = movement?.duration || 400;
        const jumpOffsetY = movement?.offsetY || 0;
        const jumpEase = movement?.ease || 'Power1';
        const returnEase = movement?.returnEase || 'Power2';

        // X movement (horizontal dash to enemy)
        this.tweens.add({
            targets: this.heroContainer,
            x: targetX,
            duration: jumpDuration,
            ease: jumpEase,
        });

        // Y movement with jump arc (if movement type is 'jump')
        if (movement?.type === 'jump' && jumpOffsetY !== 0) {
            // Jump up during first half, land at target during second half
            this.tweens.add({
                targets: this.heroContainer,
                y: startY + jumpOffsetY,  // Jump up (negative offset = up)
                duration: jumpDuration / 2,
                ease: jumpEase,
                onComplete: () => {
                    this.tweens.add({
                        targets: this.heroContainer,
                        y: targetY,
                        duration: jumpDuration / 2,
                        ease: returnEase,
                    });
                }
            });
        } else {
            // No jump - just move directly to target Y
            this.tweens.add({
                targets: this.heroContainer,
                y: targetY,
                duration: jumpDuration,
                ease: jumpEase,
            });
        }

        // After reaching enemy position, apply damage
        this.time.delayedCall(jumpDuration, () => {
            // Apply damage (damageDealt from math problems)
            const damage = this.battleState.damageDealt;
            const enemy = this.battleState.enemies[idx];
            enemy.hp -= damage;
            this.updateHpBar(enemyHpBar, enemy.hp, enemy.maxHp);

            // Show damage number (use container position for world coords)
            const dmgText = this.add.text(enemyContainer.x, enemyContainer.y - 50, `-${damage}`, {
                fontSize: '28px',
                fontFamily: 'Arial, sans-serif',
                color: '#ff4444',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 3,
            }).setOrigin(0.5);

            this.tweens.add({
                targets: dmgText,
                y: dmgText.y - 40,
                alpha: 0,
                duration: 800,
                onComplete: () => dmgText.destroy(),
            });

            // Enemy hit effect
            enemySprite.play(`${animPrefix}-hurt`);
            enemySprite.setTint(0xff0000);
            this.time.delayedCall(100, () => {
                enemySprite.clearTint();
            });
            enemySprite.once('animationcomplete', () => {
                if (enemy.hp > 0) {
                    enemySprite.play(`${animPrefix}-idle`);
                }
            });

            // Wait for animation to finish
            this.hero.once('animationcomplete', () => {
                this.hero.play(this.playerSpriteConfig.idleAnim);

                // Return: jump arc back to start
                if (movement?.type === 'jump' && jumpOffsetY !== 0) {
                    // Jump up then land at start
                    this.tweens.add({
                        targets: this.heroContainer,
                        y: targetY + jumpOffsetY,
                        duration: 200,
                        ease: jumpEase,
                        onComplete: () => {
                            this.tweens.add({
                                targets: this.heroContainer,
                                y: startY,
                                duration: 200,
                                ease: returnEase,
                            });
                        }
                    });
                    this.tweens.add({
                        targets: this.heroContainer,
                        x: startX,
                        duration: 400,
                        ease: returnEase,
                        onComplete: () => this.finishHeroReturn(idx, enemy, enemySprite, animPrefix)
                    });
                } else {
                    // Slide back (move container)
                    this.tweens.add({
                        targets: this.heroContainer,
                        x: startX,
                        y: startY,
                        duration: 400,
                        ease: returnEase,
                        onComplete: () => this.finishHeroReturn(idx, enemy, enemySprite, animPrefix)
                    });
                }
            });
        });
    }

    private finishHeroReturn(idx: number, enemy: BattleEnemy, enemySprite: Phaser.GameObjects.Sprite, animPrefix: string): void {
        // Reset depth
        this.heroContainer.setDepth(0);

        // Check if enemy is still alive and pet is equipped for pet turn
        if (enemy.hp > 0 && this.equippedPetDef && this.petContainer) {
            // Pet gets its own turn
            this.setPhase('pet_turn');
        } else {
            this.continueAfterAttack(idx, enemy, enemySprite, animPrefix);
        }
    }

    private continueAfterAttack(idx: number, enemy: BattleEnemy, enemySprite: Phaser.GameObjects.Sprite, animPrefix: string): void {
        if (enemy.hp <= 0) {
            enemySprite.play(`${animPrefix}-death`);
            enemySprite.once('animationcomplete', () => {
                // Fade out the defeated monster after 1 second
                this.time.delayedCall(1000, () => {
                    this.tweens.add({
                        targets: this.enemyContainers[idx],
                        alpha: 0,
                        duration: 500,
                        onComplete: () => {
                            this.checkVictoryOrContinue();
                        }
                    });
                });
            });
        } else {
            this.setPhase('enemy_turn');
        }
    }

    private playHeroMiss(): void {
        // Show "MISS" text
        const missText = this.add.text(this.heroContainer.x, this.heroContainer.y - 50, 'VEDLE!', {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaaaaa',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0.5);

        this.tweens.add({
            targets: missText,
            y: missText.y - 40,
            alpha: 0,
            duration: 800,
            onComplete: () => {
                missText.destroy();
                this.setPhase('enemy_turn');
            }
        });
    }

    private playEnemyAttack(): void {
        const idx = this.currentAttackingEnemyIndex;
        const enemyContainer = this.enemyContainers[idx];
        const enemySprite = this.enemies[idx];
        const animPrefix = this.enemyAnimPrefixes[idx];
        const enemyDef = this.battleState.enemies[idx];

        const startX = enemyContainer.x;
        const startY = enemyContainer.y;
        const targetX = this.heroContainer.x + 50;
        const targetY = this.heroContainer.y;

        // Store start position for return after attack
        this.enemyAttackStartPosition = { x: startX, y: startY };

        // Get enemy attack animation movement data
        const attackAnimKey = `${animPrefix}-attack-anim`;
        const attackAnim = this.animationDefs[attackAnimKey];
        const movement = attackAnim?.movement;
        const moveDuration = movement?.duration || 400;
        const moveEase = movement?.ease || 'Power1';

        // Enemy appears on top
        enemyContainer.setDepth(10);

        // Play attack animation immediately during approach
        const attackAnimName = `${animPrefix}-attack`;
        if (this.anims.exists(attackAnimName)) {
            enemySprite.play(attackAnimName);
        }

        // Clear previous tweens array
        this.enemyAttackTweens = [];

        // Horizontal movement to hero
        const xTween = this.tweens.add({
            targets: enemyContainer,
            x: targetX,
            duration: moveDuration,
            ease: moveEase,
        });
        this.enemyAttackTweens.push(xTween);

        // Vertical movement based on movement type
        if (movement?.type === 'jump') {
            // Jump arc - simplified for pausable tween
            const jumpOffsetY = movement.offsetY || -40;
            const yTween = this.tweens.add({
                targets: enemyContainer,
                y: [startY + jumpOffsetY, targetY],
                duration: moveDuration,
                ease: 'Sine.easeInOut',
            });
            this.enemyAttackTweens.push(yTween);
        } else if (movement?.type === 'bounce') {
            // Bouncy hop - simplified
            const bounceOffsetY = movement.offsetY || -30;
            const yTween = this.tweens.add({
                targets: enemyContainer,
                y: [startY + bounceOffsetY, targetY],
                duration: moveDuration,
                ease: 'Bounce.easeOut',
            });
            this.enemyAttackTweens.push(yTween);
        } else {
            // Default/dash: direct movement
            const yTween = this.tweens.add({
                targets: enemyContainer,
                y: targetY,
                duration: moveDuration,
                ease: moveEase,
            });
            this.enemyAttackTweens.push(yTween);
        }

        // Mid-attack: pause and show block phase (100ms into movement)
        this.time.delayedCall(100, () => {
            // Pause all attack tweens
            this.enemyAttackTweens.forEach(t => t.pause());

            // Pause enemy sprite animation
            enemySprite.anims.pause();

            // Pause hero sprite animation
            this.hero.anims.pause();

            // Store resume callback for after block phase
            this.blockPhaseResumeCallback = () => {
                // Resume tweens
                this.enemyAttackTweens.forEach(t => t.resume());

                // Resume animations
                enemySprite.anims.resume();
                this.hero.anims.resume();

                // After remaining movement completes, brief pause then return
                this.time.delayedCall(moveDuration - 100, () => {
                    // Brief pause at hero (100ms), then return to idle and go back
                    this.time.delayedCall(100, () => {
                        enemySprite.play(`${animPrefix}-idle`);
                        // Return enemy to start position
                        this.returnEnemyToPosition(idx);
                    });
                });
            };

            // Start block phase
            this.startBlockPhase(enemyDef.attack);
        });
    }

    /**
     * Return enemy to their starting position after attack
     */
    private returnEnemyToPosition(idx: number): void {
        const enemyContainer = this.enemyContainers[idx];

        // Use cached spawn points for accurate return position
        const enemyPos = this.cachedSpawnPoints?.enemies[idx];
        const startX = enemyPos?.x ?? this.enemyAttackStartPosition.x;
        const startY = enemyPos?.y ?? this.enemyAttackStartPosition.y;

        this.tweens.add({
            targets: enemyContainer,
            x: startX,
            y: startY,
            duration: 300,
            ease: 'Power1',
            onComplete: () => {
                enemyContainer.setDepth(0);

                // Check if player was defeated
                if (this.battleState.playerHp <= 0) {
                    this.setPhase('defeat');
                } else {
                    // Check if there are more enemies to attack
                    const nextEnemyIdx = this.findNextAliveEnemy(idx);
                    if (nextEnemyIdx >= 0) {
                        // More enemies to attack
                        this.currentAttackingEnemyIndex = nextEnemyIdx;
                        this.time.delayedCall(300, () => this.playEnemyAttack());
                    } else {
                        // All enemies have attacked, back to player turn
                        this.battleState.turnCount++;
                        this.setPhase('player_turn');
                    }
                }
            }
        });
    }

    private onVictory(): void {
        // Victory fanfare
        const victoryText = this.add.text(640, 300, 'VÍTĚZSTVÍ!', {
            fontSize: '64px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffd700',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 6,
        }).setOrigin(0.5).setAlpha(0).setScale(0.5);

        this.tweens.add({
            targets: victoryText,
            alpha: 1,
            scale: 1,
            duration: 500,
            ease: 'Back.out'
        });

        // Calculate rewards
        const player = this.gameState.getPlayer();
        const baseXp = 20;

        // Bonus for arena
        const multiplier = this.fromArena ? 1 + (this.arenaWave * 0.2) : 1;
        const xpReward = Math.floor(baseXp * multiplier);

        // Calculate total coins from all defeated enemies
        let totalCoins = 0;
        this.enemyDefs.forEach(def => {
            // goldReward is [min, max], for fixed values they're equal
            const minReward = def.goldReward[0];
            const maxReward = def.goldReward[1];
            totalCoins += Phaser.Math.Between(minReward, maxReward);
        });

        // Update player state - award coins and XP
        ProgressionSystem.awardBattleCoin(player, totalCoins);  // Award coins from all enemies
        player.hp = this.battleState.playerHp; // Persist HP loss
        ProgressionSystem.awardXp(player, xpReward);

        // Check for pet unlocks from defeated enemies
        const petsData = this.cache.json.get('pets') as PetDefinition[];
        const newPetUnlocks: string[] = [];

        this.enemyDefs.forEach(def => {
            if (!player.unlockedPets.includes(def.id)) {
                player.unlockedPets.push(def.id);
                // Find corresponding pet
                const pet = petsData.find(p => p.unlockedByEnemy === def.id);
                if (pet) {
                    newPetUnlocks.push(pet.name);
                }
            }
        });

        // Store new unlocks for victory notification
        if (newPetUnlocks.length > 0) {
            this.registry.set('newPetUnlocks', newPetUnlocks);
        }

        // Save game
        this.gameState.save();

        this.time.delayedCall(2000, () => {
            if (this.fromArena) {
                // Check if this was the last wave (wave 5, index 4)
                if (this.arenaWave >= 4) {
                    // Track arena level completion
                    if (!player.arena.completedArenaLevels) {
                        player.arena.completedArenaLevels = [];
                    }
                    if (!player.arena.completedArenaLevels.includes(this.arenaLevel)) {
                        player.arena.completedArenaLevels.push(this.arenaLevel);

                        // Check for pet unlocks by arena level completion
                        petsData.forEach(pet => {
                            if (pet.unlockedByArenaLevel === this.arenaLevel) {
                                // Add pet ID to unlocked pets (use pet.id as marker)
                                const arenaUnlockKey = `arena_level_${this.arenaLevel}`;
                                if (!player.unlockedPets.includes(arenaUnlockKey)) {
                                    player.unlockedPets.push(arenaUnlockKey);
                                    newPetUnlocks.push(pet.name);
                                }
                            }
                        });

                        // Update registry with any new arena-based unlocks
                        if (newPetUnlocks.length > 0) {
                            this.registry.set('newPetUnlocks', newPetUnlocks);
                        }

                        this.gameState.save();
                    }

                    // Arena completed! Go to VictoryScene
                    this.scene.start('VictoryScene', {
                        arenaCompleted: true,
                        arenaLevel: this.arenaLevel,
                        nextArenaLevel: this.arenaLevel + 1,
                        playerHp: this.battleState.playerHp
                    });
                } else {
                    // Return to arena for next wave
                    this.scene.start('ArenaScene', {
                        level: this.arenaLevel,
                        wave: this.arenaWave + 1,
                        playerHp: this.battleState.playerHp
                    });
                }
            } else {
                // Return to town
                this.scene.start('TownScene');
            }
        });
    }

    private onDefeat(): void {
        // Defeat text
        const defeatText = this.add.text(640, 300, 'PORÁŽKA...', {
            fontSize: '64px',
            fontFamily: 'Arial, sans-serif',
            color: '#ff4444',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 6,
        }).setOrigin(0.5).setAlpha(0).setScale(0.5);

        this.tweens.add({
            targets: defeatText,
            alpha: 1,
            scale: 1,
            duration: 500,
            ease: 'Back.out'
        });

        // Penalty
        const player = this.gameState.getPlayer();
        player.hp = 1; // Survive with 1 HP
        player.status = 'přizabitý'; // Injured status
        this.gameState.save();

        this.time.delayedCall(3000, () => {
            this.scene.start('TownScene');
        });
    }
}
