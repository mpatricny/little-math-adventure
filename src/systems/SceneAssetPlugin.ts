import Phaser from 'phaser';
import sceneAssets from 'virtual:scene-assets';
import { TexturesFile } from '../types/assets';
import { assetPreparation, queueTexture } from '../loading/AssetPreparation';
import { analytics } from '../telemetry/AnalyticsClient';
import { prepareSceneTelemetry, readySceneTelemetry } from '../telemetry/SceneTelemetry';
import { GameStateManager } from './GameStateManager';
import { CoopSessionManager } from './CoopSessionManager';
import { SaveSystem } from './SaveSystem';
import { isPetUnlocked } from './PetCatalog';
import { getShopEquipment, type ShopCity } from './ShopCatalog';
import { createEncounterCatalog } from './EncounterCatalog';
import { getArenaChoiceOptions } from './ArenaChoiceSystem';
import { townBuildings } from '../loading/town-scenes';
import { SceneLoadingScreen } from '../loading/SceneLoadingScreen';
import { actorPortraitKey } from '../loading/actor-portraits';
import type { ItemDefinition, PetDefinition, PlayerState } from '../types';

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
        let loading: SceneLoadingScreen | undefined;
        let required = new Set<string>();
        const loadError = () => analytics()?.emit('asset_error', {
            code: 'asset_load', scene: scene.sys.settings.key,
            fingerprint: scene.sys.settings.key, count: 1,
        });
        Object.assign(scene, {
            preload: () => {
                scene.load.off('loaderror', loadError).on('loaderror', loadError);
                scene.events.once('shutdown', () => scene.load.off('loaderror', loadError));
                analytics()?.setLoading(true);
                const homeTown = GameStateManager.getInstance().getPlayer().storyProgress?.hasUnlockedSilverpond
                    ? 'SilverpondTownMockScene' : 'TownScene';
                assetPreparation(scene.game).entering(scene.sys.settings.key, homeTown);
                required = this.queueSceneTextures();
                originalPreload?.call(scene);
                if (scene.load.list.size > 0) loading = new SceneLoadingScreen(scene);
            },
            create: (data: unknown) => {
                const ready = () => {
                    assetPreparation(scene.game).ready(scene);
                    readySceneTelemetry(scene);
                    // Keep the screen through create() and the first actual
                    // rendered frame, not merely until the last download.
                    scene.game.events.once(Phaser.Core.Events.POST_RENDER, dismiss);
                };
                const dismiss = () => { loading?.destroy(); loading = undefined; };
                scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
                    scene.game.events.off(Phaser.Core.Events.POST_RENDER, dismiss);
                    dismiss();
                });
                const create = (retry: boolean) => {
                    const missing = [...required].filter(key => !scene.textures.exists(key));
                    if (missing.length) {
                        // Phaser normally creates a scene even after a failed
                        // image request. Keep uninitialized gameplay paused and
                        // let the DOM retry control reload only missing files.
                        if (!retry) scene.events.once(Phaser.Scenes.Events.CREATE, () => scene.sys.pause());
                        loading ??= new SceneLoadingScreen(scene);
                        loading.failed(() => {
                            loading?.progress(0);
                            const catalog = scene.cache.json.get('textures') as TexturesFile;
                            missing.forEach(key => queueTexture(scene, key, catalog));
                            scene.load.once(Phaser.Loader.Events.COMPLETE, () => create(true));
                            scene.load.start();
                        });
                        return;
                    }
                    registerLoadedAnimations(scene);
                    prepareSceneTelemetry(scene);
                    if (!retry) scene.events.once(Phaser.Scenes.Events.CREATE, ready);
                    originalCreate?.call(scene, data);
                    if (retry) {
                        scene.events.once(Phaser.Scenes.Events.RESUME, ready);
                        scene.sys.resume();
                    }
                };
                create(false);
            },
        });
    }

    /** Queue dependencies during Phaser's ordinary preload, before create runs. */
    queueSceneTextures(sceneKey = this.scene!.sys.settings.key): Set<string> {
        const buildings = (townBuildings[sceneKey] ?? []).filter(key => this.game.scene.keys[key]);
        const required = new Set(Object.values(this.getScenesTextureKeys([sceneKey, ...buildings])).flat());
        const scene = this.scene!;
        const catalog = scene.cache.json.get('textures') as TexturesFile | undefined;
        if (catalog) for (const key of required) queueTexture(scene, key, catalog);
        return required;
    }

    getScenesTextureKeys(sceneKeys: string[]): Record<string, string[]> {
        const profiles = this.playerProfiles();
        return Object.fromEntries(sceneKeys.map(key => [key, [...this.getSceneTextureKeys(key, profiles)]]));
    }

    private playerProfiles(): PlayerState[] {
        const gameState = GameStateManager.getInstance();
        const profiles = [gameState.getPlayer()];
        const coop = CoopSessionManager.getInstance();
        if (coop.isCoopActive()) {
            for (const slot of [coop.getPlayerASlotIndex(), coop.getPlayerBSlotIndex()]) {
                if (slot === gameState.getActiveSlotIndex()) continue;
                const other = SaveSystem.load(slot)?.player;
                if (other) profiles.push(other);
            }
        }
        return profiles;
    }

    /** Shared by native preload and the gradual background preparation. No scene init/save side effects. */
    getSceneTextureKeys(sceneKey = this.scene!.sys.settings.key, profiles = this.playerProfiles()): Set<string> {
        const scene = this.scene!;
        const catalog = scene.cache.json.get('textures') as TexturesFile | undefined;
        if (!catalog) return new Set();
        const required = new Set(sceneAssets[sceneKey] ?? []);
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
        const addIdle = (actor: { spriteKey: string; animPrefix?: string }) => {
            addDynamic(actor.spriteKey);
            if (actor.animPrefix) addDynamic(`${actor.animPrefix}-idle`);
        };
        if (sceneKey === scene.sys.settings.key) {
            if (/Arena/.test(sceneKey)) (state.enemyDefs ?? []).forEach(addIdle);
            else addDynamic(state.enemyDefs);
            addDynamic(state.bossPhases);
            addDynamic(state.backgroundKey);
            addDynamic(state.backgroundTexture);
            addDynamic(state.battleBackgroundTextures);
        }
        // Resolved combat actors and arena previews below are authoritative.
        // Walking all arena metadata also decoded unrelated reward characters.
        // Prepare every wave in the arena choices the players can actually open.
        // Locked future arenas and combat motions do not belong in this preview.
        if (/Arena/.test(sceneKey)) {
            const enemies = scene.cache.json.get('enemies') ?? [];
            const catalog = createEncounterCatalog(scene.cache.json.get('encounters'), { core: enemies });
            const city = sceneKey.startsWith('Silverpond') ? 'silverpond' : 'mathoria';
            const choices = sceneKey === scene.sys.settings.key && state.arenaChoices?.length
                ? state.arenaChoices : getArenaChoiceOptions(catalog, profiles, city);
            const levels = new Set<number>(choices.map((choice: { arenaLevel: number }) => choice.arenaLevel));
            // The large actors in the selected wave still play their real idle.
            // The other rows only display a static first-frame portrait.
            for (const choice of choices) {
                const wave = catalog.resolveArenaWave({
                    arenaLevel: choice.arenaLevel, waveIndex: choice.waveIndex,
                    mode: profiles.length > 1 ? 'coop' : 'solo',
                });
                wave.enemies.forEach(addIdle);
            }
            // Explicit encounter/debug targets still need their complete wave table.
            if (sceneKey === scene.sys.settings.key && state.arenaDefinition) levels.add(state.arenaDefinition.level);
            for (const level of levels) {
                const arena = catalog.getArena(level);
                for (const wave of arena.waves) {
                    for (const ref of wave.enemies) addDynamic(actorPortraitKey(scene, catalog.resolveEnemy(ref).spriteKey));
                }
            }
        }
        const items = (scene.cache.json.get('items') ?? []) as ItemDefinition[];
        if (/Shop/.test(sceneKey)) {
            const city: ShopCity = sceneKey === scene.sys.settings.key
                ? state.cityId ?? 'mathoria'
                : sceneKey.startsWith('Silverpond') ? 'silverpond' : 'mathoria';
            // Only the item's artwork is a dependency. Its shopCity value
            // "silverpond" also happens to prefix unrelated fairy animations.
            addDynamic(getShopEquipment(items, city, 'weapon').map(item => item.spriteKey));
            addDynamic(getShopEquipment(items, city, 'shield').map(item => item.spriteKey));
        }
        if (/Battle|Arena|Town|Forest|Workshop|Witch|Catacomb|Underwater|Silverpond/.test(sceneKey)) {
            // Load the equipment shown in the character book for both players.
            addDynamic(items.filter(item => profiles.some(player =>
                player.equippedWeapon === item.id || player.equippedShield === item.id)).map(item => item.spriteKey));
            // Walking scenes need equipped idle art; the workshop shows every unlocked pet.
            // Avoid decoding the entire later-region animation catalog in the first town.
            for (const pet of (scene.cache.json.get('pets') ?? []) as PetDefinition[]) {
                const equipped = profiles.some(player => player.activePet === pet.id);
                const available = /Workshop|Witch/.test(sceneKey)
                    && profiles.some(player => isPetUnlocked(pet, player));
                if (available) addDynamic(actorPortraitKey(scene, pet.spriteKey));
                if (!equipped) continue;
                if (equipped && /Battle|Catacomb/.test(sceneKey)) addDynamic(pet);
                else { addDynamic(pet.spriteKey); addDynamic(`${pet.animPrefix}-idle`); }
            }
        }
        return required;
    }
}
