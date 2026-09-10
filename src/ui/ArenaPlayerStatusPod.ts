import Phaser from 'phaser';
import type { PreparationKind } from '../types';

export type ArenaPlayerStatusPodOptions = {
    x: number;
    y: number;
    depth: number;
    width?: number;
    height?: number;
    playerLabel: 'A' | 'B';
    pointerSide: 'left' | 'right';
    hp: number;
    maxHp: number;
    potionCount: number;
    preparationKind: PreparationKind | null;
    preparationCharges: number;
    name?: string;
};

/**
 * Compact per-player arena status. One structural frame is mirrored while
 * values and existing inventory/preparation icons remain independent layers.
 */
export class ArenaPlayerStatusPod {
    readonly root: Phaser.GameObjects.Container;

    private readonly hpFill: Phaser.GameObjects.Graphics;
    private readonly hpText: Phaser.GameObjects.Text;
    private readonly mirror: number;
    private readonly trackLeft: number;
    private readonly trackWidth: number;
    private readonly topY: number;
    private readonly fillHeight: number;

    constructor(scene: Phaser.Scene, options: ArenaPlayerStatusPodOptions) {
        const width = options.width ?? 178;
        const height = options.height ?? 78;
        this.mirror = options.pointerSide === 'left' ? 1 : -1;
        this.topY = -height * 0.22;
        const lowerY = height * 0.22;

        this.root = scene.add.container(options.x, options.y)
            .setDepth(options.depth)
            .setName(options.name ?? `arena-player-${options.playerLabel.toLowerCase()}-status`);

        const frame = scene.add.image(0, 0, 'arena-player-status-pod-v1')
            .setDisplaySize(width, height)
            .setFlipX(options.pointerSide === 'right');

        this.trackLeft = -width * 0.165;
        this.trackWidth = width * 0.47;
        this.fillHeight = Math.max(6, height * 0.12);
        this.hpFill = scene.add.graphics().setScale(this.mirror, 1);

        this.hpText = scene.add.text(this.mirror * width * 0.075, this.topY, '', {
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: `${Math.max(11, Math.round(height * 0.17))}px`,
            fontStyle: 'bold',
            color: '#fff5cf',
            stroke: '#241309',
            strokeThickness: 3,
        }).setOrigin(0.5).setResolution(2);

        const playerLabel = scene.add.text(
            this.mirror * width * 0.385,
            this.topY,
            options.playerLabel,
            {
                fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
                fontSize: `${Math.max(12, Math.round(height * 0.2))}px`,
                fontStyle: 'bold',
                color: options.playerLabel === 'A' ? '#e8f7ff' : '#fff0bb',
                stroke: '#22140c',
                strokeThickness: 3,
            },
        ).setOrigin(0.5).setResolution(2);

        const potionX = this.mirror * -width * 0.265;
        const prepX = this.mirror * -width * 0.06;
        const potion = scene.add.image(
            potionX,
            lowerY - height * 0.015,
            'character-book-red-potion',
        ).setDisplaySize(height * 0.3, height * 0.3);
        const potionBadgeX = potionX + this.mirror * height * 0.18;
        const potionBadgeY = lowerY + height * 0.13;
        const potionBadge = scene.add.circle(
            potionBadgeX,
            potionBadgeY,
            Math.max(6, height * 0.095),
            0x21120e,
            0.98,
        ).setStrokeStyle(2, 0xb64a43, 1);
        const potionCount = scene.add.text(
            potionBadgeX,
            potionBadgeY,
            String(Math.max(0, Math.round(options.potionCount))),
            {
                fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
                fontSize: `${Math.max(9, Math.round(height * 0.13))}px`,
                fontStyle: 'bold',
                color: '#fff1bd',
                stroke: '#251309',
                strokeThickness: 2,
            },
        ).setOrigin(0.5).setResolution(2);

        const sword = options.preparationKind === 'sword';
        const preparation = scene.add.image(
            prepX,
            lowerY,
            sword ? 'prep-sword-active-v2' : 'prep-shield-active-v2',
        ).setDisplaySize(height * 0.36, height * 0.36)
            .setVisible(options.preparationKind !== null);

        const runeXs = [0.13, 0.23, 0.33];
        const charges = Phaser.Math.Clamp(Math.round(options.preparationCharges), 0, 3);
        const runes = runeXs.map((ratio, index) => {
            const charged = index < charges;
            return scene.add.image(
                this.mirror * width * ratio,
                lowerY,
                charged ? 'battle-hud-rune-charged-v1' : 'battle-hud-rune-empty-v1',
            ).setDisplaySize(height * 0.19, height * 0.19)
                .setTint(sword || !charged ? 0xffffff : 0x79d8ff);
        });

        this.root.add([
            frame,
            this.hpFill,
            this.hpText,
            playerLabel,
            potion,
            potionBadge,
            potionCount,
            preparation,
            ...runes,
        ]);
        this.root.setSize(width, height);
        this.setHp(options.hp, options.maxHp);
    }

    setHp(hp: number, maxHp: number): void {
        const safeMaxHp = Math.max(1, Math.round(maxHp));
        const safeHp = Phaser.Math.Clamp(Math.round(hp), 0, safeMaxHp);
        const hpRatio = safeHp / safeMaxHp;
        const color = hpRatio > 0.5
            ? 0x4dca54
            : hpRatio > 0.25
                ? 0xd3a83b
                : 0xd34b49;

        this.hpFill.clear();
        this.hpFill.fillStyle(color, 1);
        this.hpFill.fillRoundedRect(
            this.trackLeft,
            this.topY - this.fillHeight / 2,
            this.trackWidth * hpRatio,
            this.fillHeight,
            this.fillHeight / 2,
        );
        if (hpRatio > 0) {
            this.hpFill.fillStyle(0xffffff, 0.35);
            this.hpFill.fillRoundedRect(
                this.trackLeft + 2,
                this.topY - this.fillHeight / 2 + 2,
                Math.max(2, this.trackWidth * hpRatio - 4),
                Math.max(2, this.fillHeight * 0.25),
                2,
            );
        }
        this.hpText.setText(`${safeHp}/${safeMaxHp}`);
    }

    destroy(): void {
        this.root.destroy(true);
    }
}
