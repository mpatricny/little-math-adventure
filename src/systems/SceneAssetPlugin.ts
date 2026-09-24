import Phaser from 'phaser';
import sceneAssets from 'virtual:scene-assets';
import { TexturesFile } from '../types/assets';
import { assetPreparation, queueTexture } from '../loading/AssetPreparation';

type AnimationDefinition = {
    texture: string;
    frames: { sequence?: number[]; start?: number; end?: number };
    frameRate: number;
    repeat: number;
};

export function registerLoadedAnimations(scene: Phaser.Scene): void {
    const definitions: Record<string, AnimationDefinition> = {};
    const visit = (data: any): void => {
        if (!data || typeof data !== 'object') return;
        for (const [key, value] of Object.entries(data) as Array<[string, any]>) {
            if (value?.texture && value.frames) definitions[key] = value;
            else if (typeof value === 'object') visit(value);
        }
    };
    visit(scene.cache.json.get('animations'));
    scene.registry.set('animationDefs', definitions);
    for (const [key, definition] of Object.entries(definitions)) {
        if (!scene.textures.exists(definition.texture)) continue;
        if (scene.anims.exists(key)) continue;
        const frames = definition.frames.sequence
            ? definition.frames.sequence.map(frame => ({ key: definition.texture, frame }))
            : scene.anims.generateFrameNumbers(definition.texture, definition.frames);
        scene.anims.create({ key, frames, frameRate: definition.frameRate, repeat: definition.repeat });
    }
}

/** Wrap the Phaser preload lifecycle once per scene; create runs only after its files finish. */
export class SceneAssetPlugin extends Phaser.Plugins.ScenePlugin {
    boot(): void {
        const scene = this.scene!;
        if (['BootScene', 'AssetLoaderScene'].includes(scene.sys.settings.key)) return;
        const originalPreload = (scene as Phaser.Scene & { preload?: () => void }).preload;
        const originalCreate = (scene as Phaser.Scene & { create?: (data: unknown) => void }).create;
        Object.assign(scene, {
            preload: () => {
                assetPreparation(scene.game).entering(scene.sys.settings.key);
                this.queueSceneTextures();
                originalPreload?.call(scene);
            },
            create: (data: unknown) => {
                registerLoadedAnimations(scene);
                scene.events.once(Phaser.Scenes.Events.CREATE, () => assetPreparation(scene.game).ready(scene));
                originalCreate?.call(scene, data);
            },
        });
    }

    private queueSceneTextures(): void {
        const scene = this.scene!;
        const catalog = scene.cache.json.get('textures') as TexturesFile | undefined;
        if (!catalog) return;
        const required = new Set(sceneAssets[scene.sys.settings.key] ?? []);
        const definitions = scene.registry.get('animationDefs') as Record<string, AnimationDefinition> ?? {};
        const addDynamic = (value: unknown): void => {
            if (typeof value === 'string') {
                if (catalog.images[value] || catalog.spritesheets[value]) required.add(value);
                for (const [key, animation] of Object.entries(definitions)) {
                    if (key === value || key.startsWith(`${value}-`)) required.add(animation.texture);
                }
            } else if (Array.isArray(value)) value.forEach(addDynamic);
            else if (value && typeof value === 'object') Object.values(value).forEach(addDynamic);
        };
        // init() has already resolved combat data from EncounterCatalog.
        const state = scene as any;
        addDynamic(state.enemyDefs);
        addDynamic(state.bossPhases);
        addDynamic(state.backgroundKey);
        addDynamic(state.backgroundTexture);
        addDynamic(state.arenaDefinition);
        addDynamic(state.battleBackgroundTextures);
        // Preview rosters reference stable enemy IDs rather than their sprite keys.
        const serialized = JSON.stringify(state.arenaDefinition ?? {});
        for (const enemy of scene.cache.json.get('enemies') ?? []) {
            if (serialized.includes(`"${enemy.id}"`)) addDynamic(enemy);
        }
        // Pets can be equipped on either co-op player. The small pet catalog is
        // needed in walking/combat scenes, never in menu-only boot.
        if (/Battle|Arena|Town|Forest|Workshop|Witch|Catacomb|Underwater|Silverpond/.test(scene.sys.settings.key)) {
            addDynamic(scene.cache.json.get('pets'));
        }
        for (const key of required) {
            queueTexture(scene, key, catalog);
        }
    }
}
