import Phaser from 'phaser';

export type TownResourceHudLayout = {
    x: number;
    y: number;
    depth: number;
    width?: number;
    height?: number;
};

const SOURCE_TEXTURE = 'town-hud-a-resources';
const CLEAN_TEXTURE = '__town-hud-a-resources-clean';

/**
 * Approved resource rail with the concept's baked example numbers removed.
 * Mana and coin values stay as runtime text so the production HUD reflects
 * the currently loaded save slot.
 */
export class TownResourceHud {
    readonly root: Phaser.GameObjects.Container;

    private readonly manaText: Phaser.GameObjects.Text;
    private readonly coinsText: Phaser.GameObjects.Text;

    constructor(scene: Phaser.Scene, layout: TownResourceHudLayout) {
        this.ensureCleanTexture(scene);
        const width = layout.width ?? 258;
        const height = layout.height ?? 74;
        this.root = scene.add.container(layout.x, layout.y).setDepth(layout.depth);

        const panel = scene.add.image(0, 0, CLEAN_TEXTURE)
            .setDisplaySize(width, height);
        this.manaText = this.createValue(scene, -34, 0);
        this.coinsText = this.createValue(scene, 24, 0);
        this.root.add([panel, this.manaText, this.coinsText]);
    }

    setValues(mana: number, coins: number): void {
        this.manaText.setText(String(Math.max(0, Math.round(mana))));
        this.coinsText.setText(String(Math.max(0, Math.round(coins))));
    }

    destroy(): void {
        this.root.destroy(true);
    }

    private createValue(
        scene: Phaser.Scene,
        x: number,
        y: number
    ): Phaser.GameObjects.Text {
        return scene.add.text(x, y, '', {
            resolution: 2,
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '22px',
            fontStyle: 'bold',
            color: '#f6e58f',
            stroke: '#3b1e12',
            strokeThickness: 4,
            align: 'center',
        }).setOrigin(0.5);
    }

    private ensureCleanTexture(scene: Phaser.Scene): void {
        if (scene.textures.exists(CLEAN_TEXTURE)) return;

        const sourceFrame = scene.textures.getFrame(SOURCE_TEXTURE, 0);
        if (!sourceFrame) {
            throw new Error(`Missing production HUD texture: ${SOURCE_TEXTURE}`);
        }
        const canvasTexture = scene.textures.createCanvas(
            CLEAN_TEXTURE,
            sourceFrame.cutWidth,
            sourceFrame.cutHeight
        );
        if (!canvasTexture) {
            throw new Error('Unable to create the runtime resource HUD texture');
        }

        const context = canvasTexture.context;
        const sourceImage = sourceFrame.source.image as CanvasImageSource;
        context.drawImage(
            sourceImage,
            sourceFrame.cutX,
            sourceFrame.cutY,
            sourceFrame.cutWidth,
            sourceFrame.cutHeight,
            0,
            0,
            sourceFrame.cutWidth,
            sourceFrame.cutHeight
        );

        // Replace the two baked concept values with neighbouring wood texture.
        context.drawImage(
            sourceImage,
            sourceFrame.cutX + 145,
            sourceFrame.cutY + 25,
            29,
            48,
            103,
            25,
            41,
            48
        );
        context.drawImage(
            sourceImage,
            sourceFrame.cutX + 145,
            sourceFrame.cutY + 25,
            29,
            48,
            175,
            25,
            51,
            48
        );
        canvasTexture.refresh();
    }
}
