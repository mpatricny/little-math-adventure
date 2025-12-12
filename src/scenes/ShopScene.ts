import Phaser from 'phaser';
import { ItemDefinition, ItemType } from '../types';
import { GameStateManager } from '../systems/GameStateManager';
import { SceneDebugger } from '../systems/SceneDebugger';
import { SceneBuilder } from '../systems/SceneBuilder';

type ShopCategory = 'weapon' | 'shield';

// Coin type definitions
interface CoinType {
    key: 'smallCopper' | 'largeCopper' | 'silver' | 'gold';
    value: number;
    frame: number;  // Frame in spritesheet
    name: string;
}

const COIN_TYPES: CoinType[] = [
    { key: 'smallCopper', value: 1, frame: 0, name: 'Měďák' },
    { key: 'largeCopper', value: 2, frame: 2, name: 'Velký měďák' },
    { key: 'silver', value: 5, frame: 4, name: 'Stříbrňák' },
    { key: 'gold', value: 50, frame: 6, name: 'Zlaťák' },
];

// Draggable coin sprite
interface DraggableCoin extends Phaser.GameObjects.Image {
    coinType: CoinType;
    originX: number;
    originY: number;
    inPaymentArea: boolean;
}

export class ShopScene extends Phaser.Scene {
    private gameState!: GameStateManager;
    private allItems!: ItemDefinition[];
    private currentCategory: ShopCategory = 'weapon';
    private selectedItem: ItemDefinition | null = null;

    // UI Elements
    private categoryTabs: Map<ShopCategory, Phaser.GameObjects.Container> = new Map();
    private itemSlots: Phaser.GameObjects.Container[] = [];
    private purchasePanel!: Phaser.GameObjects.Container;
    private tableContainer!: Phaser.GameObjects.Container;
    private paymentTray!: Phaser.GameObjects.Container;
    private paymentArea!: Phaser.GameObjects.Rectangle;
    private tableArea!: Phaser.GameObjects.Rectangle;

    // Coin management
    private playerCoins: DraggableCoin[] = [];
    private paymentCoins: DraggableCoin[] = [];
    private draggedCoin: DraggableCoin | null = null;


    // Universal debugger
    private debugger!: SceneDebugger;

    // Scene Builder
    private sceneBuilder!: SceneBuilder;

    constructor() {
        super({ key: 'ShopScene' });
    }

    create(): void {
        this.gameState = GameStateManager.getInstance();
        this.allItems = this.cache.json.get('items') as ItemDefinition[];

        // Reset arrays (important for scene re-entry)
        this.categoryTabs.clear();
        this.itemSlots = [];
        this.playerCoins = [];
        this.paymentCoins = [];
        this.draggedCoin = null;
        this.selectedItem = null;

        // Initialize SceneBuilder
        this.sceneBuilder = new SceneBuilder(this);

        // Register handlers before building
        this.sceneBuilder.registerHandler('onBuy', () => this.attemptPurchase());

        this.sceneBuilder.buildScene();

        // Get purchase panel from SceneBuilder and set up references
        this.setupPurchasePanel();

        // Get table elements
        const tablePouch = this.sceneBuilder.get('tablePouch') as Phaser.GameObjects.Image;
        const tableTop = this.sceneBuilder.get('tableTop') as Phaser.GameObjects.Image;
        const coinTray = this.sceneBuilder.get('coinTray') as Phaser.GameObjects.Image;

        // Setup areas based on positions
        this.setupAreas(tablePouch, tableTop, coinTray);

        // Category tabs and item grid - use SceneBuilder elements
        this.setupCategoryTabs();
        this.setupItemSlots();

        // Show initial category
        this.showCategory('weapon');

        // Setup drag handling
        this.setupDragHandling();

        // Setup debugger
        this.setupDebugger();
    }

    private setupAreas(tablePouch: Phaser.GameObjects.Image, tableTop: Phaser.GameObjects.Image, coinTray: Phaser.GameObjects.Image): void {
        // Table area
        if (tablePouch && tableTop) {
            const minX = Math.min(tablePouch.x, tableTop.x) - 150;
            const maxX = Math.max(tablePouch.x, tableTop.x) + 150;
            const avgY = (tablePouch.y + tableTop.y) / 2;
            this.tableArea = this.add.rectangle((minX + maxX) / 2, avgY, maxX - minX, 240, 0x000000, 0);

            // Store table container reference for coin spawning relative position
            this.tableContainer = this.add.container(tablePouch.x, tablePouch.y);
        } else {
            // Fallback if elements missing
            this.tableArea = this.add.rectangle(600, 600, 600, 200, 0x000000, 0);
            this.tableContainer = this.add.container(600, 600);
        }

        // Payment area - covers the entire coin tray
        if (coinTray) {
            this.paymentTray = this.add.container(coinTray.x, coinTray.y);
            const trayWidth = 280 * coinTray.scale;
            const trayHeight = 200 * coinTray.scale;
            this.paymentArea = this.add.rectangle(coinTray.x, coinTray.y, trayWidth, trayHeight, 0x000000, 0);

            // Link total text
            const totalText = this.sceneBuilder.get('labelTotal') as Phaser.GameObjects.Text;
            if (totalText) {
                this.paymentTray.setData('totalText', totalText);
            }
        } else {
            this.paymentTray = this.add.container(300, 600);
            this.paymentArea = this.add.rectangle(300, 600, 200, 150, 0x000000, 0);
        }

        // Spawn coins
        this.spawnPlayerCoins();
    }

    private setupDebugger(): void {
        this.debugger = new SceneDebugger(this, 'ShopScene');
        // Register elements if needed
    }

    private setupPurchasePanel(): void {
        // Get purchase panel position and depth from layout override
        const panelLayout = this.sceneBuilder.getLayoutOverride('purchasePanel');

        const panelX = panelLayout?.x ?? 900;
        const panelY = panelLayout?.y ?? 120;
        const panelDepth = panelLayout?.depth ?? 25;

        // Create the container at the JSON-defined position
        // (We create our own because we need to add dynamic children)
        this.purchasePanel = this.add.container(panelX, panelY);
        this.purchasePanel.setDepth(panelDepth);
        this.purchasePanel.setVisible(false);

        // Background
        const bg = this.add.rectangle(0, 0, 280, 80, 0x2a2a1a, 0.95)
            .setStrokeStyle(3, 0x8a7a6a);
        this.purchasePanel.add(bg);

        // Item name - relative position within the container
        const nameText = this.add.text(-100, -20, '', {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffd700',
            fontStyle: 'bold',
        }).setOrigin(0, 0.5);
        this.purchasePanel.add(nameText);
        this.purchasePanel.setData('nameText', nameText);

        // Price - relative position within the container
        const priceText = this.add.text(-100, 10, '', {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffaa00',
        }).setOrigin(0, 0.5);
        this.purchasePanel.add(priceText);
        this.purchasePanel.setData('priceText', priceText);

        // Item icon - relative position within the container
        const itemIcon = this.add.image(100, 0, 'shop-swords-sheet', 0)
            .setDisplaySize(50, 60);
        this.purchasePanel.add(itemIcon);
        this.purchasePanel.setData('itemIcon', itemIcon);
    }

    private setupCategoryTabs(): void {
        const categories: { key: ShopCategory; elementId: string }[] = [
            { key: 'weapon', elementId: 'tabWeapons' },
            { key: 'shield', elementId: 'tabShields' },
        ];

        categories.forEach((cat) => {
            // Get tab from SceneBuilder (created as button Container)
            const tabElement = this.sceneBuilder.get(cat.elementId) as Phaser.GameObjects.Container;

            if (tabElement) {
                // Tab created by SceneBuilder, set up interactions
                const bg = (tabElement.list as Phaser.GameObjects.GameObject[])[0] as Phaser.GameObjects.Rectangle;
                tabElement.setData('bg', bg);

                if (bg) {
                    bg.on('pointerdown', () => {
                        this.showCategory(cat.key);
                    });
                    bg.on('pointerover', () => {
                        if (this.currentCategory !== cat.key) bg.setFillStyle(0x7a6a5a);
                    });
                    bg.on('pointerout', () => {
                        if (this.currentCategory !== cat.key) bg.setFillStyle(0x5a4a3a);
                    });
                }

                this.categoryTabs.set(cat.key, tabElement);
            }
        });
    }

    private setupItemSlots(): void {
        const slotSize = 70;

        for (let i = 0; i < 4; i++) {
            const slotId = `itemSlot${i}`;
            const slotElement = this.sceneBuilder.get(slotId) as Phaser.GameObjects.Container;

            if (slotElement) {
                // Slot created by SceneBuilder, add icon and set up interactions
                const bg = (slotElement.list as Phaser.GameObjects.GameObject[])[0] as Phaser.GameObjects.Rectangle;

                const icon = this.add.image(0, 0, 'shop-swords-sheet', 0)
                    .setDisplaySize(slotSize - 10, slotSize - 10)
                    .setVisible(false);
                slotElement.add(icon);

                slotElement.setData('bg', bg);
                slotElement.setData('icon', icon);
                slotElement.setData('index', i);

                if (bg) {
                    bg.on('pointerdown', () => {
                        this.onSlotClicked(i);
                    });
                    bg.on('pointerover', () => bg.setStrokeStyle(3, 0xffd700));
                    bg.on('pointerout', () => bg.setStrokeStyle(2, 0x6a6a5a));
                }

                this.itemSlots.push(slotElement);
            }
        }
    }

    private spawnPlayerCoins(): void {
        // Clear existing coins
        this.playerCoins.forEach(coin => coin.destroy());
        this.playerCoins = [];

        const player = this.gameState.getPlayer();

        // Fallback to relative positioning from table
        const spawnX = this.tableContainer ? this.tableContainer.x - 100 : 838;
        const spawnY = this.tableContainer ? this.tableContainer.y - 50 : 582;

        // Spawn coins for each type within the spawn area
        let coinIndex = 0;
        COIN_TYPES.forEach(coinType => {
            const count = player.coins[coinType.key];
            for (let i = 0; i < count; i++) {
                // Arrange coins in a grid pattern within spawn area
                const col = coinIndex % 6;
                const row = Math.floor(coinIndex / 6);
                const x = spawnX + col * 35 + Phaser.Math.Between(-5, 5);
                const y = spawnY + row * 35 + Phaser.Math.Between(-5, 5);

                const coin = this.createDraggableCoin(x, y, coinType);
                this.playerCoins.push(coin);
                coinIndex++;
            }
        });
    }

    private createDraggableCoin(x: number, y: number, coinType: CoinType): DraggableCoin {
        const coin = this.add.image(x, y, 'shop-coins-sheet', coinType.frame) as DraggableCoin;
        coin.setDisplaySize(40, 40);
        coin.setInteractive({ useHandCursor: true });
        this.input.setDraggable(coin);  // Call separately for reliable drag behavior
        coin.coinType = coinType;
        coin.originX = x;
        coin.originY = y;
        coin.inPaymentArea = false;
        coin.setDepth(100);
        return coin;
    }

    private setupDragHandling(): void {
        this.input.on('dragstart', (pointer: Phaser.Input.Pointer, gameObject: DraggableCoin) => {
            this.draggedCoin = gameObject;
            gameObject.setDepth(200);
            gameObject.setDisplaySize(48, 48);  // Use setDisplaySize instead of setScale
        });

        this.input.on('drag', (pointer: Phaser.Input.Pointer, gameObject: DraggableCoin, dragX: number, dragY: number) => {
            gameObject.x = dragX;
            gameObject.y = dragY;
        });

        this.input.on('dragend', (pointer: Phaser.Input.Pointer, gameObject: DraggableCoin) => {
            gameObject.setDisplaySize(40, 40);  // Use setDisplaySize instead of setScale
            gameObject.setDepth(100);

            // Check if dropped in payment area or table area
            const inPayment = this.paymentArea.getBounds().contains(gameObject.x, gameObject.y);
            const inTable = this.tableArea.getBounds().contains(gameObject.x, gameObject.y);

            if (inPayment && !gameObject.inPaymentArea) {
                // Move to payment area
                gameObject.inPaymentArea = true;
                this.paymentCoins.push(gameObject);
                const idx = this.playerCoins.indexOf(gameObject);
                if (idx > -1) this.playerCoins.splice(idx, 1);
            } else if (!inPayment && gameObject.inPaymentArea) {
                // Return from payment to table
                gameObject.inPaymentArea = false;
                this.playerCoins.push(gameObject);
                const idx = this.paymentCoins.indexOf(gameObject);
                if (idx > -1) this.paymentCoins.splice(idx, 1);

                // If dropped on table, keep position; otherwise snap back
                if (inTable) {
                    gameObject.originX = gameObject.x;
                    gameObject.originY = gameObject.y;
                } else {
                    gameObject.x = gameObject.originX;
                    gameObject.y = gameObject.originY;
                }
            } else if (!inPayment && !gameObject.inPaymentArea) {
                // Coin is on table - check if dropped on table or outside
                if (inTable) {
                    // Keep position and update origin
                    gameObject.originX = gameObject.x;
                    gameObject.originY = gameObject.y;
                } else {
                    // Snap back to origin if dropped outside
                    gameObject.x = gameObject.originX;
                    gameObject.y = gameObject.originY;
                }
            }

            this.updatePaymentTotal();
            this.draggedCoin = null;
        });
    }

    private updatePaymentTotal(): void {
        let total = 0;
        this.paymentCoins.forEach(coin => {
            total += coin.coinType.value;
        });

        const totalText = this.paymentTray.getData('totalText') as Phaser.GameObjects.Text;
        if (totalText) {
            totalText.setText(`CELKEM: ${total} měďáků`);
        }
    }

    private getPaymentTotal(): number {
        let total = 0;
        this.paymentCoins.forEach(coin => {
            total += coin.coinType.value;
        });
        return total;
    }

    private showCategory(category: ShopCategory): void {
        this.currentCategory = category;
        this.selectedItem = null;
        this.purchasePanel.setVisible(false);

        // Update tab visuals
        this.categoryTabs.forEach((container, key) => {
            const bg = container.getData('bg') as Phaser.GameObjects.Rectangle;
            bg.setFillStyle(key === category ? 0x8a7a6a : 0x5a4a3a);
        });

        // Get items for this category
        const itemType: ItemType = category;
        const items = this.allItems.filter(item => item.type === itemType);

        // Update item slots
        this.itemSlots.forEach((slot, index) => {
            const icon = slot.getData('icon') as Phaser.GameObjects.Image | undefined;
            const item = items[index];

            if (!icon) {
                console.warn(`[ShopScene] No icon found for slot ${index}`);
                return;
            }

            if (item && item.spriteKey) {
                icon.setTexture(item.spriteKey, item.iconFrame);
                icon.setVisible(true);
                icon.setDisplaySize(category === 'weapon' ? 45 : 55, category === 'weapon' ? 60 : 55);
                slot.setData('item', item);
            } else {
                icon.setVisible(false);
                slot.setData('item', null);
            }
        });
    }

    private onSlotClicked(index: number): void {
        const slot = this.itemSlots[index];
        const item = slot.getData('item') as ItemDefinition | null;

        if (!item) return;

        // Check if already owned
        if (this.isItemOwned(item)) {
            this.showMessage('JIŽ VLASTNÍŠ!', '#aaaaaa');
            return;
        }

        this.selectedItem = item;
        this.updatePurchasePanel();
        this.purchasePanel.setVisible(true);
        // Don't reset coins when selecting items - let player keep their payment
    }

    private updatePurchasePanel(): void {
        if (!this.selectedItem) return;

        const nameText = this.purchasePanel.getData('nameText') as Phaser.GameObjects.Text;
        const priceText = this.purchasePanel.getData('priceText') as Phaser.GameObjects.Text;
        const itemIcon = this.purchasePanel.getData('itemIcon') as Phaser.GameObjects.Image;

        nameText.setText(this.selectedItem.name.toUpperCase());
        priceText.setText(`CENA: ${this.selectedItem.price} měďáků`);

        if (this.selectedItem.spriteKey) {
            itemIcon.setTexture(this.selectedItem.spriteKey, this.selectedItem.iconFrame);
            itemIcon.setVisible(true);
        }
    }

    private isItemOwned(item: ItemDefinition): boolean {
        const player = this.gameState.getPlayer();
        switch (item.type) {
            case 'weapon': return player.equippedWeapon === item.id;
            case 'shield': return player.equippedShield === item.id;
            default: return false;
        }
    }

    private attemptPurchase(): void {
        if (!this.selectedItem) return;

        const paymentTotal = this.getPaymentTotal();
        const price = this.selectedItem.price;

        if (paymentTotal === price) {
            // Correct payment!
            this.completePurchase();
        } else {
            // Wrong payment - just show message and return coins
            this.showMessage('ŠPATNÁ ČÁSTKA!', '#ff6666');
            this.returnAllCoins();
        }
    }

    private completePurchase(): void {
        if (!this.selectedItem) return;

        const player = this.gameState.getPlayer();

        // Remove spent coins from player's inventory
        this.paymentCoins.forEach(coin => {
            player.coins[coin.coinType.key]--;
            coin.destroy();
        });
        this.paymentCoins = [];

        // Equip item
        this.equipItem(this.selectedItem);

        // Save
        this.gameState.save();

        // Show success
        this.showMessage('KOUPENO!', '#aaffaa');

        // Reset
        this.selectedItem = null;
        this.purchasePanel.setVisible(false);
        this.spawnPlayerCoins();
        this.updatePaymentTotal();
        this.showCategory(this.currentCategory);
    }

    private returnAllCoins(): void {
        this.paymentCoins.forEach(coin => {
            coin.inPaymentArea = false;
            this.tweens.add({
                targets: coin,
                x: coin.originX,
                y: coin.originY,
                duration: 300,
                ease: 'Back.out',
            });
            this.playerCoins.push(coin);
        });
        this.paymentCoins = [];
        this.updatePaymentTotal();
    }

    private equipItem(item: ItemDefinition): void {
        const player = this.gameState.getPlayer();

        switch (item.type) {
            case 'weapon':
                // Remove old weapon bonus
                if (player.equippedWeapon) {
                    const oldWeapon = this.allItems.find(i => i.id === player.equippedWeapon);
                    if (oldWeapon?.attackBonus) {
                        player.attack -= oldWeapon.attackBonus;
                    }
                }
                player.equippedWeapon = item.id;
                if (item.attackBonus) {
                    player.attack += item.attackBonus;
                }
                break;

            case 'shield':
                player.equippedShield = item.id;
                break;
        }
    }

    private showMessage(text: string, color: string): void {
        const msg = this.add.text(640, 300, text, {
            fontSize: '32px',
            fontFamily: 'Arial, sans-serif',
            color: color,
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5).setDepth(400);

        this.tweens.add({
            targets: msg,
            alpha: 0,
            y: msg.y - 50,
            duration: 1500,
            onComplete: () => msg.destroy(),
        });
    }
}
