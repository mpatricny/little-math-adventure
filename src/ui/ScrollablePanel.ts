import Phaser from 'phaser';

export interface ScrollbarAppearance {
    host: { x: number; y: number; width: number; height: number; depth: number };
    inputHost: { x: number; y: number; width: number; height: number; depth: number };
    trackColor: number;
    trackBorderColor: number;
    thumbColor: number;
    thumbBorderColor: number;
    highlightColor: number;
    inset: number;
    minThumbHeight: number;
}

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
    private scrollbarBg: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Graphics;
    private scrollbarThumb: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Graphics;
    private scrollbarInput?: Phaser.GameObjects.Container;
    private thumbDragPointer: number | null = null;
    private thumbDragOffset = 0;

    private wheelHandler: ((pointer: Phaser.Input.Pointer, gameObjects: any[], deltaX: number, deltaY: number) => void) | null = null;
    private dragPointer: number | null = null;
    private dragStartY = 0;
    private dragLastY = 0;
    private dragged = false;
    private destroyed = false;

    constructor(
        scene: Phaser.Scene,
        parent: Phaser.GameObjects.Container,
        viewport: { x: number; y: number; width: number; height: number },
        private readonly scrollbarAppearance?: ScrollbarAppearance
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

        if (scrollbarAppearance) {
            const { host, trackColor, trackBorderColor } = scrollbarAppearance;
            this.scrollbarBg = scene.add.graphics().setPosition(host.x, host.y).setDepth(host.depth)
                .setName('learningScrollbarTrack');
            this.scrollbarBg.fillStyle(trackColor).fillRoundedRect(-host.width / 2, 0, host.width, host.height, host.width / 2);
            this.scrollbarBg.lineStyle(2, trackBorderColor).strokeRoundedRect(-host.width / 2, 0, host.width, host.height, host.width / 2);
            this.scrollbarThumb = scene.add.graphics().setPosition(host.x, host.y).setDepth(host.depth)
                .setName('learningScrollbarThumb');
        } else {
            // Existing consumers retain their own original indicator.
            const sbX = viewport.x + viewport.width - 2;
            this.scrollbarBg = scene.add.rectangle(sbX, viewport.y, 4, viewport.height, 0x222244).setOrigin(0, 0);
            this.scrollbarThumb = scene.add.rectangle(sbX, viewport.y, 4, 40, 0x4a6fa5).setOrigin(0, 0);
        }
        parent.add([this.scrollbarBg, this.scrollbarThumb]);
        if (scrollbarAppearance) {
            const host = scrollbarAppearance.inputHost;
            this.scrollbarInput = scene.add.container(host.x, host.y).setDepth(host.depth)
                .setName('learningScrollbarInput').setSize(host.width, host.height).setInteractive({ useHandCursor: true });
            this.scrollbarInput.on('pointerdown', (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
                event.stopPropagation();
                if (!this.scrollbarActive()) return;
                const y = this.localPoint(pointer).y;
                const height = this.scrollbarThumb.getData('height') as number;
                const top = this.scrollbarThumb.y;
                this.thumbDragPointer = pointer.id;
                this.thumbDragOffset = y >= top && y <= top + height ? y - top : height / 2;
                this.dragged = true;
                this.scrollFromThumbTop(y - this.thumbDragOffset);
            });
            parent.add(this.scrollbarInput);
        }

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
        if (pointer.id === this.thumbDragPointer) {
            if (!pointer.isDown || !this.scrollbarActive()) { this.thumbDragPointer = null; return; }
            this.scrollFromThumbTop(this.localPoint(pointer).y - this.thumbDragOffset);
            return;
        }
        if (pointer.id !== this.dragPointer || !pointer.isDown || !this.parentContainer.visible) return;
        const y = this.localPoint(pointer).y;
        if (!this.dragged && Math.abs(y - this.dragStartY) < 8) return;
        this.dragged = true;
        this.scrollBy(this.dragLastY - y);
        this.dragLastY = y;
    }

    private pointerUp(pointer: Phaser.Input.Pointer): void {
        if (pointer.id === this.dragPointer) this.dragPointer = null;
        if (pointer.id === this.thumbDragPointer) this.thumbDragPointer = null;
    }

    private scrollbarActive(): boolean { return !this.destroyed && this.parentContainer.visible && this.maxScroll > 0; }

    private containsScrollbar(pointer: Phaser.Input.Pointer): boolean {
        if (!this.scrollbarAppearance || !this.scrollbarActive()) return false;
        const point = this.localPoint(pointer), host = this.scrollbarAppearance.inputHost;
        return point.x >= host.x - host.width / 2 && point.x <= host.x + host.width / 2
            && point.y >= host.y - host.height / 2 && point.y <= host.y + host.height / 2;
    }

    private scrollFromThumbTop(top: number): void {
        const appearance = this.scrollbarAppearance!;
        const height = this.scrollbarThumb.getData('height') as number;
        const travel = appearance.host.height - appearance.inset * 2 - height;
        this.setScrollOffset(travel > 0 ? (top - appearance.host.y - appearance.inset) / travel * this.maxScroll : 0);
    }

    /** Call on pointerup, so a swipe starting on a node cannot select it. */
    canTap(pointer: Phaser.Input.Pointer): boolean {
        return !this.dragged && this.contains(pointer);
    }

    /** Masks clip drawing, not Phaser input. Preserve the generated hit area and clip its test too. */
    clipInput(object: Phaser.GameObjects.Container): void {
        const input = object.input;
        if (!input) return;
        const contains = input.hitAreaCallback;
        input.hitAreaCallback = (area, x, y, gameObject) => {
            if (!contains(area, x, y, gameObject)) return false;
            const world = object.getWorldTransformMatrix().transformPoint(x - object.displayOriginX, y - object.displayOriginY);
            const point = this.parentContainer.getWorldTransformMatrix().applyInverse(world.x, world.y);
            const v = this.viewport;
            return this.parentContainer.visible && point.x >= v.x && point.x <= v.x + this.maskWidth()
                && point.y >= v.y && point.y <= v.y + v.height;
        };
    }

    private updateMaskShape(): void {
        // Compute world-space coordinates of the viewport
        const transform = this.parentContainer.getWorldTransformMatrix();
        const { x: worldX, y: worldY } = transform.transformPoint(this.viewport.x, this.viewport.y);

        this.maskGraphics.clear();
        this.maskGraphics.fillStyle(0xffffff);
        this.maskGraphics.fillRect(worldX, worldY, this.maskWidth() * transform.scaleX, this.viewport.height * transform.scaleY);
    }

    private maskWidth(): number { return this.viewport.width - (this.scrollbarAppearance ? 0 : 8); }

    private setupWheelScroll(): void {
        this.wheelHandler = (pointer, _gameObjects, _deltaX, deltaY) => {
            if (this.contains(pointer) || this.containsScrollbar(pointer)) this.scrollBy(deltaY * 0.5);
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
        if (this.scrollbarInput) {
            this.scrollbarInput.setVisible(this.maxScroll > 0);
            if (this.scrollbarInput.input) this.scrollbarInput.input.enabled = this.maxScroll > 0;
        }
        if (this.maxScroll <= 0) {
            this.thumbDragPointer = null;
            this.scrollbarBg.setVisible(false);
            this.scrollbarThumb.setVisible(false);
            return;
        }

        this.scrollbarBg.setVisible(true);
        this.scrollbarThumb.setVisible(true);

        // Thumb height proportional to visible fraction
        const ratio = this.viewport.height / (this.viewport.height + this.maxScroll);
        if (this.scrollbarAppearance) {
            const { host, inset, minThumbHeight, thumbColor, thumbBorderColor, highlightColor } = this.scrollbarAppearance;
            const innerHeight = host.height - inset * 2;
            const thumbHeight = Math.min(innerHeight, Math.max(minThumbHeight, innerHeight * ratio));
            const thumbWidth = host.width - inset * 2;
            const thumbY = host.y + inset + (this.scrollOffset / this.maxScroll) * (innerHeight - thumbHeight);
            const thumb = this.scrollbarThumb as Phaser.GameObjects.Graphics;
            thumb.clear().setY(thumbY).setData({ width: thumbWidth, height: thumbHeight });
            thumb.fillStyle(thumbColor).fillRoundedRect(-thumbWidth / 2, 0, thumbWidth, thumbHeight, thumbWidth / 2);
            thumb.lineStyle(1.5, thumbBorderColor).strokeRoundedRect(-thumbWidth / 2, 0, thumbWidth, thumbHeight, thumbWidth / 2);
            thumb.lineStyle(1, highlightColor, 0.7);
            for (const dy of [-5, 0, 5]) thumb.lineBetween(-thumbWidth / 2 + 3, thumbHeight / 2 + dy, thumbWidth / 2 - 3, thumbHeight / 2 + dy);
            return;
        }
        const thumbHeight = Math.max(20, this.viewport.height * ratio);
        (this.scrollbarThumb as Phaser.GameObjects.Rectangle).setSize(4, thumbHeight);

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
        this.scrollbarInput?.destroy();
        this.thumbDragPointer = null;
    }
}
