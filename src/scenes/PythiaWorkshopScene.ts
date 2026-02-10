import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { CrystalSystem } from '../systems/CrystalSystem';
import { ManaSystem } from '../systems/ManaSystem';
import { SceneBuilder } from '../systems/SceneBuilder';
import { UiElementBuilder } from '../systems/UiElementBuilder';
import { PetDefinition, Crystal, PlayerState, CrystalTier } from '../types';

/**
 * PythiaWorkshopScene - Graphical replacement for WitchHutScene
 *
 * Uses Scene Editor positioned UI elements for:
 * - Potion purchase panel (left side)
 * - Crystal inventory with tiered rows (bottom left)
 * - Pet binding area (center)
 * - Pet list (right side)
 */
export class PythiaWorkshopScene extends Phaser.Scene {
    private gameState!: GameStateManager;
    private sceneBuilder!: SceneBuilder;

    // Selection state
    private selectedPet: PetDefinition | null = null;
    private selectedCrystal: Crystal | null = null;

    // Pagination state
    private crystalPages: { [tier: string]: number } = { shard: 0, fragment: 0, prism: 0 };
    private petScrollOffset: number = 0;

    // Costs
    private readonly MANA_COST = 2;
    private readonly COIN_COST = 2;
    private readonly POTION_COST = 5;

    // Layout constants
    private readonly CRYSTALS_PER_ROW = 4;
    private readonly PETS_VISIBLE = 5;

    // Crystal grid - 3 rows (one per tier) with holders
    private crystalRows: {
        tier: CrystalTier;
        holders: { container: Phaser.GameObjects.Container; crystal: Crystal | null }[];
    }[] = [];
    private crystalHoldersContainer!: Phaser.GameObjects.Container;

    // Pet list - array of pet row containers
    private petRows: { container: Phaser.GameObjects.Container; pet: PetDefinition | null }[] = [];
    private petRowsContainer!: Phaser.GameObjects.Container;

    // UI containers for dynamic content
    private bindingCrystalDisplay!: Phaser.GameObjects.Container;
    private bindingPetDisplay!: Phaser.GameObjects.Container;
    private manaText: Phaser.GameObjects.Text | null = null;
    private coinsText: Phaser.GameObjects.Text | null = null;
    private bindCostDisplay: Phaser.GameObjects.Container | null = null;
    private bindWarningText: Phaser.GameObjects.Text | null = null;

    constructor() {
        super({ key: 'PythiaWorkshopScene' });
    }

    create(): void {
        this.gameState = GameStateManager.getInstance();
        this.selectedPet = null;
        this.selectedCrystal = null;
        this.crystalPages = { shard: 0, fragment: 0, prism: 0 };
        this.petScrollOffset = 0;
        this.crystalRows = [];
        this.petRows = [];
        this.bindCostDisplay = null;
        this.bindWarningText = null;
        this.manaText = null;
        this.coinsText = null;

        this.sceneBuilder = new SceneBuilder(this);

        // Register handler BEFORE buildScene (pattern from CharacterSelectNewScene)
        this.sceneBuilder.registerHandler('onBack', () => this.scene.start('TownScene'));

        this.sceneBuilder.buildScene();

        // Create dynamic UI components
        this.createResourceDisplay();
        this.createPotionPanel();
        this.createCrystalGrid();
        this.createBindingArea();
        this.createPetList();
        this.setupArrowVisibility();
    }

    // ========== RESOURCE DISPLAY ==========

    private createResourceDisplay(): void {
        const player = this.gameState.getPlayer();
        const manaCount = ManaSystem.getMana(player);
        const coinsCount = ProgressionSystem.getTotalCoinValue(player.coins);

        // Use the "money mana" UI template element (same as CrystalForgeScene)
        const manaElement = this.sceneBuilder.get<Phaser.GameObjects.Container>('money mana');
        if (manaElement) {
            const textObjects = manaElement.getData('textObjects') as Map<string, { text: Phaser.GameObjects.Text }> | undefined;
            if (textObjects) {
                // Mana text ID (from money-mana template)
                const manaTextEntry = textObjects.get('1770241846853-jfbnou0oe');
                if (manaTextEntry) {
                    this.manaText = manaTextEntry.text;
                    this.manaText.setText(`${manaCount}`);
                }

                // Coins text ID (from money-mana template)
                const coinsTextEntry = textObjects.get('1770241864666-yyygo6t26');
                if (coinsTextEntry) {
                    this.coinsText = coinsTextEntry.text;
                    this.coinsText.setText(`${coinsCount}`);
                }

                if (manaTextEntry) return; // Success — template-based display is active
            }
        }

        // Fallback: programmatic text if template element not found
        console.warn('[PythiaWorkshop] Could not find money mana UI element, using fallback');
        this.manaText = this.add.text(100, 30, `Mana: ${manaCount}`, {
            fontSize: '16px',
            color: '#88ccff',
            fontStyle: 'bold'
        }).setOrigin(0, 0.5).setDepth(50);
        this.coinsText = this.add.text(200, 30, `Mince: ${coinsCount}`, {
            fontSize: '16px',
            color: '#ffd700',
            fontStyle: 'bold'
        }).setOrigin(0, 0.5).setDepth(50);
    }

    private updateResourceDisplay(): void {
        const player = this.gameState.getPlayer();
        if (this.manaText) this.manaText.setText(`${ManaSystem.getMana(player)}`);
        if (this.coinsText) this.coinsText.setText(`${ProgressionSystem.getTotalCoinValue(player.coins)}`);
    }

    // ========== POTION PANEL ==========

    private createPotionPanel(): void {
        const player = this.gameState.getPlayer();

        // Get button from scene builder
        const greenButton = this.sceneBuilder.get('Green_button') as Phaser.GameObjects.Container | undefined;

        const btnX = (greenButton as any)?.x ?? 248;
        const btnY = (greenButton as any)?.y ?? 244;

        // Check if player already has potion
        const hasPotion = player.potions > 0;
        const canAfford = ProgressionSystem.getTotalCoinValue(player.coins) >= this.POTION_COST;

        if (hasPotion) {
            // Hide button and show green checkmark instead
            greenButton?.setVisible(false);
            this.add.text(btnX, btnY, '✓', {
                fontSize: '48px',
                color: '#44ff44',
                fontStyle: 'bold'
            }).setOrigin(0.5).setDepth(20);
        } else if (greenButton) {
            // Set button text via textObjects (text area ID from Green_button template)
            const textObjects = greenButton.getData('textObjects') as Map<string, { text: Phaser.GameObjects.Text }> | undefined;
            const btnTextInfo = textObjects?.get('1768922299962-lij5d6x4j');
            btnTextInfo?.text.setText(`KOUPIT (${this.POTION_COST})`);

            if (canAfford) {
                this.sceneBuilder.bindClick('Green_button', () => this.buyPotion());
            } else {
                // Grey out button if can't afford
                const layerObjects = greenButton.getData('layerObjects') as Map<string, Phaser.GameObjects.Image> | undefined;
                layerObjects?.forEach(layer => layer.setTint(0x888888));
                btnTextInfo?.text.setColor('#888888');
            }
        }
    }

    private buyPotion(): void {
        const player = this.gameState.getPlayer();
        if (ProgressionSystem.spendCoins(player, this.POTION_COST)) {
            player.potions = 1;
            this.gameState.save();
            this.scene.restart();
        }
    }

    // ========== CRYSTAL GRID (Template-based Tiered Rows) ==========

    private createCrystalGrid(): void {
        // Get the Black-frmae-Diamonds frame position
        const frameDef = this.sceneBuilder.getElementDef('Black-frmae-Diamonds');
        const frameX = frameDef?.x ?? 215;
        const frameY = frameDef?.y ?? 583;
        const frameScale = frameDef?.scale ?? 0.9;

        // Frame dimensions: 500x320 (original) * 0.9 scale = 450x288
        const frameW = 500 * frameScale;
        const frameH = 320 * frameScale;

        // Crystal holder: 150x150 at 0.5 scale = 75x75 (smaller to fit better)
        const holderScale = 0.5;
        const holderSize = 150 * holderScale; // 75px

        const tiers: CrystalTier[] = ['shard', 'fragment', 'prism'];
        const tierIcons: { [key: string]: number } = { shard: 0, fragment: 2, prism: 4 };

        // Fixed tight vertical spacing: 80px between row centers
        const rowSpacing = 80;
        const startY = frameY - rowSpacing; // Center the 3 rows vertically

        // Fixed tight horizontal spacing: 80px between centers (5px gap between 75px holders)
        const crystalSpacing = 80;
        // Start after tier icon, with padding + 33px right shift
        const xOffset = 33;
        const crystalStartX = frameX - frameW / 2 + 55 + holderSize / 2 + xOffset;

        // Create container for all crystal holders (for masking)
        this.crystalHoldersContainer = this.add.container(0, 0);
        this.crystalHoldersContainer.setDepth(10);

        // Create mask so holders slide "behind" the frame edges
        // Mask area: the visible area inside the frame (with some padding)
        const maskPadding = 10;
        const maskX = frameX - frameW / 2 + 50 + xOffset; // Start after tier icons
        const maskY = frameY - frameH / 2 + maskPadding;
        const maskW = frameW - 90 - xOffset; // Leave room for tier icons, tighter on right
        const maskH = frameH - maskPadding * 2;

        const maskGraphics = this.make.graphics();
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillRect(maskX, maskY, maskW, maskH);
        const mask = maskGraphics.createGeometryMask();
        this.crystalHoldersContainer.setMask(mask);

        this.crystalRows = [];

        tiers.forEach((tier, rowIndex) => {
            const rowY = startY + rowIndex * rowSpacing;

            // Create tier icon - positioned at left edge, larger scale, +15px right shift
            // (NOT added to masked container - icons stay visible)
            const iconX = frameX - frameW / 2 + 20 + xOffset;
            if (this.textures.exists('gemstone-icons')) {
                this.add.sprite(iconX, rowY, 'gemstone-icons', tierIcons[tier])
                    .setScale(0.5)
                    .setDepth(10);
            }

            // Create crystal holders for this row
            const holders: { container: Phaser.GameObjects.Container; crystal: Crystal | null }[] = [];

            for (let col = 0; col < this.CRYSTALS_PER_ROW; col++) {
                const x = crystalStartX + col * crystalSpacing;
                const holder = this.createCrystalHolder(x, rowY, holderScale);
                // Add holder to the masked container
                this.crystalHoldersContainer.add(holder);
                holders.push({ container: holder, crystal: null });
            }

            this.crystalRows.push({ tier, holders });
        });

        this.populateCrystalGrid();
    }

    private createCrystalHolder(x: number, y: number, scale: number): Phaser.GameObjects.Container {
        const builder = new UiElementBuilder(this);
        const templateId = '1770150302226-gb3gzlbpa'; // crystal holder template
        const container = builder.buildFromTemplate(templateId, x, y, [0.5, 0.5]);
        if (!container) {
            console.warn('Failed to create crystal holder from template');
            return this.add.container(x, y); // Fallback empty container
        }
        container.setScale(scale);
        container.setDepth(10);
        container.setData('originalX', x); // Store original position for animations
        return container;
    }

    private populateCrystalGrid(): void {
        const player = this.gameState.getPlayer();
        const crystals = player.crystals?.crystals || [];

        this.crystalRows.forEach(row => {
            // Get crystals of this tier, sorted by value (high to low)
            const tierCrystals = crystals
                .filter(c => c.tier === row.tier)
                .sort((a, b) => b.value - a.value);

            const page = this.crystalPages[row.tier] || 0;
            const startIdx = page * this.CRYSTALS_PER_ROW;
            const visibleCrystals = tierCrystals.slice(startIdx, startIdx + this.CRYSTALS_PER_ROW);

            row.holders.forEach((holder, index) => {
                const crystal = visibleCrystals[index] || null;
                this.updateCrystalHolder(holder.container, crystal);
                holder.crystal = crystal;
            });
        });
    }

    private updateCrystalHolder(container: Phaser.GameObjects.Container, crystal: Crystal | null): void {
        const layerObjects = container.getData('layerObjects') as Map<string, Phaser.GameObjects.Image> | undefined;
        const textObjects = container.getData('textObjects') as Map<string, { text: Phaser.GameObjects.Text }> | undefined;

        // Layer IDs from crystal holder template
        const crystalLayer = layerObjects?.get('1770150364402-twzxmxrgz');
        const valueTextInfo = textObjects?.get('1770150398556-n42xyxo4u');

        // Frame indices for each tier in gemstone-icons spritesheet (non-badge versions)
        const tierFrames: { [key: string]: number } = { shard: 1, fragment: 3, prism: 5 };

        if (crystal) {
            // Show crystal and value
            crystalLayer?.setVisible(true);
            // Offset crystal 6px left, 12px up for better centering in frame
            if (crystalLayer) {
                // Store original position on first call, then always use offset from it
                if (crystalLayer.getData('originalX') === undefined) {
                    crystalLayer.setData('originalX', crystalLayer.x);
                    crystalLayer.setData('originalY', crystalLayer.y);
                }
                crystalLayer.setPosition(
                    (crystalLayer.getData('originalX') as number) - 6,
                    (crystalLayer.getData('originalY') as number) - 12
                );
            }
            valueTextInfo?.text.setText(String(crystal.value));

            // Set the correct sprite frame based on crystal tier
            if (crystalLayer && this.textures.exists('gemstone-icons')) {
                crystalLayer.setTexture('gemstone-icons', tierFrames[crystal.tier] ?? 1);
            }

            // Apply selection tint
            const isSelected = this.selectedCrystal?.id === crystal.id;
            if (isSelected) {
                crystalLayer?.setTint(0x88aaff);
            } else {
                crystalLayer?.clearTint();
            }

            // Make interactive (75x75 at 0.5 scale)
            container.setSize(75, 75);
            container.setInteractive({ useHandCursor: true });
            container.off('pointerdown');
            container.on('pointerdown', () => this.onCrystalClick(crystal));
        } else {
            // Empty slot: show frame, hide crystal and text
            crystalLayer?.setVisible(false);
            valueTextInfo?.text.setText('');
            container.removeInteractive();
        }
    }

    private onCrystalClick(crystal: Crystal): void {
        this.selectedCrystal = (this.selectedCrystal?.id === crystal.id) ? null : crystal;
        this.refreshUI();
    }

    // ========== BINDING AREA ==========

    private createBindingArea(): void {
        // Get frame positions from scene builder
        const metalFrame = this.sceneBuilder.getElementDef('Frame metalic');
        const petFrame = this.sceneBuilder.getElementDef('isolate-2026-01-30T15-27-16');
        const bindButton = this.sceneBuilder.get('Green_button_1');

        const crystalX = metalFrame?.x ?? 468;
        const crystalY = metalFrame?.y ?? 356;
        const petX = petFrame?.x ?? 784;
        const petY = petFrame?.y ?? 357;

        // Create crystal display container
        this.bindingCrystalDisplay = this.add.container(crystalX, crystalY);
        this.bindingCrystalDisplay.setDepth(15);

        // Create pet display container
        this.bindingPetDisplay = this.add.container(petX, petY);
        this.bindingPetDisplay.setDepth(15);

        // Labels
        this.add.text(crystalX, crystalY - 60, 'AMULET', {
            fontSize: '12px',
            color: '#aaaaaa'
        }).setOrigin(0.5).setDepth(15);

        this.add.text(petX, petY - 60, 'TVOR', {
            fontSize: '12px',
            color: '#aaaaaa'
        }).setOrigin(0.5).setDepth(15);

        // Connection arrow
        const arrowX = (crystalX + petX) / 2;
        const arrowY = (crystalY + petY) / 2;
        this.add.text(arrowX, arrowY, '➔', {
            fontSize: '32px',
            color: '#886688'
        }).setOrigin(0.5).setDepth(14);

        // Setup bind button - set text via textObjects
        if (bindButton && bindButton instanceof Phaser.GameObjects.Container) {
            const textObjects = bindButton.getData('textObjects') as Map<string, { text: Phaser.GameObjects.Text }> | undefined;
            const btnTextInfo = textObjects?.get('1768922299962-lij5d6x4j');
            btnTextInfo?.text.setText('OCHOČIT');

            this.updateBindButton();
        }

        this.updateBindingDisplays();
    }

    private updateBindingDisplays(): void {
        // Clear existing displays
        this.bindingCrystalDisplay.removeAll(true);
        this.bindingPetDisplay.removeAll(true);

        // Show selected crystal
        if (this.selectedCrystal) {
            const config = CrystalSystem.getTierConfig(this.selectedCrystal.tier);
            const gemFrames: { [key: string]: number } = { shard: 1, fragment: 3, prism: 5 };

            if (this.textures.exists('gemstone-icons') && gemFrames[this.selectedCrystal.tier] !== undefined) {
                const gem = this.add.sprite(0, -10, 'gemstone-icons', gemFrames[this.selectedCrystal.tier])
                    .setScale(0.4);
                this.bindingCrystalDisplay.add(gem);
            } else {
                const emoji = this.add.text(0, -10, config.emoji, { fontSize: '32px' }).setOrigin(0.5);
                this.bindingCrystalDisplay.add(emoji);
            }

            const value = this.add.text(0, 25, `${this.selectedCrystal.value}`, {
                fontSize: '14px',
                color: config.color,
                fontStyle: 'bold'
            }).setOrigin(0.5);
            this.bindingCrystalDisplay.add(value);
        }

        // Show selected pet
        if (this.selectedPet) {
            if (this.textures.exists(this.selectedPet.spriteKey)) {
                const sprite = this.add.sprite(0, -5, this.selectedPet.spriteKey, 0).setScale(0.5);
                this.bindingPetDisplay.add(sprite);
            }

            const name = this.add.text(0, 35, this.selectedPet.name, {
                fontSize: '10px',
                color: '#ffffff'
            }).setOrigin(0.5);
            this.bindingPetDisplay.add(name);
        }
    }

    private updateBindButton(): void {
        const bindButton = this.sceneBuilder.get('Green_button_1') as Phaser.GameObjects.Container | undefined;
        if (!bindButton) return;

        const hasSelection = this.selectedPet && this.selectedCrystal;
        const canBind = this.canPerformBinding();
        const player = this.gameState.getPlayer();

        // Hide button until both pet and crystal are selected
        bindButton.setVisible(!!hasSelection);

        // Clean up cost display and warning
        if (this.bindCostDisplay) {
            this.bindCostDisplay.destroy();
            this.bindCostDisplay = null;
        }
        if (this.bindWarningText) {
            this.bindWarningText.destroy();
            this.bindWarningText = null;
        }

        if (!hasSelection) {
            bindButton.disableInteractive();
            return;
        }

        const layerObjects = bindButton.getData('layerObjects') as Map<string, Phaser.GameObjects.Image> | undefined;
        const textObjects = bindButton.getData('textObjects') as Map<string, { text: Phaser.GameObjects.Text }> | undefined;
        const btnTextInfo = textObjects?.get('1768922299962-lij5d6x4j');

        // Clear ALL existing click handlers on container and its interactive layers
        bindButton.off('pointerdown');
        layerObjects?.forEach(layer => layer.off('pointerdown'));

        // Show cost display below button (mana icons + coin cost)
        const btnX = (bindButton as any).x ?? 630;
        const btnY = (bindButton as any).y ?? 497;
        this.createBindCostDisplay(btnX, btnY + 35, player);

        if (canBind) {
            layerObjects?.forEach(layer => layer.clearTint());
            btnTextInfo?.text.setColor('#f7f9dc');
            // Use sceneBuilder.bindClick for proper click handling on UiElementBuilder containers
            this.sceneBuilder.bindClick('Green_button_1', () => {
                this.performBinding();
            });
        } else {
            // Show greyed out if selection doesn't match
            layerObjects?.forEach(layer => layer.setTint(0x666666));
            btnTextInfo?.text.setColor('#888888');

            // Show specific warning for insufficient resources
            const hasMana = ManaSystem.canAfford(player, this.MANA_COST);
            const hasCoins = ProgressionSystem.getTotalCoinValue(player.coins) >= this.COIN_COST;
            const crystalMatches = this.selectedCrystal!.tier === this.selectedPet!.requiredAmulet.tier &&
                                   this.selectedCrystal!.value === this.selectedPet!.requiredAmulet.value;

            if (crystalMatches && !hasMana) {
                this.showBindWarning('Nedostatek many!', btnX, btnY + 60);
            } else if (crystalMatches && !hasCoins) {
                this.showBindWarning('Nedostatek mincí!', btnX, btnY + 60);
            }
        }
    }

    /**
     * Show mana and coin cost below the bind button
     */
    private createBindCostDisplay(x: number, y: number, player: PlayerState): void {
        this.bindCostDisplay = this.add.container(x, y).setDepth(20);

        const hasMana = ManaSystem.canAfford(player, this.MANA_COST);
        const hasCoins = ProgressionSystem.getTotalCoinValue(player.coins) >= this.COIN_COST;

        // Mana cost: larger icons, closer together, shifted left
        const manaSpacing = 16;
        for (let i = 0; i < this.MANA_COST; i++) {
            if (this.textures.exists('mana-icon')) {
                const icon = this.add.image(-35 + i * manaSpacing, 0, 'mana-icon').setScale(0.3);
                if (!hasMana) icon.setTint(0xff4444);
                this.bindCostDisplay.add(icon);
            }
        }

        // Coin cost: half-size gold coins, shifted right
        const coinSpacing = 14;
        const coinStartX = 15;
        for (let i = 0; i < this.COIN_COST; i++) {
            if (this.textures.exists('shop-coins-sheet')) {
                const coin = this.add.image(coinStartX + i * coinSpacing, 0, 'shop-coins-sheet', 6).setScale(0.2);
                if (!hasCoins) coin.setTint(0xff4444);
                this.bindCostDisplay.add(coin);
            }
        }
    }

    /**
     * Show a warning message below the bind button that pulses red
     */
    private showBindWarning(message: string, x: number, y: number): void {
        this.bindWarningText = this.add.text(x, y, message, {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#ff4444',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(20);

        // Pulsing animation
        this.tweens.add({
            targets: this.bindWarningText,
            alpha: 0.4,
            duration: 600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    private canPerformBinding(): boolean {
        if (!this.selectedPet || !this.selectedCrystal) {
            return false;
        }

        const player = this.gameState.getPlayer();

        // Check crystal matches requirement
        const crystalMatches = this.selectedCrystal.tier === this.selectedPet.requiredAmulet.tier &&
                               this.selectedCrystal.value === this.selectedPet.requiredAmulet.value;

        // Check mana cost
        const hasMana = ManaSystem.canAfford(player, this.MANA_COST);

        // Check coin cost
        const hasCoins = ProgressionSystem.getTotalCoinValue(player.coins) >= this.COIN_COST;

        console.log('[PythiaWorkshop] canPerformBinding:', {
            pet: this.selectedPet.id,
            crystalTier: this.selectedCrystal.tier,
            crystalValue: this.selectedCrystal.value,
            requiredTier: this.selectedPet.requiredAmulet.tier,
            requiredValue: this.selectedPet.requiredAmulet.value,
            crystalMatches,
            mana: ManaSystem.getMana(player),
            manaCost: this.MANA_COST,
            hasMana,
            coins: ProgressionSystem.getTotalCoinValue(player.coins),
            coinCost: this.COIN_COST,
            hasCoins
        });

        if (!crystalMatches) return false;
        if (!hasMana) return false;
        if (!hasCoins) return false;

        // Check special crystal requirement (for compound cost pets)
        if (this.selectedPet.requiredSpecialCrystal) {
            const hasSpecial = player.crystals?.crystals.some(
                c => c.tier === this.selectedPet!.requiredSpecialCrystal
            ) ?? false;
            if (!hasSpecial) return false;
        }

        return true;
    }

    private performBinding(): void {
        if (!this.canPerformBinding()) {
            return;
        }

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

        // Deduct mana and coins
        ManaSystem.spend(player, this.MANA_COST);
        ProgressionSystem.spendCoins(player, this.COIN_COST);

        // Add pet to owned
        player.ownedPets.push(this.selectedPet!.id);

        // Set as active if first pet
        if (!player.activePet) {
            player.activePet = this.selectedPet!.id;
        }

        this.gameState.save();

        // Binding animation - white flash
        const flash = this.add.rectangle(640, 360, 1280, 720, 0xffffff, 0).setDepth(200);
        this.tweens.add({
            targets: flash,
            alpha: { from: 0, to: 0.6 },
            duration: 200,
            yoyo: true,
            onComplete: () => this.scene.restart()
        });
    }

    // ========== PET LIST (Template-based Rows) ==========

    private createPetList(): void {
        // Get the Black-frmae-pets frame position
        const frameDef = this.sceneBuilder.getElementDef('Black-frmae-pets');
        const frameX = frameDef?.x ?? 1184;
        const frameY = frameDef?.y ?? 369;

        // Frame dimensions: 200w x 700h (no scale applied in JSON)
        const frameW = 200;
        const frameH = 700;
        const rowScale = 0.9;

        // Fixed row spacing (135px instead of 140px to fit inside frame)
        const rowSpacing = 135;
        const totalHeight = rowSpacing * (this.PETS_VISIBLE - 1);
        const startY = frameY - totalHeight / 2;

        // Create container for all pet rows (for masking)
        this.petRowsContainer = this.add.container(0, 0);
        this.petRowsContainer.setDepth(10);

        // Create mask so pets slide "behind" the frame edges
        const maskPadding = 15;
        const maskX = frameX - frameW / 2 + maskPadding;
        const maskY = frameY - frameH / 2 + maskPadding + 10; // Extra padding at top
        const maskW = frameW - maskPadding * 2;
        const maskH = frameH - maskPadding * 2 - 20; // Tighter at top and bottom

        const maskGraphics = this.make.graphics();
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillRect(maskX, maskY, maskW, maskH);
        this.petRowsContainer.setMask(maskGraphics.createGeometryMask());

        this.petRows = [];

        for (let i = 0; i < this.PETS_VISIBLE; i++) {
            const y = startY + i * rowSpacing;
            const row = this.createPetRow(frameX, y, rowScale);
            row.setData('originalY', y); // Store original Y for animations
            this.petRowsContainer.add(row);
            this.petRows.push({ container: row, pet: null });
        }

        this.populatePetRows();
    }

    private createPetRow(x: number, y: number, scale: number): Phaser.GameObjects.Container {
        const builder = new UiElementBuilder(this);
        const templateId = '1770150997108-w1zomvgfx'; // pet frame template
        const container = builder.buildFromTemplate(templateId, x, y, [0.5, 0.5]);
        if (!container) {
            console.warn('Failed to create pet row from template');
            return this.add.container(x, y); // Fallback empty container
        }
        container.setScale(scale);
        container.setDepth(10);
        return container;
    }

    private getSortedUnlockedPets(pets: PetDefinition[], player: PlayerState): PetDefinition[] {
        // Filter to only unlocked pets
        const unlockedPets = pets.filter(pet => this.isPetUnlocked(pet, player));

        // Sort: owned first (with active first), then unowned by power
        return unlockedPets.sort((a, b) => {
            const aOwned = player.ownedPets.includes(a.id);
            const bOwned = player.ownedPets.includes(b.id);

            if (aOwned && !bOwned) return -1;
            if (!aOwned && bOwned) return 1;

            if (aOwned && bOwned) {
                // Active pet first
                if (player.activePet === a.id) return -1;
                if (player.activePet === b.id) return 1;
            }

            // Sort by power (damageMultiplier)
            return (b.damageMultiplier ?? 1) - (a.damageMultiplier ?? 1);
        });
    }

    private populatePetRows(): void {
        const player = this.gameState.getPlayer();
        const pets = this.cache.json.get('pets') as PetDefinition[];
        const sortedPets = this.getSortedUnlockedPets(pets, player);
        const visiblePets = sortedPets.slice(
            this.petScrollOffset,
            this.petScrollOffset + this.PETS_VISIBLE
        );

        this.petRows.forEach((row, index) => {
            const pet = visiblePets[index] || null;
            this.updatePetRow(row.container, pet, player);
            row.pet = pet;
        });
    }

    private updatePetRow(
        container: Phaser.GameObjects.Container,
        pet: PetDefinition | null,
        player: PlayerState
    ): void {
        const layerObjects = container.getData('layerObjects') as Map<string, Phaser.GameObjects.Image> | undefined;
        const textObjects = container.getData('textObjects') as Map<string, { text: Phaser.GameObjects.Text }> | undefined;

        // Layer IDs from pet frame template
        const frameLayer = layerObjects?.get('1770151033023-xboq2pdxn');
        const petLayer = layerObjects?.get('1770151076016-hztvhaeco');
        const crystalLayer = layerObjects?.get('1770151141818-f4pyywxep');
        const costTextInfo = textObjects?.get('1770151186640-wyn6y9e63');
        const attackTextInfo = textObjects?.get('1770151305912-jgyluh2pg');

        // Hide template images, we'll add real sprites
        petLayer?.setVisible(false);
        crystalLayer?.setVisible(false);

        // Remove old sprites if they exist
        const oldSprite = container.getData('petSprite') as Phaser.GameObjects.Sprite;
        oldSprite?.destroy();
        container.setData('petSprite', null);

        const oldCrystal = container.getData('crystalSprite') as Phaser.GameObjects.Sprite;
        oldCrystal?.destroy();
        container.setData('crystalSprite', null);

        const oldSpecialCrystal = container.getData('specialCrystalSprite') as Phaser.GameObjects.Sprite;
        oldSpecialCrystal?.destroy();
        container.setData('specialCrystalSprite', null);

        if (pet) {
            const isOwned = player.ownedPets.includes(pet.id);
            const isActive = player.activePet === pet.id;
            const isSelected = this.selectedPet?.id === pet.id;

            // Add pet sprite centered in the circle frame
            // Template 180x150, origin [0.5, 0.5] → local (0,0) at (90, 75)
            // Pet layer bounds: x:-9, y:2, w:130, h:130 → center at (56, 67) in template coords
            // Local position: (56-90, 67-75) = (-34, -8)
            if (this.textures.exists(pet.spriteKey)) {
                const sprite = this.add.sprite(-34, -8, pet.spriteKey, 0);
                sprite.setScale(0.5);
                container.add(sprite);
                container.setData('petSprite', sprite);
            }

            // Always show attack multiplier
            attackTextInfo?.text.setText(`${pet.damageMultiplier ?? 1}x`);

            // Update cost display based on owned status
            if (!isOwned) {
                // Add crystal sprite from gemstone-icons (shard:1, fragment:3, prism:5)
                const gemFrames: { [key: string]: number } = { shard: 1, fragment: 3, prism: 5 };
                const tier = pet.requiredAmulet.tier;
                const frame = gemFrames[tier] ?? 1;
                if (this.textures.exists('gemstone-icons')) {
                    // Crystal layer bounds in template: x:98, y:-11, w:100, h:100
                    // Template 180x150, origin [0.5,0.5] → local (0,0) at (90,75)
                    // Crystal center: (98+50, -11+50) = (148, 39) → local: (148-90, 39-75) = (58, -36)
                    // Additional offset: -1px left, -7px up to compensate for spritesheet centering (smaller at this scale)
                    const crystalSprite = this.add.sprite(57, -43, 'gemstone-icons', frame);
                    crystalSprite.setScale(0.5);
                    container.add(crystalSprite);
                    container.setData('crystalSprite', crystalSprite);
                }

                // Show special crystal requirement if needed (positioned between attack and main crystal)
                if (pet.requiredSpecialCrystal) {
                    // Use the emoji from CrystalSystem for consistency across the game
                    const specialConfig = CrystalSystem.getTierConfig(pet.requiredSpecialCrystal as CrystalTier);
                    const specialCrystalText = this.add.text(57, 15, specialConfig.emoji, {
                        fontSize: '20px'
                    }).setOrigin(0.5);
                    container.add(specialCrystalText);
                    container.setData('specialCrystalSprite', specialCrystalText);
                }

                costTextInfo?.text.setText(String(pet.requiredAmulet.value));
                // Reset font size for cost value
                if (costTextInfo) {
                    costTextInfo.text.setFontSize(22);
                    costTextInfo.text.setColor('#e6e944');
                    // Bring text to front so it's not covered by crystal sprite
                    container.bringToTop(costTextInfo.text);
                }
            } else {
                // Show ✓/★ in the crystal position (upper right)
                costTextInfo?.text.setText(isActive ? '★' : '✓');
                if (costTextInfo) {
                    costTextInfo.text.setColor(isActive ? '#44ff44' : '#aaffaa');
                    costTextInfo.text.setFontSize(28);
                }
            }

            // Apply selection tint to frame
            if (isSelected) {
                frameLayer?.setTint(0x88aaff);
            } else if (isActive) {
                frameLayer?.setTint(0x66ff66);
            } else if (isOwned) {
                frameLayer?.setTint(0xaaffaa);
            } else {
                frameLayer?.clearTint();
            }

            // Make interactive
            container.setSize(180, 150);
            container.setInteractive({ useHandCursor: true });
            container.off('pointerdown');
            container.on('pointerdown', () => this.onPetClick(pet));
        } else {
            // Empty row - hide everything
            crystalLayer?.setVisible(false);
            costTextInfo?.text.setText('');
            attackTextInfo?.text.setText('');
            frameLayer?.clearTint();
            container.removeInteractive();
        }
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

    // ========== ARROW VISIBILITY & NAVIGATION ==========

    private setupArrowVisibility(): void {
        // Crystal arrows - bind handlers (scroll all tiers together)
        this.sceneBuilder.bindClick('NewArrow_1', () => {
            let anyChanged = false;
            for (const tier of ['shard', 'fragment', 'prism'] as CrystalTier[]) {
                if (this.crystalPages[tier] > 0) {
                    this.crystalPages[tier]--;
                    anyChanged = true;
                }
            }
            if (anyChanged) {
                this.animateCrystalPageChange('right'); // Content slides right (going to previous page)
                this.updateArrowVisibility();
            }
        });

        this.sceneBuilder.bindClick('NewArrow', () => {
            const player = this.gameState.getPlayer();
            const crystals = player.crystals?.crystals || [];
            let anyChanged = false;

            for (const tier of ['shard', 'fragment', 'prism'] as CrystalTier[]) {
                const tierCrystals = crystals.filter(c => c.tier === tier);
                const maxPage = Math.max(0, Math.ceil(tierCrystals.length / this.CRYSTALS_PER_ROW) - 1);
                if (this.crystalPages[tier] < maxPage) {
                    this.crystalPages[tier]++;
                    anyChanged = true;
                }
            }
            if (anyChanged) {
                this.animateCrystalPageChange('left'); // Content slides left (going to next page)
                this.updateArrowVisibility();
            }
        });

        // Pet arrows - bind handlers
        this.sceneBuilder.bindClick('NewArrow_2', () => {
            if (this.petScrollOffset > 0) {
                this.petScrollOffset--;
                this.animatePetPageChange('down'); // Content slides down (going to previous)
                this.updateArrowVisibility();
            }
        });

        this.sceneBuilder.bindClick('NewArrow_3', () => {
            const totalPets = this.getTotalUnlockedPets();
            if (this.petScrollOffset + this.PETS_VISIBLE < totalPets) {
                this.petScrollOffset++;
                this.animatePetPageChange('up'); // Content slides up (going to next)
                this.updateArrowVisibility();
            }
        });

        this.updateArrowVisibility();
    }

    private updateArrowVisibility(): void {
        const player = this.gameState.getPlayer();
        const crystals = player.crystals?.crystals || [];
        const totalPets = this.getTotalUnlockedPets();

        // Crystal arrows: show if ANY tier needs pagination
        let crystalNeedsPrevPage = false;
        let crystalNeedsNextPage = false;

        for (const tier of ['shard', 'fragment', 'prism'] as CrystalTier[]) {
            const tierCrystals = crystals.filter(c => c.tier === tier);
            const maxPage = Math.max(0, Math.ceil(tierCrystals.length / this.CRYSTALS_PER_ROW) - 1);

            if (this.crystalPages[tier] > 0) crystalNeedsPrevPage = true;
            if (this.crystalPages[tier] < maxPage) crystalNeedsNextPage = true;
        }

        const crystalUp = this.sceneBuilder.get('NewArrow_1') as Phaser.GameObjects.Container | undefined;
        const crystalDown = this.sceneBuilder.get('NewArrow') as Phaser.GameObjects.Container | undefined;
        crystalUp?.setVisible(crystalNeedsPrevPage);
        crystalDown?.setVisible(crystalNeedsNextPage);

        // Pet arrows
        const petUp = this.sceneBuilder.get('NewArrow_2') as Phaser.GameObjects.Container | undefined;
        const petDown = this.sceneBuilder.get('NewArrow_3') as Phaser.GameObjects.Container | undefined;
        petUp?.setVisible(this.petScrollOffset > 0);
        petDown?.setVisible(this.petScrollOffset + this.PETS_VISIBLE < totalPets);
    }

    private getTotalUnlockedPets(): number {
        const player = this.gameState.getPlayer();
        const pets = this.cache.json.get('pets') as PetDefinition[];
        return pets.filter(pet => this.isPetUnlocked(pet, player)).length;
    }

    // ========== CRYSTAL PAGE ANIMATION ==========

    private animateCrystalPageChange(direction: 'left' | 'right'): void {
        const slideDistance = 80;
        const duration = 250;

        // Get all crystal holder containers
        const allHolders = this.crystalRows.flatMap(row => row.holders.map(h => h.container));

        // Slide out current content
        allHolders.forEach(holder => {
            const targetX = direction === 'left' ? holder.x - slideDistance : holder.x + slideDistance;
            this.tweens.add({
                targets: holder,
                x: targetX,
                alpha: 0,
                duration: duration,
                ease: 'Power2'
            });
        });

        // After slide-out, update data and slide in from opposite side (continuous scroll effect)
        this.time.delayedCall(duration, () => {
            this.populateCrystalGrid();

            // Position holders on opposite side and slide in the SAME direction as exit
            // This creates a continuous scroll effect (like items on a conveyor belt)
            // When old exits LEFT, new enters from RIGHT and also moves LEFT
            allHolders.forEach((holder, i) => {
                // Kill any running tween on this holder first
                this.tweens.killTweensOf(holder);

                const originalX = holder.getData('originalX') as number;
                // New content starts on opposite side and moves same direction as old
                // direction='left' means old went LEFT, so new starts RIGHT (+ slideDistance)
                const startX = direction === 'left' ? originalX + slideDistance : originalX - slideDistance;
                holder.x = startX;
                holder.alpha = 0;

                this.tweens.add({
                    targets: holder,
                    x: originalX,
                    alpha: 1,
                    duration: duration,
                    ease: 'Power2'
                });
            });
        });
    }

    // ========== PET PAGE ANIMATION ==========

    private animatePetPageChange(direction: 'up' | 'down'): void {
        const slideDistance = 100;
        const duration = 250;

        // Get all pet row containers
        const allRows = this.petRows.map(r => r.container);

        // Slide out current content
        allRows.forEach(row => {
            // direction='up' means content moves UP (scrolling down to see more)
            const targetY = direction === 'up' ? row.y - slideDistance : row.y + slideDistance;
            this.tweens.add({
                targets: row,
                y: targetY,
                alpha: 0,
                duration: duration,
                ease: 'Power2'
            });
        });

        // After slide-out, update data and slide in from opposite side
        this.time.delayedCall(duration, () => {
            this.populatePetRows();

            allRows.forEach(row => {
                // Kill any running tween on this row first
                this.tweens.killTweensOf(row);

                const originalY = row.getData('originalY') as number;
                // New content starts on opposite side and moves same direction as old
                // direction='up' means old went UP, so new starts DOWN (+ slideDistance)
                const startY = direction === 'up' ? originalY + slideDistance : originalY - slideDistance;
                row.y = startY;
                row.alpha = 0;

                this.tweens.add({
                    targets: row,
                    y: originalY,
                    alpha: 1,
                    duration: duration,
                    ease: 'Power2'
                });
            });
        });
    }

    // ========== UI REFRESH ==========

    private refreshUI(): void {
        this.populateCrystalGrid();
        this.populatePetRows();
        this.updateBindingDisplays();
        this.updateArrowVisibility();
        this.updateBindButton();
    }
}
