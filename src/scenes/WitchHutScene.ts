import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { CrystalSystem } from '../systems/CrystalSystem';
import { SceneDebugger } from '../systems/SceneDebugger';
import { SceneBuilder } from '../systems/SceneBuilder';
import { PetDefinition, Crystal, PlayerState, CrystalTier } from '../types';

export class WitchHutScene extends Phaser.Scene {
    private gameState!: GameStateManager;
    private potionCost: number = 5;
    private debugger!: SceneDebugger;
    private sceneBuilder!: SceneBuilder;

    // Binding state
    private selectedPet: PetDefinition | null = null;
    private selectedCrystal: Crystal | null = null;

    // UI Containers
    private potionPanel!: Phaser.GameObjects.Container;
    private petGridContainer!: Phaser.GameObjects.Container;
    private crystalInventoryContainer!: Phaser.GameObjects.Container;
    private bindingAreaContainer!: Phaser.GameObjects.Container;

    constructor() {
        super({ key: 'WitchHutScene' });
    }

    create(): void {
        this.gameState = GameStateManager.getInstance();
        this.selectedPet = null;
        this.selectedCrystal = null;

        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.buildScene();

        this.createPotionPanel();
        this.createPetGrid();
        this.createCrystalInventory();
        this.createBindingArea();

        this.debugger = new SceneDebugger(this, 'WitchHutScene');
    }

    // ========== POTION PANEL (keep existing) ==========

    private createPotionPanel(): void {
        const player = this.gameState.getPlayer();
        const potionPanelEl = this.sceneBuilder.get('potionPanel') as Phaser.GameObjects.Container | undefined;
        const panelX = potionPanelEl?.x ?? 200;
        const panelY = potionPanelEl?.y ?? 200;

        this.potionPanel = this.add.container(panelX, panelY);
        this.potionPanel.setDepth(10);

        const bg = this.add.rectangle(0, 0, 200, 150, 0x000000, 0.7)
            .setStrokeStyle(2, 0x884488);
        this.potionPanel.add(bg);

        const title = this.add.text(0, -50, 'LEKTVARY', {
            fontSize: '18px', color: '#ff88ff'
        }).setOrigin(0.5);
        this.potionPanel.add(title);

        const hasPotion = player.potions > 0;
        const statusText = hasPotion ? '🧪 MÁŠ LEKTVAR' : '🧪 ŽÁDNÝ LEKTVAR';
        const status = this.add.text(0, -15, statusText, {
            fontSize: '16px', color: hasPotion ? '#00ff00' : '#ff6666'
        }).setOrigin(0.5);
        this.potionPanel.add(status);

        if (!hasPotion) {
            const canAfford = ProgressionSystem.getTotalCoinValue(player.coins) >= this.potionCost;
            const btn = this.add.rectangle(0, 30, 150, 40, canAfford ? 0x00aa00 : 0x555555)
                .setStrokeStyle(2, 0xffffff);
            const btnText = this.add.text(0, 30, `KOUPIT (${this.potionCost})`, {
                fontSize: '14px', color: '#ffffff'
            }).setOrigin(0.5);
            this.potionPanel.add([btn, btnText]);

            if (canAfford) {
                btn.setInteractive({ useHandCursor: true })
                    .on('pointerdown', () => this.buyPotion());
            }
        }
    }

    private buyPotion(): void {
        const player = this.gameState.getPlayer();
        if (ProgressionSystem.spendCoins(player, this.potionCost)) {
            player.potions = 1;
            this.gameState.save();
            this.scene.restart();
        }
    }

    // ========== PET GRID (unlocked pets only) ==========

    private createPetGrid(): void {
        const player = this.gameState.getPlayer();
        const pets = this.cache.json.get('pets') as PetDefinition[];

        this.petGridContainer = this.add.container(1000, 300);
        this.petGridContainer.setDepth(10);

        const bg = this.add.rectangle(0, 0, 250, 400, 0x000000, 0.7)
            .setStrokeStyle(2, 0x884488);
        this.petGridContainer.add(bg);

        const title = this.add.text(0, -180, 'MAZLÍČCI', {
            fontSize: '18px', color: '#ff88ff'
        }).setOrigin(0.5);
        this.petGridContainer.add(title);

        // Filter: only unlocked pets
        const unlockedPets = pets.filter(pet => this.isPetUnlocked(pet, player));

        const cellSize = 80;
        const cols = 2;
        const startX = -50;
        const startY = -120;

        unlockedPets.forEach((pet, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const x = startX + col * cellSize;
            const y = startY + row * cellSize;
            this.createPetCell(pet, x, y, player);
        });
    }

    private createPetCell(pet: PetDefinition, x: number, y: number, player: PlayerState): void {
        const isOwned = player.ownedPets.includes(pet.id);
        const isActive = player.activePet === pet.id;
        const isSelected = this.selectedPet?.id === pet.id;

        const cell = this.add.container(x, y);

        // Background
        let bgColor = 0x333355;
        if (isSelected) bgColor = 0x446688;
        else if (isActive) bgColor = 0x225522;
        else if (isOwned) bgColor = 0x334433;

        const bg = this.add.rectangle(0, 0, 70, 70, bgColor)
            .setStrokeStyle(2, isActive ? 0x44ff44 : (isSelected ? 0x88aaff : 0x555577));
        cell.add(bg);

        // Pet sprite
        if (this.textures.exists(pet.spriteKey)) {
            const sprite = this.add.sprite(0, -8, pet.spriteKey, 0).setScale(0.5);
            cell.add(sprite);
        }

        // Name
        const name = this.add.text(0, 22, pet.name, {
            fontSize: '10px', color: '#ffffff'
        }).setOrigin(0.5);
        cell.add(name);

        // Show amulet cost if not owned
        if (!isOwned) {
            const config = CrystalSystem.getTierConfig(pet.requiredAmulet.tier);
            const costText = `${config.emoji}${pet.requiredAmulet.value}`;
            const cost = this.add.text(0, 34, costText, {
                fontSize: '9px', color: config.color
            }).setOrigin(0.5);
            cell.add(cost);

            // Show special crystal requirement
            if (pet.requiredSpecialCrystal) {
                const specialConfig = CrystalSystem.getTierConfig(pet.requiredSpecialCrystal as CrystalTier);
                const specialText = this.add.text(25, -25, specialConfig.emoji, {
                    fontSize: '14px'
                }).setOrigin(0.5);
                cell.add(specialText);
            }
        }

        // Active indicator
        if (isActive) {
            const star = this.add.text(25, -25, '★', {
                fontSize: '16px', color: '#44ff44'
            }).setOrigin(0.5);
            cell.add(star);
        }

        // Interaction
        cell.setSize(70, 70);
        cell.setInteractive({ useHandCursor: true });
        cell.on('pointerdown', () => this.onPetClick(pet));

        this.petGridContainer.add(cell);
    }

    private onPetClick(pet: PetDefinition): void {
        const player = this.gameState.getPlayer();
        const isOwned = player.ownedPets.includes(pet.id);

        if (isOwned) {
            // Owned pets: immediate activation
            player.activePet = pet.id;
            this.gameState.save();
            this.scene.restart();
        } else {
            // Unowned pets: select for binding
            this.selectedPet = (this.selectedPet?.id === pet.id) ? null : pet;
            this.selectedCrystal = null; // Reset crystal selection
            this.refreshUI();
        }
    }

    private isPetUnlocked(pet: PetDefinition, player: PlayerState): boolean {
        if (pet.unlockedByEnemy) {
            return player.unlockedPets.includes(pet.unlockedByEnemy);
        }
        if (pet.unlockedByArenaLevel !== undefined) {
            return player.unlockedPets.includes(`arena_level_${pet.unlockedByArenaLevel}`);
        }
        if (pet.unlockedByArenaLevels) {
            const levels = pet.unlockedByArenaLevels;
            return levels.every(level => player.unlockedPets.includes(`arena_level_${level}`));
        }
        return false;
    }

    // ========== CRYSTAL INVENTORY ==========

    private createCrystalInventory(): void {
        this.crystalInventoryContainer = this.add.container(200, 550);
        this.crystalInventoryContainer.setDepth(10);

        const bg = this.add.rectangle(0, 0, 350, 140, 0x000000, 0.7)
            .setStrokeStyle(2, 0x884488);
        this.crystalInventoryContainer.add(bg);

        const title = this.add.text(0, -55, 'TVOJE KRYSTALY', {
            fontSize: '14px', color: '#aaccff'
        }).setOrigin(0.5);
        this.crystalInventoryContainer.add(title);

        this.renderCrystals();
    }

    private renderCrystals(): void {
        const player = this.gameState.getPlayer();
        const crystals = player.crystals?.crystals || [];

        // Remove old crystal slots (keep first 2 children: bg and title)
        while (this.crystalInventoryContainer.list.length > 2) {
            this.crystalInventoryContainer.list[2].destroy();
        }

        const cols = 8;
        const slotSize = 40;
        const startX = -140;
        const startY = -15;

        crystals.forEach((crystal, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const x = startX + col * slotSize;
            const y = startY + row * slotSize;
            this.createCrystalSlot(x, y, crystal);
        });

        // Capacity display
        const capacity = this.add.text(0, 50, `${crystals.length}/20`, {
            fontSize: '12px', color: '#888888'
        }).setOrigin(0.5);
        this.crystalInventoryContainer.add(capacity);
    }

    private createCrystalSlot(x: number, y: number, crystal: Crystal): void {
        const config = CrystalSystem.getTierConfig(crystal.tier);
        const isSelected = this.selectedCrystal?.id === crystal.id;
        const isMatching = this.doesCrystalMatch(crystal);

        const slot = this.add.container(x, y);

        // Background
        let bgColor = 0x333355;
        if (isSelected) bgColor = 0x446688;
        else if (isMatching) bgColor = 0x335544;

        const bg = this.add.rectangle(0, 0, 35, 35, bgColor)
            .setStrokeStyle(2, isSelected ? 0x88aaff : (isMatching ? 0x55aa55 : 0x444466));
        slot.add(bg);

        // Emoji
        const emoji = this.add.text(0, -5, config.emoji, {
            fontSize: '16px'
        }).setOrigin(0.5);
        slot.add(emoji);

        // Value
        const value = this.add.text(0, 12, `${crystal.value}`, {
            fontSize: '9px', color: config.color
        }).setOrigin(0.5);
        slot.add(value);

        // Lock indicator
        if (crystal.locked) {
            const lock = this.add.text(12, -12, '🔒', { fontSize: '10px' }).setOrigin(0.5);
            slot.add(lock);
        }

        // Interaction (only if not locked)
        if (!crystal.locked) {
            slot.setSize(35, 35);
            slot.setInteractive({ useHandCursor: true });
            slot.on('pointerdown', () => this.onCrystalClick(crystal));
        }

        this.crystalInventoryContainer.add(slot);
    }

    private onCrystalClick(crystal: Crystal): void {
        this.selectedCrystal = (this.selectedCrystal?.id === crystal.id) ? null : crystal;
        this.refreshUI();
    }

    private doesCrystalMatch(crystal: Crystal): boolean {
        if (!this.selectedPet) return false;
        return crystal.tier === this.selectedPet.requiredAmulet.tier &&
               crystal.value === this.selectedPet.requiredAmulet.value;
    }

    // ========== BINDING AREA ==========

    private createBindingArea(): void {
        this.bindingAreaContainer = this.add.container(550, 300);
        this.bindingAreaContainer.setDepth(10);

        const bg = this.add.rectangle(0, 0, 300, 350, 0x000000, 0.7)
            .setStrokeStyle(2, 0x884488);
        this.bindingAreaContainer.add(bg);

        const title = this.add.text(0, -150, 'OCHOČENÍ', {
            fontSize: '20px', color: '#ff88ff'
        }).setOrigin(0.5);
        this.bindingAreaContainer.add(title);

        // Crystal slot label
        const crystalLabel = this.add.text(-60, -100, 'Amulet', { fontSize: '12px', color: '#888888' })
            .setOrigin(0.5);
        this.bindingAreaContainer.add(crystalLabel);

        const crystalSlotBg = this.add.rectangle(-60, -50, 70, 70, 0x223344)
            .setStrokeStyle(2, 0x446688);
        this.bindingAreaContainer.add(crystalSlotBg);

        // Pet slot label
        const petLabel = this.add.text(60, -100, 'Tvor', { fontSize: '12px', color: '#888888' })
            .setOrigin(0.5);
        this.bindingAreaContainer.add(petLabel);

        const petSlotBg = this.add.rectangle(60, -50, 70, 70, 0x223344)
            .setStrokeStyle(2, 0x446688);
        this.bindingAreaContainer.add(petSlotBg);

        // Cauldron visual
        const cauldron = this.add.circle(0, 50, 50, 0x553366, 0.5)
            .setStrokeStyle(3, 0x884488);
        this.bindingAreaContainer.add(cauldron);

        // Binding button
        const bindBtn = this.add.rectangle(0, 130, 160, 45, 0x444444)
            .setStrokeStyle(2, 0x666666);
        const bindText = this.add.text(0, 130, 'OCHOČIT', {
            fontSize: '16px', color: '#888888'
        }).setOrigin(0.5);
        this.bindingAreaContainer.add([bindBtn, bindText]);

        // Store references for updates
        this.bindingAreaContainer.setData('bindBtn', bindBtn);
        this.bindingAreaContainer.setData('bindText', bindText);
        this.bindingAreaContainer.setData('crystalSlot', crystalSlotBg);
        this.bindingAreaContainer.setData('petSlot', petSlotBg);

        this.updateBindingArea();
    }

    private updateBindingArea(): void {
        const bindBtn = this.bindingAreaContainer.getData('bindBtn') as Phaser.GameObjects.Rectangle;
        const bindText = this.bindingAreaContainer.getData('bindText') as Phaser.GameObjects.Text;

        const canBind = this.canPerformBinding();

        if (canBind) {
            bindBtn.setFillStyle(0x446644);
            bindBtn.setStrokeStyle(2, 0x66aa66);
            bindText.setColor('#ffffff');
            bindBtn.setInteractive({ useHandCursor: true })
                .off('pointerdown')
                .on('pointerdown', () => this.performBinding());
        } else {
            bindBtn.setFillStyle(0x444444);
            bindBtn.setStrokeStyle(2, 0x666666);
            bindText.setColor('#888888');
            bindBtn.removeInteractive();
        }

        // Update slot visuals
        this.updateBindingSlots();
    }

    private updateBindingSlots(): void {
        // This would update the slot visuals to show selected crystal/pet
        // For simplicity, we rely on pet grid and crystal inventory highlights
    }

    private canPerformBinding(): boolean {
        if (!this.selectedPet || !this.selectedCrystal) return false;

        const player = this.gameState.getPlayer();

        // Check crystal matches requirement
        const crystalMatches = this.selectedCrystal.tier === this.selectedPet.requiredAmulet.tier &&
                               this.selectedCrystal.value === this.selectedPet.requiredAmulet.value;

        if (!crystalMatches) return false;

        // Check special crystal requirement (for final pet)
        if (this.selectedPet.requiredSpecialCrystal) {
            const hasSpecial = player.crystals?.crystals.some(
                c => c.tier === this.selectedPet!.requiredSpecialCrystal
            ) ?? false;
            return hasSpecial;
        }

        return true;
    }

    private performBinding(): void {
        if (!this.canPerformBinding()) return;

        const player = this.gameState.getPlayer();

        // Remove main crystal
        CrystalSystem.removeFromInventory(player, this.selectedCrystal!.id);

        // Remove special crystal if required
        if (this.selectedPet!.requiredSpecialCrystal) {
            const specialCrystal = player.crystals?.crystals.find(
                c => c.tier === this.selectedPet!.requiredSpecialCrystal
            );
            if (specialCrystal) {
                CrystalSystem.removeFromInventory(player, specialCrystal.id);
            }
        }

        // Add pet to owned
        player.ownedPets.push(this.selectedPet!.id);

        // Set as active if first pet
        if (!player.activePet) {
            player.activePet = this.selectedPet!.id;
        }

        this.gameState.save();

        // Simple flash animation then restart
        const flash = this.add.rectangle(640, 360, 1280, 720, 0xffffff, 0).setDepth(100);
        this.tweens.add({
            targets: flash,
            alpha: { from: 0, to: 0.5 },
            duration: 200,
            yoyo: true,
            onComplete: () => this.scene.restart()
        });
    }

    // ========== UI REFRESH ==========

    private refreshUI(): void {
        // Recreate pet grid and crystal inventory to reflect selections
        this.petGridContainer.destroy();
        this.crystalInventoryContainer.destroy();

        this.createPetGrid();
        this.createCrystalInventory();
        this.updateBindingArea();
    }
}
