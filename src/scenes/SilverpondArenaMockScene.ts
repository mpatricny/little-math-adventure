import { ArenaScene } from './ArenaScene';

/**
 * Silverpond water arena. The legacy scene key is retained so existing
 * scene-editor data and saves remain compatible.
 */
export class SilverpondArenaMockScene extends ArenaScene {
    constructor() {
        super({
            key: 'SilverpondArenaMockScene',
            layoutSceneKey: 'ArenaScene',
            backSceneKey: 'SilverpondTownMockScene',
            backgroundTexture: 'silverpond-water-arena-mock-bg',
            battleBackgroundTextures: {
                4: 'silverpond-water-arena-1-battle-bg',
                5: 'silverpond-water-arena-2-battle-bg',
                6: 'silverpond-water-arena-3-battle-bg',
            },
            titleText: 'VODNÍ ARÉNA',
            showArenaLevelInTitle: true,
            persistChanges: true,
            cityId: 'silverpond',
            arenaStory: 'silverpond-lake-fairy',
        });
    }
}
