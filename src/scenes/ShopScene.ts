import Phaser from 'phaser';
import { ItemDefinition, ItemType } from '../types';
import { GameStateManager } from '../systems/GameStateManager';
import { MathEngine } from '../systems/MathEngine';
import { MathBoard } from '../ui/MathBoard';

type ShopCategory = 'weapon' | 'shield' | 'helmet';

export class ShopScene extends Phaser.Scene {
    private gameState!: GameStateManager;
    private allItems!: ItemDefinition[];
    private currentCategory: ShopCategory = 'weapon';
    private selectedItem: ItemDefinition | null = null;

    // UI Elements
    private goldText!: Phaser.GameObjects.Text;
    private categoryTabs: Map<ShopCategory, Phaser.GameObjects.Container> = new Map();
    private itemSlots: Phaser.GameObjects.Container[] = [];
    private detailPanel!: Phaser.GameObjects.Container;
    private inventoryContainer!: Phaser.GameObjects.Container;
    private mathBoard!: MathBoard;
    private mathEngine!: MathEngine;
    private isDiscountMode: boolean = false;
    private discountPrice: number = 0;
    private isSellMode: boolean = false;

    constructor() {
        super({ key: 'ShopScene' });
    }

    create(): void {
        this.gameState = GameStateManager.getInstance();
        this.allItems = this.cache.json.get('items') as ItemDefinition[];
        this.mathEngine = new MathEngine(this.registry);

        // Background
        this.add.image(400, 300, 'shop-interior').setDisplaySize(800, 600);

        // Player inventory (left side)
        this.createPlayerInventory();

        // Gold display
        this.createGoldDisplay();

        // Close button
        this.createCloseButton();

        // Category tabs
        this.createCategoryTabs();

        // Item grid
        this.createItemGrid();

        // Detail panel (hidden initially)
        this.createDetailPanel();

        // Math board for discount
        this.mathBoard = new MathBoard(this, this.onDiscountAnswer.bind(this));

        // Show initial category
        this.showCategory('weapon');
    }

    private createPlayerInventory(): void {
        // Create container for inventory (so we can refresh it)
        this.inventoryContainer = this.add.container(0, 0);
        this.refreshPlayerInventory();
    }

    private refreshPlayerInventory(): void {
        // Clear existing content
        this.inventoryContainer.removeAll(true);

        const player = this.gameState.getPlayer();

        // Inventory background
        const invBg = this.add.rectangle(130, 320, 200, 280, 0x000000, 0.7)
            .setStrokeStyle(2, 0x8a7a6a);
        this.inventoryContainer.add(invBg);

        // Title
        const title = this.add.text(130, 195, 'VÝBAVA (PRODEJ)', {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffd700',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        this.inventoryContainer.add(title);

        // Equipment slots
        const slotY = 250;
        const slotSpacing = 70;

        // Weapon slot
        this.createEquipmentSlot(130, slotY, 'MEČ', player.equippedWeapon, 'weapon');

        // Shield slot
        this.createEquipmentSlot(130, slotY + slotSpacing, 'ŠTÍT', player.equippedShield, 'shield');

        // Helmet slot
        this.createEquipmentSlot(130, slotY + slotSpacing * 2, 'HELMA', player.equippedHelmet, 'helmet');

        // Stats display
        const atkText = this.add.text(130, 440, `ÚTOK: ${player.attack}`, {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaffaa',
        }).setOrigin(0.5);
        this.inventoryContainer.add(atkText);

        const defText = this.add.text(130, 460, `OBRANA: ${player.defense}`, {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#88aaff',
        }).setOrigin(0.5);
        this.inventoryContainer.add(defText);
    }

    private createEquipmentSlot(x: number, y: number, label: string, itemId: string | null, type: string): void {
        // Slot background
        const slotBg = this.add.rectangle(x, y, 60, 60, 0x3a3a2a, 0.8)
            .setStrokeStyle(2, 0x6a6a5a);
        this.inventoryContainer.add(slotBg);

        // Label
        const labelText = this.add.text(x, y - 40, label, {
            fontSize: '12px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaaaaa',
        }).setOrigin(0.5);
        this.inventoryContainer.add(labelText);

        // Item icon if equipped
        if (itemId) {
            const item = this.allItems.find(i => i.id === itemId);
            if (item && item.spriteKey) {
                const icon = this.add.image(x, y, item.spriteKey, item.iconFrame);
                if (type === 'weapon') {
                    icon.setDisplaySize(40, 55);
                } else {
                    icon.setDisplaySize(50, 50);
                }
                this.inventoryContainer.add(icon);

                // Make slot clickable for selling
                slotBg.setInteractive({ useHandCursor: true });
                slotBg.on('pointerdown', () => this.onEquippedItemClicked(item));
                slotBg.on('pointerover', () => slotBg.setStrokeStyle(3, 0xffaa00));
                slotBg.on('pointerout', () => slotBg.setStrokeStyle(2, 0x6a6a5a));
            }
        } else {
            // Empty slot indicator
            const empty = this.add.text(x, y, '—', {
                fontSize: '24px',
                fontFamily: 'Arial, sans-serif',
                color: '#555555',
            }).setOrigin(0.5);
            this.inventoryContainer.add(empty);
        }
    }

    private onEquippedItemClicked(item: ItemDefinition): void {
        this.selectedItem = item;
        this.isSellMode = true;
        this.updateDetailPanel();
        this.detailPanel.setVisible(true);
    }

    private createGoldDisplay(): void {
        const player = this.gameState.getPlayer();
        const bg = this.add.rectangle(100, 30, 160, 40, 0x000000, 0.7).setStrokeStyle(2, 0xffd700);
        this.goldText = this.add.text(100, 30, `${player.gold} ZL`, {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffd700',
            fontStyle: 'bold',
        }).setOrigin(0.5);
    }

    private createCloseButton(): void {
        const btn = this.add.text(760, 30, '✕', {
            fontSize: '32px',
            fontFamily: 'Arial, sans-serif',
            color: '#ff6666',
            fontStyle: 'bold',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => btn.setColor('#ffffff'));
        btn.on('pointerout', () => btn.setColor('#ff6666'));
        btn.on('pointerdown', () => this.scene.start('TownScene'));
    }

    private createCategoryTabs(): void {
        const categories: { key: ShopCategory; label: string }[] = [
            { key: 'weapon', label: 'MEČE' },
            { key: 'shield', label: 'ŠTÍTY' },
            { key: 'helmet', label: 'HELMY' },
        ];

        const startX = 500;
        const tabWidth = 90;

        categories.forEach((cat, index) => {
            const x = startX + index * (tabWidth + 10);
            const container = this.add.container(x, 80);

            const bg = this.add.rectangle(0, 0, tabWidth, 35, 0x5a4a3a)
                .setStrokeStyle(2, 0x8a7a6a)
                .setInteractive({ useHandCursor: true });

            const text = this.add.text(0, 0, cat.label, {
                fontSize: '16px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff',
                fontStyle: 'bold',
            }).setOrigin(0.5);

            container.add([bg, text]);
            container.setData('bg', bg);
            container.setData('text', text);

            bg.on('pointerdown', () => this.showCategory(cat.key));
            bg.on('pointerover', () => {
                if (this.currentCategory !== cat.key) {
                    bg.setFillStyle(0x7a6a5a);
                }
            });
            bg.on('pointerout', () => {
                if (this.currentCategory !== cat.key) {
                    bg.setFillStyle(0x5a4a3a);
                }
            });

            this.categoryTabs.set(cat.key, container);
        });
    }

    private createItemGrid(): void {
        const startX = 470;
        const startY = 150;
        const slotSize = 80;
        const padding = 10;

        for (let i = 0; i < 4; i++) {
            const x = startX + (i % 4) * (slotSize + padding);
            const y = startY;

            const container = this.add.container(x, y);

            const bg = this.add.rectangle(0, 0, slotSize, slotSize, 0x3a3a2a, 0.8)
                .setStrokeStyle(2, 0x6a6a5a)
                .setInteractive({ useHandCursor: true });

            const icon = this.add.image(0, 0, 'shop-swords', 0)
                .setDisplaySize(slotSize - 10, slotSize - 10)
                .setVisible(false);

            container.add([bg, icon]);
            container.setData('bg', bg);
            container.setData('icon', icon);
            container.setData('index', i);

            bg.on('pointerdown', () => this.onSlotClicked(i));
            bg.on('pointerover', () => bg.setStrokeStyle(3, 0xffd700));
            bg.on('pointerout', () => bg.setStrokeStyle(2, 0x6a6a5a));

            this.itemSlots.push(container);
        }
    }

    private createDetailPanel(): void {
        this.detailPanel = this.add.container(580, 350);
        this.detailPanel.setVisible(false);

        // Background
        const bg = this.add.rectangle(0, 0, 280, 200, 0x2a2a1a, 0.95)
            .setStrokeStyle(3, 0x8a7a6a);
        this.detailPanel.add(bg);

        // Item name
        const nameText = this.add.text(0, -70, '', {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffd700',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        this.detailPanel.add(nameText);
        this.detailPanel.setData('nameText', nameText);

        // Item stats
        const statsText = this.add.text(0, -35, '', {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaffaa',
        }).setOrigin(0.5);
        this.detailPanel.add(statsText);
        this.detailPanel.setData('statsText', statsText);

        // Price
        const priceText = this.add.text(0, 0, '', {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
        }).setOrigin(0.5);
        this.detailPanel.add(priceText);
        this.detailPanel.setData('priceText', priceText);

        // Buy button
        const buyBtn = this.add.rectangle(-50, 50, 100, 40, 0x44aa44)
            .setStrokeStyle(2, 0x66cc66)
            .setInteractive({ useHandCursor: true });
        const buyText = this.add.text(-50, 50, 'KOUPIT', {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        this.detailPanel.add([buyBtn, buyText]);
        this.detailPanel.setData('buyBtn', buyBtn);

        buyBtn.on('pointerdown', () => this.buyItem(false));
        buyBtn.on('pointerover', () => buyBtn.setFillStyle(0x55bb55));
        buyBtn.on('pointerout', () => buyBtn.setFillStyle(0x44aa44));

        // Discount button
        const discountBtn = this.add.rectangle(60, 50, 100, 40, 0x4488cc)
            .setStrokeStyle(2, 0x66aaee)
            .setInteractive({ useHandCursor: true });
        const discountText = this.add.text(60, 50, 'SLEVA?', {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        this.detailPanel.add([discountBtn, discountText]);
        this.detailPanel.setData('discountBtn', discountBtn);

        discountBtn.on('pointerdown', () => this.startDiscountChallenge());
        discountBtn.on('pointerover', () => discountBtn.setFillStyle(0x5599dd));
        discountBtn.on('pointerout', () => discountBtn.setFillStyle(0x4488cc));

        // Sell button (for selling equipped items)
        const sellBtn = this.add.rectangle(0, 50, 120, 40, 0xcc6644)
            .setStrokeStyle(2, 0xee8866)
            .setInteractive({ useHandCursor: true });
        const sellText = this.add.text(0, 50, 'PRODAT', {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        this.detailPanel.add([sellBtn, sellText]);
        this.detailPanel.setData('sellBtn', sellBtn);
        this.detailPanel.setData('sellText', sellText);

        sellBtn.on('pointerdown', () => this.sellItem());
        sellBtn.on('pointerover', () => sellBtn.setFillStyle(0xdd7755));
        sellBtn.on('pointerout', () => sellBtn.setFillStyle(0xcc6644));

        // Status message
        const statusText = this.add.text(0, 85, '', {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffaaaa',
        }).setOrigin(0.5);
        this.detailPanel.add(statusText);
        this.detailPanel.setData('statusText', statusText);
    }

    private showCategory(category: ShopCategory): void {
        this.currentCategory = category;
        this.selectedItem = null;
        this.detailPanel.setVisible(false);

        // Update tab visuals
        this.categoryTabs.forEach((container, key) => {
            const bg = container.getData('bg') as Phaser.GameObjects.Rectangle;
            if (key === category) {
                bg.setFillStyle(0x8a7a6a);
            } else {
                bg.setFillStyle(0x5a4a3a);
            }
        });

        // Get items for this category
        const itemType: ItemType = category;
        const items = this.allItems.filter(item => item.type === itemType);

        // Update item slots
        this.itemSlots.forEach((slot, index) => {
            const icon = slot.getData('icon') as Phaser.GameObjects.Image;
            const item = items[index];

            if (item && item.spriteKey) {
                icon.setTexture(item.spriteKey, item.iconFrame);
                icon.setVisible(true);
                // Scale based on item type
                if (category === 'weapon') {
                    icon.setDisplaySize(50, 70);
                } else {
                    icon.setDisplaySize(60, 60);
                }
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

        this.selectedItem = item;
        this.isSellMode = false;
        this.updateDetailPanel();
        this.detailPanel.setVisible(true);
    }

    private updateDetailPanel(): void {
        if (!this.selectedItem) return;

        const item = this.selectedItem;
        const player = this.gameState.getPlayer();

        const nameText = this.detailPanel.getData('nameText') as Phaser.GameObjects.Text;
        const statsText = this.detailPanel.getData('statsText') as Phaser.GameObjects.Text;
        const priceText = this.detailPanel.getData('priceText') as Phaser.GameObjects.Text;
        const statusText = this.detailPanel.getData('statusText') as Phaser.GameObjects.Text;
        const buyBtn = this.detailPanel.getData('buyBtn') as Phaser.GameObjects.Rectangle;
        const discountBtn = this.detailPanel.getData('discountBtn') as Phaser.GameObjects.Rectangle;
        const sellBtn = this.detailPanel.getData('sellBtn') as Phaser.GameObjects.Rectangle;
        const sellText = this.detailPanel.getData('sellText') as Phaser.GameObjects.Text;

        nameText.setText(item.name.toUpperCase());
        statsText.setText(item.description.toUpperCase());

        if (this.isSellMode) {
            // Sell mode - show sell price (half of original)
            const sellPrice = Math.floor(item.price / 2);
            priceText.setText(`PRODEJ: ${sellPrice} ZL`);
            priceText.setColor('#ffaa66');
            statusText.setText('');

            // Show only sell button
            buyBtn.setVisible(false);
            discountBtn.setVisible(false);
            sellBtn.setVisible(true);
            sellText.setVisible(true);
            sellBtn.setFillStyle(0xcc6644);
            sellBtn.setInteractive({ useHandCursor: true });
        } else {
            // Buy mode
            priceText.setText(`CENA: ${item.price} ZL`);
            priceText.setColor('#ffffff');

            // Hide sell button
            sellBtn.setVisible(false);
            sellText.setVisible(false);

            // Check if player owns this item
            const isOwned = this.isItemOwned(item);
            const canAfford = player.gold >= item.price;

            if (isOwned) {
                statusText.setText('JIŽ VLASTNÍŠ');
                statusText.setColor('#aaaaaa');
                buyBtn.setVisible(false);
                discountBtn.setVisible(false);
            } else if (!canAfford) {
                statusText.setText('NEDOSTATEK ZLATA');
                statusText.setColor('#ffaaaa');
                buyBtn.setVisible(true);
                discountBtn.setVisible(true);
                buyBtn.setFillStyle(0x666666);
                buyBtn.disableInteractive();
                discountBtn.setFillStyle(0x666666);
                discountBtn.disableInteractive();
            } else {
                statusText.setText('');
                buyBtn.setVisible(true);
                discountBtn.setVisible(true);
                buyBtn.setFillStyle(0x44aa44);
                buyBtn.setInteractive({ useHandCursor: true });
                discountBtn.setFillStyle(0x4488cc);
                discountBtn.setInteractive({ useHandCursor: true });
            }
        }
    }

    private isItemOwned(item: ItemDefinition): boolean {
        const player = this.gameState.getPlayer();

        switch (item.type) {
            case 'weapon':
                return player.equippedWeapon === item.id;
            case 'shield':
                return player.equippedShield === item.id;
            case 'helmet':
                return player.equippedHelmet === item.id;
            default:
                return false;
        }
    }

    private buyItem(withDiscount: boolean): void {
        if (!this.selectedItem) return;

        const item = this.selectedItem;
        const player = this.gameState.getPlayer();
        const price = withDiscount ? this.discountPrice : item.price;

        if (player.gold < price) return;

        // Deduct gold
        player.gold -= price;
        this.goldText.setText(`${player.gold} ZL`);

        // Equip item and apply stats
        this.equipItem(item);

        // Save
        this.gameState.save();

        // Update UI
        this.updateDetailPanel();
        this.refreshPlayerInventory();

        // Show feedback
        const statusText = this.detailPanel.getData('statusText') as Phaser.GameObjects.Text;
        statusText.setText(withDiscount ? 'KOUPENO SE SLEVOU!' : 'KOUPENO!');
        statusText.setColor('#aaffaa');
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
                // Apply new weapon
                player.equippedWeapon = item.id;
                if (item.attackBonus) {
                    player.attack += item.attackBonus;
                }
                break;

            case 'shield':
                player.equippedShield = item.id;
                // Shield doesn't add direct stats, it's used in battle
                break;

            case 'helmet':
                // Remove old helmet bonus
                if (player.equippedHelmet) {
                    const oldHelmet = this.allItems.find(i => i.id === player.equippedHelmet);
                    if (oldHelmet?.defenseBonus) {
                        player.defense -= oldHelmet.defenseBonus;
                    }
                }
                // Apply new helmet
                player.equippedHelmet = item.id;
                if (item.defenseBonus) {
                    player.defense += item.defenseBonus;
                }
                break;
        }
    }

    private sellItem(): void {
        if (!this.selectedItem) return;

        const item = this.selectedItem;
        const player = this.gameState.getPlayer();
        const sellPrice = Math.floor(item.price / 2);

        // Unequip item and remove bonuses
        switch (item.type) {
            case 'weapon':
                if (player.equippedWeapon === item.id) {
                    if (item.attackBonus) {
                        player.attack -= item.attackBonus;
                    }
                    player.equippedWeapon = null;
                }
                break;

            case 'shield':
                if (player.equippedShield === item.id) {
                    player.equippedShield = null;
                }
                break;

            case 'helmet':
                if (player.equippedHelmet === item.id) {
                    if (item.defenseBonus) {
                        player.defense -= item.defenseBonus;
                    }
                    player.equippedHelmet = null;
                }
                break;
        }

        // Give gold
        player.gold += sellPrice;
        this.goldText.setText(`${player.gold} ZL`);

        // Save
        this.gameState.save();

        // Show feedback
        const statusText = this.detailPanel.getData('statusText') as Phaser.GameObjects.Text;
        statusText.setText(`PRODÁNO ZA ${sellPrice} ZL!`);
        statusText.setColor('#aaffaa');

        // Hide detail panel and refresh inventory
        this.time.delayedCall(800, () => {
            this.detailPanel.setVisible(false);
            this.selectedItem = null;
            this.isSellMode = false;
            this.refreshPlayerInventory();
        });
    }

    private startDiscountChallenge(): void {
        if (!this.selectedItem) return;

        this.isDiscountMode = true;
        this.discountPrice = Math.floor(this.selectedItem.price * 0.85); // 15% discount

        const problem = this.mathEngine.generateProblem();
        this.mathBoard.show(problem);

        // Hide detail panel during math
        this.detailPanel.setVisible(false);
    }

    private onDiscountAnswer(isCorrect: boolean): void {
        this.mathBoard.hide();
        this.mathEngine.recordResult(isCorrect);

        if (isCorrect && this.selectedItem) {
            // Show discounted price and buy
            const priceText = this.detailPanel.getData('priceText') as Phaser.GameObjects.Text;
            priceText.setText(`CENA: ${this.discountPrice} ZL (SLEVA!)`);
            priceText.setColor('#aaffaa');

            this.buyItem(true);
        } else {
            // Failed - show detail panel again
            const statusText = this.detailPanel.getData('statusText') as Phaser.GameObjects.Text;
            statusText.setText('ŠPATNĚ! ŽÁDNÁ SLEVA.');
            statusText.setColor('#ffaaaa');
        }

        this.detailPanel.setVisible(true);
        this.isDiscountMode = false;
    }
}
