import Phaser from 'phaser';
import { JourneySystem } from '../systems/JourneySystem';

/**
 * Data passed to the scene
 */
interface SceneData {
    riddle?: string;
    riddleEn?: string;
    answer: string;
    reward?: { gold?: number; diamonds?: number };
    objectId: string;
    roomId: string;
    parentScene: string;
}

/**
 * LetterLockPuzzleScene - A lock puzzle where players rotate letter wheels to spell the answer
 *
 * This scene appears as an overlay when the player interacts with a letter-lock chest.
 * The player must solve a riddle by rotating letter wheels to spell the correct word.
 */
export class LetterLockPuzzleScene extends Phaser.Scene {
    private journeySystem = JourneySystem.getInstance();

    // Puzzle configuration
    private riddle = '';
    private answer = '';
    private reward?: { gold?: number; diamonds?: number };
    private objectId = '';
    private roomId = '';
    private parentScene = '';

    // Letter wheels - each wheel has its own limited set of options
    private wheels: { letter: string; text: Phaser.GameObjects.Text; optionIndex: number }[] = [];
    private currentLetters: string[] = [];
    private wheelOptions: string[][] = [];  // 5 letters per wheel (including correct one)

    // Czech-friendly alphabet (simplified - no diacritics for easier typing)
    private readonly ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    private readonly OPTIONS_PER_WHEEL = 5;

    // State
    private isSolved = false;

    constructor() {
        super({ key: 'LetterLockPuzzleScene' });
    }

    init(data: SceneData): void {
        this.riddle = data.riddle || data.riddleEn || 'Solve the riddle!';
        this.answer = (data.answer || 'TEST').toUpperCase();
        this.reward = data.reward;
        this.objectId = data.objectId;
        this.roomId = data.roomId;
        this.parentScene = data.parentScene;
        this.isSolved = false;
    }

    create(): void {
        // Dim overlay
        const overlay = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.7);
        overlay.setInteractive(); // Block clicks through

        // Main panel
        this.createPanel();
        this.createRiddle();
        this.createLetterWheels();
        this.createSubmitButton();
        this.createCloseButton();

        // Initialize letters randomly
        this.initializeLetters();
    }

    private createPanel(): void {
        // Panel background
        this.add.rectangle(640, 360, 600, 450, 0x2a2a4a)
            .setStrokeStyle(4, 0x5566aa);

        // Decorative corners
        const cornerSize = 20;
        [[360, 155], [920, 155], [360, 565], [920, 565]].forEach(([x, y]) => {
            this.add.rectangle(x, y, cornerSize, cornerSize, 0x5566aa);
        });

        // Title
        this.add.text(640, 180, '🔐 TAJEMNÁ TRUHLA', {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffdd44',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);

        // Chest icon
        this.add.text(640, 140, '📦', { fontSize: '32px' }).setOrigin(0.5);
    }

    private createRiddle(): void {
        // Riddle text (wrapped)
        const riddleText = this.add.text(640, 260, `"${this.riddle}"`, {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#cccccc',
            fontStyle: 'italic',
            align: 'center',
            wordWrap: { width: 500 }
        }).setOrigin(0.5);

        // Answer length hint
        const hint = `(${this.answer.length} písmen)`;
        this.add.text(640, 310, hint, {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#888888'
        }).setOrigin(0.5);
    }

    private createLetterWheels(): void {
        const wheelCount = this.answer.length;
        const wheelWidth = 60;
        const totalWidth = wheelCount * wheelWidth + (wheelCount - 1) * 10;
        const startX = 640 - totalWidth / 2 + wheelWidth / 2;

        this.wheels = [];
        this.currentLetters = [];

        for (let i = 0; i < wheelCount; i++) {
            const x = startX + i * (wheelWidth + 10);
            this.createWheel(x, 400, i);
        }
    }

    private createWheel(x: number, y: number, index: number): void {
        // Wheel background
        const bg = this.add.rectangle(x, y, 50, 70, 0x334455)
            .setStrokeStyle(2, 0x668899);

        // Up arrow
        const upBtn = this.add.triangle(x, y - 50, 0, 15, 15, 0, -15, 0, 0x88aacc)
            .setInteractive({ useHandCursor: true });

        upBtn.on('pointerover', () => upBtn.setFillStyle(0xaaccee));
        upBtn.on('pointerout', () => upBtn.setFillStyle(0x88aacc));
        upBtn.on('pointerdown', () => this.rotateWheel(index, 1));

        // Down arrow
        const downBtn = this.add.triangle(x, y + 50, 0, -15, 15, 0, -15, 0, 0x88aacc)
            .setInteractive({ useHandCursor: true });

        downBtn.on('pointerover', () => downBtn.setFillStyle(0xaaccee));
        downBtn.on('pointerout', () => downBtn.setFillStyle(0x88aacc));
        downBtn.on('pointerdown', () => this.rotateWheel(index, -1));

        // Letter display
        const letterText = this.add.text(x, y, 'A', {
            fontSize: '32px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.wheels.push({ letter: 'A', text: letterText, optionIndex: 0 });
        this.currentLetters.push('A');
    }

    private initializeLetters(): void {
        // Generate limited options for each wheel (correct letter + 4 random others)
        this.wheelOptions = [];

        for (let i = 0; i < this.answer.length; i++) {
            const correctLetter = this.answer[i];
            const options = this.generateWheelOptions(correctLetter);
            this.wheelOptions.push(options);
        }

        // Set each wheel to a random starting position (not the correct answer)
        this.wheels.forEach((wheel, index) => {
            const options = this.wheelOptions[index];
            // Start at a random position that's NOT the correct letter
            let startIndex = Math.floor(Math.random() * options.length);
            // Make sure we don't start on the correct answer (index 0)
            if (startIndex === 0) startIndex = 1;

            wheel.optionIndex = startIndex;
            wheel.letter = options[startIndex];
            wheel.text.setText(options[startIndex]);
            this.currentLetters[index] = options[startIndex];
        });
    }

    /**
     * Generate 5 letter options for a wheel, including the correct letter
     */
    private generateWheelOptions(correctLetter: string): string[] {
        const options: string[] = [correctLetter];  // Correct letter first

        // Get random letters that aren't the correct one
        const availableLetters = this.ALPHABET.filter(l => l !== correctLetter);

        // Shuffle and take 4 more
        for (let i = availableLetters.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [availableLetters[i], availableLetters[j]] = [availableLetters[j], availableLetters[i]];
        }

        options.push(...availableLetters.slice(0, this.OPTIONS_PER_WHEEL - 1));

        // Shuffle all options so correct isn't always first
        for (let i = options.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [options[i], options[j]] = [options[j], options[i]];
        }

        return options;
    }

    private rotateWheel(index: number, direction: 1 | -1): void {
        if (this.isSolved) return;

        const wheel = this.wheels[index];
        const options = this.wheelOptions[index];

        // Cycle through the limited options (only 5 letters)
        const newOptionIndex = (wheel.optionIndex + direction + options.length) % options.length;
        const newLetter = options[newOptionIndex];

        // Update state
        wheel.optionIndex = newOptionIndex;
        wheel.letter = newLetter;
        this.currentLetters[index] = newLetter;

        // Animate the change
        this.tweens.add({
            targets: wheel.text,
            y: wheel.text.y + (direction > 0 ? -20 : 20),
            alpha: 0,
            duration: 100,
            onComplete: () => {
                wheel.text.setText(newLetter);
                wheel.text.y = 400 + (direction > 0 ? 20 : -20);
                this.tweens.add({
                    targets: wheel.text,
                    y: 400,
                    alpha: 1,
                    duration: 100
                });
            }
        });

        // Play click sound (if available)
        // this.sound.play('click');
    }

    private createSubmitButton(): void {
        const btn = this.add.container(640, 510);

        const bg = this.add.rectangle(0, 0, 180, 50, 0x446644)
            .setStrokeStyle(3, 0x66aa66);

        const text = this.add.text(0, 0, '✓ OTEVŘÍT', {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        btn.add([bg, text]);
        btn.setSize(180, 50);
        btn.setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => bg.setFillStyle(0x558855));
        btn.on('pointerout', () => bg.setFillStyle(0x446644));
        btn.on('pointerdown', () => this.checkAnswer());
    }

    private createCloseButton(): void {
        const closeBtn = this.add.text(920, 155, '✕', {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#aa6666'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        closeBtn.on('pointerover', () => closeBtn.setColor('#ff8888'));
        closeBtn.on('pointerout', () => closeBtn.setColor('#aa6666'));
        closeBtn.on('pointerdown', () => this.closeWithoutSolving());
    }

    private checkAnswer(): void {
        if (this.isSolved) return;

        const playerAnswer = this.currentLetters.join('');

        if (playerAnswer === this.answer) {
            this.handleSuccess();
        } else {
            this.handleWrongAnswer();
        }
    }

    private handleSuccess(): void {
        this.isSolved = true;

        // Mark as completed in journey system
        this.journeySystem.setObjectState(this.roomId, this.objectId, {
            interacted: true,
            completed: true,
            looted: true
        });

        // Add rewards
        if (this.reward) {
            if (this.reward.gold) {
                this.journeySystem.addRewards(0, this.reward.gold);
            }
            if (this.reward.diamonds) {
                this.journeySystem.addRewards(0, 0, this.reward.diamonds);
            }
        }

        // Visual feedback - green flash on wheels
        this.wheels.forEach(wheel => {
            this.tweens.add({
                targets: wheel.text,
                scaleX: 1.3,
                scaleY: 1.3,
                duration: 200,
                yoyo: true
            });
            wheel.text.setColor('#44ff44');
        });

        // Success message
        const successText = this.add.text(640, 360, '✓ SPRÁVNĚ!', {
            fontSize: '36px',
            fontFamily: 'Arial, sans-serif',
            color: '#44ff44',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5).setAlpha(0);

        this.tweens.add({
            targets: successText,
            alpha: 1,
            scaleX: 1.2,
            scaleY: 1.2,
            duration: 300,
            yoyo: true,
            hold: 500
        });

        // Show reward
        if (this.reward) {
            const rewardParts: string[] = [];
            if (this.reward.gold) rewardParts.push(`+${this.reward.gold} 💰`);
            if (this.reward.diamonds) rewardParts.push(`+${this.reward.diamonds} 💎`);

            this.time.delayedCall(600, () => {
                const rewardText = this.add.text(640, 420, rewardParts.join('  '), {
                    fontSize: '24px',
                    fontFamily: 'Arial, sans-serif',
                    color: '#ffdd44',
                    fontStyle: 'bold',
                    stroke: '#000000',
                    strokeThickness: 3
                }).setOrigin(0.5);

                this.tweens.add({
                    targets: rewardText,
                    y: 380,
                    duration: 1000
                });
            });
        }

        // Close after delay
        this.time.delayedCall(2000, () => {
            this.closeAndReturn(true);
        });
    }

    private handleWrongAnswer(): void {
        // Visual feedback - red flash and shake
        this.wheels.forEach((wheel, i) => {
            const originalColor = wheel.text.style.color;
            wheel.text.setColor('#ff4444');

            this.tweens.add({
                targets: wheel.text,
                x: wheel.text.x + 5,
                duration: 50,
                yoyo: true,
                repeat: 3,
                onComplete: () => {
                    wheel.text.setColor('#ffffff');
                }
            });
        });

        // Wrong message
        const wrongText = this.add.text(640, 360, '✗ ŠPATNĚ', {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#ff4444',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);

        this.tweens.add({
            targets: wrongText,
            alpha: 0,
            y: 320,
            duration: 1000,
            delay: 500,
            onComplete: () => wrongText.destroy()
        });
    }

    private closeWithoutSolving(): void {
        this.closeAndReturn(false);
    }

    private closeAndReturn(solved: boolean): void {
        // Fade out
        this.cameras.main.fadeOut(200, 0, 0, 0);

        this.cameras.main.once('camerafadeoutcomplete', () => {
            // Resume parent scene
            this.scene.resume(this.parentScene);

            // If solved, tell parent to update (remove chest)
            if (solved) {
                this.scene.get(this.parentScene).events.emit('puzzleSolved', {
                    objectId: this.objectId,
                    roomId: this.roomId
                });
            }

            this.scene.stop();
        });
    }
}
