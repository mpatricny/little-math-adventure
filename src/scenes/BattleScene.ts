import Phaser from 'phaser';
import { BattleState, BattlePhase, EnemyDefinition } from '../types';
import { MathEngine } from '../systems/MathEngine';
import { MathBoard } from '../ui/MathBoard';
import { GameStateManager } from '../systems/GameStateManager';
import { ProgressionSystem } from '../systems/ProgressionSystem';

class HUD {
    private playerHpText: Phaser.GameObjects.Text;
    private enemyHpText: Phaser.GameObjects.Text;

    constructor(private scene: Phaser.Scene, state: BattleState, private playerMaxHp: number) {
        this.playerHpText = this.scene.add.text(20, 20, `HP: ${state.playerHp}/${playerMaxHp}`, { fontSize: '20px', color: '#fff' });
        this.enemyHpText = this.scene.add.text(600, 20, `Enemy: ${state.enemyHp}/${state.enemyMaxHp}`, { fontSize: '20px', color: '#fff' });
    }

    updatePlayerHp(hp: number, maxHp: number) {
        this.playerHpText.setText(`HP: ${hp}/${maxHp}`);
    }

    updateEnemyHp(hp: number, maxHp: number) {
        this.enemyHpText.setText(`Enemy: ${hp}/${maxHp}`);
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

    // Systems
    private mathEngine!: MathEngine;
    private gameState!: GameStateManager;

    // State
    private battleState!: BattleState;
    private currentEnemy!: EnemyDefinition;

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

        // Enemy (right side) - moved closer
        this.enemy = this.add.sprite(550, 400, 'slime')
            .setScale(0.5)
            .play('slime-idle');

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

                // Enemy hit effect
                this.tweens.add({
                    targets: this.enemy,
                    tint: 0xff0000,
                    duration: 100,
                    yoyo: true,
                    onComplete: () => this.enemy.clearTint(),
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
                                this.setPhase('victory');
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
        const startX = this.enemy.x;
        const targetX = this.hero.x; // Overlap hero

        // 1. Fast Rush
        this.tweens.add({
            targets: this.enemy,
            x: targetX,
            duration: 250, // Fast!
            ease: 'Quad.easeIn',
            onComplete: () => {
                // Impact
                const damage = this.currentEnemy.attack;
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

                // 2. Quick Retract (Bounce)
                this.tweens.add({
                    targets: this.enemy,
                    x: targetX + 100, // Bounce back a bit
                    duration: 150,
                    ease: 'Quad.easeOut',
                    onComplete: () => {
                        // 3. Slow Return
                        this.tweens.add({
                            targets: this.enemy,
                            x: startX,
                            duration: 600,
                            ease: 'Linear',
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
                });
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
