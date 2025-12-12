import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { DiamondType, TransmutationRecipe } from '../types';
import { SceneDebugger } from '../systems/SceneDebugger';
import { SceneBuilder } from '../systems/SceneBuilder';

// Diamond visual representations
const DIAMOND_VISUALS: Record<DiamondType, { emoji: string; color: string; name: string }> = {
    common: { emoji: '💎', color: '#4488ff', name: 'Běžný' },
    red: { emoji: '❤️', color: '#ff4444', name: 'Červený' },
    green: { emoji: '💚', color: '#44ff44', name: 'Zelený' },
};

interface DraggableDiamond extends Phaser.GameObjects.Text {
    diamondType: DiamondType;
    originalX: number;
    originalY: number;
    inBowl: number | null;  // null = on table, 0 = bowl 1, 1 = bowl 2
}

export class TavernScene extends Phaser.Scene {
    private gameState!: GameStateManager;
    private recipes: TransmutationRecipe[] = [];
    private debugger!: SceneDebugger;
    private sceneBuilder!: SceneBuilder;

    // Diamond inventory display on table
    private tableDiamonds: DraggableDiamond[] = [];
    private draggedDiamond: DraggableDiamond | null = null;

    // Bowls
    private bowl1Diamond: DraggableDiamond | null = null;
    private bowl2Diamond: DraggableDiamond | null = null;
    private bowl1Zone!: Phaser.GameObjects.Zone;
    private bowl2Zone!: Phaser.GameObjects.Zone;
    private bowl1Image!: Phaser.GameObjects.Ellipse;
    private bowl2Image!: Phaser.GameObjects.Ellipse;

    // UI elements
    private messageText!: Phaser.GameObjects.Text;
    private inventoryText!: Phaser.GameObjects.Text;

    // Table area bounds
    private tableArea = { x: 400, y: 520, width: 480, height: 120 };

    constructor() {
        super({ key: 'TavernScene' });
    }

    create(): void {
        this.gameState = GameStateManager.getInstance();

        // Load transmutation recipes
        const recipeData = this.cache.json.get('transmutation');
        this.recipes = recipeData?.recipes || [];

        // Initialize SceneBuilder
        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.buildScene();

        // Create elements not in JSON or complex ones
        this.createRecipeGuide();
        this.createBowls();
        this.createTransmuteButton();
        this.createDiamondTable();

        // Message area (for errors/success)
        this.messageText = this.add.text(640, 420, '', {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 2
        }).setOrigin(0.5);

        // Inventory display
        this.updateInventoryDisplay();

        // Setup drag handling
        this.setupDragHandling();

        // Setup debugger
        this.debugger = new SceneDebugger(this, 'TavernScene');
    }

    private createRecipeGuide(): void {
        const guideX = 640;
        const guideY = 140;

        // Background panel
        this.add.rectangle(guideX, guideY, 400, 100, 0x000000, 0.7)
            .setStrokeStyle(2, 0x4488aa);

        // Title
        this.add.text(guideX, guideY - 35, 'TRANSMUTAČNÍ NÁVOD', {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffd700',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Recipe 1: common + common = red
        this.add.text(guideX, guideY - 5,
            `${DIAMOND_VISUALS.common.emoji} + ${DIAMOND_VISUALS.common.emoji} = ${DIAMOND_VISUALS.red.emoji} (${DIAMOND_VISUALS.red.name})`, {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff'
        }).setOrigin(0.5);

        // Recipe 2: red + red = green
        this.add.text(guideX, guideY + 25,
            `${DIAMOND_VISUALS.red.emoji} + ${DIAMOND_VISUALS.red.emoji} = ${DIAMOND_VISUALS.green.emoji} (${DIAMOND_VISUALS.green.name})`, {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff'
        }).setOrigin(0.5);
    }

    private createBowls(): void {
        const bowlY = 300;
        const bowlSpacing = 200;

        // Bowl 1
        this.bowl1Image = this.add.ellipse(640 - bowlSpacing / 2, bowlY, 80, 50, 0x8B4513)
            .setStrokeStyle(3, 0x5D3A1A);
        this.add.text(640 - bowlSpacing / 2, bowlY - 50, 'MISKA 1', {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#ccaa88'
        }).setOrigin(0.5);

        // Bowl 1 drop zone
        this.bowl1Zone = this.add.zone(640 - bowlSpacing / 2, bowlY, 80, 60);
        this.bowl1Zone.setRectangleDropZone(80, 60);

        // Bowl 2
        this.bowl2Image = this.add.ellipse(640 + bowlSpacing / 2, bowlY, 80, 50, 0x8B4513)
            .setStrokeStyle(3, 0x5D3A1A);
        this.add.text(640 + bowlSpacing / 2, bowlY - 50, 'MISKA 2', {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#ccaa88'
        }).setOrigin(0.5);

        // Bowl 2 drop zone
        this.bowl2Zone = this.add.zone(640 + bowlSpacing / 2, bowlY, 80, 60);
        this.bowl2Zone.setRectangleDropZone(80, 60);
    }

    private createTransmuteButton(): void {
        const btnContainer = this.add.container(640, 370);

        const bg = this.add.rectangle(0, 0, 180, 45, 0x884488)
            .setStrokeStyle(2, 0xaa66aa);

        const text = this.add.text(0, 0, 'TRANSMUTOVAT', {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        btnContainer.add([bg, text]);

        bg.setInteractive({ useHandCursor: true })
            .on('pointerover', () => bg.setFillStyle(0x996699))
            .on('pointerout', () => bg.setFillStyle(0x884488))
            .on('pointerdown', () => this.transmute());
    }

    private createDiamondTable(): void {
        // Table background
        this.add.rectangle(this.tableArea.x, this.tableArea.y,
            this.tableArea.width, this.tableArea.height, 0x5D3A1A, 0.8)
            .setStrokeStyle(3, 0x3D2A0A);

        this.add.text(this.tableArea.x, this.tableArea.y - this.tableArea.height / 2 - 15,
            'TVOJE DIAMANTY', {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#ccaa88'
        }).setOrigin(0.5);

        // Spawn diamonds on the table
        this.spawnTableDiamonds();
    }

    private spawnTableDiamonds(): void {
        // Clear existing diamonds
        this.tableDiamonds.forEach(d => d.destroy());
        this.tableDiamonds = [];
        this.bowl1Diamond = null;
        this.bowl2Diamond = null;

        const player = this.gameState.getPlayer();
        const diamonds = player.diamonds;

        // Calculate spawn positions
        let spawnIndex = 0;
        const diamondTypes: DiamondType[] = ['common', 'red', 'green'];

        for (const type of diamondTypes) {
            const count = diamonds[type];
            for (let i = 0; i < count; i++) {
                const x = this.tableArea.x - this.tableArea.width / 2 + 40 + (spawnIndex % 12) * 35;
                const y = this.tableArea.y - 20 + Math.floor(spawnIndex / 12) * 35;

                const diamond = this.createDraggableDiamond(type, x, y);
                this.tableDiamonds.push(diamond);
                spawnIndex++;
            }
        }
    }

    private createDraggableDiamond(type: DiamondType, x: number, y: number): DraggableDiamond {
        const visual = DIAMOND_VISUALS[type];
        const diamond = this.add.text(x, y, visual.emoji, {
            fontSize: '28px'
        }).setOrigin(0.5) as DraggableDiamond;

        diamond.diamondType = type;
        diamond.originalX = x;
        diamond.originalY = y;
        diamond.inBowl = null;
        diamond.setDepth(100);

        diamond.setInteractive({ useHandCursor: true, draggable: true });

        return diamond;
    }

    private setupDragHandling(): void {
        this.input.on('dragstart', (_pointer: Phaser.Input.Pointer, gameObject: DraggableDiamond) => {
            if (!gameObject.diamondType) return;
            this.draggedDiamond = gameObject;
            gameObject.setDepth(200);
            gameObject.setFontSize(36);

            // If dragging from a bowl, clear that bowl
            if (gameObject.inBowl === 0) {
                this.bowl1Diamond = null;
                this.bowl1Image.setFillStyle(0x8B4513);
            } else if (gameObject.inBowl === 1) {
                this.bowl2Diamond = null;
                this.bowl2Image.setFillStyle(0x8B4513);
            }
            gameObject.inBowl = null;
        });

        this.input.on('drag', (_pointer: Phaser.Input.Pointer, gameObject: DraggableDiamond, dragX: number, dragY: number) => {
            gameObject.x = dragX;
            gameObject.y = dragY;
        });

        this.input.on('dragend', (_pointer: Phaser.Input.Pointer, gameObject: DraggableDiamond) => {
            if (!gameObject.diamondType) return;
            gameObject.setFontSize(28);
            gameObject.setDepth(100);

            // Check if dropped in bowl 1
            if (this.isInZone(gameObject, this.bowl1Zone) && !this.bowl1Diamond) {
                this.bowl1Diamond = gameObject;
                gameObject.x = this.bowl1Zone.x;
                gameObject.y = this.bowl1Zone.y;
                gameObject.inBowl = 0;
                this.bowl1Image.setFillStyle(0xAA6633);
            }
            // Check if dropped in bowl 2
            else if (this.isInZone(gameObject, this.bowl2Zone) && !this.bowl2Diamond) {
                this.bowl2Diamond = gameObject;
                gameObject.x = this.bowl2Zone.x;
                gameObject.y = this.bowl2Zone.y;
                gameObject.inBowl = 1;
                this.bowl2Image.setFillStyle(0xAA6633);
            }
            // Return to original position on table
            else {
                gameObject.x = gameObject.originalX;
                gameObject.y = gameObject.originalY;
                gameObject.inBowl = null;
            }

            this.draggedDiamond = null;
        });
    }

    private isInZone(gameObject: Phaser.GameObjects.GameObject, zone: Phaser.GameObjects.Zone): boolean {
        const obj = gameObject as Phaser.GameObjects.Text;
        const bounds = zone.getBounds();
        return Phaser.Geom.Rectangle.Contains(bounds, obj.x, obj.y);
    }

    private transmute(): void {
        // Check if both bowls have diamonds
        if (!this.bowl1Diamond || !this.bowl2Diamond) {
            this.showMessage('Vlož diamanty do obou misek!', '#ffaa44');
            return;
        }

        const type1 = this.bowl1Diamond.diamondType;
        const type2 = this.bowl2Diamond.diamondType;

        // Find matching recipe
        const recipe = this.findRecipe(type1, type2);

        if (recipe) {
            // Success! Transmutation works
            this.performTransmutation(recipe, type1, type2);
        } else {
            // Wrong combination
            this.showMessage('Špatná kombinace!', '#ff4444');
            this.shakeBowls();
        }
    }

    private findRecipe(d1: DiamondType, d2: DiamondType): TransmutationRecipe | null {
        const sorted = [d1, d2].sort();

        return this.recipes.find(r => {
            const recipeInputs = [...r.input].sort();
            return recipeInputs[0] === sorted[0] && recipeInputs[1] === sorted[1];
        }) || null;
    }

    private performTransmutation(recipe: TransmutationRecipe, type1: DiamondType, type2: DiamondType): void {
        const player = this.gameState.getPlayer();

        // Deduct diamonds
        player.diamonds[type1]--;
        player.diamonds[type2]--;

        // Add new diamond
        player.diamonds[recipe.output]++;

        this.gameState.save();

        // Show success message
        const outputVisual = DIAMOND_VISUALS[recipe.output];
        this.showMessage(`Transmutace úspěšná! +1 ${outputVisual.emoji}`, '#44ff44');

        // Play success animation
        this.playSuccessAnimation();

        // Respawn table diamonds after animation
        this.time.delayedCall(800, () => {
            this.spawnTableDiamonds();
            this.updateInventoryDisplay();
        });
    }

    private playSuccessAnimation(): void {
        // Hide the old diamonds
        if (this.bowl1Diamond) {
            this.bowl1Diamond.setVisible(false);
        }
        if (this.bowl2Diamond) {
            this.bowl2Diamond.setVisible(false);
        }

        // Flash the bowls
        this.tweens.add({
            targets: [this.bowl1Image, this.bowl2Image],
            fillColor: { from: 0xffffff, to: 0x8B4513 },
            duration: 400,
            yoyo: true
        });

        // Create sparkle effect at center
        const sparkle = this.add.text(640, 300, '✨', {
            fontSize: '48px'
        }).setOrigin(0.5).setDepth(300);

        this.tweens.add({
            targets: sparkle,
            scale: 2,
            alpha: 0,
            duration: 600,
            onComplete: () => sparkle.destroy()
        });

        // Reset bowl colors
        this.bowl1Image.setFillStyle(0x8B4513);
        this.bowl2Image.setFillStyle(0x8B4513);
    }

    private shakeBowls(): void {
        // Shake animation for failed combination
        const originalX1 = this.bowl1Image.x;
        const originalX2 = this.bowl2Image.x;

        this.tweens.add({
            targets: [this.bowl1Image, this.bowl1Diamond],
            x: originalX1 + 8,
            duration: 50,
            yoyo: true,
            repeat: 3
        });

        this.tweens.add({
            targets: [this.bowl2Image, this.bowl2Diamond],
            x: originalX2 + 8,
            duration: 50,
            yoyo: true,
            repeat: 3
        });
    }

    private showMessage(text: string, color: string): void {
        this.messageText.setText(text);
        this.messageText.setColor(color);
        this.messageText.setAlpha(1);

        // Fade out after delay
        this.tweens.add({
            targets: this.messageText,
            alpha: 0,
            delay: 2000,
            duration: 500
        });
    }

    private updateInventoryDisplay(): void {
        const player = this.gameState.getPlayer();
        const diamonds = player.diamonds;

        if (this.inventoryText) {
            this.inventoryText.destroy();
        }

        this.inventoryText = this.add.text(640, 620,
            `Diamanty: ${diamonds.common}× 💎  ${diamonds.red}× ❤️  ${diamonds.green}× 💚`, {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            backgroundColor: '#000000',
            padding: { x: 15, y: 8 }
        }).setOrigin(0.5);
    }
}
