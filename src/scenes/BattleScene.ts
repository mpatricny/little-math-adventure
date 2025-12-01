import Phaser from 'phaser';
import { BattleState, BattlePhase, EnemyDefinition, ItemDefinition } from '../types';
import { MathEngine } from '../systems/MathEngine';
import { MathBoard } from '../ui/MathBoard';
import { GameStateManager } from '../systems/GameStateManager';
import { ProgressionSystem } from '../systems/ProgressionSystem';

class HUD {
    private playerHpText: Phaser.GameObjects.Text;
    private enemyHpText: Phaser.GameObjects.Text;

    constructor(private scene: Phaser.Scene, state: BattleState, private playerMaxHp: number) {
        this.playerHpText = this.scene.add.text(20, 20, `HP: ${state.playerHp}/${playerMaxHp}`, { fontSize: '20px', fontFamily: 'Arial, sans-serif', color: '#fff' });
        this.enemyHpText = this.scene.add.text(600, 20, `NEPŘÍTEL: ${state.enemyHp}/${state.enemyMaxHp}`, { fontSize: '20px', fontFamily: 'Arial, sans-serif', color: '#fff' });
    }

    updatePlayerHp(hp: number, maxHp: number) {
        this.playerHpText.setText(`HP: ${hp}/${maxHp}`);
    }

    updateEnemyHp(hp: number, maxHp: number) {
        this.enemyHpText.setText(`NEPŘÍTEL: ${hp}/${maxHp}`);
    }
}

export class BattleScene extends Phaser.Scene {
    // Sprites
    private hero!: Phaser.GameObjects.Sprite;
    private enemy!: Phaser.GameObjects.Sprite;

    // UI Components
    private mathBoard!: MathBoard;
    private hud!: HUD;
    private attackButton!: Phaser.GameObjects.Container;
    private blockUI!: Phaser.GameObjects.Container;
    private blockDamageText!: Phaser.GameObjects.Text;
    private blockTimerText!: Phaser.GameObjects.Text;
    private blockAttemptsText!: Phaser.GameObjects.Text;

    // Systems
    private mathEngine!: MathEngine;
    private gameState!: GameStateManager;

    // State
    private battleState!: BattleState;
    private currentEnemy!: EnemyDefinition;
    private enemyAnimPrefix!: string;

    // Block state
    private isBlockPhase: boolean = false;
    private blockCorrectCount: number = 0;
    private blockMaxAttempts: number = 0;
    private blockAttemptsMade: number = 0;
    private blockTimeRemaining: number = 0;
    private blockTimerEvent: Phaser.Time.TimerEvent | null = null;
    private pendingDamage: number = 0;

    constructor() {
        super({ key: 'BattleScene' });
    }

    init(data: { enemyId: string }): void {
        // Get global game state
        this.gameState = GameStateManager.getInstance();
        const player = this.gameState.getPlayer();

        // Get enemy data from JSON
        const enemies = this.cache.json.get('enemies') as EnemyDefinition[];
        this.currentEnemy = enemies.find(e => e.id === data.enemyId) || enemies[0];

        // Derive animation prefix from spriteKey
        // e.g., "slime" -> "slime", "purple-attack" -> "purple"
        const spriteKey = this.currentEnemy.spriteKey;
        this.enemyAnimPrefix = spriteKey.includes('-') ? spriteKey.split('-')[0] : spriteKey;

        // Initialize battle state with actual player stats
        this.battleState = {
            phase: 'start',
            playerHp: player.hp,
            enemyHp: this.currentEnemy.hp,
            enemyMaxHp: this.currentEnemy.hp,
            currentProblem: null,
            turnCount: 0,
        };
    }

    create(): void {
        // Background
        this.add.image(400, 300, 'bg-battle').setDisplaySize(800, 600);

        // Hero (left side) - moved closer
        this.hero = this.add.sprite(250, 400, 'knight')
            .setScale(0.5)
            .play('knight-idle');

        // Enemy (right side) - use enemy's sprite and animation
        this.enemy = this.add.sprite(550, 400, this.currentEnemy.spriteKey)
            .setScale(0.5)
            .play(`${this.enemyAnimPrefix}-idle`);

        // Initialize systems
        this.mathEngine = new MathEngine(this.registry);

        // Create UI
        const player = this.gameState.getPlayer();
        this.hud = new HUD(this, this.battleState, player.maxHp);

        // Force HUD update immediately to show correct starting HP
        this.hud.updatePlayerHp(this.battleState.playerHp, player.maxHp);
        this.hud.updateEnemyHp(this.battleState.enemyHp, this.battleState.enemyMaxHp);

        this.mathBoard = new MathBoard(this, this.onAnswerSelected.bind(this));
        this.createAttackButton();
        this.createBlockUI();

        // Start battle
        this.time.delayedCall(500, () => this.setPhase('player_turn'));
    }

    private createBlockUI(): void {
        this.blockUI = this.add.container(400, 80);
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
        const button = this.add.rectangle(400, 550, 150, 50, 0x44aa44)
            .setInteractive({ useHandCursor: true });

        const text = this.add.text(400, 550, 'ÚTOK', {
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

        // Check if we're in block phase
        if (this.isBlockPhase) {
            this.onBlockAnswer(isCorrect);
            return;
        }

        if (isCorrect) {
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

        // Update UI - show how much damage is being blocked
        const currentBlock = Math.min(this.blockCorrectCount, this.pendingDamage);
        this.blockAttemptsText.setText(`BLOKUJI: ${currentBlock} DMG`);

        // Check if we should continue or end
        if (this.blockAttemptsMade >= this.blockMaxAttempts || this.blockTimeRemaining <= 0) {
            this.endBlockPhase();
        } else {
            // Show next problem
            const problem = this.mathEngine.generateProblem();
            this.mathBoard.show(problem);
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
                    this.mathBoard.hide();
                    this.endBlockPhase();
                }
            },
            repeat: this.blockTimeRemaining - 1,
        });

        // Show first problem
        const problem = this.mathEngine.generateProblem();
        this.mathBoard.show(problem);
    }

    private endBlockPhase(): void {
        this.isBlockPhase = false;
        this.blockUI.setVisible(false);

        // Stop timer
        if (this.blockTimerEvent) {
            this.blockTimerEvent.destroy();
            this.blockTimerEvent = null;
        }

        // Each correct answer blocks 1 damage, max is the shield's blockAttempts or incoming damage
        const damageBlocked = Math.min(this.blockCorrectCount, this.pendingDamage);
        const finalDamage = this.pendingDamage - damageBlocked;

        // Show block result
        if (damageBlocked > 0) {
            const blockMessage = finalDamage === 0
                ? 'ZABLOKOVÁNO!'
                : `-${damageBlocked} dmg`;

            const blockText = this.add.text(400, 150, blockMessage.toUpperCase(), {
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
            this.hud.updatePlayerHp(this.battleState.playerHp, player.maxHp);

            // Hero hurt effect
            this.tweens.add({
                targets: this.hero,
                tint: 0xff0000,
                duration: 100,
                yoyo: true,
                onComplete: () => this.hero.clearTint(),
            });
        }

        // Continue with enemy return animation
        this.finishEnemyAttack();
    }

    private finishEnemyAttack(): void {
        const startX = 550; // Enemy start position

        // Slide back to starting position
        this.tweens.add({
            targets: this.enemy,
            x: startX,
            duration: 500,
            ease: 'Quad.easeOut',
            onComplete: () => {
                if (this.battleState.playerHp <= 0) {
                    this.setPhase('defeat');
                } else {
                    this.battleState.turnCount++;
                    this.setPhase('player_turn');
                }
            }
        });
    }

    private playHeroAttack(): void {
        const startX = this.hero.x;
        const startY = this.hero.y;
        const targetX = this.enemy.x - 50; // Overlap slightly or get very close

        // Start animation immediately (windup during jump)
        this.hero.play('knight-attack');

        // Jump duration synced to reach impact frame (approx frame 4-5)
        const jumpDuration = 400;

        // X movement (Jump forward)
        this.tweens.add({
            targets: this.hero,
            x: targetX,
            duration: jumpDuration,
            ease: 'Power1',
            onComplete: () => {
                // Landed - Impact!
                // Damage enemy
                const player = this.gameState.getPlayer();
                const damage = player.attack;
                this.battleState.enemyHp -= damage;
                this.hud.updateEnemyHp(this.battleState.enemyHp, this.battleState.enemyMaxHp);

                // Enemy hit effect - play hurt animation
                this.enemy.play(`${this.enemyAnimPrefix}-hurt`);
                this.tweens.add({
                    targets: this.enemy,
                    tint: 0xff0000,
                    duration: 100,
                    yoyo: true,
                    onComplete: () => {
                        this.enemy.clearTint();
                        // Return to idle after hurt animation
                        this.enemy.once('animationcomplete', () => {
                            this.enemy.play(`${this.enemyAnimPrefix}-idle`);
                        });
                    },
                });

                // Wait for animation to finish (last few frames play at enemy position)
                this.hero.once('animationcomplete', () => {
                    this.hero.play('knight-idle');

                    // Slide back
                    this.tweens.add({
                        targets: this.hero,
                        x: startX,
                        duration: 400,
                        ease: 'Power2',
                        onComplete: () => {
                            if (this.battleState.enemyHp <= 0) {
                                // Play enemy death animation
                                this.enemy.play(`${this.enemyAnimPrefix}-death`);
                                this.enemy.once('animationcomplete', () => {
                                    this.setPhase('victory');
                                });
                            } else {
                                this.setPhase('enemy_turn');
                            }
                        }
                    });
                });
            }
        });

        // Y movement (Jump arc)
        this.tweens.add({
            targets: this.hero,
            y: startY - 60,
            duration: jumpDuration / 2, // Up then down
            yoyo: true,
            ease: 'Sine.easeOut',
        });
    }

    private playHeroMiss(): void {
        // this.sound.play('sfx-miss');

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
        const targetX = this.hero.x; // Overlap hero

        // Play attack animation
        this.enemy.play(`${this.enemyAnimPrefix}-attack-anim`);

        // 1. Rush toward hero (attack animation plays)
        this.tweens.add({
            targets: this.enemy,
            x: targetX,
            duration: 400, // Slower to let animation play
            ease: 'Quad.easeIn',
            onComplete: () => {
                // Impact - switch to idle
                this.enemy.play(`${this.enemyAnimPrefix}-idle`);

                // Calculate damage (enemy attack minus player defense)
                const player = this.gameState.getPlayer();
                const damage = Math.max(1, this.currentEnemy.attack - player.defense);
                this.startBlockPhase(damage);
            }
        });
    }

    private onVictory(): void {
        // this.sound.play('sfx-victory');

        // Update player state with battle results
        const player = this.gameState.getPlayer();
        player.hp = this.battleState.playerHp; // Save current HP

        // Calculate and award rewards
        const xpReward = this.currentEnemy.xpReward;
        const [minGold, maxGold] = this.currentEnemy.goldReward;
        const goldReward = ProgressionSystem.getRandomGold(minGold, maxGold);

        // Award XP and check for level-up
        const levelUpResult = ProgressionSystem.awardXp(player, xpReward);

        // Award gold
        ProgressionSystem.awardGold(player, goldReward);

        // Save game state
        this.gameState.save();

        // Pass to victory scene
        this.scene.start('VictoryScene', {
            xpReward,
            goldReward,
            enemyName: this.currentEnemy.name,
            levelUpResult,
        });
    }

    private onDefeat(): void {
        // Set player to defeated state
        const player = this.gameState.getPlayer();
        ProgressionSystem.setDefeated(player);

        // Save game state
        this.gameState.save();

        // Fade to black, return to town
        this.cameras.main.fadeOut(1000, 0, 0, 0);
        this.time.delayedCall(1000, () => {
            this.scene.start('TownScene', { defeated: true });
        });
    }
}
