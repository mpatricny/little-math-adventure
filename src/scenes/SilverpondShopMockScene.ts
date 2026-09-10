import { ShopScene } from './ShopScene';

/**
 * Silverpond-themed production shop. The legacy scene key is retained so
 * existing scene-editor data and saves remain compatible.
 */
export class SilverpondShopMockScene extends ShopScene {
    constructor() {
        super({
            key: 'SilverpondShopMockScene',
            layoutSceneKey: 'ShopScene',
            backSceneKey: 'SilverpondTownMockScene',
            backgroundTexture: 'silverpond-shop-interior-mock-bg',
            persistChanges: true,
        });
    }
}
