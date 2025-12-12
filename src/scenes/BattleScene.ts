import Phaser from 'phaser';
import { BattleState, BattlePhase, BattleEnemy, EnemyDefinition, ItemDefinition, PetDefinition, MathProblem } from '../types';
import { MathEngine } from '../systems/MathEngine';
import { MathBoard } from '../ui/MathBoard';
import { GameStateManager } from '../systems/GameStateManager';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { SceneDebugger } from '../systems/SceneDebugger';
import { SceneBuilder } from '../systems/SceneBuilder';

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

    // Universal debugger
    private debugger!: SceneDebugger;

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

    constructor() {
        super({ key: 'BattleScene' });
    }

    // Arena mode data
    private fromArena: boolean = false;
    private arenaLevel: number = 1;
    private arenaWave: number = 0;

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

        // Create hero container with sprite and HP bar
        this.heroContainer = this.add.container(heroX, heroY);
        this.hero = this.add.sprite(0, 0, 'knight').setScale(0.6).play('knight-idle');
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

            const container = this.add.container(x, y);
            const sprite = this.add.sprite(0, 0, def.spriteKey).setScale(0.5).play(`${animPrefix}-idle`);
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

        // Create pet sprite - flipped horizontally (facing right like hero), 1/3 scale
        // Use spriteKey (spritesheet) with frame 0, then play idle animation
        this.petSprite = this.add.sprite(0, 0, petDef.spriteKey, 0)
            .setScale(0.2)  // 1/3 of enemy size (0.5 * 0.4 ≈ 0.2)
            .setFlipX(true);  // Flip to face right (same direction as hero)

        // Play idle animation if it exists
        const idleAnim = `${petDef.animPrefix}-idle`;
        if (this.anims.exists(idleAnim)) {
            this.petSprite.play(idleAnim);
        }

        this.petContainer.add(this.petSprite);
        this.petContainer.setDepth(-1);  // Behind hero

        // Add subtle idle bobbing animation
        this.tweens.add({
            targets: this.petContainer,
            y: petY - 5,
            duration: 1200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.inOut'
        });
    }

    /**
     * Play pet attack animation (called when pet problem is answered correctly)
     */
    playPetAttack(): void {
        if (!this.petSprite || !this.equippedPetDef || !this.petContainer) return;

        const animPrefix = this.equippedPetDef.animPrefix;

        // Jump forward animation
        const startX = this.petContainer.x;
        const startY = this.petContainer.y;

        this.tweens.add({
            targets: this.petContainer,
            x: startX + 60,
            y: startY - 30,
            duration: 200,
            ease: 'Quad.easeOut',
            onComplete: () => {
                // Play attack animation if available
                const attackAnim = `${animPrefix}-attack`;
                if (this.anims.exists(attackAnim)) {
                    this.petSprite!.play(attackAnim);
                    this.petSprite!.once('animationcomplete', () => {
                        this.petSprite!.play(`${animPrefix}-idle`);
                    });
                }

                // Return to position
                this.tweens.add({
                    targets: this.petContainer,
                    x: startX,
                    y: startY,
                    duration: 300,
                    ease: 'Quad.easeIn'
                });
            }
        });
    }

    private setupDebugger(): void {
        this.debugger = new SceneDebugger(this, 'BattleScene');

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

            case 'enemy_turn':
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

    private showAttackProblems(): void {
        const player = this.gameState.getPlayer();

        // Get equipped pet definition
        let equippedPet: PetDefinition | null = null;
        if (player.activePet) {
            const petsData = this.cache.json.get('pets') as PetDefinition[];
            equippedPet = petsData.find(p => p.id === player.activePet) || null;
        }

        // Get equipped sword definition
        let equippedSword: ItemDefinition | null = null;
        if (player.equippedWeapon) {
            const itemsData = this.cache.json.get('items') as ItemDefinition[];
            equippedSword = itemsData.find(i => i.id === player.equippedWeapon && i.type === 'weapon') || null;
        }

        const problems = this.mathEngine.generateAttackProblems(player.level, equippedPet, equippedSword);
        this.battleState.currentProblems = problems;
        this.mathBoard.show(problems);
    }

    private onMathComplete(damageDealt: number, results: boolean[]): void {
        this.mathBoard.hide();

        // Calculate total damage with multipliers
        let totalDamage = 0;
        let petAttacked = false;

        results.forEach((isCorrect, index) => {
            const problem = this.battleState.currentProblems[index];
            if (problem) {
                // Record results for stats
                this.mathEngine.recordResultForProblem(problem.id, isCorrect);

                // Add damage with multiplier if correct
                if (isCorrect) {
                    const multiplier = problem.damageMultiplier || 1;
                    totalDamage += multiplier;

                    // Trigger pet attack animation if this was the pet's problem
                    if (problem.source === 'pet' && !petAttacked) {
                        petAttacked = true;
                        this.playPetAttack();
                    }
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

    private onBlockAnswer(isCorrect: boolean): void {
        this.blockAttemptsMade++;

        if (isCorrect) {
            this.blockCorrectCount++;
        }

        // Record result
        this.mathEngine.recordResult(isCorrect);

        // Update UI - show how much damage is being blocked
        const currentBlock = Math.min(this.blockCorrectCount, this.pendingDamage);
        this.blockAttemptsText.setText(`BLOKUJI: ${currentBlock} DMG`);

        // Check if we should continue or end
        if (this.blockAttemptsMade >= this.blockMaxAttempts || this.blockTimeRemaining <= 0) {
            this.endBlockPhase();
        } else {
            // Show next problem (use block problem)
            const problem = this.mathEngine.generateBlockProblem();
            this.mathBoard.showSingle(problem, this.onBlockAnswer.bind(this));
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
            this.applyDamageToPlayer(damage);
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

        // Show first problem (use block problem for shield)
        const problem = this.mathEngine.generateBlockProblem();
        this.mathBoard.showSingle(problem, this.onBlockAnswer.bind(this));
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

        // Continue with enemy return animation
        this.finishEnemyAttack();
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
        this.hero.play('knight-attack');

        // Get movement data from animation definition
        const attackAnim = this.animationDefs['knight-attack'];
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
                this.hero.play('knight-idle');

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

        // Get enemy attack animation movement data
        const attackAnimKey = `${animPrefix}-attack-anim`;
        const attackAnim = this.animationDefs[attackAnimKey];
        const movement = attackAnim?.movement;
        const moveDuration = movement?.duration || 400;
        const moveEase = movement?.ease || 'Power1';

        // Enemy appears on top
        enemyContainer.setDepth(10);

        // Horizontal movement to hero
        this.tweens.add({
            targets: enemyContainer,
            x: targetX,
            duration: moveDuration,
            ease: moveEase,
        });

        // Vertical movement based on movement type
        if (movement?.type === 'jump') {
            // Jump arc
            const jumpOffsetY = movement.offsetY || -40;
            this.tweens.add({
                targets: enemyContainer,
                y: startY + jumpOffsetY,
                duration: moveDuration / 2,
                ease: moveEase,
                onComplete: () => {
                    this.tweens.add({
                        targets: enemyContainer,
                        y: targetY,
                        duration: moveDuration / 2,
                        ease: movement.returnEase || 'Power1',
                    });
                }
            });
        } else if (movement?.type === 'bounce') {
            // Bouncy hop
            const bounceOffsetY = movement.offsetY || -30;
            this.tweens.add({
                targets: enemyContainer,
                y: startY + bounceOffsetY,
                duration: moveDuration / 2,
                ease: 'Quad.easeOut',
                yoyo: true,
                onComplete: () => {
                    this.tweens.add({
                        targets: enemyContainer,
                        y: targetY,
                        duration: moveDuration / 4,
                        ease: 'Bounce.easeOut',
                    });
                }
            });
        } else if (movement?.type === 'dash') {
            // Quick horizontal dash (no vertical movement)
            this.tweens.add({
                targets: enemyContainer,
                y: targetY,
                duration: moveDuration,
                ease: moveEase,
            });
        } else {
            // Default: direct movement
            this.tweens.add({
                targets: enemyContainer,
                y: targetY,
                duration: moveDuration,
                ease: moveEase,
            });
        }

        // After movement, play attack animation and trigger damage
        this.time.delayedCall(moveDuration, () => {
            // Attack animation
            enemySprite.play(`${animPrefix}-attack`);

            // Wait for attack frame or delay
            this.time.delayedCall(200, () => {
                // Trigger block phase instead of immediate damage
                this.startBlockPhase(enemyDef.attack);
            });

            enemySprite.once('animationcomplete', () => {
                enemySprite.play(`${animPrefix}-idle`);
            });
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

        // Update player state - award coins and XP
        ProgressionSystem.awardBattleCoin(player);  // Award 1 small copper per battle
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
