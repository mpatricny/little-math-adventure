import Phaser from 'phaser';

export type MedievalFrameLayer = {
    container: Phaser.GameObjects.Container;
    parts: Phaser.GameObjects.Image[];
};

const RAIL_TEXTURE = 'prep-frame-rail-v2';
const CAP_TEXTURE = 'prep-frame-cap-v2';
const RAIL_CENTER_FRAME = '__medieval-split-rail-center';
const RAIL_CAP_FRAME = '__medieval-split-rail-cap';
const SOURCE_HEIGHT = 200;
const RAIL_CENTER_SOURCE = { x: 218, width: 8 };
const RAIL_CAP_SOURCE = { x: 287, width: 63 };

/**
 * Composes the canonical medieval frame without stretching its circular socket.
 * Only the sliced rail center grows; both the round cap and rail end caps keep
 * their original aspect ratio.
 */
export function createSplitMedievalFrame(
    scene: Phaser.Scene,
    width: number,
    height: number,
): MedievalFrameLayer {
    const container = scene.add.container(0, 0);
    const texture = scene.textures.get(RAIL_TEXTURE);
    if (!texture.has(RAIL_CENTER_FRAME)) {
        texture.add(
            RAIL_CENTER_FRAME,
            0,
            RAIL_CENTER_SOURCE.x,
            0,
            RAIL_CENTER_SOURCE.width,
            SOURCE_HEIGHT,
        );
    }
    if (!texture.has(RAIL_CAP_FRAME)) {
        texture.add(
            RAIL_CAP_FRAME,
            0,
            RAIL_CAP_SOURCE.x,
            0,
            RAIL_CAP_SOURCE.width,
            SOURCE_HEIGHT,
        );
    }

    const railWidth = Math.max(height * 0.8, width - height * 0.55);
    const railX = height * 0.275;
    const railCapWidth = height * (RAIL_CAP_SOURCE.width / SOURCE_HEIGHT);
    const seamOverlap = 2;
    const railCenterWidth = railWidth - railCapWidth * 2 + seamOverlap * 2;
    const railCenter = scene.add.image(railX, 0, RAIL_TEXTURE, RAIL_CENTER_FRAME)
        .setDisplaySize(railCenterWidth, height);
    const railLeft = scene.add.image(
        railX - railWidth / 2 + railCapWidth / 2,
        0,
        RAIL_TEXTURE,
        RAIL_CAP_FRAME,
    ).setDisplaySize(railCapWidth, height).setFlipX(true);
    const railRight = scene.add.image(
        railX + railWidth / 2 - railCapWidth / 2,
        0,
        RAIL_TEXTURE,
        RAIL_CAP_FRAME,
    ).setDisplaySize(railCapWidth, height);

    const circularCapWidth = height * 1.05;
    const circularCap = scene.add.image(
        -width / 2 + circularCapWidth / 2,
        0,
        CAP_TEXTURE,
    ).setDisplaySize(circularCapWidth, height);

    container.add([railCenter, railLeft, railRight, circularCap]);
    return {
        container,
        parts: [railCenter, railLeft, railRight, circularCap],
    };
}
