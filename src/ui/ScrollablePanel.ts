import Phaser from 'phaser';

/**
 * Reusable scrollable content area with geometry mask, wheel and pointer scrolling.
 *
 * Creates a masked viewport — content outside the viewport rect is clipped.
 * Scroll via mouse wheel or drag with a finger/mouse.
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
    private dragPointer: number | null = null;
    private dragStartY = 0;
    private dragLastY = 0;
    private dragged = false;
    private destroyed = false;

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

        // Geometry mask: world-space rectangle at viewport position.
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
        scene.input.on('pointerdown', this.pointerDown, this);
        scene.input.on('pointermove', this.pointerMove, this);
        scene.input.on('pointerup', this.pointerUp, this);
        scene.input.on('pointerupoutside', this.pointerUp, this);
        scene.events.on('postupdate', this.updateMaskShape, this);
        scene.events.once('shutdown', this.destroy, this);
    }

    private localPoint(pointer: Phaser.Input.Pointer): Phaser.Math.Vector2 {
        return this.parentContainer.getWorldTransformMatrix().applyInverse(pointer.x, pointer.y);
    }

    private contains(pointer: Phaser.Input.Pointer): boolean {
        const point = this.localPoint(pointer);
        const v = this.viewport;
        return this.parentContainer.visible && point.x >= v.x && point.x <= v.x + v.width
            && point.y >= v.y && point.y <= v.y + v.height;
    }

    private pointerDown(pointer: Phaser.Input.Pointer): void {
        if (this.dragPointer !== null || !this.contains(pointer)) return;
        this.dragPointer = pointer.id;
        this.dragStartY = this.dragLastY = this.localPoint(pointer).y;
        this.dragged = false;
    }

    private pointerMove(pointer: Phaser.Input.Pointer): void {
        if (pointer.id !== this.dragPointer || !pointer.isDown || !this.parentContainer.visible) return;
        const y = this.localPoint(pointer).y;
        if (!this.dragged && Math.abs(y - this.dragStartY) < 8) return;
        this.dragged = true;
        this.scrollBy(this.dragLastY - y);
        this.dragLastY = y;
    }

    private pointerUp(pointer: Phaser.Input.Pointer): void {
        if (pointer.id === this.dragPointer) this.dragPointer = null;
    }

    /** Call on pointerup, so a swipe starting on a node cannot select it. */
    canTap(pointer: Phaser.Input.Pointer): boolean {
        return !this.dragged && this.contains(pointer);
    }

    private updateMaskShape(): void {
        // Compute world-space coordinates of the viewport
        const transform = this.parentContainer.getWorldTransformMatrix();
        const { x: worldX, y: worldY } = transform.transformPoint(this.viewport.x, this.viewport.y);

        this.maskGraphics.clear();
        this.maskGraphics.fillStyle(0xffffff);
        this.maskGraphics.fillRect(worldX, worldY, (this.viewport.width - 8) * transform.scaleX, this.viewport.height * transform.scaleY);
    }

    private setupWheelScroll(): void {
        this.wheelHandler = (pointer, _gameObjects, _deltaX, deltaY) => {
            if (this.contains(pointer)) this.scrollBy(deltaY * 0.5);
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
        if (this.destroyed) return;
        this.destroyed = true;
        this.scene.input.off('pointerdown', this.pointerDown, this);
        this.scene.input.off('pointermove', this.pointerMove, this);
        this.scene.input.off('pointerup', this.pointerUp, this);
        this.scene.input.off('pointerupoutside', this.pointerUp, this);
        this.scene.events.off('postupdate', this.updateMaskShape, this);
        this.scene.events.off('shutdown', this.destroy, this);
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
