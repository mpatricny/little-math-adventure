import Phaser from 'phaser';
import { LocalizationService } from '../systems/LocalizationService';
import { TexturesFile, AnimationsFile } from '../types/assets';
import { uiTemplateLoader } from '../systems/UiTemplateLoader';

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
        this.load.json('sceneLayouts', 'assets/data/scene-layouts.json');

        // Localization
        this.load.json('lang-index', 'assets/data/localization/index.json');
        this.load.json('lang-cs', 'assets/data/localization/cs.json');
        this.load.json('lang-en', 'assets/data/localization/en.json');

        // UI layouts (math board etc.)
        this.load.json('uiLayouts', 'assets/data/ui-layouts.json');

        // Nine-slice configs (for scalable UI elements)
        this.load.json('nineSlices', 'assets/data/nine-slices.json');

        // Legacy data (keep until fully migrated)
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
 * Second stage loader that reads textures.json and loads all assets dynamically
 */
export class AssetLoaderScene extends Phaser.Scene {
    constructor() {
        super({ key: 'AssetLoaderScene' });
    }

    preload(): void {
        const textures = this.cache.json.get('textures') as TexturesFile;

        // Show loading progress
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        const progressBar = this.add.graphics();
        const progressBox = this.add.graphics();
        progressBox.fillStyle(0x222222, 0.8);
        progressBox.fillRect(width / 2 - 160, height / 2 - 25, 320, 50);

        const loadingText = this.add.text(width / 2, height / 2 - 50, 'Loading assets...', {
            fontSize: '20px',
            color: '#ffffff',
        });
        loadingText.setOrigin(0.5, 0.5);

        this.load.on('progress', (value: number) => {
            progressBar.clear();
            progressBar.fillStyle(0x44aa44, 1);
            progressBar.fillRect(width / 2 - 150, height / 2 - 15, 300 * value, 30);
        });

        // Load all images
        for (const [key, path] of Object.entries(textures.images)) {
            this.load.image(key, `assets/${path}`);
        }

        // Load all spritesheets
        for (const [key, config] of Object.entries(textures.spritesheets)) {
            if (config.frameWidth && config.frameHeight) {
                this.load.spritesheet(key, `assets/${config.path}`, {
                    frameWidth: config.frameWidth,
                    frameHeight: config.frameHeight,
                });
            } else {
                console.warn(`Skipping spritesheet ${key}: missing frame dimensions`);
            }
        }
    }

    create(): void {
        // Initialize Localization
        LocalizationService.getInstance().init(this);

        // Create global animations
        this.createAnimations();

        // Store nine-slice configs in registry for AssetFactory
        const nineSlices = this.cache.json.get('nineSlices');
        if (nineSlices) {
            this.registry.set('nineSlices', nineSlices);
        }

        // Load UI templates, then go to menu
        uiTemplateLoader.load().then(() => {
            this.scene.start('MenuScene');
        });
    }

    private createAnimations(): void {
        const animsData = this.cache.json.get('animations') as AnimationsFile;

        // Store animation definitions (including movement data) in registry
        const animationDefs: Record<string, any> = {};

        // Helper to generate frames from either format
        const generateFrames = (textureKey: string, framesConfig: any): Phaser.Types.Animations.AnimationFrame[] => {
            // New format: { sequence: [0, 1, 2, 1, 0] }
            if (framesConfig.sequence && Array.isArray(framesConfig.sequence)) {
                return framesConfig.sequence.map((frameIndex: number) => ({
                    key: textureKey,
                    frame: frameIndex,
                }));
            }
            // Legacy format: { start: 0, end: 5 }
            return this.anims.generateFrameNumbers(textureKey, framesConfig);
        };

        // Helper to recursively find animation definitions
        const processAnimations = (data: any) => {
            for (const key in data) {
                if (key === 'version') continue;

                const value = data[key];

                // Check if it's an animation definition (has texture and frames)
                if (value.texture && value.frames) {
                    this.anims.create({
                        key: key, // Use the key from JSON as the animation key
                        frames: generateFrames(value.texture, value.frames),
                        frameRate: value.frameRate,
                        repeat: value.repeat
                    });

                    // Store full definition (including movement) for runtime access
                    animationDefs[key] = value;
                } else if (typeof value === 'object') {
                    // Recurse
                    processAnimations(value);
                }
            }
        };

        processAnimations(animsData);

        // Store in registry for access from any scene
        this.registry.set('animationDefs', animationDefs);
    }
}
