import Phaser from 'phaser';
import { JourneySystem } from '../systems/JourneySystem';
import { SceneBuilder } from '../systems/SceneBuilder';

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
 * SpinLockPuzzleScene - Template-based letter lock puzzle overlay.
 *
 * Uses "Spin frame" + "spin-4" templates from the scene editor.
 * Each letter wheel cycles through 5 options with a carousel animation.
 */
export class SpinLockPuzzleScene extends Phaser.Scene {
    private journeySystem = JourneySystem.getInstance();
    private sceneBuilder!: SceneBuilder;

    // Puzzle data
    private riddle = '';
    private answer = '';
    private reward?: { gold?: number; diamonds?: number };
    private objectId = '';
    private roomId = '';
    private parentScene = '';

    // Wheel state
    private readonly ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    private readonly OPTIONS_PER_WHEEL = 5;
    private wheelOptions: string[][] = [];
    private currentIndices: number[] = [];
    private currentLetters: string[] = [];
    private wheelTexts: Phaser.GameObjects.Text[] = [];
    private wheelLayers: Phaser.GameObjects.Image[] = [];
    private isAnimating: boolean[] = [];
    private clipHeight = 56; // from marker-2-container, set in setupWheels

    // State
    private isSolved = false;

    // Template text area IDs
    private static readonly FRAME_BUTTON_TEXT_ID = '1770852293801-rg3dlveug';   // "OPEN" on button
    private static readonly FRAME_TITLE_TEXT_ID = '1770852383215-0rdg3l638';    // Title
    private static readonly FRAME_RIDDLE_TEXT_ID = '1770852558035-agtscuz25';   // Riddle body
    private static readonly WHEEL_TEXT_IDS = [
        '1770851601787-mpc1qghjz',  // wh1 text
        '1770851726678-g0oyxfb0n',  // wh2 text
        '1770851727662-s0c0vplet',  // wh3 text
        '1770851728453-sopqmr190',  // wh4 text
    ];
    // Layer IDs (NOT names — layerObjects map is keyed by layer.id)
    private static readonly WHEEL_LAYER_IDS = [
        '1770851454756-lbmpzzno5',  // wh1
        '1770851487140-wi7oqh6xo',  // wh2
        '1770851505433-f1p9bs0sf',  // wh3
        '1770851527922-0wsj2412v',  // wh4
    ];
    private static readonly BUTTON_LAYER_ID = '1770852193477-f1e43lfj7'; // "button to press"

    constructor() {
        super({ key: 'SpinLockPuzzleScene' });
    }

    init(data: SceneData): void {
        this.riddle = data.riddle || data.riddleEn || 'Solve the riddle!';
        this.answer = (data.answer || 'TEST').toUpperCase();
        this.reward = data.reward;
        this.objectId = data.objectId;
        this.roomId = data.roomId;
        this.parentScene = data.parentScene;
        this.isSolved = false;
        this.wheelTexts = [];
        this.wheelLayers = [];
        this.wheelOptions = [];
        this.currentIndices = [];
        this.currentLetters = [];
        this.isAnimating = [];
    }

    create(): void {
        // Dark overlay — interactive to block clicks from reaching the paused parent scene.
        // Paused scenes may still process input in Phaser 3.
        // Set at depth 0; template containers are elevated to depth 10 so their
        // interactive layers get priority over the overlay.
        const overlay = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.7);
        overlay.setDepth(0);
        overlay.setInteractive();
        this.input.setDefaultCursor('default');

        // Build templates from scenes.json
        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.buildScene('SpinLockPuzzleScene');

        // Elevate template containers above the overlay for input priority
        const spinFrame = this.sceneBuilder.get<Phaser.GameObjects.Container>('Spin frame');
        const spin4 = this.sceneBuilder.get<Phaser.GameObjects.Container>('spin-4');
        if (spinFrame) spinFrame.setDepth(10);
        if (spin4) spin4.setDepth(10);

        this.setupFrameTexts();
        this.setupWheels();
        this.setupButton();
        this.setupCloseButton();
    }

    // ─── Frame text setup ───────────────────────────────────

    private setupFrameTexts(): void {
        const frameContainer = this.sceneBuilder.get<Phaser.GameObjects.Container>('Spin frame');
        if (!frameContainer) return;

        const textObjects = frameContainer.getData('textObjects') as Map<string, { text: Phaser.GameObjects.Text; parentLayerId: string | null }> | undefined;
        if (!textObjects) return;

        // Title
        const titleEntry = textObjects.get(SpinLockPuzzleScene.FRAME_TITLE_TEXT_ID);
        if (titleEntry) {
            titleEntry.text.setText('Tajemná Truhla');
        }

        // Riddle body
        const riddleEntry = textObjects.get(SpinLockPuzzleScene.FRAME_RIDDLE_TEXT_ID);
        if (riddleEntry) {
            riddleEntry.text.setText(this.riddle);
        }

        // Button label
        const buttonTextEntry = textObjects.get(SpinLockPuzzleScene.FRAME_BUTTON_TEXT_ID);
        if (buttonTextEntry) {
            buttonTextEntry.text.setText('OTEVŘÍT');
        }
    }

    // ─── Wheel setup ────────────────────────────────────────

    private setupWheels(): void {
        const spinContainer = this.sceneBuilder.get<Phaser.GameObjects.Container>('spin-4');
        if (!spinContainer) return;

        const textObjects = spinContainer.getData('textObjects') as Map<string, { text: Phaser.GameObjects.Text; parentLayerId: string | null }> | undefined;
        const layerObjects = spinContainer.getData('layerObjects') as Map<string, Phaser.GameObjects.Image> | undefined;
        if (!textObjects || !layerObjects) return;

        // Use marker-2-container for clip area dimensions (sized in scene editor)
        const clipMarker = this.sceneBuilder.getMarker('marker-2-container');
        const clipW = clipMarker?.width ?? 48;
        const clipH = clipMarker?.height ?? 56;
        this.clipHeight = clipH;

        const wheelCount = Math.min(this.answer.length, 4);

        for (let i = 0; i < wheelCount; i++) {
            const textEntry = textObjects.get(SpinLockPuzzleScene.WHEEL_TEXT_IDS[i]);
            const layer = layerObjects.get(SpinLockPuzzleScene.WHEEL_LAYER_IDS[i]);
            if (!textEntry || !layer) continue;

            const textObj = textEntry.text;

            // Generate wheel options
            const correctLetter = this.answer[i];
            const options = this.generateWheelOptions(correctLetter);
            this.wheelOptions.push(options);

            // Start at random non-correct position
            let startIndex = Math.floor(Math.random() * options.length);
            if (startIndex === 0) startIndex = 1;
            this.currentIndices.push(startIndex);
            this.currentLetters.push(options[startIndex]);

            textObj.setText(options[startIndex]);

            // Get world positions BEFORE removing from template container
            const layerWorld = layer.getWorldTransformMatrix();
            const textWorld = textObj.getWorldTransformMatrix();
            const wheelWorldX = layerWorld.tx;
            const wheelWorldY = layerWorld.ty;
            const wheelW = layer.displayWidth;
            const wheelH = layer.displayHeight;

            // Remove from template container and create per-wheel masked container.
            // Per SLIDE_ANIMATION.md: apply mask to the CONTAINER, not individual elements.
            spinContainer.remove(layer);
            spinContainer.remove(textObj);

            const wheelContainer = this.add.container(0, 0);
            wheelContainer.setDepth(15);

            // Set positions to world coordinates (container is at 0,0)
            layer.setPosition(wheelWorldX, wheelWorldY);
            textObj.setPosition(textWorld.tx, textWorld.ty);
            wheelContainer.add([layer, textObj]);

            // Geometry mask sized from marker-2-container, centered on the wheel
            const maskCenterX = wheelWorldX + wheelW / 2;
            const maskCenterY = wheelWorldY + wheelH / 2;
            const maskGraphics = this.make.graphics();
            maskGraphics.fillStyle(0xffffff);
            maskGraphics.fillRect(maskCenterX - clipW / 2, maskCenterY - clipH / 2, clipW, clipH);
            wheelContainer.setMask(maskGraphics.createGeometryMask());

            // Store original positions for animation and shake reset
            textObj.setData('originalX', textObj.x);
            textObj.setData('originalY', textObj.y);
            layer.setData('originalX', layer.x);
            layer.setData('originalY', layer.y);

            this.wheelTexts.push(textObj);
            this.wheelLayers.push(layer);
            this.isAnimating.push(false);

            // Make the layer interactive for wheel clicking
            layer.setInteractive({ useHandCursor: true });
            const wheelIndex = i;
            layer.on('pointerdown', () => this.rotateWheel(wheelIndex));
        }
    }

    private generateWheelOptions(correctLetter: string): string[] {
        const options: string[] = [correctLetter];
        const available = this.ALPHABET.filter(l => l !== correctLetter);

        // Fisher-Yates shuffle
        for (let i = available.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [available[i], available[j]] = [available[j], available[i]];
        }

        options.push(...available.slice(0, this.OPTIONS_PER_WHEEL - 1));

        // Shuffle all options
        for (let i = options.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [options[i], options[j]] = [options[j], options[i]];
        }

        return options;
    }

    // ─── Wheel carousel animation ──────────────────────────

    private rotateWheel(index: number): void {
        if (this.isSolved || this.isAnimating[index]) return;

        this.isAnimating[index] = true;
        const textObj = this.wheelTexts[index];
        const layer = this.wheelLayers[index];
        const options = this.wheelOptions[index];
        const textOriginalY = textObj.getData('originalY') as number;
        const layerOriginalY = layer.getData('originalY') as number;

        // Advance to next option
        const newIndex = (this.currentIndices[index] + 1) % options.length;
        this.currentIndices[index] = newIndex;
        this.currentLetters[index] = options[newIndex];

        const slideDistance = this.clipHeight;

        // Kill any existing tweens
        this.tweens.killTweensOf(textObj);
        this.tweens.killTweensOf(layer);

        // Phase 1: Slide old letter DOWN out of the mask (fast exit)
        this.tweens.add({
            targets: [textObj, layer],
            y: `+=${slideDistance}`,
            duration: 100,
            ease: 'Power2',
            onComplete: () => {
                textObj.setText(options[newIndex]);

                // Position the new letter just above the mask edge — not a full
                // slideDistance away, so it enters right on the heels of the old one.
                const entryOffset = slideDistance * 0.4;
                textObj.y = textOriginalY - entryOffset;
                layer.y = layerOriginalY - entryOffset;

                // Phase 2: Slide in quickly from just above
                this.tweens.add({
                    targets: textObj,
                    y: textOriginalY,
                    duration: 80,
                    ease: 'Power2',
                });
                this.tweens.add({
                    targets: layer,
                    y: layerOriginalY,
                    duration: 80,
                    ease: 'Power2',
                    onComplete: () => {
                        this.isAnimating[index] = false;
                    }
                });
            }
        });
    }

    // ─── Submit button ──────────────────────────────────────

    private setupButton(): void {
        const frameContainer = this.sceneBuilder.get<Phaser.GameObjects.Container>('Spin frame');
        if (!frameContainer) return;

        const layerObjects = frameContainer.getData('layerObjects') as Map<string, Phaser.GameObjects.Image> | undefined;
        if (!layerObjects) return;

        const buttonLayer = layerObjects.get(SpinLockPuzzleScene.BUTTON_LAYER_ID);
        if (!buttonLayer) {
            console.warn('[SpinLock] Button layer not found!');
            return;
        }

        // The button layer is inside a container, and Phaser's container-child input
        // processing can be unreliable when the container has a large background layer.
        // Instead, create a standalone Zone at the button's world position — this
        // bypasses all container input transform issues.
        const worldMatrix = buttonLayer.getWorldTransformMatrix();
        const worldCenterX = worldMatrix.tx + buttonLayer.displayWidth / 2;
        const worldCenterY = worldMatrix.ty + buttonLayer.displayHeight / 2;

        const buttonZone = this.add.zone(worldCenterX, worldCenterY, buttonLayer.displayWidth, buttonLayer.displayHeight);
        buttonZone.setInteractive({ useHandCursor: true });
        buttonZone.setDepth(20);

        buttonZone.on('pointerover', () => {
            buttonLayer.setAlpha(0.85);
        });

        buttonZone.on('pointerout', () => {
            buttonLayer.setAlpha(1);
        });

        buttonZone.on('pointerdown', () => {
            buttonLayer.setTint(0xcccccc);
            this.time.delayedCall(100, () => buttonLayer.clearTint());
            this.checkAnswer();
        });
    }

    // ─── Close button ───────────────────────────────────────

    private setupCloseButton(): void {
        const closeMarker = this.sceneBuilder.getMarker('marker-1 - close');
        const x = closeMarker?.x ?? 832;
        const y = closeMarker?.y ?? 139;

        const closeBtn = this.add.text(x, y, '✕', {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#aa6666',
            fontStyle: 'bold'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(100);

        closeBtn.on('pointerover', () => closeBtn.setColor('#ff8888'));
        closeBtn.on('pointerout', () => closeBtn.setColor('#aa6666'));
        closeBtn.on('pointerdown', () => this.closeAndReturn(false));
    }

    // ─── Answer checking ────────────────────────────────────

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

        // Mark completed in journey system
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

        // Green flash on wheel texts
        this.wheelTexts.forEach(textObj => {
            textObj.setColor('#44ff44');
            this.tweens.add({
                targets: textObj,
                scaleX: 1.3,
                scaleY: 1.3,
                duration: 200,
                yoyo: true
            });
        });

        // Success message
        const successText = this.add.text(640, 360, 'SPRÁVNĚ!', {
            fontSize: '36px',
            fontFamily: 'Arial, sans-serif',
            color: '#44ff44',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5).setAlpha(0).setDepth(200);

        this.tweens.add({
            targets: successText,
            alpha: 1,
            scaleX: 1.2,
            scaleY: 1.2,
            duration: 300,
            yoyo: true,
            hold: 500
        });

        // Show reward text
        if (this.reward) {
            const rewardParts: string[] = [];
            if (this.reward.gold) rewardParts.push(`+${this.reward.gold} gold`);
            if (this.reward.diamonds) rewardParts.push(`+${this.reward.diamonds} diamonds`);

            this.time.delayedCall(600, () => {
                const rewardText = this.add.text(640, 420, rewardParts.join('  '), {
                    fontSize: '24px',
                    fontFamily: 'Arial, sans-serif',
                    color: '#ffdd44',
                    fontStyle: 'bold',
                    stroke: '#000000',
                    strokeThickness: 3
                }).setOrigin(0.5).setDepth(200);

                this.tweens.add({
                    targets: rewardText,
                    y: 380,
                    duration: 1000
                });
            });
        }

        // Auto-close after delay
        this.time.delayedCall(2000, () => {
            this.closeAndReturn(true);
        });
    }

    private handleWrongAnswer(): void {
        // Red flash + shake on wheel texts.
        // Per SLIDE_ANIMATION.md: always kill previous tweens and use stored
        // original positions to prevent drift from rapid repeated clicks.
        this.wheelTexts.forEach(textObj => {
            const origX = textObj.getData('originalX') as number;
            this.tweens.killTweensOf(textObj);
            textObj.x = origX;
            textObj.setColor('#ff4444');
            this.tweens.add({
                targets: textObj,
                x: origX + 5,
                duration: 50,
                yoyo: true,
                repeat: 3,
                onComplete: () => {
                    textObj.x = origX;
                    textObj.setColor('#3d250a');
                }
            });
        });

        // "ŠPATNĚ" text fades out
        const wrongText = this.add.text(640, 360, 'ŠPATNĚ', {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#ff4444',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(200);

        this.tweens.add({
            targets: wrongText,
            alpha: 0,
            y: 320,
            duration: 1000,
            delay: 500,
            onComplete: () => wrongText.destroy()
        });
    }

    // ─── Scene transition ───────────────────────────────────

    private closeAndReturn(solved: boolean): void {
        this.cameras.main.fadeOut(200, 0, 0, 0);

        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.resume(this.parentScene);

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
