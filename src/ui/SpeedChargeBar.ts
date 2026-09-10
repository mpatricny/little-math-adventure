import Phaser from 'phaser';

const MAX_CHARGES = 4;
const SLOT_SIZE = 18;
const SLOT_GAP = 3;
const FILLED_TINT = 0xffffff;

export interface SpeedChargeBarOptions {
    /** Keep the four empty speed slots visible even at zero charge. */
    showEmptySlots?: boolean;
    /** Optional player-specific tint for filled runes. */
    filledTint?: number;
}

/** Four-slot fast-answer meter used by battle actor status plates. */
export class SpeedChargeBar {
    private readonly scene: Phaser.Scene;
    private readonly container: Phaser.GameObjects.Container;
    private readonly chargedRunes: Phaser.GameObjects.Image[] = [];
    private readonly showEmptySlots: boolean;
    private readonly filledTint: number;
    private currentCharges = 0;

    constructor(scene: Phaser.Scene, x: number, y: number, options: SpeedChargeBarOptions = {}) {
        this.scene = scene;
        this.showEmptySlots = options.showEmptySlots ?? false;
        this.filledTint = options.filledTint ?? FILLED_TINT;
        this.container = scene.add.container(x, y)
            .setAlpha(this.showEmptySlots ? 1 : 0)
            .setVisible(this.showEmptySlots);

        const totalWidth = MAX_CHARGES * SLOT_SIZE + (MAX_CHARGES - 1) * SLOT_GAP;
        const startX = -totalWidth / 2 + SLOT_SIZE / 2;
        for (let index = 0; index < MAX_CHARGES; index++) {
            const slotX = startX + index * (SLOT_SIZE + SLOT_GAP);
            const empty = scene.add.image(slotX, 0, 'battle-hud-rune-empty-v1')
                .setDisplaySize(SLOT_SIZE, SLOT_SIZE);
            const charged = scene.add.image(slotX, 0, 'battle-hud-rune-charged-v1')
                .setDisplaySize(SLOT_SIZE, SLOT_SIZE)
                .setTint(this.filledTint)
                .setAlpha(0);
            this.container.add([empty, charged]);
            this.chargedRunes.push(charged);
        }
    }

    addCharges(count: number): { bonusDamage: number; newCharges: number } {
        const previous = this.currentCharges;
        const total = previous + count;
        const bonusDamage = Math.floor(total / MAX_CHARGES);
        const newCharges = total % MAX_CHARGES;

        this.container.setVisible(true).setAlpha(1);
        if (bonusDamage > 0) this.animateCompletedMeter(previous, newCharges);
        else this.setChargeVisuals(newCharges, previous);
        this.currentCharges = newCharges;
        this.showChargeAddedText(count);
        return { bonusDamage, newCharges };
    }

    private setChargeVisuals(count: number, animateFrom = count): void {
        this.chargedRunes.forEach((rune, index) => {
            this.scene.tweens.killTweensOf(rune);
            const charged = index < count;
            const baseScaleX = SLOT_SIZE / rune.width;
            const baseScaleY = SLOT_SIZE / rune.height;
            rune.setAlpha(charged ? 1 : 0).setScale(baseScaleX, baseScaleY);
            if (charged && index >= animateFrom) {
                rune.setScale(baseScaleX * 0.68, baseScaleY * 0.68);
                this.scene.tweens.add({
                    targets: rune,
                    scaleX: baseScaleX,
                    scaleY: baseScaleY,
                    duration: 180,
                    ease: 'Back.easeOut',
                });
            }
        });
    }

    private animateCompletedMeter(previous: number, overflow: number): void {
        let remaining = this.chargedRunes.length;
        this.chargedRunes.forEach((rune, index) => {
            if (index >= previous) rune.setAlpha(1);
            this.scene.tweens.killTweensOf(rune);
            const baseScaleX = SLOT_SIZE / rune.width;
            const baseScaleY = SLOT_SIZE / rune.height;
            this.scene.tweens.add({
                targets: rune,
                alpha: { from: 1, to: 0.35 },
                scaleX: { from: baseScaleX * 1.18, to: baseScaleX * 0.88 },
                scaleY: { from: baseScaleY * 1.18, to: baseScaleY * 0.88 },
                duration: 150,
                yoyo: true,
                onComplete: () => {
                    remaining--;
                    if (remaining !== 0) return;
                    this.setChargeVisuals(overflow);
                    if (!this.showEmptySlots && overflow === 0) {
                        this.scene.tweens.add({
                            targets: this.container,
                            alpha: 0,
                            duration: 220,
                            onComplete: () => this.container.setVisible(false),
                        });
                    }
                },
            });
        });
    }

    private showChargeAddedText(count: number): void {
        const parent = this.container.parentContainer;
        const text = this.scene.add.text(this.container.x + 52, this.container.y, `+${count}`, {
            fontSize: '18px',
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            color: '#ffd45c',
            fontStyle: 'bold',
            stroke: '#211208',
            strokeThickness: 3,
        }).setOrigin(0.5).setDepth(this.container.depth + 1);
        if (parent) parent.add(text);
        this.scene.tweens.add({
            targets: text,
            y: text.y - 26,
            alpha: 0,
            duration: 700,
            ease: 'Sine.easeOut',
            onComplete: () => text.destroy(),
        });
    }

    reset(): void {
        this.currentCharges = 0;
        this.setChargeVisuals(0);
        this.container.setAlpha(this.showEmptySlots ? 1 : 0);
        this.container.setVisible(this.showEmptySlots);
    }

    getCharges(): number { return this.currentCharges; }
    getContainer(): Phaser.GameObjects.Container { return this.container; }

    setVisible(visible: boolean): void {
        this.container.setVisible(visible && (this.showEmptySlots || this.currentCharges > 0));
    }

    setDepth(depth: number): void { this.container.setDepth(depth); }
    destroy(): void { this.container.destroy(true); }
}
