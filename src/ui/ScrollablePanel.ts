import Phaser from 'phaser';

/**
 * Reusable scrollable content area with geometry mask and wheel scroll.
 *
 * Creates a masked viewport — content outside the viewport rect is clipped.
 * Scroll via mouse wheel (or call scrollBy programmatically).
 * A thin scrollbar indicator shows current position.
 */
export class ScrollablePanel {
    private scene: Phaser.Scene;
    private parentContainer: Phaser.GameObjects.Container;
    private viewport: { x: number; y: number; width: number; height: number };

    private contentContainer: Phaser.GameObjects.Container;
    private scrollOffset: number = 0;
    private maxScroll: number = 0;

    private maskGraphics: Phaser.GameObjects.Graphics;
    private scrollbarBg: Phaser.GameObjects.Rectangle;
    private scrollbarThumb: Phaser.GameObjects.Rectangle;

    private wheelHandler: ((pointer: Phaser.Input.Pointer, gameObjects: any[], deltaX: number, deltaY: number) => void) | null = null;

    constructor(
        scene: Phaser.Scene,
        parent: Phaser.GameObjects.Container,
        viewport: { x: number; y: number; width: number; height: number }
    ) {
        this.scene = scene;
        this.parentContainer = parent;
        this.viewport = viewport;

        // Content container — lives inside parent, masked to viewport
        this.contentContainer = scene.add.container(viewport.x, viewport.y);
        parent.add(this.contentContainer);

        // Geometry mask: world-space rectangle at viewport position
        // Since parent is at (640,360), convert local coords to world coords
        this.maskGraphics = scene.make.graphics();
        this.updateMaskShape();

        const mask = this.maskGraphics.createGeometryMask();
        this.contentContainer.setMask(mask);

        // Scrollbar track (right edge of viewport)
        const sbX = viewport.x + viewport.width - 2;
        this.scrollbarBg = scene.add.rectangle(sbX, viewport.y, 4, viewport.height, 0x222244)
            .setOrigin(0, 0);
        parent.add(this.scrollbarBg);

        // Scrollbar thumb
        this.scrollbarThumb = scene.add.rectangle(sbX, viewport.y, 4, 40, 0x4a6fa5)
            .setOrigin(0, 0);
        parent.add(this.scrollbarThumb);

        this.setupWheelScroll();
    }

    private updateMaskShape(): void {
        // Compute world-space coordinates of the viewport
        // The parent container is at (640, 360) so we add those offsets
        const worldX = 640 + this.viewport.x;
        const worldY = 360 + this.viewport.y;

        this.maskGraphics.clear();
        this.maskGraphics.fillStyle(0xffffff);
        this.maskGraphics.fillRect(worldX, worldY, this.viewport.width - 8, this.viewport.height);
    }

    private setupWheelScroll(): void {
        this.wheelHandler = (_pointer, _gameObjects, _deltaX, deltaY) => {
            if (!this.parentContainer.visible) return;

            // Check if pointer is within viewport (world space)
            const pointer = this.scene.input.activePointer;
            const worldX = 640 + this.viewport.x;
            const worldY = 360 + this.viewport.y;

            if (pointer.x >= worldX && pointer.x <= worldX + this.viewport.width &&
                pointer.y >= worldY && pointer.y <= worldY + this.viewport.height) {
                this.scrollBy(deltaY * 0.5);
            }
        };

        this.scene.input.on('wheel', this.wheelHandler);
    }

    /**
     * Get the content container to add children to.
     * Position children relative to (0, 0) — the top-left of the viewport.
     */
    getContent(): Phaser.GameObjects.Container {
        return this.contentContainer;
    }

    /**
     * Set the total content height. Call after populating content.
     * This determines the max scroll range.
     */
    setContentHeight(height: number): void {
        this.maxScroll = Math.max(0, height - this.viewport.height);
        this.updateScrollbar();
    }

    /**
     * Scroll by a delta amount (positive = down, negative = up).
     */
    scrollBy(dy: number): void {
        this.scrollOffset = Phaser.Math.Clamp(this.scrollOffset + dy, 0, this.maxScroll);
        this.contentContainer.setY(this.viewport.y - this.scrollOffset);
        this.updateScrollbar();
    }

    /**
     * Set scroll offset to an exact value.
     */
    setScrollOffset(offset: number): void {
        this.scrollOffset = Phaser.Math.Clamp(offset, 0, this.maxScroll);
        this.contentContainer.setY(this.viewport.y - this.scrollOffset);
        this.updateScrollbar();
    }

    /**
     * Get current scroll offset.
     */
    getScrollOffset(): number {
        return this.scrollOffset;
    }

    private updateScrollbar(): void {
        if (this.maxScroll <= 0) {
            this.scrollbarBg.setVisible(false);
            this.scrollbarThumb.setVisible(false);
            return;
        }

        this.scrollbarBg.setVisible(true);
        this.scrollbarThumb.setVisible(true);

        // Thumb height proportional to visible fraction
        const ratio = this.viewport.height / (this.viewport.height + this.maxScroll);
        const thumbHeight = Math.max(20, this.viewport.height * ratio);
        this.scrollbarThumb.setSize(4, thumbHeight);

        // Thumb position proportional to scroll offset
        const scrollFraction = this.scrollOffset / this.maxScroll;
        const thumbY = this.viewport.y + scrollFraction * (this.viewport.height - thumbHeight);
        this.scrollbarThumb.setY(thumbY);
    }

    /**
     * Clear all content children from the content container.
     */
    clearContent(): void {
        this.contentContainer.removeAll(true);
        this.scrollOffset = 0;
        this.maxScroll = 0;
        this.contentContainer.setY(this.viewport.y);
    }

    destroy(): void {
        if (this.wheelHandler) {
            this.scene.input.off('wheel', this.wheelHandler);
            this.wheelHandler = null;
        }
        this.maskGraphics?.destroy();
        this.contentContainer?.destroy();
        this.scrollbarBg?.destroy();
        this.scrollbarThumb?.destroy();
    }
}
