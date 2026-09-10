import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { SaveSystem } from '../systems/SaveSystem';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { GameStateManager } from '../systems/GameStateManager';
import { getPlayerResumeScene } from '../systems/SilverpondProgressSystem';
import { SaveSlotMeta, CharacterType } from '../types';
import { getPlayerSpriteConfig } from '../utils/characterUtils';

/**
 * CoopSetupScene - Reuses the MenuNewScene slot carousel UI.
 * Adds two player selection panels at the bottom.
 *
 * Flow: browse slots with arrows → click "Zvolit" to assign Player 1,
 * then Player 2 → "Start Co-op" appears when both are set.
 */
export class CoopSetupScene extends Phaser.Scene {
    private sceneBuilder!: SceneBuilder;
    private currentSlotIndex: number = 0;
    private slotsMeta: SaveSlotMeta[] = [];
    private totalSlots: number = 8;

    // Character sprite (reuses MenuNewScene pattern)
    private characterSprite: Phaser.GameObjects.Sprite | null = null;

    // Co-op selection state
    private player1Slot: number = -1;
    private player2Slot: number = -1;

    // Player panels
    private player1NameText!: Phaser.GameObjects.Text;
    private player2NameText!: Phaser.GameObjects.Text;
    private player1Panel!: Phaser.GameObjects.Container;
    private player2Panel!: Phaser.GameObjects.Container;
    private startButton!: Phaser.GameObjects.Container;
    private inUseWarning!: Phaser.GameObjects.Text;
    private instructionText!: Phaser.GameObjects.Text;

    constructor() {
        super({ key: 'CoopSetupScene' });
    }

    create(): void {
        this.player1Slot = -1;
        this.player2Slot = -1;

        // --- Reuse the MenuNewScene scene definition ---
        this.sceneBuilder = new SceneBuilder(this);

        this.sceneBuilder.registerHandler('onPrevSlot', () => this.navigateSlot(-1));
        this.sceneBuilder.registerHandler('onNextSlot', () => this.navigateSlot(1));
        this.sceneBuilder.registerHandler('onLoad', () => this.onSelectClicked());
        this.sceneBuilder.registerHandler('onDelete', () => {}); // Disable delete in co-op
        this.sceneBuilder.registerHandler('onBack', () => this.scene.start('MenuScene'));

        this.sceneBuilder.buildScene('MenuNewScene');

        // Load slots
        this.slotsMeta = SaveSystem.getSlotsMeta();
        this.totalSlots = this.slotsMeta.length;

        // Start on first non-empty slot
        this.currentSlotIndex = this.slotsMeta.findIndex(s => !s.isEmpty);
        if (this.currentSlotIndex < 0) this.currentSlotIndex = 0;

        // Character sprite (same position as MenuNewScene)
        this.createCharacterSprite();

        // --- Override button text: "HRÁT" → "ZVOLIT" ---
        const greenButton = this.sceneBuilder.get<Phaser.GameObjects.Container>('Green_button');
        if (greenButton) {
            const textObjects = greenButton.getData('textObjects') as Map<string, { text: Phaser.GameObjects.Text }> | undefined;
            if (textObjects) {
                const btnText = textObjects.get('1768922299962-lij5d6x4j');
                if (btnText) btnText.text.setText('ZVOLIT');
            }
        }

        // Hide the delete button in co-op mode
        const redButton = this.sceneBuilder.get<Phaser.GameObjects.Container>('Red_button');
        if (redButton) redButton.setVisible(false);

        // --- Co-op specific UI ---

        // Override the "NAČÍST HRU" title to show co-op context
        const loadGameTitle = this.sceneBuilder.get<Phaser.GameObjects.Container>('Load game');
        if (loadGameTitle) {
            const titleTextObjs = loadGameTitle.getData('textObjects') as Map<string, { text: Phaser.GameObjects.Text }> | undefined;
            if (titleTextObjs) {
                // Update the first text area in the title template
                for (const entry of titleTextObjs.values()) {
                    entry.text.setText('VÝBĚR CO-OP');
                    break;
                }
            }
        }

        // Instruction text below the title
        this.instructionText = this.add.text(361, 200, 'Vyber hráče 1', {
            fontSize: '20px', fontFamily: 'Arial, sans-serif',
            color: '#ffcc00', fontStyle: 'bold',
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(100);

        // "Already selected" warning (shown over the character preview)
        this.inUseWarning = this.add.text(971, 450, '⚠ Již zvoleno', {
            fontSize: '20px', fontFamily: 'Arial, sans-serif',
            color: '#ff6666', fontStyle: 'bold',
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(100).setVisible(false);

        // Player panels — placed in the bottom bar, right of the Back button (at x:134)
        this.player1Panel = this.createPlayerPanel(370, 640, 'Hráč 1');
        this.player1NameText = this.player1Panel.getData('nameText') as Phaser.GameObjects.Text;

        this.player2Panel = this.createPlayerPanel(590, 640, 'Hráč 2');
        this.player2NameText = this.player2Panel.getData('nameText') as Phaser.GameObjects.Text;

        // Start Co-op button (hidden until both selected)
        this.startButton = this.createStartButton(870, 640);
        this.startButton.setVisible(false);

        // Keyboard navigation
        this.input.keyboard?.on('keydown-LEFT', () => this.navigateSlot(-1));
        this.input.keyboard?.on('keydown-RIGHT', () => this.navigateSlot(1));
        this.input.keyboard?.on('keydown-ENTER', () => this.onSelectClicked());
        this.input.keyboard?.on('keydown-ESC', () => this.scene.start('MenuScene'));

        this.updateSlotDisplay();
    }

    private createCharacterSprite(): void {
        const spriteX = 971;
        const spriteY = 261;
        const config = getPlayerSpriteConfig('girl_knight');
        this.characterSprite = this.add.sprite(spriteX, spriteY, config.idleTexture)
            .setScale(0.85)
            .setDepth(20)
            .setVisible(false);
    }

    private createPlayerPanel(x: number, y: number, label: string): Phaser.GameObjects.Container {
        const bg = this.add.rectangle(0, 0, 200, 60, 0x16213e, 0.9)
            .setStrokeStyle(2, 0x4466aa);
        const labelText = this.add.text(0, -15, label, {
            fontSize: '14px', fontFamily: 'Arial, sans-serif',
            color: '#6688aa',
        }).setOrigin(0.5);
        const nameText = this.add.text(0, 10, '—', {
            fontSize: '20px', fontFamily: 'Arial, sans-serif',
            color: '#ffffff', fontStyle: 'bold',
        }).setOrigin(0.5);

        const container = this.add.container(x, y, [bg, labelText, nameText]);
        container.setDepth(100);
        container.setData('nameText', nameText);
        container.setData('bg', bg);
        return container;
    }

    private createStartButton(x: number, y: number): Phaser.GameObjects.Container {
        const bg = this.add.rectangle(0, 0, 240, 50, 0x886600, 0.9)
            .setStrokeStyle(2, 0xffcc00);
        const text = this.add.text(0, 0, 'ZAČÍT CO-OP!', {
            fontSize: '22px', fontFamily: 'Arial, sans-serif',
            color: '#ffffff', fontStyle: 'bold',
        }).setOrigin(0.5);

        const container = this.add.container(x, y, [bg, text]);
        container.setSize(240, 50);
        container.setDepth(100);
        container.setInteractive({ useHandCursor: true });
        container.on('pointerdown', () => this.onStartClicked());
        container.on('pointerover', () => bg.setFillStyle(0xaa8800));
        container.on('pointerout', () => bg.setFillStyle(0x886600));
        return container;
    }

    // --- Slot navigation (reuses MenuNewScene patterns) ---

    private navigateSlot(direction: number): void {
        this.currentSlotIndex = (this.currentSlotIndex + direction + this.totalSlots) % this.totalSlots;
        this.updateSlotDisplay();
    }

    private updateSlotDisplay(): void {
        const slot = this.slotsMeta[this.currentSlotIndex];

        this.updateSlotText(`Slot ${this.currentSlotIndex + 1}/${this.totalSlots}`);

        const loadGameContainer = this.sceneBuilder.get<Phaser.GameObjects.Container>('LoadGame');

        // Check if this slot is already assigned
        const isAlreadySelected = this.currentSlotIndex === this.player1Slot || this.currentSlotIndex === this.player2Slot;
        this.inUseWarning.setVisible(isAlreadySelected && !slot.isEmpty);

        if (slot.isEmpty) {
            this.characterSprite?.setVisible(false);
            this.updateLoadGameTexts(loadGameContainer, 'PRÁZDNÝ SLOT', '', '');
        } else {
            this.showCharacterSprite(slot.characterType);
            this.updateLoadGameTexts(
                loadGameContainer,
                slot.characterName || 'Hrdina',
                `Úroveň: ${slot.level}`,
                `Příklady: ${slot.totalProblemsSolved}`
            );
        }
    }

    private showCharacterSprite(characterType: CharacterType): void {
        if (!this.characterSprite) return;
        const config = getPlayerSpriteConfig(characterType);
        this.characterSprite.setTexture(config.idleTexture).setVisible(true);
        if (this.anims.exists(config.idleAnim)) {
            this.characterSprite.play(config.idleAnim);
        }
    }

    private updateSlotText(text: string): void {
        const slotContainer = this.sceneBuilder.get<Phaser.GameObjects.Container>('Slot');
        if (!slotContainer) return;
        const textObjects = slotContainer.getData('textObjects') as Map<string, { text: Phaser.GameObjects.Text; parentLayerId: string | null }> | undefined;
        if (!textObjects) return;
        const textInfo = textObjects.get('1769727176013-ccwobrd3f');
        if (textInfo) textInfo.text.setText(text);
    }

    private updateLoadGameTexts(
        container: Phaser.GameObjects.Container | null | undefined,
        name: string, level: string, problems: string
    ): void {
        if (!container) return;
        const textObjects = container.getData('textObjects') as Map<string, { text: Phaser.GameObjects.Text; parentLayerId: string | null }> | undefined;
        if (!textObjects) return;

        textObjects.get('1769723257544-snpzul05b')?.text.setText(name);
        textObjects.get('1769723295262-fnkpq11bl')?.text.setText(level);
        textObjects.get('1769723312530-w6j7kezib')?.text.setText(problems);
    }

    // --- Co-op selection logic ---

    private onSelectClicked(): void {
        const slot = this.slotsMeta[this.currentSlotIndex];
        if (slot.isEmpty) return;

        // Don't allow selecting the same slot twice
        if (this.currentSlotIndex === this.player1Slot || this.currentSlotIndex === this.player2Slot) return;

        if (this.player1Slot < 0) {
            // Assign to Player 1
            this.player1Slot = this.currentSlotIndex;
            this.player1NameText.setText(slot.characterName || 'Hrdina');
            (this.player1Panel.getData('bg') as Phaser.GameObjects.Rectangle).setStrokeStyle(2, 0x44ff44);
            this.instructionText.setText('Vyber hráče 2');

            // Auto-advance to next valid slot for Player 2
            this.advanceToValidSlot();
        } else if (this.player2Slot < 0) {
            // Assign to Player 2
            this.player2Slot = this.currentSlotIndex;
            this.player2NameText.setText(slot.characterName || 'Hrdina');
            (this.player2Panel.getData('bg') as Phaser.GameObjects.Rectangle).setStrokeStyle(2, 0x44ff44);
            this.instructionText.setText('Oba hráči zvoleni!');
            this.startButton.setVisible(true);
        }

        this.updateSlotDisplay();
    }

    private advanceToValidSlot(): void {
        for (let i = 0; i < this.slotsMeta.length; i++) {
            const idx = (this.currentSlotIndex + i + 1) % this.slotsMeta.length;
            if (!this.slotsMeta[idx].isEmpty && idx !== this.player1Slot) {
                this.currentSlotIndex = idx;
                return;
            }
        }
    }

    private onStartClicked(): void {
        if (this.player1Slot < 0 || this.player2Slot < 0) return;

        const coop = CoopSessionManager.getInstance();
        const success = coop.startSession(this.player1Slot, this.player2Slot);

        if (success) {
            this.scene.start(getPlayerResumeScene(GameStateManager.getInstance().getPlayer()));
        } else {
            this.instructionText.setText('Chyba!').setColor('#ff4444');
        }
    }

    shutdown(): void {
        this.input.keyboard?.off('keydown-LEFT');
        this.input.keyboard?.off('keydown-RIGHT');
        this.input.keyboard?.off('keydown-ENTER');
        this.input.keyboard?.off('keydown-ESC');
    }
}
