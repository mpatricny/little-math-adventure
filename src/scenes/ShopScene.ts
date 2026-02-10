import Phaser from 'phaser';
import { ItemDefinition, ItemType } from '../types';
import { GameStateManager } from '../systems/GameStateManager';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { ManaSystem } from '../systems/ManaSystem';
import { SceneDebugger } from '../systems/SceneDebugger';
import { SceneBuilder } from '../systems/SceneBuilder';
import { LocalizationService } from '../systems/LocalizationService';

// Coin type definitions
interface CoinType {
    key: 'copper' | 'silver' | 'gold' | 'pouch';
    value: number;
    frame: number;  // Frame in coins.png spritesheet: 0=gold, 1=copper, 2=silver; -1=standalone image
    name: string;
}

// Frame mapping from coins.png spritesheet: 0=gold, 1=copper, 2=silver; -1=standalone coin-pouch
const COIN_TYPES: CoinType[] = [
    { key: 'copper', value: 1, frame: 1, name: 'Měďák' },
    { key: 'silver', value: 5, frame: 2, name: 'Stříbrňák' },
    { key: 'gold', value: 10, frame: 0, name: 'Zlaťák' },
    { key: 'pouch', value: 100, frame: -1, name: 'Váček' },
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
    private localization = LocalizationService.getInstance();
    private selectedItem: ItemDefinition | null = null;

    // UI Elements
    private itemSlots: Phaser.GameObjects.Image[] = [];
    private purchasePanel!: Phaser.GameObjects.Container;
    private tableContainer!: Phaser.GameObjects.Container;
    private paymentTray!: Phaser.GameObjects.Container;
    private paymentArea!: Phaser.GameObjects.Rectangle;
    private tableArea!: Phaser.GameObjects.Rectangle;

    // Coin management
    private playerCoins: DraggableCoin[] = [];
    private paymentCoins: DraggableCoin[] = [];
    private draggedCoin: DraggableCoin | null = null;

    // Item slot tracking (icon per container, for removal after purchase)
    private itemIcons: Map<string, Phaser.GameObjects.Image> = new Map();


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
        this.itemSlots = [];
        this.itemIcons = new Map();
        this.playerCoins = [];
        this.paymentCoins = [];
        this.draggedCoin = null;
        this.selectedItem = null;

        // Ensure coins are normalized with current algorithm (handles pre-pouch saves)
        ProgressionSystem.normalizeCoins(this.gameState.getPlayer());

        // Initialize SceneBuilder
        this.sceneBuilder = new SceneBuilder(this);

        // Register handlers before building
        this.sceneBuilder.registerHandler('onBuy', () => this.attemptPurchase());
        this.sceneBuilder.registerHandler('onBack', () => this.scene.start('TownScene'));

        this.sceneBuilder.buildScene();

        // Wire up "money mana" resource display
        this.setupResourceDisplay();

        // Get purchase panel from SceneBuilder and set up references
        this.setupPurchasePanel();

        // Get table elements
        const tablePouch = this.sceneBuilder.get('tablePouch') as Phaser.GameObjects.Image;
        const tableTop = this.sceneBuilder.get('tableTop') as Phaser.GameObjects.Image;
        const coinTray = this.sceneBuilder.get('coinTray') as Phaser.GameObjects.Image;

        // Setup areas based on positions
        this.setupAreas(tablePouch, tableTop, coinTray);

        // Fixed item display - labels and containers
        this.setupItemDisplay();

        // Create coin value legend
        this.createCoinLegend();

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

        // Payment area — use marker-2 from scene editor if available
        const dropZone = this.sceneBuilder.getMarker('marker-2');
        if (dropZone) {
            const centerX = dropZone.x + dropZone.width / 2;
            const centerY = dropZone.y + dropZone.height / 2;
            this.paymentTray = this.add.container(centerX, centerY);
            this.paymentArea = this.add.rectangle(centerX, centerY, dropZone.width, dropZone.height, 0x000000, 0);
        } else if (coinTray) {
            // Fallback to coinTray-based positioning
            this.paymentTray = this.add.container(coinTray.x, coinTray.y);
            const trayWidth = 280 * coinTray.scale;
            const trayHeight = 200 * coinTray.scale;
            this.paymentArea = this.add.rectangle(coinTray.x, coinTray.y, trayWidth, trayHeight, 0x000000, 0);
        } else {
            this.paymentTray = this.add.container(300, 600);
            this.paymentArea = this.add.rectangle(300, 600, 200, 150, 0x000000, 0);
        }

        // Link total text to payment tray
        const totalText = this.sceneBuilder.get('labelTotal') as Phaser.GameObjects.Text;
        if (totalText) {
            this.paymentTray.setData('totalText', totalText);
        }

        // Spawn coins
        this.spawnPlayerCoins();
    }

    private createCoinLegend(): void {
        const marker = this.sceneBuilder.getMarker('marker-1');
        if (!marker) return;

        const centerX = marker.x + marker.width / 2;
        const startY = marker.y + marker.height / 2;
        const rowHeight = 50;
        const coins: { frame: number; texture?: string; text: string; color: string }[] = [
            { frame: 1, text: '= 1', color: '#cd7f32' },    // copper
            { frame: 2, text: '= 5', color: '#c0c0c0' },    // silver
            { frame: 0, text: '= 10', color: '#ffd700' },    // gold
            { frame: -1, texture: 'coin-pouch', text: '= 100', color: '#8b6914' },  // pouch
        ];

        coins.forEach((coin, i) => {
            const y = startY + (i - 1.5) * rowHeight;
            if (coin.frame === -1 && coin.texture) {
                this.add.image(centerX - 40, y, coin.texture)
                    .setDisplaySize(70, 70).setDepth(30);
            } else {
                this.add.image(centerX - 40, y, 'shop-coins-sheet', coin.frame)
                    .setDisplaySize(70, 70).setDepth(30);
            }
            this.add.text(centerX + 15, y, coin.text, {
                fontSize: '22px',
                fontFamily: 'Arial, sans-serif',
                color: coin.color,
                fontStyle: 'bold',
            }).setOrigin(0, 0.5).setDepth(30);
        });
    }

    private setupDebugger(): void {
        this.debugger = new SceneDebugger(this, 'ShopScene');
    }

    private setupResourceDisplay(): void {
        const player = this.gameState.getPlayer();
        const manaCount = ManaSystem.getMana(player);
        const coinsCount = ProgressionSystem.getTotalCoinValue(player.coins);

        const manaElement = this.sceneBuilder.get<Phaser.GameObjects.Container>('money mana');
        if (manaElement) {
            const textObjects = manaElement.getData('textObjects') as Map<string, { text: Phaser.GameObjects.Text }> | undefined;
            if (textObjects) {
                const manaTextEntry = textObjects.get('1770241846853-jfbnou0oe');
                if (manaTextEntry) {
                    manaTextEntry.text.setText(`${manaCount}`);
                }
                const coinsTextEntry = textObjects.get('1770241864666-yyygo6t26');
                if (coinsTextEntry) {
                    coinsTextEntry.text.setText(`${coinsCount}`);
                }
            }
        }
    }

    private updateResourceDisplay(): void {
        const player = this.gameState.getPlayer();
        const manaElement = this.sceneBuilder.get<Phaser.GameObjects.Container>('money mana');
        if (manaElement) {
            const textObjects = manaElement.getData('textObjects') as Map<string, { text: Phaser.GameObjects.Text }> | undefined;
            if (textObjects) {
                const manaTextEntry = textObjects.get('1770241846853-jfbnou0oe');
                manaTextEntry?.text.setText(`${ManaSystem.getMana(player)}`);
                const coinsTextEntry = textObjects.get('1770241864666-yyygo6t26');
                coinsTextEntry?.text.setText(`${ProgressionSystem.getTotalCoinValue(player.coins)}`);
            }
        }
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

    private setupItemDisplay(): void {
        this.localization.init(this);

        // Wire localized text onto label background images
        const labelSwords = this.sceneBuilder.get('shop-label') as Phaser.GameObjects.Image;
        const labelShields = this.sceneBuilder.get('shop-label_1') as Phaser.GameObjects.Image;

        if (labelSwords) {
            this.add.text(labelSwords.x, labelSwords.y, this.localization.t('items.categories.CAT_001'), {
                fontSize: '20px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff',
                fontStyle: 'bold',
            }).setOrigin(0.5).setDepth((labelSwords.depth ?? 0) + 1);
        }
        if (labelShields) {
            this.add.text(labelShields.x, labelShields.y, this.localization.t('items.categories.CAT_002'), {
                fontSize: '20px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff',
                fontStyle: 'bold',
            }).setOrigin(0.5).setDepth((labelShields.depth ?? 0) + 1);
        }

        // Define the 4 items to show: 2 swords + 2 shields
        const weapons = this.allItems.filter(item => item.type === 'weapon');
        const shields = this.allItems.filter(item => item.type === 'shield');

        const displayItems: { containerId: string; item: ItemDefinition | undefined; type: ItemType }[] = [
            { containerId: 'item-container', item: weapons[0], type: 'weapon' },
            { containerId: 'item-container-1', item: weapons[1], type: 'weapon' },
            { containerId: 'item-container-2', item: shields[0], type: 'shield' },
            { containerId: 'item-container-3', item: shields[1], type: 'shield' },
        ];

        for (const entry of displayItems) {
            const container = this.sceneBuilder.get(entry.containerId) as Phaser.GameObjects.Image;
            if (!container || !entry.item) continue;

            const item = entry.item;

            // Skip items the player already owns or has surpassed
            if (this.isItemObsolete(item)) continue;

            // Create item icon centered on the container image
            if (item.spriteKey) {
                const iconW = entry.type === 'weapon' ? 45 : 55;
                const iconH = entry.type === 'weapon' ? 60 : 55;
                const icon = this.add.image(container.x, container.y, item.spriteKey, item.iconFrame)
                    .setDisplaySize(iconW, iconH)
                    .setDepth((container.depth ?? 0) + 1);
                this.itemIcons.set(item.id, icon);
            }

            // Make container interactive
            container.setInteractive({ useHandCursor: true });
            container.on('pointerdown', () => this.onItemClicked(item));

            this.itemSlots.push(container);
        }
    }

    private spawnPlayerCoins(): void {
        // Clear existing coins
        this.playerCoins.forEach(coin => coin.destroy());
        this.playerCoins = [];

        const player = this.gameState.getPlayer();

        // Use marker-3 as the coin spawn area, fallback to table position
        const coinSpawnMarker = this.sceneBuilder.getMarker('marker-3');
        const spawnX = coinSpawnMarker ? coinSpawnMarker.x : (this.tableContainer ? this.tableContainer.x - 100 : 838);
        const spawnY = coinSpawnMarker ? coinSpawnMarker.y : (this.tableContainer ? this.tableContainer.y - 50 : 582);
        const spawnWidth = coinSpawnMarker ? coinSpawnMarker.width : 210;

        // Calculate grid columns based on spawn area width
        const coinSpacing = 40;
        const maxCols = Math.max(1, Math.floor(spawnWidth / coinSpacing));

        // Spawn coins for each type within the spawn area
        let coinIndex = 0;
        COIN_TYPES.forEach(coinType => {
            const count = player.coins[coinType.key];
            for (let i = 0; i < count; i++) {
                // Arrange coins in a grid pattern within spawn area
                const col = coinIndex % maxCols;
                const row = Math.floor(coinIndex / maxCols);
                const x = spawnX + col * coinSpacing + Phaser.Math.Between(-3, 3);
                const y = spawnY + row * coinSpacing + Phaser.Math.Between(-3, 3);

                const coin = this.createDraggableCoin(x, y, coinType);
                this.playerCoins.push(coin);
                coinIndex++;
            }
        });
    }

    private createDraggableCoin(x: number, y: number, coinType: CoinType): DraggableCoin {
        // Pouch uses standalone image; other coins use spritesheet
        const coin = (coinType.frame === -1
            ? this.add.image(x, y, 'coin-pouch')
            : this.add.image(x, y, 'shop-coins-sheet', coinType.frame)
        ) as DraggableCoin;
        const size = coinType.frame === -1 ? 50 : 40;
        coin.setDisplaySize(size, size);
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

    private onItemClicked(item: ItemDefinition): void {
        // Check if already owned
        if (this.isItemOwned(item)) {
            this.showMessage('JIŽ VLASTNÍŠ!', '#aaaaaa');
            return;
        }

        this.selectedItem = item;
        this.updatePurchasePanel();
        this.purchasePanel.setVisible(true);
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

    /**
     * Check if item is obsolete (player owns an equal or better item of the same type).
     * Weaker items disappear once the player buys a stronger one.
     */
    private isItemObsolete(item: ItemDefinition): boolean {
        const player = this.gameState.getPlayer();
        const equippedId = item.type === 'weapon' ? player.equippedWeapon
                         : item.type === 'shield' ? player.equippedShield
                         : null;
        if (!equippedId) return false;
        if (equippedId === item.id) return true;  // Owned
        // Compare price as proxy for power — if equipped item costs >= this one, it's obsolete
        const equippedItem = this.allItems.find(i => i.id === equippedId);
        return equippedItem ? equippedItem.price >= item.price : false;
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

        // Normalize coins after spending
        ProgressionSystem.normalizeCoins(player);

        // Equip item
        const purchasedItem = this.selectedItem;
        this.equipItem(purchasedItem);

        // Save
        this.gameState.save();

        // Remove icons for the purchased item and any now-obsolete items of the same type
        const sameTypeItems = this.allItems.filter(i => i.type === purchasedItem.type);
        for (const item of sameTypeItems) {
            if (this.isItemObsolete(item)) {
                const icon = this.itemIcons.get(item.id);
                if (icon) {
                    icon.destroy();
                    this.itemIcons.delete(item.id);
                }
            }
        }

        // Show success
        this.showMessage('KOUPENO!', '#aaffaa');

        // Reset
        this.selectedItem = null;
        this.purchasePanel.setVisible(false);
        this.spawnPlayerCoins();
        this.updatePaymentTotal();
        this.updateResourceDisplay();
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
