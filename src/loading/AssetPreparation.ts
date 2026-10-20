import Phaser from 'phaser';
import plan from 'virtual:asset-downloads';
import type { TexturesFile } from '../types/assets';
import { DownloadQueue } from './DownloadQueue';
import { OfflineClient } from './OfflineClient';
import { upcomingScenes, orderedDownloads, canPrepareTextures, SPECULATIVE_TEXTURE_BYTES } from './preload-policy';
import { townBuildings, townForScene } from './town-scenes';

type PreparedScene = Phaser.Scene & { sceneAssets?: {
    getSceneTextureKeys(key: string): Set<string>;
    getScenesTextureKeys(keys: string[]): Record<string, string[]>;
} };
const REGIONAL_TEXTURE_BYTES = 192 * 1024 * 1024;

const instances = new WeakMap<Phaser.Game, AssetPreparation>();
export function assetPreparation(game: Phaser.Game): AssetPreparation {
    let instance = instances.get(game);
    if (!instance) { instance = new AssetPreparation(game); instances.set(game, instance); }
    return instance;
}

export function queueTexture(scene: Phaser.Scene, key: string, catalog: TexturesFile): void {
    if (scene.textures.exists(key)) return;
    const sheet = catalog.spritesheets[key];
    const file = sheet?.path ?? catalog.images[key];
    if (!file) return;
    const url = file.startsWith('library:') ? `/assets/library/${file.slice(8)}` : `/assets/${file}`;
    const textureFile = sheet?.frameWidth && sheet.frameHeight
        ? new Phaser.Loader.FileTypes.SpriteSheetFile(scene.load, {
            key, url, frameConfig: {
                frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight,
                ...(sheet.frameCount ? { endFrame: sheet.frameCount - 1 } : {}),
            },
        })
        : new Phaser.Loader.FileTypes.ImageFile(scene.load, { key, url });
    const addToCache = textureFile.addToCache;
    textureFile.addToCache = function () {
        // A background decode can finish after the next scene has queued the
        // same key. Both loaders must complete, but the shared cache is written
        // only once; skipping the second file at queue time would let its scene
        // start before the first loader actually supplies the texture.
        if (!scene.textures.exists(this.key)) addToCache.call(this);
    };
    scene.load.addFile(textureFile);
}

/** Byte downloads live outside scenes; nearby textures are decoded within explicit memory budgets. */
class AssetPreparation {
    private scene?: Phaser.Scene;
    private currentKey = 'MenuScene';
    private homeTown = 'TownScene';
    private started = false;
    private interacted = false;
    private disposed = false;
    private decoding = false;
    private controlled = false;
    private nextScenes: string[] = [];
    private nextKeys: string[] = [];
    private localKeys = new Set<string>();
    private downloaded = new Set<string>();
    private speculative = new Map<string, number>();
    private failed = new Set<string>();
    private decodeTimer?: ReturnType<typeof setTimeout>;
    private readonly downloads: DownloadQueue;
    private readonly offline: OfflineClient;
    private readonly gesture = () => {
        if (this.interacted || !this.scene || this.disposed) return;
        this.interacted = true;
        this.started = true;
        document.removeEventListener('pointerdown', this.gesture, true);
        document.removeEventListener('keydown', this.gesture, true);
        this.forecast();
        this.downloads.start();
        void this.offline.start();
        this.scheduleDecode();
    };
    private readonly visibility = () => {
        if (document.hidden) this.downloads.stop();
        else if (this.started) {
            if (!this.controlled) this.downloads.start();
            this.forecast(); this.scheduleDecode();
        }
    };
    private readonly online = () => { this.downloads.wake(); };
    private readonly contextLost = () => { clearTimeout(this.decodeTimer); this.decodeTimer = undefined; };
    private readonly contextRestored = () => { this.scheduleDecode(); };

    constructor(private readonly game: Phaser.Game) {
        this.downloads = new DownloadQueue(fetch, url => { this.downloaded.add(url); this.scheduleDecode(); });
        this.offline = new OfflineClient(status => {
            status.cached.forEach(url => this.downloaded.add(url));
            game.registry.set('assetDownloadStatus', status);
            window.dispatchEvent(new CustomEvent('cislokraj-download-progress', { detail: status }));
            this.scheduleDecode();
        }, () => { this.controlled = true; this.downloads.stop(); });
        document.addEventListener('pointerdown', this.gesture, true);
        document.addEventListener('keydown', this.gesture, true);
        document.addEventListener('visibilitychange', this.visibility);
        window.addEventListener('online', this.online);
        game.renderer?.on(Phaser.Renderer.Events.LOSE_WEBGL, this.contextLost);
        game.renderer?.on(Phaser.Renderer.Events.RESTORE_WEBGL, this.contextRestored);
        game.events.once(Phaser.Core.Events.DESTROY, this.destroy, this);
    }

    entering(key: string, homeTown = this.homeTown): void {
        this.currentKey = key;
        this.homeTown = homeTown;
        this.scene = undefined;
        clearTimeout(this.decodeTimer);
        this.decodeTimer = undefined;
        // Foreground preload gets the connection while changing scenes. Resume
        // gradual preparation once its required textures have finished.
        this.downloads.stop();
        this.forecast();
    }
    ready(scene: Phaser.Scene): void {
        if (!scene.sys.isActive()) return;
        this.scene = scene;
        this.currentKey = scene.sys.settings.key;
        this.game.canvas.dataset.scene = this.currentKey;
        // Image downloads/decodes do not require a gesture. Use time spent in
        // the menu; worker installation still waits for the first interaction.
        this.started = true;
        // Textures used by the entered scene are no longer speculative allocation.
        for (const name of [this.currentKey, ...(townBuildings[this.currentKey] ?? [])]) {
            for (const key of this.sceneKeys(name)) this.speculative.delete(key);
        }
        for (const key of this.game.textures.getTextureKeys()) {
            const url = plan.images[key]?.url;
            if (url) { this.downloaded.add(url); this.downloads.completed.add(url); }
        }
        this.forecast(); this.scheduleDecode();
        if (this.started && !this.controlled && !document.hidden) this.downloads.start();
    }
    private sceneKeys(key: string): string[] {
        const scene = (this.scene ?? this.game.scene.keys[this.currentKey]) as PreparedScene | undefined;
        return scene?.sceneAssets ? [...scene.sceneAssets.getSceneTextureKeys(key)] : plan.sceneKeys[key] ?? [];
    }
    private forecast(): void {
        this.nextScenes = upcomingScenes(this.currentKey, Object.keys(this.game.scene.keys), this.homeTown);
        const names = [this.currentKey, ...this.nextScenes];
        const localTown = townForScene(this.currentKey, this.homeTown);
        const nearNames = [...new Set([...this.nextScenes.slice(0, 8), localTown, ...townBuildings[localTown]])]
            .filter(key => key !== this.currentKey && this.game.scene.keys[key]);
        const scene = (this.scene ?? this.game.scene.keys[this.currentKey]) as PreparedScene | undefined;
        const nearKeys = scene?.sceneAssets?.getScenesTextureKeys([this.currentKey, ...nearNames]) ?? {};
        const keys = Object.fromEntries(names.map(name => [name, nearKeys[name] ?? plan.sceneKeys[name] ?? []]));
        this.nextKeys = [...new Set(nearNames.flatMap(name => keys[name]))];
        this.localKeys = new Set([localTown, ...townBuildings[localTown]].flatMap(name => keys[name] ?? []));
        // Fill the local UI and room artwork before large animation sheets can
        // exhaust the speculative budget. Equal sizes retain destination order.
        this.nextKeys.sort((a, b) => Number(this.localKeys.has(b)) - Number(this.localKeys.has(a))
            || (plan.images[a]?.decodedBytes ?? 0) - (plan.images[b]?.decodedBytes ?? 0));
        const files = Object.fromEntries(Object.entries(keys).map(([name, textures]) => [name,
            [...textures.map(key => plan.images[key]?.url).filter((url): url is string => !!url), ...(plan.scenes[name] ?? [])]]));
        const order = orderedDownloads(this.currentKey, this.nextScenes, files, plan.all);
        this.downloads.prioritize(order);
        if (this.started) this.offline.prioritize(order);
    }
    private scheduleDecode(): void {
        // Coalesce notifications without moving the deadline: a steady stream
        // of small downloads must not postpone image preparation indefinitely.
        if (this.decodeTimer !== undefined || !this.started || this.disposed || this.decoding) return;
        this.decodeTimer = setTimeout(() => {
            this.decodeTimer = undefined;
            this.decodeOne();
        }, 80);
    }
    private decodeOne(): void {
        const scene = this.scene;
        const contextLost = (this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer | undefined)?.contextLost;
        if (!scene || this.disposed || document.hidden || contextLost || !scene.sys.isActive() || !canPrepareTextures(this.currentKey)) return;
        if (scene.load.isLoading()) { this.scheduleDecode(); return; }
        const catalog = scene.cache.json.get('textures') as TexturesFile | undefined;
        if (!catalog) return;
        const used = [...this.speculative.values()].reduce((sum, bytes) => sum + bytes, 0);
        const key = this.nextKeys.find(key => {
            const image = plan.images[key];
            const budget = this.localKeys.has(key) ? REGIONAL_TEXTURE_BYTES : SPECULATIVE_TEXTURE_BYTES;
            // Bytes may be cached for the whole game, but future chapters'
            // animation sheets must not occupy GPU memory in the current town.
            if (catalog.spritesheets[key] && !this.localKeys.has(key)) return false;
            return image && !this.failed.has(key) && !scene.textures.exists(key) && this.downloaded.has(image.url)
                && image.decodedBytes > 0 && used + image.decodedBytes <= budget;
        });
        if (!key) return;
        this.decoding = true;
        const finish = () => {
            scene.load.off(Phaser.Loader.Events.COMPLETE, finish);
            scene.events.off(Phaser.Scenes.Events.SHUTDOWN, finish);
            if (scene.textures.exists(key)) this.speculative.set(key, plan.images[key].decodedBytes);
            else if (scene.sys.isActive()) this.failed.add(key);
            this.decoding = false;
            this.scheduleDecode();
        };
        scene.load.once(Phaser.Loader.Events.COMPLETE, finish);
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, finish);
        queueTexture(scene, key, catalog);
        scene.load.start();
    }
    private destroy(): void {
        this.disposed = true; clearTimeout(this.decodeTimer);
        this.downloads.stop(); this.offline.destroy();
        document.removeEventListener('pointerdown', this.gesture, true);
        document.removeEventListener('keydown', this.gesture, true);
        document.removeEventListener('visibilitychange', this.visibility);
        window.removeEventListener('online', this.online);
        this.game.renderer?.off(Phaser.Renderer.Events.LOSE_WEBGL, this.contextLost);
        this.game.renderer?.off(Phaser.Renderer.Events.RESTORE_WEBGL, this.contextRestored);
        instances.delete(this.game);
    }
}
