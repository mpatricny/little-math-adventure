import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { CrystalSystem, CrystalTierConfig } from '../systems/CrystalSystem';
import { ManaSystem } from '../systems/ManaSystem';
import { SceneBuilder } from '../systems/SceneBuilder';
import { Crystal } from '../types';

/**
 * CrystalForgeScene - Player can merge or split crystals using math problems
 *
 * Merge: Combine two crystals into one (A + B = ?)
 * Split: Divide one crystal into two (A - ? = ?)
 *
 * Each operation costs 1 mana. Wrong answers don't cost mana.
 */
export class CrystalForgeScene extends Phaser.Scene {
    private gameState = GameStateManager.getInstance();
    private sceneBuilder!: SceneBuilder;

    // Forge state
    private selectedCrystals: Crystal[] = [];
    private currentOperation: 'merge' | 'split' | null = null;
    private splitValue: number = 0;

    // UI elements
    private inventoryContainer!: Phaser.GameObjects.Container;
    private forgeContainer!: Phaser.GameObjects.Container;
    private slot1Display!: Phaser.GameObjects.Container;
    private slot2Display!: Phaser.GameObjects.Container;
    private equationText!: Phaser.GameObjects.Text;
    private answerButtons: Phaser.GameObjects.Container[] = [];
    private manaText!: Phaser.GameObjects.Text;
    private messageText!: Phaser.GameObjects.Text;
    private splitSlider!: Phaser.GameObjects.Container;
    private splitValueText!: Phaser.GameObjects.Text;

    constructor() {
        super({ key: 'CrystalForgeScene' });
    }

    create(): void {
        // Reset state
        this.selectedCrystals = [];
        this.currentOperation = null;
        this.splitValue = 0;

        // Background
        this.add.rectangle(640, 360, 1280, 720, 0x1a1a2e);

        // Title
        this.add.text(640, 50, '⚗️ KŘIŠŤÁLOVÁ KOVÁRNA ⚗️', {
            fontSize: '36px',
            fontFamily: 'Arial, sans-serif',
            color: '#88ccff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);

        // Mana display
        this.createManaDisplay();

        // Inventory grid (left side)
        this.createInventoryGrid();

        // Forge area (center)
        this.createForgeArea();

        // Operation buttons (bottom)
        this.createOperationButtons();

        // Back button
        this.createBackButton();

        // Message text (for feedback)
        this.messageText = this.add.text(640, 640, '', {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);
    }

    private createManaDisplay(): void {
        const player = this.gameState.getPlayer();
        const manaCount = ManaSystem.getMana(player);

        // Background panel
        this.add.rectangle(1100, 50, 200, 50, 0x224466, 0.8)
            .setStrokeStyle(2, 0x4488aa);

        this.manaText = this.add.text(1100, 50, `⚡ ${manaCount}`, {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#44ffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
    }

    private updateManaDisplay(): void {
        const player = this.gameState.getPlayer();
        const manaCount = ManaSystem.getMana(player);
        this.manaText.setText(`⚡ ${manaCount}`);
    }

    private createInventoryGrid(): void {
        const player = this.gameState.getPlayer();

        // Container for inventory
        this.inventoryContainer = this.add.container(180, 280);

        // Background panel
        const bg = this.add.rectangle(0, 0, 280, 400, 0x1a2a3a, 0.9)
            .setStrokeStyle(2, 0x3a4a5a);
        this.inventoryContainer.add(bg);

        // Title
        const title = this.add.text(0, -180, 'INVENTÁŘ', {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaccff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.inventoryContainer.add(title);

        // Capacity indicator
        const status = CrystalSystem.getInventoryStatus(player);
        const capacityText = this.add.text(0, -155, `${status.current}/${status.max}`, {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#888888'
        }).setOrigin(0.5);
        this.inventoryContainer.add(capacityText);

        // Crystal slots
        this.renderInventoryCrystals();
    }

    private renderInventoryCrystals(): void {
        const player = this.gameState.getPlayer();
        const crystals = player.crystals?.crystals || [];

        // Remove old crystal displays (keep background and title)
        const toRemove: Phaser.GameObjects.GameObject[] = [];
        this.inventoryContainer.each((child: Phaser.GameObjects.GameObject) => {
            if (child.getData && child.getData('crystalSlot')) {
                toRemove.push(child);
            }
        });
        toRemove.forEach(child => child.destroy());

        // Grid layout
        const cols = 4;
        const slotSize = 55;
        const startX = -85;
        const startY = -110;

        crystals.forEach((crystal, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const x = startX + col * slotSize;
            const y = startY + row * slotSize;

            const slot = this.createCrystalSlot(x, y, crystal);
            slot.setData('crystalSlot', true);
            this.inventoryContainer.add(slot);
        });
    }

    private createCrystalSlot(x: number, y: number, crystal: Crystal): Phaser.GameObjects.Container {
        const container = this.add.container(x, y);
        const config = CrystalSystem.getTierConfig(crystal.tier);

        // Background
        const isSelected = this.selectedCrystals.some(c => c.id === crystal.id);
        const bgColor = isSelected ? 0x446688 : (crystal.locked ? 0x444444 : 0x333355);
        const bg = this.add.rectangle(0, 0, 50, 50, bgColor)
            .setStrokeStyle(2, isSelected ? 0x88aacc : 0x555577);

        // Emoji
        const emoji = this.add.text(0, -8, config.emoji, {
            fontSize: '22px'
        }).setOrigin(0.5);

        // Value
        const value = this.add.text(0, 14, `(${crystal.value})`, {
            fontSize: '11px',
            fontFamily: 'Arial, sans-serif',
            color: config.color
        }).setOrigin(0.5);

        container.add([bg, emoji, value]);

        // Lock icon
        if (crystal.locked) {
            const lock = this.add.text(18, -18, '🔒', { fontSize: '12px' });
            container.add(lock);
        }

        // Interactivity
        if (!crystal.locked) {
            container.setSize(50, 50);
            container.setInteractive({ useHandCursor: true });
            container.on('pointerover', () => bg.setFillStyle(0x556688));
            container.on('pointerout', () => bg.setFillStyle(isSelected ? 0x446688 : 0x333355));
            container.on('pointerdown', () => this.selectCrystal(crystal));
        }

        return container;
    }

    private selectCrystal(crystal: Crystal): void {
        // Check if already selected
        const existingIndex = this.selectedCrystals.findIndex(c => c.id === crystal.id);

        if (existingIndex >= 0) {
            // Deselect
            this.selectedCrystals.splice(existingIndex, 1);
        } else {
            // Select (max 2 for merge, 1 for split)
            if (this.currentOperation === 'split' && this.selectedCrystals.length >= 1) {
                // Replace selection for split
                this.selectedCrystals = [crystal];
            } else if (this.selectedCrystals.length >= 2) {
                // Replace oldest for merge
                this.selectedCrystals.shift();
                this.selectedCrystals.push(crystal);
            } else {
                this.selectedCrystals.push(crystal);
            }
        }

        this.renderInventoryCrystals();
        this.updateForgeDisplay();
    }

    private createForgeArea(): void {
        this.forgeContainer = this.add.container(640, 280);

        // Background
        const bg = this.add.rectangle(0, 0, 500, 320, 0x2a3a4a, 0.9)
            .setStrokeStyle(3, 0x4a5a6a);
        this.forgeContainer.add(bg);

        // Slot 1
        this.slot1Display = this.createForgeSlot(-120, -60, 'Krystal 1');
        this.forgeContainer.add(this.slot1Display);

        // Operation symbol
        const opSymbol = this.add.text(0, -60, '+', {
            fontSize: '40px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        opSymbol.setData('opSymbol', true);
        this.forgeContainer.add(opSymbol);

        // Slot 2
        this.slot2Display = this.createForgeSlot(120, -60, 'Krystal 2');
        this.forgeContainer.add(this.slot2Display);

        // Equals line
        this.add.text(640, 290, '═════════════════════════', {
            fontSize: '16px',
            color: '#666688'
        }).setOrigin(0.5);

        // Equation display
        this.equationText = this.add.text(640, 330, 'Vyber operaci a krystaly', {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#88ccff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Answer buttons area (created dynamically)
        this.createAnswerButtons();

        // Split slider (hidden by default)
        this.createSplitSlider();
    }

    private createForgeSlot(x: number, y: number, label: string): Phaser.GameObjects.Container {
        const container = this.add.container(x, y);

        const bg = this.add.rectangle(0, 0, 90, 90, 0x223344)
            .setStrokeStyle(2, 0x446688);
        container.add(bg);

        const text = this.add.text(0, 0, label, {
            fontSize: '12px',
            fontFamily: 'Arial, sans-serif',
            color: '#666688'
        }).setOrigin(0.5);
        container.add(text);

        return container;
    }

    private updateForgeDisplay(): void {
        // Update slot 1
        this.updateSlotDisplay(this.slot1Display, this.selectedCrystals[0]);

        // Update slot 2 (only for merge)
        if (this.currentOperation === 'merge') {
            this.slot2Display.setVisible(true);
            this.updateSlotDisplay(this.slot2Display, this.selectedCrystals[1]);
        } else {
            this.slot2Display.setVisible(this.currentOperation !== 'split');
            if (this.currentOperation === 'split') {
                // Show split value in slot 2
                this.updateSlotWithSplitValue();
            }
        }

        // Update operation symbol
        const opSymbol = this.forgeContainer.list.find(
            (child: any) => child.getData && child.getData('opSymbol')
        ) as Phaser.GameObjects.Text;
        if (opSymbol) {
            opSymbol.setText(this.currentOperation === 'split' ? '−' : '+');
        }

        // Update equation
        this.updateEquation();
    }

    private updateSlotDisplay(slot: Phaser.GameObjects.Container, crystal?: Crystal): void {
        // Remove old content except background
        const toRemove: Phaser.GameObjects.GameObject[] = [];
        slot.each((child: Phaser.GameObjects.GameObject, index: number) => {
            if (index > 0) toRemove.push(child);
        });
        toRemove.forEach(child => child.destroy());

        if (crystal) {
            const config = CrystalSystem.getTierConfig(crystal.tier);

            const emoji = this.add.text(0, -12, config.emoji, {
                fontSize: '32px'
            }).setOrigin(0.5);

            const value = this.add.text(0, 20, `(${crystal.value})`, {
                fontSize: '16px',
                fontFamily: 'Arial, sans-serif',
                color: config.color,
                fontStyle: 'bold'
            }).setOrigin(0.5);

            slot.add([emoji, value]);
        } else {
            const placeholder = this.add.text(0, 0, this.currentOperation === 'split' ? 'Krystal' : 'Vyber', {
                fontSize: '12px',
                fontFamily: 'Arial, sans-serif',
                color: '#666688'
            }).setOrigin(0.5);
            slot.add(placeholder);
        }
    }

    private updateSlotWithSplitValue(): void {
        // Remove old content except background
        const toRemove: Phaser.GameObjects.GameObject[] = [];
        this.slot2Display.each((child: Phaser.GameObjects.GameObject, index: number) => {
            if (index > 0) toRemove.push(child);
        });
        toRemove.forEach(child => child.destroy());

        if (this.splitValue > 0) {
            const emoji = this.add.text(0, -12, '💎', {
                fontSize: '28px'
            }).setOrigin(0.5);

            const value = this.add.text(0, 20, `(${this.splitValue})`, {
                fontSize: '16px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffaa44',
                fontStyle: 'bold'
            }).setOrigin(0.5);

            this.slot2Display.add([emoji, value]);
        } else {
            const placeholder = this.add.text(0, 0, '?', {
                fontSize: '24px',
                fontFamily: 'Arial, sans-serif',
                color: '#666688'
            }).setOrigin(0.5);
            this.slot2Display.add(placeholder);
        }
    }

    private createAnswerButtons(): void {
        const startX = 490;
        const y = 420;

        for (let i = 0; i < 4; i++) {
            const btn = this.add.container(startX + i * 100, y);

            const bg = this.add.rectangle(0, 0, 80, 60, 0x446688)
                .setStrokeStyle(2, 0x6688aa);

            const text = this.add.text(0, 0, '', {
                fontSize: '24px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff',
                fontStyle: 'bold'
            }).setOrigin(0.5);

            btn.add([bg, text]);
            btn.setSize(80, 60);
            btn.setVisible(false);

            const buttonIndex = i;
            bg.setInteractive({ useHandCursor: true })
                .on('pointerover', () => bg.setFillStyle(0x5588aa))
                .on('pointerout', () => bg.setFillStyle(0x446688))
                .on('pointerdown', () => this.submitAnswer(buttonIndex));

            this.answerButtons.push(btn);
        }
    }

    private updateEquation(): void {
        if (!this.currentOperation) {
            this.equationText.setText('Vyber operaci a krystaly');
            this.hideAnswerButtons();
            return;
        }

        if (this.currentOperation === 'merge') {
            if (this.selectedCrystals.length < 2) {
                this.equationText.setText('Vyber 2 krystaly ke spojení');
                this.hideAnswerButtons();
                return;
            }

            const a = this.selectedCrystals[0].value;
            const b = this.selectedCrystals[1].value;
            this.equationText.setText(`${a} + ${b} = ?`);
            this.showAnswerChoices(a + b);

        } else if (this.currentOperation === 'split') {
            if (this.selectedCrystals.length < 1) {
                this.equationText.setText('Vyber krystal k rozdělení');
                this.hideAnswerButtons();
                this.splitSlider.setVisible(false);
                return;
            }

            const crystal = this.selectedCrystals[0];
            if (crystal.value <= 1) {
                this.equationText.setText('Krystal nelze rozdělit (příliš malý)');
                this.hideAnswerButtons();
                this.splitSlider.setVisible(false);
                return;
            }

            // Show split slider
            this.splitSlider.setVisible(true);
            this.updateSplitSlider(crystal.value);

            if (this.splitValue > 0 && this.splitValue < crystal.value) {
                const answer = crystal.value - this.splitValue;
                this.equationText.setText(`${crystal.value} − ${this.splitValue} = ?`);
                this.showAnswerChoices(answer);
            } else {
                this.equationText.setText(`${crystal.value} − ? = ?`);
                this.hideAnswerButtons();
            }
        }
    }

    private createSplitSlider(): void {
        this.splitSlider = this.add.container(640, 500);
        this.splitSlider.setVisible(false);

        const label = this.add.text(0, -25, 'Kolik oddělit:', {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaaaaa'
        }).setOrigin(0.5);

        // Value buttons
        const minusBtn = this.add.rectangle(-100, 0, 40, 40, 0x664444)
            .setStrokeStyle(2, 0x886666)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.adjustSplitValue(-1));

        const minusText = this.add.text(-100, 0, '−', {
            fontSize: '24px', color: '#ffffff'
        }).setOrigin(0.5);

        this.splitValueText = this.add.text(0, 0, '0', {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffaa44',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const plusBtn = this.add.rectangle(100, 0, 40, 40, 0x446644)
            .setStrokeStyle(2, 0x668866)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.adjustSplitValue(1));

        const plusText = this.add.text(100, 0, '+', {
            fontSize: '24px', color: '#ffffff'
        }).setOrigin(0.5);

        this.splitSlider.add([label, minusBtn, minusText, this.splitValueText, plusBtn, plusText]);
    }

    private updateSplitSlider(maxValue: number): void {
        // Clamp split value
        if (this.splitValue >= maxValue) {
            this.splitValue = maxValue - 1;
        }
        this.splitValueText.setText(this.splitValue.toString());
    }

    private adjustSplitValue(delta: number): void {
        if (this.selectedCrystals.length === 0) return;

        const maxValue = this.selectedCrystals[0].value;
        this.splitValue = Phaser.Math.Clamp(this.splitValue + delta, 0, maxValue - 1);
        this.splitValueText.setText(this.splitValue.toString());

        this.updateSlotWithSplitValue();
        this.updateEquation();
    }

    private showAnswerChoices(correctAnswer: number): void {
        const choices = this.generateChoices(correctAnswer);

        choices.forEach((choice, index) => {
            const btn = this.answerButtons[index];
            btn.setVisible(true);

            const text = btn.list[1] as Phaser.GameObjects.Text;
            text.setText(choice.toString());
            btn.setData('value', choice);
            btn.setData('correct', choice === correctAnswer);
        });
    }

    private hideAnswerButtons(): void {
        this.answerButtons.forEach(btn => btn.setVisible(false));
    }

    private generateChoices(correct: number): number[] {
        const choices = new Set<number>([correct]);

        while (choices.size < 4) {
            const offset = Phaser.Math.Between(-3, 3);
            const wrong = correct + offset;
            if (wrong > 0 && !choices.has(wrong)) {
                choices.add(wrong);
            }
        }

        return Phaser.Utils.Array.Shuffle([...choices]);
    }

    private submitAnswer(buttonIndex: number): void {
        const btn = this.answerButtons[buttonIndex];
        const isCorrect = btn.getData('correct');
        const value = btn.getData('value') as number;
        const player = this.gameState.getPlayer();

        if (isCorrect) {
            // Check mana
            if (!ManaSystem.canAfford(player, 1)) {
                this.showMessage('Nedostatek many! ⚡', '#ff4444');
                return;
            }

            // Spend mana
            ManaSystem.spend(player, 1);

            // Execute operation
            if (this.currentOperation === 'merge') {
                const result = CrystalSystem.executeMerge(
                    player,
                    this.selectedCrystals[0].id,
                    this.selectedCrystals[1].id,
                    value
                );
                if (result) {
                    this.showMessage(`Úspěch! ✨ Nový krystal: ${CrystalSystem.getCrystalDisplay(result)}`, '#44ff44');
                }
            } else if (this.currentOperation === 'split') {
                const results = CrystalSystem.executeSplit(
                    player,
                    this.selectedCrystals[0].id,
                    this.splitValue,
                    value
                );
                if (results) {
                    const displays = results.map(c => CrystalSystem.getCrystalDisplay(c)).join(' + ');
                    this.showMessage(`Úspěch! ✨ ${displays}`, '#44ff44');
                }
            }

            this.gameState.save();
            this.resetForge();

        } else {
            // Wrong answer - no penalty, just feedback
            this.showMessage('Zkus to znovu!', '#ffaa44');
            this.cameras.main.shake(100, 0.005);
        }
    }

    private showMessage(text: string, color: string): void {
        this.messageText.setText(text);
        this.messageText.setColor(color);
        this.messageText.setAlpha(1);

        this.tweens.add({
            targets: this.messageText,
            alpha: 0,
            duration: 2000,
            delay: 1000
        });
    }

    private resetForge(): void {
        this.selectedCrystals = [];
        this.splitValue = 0;
        this.currentOperation = null;

        this.renderInventoryCrystals();
        this.updateForgeDisplay();
        this.updateManaDisplay();
        this.splitSlider.setVisible(false);
    }

    private createOperationButtons(): void {
        // Merge button
        const mergeBtn = this.add.container(520, 580);
        const mergeBg = this.add.rectangle(0, 0, 150, 50, 0x446688)
            .setStrokeStyle(2, 0x6688aa);
        const mergeText = this.add.text(0, 0, '⚡1  SPOJIT', {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        mergeBtn.add([mergeBg, mergeText]);
        mergeBtn.setSize(150, 50);

        mergeBg.setInteractive({ useHandCursor: true })
            .on('pointerover', () => mergeBg.setFillStyle(0x5588aa))
            .on('pointerout', () => mergeBg.setFillStyle(this.currentOperation === 'merge' ? 0x668888 : 0x446688))
            .on('pointerdown', () => this.setOperation('merge'));

        // Split button
        const splitBtn = this.add.container(760, 580);
        const splitBg = this.add.rectangle(0, 0, 150, 50, 0x446688)
            .setStrokeStyle(2, 0x6688aa);
        const splitText = this.add.text(0, 0, '⚡1  ROZDĚLIT', {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        splitBtn.add([splitBg, splitText]);
        splitBtn.setSize(150, 50);

        splitBg.setInteractive({ useHandCursor: true })
            .on('pointerover', () => splitBg.setFillStyle(0x5588aa))
            .on('pointerout', () => splitBg.setFillStyle(this.currentOperation === 'split' ? 0x668888 : 0x446688))
            .on('pointerdown', () => this.setOperation('split'));
    }

    private setOperation(op: 'merge' | 'split'): void {
        this.currentOperation = op;

        // For split, limit to 1 crystal
        if (op === 'split' && this.selectedCrystals.length > 1) {
            this.selectedCrystals = [this.selectedCrystals[0]];
        }

        // Reset split value when changing operations
        this.splitValue = 0;

        this.renderInventoryCrystals();
        this.updateForgeDisplay();
    }

    private createBackButton(): void {
        const btn = this.add.container(80, 680);

        const bg = this.add.rectangle(0, 0, 120, 40, 0x444466)
            .setStrokeStyle(2, 0x666688);

        const text = this.add.text(0, 0, '← ZPĚT', {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff'
        }).setOrigin(0.5);

        btn.add([bg, text]);
        btn.setSize(120, 40);

        bg.setInteractive({ useHandCursor: true })
            .on('pointerover', () => bg.setFillStyle(0x555577))
            .on('pointerout', () => bg.setFillStyle(0x444466))
            .on('pointerdown', () => this.scene.start('TownScene'));
    }
}
