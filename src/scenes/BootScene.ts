import Phaser from 'phaser';
import { LocalizationService } from '../systems/LocalizationService';
import { registerLoadedAnimations } from '../systems/SceneAssetPlugin';
import { uiTemplateLoader } from '../systems/UiTemplateLoader';
import { isTvMode } from '../remote/remoteMode';

export class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }

    preload(): void {
        // Show loading progress
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        const progressBar = this.add.graphics();
        const progressBox = this.add.graphics();
        progressBox.fillStyle(0x222222, 0.8);
        progressBox.fillRect(width / 2 - 160, height / 2 - 25, 320, 50);

        this.load.on('progress', (value: number) => {
            progressBar.clear();
            progressBar.fillStyle(0x44aa44, 1);
            progressBar.fillRect(width / 2 - 150, height / 2 - 15, 300 * value, 30);
        });

        // Load new asset system files
        this.load.json('textures', 'assets/data/textures.json');
        this.load.json('animations', 'assets/data/animations.json');
        this.load.json('assets', 'assets/data/assets.json');
        this.load.json('scenes', 'assets/data/scenes.json');

        // Localization
        this.load.json('lang-index', 'assets/data/localization/index.json');
        this.load.json('lang-cs', 'assets/data/localization/cs.json');
        this.load.json('lang-en', 'assets/data/localization/en.json');

        // UI layouts (math board etc.)
        this.load.json('uiLayouts', 'assets/data/ui-layouts.json');

        // Nine-slice configs (for scalable UI elements)
        this.load.json('nineSlices', 'assets/data/nine-slices.json');

        // Runtime data. encounters.json is the source of truth for arena and forest battles.
        this.load.json('encounters', 'assets/data/encounters.json');
        this.load.json('enemies', 'assets/data/enemies.json');
        this.load.json('items', 'assets/data/items.json');
        this.load.json('pets', 'assets/data/pets.json');
        this.load.json('transmutation', 'assets/data/transmutation.json');
    }

    create(): void {
        this.scene.start('AssetLoaderScene');
    }
}

/**
 * Initialize shared metadata. Each destination scene loads its own texture dependencies.
 */
export class AssetLoaderScene extends Phaser.Scene {
    constructor() {
        super({ key: 'AssetLoaderScene' });
    }

    create(): void {
        // Initialize Localization
        LocalizationService.getInstance().init(this);

        // Create global animations
        registerLoadedAnimations(this);

        // Store nine-slice configs in registry for AssetFactory
        const nineSlices = this.cache.json.get('nineSlices');
        if (nineSlices) {
            this.registry.set('nineSlices', nineSlices);
        }

        // Load UI templates, then go to menu or TV pairing mode
        uiTemplateLoader.load().then(() => {
            this.scene.start(isTvMode() ? 'TvPairingScene' : 'MenuScene');
        });
    }

}
