import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { CrystalSystem } from '../systems/CrystalSystem';
import { ManaSystem } from '../systems/ManaSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { SceneBuilder } from '../systems/SceneBuilder';
import { UiElementBuilder } from '../systems/UiElementBuilder';
import { Crystal } from '../types';

/**
 * CrystalForgeScene - Player can merge or split crystals using math problems
 *
 * Basic Operations (available from start):
 * - Merge Shards: 💎 + 💎 → 💎 (a + b = ?)
 * - Split Shard: 💎 → 💎 + 💎 (a - b = ?)
 *
 * Advanced Operations (unlock after Boss I):
 * - Create Fragment: 💎 + 💎 + 💎 → 💠 (a + b + c = ?)
 * - Split Fragment: 💠 → 💎 + 💎 + 💎 (divide into 3)
 *
 * Flow:
 * 1. Select operation on right panel
 * 2. Click slot to make it active, then click crystal to fill it
 * 3. Click operation button to show equation
 * 4. Answer correctly = success animation
 * 5. Answer wrong = smoke + mana loss
 */

type ForgeOperation = 'merge' | 'split' | 'createFragment' | 'splitFragment' | 'refine' | 'createPrism';

export class CrystalForgeScene extends Phaser.Scene {
    private gameState = GameStateManager.getInstance();
    private sceneBuilder!: SceneBuilder;

    // Forge state
    private selectedCrystals: (Crystal | null)[] = [null, null, null]; // Three slots (3rd for createFragment)
    private activeSlot: 0 | 1 | 2 = 0; // Which slot is currently active for filling
    private currentOperation: ForgeOperation = 'merge'; // Pre-selected
    private splitValue: number = 0; // For split shard
    private splitValue2: number = 0; // For split fragment (second split value)
    private equationVisible: boolean = false; // Whether equation/answers are shown
    private fragmentOperationsUnlocked: boolean = false; // Boss I defeated?
    private refineUnlocked: boolean = false; // Boss II defeated?
    private prismOperationsUnlocked: boolean = false; // Boss III defeated?

    // UI elements
    private inventoryContainer!: Phaser.GameObjects.Container;
    private forgeContainer!: Phaser.GameObjects.Container;
    private slot1Display!: Phaser.GameObjects.Container;
    private slot2Display!: Phaser.GameObjects.Container;
    private slot3Display!: Phaser.GameObjects.Container; // 3rd slot for createFragment
    private slotDisplays: Phaser.GameObjects.Container[] = []; // Reference array for slot displays
    private slotPositions: { x: number; y: number }[] = []; // Positions from SceneBuilder
    private slotCircles: Phaser.GameObjects.Image[] = []; // Controllable circle sprites for state swapping
    private pedestalPosition: { x: number; y: number } = { x: 435, y: 529 }; // Position from SceneBuilder
    private equationText!: Phaser.GameObjects.Text;
    private answerButtons: Phaser.GameObjects.Container[] = [];
    private answerFrame: Phaser.GameObjects.Image | null = null;
    private manaText!: Phaser.GameObjects.Text;
    private messageText!: Phaser.GameObjects.Text;
    private splitSlider!: Phaser.GameObjects.Container;
    private splitValueText!: Phaser.GameObjects.Text;
    private splitFragmentSlider!: Phaser.GameObjects.Container; // For split fragment (2 values)
    private splitFragmentValue1Text!: Phaser.GameObjects.Text;
    private splitFragmentValue2Text!: Phaser.GameObjects.Text;
    private operationButton!: Phaser.GameObjects.Container;
    private operationButtonText!: Phaser.GameObjects.Text;
    private manaIcons: Phaser.GameObjects.Image[] = [];  // 1-3 icons based on cost

    // Crystal holders using templates (replaces programmatic slots)
    private crystalHolders: { container: Phaser.GameObjects.Container; crystal: Crystal | null }[] = [];

    // Pagination state for inventory
    private crystalPage: number = 0;

    // Layout constants for inventory grid
    private readonly COLS = 4;
    private readonly ROWS = 5;
    private readonly CRYSTALS_PER_PAGE = 20;  // 4x5 grid

    constructor() {
        super({ key: 'CrystalForgeScene' });
    }

    create(): void {
        // Check if advanced operations are unlocked (Boss I, II, III defeated)
        const player = this.gameState.getPlayer();
        this.fragmentOperationsUnlocked = CrystalSystem.hasFragmentOperationsUnlocked(player);
        this.refineUnlocked = CrystalSystem.hasRefineUnlocked(player);
        this.prismOperationsUnlocked = CrystalSystem.hasPrismOperationsUnlocked(player);

        // Reset state
        this.selectedCrystals = [null, null, null];
        this.activeSlot = 0;
        this.currentOperation = 'merge'; // Pre-selected
        this.splitValue = 0;
        this.splitValue2 = 0;
        this.equationVisible = false;

        // CRITICAL: Clear arrays that accumulate on scene re-entry
        this.answerButtons = [];
        this.answerFrame = null;
        this.operationPanelButtons.clear();
        this.crystalHolders = [];
        this.manaIcons = [];
        this.crystalPage = 0;
        this.slotPositions = [];
        this.slotCircles = [];
        this.slotDisplays = [];

        // Build scene from scenes.json (background, title, etc.)
        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.buildScene('CrystalForgeScene');

        // Set title text in the "Load game" UI element
        this.setupTitle();

        // Mana display (positioned via "money mana" element from scenes.json)
        this.createManaDisplay();

        // Inventory grid (left side)
        this.createInventoryGrid();

        // Forge area (center) - slots and equation
        this.createForgeArea();

        // Operation panel (right side) - Spojit/Rozdělit buttons
        this.createOperationPanel();

        // Back button
        this.createBackButton();

        // Message text (for feedback) - will be used for center animations
        this.messageText = this.add.text(640, 360, '', {
            fontSize: '48px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5).setAlpha(0).setDepth(100);
    }

    private setupTitle(): void {
        // Get the "Load game" UI element used for the title
        const titleElement = this.sceneBuilder.get<Phaser.GameObjects.Container>('Load game');
        if (titleElement) {
            const textObjects = titleElement.getData('textObjects') as Map<string, { text: Phaser.GameObjects.Text; parentLayerId: string | null }> | undefined;
            if (textObjects) {
                // Text 1 has ID "1768907891761-to6gkpn5a"
                const titleTextEntry = textObjects.get('1768907891761-to6gkpn5a');
                if (titleTextEntry) {
                    titleTextEntry.text.setText('KRYSTALOVÁ KOVÁRNA');
                }
            }
        }
    }

    private createManaDisplay(): void {
        const player = this.gameState.getPlayer();
        const manaCount = ManaSystem.getMana(player);
        const coinsCount = ProgressionSystem.getTotalCoinValue(player.coins);

        // Get the "money mana" UI element and find text areas within it
        const manaElement = this.sceneBuilder.get<Phaser.GameObjects.Container>('money mana');
        if (manaElement) {
            // Get the textObjects map stored on the container by UiElementBuilder
            const textObjects = manaElement.getData('textObjects') as Map<string, { text: Phaser.GameObjects.Text; parentLayerId: string | null }> | undefined;
            if (textObjects) {
                // Text 1 (mana) has ID "1770241846853-jfbnou0oe"
                const manaTextEntry = textObjects.get('1770241846853-jfbnou0oe');
                if (manaTextEntry) {
                    this.manaText = manaTextEntry.text;
                    this.manaText.setText(`${manaCount}`);
                }

                // Text 2 (coins) has ID "1770241864666-yyygo6t26"
                const coinsTextEntry = textObjects.get('1770241864666-yyygo6t26');
                if (coinsTextEntry) {
                    coinsTextEntry.text.setText(`${coinsCount}`);
                }

                if (manaTextEntry) return; // Success
            }
        }

        // Fallback: create programmatic text if element not found
        console.warn('[CrystalForge] Could not find mana text in UI element, using fallback');
        this.manaText = this.add.text(143, 66, `${manaCount}`, {
            fontSize: '20px',
            fontFamily: 'Arial',
            color: '#80cbf9'
        }).setOrigin(0.5);
    }

    private updateManaDisplay(): void {
        const player = this.gameState.getPlayer();
        const manaCount = ManaSystem.getMana(player);
        this.manaText.setText(`${manaCount}`);
    }

    /**
     * Updates the mana icon display on the operation button.
     * Shows 1, 2, or 3 icons based on the operation cost.
     */
    private updateManaIconsDisplay(cost: number): void {
        // Show icons based on cost (1, 2, or 3)
        this.manaIcons.forEach((icon, index) => {
            icon.setVisible(index < cost);
        });
    }

    private createInventoryGrid(): void {
        // Get inventory frame position from SceneBuilder ("CrystalFrame" element)
        const crystalFrame = this.sceneBuilder.get<Phaser.GameObjects.Container>('CrystalFrame');
        const frameX = crystalFrame?.x ?? 1056;
        const frameY = crystalFrame?.y ?? 413;
        const frameDepth = crystalFrame?.depth ?? 10;

        // Container for inventory crystals (positioned relative to the CrystalFrame)
        this.inventoryContainer = this.add.container(frameX, frameY);
        this.inventoryContainer.setDepth(frameDepth + 1);

        // Create mask so crystals slide "behind" the frame edges during pagination
        // Frame is roughly 340w x 480h based on visible area
        const maskW = 320;
        const maskH = 420;
        const maskGraphics = this.make.graphics();
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillRect(frameX - maskW / 2, frameY - maskH / 2, maskW, maskH);
        this.inventoryContainer.setMask(maskGraphics.createGeometryMask());

        // Crystal slots
        this.renderInventoryCrystals();

        // Setup arrow navigation
        this.setupInventoryArrows();
    }

    private renderInventoryCrystals(): void {
        const player = this.gameState.getPlayer();
        const crystals = player.crystals?.crystals || [];

        // Grid layout - 4 columns × 5 rows = 20 slots per page
        // Crystal holder: 150x150 at 0.5 scale = 75x75px
        // Using 79px spacing gives 4px gap between holders
        const holderScale = 0.5;
        const slotSize = 79;  // 75px holder + 4px gap
        const startX = -118;  // Adjusted for grid width (4 cols × 79px = 316px)
        const startY = -160;  // Moved 40px up from -120

        // Clear and recreate holders
        this.crystalHolders.forEach(h => h.container.destroy());
        this.crystalHolders = [];

        // Calculate which crystals to show based on current page
        const startIdx = this.crystalPage * this.CRYSTALS_PER_PAGE;
        const visibleCrystals = crystals.slice(startIdx, startIdx + this.CRYSTALS_PER_PAGE);

        // Loop over all 20 slots in the grid
        for (let i = 0; i < this.CRYSTALS_PER_PAGE; i++) {
            const col = i % this.COLS;
            const row = Math.floor(i / this.COLS);
            const x = startX + col * slotSize;
            const y = startY + row * slotSize;

            const crystal = visibleCrystals[i] || null;  // null for empty slots

            const holder = this.createCrystalHolder(x, y, holderScale);
            holder.setData('originalX', x);  // Store for animation
            this.inventoryContainer.add(holder);
            this.updateCrystalHolder(holder, crystal);
            this.crystalHolders.push({ container: holder, crystal });
        }
    }

    /**
     * Creates a crystal holder from the UI template.
     * The template contains a decorative frame with a crystal layer and value text.
     */
    private createCrystalHolder(x: number, y: number, scale: number): Phaser.GameObjects.Container {
        const builder = new UiElementBuilder(this);
        const templateId = '1770150302226-gb3gzlbpa'; // crystal holder template
        const container = builder.buildFromTemplate(templateId, x, y, [0.5, 0.5]);
        if (!container) {
            console.warn('[CrystalForge] Failed to create crystal holder from template');
            return this.add.container(x, y);
        }
        container.setScale(scale);
        container.setDepth(15);
        return container;
    }

    /**
     * Updates a crystal holder's visual state based on the crystal and current operation.
     * Handles: sprite texture, value text, selection tints, usability dimming, and interactivity.
     * When crystal is null, shows an empty holder frame.
     */
    private updateCrystalHolder(container: Phaser.GameObjects.Container, crystal: Crystal | null): void {
        const layerObjects = container.getData('layerObjects') as Map<string, Phaser.GameObjects.Image> | undefined;
        const textObjects = container.getData('textObjects') as Map<string, { text: Phaser.GameObjects.Text }> | undefined;

        // Layer IDs from crystal holder template (same as PythiaWorkshopScene)
        const crystalLayer = layerObjects?.get('1770150364402-twzxmxrgz');
        const valueTextInfo = textObjects?.get('1770150398556-n42xyxo4u');

        // Handle empty slots (null crystal)
        if (!crystal) {
            crystalLayer?.setVisible(false);
            valueTextInfo?.text.setText('');
            container.removeInteractive();
            return;
        }

        // Frame indices for gemstone-icons: shard=1, fragment=3, prism=5
        const tierFrames: { [key: string]: number } = { shard: 1, fragment: 3, prism: 5 };

        // Set texture and value
        if (crystalLayer && this.textures.exists('gemstone-icons')) {
            crystalLayer.setTexture('gemstone-icons', tierFrames[crystal.tier] ?? 1);
            crystalLayer.setVisible(true);
            // Offset crystal for better centering in frame (matching PythiaWorkshopScene)
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

        // Check selection state
        const isInSlot0 = this.selectedCrystals[0]?.id === crystal.id;
        const isInSlot1 = this.selectedCrystals[1]?.id === crystal.id;
        const isInSlot2 = this.selectedCrystals[2]?.id === crystal.id;

        // Check usability for current operation
        const isUsable = this.isCrystalUsableForOperation(crystal);

        // Apply tints based on state
        if (crystalLayer) {
            if (isInSlot0) {
                crystalLayer.setTint(0x88ffff); // Cyan for slot 1
                crystalLayer.setAlpha(1);
            } else if (isInSlot1) {
                crystalLayer.setTint(0xffaa44); // Orange for slot 2
                crystalLayer.setAlpha(1);
            } else if (isInSlot2) {
                crystalLayer.setTint(0x44ff44); // Green for slot 3
                crystalLayer.setAlpha(1);
            } else if (!isUsable) {
                crystalLayer.setTint(0x666666); // Grey for unusable
                crystalLayer.setAlpha(0.5);
            } else if (crystal.locked) {
                crystalLayer.setTint(0x666666); // Grey for locked
                crystalLayer.setAlpha(0.6);
            } else {
                crystalLayer.clearTint();
                crystalLayer.setAlpha(1);
            }
        }

        // Dim value text for unusable crystals
        if (valueTextInfo?.text) {
            if (!isUsable && !crystal.locked && !(isInSlot0 || isInSlot1 || isInSlot2)) {
                valueTextInfo.text.setAlpha(0.5);
            } else {
                valueTextInfo.text.setAlpha(1);
            }
        }

        // Interactivity - only for usable, unlocked crystals when equation not visible
        container.removeInteractive();
        if (!crystal.locked && !this.equationVisible && isUsable) {
            container.setSize(75, 75);
            container.setInteractive({ useHandCursor: true });
            container.off('pointerdown');
            container.on('pointerdown', () => this.selectCrystal(crystal));
        }
    }

    /**
     * Determines if a crystal can be used for the current forge operation.
     * Different operations require specific crystal tiers and sometimes minimum values.
     */
    private isCrystalUsableForOperation(crystal: Crystal): boolean {
        const isShard = crystal.tier === 'shard';
        const isFragment = crystal.tier === 'fragment';
        const isPrism = crystal.tier === 'prism';

        switch (this.currentOperation) {
            case 'merge':
            case 'split':
            case 'createFragment':
                return isShard;
            case 'splitFragment':
                return isFragment;
            case 'refine':
                return isFragment || isPrism;
            case 'createPrism':
                // createPrism: slot 0 needs shard ≥10, slot 1 needs fragment ≥10
                if (this.activeSlot === 0) {
                    return isShard && crystal.value >= 10;
                } else {
                    return isFragment && crystal.value >= 10;
                }
            default:
                return false;
        }
    }

    private selectCrystal(crystal: Crystal): void {
        // If equation is visible, don't allow changing crystals
        if (this.equationVisible) return;

        // Check if this crystal is already in a slot
        const slot0Match = this.selectedCrystals[0]?.id === crystal.id;
        const slot1Match = this.selectedCrystals[1]?.id === crystal.id;
        const slot2Match = this.selectedCrystals[2]?.id === crystal.id;

        if (slot0Match || slot1Match || slot2Match) {
            // Clicking an already-selected crystal removes it from that slot
            if (slot0Match) {
                this.selectedCrystals[0] = null;
                this.activeSlot = 0;
            } else if (slot1Match) {
                this.selectedCrystals[1] = null;
                this.activeSlot = 1;
            } else {
                this.selectedCrystals[2] = null;
                this.activeSlot = 2;
            }
        } else {
            // Place crystal in active slot
            this.selectedCrystals[this.activeSlot] = crystal;

            // Auto-advance to next empty slot for convenience
            if (this.currentOperation === 'merge') {
                if (this.activeSlot === 0 && this.selectedCrystals[1] === null) {
                    this.activeSlot = 1;
                } else if (this.activeSlot === 1 && this.selectedCrystals[0] === null) {
                    this.activeSlot = 0;
                }
            } else if (this.currentOperation === 'createFragment') {
                // For createFragment, cycle through 3 slots
                if (this.activeSlot === 0 && this.selectedCrystals[1] === null) {
                    this.activeSlot = 1;
                } else if (this.activeSlot === 1 && this.selectedCrystals[2] === null) {
                    this.activeSlot = 2;
                } else if (this.activeSlot === 2 && this.selectedCrystals[0] === null) {
                    this.activeSlot = 0;
                }
            } else if (this.currentOperation === 'createPrism') {
                // For createPrism, slot 0 = shard, slot 1 = fragment
                if (this.activeSlot === 0 && this.selectedCrystals[1] === null) {
                    this.activeSlot = 1;
                } else if (this.activeSlot === 1 && this.selectedCrystals[0] === null) {
                    this.activeSlot = 0;
                }
            }
            // For split/splitFragment/refine, stay on slot 0 (only one slot used)
        }

        this.renderInventoryCrystals();
        this.updateForgeDisplay();
        this.updateSlotCircleStates();
        this.updateOperationButtonVisibility();
    }

    private setActiveSlot(slot: 0 | 1 | 2): void {
        if (this.equationVisible) return;
        this.activeSlot = slot;
        this.updateSlotCircleStates();
    }

    /**
     * Updates the visual state of each forge slot circle based on:
     * - Whether a crystal is placed (filled state)
     * - Whether it's the active slot waiting for input (selected state with golden tint)
     * - Whether it's available but not selected (available state)
     * - Whether the slot is needed for the current operation (locked/hidden if not)
     */
    private updateSlotCircleStates(): void {
        const slotsNeeded = this.getSlotsNeededForOperation();

        this.slotCircles.forEach((circle, index) => {
            // Clear any previous tint first
            circle.clearTint();

            if (index >= slotsNeeded) {
                // Slot not needed for this operation - LOCKED/hidden state
                circle.setVisible(false);
                this.slotDisplays[index]?.setVisible(false);
                return;
            }

            // Slot is needed - make visible
            circle.setVisible(true);
            this.slotDisplays[index]?.setVisible(true);

            // Determine state for this slot
            const hasCrystal = this.selectedCrystals[index] !== null;
            const isSelected = this.activeSlot === index;

            if (hasCrystal) {
                // FILLED state - crystal placed
                circle.setTexture('circle-activated-cropped');
            } else if (isSelected) {
                // SELECTED state - waiting for crystal placement (golden glow)
                circle.setTexture('circle-active-cropped');
                circle.setTint(0xffdd44);  // Golden tint
            } else {
                // AVAILABLE state - empty, can accept crystal, not selected
                circle.setTexture('circle-active-cropped');
            }
        });
    }

    /**
     * Returns the number of slots needed for the current forge operation.
     * - Split operations use 1 slot
     * - Merge and createPrism use 2 slots
     * - createFragment uses 3 slots
     */
    private getSlotsNeededForOperation(): number {
        switch (this.currentOperation) {
            case 'split':
            case 'splitFragment':
            case 'refine':
                return 1;
            case 'merge':
            case 'createPrism':
                return 2;
            case 'createFragment':
                return 3;
            default:
                return 1;
        }
    }

    private createForgeArea(): void {
        // Get circle elements from SceneBuilder
        // Try NEW cropped element IDs first, fall back to OLD IDs if not found
        let circle1El = this.sceneBuilder.get<Phaser.GameObjects.Image>('circle-activated-cropped');
        let circle2El = this.sceneBuilder.get<Phaser.GameObjects.Image>('circle-active-cropped');
        let circle3El = this.sceneBuilder.get<Phaser.GameObjects.Image>('circle-inactive-cropped');

        // Fall back to old element IDs if cropped versions not found
        if (!circle1El) circle1El = this.sceneBuilder.get<Phaser.GameObjects.Image>('circle-activated');
        if (!circle2El) circle2El = this.sceneBuilder.get<Phaser.GameObjects.Image>('circle-active');
        if (!circle3El) circle3El = this.sceneBuilder.get<Phaser.GameObjects.Image>('circle-locked');

        // Store positions from SceneBuilder elements (fallbacks match scenes.json)
        this.slotPositions = [
            { x: circle1El?.x ?? 326, y: circle1El?.y ?? 429 },
            { x: circle2El?.x ?? 439, y: circle2El?.y ?? 425 },
            { x: circle3El?.x ?? 546, y: circle3El?.y ?? 434 },
        ];

        // Get the depth from original elements, use hardcoded scale from scenes.json
        const circleDepth = circle1El?.depth ?? 5;
        const circleScale = 0.5;  // Matches scenes.json (reading .scale from element doesn't work reliably)

        // Destroy SceneBuilder-created circles (they show MISSING because old textures don't exist)
        circle1El?.destroy();
        circle2El?.destroy();
        circle3El?.destroy();

        // Create controllable circle sprites at each slot position
        // Using NEW cropped texture names that exist in textures.json
        this.slotCircles = this.slotPositions.map((pos, index) => {
            // Start with inactive texture - updateSlotCircleStates will set correct state
            const circle = this.add.image(pos.x, pos.y, 'circle-inactive-cropped');
            circle.setScale(circleScale);  // Use scene editor scale (0.5)
            circle.setDepth(circleDepth);
            circle.setInteractive({ useHandCursor: true });
            circle.on('pointerdown', () => this.setActiveSlot(index as 0 | 1 | 2));
            return circle;
        });

        // Create a container at the center of the forge area for relative positioning
        const centerX = (this.slotPositions[0].x + this.slotPositions[1].x) / 2;
        const centerY = (this.slotPositions[0].y + this.slotPositions[1].y) / 2;
        this.forgeContainer = this.add.container(centerX, centerY);

        // Slot displays (containers for crystal sprite/value overlays on circles)
        this.slot1Display = this.add.container(this.slotPositions[0].x - centerX, this.slotPositions[0].y - centerY);
        this.slot2Display = this.add.container(this.slotPositions[1].x - centerX, this.slotPositions[1].y - centerY);
        this.slot3Display = this.add.container(this.slotPositions[2].x - centerX, this.slotPositions[2].y - centerY);

        // Store reference array for easier iteration
        this.slotDisplays = [this.slot1Display, this.slot2Display, this.slot3Display];

        // Add placeholder text to each slot
        const placeholder1 = this.add.text(0, 0, '?', {
            fontSize: '32px',
            fontFamily: 'Arial, sans-serif',
            color: '#666688'
        }).setOrigin(0.5);
        this.slot1Display.add(placeholder1);

        const placeholder2 = this.add.text(0, 0, '?', {
            fontSize: '32px',
            fontFamily: 'Arial, sans-serif',
            color: '#666688'
        }).setOrigin(0.5);
        this.slot2Display.add(placeholder2);

        const placeholder3 = this.add.text(0, 0, '?', {
            fontSize: '32px',
            fontFamily: 'Arial, sans-serif',
            color: '#666688'
        }).setOrigin(0.5);
        this.slot3Display.add(placeholder3);

        // Add slot displays to forge container
        this.forgeContainer.add([this.slot1Display, this.slot2Display, this.slot3Display]);

        // Get the Pedestal element position for positioning other elements
        const pedestalElement = this.sceneBuilder.get<Phaser.GameObjects.Container>('Pedestal');
        if (pedestalElement) {
            this.pedestalPosition = { x: pedestalElement.x, y: pedestalElement.y };
        }

        // Operation button (Spojit/Rozdělit) - under the slots
        this.createOperationButton();

        // Equation display - use Pedestal's built-in text field
        if (pedestalElement) {
            const textObjects = pedestalElement.getData('textObjects') as Map<string, { text: Phaser.GameObjects.Text }> | undefined;
            // Pedestal text area ID: '1770238025686-0h6gjoa2l' (named "Text 1")
            const equationTextInfo = textObjects?.get('1770238025686-0h6gjoa2l');
            if (equationTextInfo) {
                this.equationText = equationTextInfo.text;
                this.equationText.setText('');  // Clear any default text
            }
        }

        // Fallback if Pedestal text not found (shouldn't happen with correct scene setup)
        if (!this.equationText) {
            console.warn('[CrystalForge] Pedestal text not found, using fallback');
            this.equationText = this.add.text(this.pedestalPosition.x, this.pedestalPosition.y, '', {
                fontSize: '32px',
                fontFamily: 'Arial, sans-serif',
                color: '#88ccff',
                fontStyle: 'bold'
            }).setOrigin(0.5).setDepth(200);
        }

        // Answer buttons area (hidden initially)
        this.createAnswerButtons();

        // Split slider (hidden by default) - for split shard
        this.createSplitSlider();

        // Split fragment slider (hidden by default) - for split fragment (2 values)
        this.createSplitFragmentSlider();

        // Initial slot highlight
        this.updateSlotCircleStates();
    }

    private createOperationButton(): void {
        // Get Green_button from SceneBuilder (positioned outside view at 219, -89 in scenes.json)
        const greenButton = this.sceneBuilder.get<Phaser.GameObjects.Container>('Green_button');

        if (greenButton) {
            this.operationButton = greenButton;
            // Move button to correct position (below pedestal, 15px higher than before)
            this.operationButton.setPosition(this.pedestalPosition.x, this.pedestalPosition.y + 35);
            this.operationButton.setDepth(50);

            // Get text object from template (text area ID: 1768922299962-lij5d6x4j)
            const textObjects = this.operationButton.getData('textObjects') as Map<string, { text: Phaser.GameObjects.Text }>;
            const textInfo = textObjects?.get('1768922299962-lij5d6x4j');
            if (textInfo) {
                this.operationButtonText = textInfo.text;
                this.operationButtonText.setText('SPOJIT');
            }

            // Create mana icons (up to 3) - will be shown/hidden based on cost
            this.manaIcons = [];
            const iconSpacing = 22;  // Spacing between icons
            for (let i = 0; i < 3; i++) {
                const icon = this.add.image(-40 + i * iconSpacing, -18, 'mana-icon');
                icon.setScale(0.3);
                icon.setVisible(false);  // Will be controlled by updateManaIconsDisplay
                this.operationButton.add(icon);
                this.manaIcons.push(icon);
            }
            // Show 1 icon initially (merge costs 1)
            this.updateManaIconsDisplay(1);

            // Bind click handler using sceneBuilder (NOT direct container.on)
            this.sceneBuilder.bindClick('Green_button', () => this.startOperation());

            this.operationButton.setVisible(false);  // Hidden until slots are filled
        } else {
            console.warn('[CrystalForge] Green_button template not found, using fallback');
            // Fallback: create programmatic button
            const buttonX = this.pedestalPosition.x;
            const buttonY = this.pedestalPosition.y + 35;
            this.operationButton = this.add.container(buttonX, buttonY);
            this.operationButton.setDepth(50);

            const bg = this.add.rectangle(0, 0, 160, 50, 0x446688)
                .setStrokeStyle(2, 0x6688aa);

            this.operationButtonText = this.add.text(0, 0, 'SPOJIT', {
                fontSize: '20px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff',
                fontStyle: 'bold'
            }).setOrigin(0.5);

            // Create mana icons (up to 3) for fallback
            this.manaIcons = [];
            const iconSpacing = 22;
            for (let i = 0; i < 3; i++) {
                const icon = this.add.image(-40 + i * iconSpacing, -15, 'mana-icon');
                icon.setScale(0.3);
                icon.setVisible(false);
                this.manaIcons.push(icon);
            }

            this.operationButton.add([bg, this.operationButtonText, ...this.manaIcons]);
            this.operationButton.setSize(160, 50);
            this.operationButton.setVisible(false);
            this.updateManaIconsDisplay(1);

            bg.setInteractive({ useHandCursor: true })
                .on('pointerdown', () => this.startOperation());
        }
    }

    private updateOperationButtonVisibility(): void {
        const crystal = this.selectedCrystals[0];

        switch (this.currentOperation) {
            case 'merge': {
                // Show only when both slots are filled with shards
                const bothFilled = this.selectedCrystals[0] !== null && this.selectedCrystals[1] !== null;
                this.operationButton.setVisible(bothFilled);
                break;
            }
            case 'split': {
                // Show when slot 1 is filled with shard, value > 1, AND split value is valid
                const canSplit = crystal !== null &&
                                 crystal.value > 1 &&
                                 this.splitValue > 0 &&
                                 this.splitValue < crystal.value;
                this.operationButton.setVisible(canSplit);
                break;
            }
            case 'createFragment': {
                // Show when all 3 slots are filled with shards
                const allFilled = this.selectedCrystals[0] !== null &&
                                  this.selectedCrystals[1] !== null &&
                                  this.selectedCrystals[2] !== null;
                this.operationButton.setVisible(allFilled);
                break;
            }
            case 'splitFragment': {
                // Show when slot 1 has fragment, value > 2, AND both split values are valid
                const canSplitFragment = crystal !== null &&
                                         crystal.tier === 'fragment' &&
                                         crystal.value > 2 &&
                                         this.splitValue > 0 &&
                                         this.splitValue2 > 0 &&
                                         (this.splitValue + this.splitValue2) < crystal.value;
                this.operationButton.setVisible(canSplitFragment);
                break;
            }
            case 'refine': {
                // Show when slot 1 has fragment/prism, value > 1, AND cut value is valid
                const canRefine = crystal !== null &&
                                  (crystal.tier === 'fragment' || crystal.tier === 'prism') &&
                                  crystal.value > 1 &&
                                  this.splitValue > 0 &&
                                  this.splitValue < crystal.value;
                this.operationButton.setVisible(canRefine);
                break;
            }
            case 'createPrism': {
                // Show when slot 0 has shard ≥10 and slot 1 has fragment ≥10
                const shard = this.selectedCrystals[0];
                const fragment = this.selectedCrystals[1];
                const canCreatePrism = shard !== null &&
                                       fragment !== null &&
                                       shard.tier === 'shard' &&
                                       fragment.tier === 'fragment' &&
                                       shard.value >= 10 &&
                                       fragment.value >= 10;
                this.operationButton.setVisible(canCreatePrism);
                break;
            }
        }
    }

    private updateForgeDisplay(): void {
        // Hide all sliders by default
        this.splitSlider.setVisible(false);
        this.splitFragmentSlider.setVisible(false);

        // Update slot contents (positions are fixed from SceneBuilder)
        // Visibility is controlled by updateSlotHighlights()
        switch (this.currentOperation) {
            case 'merge': {
                // Merge mode: 2 slots
                this.updateSlotDisplay(this.slot1Display, this.selectedCrystals[0] ?? undefined);
                this.updateSlotDisplay(this.slot2Display, this.selectedCrystals[1] ?? undefined);
                break;
            }
            case 'split': {
                // Split mode: single slot with slider
                this.updateSlotDisplay(this.slot1Display, this.selectedCrystals[0] ?? undefined);

                // Show split slider if crystal is selected and can be split
                const crystal = this.selectedCrystals[0];
                if (crystal && crystal.value > 1) {
                    this.splitSlider.setVisible(true);
                    this.updateSplitSlider(crystal.value);
                }
                break;
            }
            case 'createFragment': {
                // Create Fragment mode: 3 slots
                this.updateSlotDisplay(this.slot1Display, this.selectedCrystals[0] ?? undefined);
                this.updateSlotDisplay(this.slot2Display, this.selectedCrystals[1] ?? undefined);
                this.updateSlotDisplay(this.slot3Display, this.selectedCrystals[2] ?? undefined);
                break;
            }
            case 'splitFragment': {
                // Split Fragment mode: single slot with 2-value slider
                this.updateSlotDisplay(this.slot1Display, this.selectedCrystals[0] ?? undefined);

                // Show split fragment slider if fragment is selected and can be split
                const fragment = this.selectedCrystals[0];
                if (fragment && fragment.tier === 'fragment' && fragment.value > 2) {
                    this.splitFragmentSlider.setVisible(true);
                    this.updateSplitFragmentSlider(fragment.value);
                }
                break;
            }
            case 'refine': {
                // Refine mode: single slot with cut slider
                this.updateSlotDisplay(this.slot1Display, this.selectedCrystals[0] ?? undefined);

                // Show split slider for cut amount
                const crystal = this.selectedCrystals[0];
                if (crystal && (crystal.tier === 'fragment' || crystal.tier === 'prism') && crystal.value > 1) {
                    this.splitSlider.setVisible(true);
                    this.updateSplitSlider(crystal.value);
                }
                break;
            }
            case 'createPrism': {
                // Create Prism mode: 2 slots (shard + fragment)
                this.updateSlotDisplay(this.slot1Display, this.selectedCrystals[0] ?? undefined);
                this.updateSlotDisplay(this.slot2Display, this.selectedCrystals[1] ?? undefined);
                break;
            }
        }
    }

    private updateSlotDisplay(slot: Phaser.GameObjects.Container, crystal?: Crystal): void {
        // Remove ALL children from container and destroy them
        slot.removeAll(true);

        // No background needed - circles serve as backgrounds

        if (crystal) {
            // Create crystal sprite using gemstone-icons spritesheet (larger than inventory)
            // Frame mapping: shard=1, fragment=3, prism=5
            const tierFrames: { [key: string]: number } = { shard: 1, fragment: 3, prism: 5 };
            const crystalSprite = this.add.image(0, -25, 'gemstone-icons', tierFrames[crystal.tier]);
            crystalSprite.setScale(0.8);  // Pedestal scale (larger than inventory's 0.5)

            // Value text CENTERED on crystal (same Y position as sprite)
            // Template uses: Georgia font, golden fill #e6e944, stroke #1a1b08, shadow
            const valueText = this.add.text(0, -25, String(crystal.value), {
                fontSize: '32px',
                fontFamily: 'Georgia, serif',
                color: '#e6e944',
                stroke: '#1a1b08',
                strokeThickness: 1,
                shadow: {
                    offsetX: 0,
                    offsetY: 0,
                    color: '#050505',
                    blur: 8,
                    fill: true
                }
            }).setOrigin(0.5);

            slot.add([crystalSprite, valueText]);
        } else {
            // Empty slot placeholder
            const placeholder = this.add.text(0, 0, '?', {
                fontSize: '32px',
                fontFamily: 'Arial, sans-serif',
                color: '#666688'
            }).setOrigin(0.5);
            slot.add(placeholder);
        }

        // Re-apply circle states after rebuilding
        this.updateSlotCircleStates();
    }

    private createAnswerButtons(): void {
        // Get the decorative frame from scene (positioned via scene editor)
        this.answerFrame = this.sceneBuilder.get<Phaser.GameObjects.Image>('results_frame-cropped') ?? null;
        if (this.answerFrame) {
            this.answerFrame.setVisible(false);
            this.answerFrame.setDepth(200);
        }

        const frameX = this.answerFrame?.x ?? 656;
        const frameY = this.answerFrame?.y ?? 497;

        // 2x2 grid layout centered on frame
        const colOffset = 45;
        const rowOffset = 25;
        const positions = [
            { x: frameX - colOffset, y: frameY - rowOffset },
            { x: frameX + colOffset, y: frameY - rowOffset },
            { x: frameX - colOffset, y: frameY + rowOffset },
            { x: frameX + colOffset, y: frameY + rowOffset },
        ];

        const btnScale = 0.25;
        const hoverScale = btnScale * 1.07;

        for (let i = 0; i < 4; i++) {
            const { x, y } = positions[i];
            const bg = this.add.image(0, 0, 'ui-button')
                .setScale(btnScale)
                .setInteractive({ useHandCursor: true });

            const text = this.add.text(0, -2, '', {
                fontSize: '22px',
                fontFamily: 'Arial, sans-serif',
                color: '#5a3825',
                fontStyle: 'bold'
            }).setOrigin(0.5);

            const btn = this.add.container(x, y, [bg, text]);
            btn.setVisible(false);
            btn.setDepth(201);
            btn.setData('textObject', text);
            btn.setData('bg', bg);

            const buttonIndex = i;
            bg.on('pointerover', () => bg.setScale(hoverScale));
            bg.on('pointerout', () => {
                bg.setScale(btnScale);
                bg.setTexture('ui-button');
            });
            bg.on('pointerdown', () => {
                bg.setTexture('ui-button-pressed');
                this.submitAnswer(buttonIndex);
            });

            this.answerButtons.push(btn);
        }
    }

    private createSplitSlider(): void {
        // Position slider below the pedestal area (relative to pedestal position)
        const sliderX = this.pedestalPosition.x;
        const sliderY = this.pedestalPosition.y + 75;  // Below pedestal
        this.splitSlider = this.add.container(sliderX, sliderY);
        this.splitSlider.setVisible(false);
        this.splitSlider.setDepth(50);

        const label = this.add.text(0, -20, 'Kolik oddělit:', {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaaaaa'
        }).setOrigin(0.5);

        // Compact value buttons - positioned closer together
        const minusBtn = this.add.rectangle(-60, 15, 45, 45, 0x664444)
            .setStrokeStyle(2, 0x886666)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.adjustSplitValue(-1))
            .on('pointerover', () => minusBtn.setFillStyle(0x885555))
            .on('pointerout', () => minusBtn.setFillStyle(0x664444));

        const minusText = this.add.text(-60, 15, '−', {
            fontSize: '24px', color: '#ffffff'
        }).setOrigin(0.5);

        this.splitValueText = this.add.text(0, 15, '1', {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffaa44',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const plusBtn = this.add.rectangle(60, 15, 45, 45, 0x446644)
            .setStrokeStyle(2, 0x668866)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.adjustSplitValue(1))
            .on('pointerover', () => plusBtn.setFillStyle(0x558855))
            .on('pointerout', () => plusBtn.setFillStyle(0x446644));

        const plusText = this.add.text(60, 15, '+', {
            fontSize: '24px', color: '#ffffff'
        }).setOrigin(0.5);

        // No separate OK button - the main operation button handles split confirmation

        this.splitSlider.add([label, minusBtn, minusText, this.splitValueText, plusBtn, plusText]);
    }

    private updateSplitSlider(maxValue: number): void {
        // Initialize split value to 1 if not set
        if (this.splitValue <= 0) {
            this.splitValue = 1;
        }
        // Clamp split value to valid range
        if (this.splitValue >= maxValue) {
            this.splitValue = maxValue - 1;
        }
        this.splitValueText.setText(this.splitValue.toString());
        // Update operation button visibility since split value may have changed
        this.updateOperationButtonVisibility();
    }

    private adjustSplitValue(delta: number): void {
        const crystal = this.selectedCrystals[0];
        if (!crystal) return;

        const maxValue = crystal.value;
        this.splitValue = Phaser.Math.Clamp(this.splitValue + delta, 1, maxValue - 1);
        this.splitValueText.setText(this.splitValue.toString());

        // Update the operation button visibility since split value changed
        this.updateOperationButtonVisibility();
    }

    private createSplitFragmentSlider(): void {
        // For splitFragment: divide fragment into 3 shards
        // User sets 2 values, 3rd is calculated (fragment - val1 - val2 = ?)
        // Position below the pedestal area (relative to pedestal position)
        const sliderX = this.pedestalPosition.x;
        const sliderY = this.pedestalPosition.y + 75;  // Below pedestal
        this.splitFragmentSlider = this.add.container(sliderX, sliderY);
        this.splitFragmentSlider.setVisible(false);
        this.splitFragmentSlider.setDepth(50);

        const label = this.add.text(0, -25, 'Rozdělit na 3 střepy:', {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaaaaa'
        }).setOrigin(0.5);

        // First value controls
        const minus1Btn = this.add.rectangle(-100, 15, 35, 35, 0x664444)
            .setStrokeStyle(2, 0x886666)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.adjustFragmentSplitValue(1, -1))
            .on('pointerover', () => minus1Btn.setFillStyle(0x885555))
            .on('pointerout', () => minus1Btn.setFillStyle(0x664444));

        const minus1Text = this.add.text(-100, 15, '−', {
            fontSize: '20px', color: '#ffffff'
        }).setOrigin(0.5);

        this.splitFragmentValue1Text = this.add.text(-60, 15, '1', {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffaa44',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const plus1Btn = this.add.rectangle(-20, 15, 35, 35, 0x446644)
            .setStrokeStyle(2, 0x668866)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.adjustFragmentSplitValue(1, 1))
            .on('pointerover', () => plus1Btn.setFillStyle(0x558855))
            .on('pointerout', () => plus1Btn.setFillStyle(0x446644));

        const plus1Text = this.add.text(-20, 15, '+', {
            fontSize: '20px', color: '#ffffff'
        }).setOrigin(0.5);

        // Second value controls
        const minus2Btn = this.add.rectangle(20, 15, 35, 35, 0x664444)
            .setStrokeStyle(2, 0x886666)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.adjustFragmentSplitValue(2, -1))
            .on('pointerover', () => minus2Btn.setFillStyle(0x885555))
            .on('pointerout', () => minus2Btn.setFillStyle(0x664444));

        const minus2Text = this.add.text(20, 15, '−', {
            fontSize: '20px', color: '#ffffff'
        }).setOrigin(0.5);

        this.splitFragmentValue2Text = this.add.text(60, 15, '1', {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffaa44',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const plus2Btn = this.add.rectangle(100, 15, 35, 35, 0x446644)
            .setStrokeStyle(2, 0x668866)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.adjustFragmentSplitValue(2, 1))
            .on('pointerover', () => plus2Btn.setFillStyle(0x558855))
            .on('pointerout', () => plus2Btn.setFillStyle(0x446644));

        const plus2Text = this.add.text(100, 15, '+', {
            fontSize: '20px', color: '#ffffff'
        }).setOrigin(0.5);

        this.splitFragmentSlider.add([
            label,
            minus1Btn, minus1Text, this.splitFragmentValue1Text, plus1Btn, plus1Text,
            minus2Btn, minus2Text, this.splitFragmentValue2Text, plus2Btn, plus2Text
        ]);
    }

    private updateSplitFragmentSlider(maxValue: number): void {
        // Initialize values if not set
        if (this.splitValue <= 0) this.splitValue = 1;
        if (this.splitValue2 <= 0) this.splitValue2 = 1;

        // Ensure values are valid (both > 0, and sum < maxValue)
        const maxEach = maxValue - 2; // Leave at least 1 for the third shard
        this.splitValue = Phaser.Math.Clamp(this.splitValue, 1, maxEach);
        this.splitValue2 = Phaser.Math.Clamp(this.splitValue2, 1, maxValue - this.splitValue - 1);

        this.splitFragmentValue1Text.setText(this.splitValue.toString());
        this.splitFragmentValue2Text.setText(this.splitValue2.toString());
        this.updateOperationButtonVisibility();
    }

    private adjustFragmentSplitValue(which: 1 | 2, delta: number): void {
        const fragment = this.selectedCrystals[0];
        if (!fragment) return;

        const maxValue = fragment.value;

        if (which === 1) {
            // Adjust first value, ensure room for second value + remainder
            const max1 = maxValue - this.splitValue2 - 1;
            this.splitValue = Phaser.Math.Clamp(this.splitValue + delta, 1, max1);
        } else {
            // Adjust second value, ensure room for first value + remainder
            const max2 = maxValue - this.splitValue - 1;
            this.splitValue2 = Phaser.Math.Clamp(this.splitValue2 + delta, 1, max2);
        }

        this.splitFragmentValue1Text.setText(this.splitValue.toString());
        this.splitFragmentValue2Text.setText(this.splitValue2.toString());
        this.updateOperationButtonVisibility();
    }

    private showAnswerChoices(correctAnswer: number): void {
        if (this.answerFrame) this.answerFrame.setVisible(true);

        const choices = this.generateChoices(correctAnswer);

        choices.forEach((choice, index) => {
            const btn = this.answerButtons[index];
            if (!btn) return;

            btn.setVisible(true);

            // Use stored text reference for safer access
            const text = btn.getData('textObject') as Phaser.GameObjects.Text;
            if (text) {
                text.setText(choice.toString());
            }
            btn.setData('value', choice);
            btn.setData('correct', choice === correctAnswer);
        });
    }

    private hideAnswerButtons(): void {
        this.answerButtons.forEach(btn => btn.setVisible(false));
        if (this.answerFrame) this.answerFrame.setVisible(false);
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

        // Determine mana cost: basic ops = 1, advanced ops = 2, master ops = 2 or 3
        let manaCost = 1;
        if (this.currentOperation === 'createFragment' || this.currentOperation === 'splitFragment' || this.currentOperation === 'refine') {
            manaCost = 2;
        } else if (this.currentOperation === 'createPrism') {
            manaCost = 3;
        }

        if (isCorrect) {
            // Spend mana (already checked in startOperation)
            ManaSystem.spend(player, manaCost);

            // Execute operation
            if (this.currentOperation === 'merge') {
                const crystal0 = this.selectedCrystals[0];
                const crystal1 = this.selectedCrystals[1];
                if (!crystal0 || !crystal1) return;

                const result = CrystalSystem.executeMerge(
                    player,
                    crystal0.id,
                    crystal1.id,
                    value
                );
                if (result) {
                    this.showSuccessAnimation(result);
                }
            } else if (this.currentOperation === 'split') {
                const crystal0 = this.selectedCrystals[0];
                if (!crystal0) return;

                const results = CrystalSystem.executeSplit(
                    player,
                    crystal0.id,
                    this.splitValue,
                    value
                );
                if (results && results.length > 0) {
                    this.showSuccessAnimation(results);
                }
            } else if (this.currentOperation === 'createFragment') {
                const crystal0 = this.selectedCrystals[0];
                const crystal1 = this.selectedCrystals[1];
                const crystal2 = this.selectedCrystals[2];
                if (!crystal0 || !crystal1 || !crystal2) return;

                const result = CrystalSystem.executeCreateFragment(
                    player,
                    crystal0.id,
                    crystal1.id,
                    crystal2.id,
                    value
                );
                if (result) {
                    this.showSuccessAnimation(result);
                }
            } else if (this.currentOperation === 'splitFragment') {
                const fragment = this.selectedCrystals[0];
                if (!fragment) return;

                const results = CrystalSystem.executeSplitFragment(
                    player,
                    fragment.id,
                    this.splitValue,
                    this.splitValue2,
                    value
                );
                if (results && results.length > 0) {
                    this.showSuccessAnimation(results);
                }
            } else if (this.currentOperation === 'refine') {
                const crystal = this.selectedCrystals[0];
                if (!crystal) return;

                const results = CrystalSystem.executeRefine(
                    player,
                    crystal.id,
                    this.splitValue,
                    value
                );
                if (results && results.length > 0) {
                    this.showSuccessAnimation(results);
                }
            } else if (this.currentOperation === 'createPrism') {
                const shard = this.selectedCrystals[0];
                const fragment = this.selectedCrystals[1];
                if (!shard || !fragment) return;

                const result = CrystalSystem.executeCreatePrism(
                    player,
                    shard.id,
                    fragment.id,
                    value
                );
                if (result) {
                    this.showSuccessAnimation(result);
                }
            }

            this.gameState.save();

        } else {
            // Wrong answer - costs mana
            ManaSystem.spend(player, manaCost);
            this.gameState.save();
            this.showFailureAnimation(manaCost);
        }
    }

    private showSuccessAnimation(crystals: Crystal | Crystal[]): void {
        // Normalize to array
        const crystalArray = Array.isArray(crystals) ? crystals : [crystals];

        // Hide equation and answers
        this.hideAnswerButtons();
        this.equationText.setText('');  // Clear equation (template text, always visible)
        this.splitSlider.setVisible(false);
        this.splitFragmentSlider.setVisible(false);
        this.operationButton.setVisible(false);

        // Clear the slots immediately (crystals are already consumed)
        this.selectedCrystals = [null, null, null];
        this.updateForgeDisplay();

        // Create container for all result crystals
        const resultsContainer = this.add.container(640, 360);
        resultsContainer.setDepth(100);

        // Calculate spacing based on number of crystals
        const spacing = crystalArray.length === 1 ? 0 :
                        crystalArray.length === 2 ? 120 : 100;
        const startX = -spacing * (crystalArray.length - 1) / 2;

        // Create display for each crystal using sprites (not emoji)
        crystalArray.forEach((crystal, index) => {
            const x = startX + index * spacing;

            // Frame mapping for gemstone-icons: shard=1, fragment=3, prism=5
            const tierFrames: { [key: string]: number } = { shard: 1, fragment: 3, prism: 5 };

            // Glow background (larger for single crystal celebration)
            const glowSize = crystalArray.length === 1 ? 120 : 80;
            const glow = this.add.circle(x, 0, glowSize, 0x88ccff, 0.3);

            // Large crystal sprite (biggest scale for success celebration)
            const crystalSprite = this.add.image(x, -10, 'gemstone-icons', tierFrames[crystal.tier]);
            const spriteScale = crystalArray.length === 1 ? 1.5 : 1.0;  // Largest for single result
            crystalSprite.setScale(spriteScale);

            // Value text CENTERED on crystal with golden Georgia style (matches inventory template)
            const valueFontSize = crystalArray.length === 1 ? '48px' : '36px';
            const valueText = this.add.text(x, -10, String(crystal.value), {
                fontSize: valueFontSize,
                fontFamily: 'Georgia, serif',
                color: '#e6e944',
                stroke: '#1a1b08',
                strokeThickness: 2,
                shadow: {
                    offsetX: 0,
                    offsetY: 0,
                    color: '#050505',
                    blur: 10,
                    fill: true
                }
            }).setOrigin(0.5);

            resultsContainer.add([glow, crystalSprite, valueText]);
        });

        // Scale up animation
        resultsContainer.setScale(0);
        this.tweens.add({
            targets: resultsContainer,
            scale: 1,
            duration: 300,
            ease: 'Back.easeOut'
        });

        // Success text
        this.messageText.setText('Úspěch! ✨');
        this.messageText.setColor('#44ff44');
        this.messageText.setY(500);
        this.messageText.setAlpha(1);

        // Function to dismiss the animation
        let dismissed = false;
        const dismissAnimation = () => {
            // Prevent double-dismiss
            if (dismissed || !resultsContainer.active) return;
            dismissed = true;

            this.tweens.add({
                targets: [resultsContainer, this.messageText],
                alpha: 0,
                duration: 300,
                onComplete: () => {
                    resultsContainer.destroy();
                    this.resetForge();
                }
            });
        };

        // Click anywhere to dismiss early (after short delay to ignore the answer click)
        let clickHandler: (() => void) | null = null;
        this.time.delayedCall(200, () => {
            if (dismissed) return;
            clickHandler = () => {
                if (delayedCall) delayedCall.remove();
                dismissAnimation();
            };
            this.input.once('pointerdown', clickHandler);
        });

        // Auto-dismiss after 3 seconds
        const delayedCall = this.time.delayedCall(3000, () => {
            if (clickHandler) this.input.off('pointerdown', clickHandler);
            dismissAnimation();
        });
    }

    private showFailureAnimation(manaCost: number = 1): void {
        // Hide equation and answers
        this.hideAnswerButtons();
        this.equationText.setText('');  // Clear equation (template text, always visible)
        this.splitSlider.setVisible(false);
        this.splitFragmentSlider.setVisible(false);
        this.operationButton.setVisible(false);

        // Clear the slots (will be reset after animation)
        this.selectedCrystals = [null, null, null];
        this.updateForgeDisplay();

        // Smoke effect (simple circles)
        const smokeContainer = this.add.container(640, 360);
        smokeContainer.setDepth(100);

        for (let i = 0; i < 8; i++) {
            const smoke = this.add.circle(
                Phaser.Math.Between(-50, 50),
                Phaser.Math.Between(-50, 50),
                Phaser.Math.Between(20, 40),
                0x666666,
                0.6
            );
            smokeContainer.add(smoke);

            // Animate smoke rising and fading
            this.tweens.add({
                targets: smoke,
                y: smoke.y - 80,
                alpha: 0,
                scale: 1.5,
                duration: 800,
                ease: 'Power2'
            });
        }

        // Mana loss text (shows correct cost)
        const manaLoss = this.add.text(640, 340, `-${manaCost} ⚡`, {
            fontSize: '48px',
            fontFamily: 'Arial, sans-serif',
            color: '#ff4444',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(101);

        // "Failed operation" text
        this.messageText.setText('Špatný výsledek!');
        this.messageText.setColor('#ff6644');
        this.messageText.setY(420);
        this.messageText.setAlpha(1);

        // Screen shake
        this.cameras.main.shake(200, 0.01);

        // Update mana display
        this.updateManaDisplay();

        // Fade out and reset after delay
        this.time.delayedCall(1500, () => {
            this.tweens.add({
                targets: [smokeContainer, manaLoss, this.messageText],
                alpha: 0,
                duration: 300,
                onComplete: () => {
                    smokeContainer.destroy();
                    manaLoss.destroy();
                    this.resetForge();
                }
            });
        });
    }

    private showCenterMessage(text: string, color: string): void {
        this.messageText.setText(text);
        this.messageText.setColor(color);
        this.messageText.setY(360);
        this.messageText.setAlpha(1);

        this.tweens.add({
            targets: this.messageText,
            alpha: 0,
            duration: 500,
            delay: 1000
        });
    }

    private resetForge(): void {
        this.selectedCrystals = [null, null, null];
        this.splitValue = 0;
        this.splitValue2 = 0;
        this.activeSlot = 0;
        this.equationVisible = false;

        this.renderInventoryCrystals();
        this.updateForgeDisplay();
        this.updateManaDisplay();
        this.updateSlotCircleStates();
        this.updateOperationButtonVisibility();
        this.splitSlider.setVisible(false);
        this.splitFragmentSlider.setVisible(false);
        this.equationText.setText('');  // Clear equation (template text, always visible)
        this.hideAnswerButtons();
    }

    private createOperationPanel(): void {
        // Operation panel uses unique image buttons (one per forge operation)
        // Each button has its own artwork illustrating the operation visually
        const buttonMappings: { id: string; operation: ForgeOperation; locked: boolean }[] = [
            { id: 'forge-btn-merge', operation: 'merge', locked: false },
            { id: 'forge-btn-split', operation: 'split', locked: false },
            { id: 'forge-btn-create-fragment', operation: 'createFragment', locked: !this.fragmentOperationsUnlocked },
            { id: 'forge-btn-split-fragment', operation: 'splitFragment', locked: !this.fragmentOperationsUnlocked },
            { id: 'forge-btn-refine', operation: 'refine', locked: !this.refineUnlocked },
            { id: 'forge-btn-create-prism', operation: 'createPrism', locked: !this.prismOperationsUnlocked },
        ];

        buttonMappings.forEach(mapping => {
            const btn = this.sceneBuilder.get<Phaser.GameObjects.Image>(mapping.id);
            if (!btn) return;

            // Store base scale for highlight system (before any modifications)
            btn.setData('baseScaleX', btn.scaleX);
            btn.setData('baseScaleY', btn.scaleY);

            // Store reference for highlighting
            this.operationPanelButtons.set(mapping.operation, { btn, locked: mapping.locked });

            // Locked buttons get heavy dark tint + lock icon overlay
            if (mapping.locked) {
                btn.setTint(0x333333);

                // Place lock icon centered on the button
                const lockSign = this.sceneBuilder.get<Phaser.GameObjects.Image>('lock-sign');
                if (lockSign) {
                    const lockIcon = this.add.image(btn.x, btn.y, 'lock-sign');
                    lockIcon.setDepth(btn.depth + 1);
                    lockIcon.setScale(btn.scaleX, btn.scaleY);
                }
                return;
            }

            // Bind click handler for unlocked buttons
            this.sceneBuilder.bindClick(mapping.id, () => {
                this.setOperation(mapping.operation);
            });

            // Scale-based hover/pressed effects
            const baseScaleX = btn.scaleX;
            const baseScaleY = btn.scaleY;
            let isPressed = false;

            btn.on('pointerover', () => {
                if (!isPressed) {
                    this.tweens.killTweensOf(btn);
                    btn.setScale(baseScaleX * 1.05, baseScaleY * 1.05);
                    btn.clearTint();
                }
            });
            btn.on('pointerout', () => {
                isPressed = false;
                this.tweens.killTweensOf(btn);
                this.updateOperationPanelHighlights();
            });
            btn.on('pointerdown', () => {
                isPressed = true;
                this.tweens.killTweensOf(btn);
                this.tweens.add({
                    targets: btn,
                    scaleX: baseScaleX * 1.08,
                    scaleY: baseScaleY * 1.08,
                    duration: 150,
                    ease: 'Power2.easeOut'
                });
            });
            btn.on('pointerup', () => {
                isPressed = false;
                this.tweens.killTweensOf(btn);
                this.tweens.add({
                    targets: btn,
                    scaleX: baseScaleX * 1.05,
                    scaleY: baseScaleY * 1.05,
                    duration: 150,
                    ease: 'Power2.easeOut'
                });
                btn.clearTint();
            });
        });

        // Initial highlight for merge (pre-selected)
        this.updateOperationPanelHighlights();
    }

    private operationPanelButtons: Map<string, { btn: Phaser.GameObjects.Image; locked: boolean }> = new Map();

    private updateOperationPanelHighlights(): void {
        // Highlight uses tint + scale: active button stays enlarged, inactive are dimmed
        this.operationPanelButtons.forEach((data, op) => {
            const baseX = data.btn.getData('baseScaleX') as number;
            const baseY = data.btn.getData('baseScaleY') as number;

            if (data.locked) {
                data.btn.setTint(0x333333);
                data.btn.setScale(baseX, baseY);
            } else if (this.currentOperation === op) {
                data.btn.clearTint();
                data.btn.setScale(baseX * 1.05, baseY * 1.05);
            } else {
                data.btn.setTint(0x808080); // 50% black overlay for inactive (testing visibility)
                data.btn.setScale(baseX, baseY);
            }
        });
    }

    private setOperation(op: ForgeOperation): void {
        if (this.equationVisible) return;

        this.currentOperation = op;

        // Clear slots based on operation type
        if (op === 'split' || op === 'splitFragment' || op === 'refine') {
            // Single slot operations - clear other slots
            this.selectedCrystals[1] = null;
            this.selectedCrystals[2] = null;
            this.activeSlot = 0;
        } else if (op === 'merge' || op === 'createPrism') {
            // Two slot operation - clear third slot
            this.selectedCrystals[2] = null;
            if (this.activeSlot === 2) this.activeSlot = 0;
        }
        // createFragment uses all 3 slots

        // Reset split values when changing operations
        this.splitValue = 0;
        this.splitValue2 = 0;

        // Update operation button text and mana cost icons
        const buttonLabels: Record<ForgeOperation, { text: string; cost: number }> = {
            'merge': { text: 'SPOJIT', cost: 1 },
            'split': { text: 'ROZDĚLIT', cost: 1 },
            'createFragment': { text: 'VYTVOŘIT', cost: 2 },
            'splitFragment': { text: 'ROZDĚLIT', cost: 2 },
            'refine': { text: 'ODSEKAT', cost: 2 },
            'createPrism': { text: 'VYTVOŘIT', cost: 3 }
        };
        const label = buttonLabels[op];
        this.operationButtonText?.setText(label.text);
        this.updateManaIconsDisplay(label.cost);

        this.renderInventoryCrystals();
        this.updateForgeDisplay();
        this.updateSlotCircleStates();
        this.updateOperationPanelHighlights();
        this.updateOperationButtonVisibility();
    }

    private startOperation(): void {
        const player = this.gameState.getPlayer();

        // Determine mana cost: basic ops = 1, advanced ops = 2, master ops = 2 or 3
        let manaCost = 1;
        if (this.currentOperation === 'createFragment' || this.currentOperation === 'splitFragment' || this.currentOperation === 'refine') {
            manaCost = 2;
        } else if (this.currentOperation === 'createPrism') {
            manaCost = 3;
        }

        // Check mana first
        if (!ManaSystem.canAfford(player, manaCost)) {
            this.showCenterMessage('Nedostatek many! ⚡', '#ff4444');
            return;
        }

        // Hide operation button and sliders FIRST (before showing equation)
        this.operationButton.setVisible(false);
        this.splitSlider.setVisible(false);
        this.splitFragmentSlider.setVisible(false);

        if (this.currentOperation === 'merge') {
            // Need 2 shards
            if (!this.selectedCrystals[0] || !this.selectedCrystals[1]) {
                this.showCenterMessage('Vyber 2 střepy!', '#ffaa44');
                return;
            }

            const a = this.selectedCrystals[0].value;
            const b = this.selectedCrystals[1].value;
            this.equationText.setText(`${a} + ${b} = ?`);
            this.showAnswerChoices(a + b);

        } else if (this.currentOperation === 'split') {
            // Need 1 shard with valid split value
            const crystal = this.selectedCrystals[0];
            if (!crystal) {
                this.showCenterMessage('Vyber střep!', '#ffaa44');
                return;
            }

            if (this.splitValue <= 0 || this.splitValue >= crystal.value) {
                this.showCenterMessage('Nastav hodnotu rozdělení!', '#ffaa44');
                return;
            }

            // Check inventory space (split adds 1 net crystal)
            const status = CrystalSystem.getInventoryStatus(player);
            if (status.isFull) {
                this.showCenterMessage('Inventář je plný!', '#ff4444');
                return;
            }

            const answer = crystal.value - this.splitValue;
            this.equationText.setText(`${crystal.value} − ${this.splitValue} = ?`);
            this.showAnswerChoices(answer);

        } else if (this.currentOperation === 'createFragment') {
            // Need 3 shards
            if (!this.selectedCrystals[0] || !this.selectedCrystals[1] || !this.selectedCrystals[2]) {
                this.showCenterMessage('Vyber 3 střepy!', '#ffaa44');
                return;
            }

            const a = this.selectedCrystals[0].value;
            const b = this.selectedCrystals[1].value;
            const c = this.selectedCrystals[2].value;
            this.equationText.setText(`${a} + ${b} + ${c} = ?`);
            this.showAnswerChoices(a + b + c);

        } else if (this.currentOperation === 'splitFragment') {
            // Need 1 fragment with valid split values
            const fragment = this.selectedCrystals[0];
            if (!fragment || fragment.tier !== 'fragment') {
                this.showCenterMessage('Vyber úlomek!', '#ffaa44');
                return;
            }

            if (this.splitValue <= 0 || this.splitValue2 <= 0 ||
                (this.splitValue + this.splitValue2) >= fragment.value) {
                this.showCenterMessage('Nastav hodnoty rozdělení!', '#ffaa44');
                return;
            }

            // Check inventory space (splitFragment adds 2 net crystals)
            const status = CrystalSystem.getInventoryStatus(player);
            if (status.current + 1 >= status.max) {
                this.showCenterMessage('Inventář je plný!', '#ff4444');
                return;
            }

            const answer = fragment.value - this.splitValue - this.splitValue2;
            this.equationText.setText(`${fragment.value} − ${this.splitValue} − ${this.splitValue2} = ?`);
            this.showAnswerChoices(answer);

        } else if (this.currentOperation === 'refine') {
            // Need 1 fragment or prism with valid cut value
            const crystal = this.selectedCrystals[0];
            if (!crystal || (crystal.tier !== 'fragment' && crystal.tier !== 'prism')) {
                this.showCenterMessage('Vyber úlomek nebo prizmu!', '#ffaa44');
                return;
            }

            if (this.splitValue <= 0 || this.splitValue >= crystal.value) {
                this.showCenterMessage('Nastav hodnotu k odseknutí!', '#ffaa44');
                return;
            }

            // Check inventory space (refine adds 1 net crystal)
            const status = CrystalSystem.getInventoryStatus(player);
            if (status.isFull) {
                this.showCenterMessage('Inventář je plný!', '#ff4444');
                return;
            }

            const answer = crystal.value - this.splitValue;
            this.equationText.setText(`${crystal.value} − ${this.splitValue} = ?`);
            this.showAnswerChoices(answer);

        } else if (this.currentOperation === 'createPrism') {
            // Need 1 shard (≥10) and 1 fragment (≥10)
            const shard = this.selectedCrystals[0];
            const fragment = this.selectedCrystals[1];
            if (!shard || shard.tier !== 'shard' || shard.value < 10) {
                this.showCenterMessage('Vyber střep (≥10)!', '#ffaa44');
                return;
            }
            if (!fragment || fragment.tier !== 'fragment' || fragment.value < 10) {
                this.showCenterMessage('Vyber úlomek (≥10)!', '#ffaa44');
                return;
            }

            const answer = shard.value + fragment.value - 20;
            this.equationText.setText(`${shard.value} + ${fragment.value} − 20 = ?`);
            this.showAnswerChoices(answer);
        }

        this.equationVisible = true;
    }

    private createBackButton(): void {
        // Back button is created by SceneBuilder from "Back button" UI element
        // Just need to bind the click handler
        this.sceneBuilder.bindClick('Back button', () => {
            this.scene.start('TownScene');
        });
    }

    // ========== INVENTORY PAGINATION ==========

    private setupInventoryArrows(): void {
        // Arrow elements are created by SceneBuilder - just bind click handlers
        // NewArrow = right arrow (next page)
        // NewArrow_copy = left arrow (previous page)

        this.sceneBuilder.bindClick('NewArrow', () => {
            const player = this.gameState.getPlayer();
            const crystals = player.crystals?.crystals || [];
            const maxPage = Math.max(0, Math.ceil(crystals.length / this.CRYSTALS_PER_PAGE) - 1);

            if (this.crystalPage < maxPage) {
                this.crystalPage++;
                this.animateInventoryPageChange('left');  // Content slides left (going to next page)
                this.updateInventoryArrowVisibility();
            }
        });

        this.sceneBuilder.bindClick('NewArrow_copy', () => {
            if (this.crystalPage > 0) {
                this.crystalPage--;
                this.animateInventoryPageChange('right');  // Content slides right (going to previous page)
                this.updateInventoryArrowVisibility();
            }
        });

        this.updateInventoryArrowVisibility();
    }

    private updateInventoryArrowVisibility(): void {
        const player = this.gameState.getPlayer();
        const crystals = player.crystals?.crystals || [];
        const maxPage = Math.max(0, Math.ceil(crystals.length / this.CRYSTALS_PER_PAGE) - 1);

        // Get arrow elements from SceneBuilder
        const leftArrow = this.sceneBuilder.get('NewArrow_copy');
        const rightArrow = this.sceneBuilder.get('NewArrow');

        // Hide arrows completely if inventory fits on one page
        const needsPagination = maxPage > 0;

        if (leftArrow) {
            leftArrow.setVisible(needsPagination && this.crystalPage > 0);
        }

        if (rightArrow) {
            rightArrow.setVisible(needsPagination && this.crystalPage < maxPage);
        }
    }

    private animateInventoryPageChange(direction: 'left' | 'right'): void {
        const slideDistance = 80;
        const duration = 250;

        // Get all crystal holder containers
        const allHolders = this.crystalHolders.map(h => h.container);

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

        // After slide-out, update data and slide in from opposite side
        this.time.delayedCall(duration, () => {
            this.renderInventoryCrystals();

            // Position holders on opposite side and slide in (carousel effect)
            this.crystalHolders.forEach(holder => {
                // Kill any running tween on this holder first
                this.tweens.killTweensOf(holder.container);

                const originalX = holder.container.getData('originalX') as number;
                // New content starts on opposite side and moves same direction as old
                const startX = direction === 'left' ? originalX + slideDistance : originalX - slideDistance;
                holder.container.x = startX;
                holder.container.alpha = 0;

                this.tweens.add({
                    targets: holder.container,
                    x: originalX,
                    alpha: 1,
                    duration: duration,
                    ease: 'Power2'
                });
            });
        });
    }
}
