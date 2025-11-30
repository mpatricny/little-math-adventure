import Phaser from 'phaser';
import { BattleState, BattlePhase, EnemyDefinition } from '../types';

// Stub classes for Phase 1
class MathEngine {
    constructor(_registry: Phaser.Data.DataManager) { }
    generateProblem() { return null; }
    recordResult(_isCorrect: boolean) { }
}

class MathBoard {
    constructor(_scene: Phaser.Scene, _onAnswer: (isCorrect: boolean) => void) { }
    show(_problem: any) { }
    hide() { }
    showCorrectAnswer(_problem: any) { }
}

class HUD {
    constructor(private scene: Phaser.Scene, _state: BattleState) {
        this.scene.add.text(20, 20, 'HP: 100/100', { fontSize: '20px', color: '#fff' });
        this.scene.add.text(600, 20, 'Enemy: ???', { fontSize: '20px', color: '#fff' });
    }
    updatePlayerHp(_hp: number) { }
    updateEnemyHp(_hp: number, _maxHp: number) { }
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
                // For Phase 1, skip math and go straight to attack
                this.attackButton.setVisible(false);
                this.setPhase('player_attack');
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
        const targetX = this.enemy.x - 80; // Land slightly in front of enemy

        // X movement (linear)
        this.tweens.add({
            targets: this.hero,
            x: targetX,
            duration: 400,
            ease: 'Power1',
            onComplete: () => {
                // Landed, play attack animation
                this.hero.play('knight-attack');

                // Impact frame logic (approximate)
                this.time.delayedCall(200, () => {
                    // Damage enemy
                    const damage = this.registry.get('playerAttack') || 10;
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
                });

                this.hero.once('animationcomplete', () => {
                    this.hero.play('knight-idle');

                    // Slide back
                    this.tweens.add({
                        targets: this.hero,
                        x: startX,
                        y: startY, // Ensure Y is reset
                        duration: 400,
                        ease: 'Power2',
                        onComplete: () => {
                            // Check victory
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

        // Y movement (Jump arc) - separate tween for arc effect
        this.tweens.add({
            targets: this.hero,
            y: startY - 100,
            duration: 200,
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
        const targetX = this.hero.x + 80; // Stop in front of hero

        // Slide to hero
        this.tweens.add({
            targets: this.enemy,
            x: targetX,
            duration: 600,
            ease: 'Power2', // Rush in
            onComplete: () => {
                // Attack impact
                const damage = this.currentEnemy.attack;
                this.battleState.playerHp -= damage;
                this.hud.updatePlayerHp(this.battleState.playerHp);

                // Hero hurt effect
                this.tweens.add({
                    targets: this.hero,
                    tint: 0xff0000,
                    duration: 100,
                    yoyo: true,
                    onComplete: () => this.hero.clearTint(),
                });

                // Slide back
                this.tweens.add({
                    targets: this.enemy,
                    x: startX,
                    duration: 600,
                    delay: 200, // Wait a moment at impact
                    ease: 'Power2',
                    onComplete: () => {
                        // Check defeat
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

    private onVictory(): void {
        // this.sound.play('sfx-victory');

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
