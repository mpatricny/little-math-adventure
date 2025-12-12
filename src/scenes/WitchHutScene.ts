import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { SceneDebugger } from '../systems/SceneDebugger';
import { SceneBuilder } from '../systems/SceneBuilder';
import { PetDefinition } from '../types';

// Diamond visual representations for price display
const DIAMOND_VISUALS = {
    common: '💎',
    red: '❤️',
    green: '💚',
};

export class WitchHutScene extends Phaser.Scene {
    private gameState!: GameStateManager;
    private potionCost: number = 5;
    private debugger!: SceneDebugger;
    private sceneBuilder!: SceneBuilder;

    // UI Containers
    private potionPanel!: Phaser.GameObjects.Container;
    private petShopPanel!: Phaser.GameObjects.Container;
    private diamondDisplay!: Phaser.GameObjects.Container;

    constructor() {
        super({ key: 'WitchHutScene' });
    }

    create(): void {
        this.gameState = GameStateManager.getInstance();

        // Initialize SceneBuilder
        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.buildScene();

        // Create panels (complex UI not fully in JSON)
        this.createPotionPanel();
        this.createPetShopPanel();
        this.createDiamondDisplay();

        // Note: backBtn click event is now handled via scenes.json action syntax (enterScene:TownScene)

        // Setup universal debugger
        this.debugger = new SceneDebugger(this, 'WitchHutScene');
    }

    private createPotionPanel(): void {
        const player = this.gameState.getPlayer();

        // Get position from sceneBuilder
        const potionPanelEl = this.sceneBuilder.get('potionPanel');
        const panelX = potionPanelEl?.x ?? 280;
        const panelY = potionPanelEl?.y ?? 280;
        const panelDepth = this.sceneBuilder.getLayoutOverride('potionPanel')?.depth ?? 10;

        this.potionPanel = this.add.container(panelX, panelY);
        this.potionPanel.setDepth(panelDepth);

        // Panel background
        const bg = this.add.rectangle(0, 0, 300, 200, 0x000000, 0.7)
            .setStrokeStyle(2, 0x884488);
        this.potionPanel.add(bg);

        // Title
        const title = this.add.text(0, -60, 'LEKTVARY', {
            fontSize: '22px',
            fontFamily: 'Arial, sans-serif',
            color: '#ff88ff'
        }).setOrigin(0.5);
        this.potionPanel.add(title);

        // Potion status
        const hasPotion = player.potions > 0;
        const statusText = hasPotion ? '🧪 MÁŠ LEKTVAR' : '🧪 ŽÁDNÝ LEKTVAR';
        const statusColor = hasPotion ? '#00ff00' : '#ff6666';

        const status = this.add.text(0, -20, statusText, {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: statusColor
        }).setOrigin(0.5);
        this.potionPanel.add(status);

        // Remove healBtn placeholder if exists
        const builderHealBtn = this.sceneBuilder.get('healBtn');
        if (builderHealBtn) {
            builderHealBtn.destroy();
        }

        // Create potion button
        this.createPotionButton(player, 0, 40);
    }

    private createPotionButton(player: any, x: number, y: number): void {
        const hasPotion = player.potions > 0;
        const canAfford = ProgressionSystem.getTotalCoinValue(player.coins) >= this.potionCost;

        const button = this.add.container(x, y);

        if (hasPotion) {
            // Player already has a potion
            const text = this.add.text(0, 0, 'UŽ MÁŠ LEKTVAR', {
                fontSize: '16px',
                fontFamily: 'Arial, sans-serif',
                color: '#888888'
            }).setOrigin(0.5);
            button.add(text);
        } else {
            // Show buy button
            const btnColor = canAfford ? 0x00aa00 : 0x555555;
            const bg = this.add.rectangle(0, 0, 180, 50, btnColor)
                .setStrokeStyle(2, 0xffffff);

            const text = this.add.text(0, 0, `KOUPIT (${this.potionCost} MĚDÍ)`, {
                fontSize: '16px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff'
            }).setOrigin(0.5);

            button.add([bg, text]);

            if (canAfford) {
                bg.setInteractive({ useHandCursor: true })
                    .on('pointerover', () => bg.setFillStyle(0x00cc00))
                    .on('pointerout', () => bg.setFillStyle(0x00aa00))
                    .on('pointerdown', () => this.buyPotion());
            } else {
                button.setAlpha(0.7);
                text.setText('NEDOSTATEK MĚDÍ');
            }
        }

        this.potionPanel.add(button);
    }

    private createPetShopPanel(): void {
        const player = this.gameState.getPlayer();
        const pets = this.cache.json.get('pets') as PetDefinition[];
        const panelX = 800;
        const panelY = 320;

        this.petShopPanel = this.add.container(panelX, panelY);

        // Panel background (larger for pets)
        const bg = this.add.rectangle(0, 0, 400, 400, 0x000000, 0.7)
            .setStrokeStyle(2, 0x884488);
        this.petShopPanel.add(bg);

        // Pet list
        const startY = -130;
        const rowHeight = 85;

        pets.forEach((pet, index) => {
            const rowY = startY + index * rowHeight;
            this.createPetRow(pet, 0, rowY, player);
        });
    }

    private createPetRow(pet: PetDefinition, centerX: number, y: number, player: any): void {
        // Check if pet is unlocked - either by defeating enemy or completing arena level
        let isUnlocked = false;
        if (pet.unlockedByEnemy) {
            isUnlocked = player.unlockedPets.includes(pet.unlockedByEnemy);
        } else if (pet.unlockedByArenaLevel !== undefined) {
            const arenaUnlockKey = `arena_level_${pet.unlockedByArenaLevel}`;
            isUnlocked = player.unlockedPets.includes(arenaUnlockKey);
        }
        const isOwned = player.ownedPets.includes(pet.id);
        const isActive = player.activePet === pet.id;
        const canAfford = ProgressionSystem.canAffordDiamonds(player, pet.cost);

        // Row background - highlight active pet
        const borderColor = isActive ? 0x44ff44 : (isOwned ? 0x00aa00 : (isUnlocked ? 0xffaa00 : 0x666666));
        const rowBg = this.add.rectangle(centerX, y, 380, 75, 0x333333, 0.5)
            .setStrokeStyle(isActive ? 3 : 1, borderColor);
        this.petShopPanel.add(rowBg);

        // Pet sprite (left side) - use small scale to fit in row
        const spriteX = centerX - 150;
        if (this.textures.exists(pet.spriteKey)) {
            const sprite = this.add.sprite(spriteX, y, pet.spriteKey, 0);
            // Scale to fit within ~60px height
            const maxSize = 50;
            const scale = Math.min(maxSize / sprite.width, maxSize / sprite.height);
            sprite.setScale(scale);
            if (!isUnlocked) sprite.setTint(0x333333);
            this.petShopPanel.add(sprite);
        } else {
            const emoji = this.add.text(spriteX, y, '🐾', { fontSize: '32px' }).setOrigin(0.5);
            this.petShopPanel.add(emoji);
        }

        // Pet name
        const nameColor = isActive ? '#44ff44' : (isOwned ? '#00ff00' : (isUnlocked ? '#ffffff' : '#666666'));
        const nameText = this.add.text(centerX - 60, y - 20, pet.name, {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: nameColor,
            fontStyle: 'bold'
        }).setOrigin(0, 0.5);
        this.petShopPanel.add(nameText);

        // Status text and actions based on ownership
        if (isOwned) {
            if (isActive) {
                // Show "AKTIVNÍ" for currently selected pet
                const status = this.add.text(centerX - 60, y + 10, '★ AKTIVNÍ', {
                    fontSize: '14px',
                    fontFamily: 'Arial, sans-serif',
                    color: '#44ff44'
                }).setOrigin(0, 0.5);
                this.petShopPanel.add(status);
            } else {
                // Show "VYBRAT" button for owned but not active pets
                this.createSelectButton(centerX + 120, y, pet);
            }
        } else if (!isUnlocked) {
            // Locked pet
            const status = this.add.text(centerX - 60, y + 10, 'ZAMČENO', {
                fontSize: '14px',
                fontFamily: 'Arial, sans-serif',
                color: '#ff4444'
            }).setOrigin(0, 0.5);
            this.petShopPanel.add(status);
        }

        // Price display (right side) - only if unlocked and not owned
        if (isUnlocked && !isOwned) {
            const priceX = centerX + 50;
            this.createPriceDisplay(priceX, y - 15, pet.cost);

            // Buy button
            this.createBuyButton(centerX + 140, y + 15, pet, canAfford);
        }
    }

    private createPriceDisplay(x: number, y: number, cost: { common: number; red: number; green: number }): void {
        let offsetX = 0;
        const spacing = 45;

        if (cost.common > 0) {
            const txt = this.add.text(x + offsetX, y, `${cost.common}${DIAMOND_VISUALS.common}`, {
                fontSize: '16px'
            }).setOrigin(0.5);
            this.petShopPanel.add(txt);
            offsetX += spacing;
        }
        if (cost.red > 0) {
            const txt = this.add.text(x + offsetX, y, `${cost.red}${DIAMOND_VISUALS.red}`, {
                fontSize: '16px'
            }).setOrigin(0.5);
            this.petShopPanel.add(txt);
            offsetX += spacing;
        }
        if (cost.green > 0) {
            const txt = this.add.text(x + offsetX, y, `${cost.green}${DIAMOND_VISUALS.green}`, {
                fontSize: '16px'
            }).setOrigin(0.5);
            this.petShopPanel.add(txt);
        }
    }

    private createBuyButton(x: number, y: number, pet: PetDefinition, canAfford: boolean): void {
        const btnColor = canAfford ? 0x00aa00 : 0x555555;
        const button = this.add.container(x, y);

        const bg = this.add.rectangle(0, 0, 70, 30, btnColor)
            .setStrokeStyle(1, 0xffffff);

        const text = this.add.text(0, 0, 'KOUPIT', {
            fontSize: '12px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff'
        }).setOrigin(0.5);

        button.add([bg, text]);
        this.petShopPanel.add(button);

        if (canAfford) {
            bg.setInteractive({ useHandCursor: true })
                .on('pointerover', () => bg.setFillStyle(0x00cc00))
                .on('pointerout', () => bg.setFillStyle(0x00aa00))
                .on('pointerdown', () => this.buyPet(pet));
        } else {
            button.setAlpha(0.5);
        }
    }

    private buyPet(pet: PetDefinition): void {
        const player = this.gameState.getPlayer();

        if (ProgressionSystem.spendDiamonds(player, pet.cost)) {
            player.ownedPets.push(pet.id);
            // Set as active pet if first one
            if (!player.activePet) {
                player.activePet = pet.id;
            }
            this.gameState.save();
            this.scene.restart();
        }
    }

    private createSelectButton(x: number, y: number, pet: PetDefinition): void {
        const button = this.add.container(x, y);

        const bg = this.add.rectangle(0, 0, 80, 30, 0x4488aa)
            .setStrokeStyle(1, 0xffffff);

        const text = this.add.text(0, 0, 'VYBRAT', {
            fontSize: '12px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff'
        }).setOrigin(0.5);

        button.add([bg, text]);
        this.petShopPanel.add(button);

        bg.setInteractive({ useHandCursor: true })
            .on('pointerover', () => bg.setFillStyle(0x55aacc))
            .on('pointerout', () => bg.setFillStyle(0x4488aa))
            .on('pointerdown', () => this.selectPet(pet));
    }

    private selectPet(pet: PetDefinition): void {
        const player = this.gameState.getPlayer();
        player.activePet = pet.id;
        this.gameState.save();
        this.scene.restart();
    }

    private createDiamondDisplay(): void {
        const player = this.gameState.getPlayer();
        const y = 560;

        this.diamondDisplay = this.add.container(640, y);

        // Background
        const bg = this.add.rectangle(0, 0, 400, 60, 0x000000, 0.7)
            .setStrokeStyle(2, 0x884488);
        this.diamondDisplay.add(bg);

        // Title
        const title = this.add.text(0, -20, 'TVOJE DIAMANTY', {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#aa88ff'
        }).setOrigin(0.5);
        this.diamondDisplay.add(title);

        // Diamond counts
        const diamondY = 10;
        const spacing = 100;

        const commonTxt = this.add.text(-spacing, diamondY, `${player.diamonds.common} ${DIAMOND_VISUALS.common}`, {
            fontSize: '20px'
        }).setOrigin(0.5);
        this.diamondDisplay.add(commonTxt);

        const redTxt = this.add.text(0, diamondY, `${player.diamonds.red} ${DIAMOND_VISUALS.red}`, {
            fontSize: '20px'
        }).setOrigin(0.5);
        this.diamondDisplay.add(redTxt);

        const greenTxt = this.add.text(spacing, diamondY, `${player.diamonds.green} ${DIAMOND_VISUALS.green}`, {
            fontSize: '20px'
        }).setOrigin(0.5);
        this.diamondDisplay.add(greenTxt);
    }

    private buyPotion(): void {
        const player = this.gameState.getPlayer();

        if (ProgressionSystem.spendCoins(player, this.potionCost)) {
            player.potions = 1;
            player.hasPotionSubscription = true;
            this.gameState.save();
            this.scene.restart(); // Refresh UI
        }
    }
}
