import { GuildScene } from './GuildScene';

/**
 * Silverpond-themed production Guild Hall. The legacy scene key is retained so
 * existing scene-editor data and saves remain compatible.
 */
export class SilverpondGuildMockScene extends GuildScene {
    constructor() {
        super({
            key: 'SilverpondGuildMockScene',
            layoutSceneKey: 'GuildScene',
            backSceneKey: 'SilverpondTownMockScene',
            backgroundTexture: 'silverpond-guild-interior-mock-bg',
            persistChanges: true,
            accentColor: 0x57ddf2,
            silverpondStory: true,
        });
    }
}
