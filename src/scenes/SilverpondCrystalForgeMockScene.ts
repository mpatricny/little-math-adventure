import { CrystalForgeScene } from './CrystalForgeScene';

/**
 * Silverpond-themed production Crystal Forge. The legacy scene key is retained
 * so existing scene-editor data and saves remain compatible.
 */
export class SilverpondCrystalForgeMockScene extends CrystalForgeScene {
    constructor() {
        super({
            key: 'SilverpondCrystalForgeMockScene',
            layoutSceneKey: 'CrystalForgeScene',
            backSceneKey: 'SilverpondTownMockScene',
            backgroundTexture: 'silverpond-crystal-forge-mock-bg',
            persistChanges: true,
        });
    }
}
