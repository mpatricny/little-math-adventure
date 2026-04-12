import Phaser from 'phaser';

const MAX_CHARGES = 4;
const BAR_WIDTH = 100;         // Match HP bar width
const SEGMENT_GAP = 4;
const SEGMENT_WIDTH = (BAR_WIDTH - (MAX_CHARGES - 1) * SEGMENT_GAP) / MAX_CHARGES; // = 22
const SEGMENT_HEIGHT = 10;
const BAR_OFFSET = 9;          // Match HP bar icon offset (icon+gap / 2)
const EMPTY_COLOR = 0x333333;
const EMPTY_STROKE = 0x555555;
const FILLED_COLOR = 0xffcc00;
const FLASH_COLOR = 0xffffff;

export class SpeedChargeBar {
    private scene: Phaser.Scene;
    private container: Phaser.GameObjects.Container;
    private segments: Phaser.GameObjects.Rectangle[] = [];
    private label: Phaser.GameObjects.Text;
    private currentCharges: number = 0;

    constructor(scene: Phaser.Scene, x: number, y: number) {
        this.scene = scene;
        this.container = scene.add.container(x, y);
        this.container.setAlpha(0);
        this.container.setVisible(false);

        // Lightning label — same position as heart icon on HP bar
        this.label = scene.add.text(-BAR_WIDTH / 2 - 8 + BAR_OFFSET, 0, '⚡', {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
        }).setOrigin(0.5);
        this.container.add(this.label);

        // Create 4 segment rectangles — aligned with HP bar (100px wide, offset by BAR_OFFSET)
        const startX = -BAR_WIDTH / 2 + BAR_OFFSET;
        for (let i = 0; i < MAX_CHARGES; i++) {
            const segX = startX + i * (SEGMENT_WIDTH + SEGMENT_GAP);
            const seg = scene.add.rectangle(segX, 0, SEGMENT_WIDTH, SEGMENT_HEIGHT, EMPTY_COLOR);
            seg.setOrigin(0, 0.5);
            seg.setStrokeStyle(1, EMPTY_STROKE);
            this.segments.push(seg);
            this.container.add(seg);
        }
    }

    /**
     * Add charges to the bar. Returns bonus damage from fills and remaining charges.
     */
    addCharges(count: number): { bonusDamage: number; newCharges: number } {
        const wasZero = this.currentCharges === 0;
        const oldCharges = this.currentCharges;
        const total = this.currentCharges + count;
        const bonusDamage = Math.floor(total / MAX_CHARGES);
        const newCharges = total % MAX_CHARGES;

        if (wasZero && (bonusDamage > 0 || newCharges > 0)) {
            // Fade in
            this.container.setVisible(true);
            this.scene.tweens.add({
                targets: this.container,
                alpha: 1,
                duration: 200,
                ease: 'Sine.easeIn',
            });
        }

        if (bonusDamage > 0) {
            // Bar filled at least once — animate fill then reset
            this.animateFill(oldCharges, newCharges);
        } else {
            // Just filling segments, no overflow
            this.animateNewSegments(oldCharges, newCharges);
        }

        this.currentCharges = newCharges;

        // Show floating "+N" text above bar
        this.showChargeAddedText(count);

        return { bonusDamage, newCharges };
    }

    /**
     * Animate newly filled segments (no bar fill).
     */
    private animateNewSegments(fromCharge: number, toCharge: number): void {
        for (let i = fromCharge; i < toCharge; i++) {
            const seg = this.segments[i];
            seg.setFillStyle(FILLED_COLOR);
            seg.setStrokeStyle(1, FILLED_COLOR);

            // Pulse animation on newly filled segment
            this.scene.tweens.add({
                targets: seg,
                scaleX: 1.3,
                scaleY: 1.3,
                duration: 100,
                yoyo: true,
                ease: 'Back.easeOut',
            });
        }
    }

    /**
     * Animate bar fill: flash all segments white, reset, then fill overflow.
     */
    private animateFill(oldCharges: number, overflowCharges: number): void {
        // First fill remaining segments to full
        for (let i = oldCharges; i < MAX_CHARGES; i++) {
            this.segments[i].setFillStyle(FILLED_COLOR);
            this.segments[i].setStrokeStyle(1, FILLED_COLOR);
        }

        // Flash all segments white
        this.segments.forEach(seg => {
            seg.setFillStyle(FLASH_COLOR);
            seg.setStrokeStyle(1, FLASH_COLOR);
        });

        // After flash, reset to empty then fill overflow
        this.scene.time.delayedCall(150, () => {
            this.segments.forEach(seg => {
                seg.setFillStyle(EMPTY_COLOR);
                seg.setStrokeStyle(1, EMPTY_STROKE);
            });

            // Fill overflow charges
            for (let i = 0; i < overflowCharges; i++) {
                this.segments[i].setFillStyle(FILLED_COLOR);
                this.segments[i].setStrokeStyle(1, FILLED_COLOR);
            }

            // Fade out if no overflow charges remain
            if (overflowCharges === 0) {
                this.scene.tweens.add({
                    targets: this.container,
                    alpha: 0,
                    duration: 300,
                    ease: 'Sine.easeOut',
                    onComplete: () => {
                        this.container.setVisible(false);
                    },
                });
            }
        });
    }

    /**
     * Show floating "+N" text above the bar.
     */
    private showChargeAddedText(count: number): void {
        // Position at the right end of the bar
        const textX = this.container.x + BAR_WIDTH / 2 + BAR_OFFSET + 15;
        const textY = this.container.y - 2;
        const text = this.scene.add.text(
            textX,
            textY,
            `+${count}`,
            {
                fontSize: '20px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffcc00',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 3,
            }
        ).setOrigin(0.5).setDepth(this.container.depth + 1);

        // If bar is inside a parent container, add text there too
        if (this.container.parentContainer) {
            this.container.parentContainer.add(text);
            text.setPosition(textX, textY);
        }

        this.scene.tweens.add({
            targets: text,
            y: text.y - 30,
            alpha: 0,
            duration: 800,
            ease: 'Sine.easeOut',
            onComplete: () => text.destroy(),
        });
    }

    /**
     * Reset bar to 0 charges and hide.
     */
    reset(): void {
        this.currentCharges = 0;
        this.segments.forEach(seg => {
            seg.setFillStyle(EMPTY_COLOR);
            seg.setStrokeStyle(1, EMPTY_STROKE);
        });
        this.container.setAlpha(0);
        this.container.setVisible(false);
    }

    getCharges(): number {
        return this.currentCharges;
    }

    getContainer(): Phaser.GameObjects.Container {
        return this.container;
    }

    setVisible(visible: boolean): void {
        this.container.setVisible(visible);
    }

    setDepth(depth: number): void {
        this.container.setDepth(depth);
    }

    destroy(): void {
        this.container.destroy();
    }
}
