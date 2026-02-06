import Phaser from 'phaser';

/**
 * Content item for PictureDialog
 * Can be either an image/sprite or an icon
 */
export interface DialogContentItem {
    type: 'image' | 'sprite' | 'icon' | 'arrow';
    key?: string;           // Texture key for image/sprite
    frame?: number;         // Frame number for spritesheet
    scale?: number;         // Scale for this specific item
    text?: string;          // Text to display (for icons like arrows)
    tint?: number;          // Optional tint color
}

/**
 * Configuration for PictureDialog
 */
export interface PictureDialogConfig {
    x?: number;             // Center X position (default: screen center)
    y?: number;             // Center Y position (default: screen center)
    width?: number;         // Dialog width (default: auto based on content)
    height?: number;        // Dialog height (default: auto based on content)
    padding?: number;       // Internal padding (default: 40)
    depth?: number;         // Render depth (default: 1000)
    content: DialogContentItem[];  // Array of content to display horizontally
    showOverlay?: boolean;  // Show dark overlay behind dialog (default: true)
    overlayAlpha?: number;  // Overlay alpha (default: 0.7)
    tapText?: string;       // Text shown below content (default: localized "tap to continue")
    onDismiss?: () => void; // Callback when dialog is dismissed
}

/**
 * PictureDialog - Visual dialog for pre-reader storytelling
 *
 * This component displays images and icons in a horizontal row
 * inside a nine-slice frame. Designed for conveying meaning through
 * pictures rather than text, making it accessible to pre-readers.
 *
 * Key Features:
 * - Uses Frame Grey 9-slice for scalable dialog background
 * - Displays content horizontally (e.g., [😠 slime] → [⚔️] → [😊 slime])
 * - Dark overlay behind dialog for focus
 * - Tap anywhere to dismiss
 * - Callback on dismiss for chaining actions
 *
 * Usage:
 * ```typescript
 * const dialog = new PictureDialog(scene, {
 *     content: [
 *         { type: 'sprite', key: 'slime-sheet', frame: 0, tint: 0xff6666 },
 *         { type: 'arrow' },
 *         { type: 'image', key: 'fight-icon' },
 *         { type: 'arrow' },
 *         { type: 'sprite', key: 'slime-sheet', frame: 0, tint: 0x66ff66 },
 *     ],
 *     onDismiss: () => console.log('Dismissed!')
 * });
 * ```
 */
export class PictureDialog {
    private scene: Phaser.Scene;
    private container: Phaser.GameObjects.Container;
    private overlay: Phaser.GameObjects.Rectangle | null = null;
    private frame: Phaser.GameObjects.NineSlice | Phaser.GameObjects.Rectangle;
    private contentItems: Phaser.GameObjects.GameObject[] = [];
    private tapText: Phaser.GameObjects.Text | null = null;
    private onDismiss?: () => void;
    private isDestroyed = false;

    // Nine-slice frame texture key (Frame Grey 9 slice-cropped)
    private static readonly FRAME_TEXTURE = '991bb46f-0417-4c22-8e3e-04cea0a3079a';
    private static readonly FRAME_CONFIG = {
        leftWidth: 41,
        rightWidth: 57,
        topHeight: 45,
        bottomHeight: 50,
    };

    constructor(scene: Phaser.Scene, config: PictureDialogConfig) {
        this.scene = scene;
        this.onDismiss = config.onDismiss;

        const padding = config.padding ?? 40;
        const depth = config.depth ?? 1000;

        // Calculate content dimensions
        const { contentWidth, contentHeight, items } = this.createContentItems(config.content, padding);

        // Calculate dialog size
        const dialogWidth = config.width ?? contentWidth + padding * 2;
        const dialogHeight = config.height ?? contentHeight + padding * 2 + 40; // Extra for tap text

        // Position
        const x = config.x ?? 640;
        const y = config.y ?? 360;

        // Create container at position
        this.container = scene.add.container(x, y).setDepth(depth);

        // Create overlay if enabled (default: true)
        if (config.showOverlay !== false) {
            this.overlay = scene.add.rectangle(0, 0, 1280, 720, 0x000000, config.overlayAlpha ?? 0.7)
                .setOrigin(0.5)
                .setDepth(depth - 1)
                .setPosition(x, y);

            // Make overlay interactive to capture all clicks
            this.overlay.setInteractive();
        }

        // Create frame (nine-slice or fallback rectangle)
        this.frame = this.createFrame(dialogWidth, dialogHeight);
        this.container.add(this.frame);

        // Add content items to container
        this.positionContentItems(items, contentWidth, dialogHeight, padding);

        // Add tap text
        const tapTextContent = config.tapText ?? '[ klepni pro pokračování ]';
        this.tapText = scene.add.text(0, dialogHeight / 2 - 25, tapTextContent, {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaaaaa',
            fontStyle: 'italic',
        }).setOrigin(0.5);
        this.container.add(this.tapText);

        // Pulse animation for tap text
        scene.tweens.add({
            targets: this.tapText,
            alpha: 0.5,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        // Setup input to dismiss on tap
        this.setupInput();

        // Entrance animation
        this.playEntranceAnimation();
    }

    /**
     * Create the dialog frame (nine-slice or fallback)
     */
    private createFrame(width: number, height: number): Phaser.GameObjects.NineSlice | Phaser.GameObjects.Rectangle {
        // Try to create nine-slice if texture exists
        if (this.scene.textures.exists(PictureDialog.FRAME_TEXTURE)) {
            const config = PictureDialog.FRAME_CONFIG;
            return this.scene.add.nineslice(
                0, 0,
                PictureDialog.FRAME_TEXTURE,
                undefined,
                width, height,
                config.leftWidth, config.rightWidth,
                config.topHeight, config.bottomHeight
            ).setOrigin(0.5);
        }

        // Fallback: simple rectangle with border
        console.warn('[PictureDialog] Nine-slice texture not found, using fallback');
        const rect = this.scene.add.rectangle(0, 0, width, height, 0x333344)
            .setStrokeStyle(4, 0x666688)
            .setOrigin(0.5);
        return rect;
    }

    /**
     * Create content items from config (before positioning)
     */
    private createContentItems(
        content: DialogContentItem[],
        padding: number
    ): { contentWidth: number; contentHeight: number; items: Phaser.GameObjects.GameObject[] } {
        const items: Phaser.GameObjects.GameObject[] = [];
        let totalWidth = 0;
        let maxHeight = 0;
        const spacing = 20;

        content.forEach((item, index) => {
            let obj: Phaser.GameObjects.GameObject;
            let itemWidth = 0;
            let itemHeight = 0;

            switch (item.type) {
                case 'image':
                    if (item.key && this.scene.textures.exists(item.key)) {
                        const img = this.scene.add.image(0, 0, item.key);
                        const scale = item.scale ?? 0.5;
                        img.setScale(scale);
                        if (item.tint !== undefined) img.setTint(item.tint);
                        itemWidth = img.displayWidth;
                        itemHeight = img.displayHeight;
                        obj = img;
                    } else {
                        // Placeholder for missing image
                        obj = this.createPlaceholder('?');
                        itemWidth = itemHeight = 80;
                    }
                    break;

                case 'sprite':
                    if (item.key && this.scene.textures.exists(item.key)) {
                        const sprite = this.scene.add.sprite(0, 0, item.key, item.frame ?? 0);
                        const scale = item.scale ?? 0.8;
                        sprite.setScale(scale);
                        if (item.tint !== undefined) sprite.setTint(item.tint);
                        itemWidth = sprite.displayWidth;
                        itemHeight = sprite.displayHeight;
                        obj = sprite;
                    } else {
                        obj = this.createPlaceholder('S');
                        itemWidth = itemHeight = 80;
                    }
                    break;

                case 'arrow':
                    const arrow = this.scene.add.text(0, 0, '→', {
                        fontSize: '48px',
                        fontFamily: 'Arial, sans-serif',
                        color: '#88ccff',
                        fontStyle: 'bold',
                    }).setOrigin(0.5);
                    itemWidth = arrow.width;
                    itemHeight = arrow.height;
                    obj = arrow;
                    break;

                case 'icon':
                default:
                    const icon = this.scene.add.text(0, 0, item.text || '?', {
                        fontSize: '40px',
                        fontFamily: 'Arial, sans-serif',
                        color: '#ffffff',
                        fontStyle: 'bold',
                    }).setOrigin(0.5);
                    itemWidth = icon.width;
                    itemHeight = icon.height;
                    obj = icon;
                    break;
            }

            items.push(obj);
            totalWidth += itemWidth + (index > 0 ? spacing : 0);
            maxHeight = Math.max(maxHeight, itemHeight);
        });

        // Store item widths for positioning
        (this as any)._itemWidths = items.map((item, i) => {
            const config = content[i];
            if (config.type === 'arrow') return 48;
            if (config.type === 'icon') return 40;
            if (item instanceof Phaser.GameObjects.Image) return (item as Phaser.GameObjects.Image).displayWidth;
            if (item instanceof Phaser.GameObjects.Sprite) return (item as Phaser.GameObjects.Sprite).displayWidth;
            return 80;
        });

        return {
            contentWidth: totalWidth,
            contentHeight: Math.max(maxHeight, 100),
            items,
        };
    }

    /**
     * Position content items horizontally within the dialog
     */
    private positionContentItems(
        items: Phaser.GameObjects.GameObject[],
        contentWidth: number,
        dialogHeight: number,
        padding: number
    ): void {
        const spacing = 20;
        const itemWidths = (this as any)._itemWidths || items.map(() => 80);

        // Start position (centered)
        let currentX = -contentWidth / 2;
        const centerY = -20; // Slightly above center to make room for tap text

        items.forEach((item, i) => {
            const itemWidth = itemWidths[i];
            const itemCenterX = currentX + itemWidth / 2;

            if (item instanceof Phaser.GameObjects.Image ||
                item instanceof Phaser.GameObjects.Sprite ||
                item instanceof Phaser.GameObjects.Text) {
                item.setPosition(itemCenterX, centerY);
            }

            this.container.add(item);
            this.contentItems.push(item);

            currentX += itemWidth + spacing;
        });
    }

    /**
     * Create a placeholder for missing content
     */
    private createPlaceholder(label: string): Phaser.GameObjects.Container {
        const container = this.scene.add.container(0, 0);
        const bg = this.scene.add.circle(0, 0, 40, 0x444466);
        const text = this.scene.add.text(0, 0, label, {
            fontSize: '32px',
            fontFamily: 'Arial, sans-serif',
            color: '#888888',
        }).setOrigin(0.5);
        container.add([bg, text]);
        container.setSize(80, 80);
        return container;
    }

    /**
     * Setup input handling for dismissal
     */
    private setupInput(): void {
        // Make container interactive
        const bounds = this.frame.getBounds();
        this.container.setSize(bounds.width, bounds.height);
        this.container.setInteractive({ useHandCursor: true });

        // Dismiss on tap (anywhere)
        const dismissHandler = () => {
            if (this.isDestroyed) return;
            this.dismiss();
        };

        this.container.once('pointerdown', dismissHandler);

        // Also dismiss on overlay tap
        if (this.overlay) {
            this.overlay.once('pointerdown', dismissHandler);
        }

        // Keyboard dismiss (space or enter)
        const keyHandler = (event: KeyboardEvent) => {
            if (event.key === ' ' || event.key === 'Enter') {
                dismissHandler();
                this.scene.input.keyboard?.off('keydown', keyHandler);
            }
        };
        this.scene.input.keyboard?.on('keydown', keyHandler);
    }

    /**
     * Play entrance animation
     */
    private playEntranceAnimation(): void {
        // Start scaled down and fade in
        this.container.setScale(0.8);
        this.container.setAlpha(0);

        if (this.overlay) {
            this.overlay.setAlpha(0);
            this.scene.tweens.add({
                targets: this.overlay,
                alpha: 0.7,
                duration: 200,
            });
        }

        this.scene.tweens.add({
            targets: this.container,
            scale: 1,
            alpha: 1,
            duration: 250,
            ease: 'Back.easeOut',
        });
    }

    /**
     * Dismiss the dialog with animation
     */
    dismiss(): void {
        if (this.isDestroyed) return;
        this.isDestroyed = true;

        // Exit animation
        this.scene.tweens.add({
            targets: this.container,
            scale: 0.9,
            alpha: 0,
            duration: 150,
            ease: 'Power2.easeIn',
            onComplete: () => {
                this.destroy();
                if (this.onDismiss) {
                    this.onDismiss();
                }
            },
        });

        if (this.overlay) {
            this.scene.tweens.add({
                targets: this.overlay,
                alpha: 0,
                duration: 150,
            });
        }
    }

    /**
     * Destroy the dialog and clean up
     */
    destroy(): void {
        this.isDestroyed = true;

        if (this.overlay) {
            this.overlay.destroy();
            this.overlay = null;
        }

        this.contentItems.forEach(item => item.destroy());
        this.contentItems = [];

        this.container.destroy();
    }

    /**
     * Check if dialog is still visible
     */
    isVisible(): boolean {
        return !this.isDestroyed;
    }

    /**
     * Get the container for manual positioning
     */
    getContainer(): Phaser.GameObjects.Container {
        return this.container;
    }
}
