import Phaser from 'phaser';

export type GuildExamBoardOptions = {
    x: number;
    y: number;
    width: number;
    height: number;
    accent: number;
};

/**
 * Shared structural surface for every Guild exam phase. The board deliberately
 * uses the same dark oak, steel, parchment and crystal language as the Guild
 * hall controls while keeping all copy and interaction as runtime layers.
 */
export function createGuildExamBoard(
    scene: Phaser.Scene,
    options: GuildExamBoardOptions,
): Phaser.GameObjects.Container {
    const root = scene.add.container(options.x, options.y);
    const { width, height, accent } = options;
    const halfW = width / 2;
    const halfH = height / 2;

    const shadow = scene.add.graphics();
    shadow.fillStyle(0x050301, 0.7);
    shadow.fillRoundedRect(-halfW + 10, -halfH + 16, width, height, 28);

    const oak = scene.add.graphics();
    oak.fillStyle(0x422613, 1);
    oak.fillRoundedRect(-halfW, -halfH, width, height, 26);
    oak.lineStyle(5, 0x15100d, 1);
    oak.strokeRoundedRect(-halfW, -halfH, width, height, 26);
    oak.lineStyle(2, 0x9d6937, 0.9);
    oak.strokeRoundedRect(-halfW + 8, -halfH + 8, width - 16, height - 16, 20);

    const steel = scene.add.graphics();
    steel.lineStyle(7, 0x34383a, 1);
    steel.strokeRoundedRect(-halfW + 15, -halfH + 15, width - 30, height - 30, 17);
    steel.lineStyle(2, 0x9ea6a6, 0.75);
    steel.strokeRoundedRect(-halfW + 19, -halfH + 19, width - 38, height - 38, 14);

    const parchment = scene.add.graphics();
    // A stable paper fill avoids unsupported Canvas gradients and WebGL's
    // visible triangulation seam across this rounded path.
    parchment.fillStyle(0xe4bf75, 1);
    parchment.fillRoundedRect(-halfW + 29, -halfH + 29, width - 58, height - 58, 14);
    parchment.lineStyle(3, 0x6f431f, 0.95);
    parchment.strokeRoundedRect(-halfW + 29, -halfH + 29, width - 58, height - 58, 14);
    parchment.lineStyle(1, 0xffefbb, 0.65);
    parchment.strokeRoundedRect(-halfW + 35, -halfH + 35, width - 70, height - 70, 11);

    const paperWear = scene.add.graphics();
    paperWear.lineStyle(1, 0x8b5a2b, 0.09);
    for (let y = -halfH + 55; y < halfH - 42; y += 17) {
        paperWear.lineBetween(-halfW + 50, y, halfW - 50, y + 1);
    }

    const ornaments = scene.add.graphics();
    const cornerX = halfW - 25;
    const cornerY = halfH - 25;
    [
        [-cornerX, -cornerY],
        [cornerX, -cornerY],
        [-cornerX, cornerY],
        [cornerX, cornerY],
    ].forEach(([x, y]) => {
        ornaments.fillStyle(0x171a1c, 1);
        ornaments.fillCircle(x, y, 10);
        ornaments.lineStyle(2, 0x8f9697, 1);
        ornaments.strokeCircle(x, y, 10);
        ornaments.fillStyle(0xc17d2c, 1);
        ornaments.fillCircle(x, y, 4);
    });

    const crestShadow = scene.add.graphics();
    crestShadow.fillStyle(0x050301, 0.55);
    crestShadow.fillPoints([
        new Phaser.Geom.Point(-1, -halfH - 20),
        new Phaser.Geom.Point(25, -halfH + 6),
        new Phaser.Geom.Point(-1, -halfH + 32),
        new Phaser.Geom.Point(-27, -halfH + 6),
    ], true);

    const crest = scene.add.graphics();
    crest.fillStyle(accent, 1);
    crest.fillPoints([
        new Phaser.Geom.Point(0, -halfH - 25),
        new Phaser.Geom.Point(22, -halfH),
        new Phaser.Geom.Point(0, -halfH + 25),
        new Phaser.Geom.Point(-22, -halfH),
    ], true);
    crest.lineStyle(3, 0xd9f7ff, 0.8);
    crest.strokePoints([
        new Phaser.Geom.Point(0, -halfH - 25),
        new Phaser.Geom.Point(22, -halfH),
        new Phaser.Geom.Point(0, -halfH + 25),
        new Phaser.Geom.Point(-22, -halfH),
    ], true);
    crest.lineStyle(2, 0xffffff, 0.5);
    crest.lineBetween(-8, -halfH - 9, 0, -halfH - 19);

    root.add([shadow, oak, steel, parchment, paperWear, ornaments, crestShadow, crest]);
    return root;
}

export function createGuildExamRule(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    accent: number,
): Phaser.GameObjects.Container {
    const root = scene.add.container(x, y);
    const line = scene.add.graphics();
    line.lineStyle(2, 0x754920, 0.75);
    line.lineBetween(-width / 2, 0, width / 2, 0);
    line.lineStyle(1, 0xffe7a1, 0.7);
    line.lineBetween(-width / 2, -2, width / 2, -2);

    const gem = scene.add.graphics();
    gem.fillStyle(accent, 1);
    gem.fillPoints([
        new Phaser.Geom.Point(0, -8),
        new Phaser.Geom.Point(9, 0),
        new Phaser.Geom.Point(0, 8),
        new Phaser.Geom.Point(-9, 0),
    ], true);
    gem.lineStyle(1, 0xe8fbff, 0.85);
    gem.strokePoints([
        new Phaser.Geom.Point(0, -8),
        new Phaser.Geom.Point(9, 0),
        new Phaser.Geom.Point(0, 8),
        new Phaser.Geom.Point(-9, 0),
    ], true);
    root.add([line, gem]);
    return root;
}
