import Phaser from 'phaser';
import plan from 'virtual:asset-downloads';
import type { TexturesFile } from '../types/assets';
import { DownloadQueue } from './DownloadQueue';
import { OfflineClient } from './OfflineClient';
import { upcomingScenes, orderedDownloads, canPrepareTextures, SPECULATIVE_TEXTURE_BYTES } from './preload-policy';

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
    if (sheet?.frameWidth && sheet.frameHeight) scene.load.spritesheet(key, url, { frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight });
    else scene.load.image(key, url);
}

/** Byte downloads live outside scenes; only a small near-future texture set enters GPU memory. */
class AssetPreparation {
    private scene?: Phaser.Scene;
    private currentKey = 'MenuScene';
    private started = false;
    private disposed = false;
    private decoding = false;
    private controlled = false;
    private nextScenes: string[] = [];
    private downloaded = new Set<string>();
    private speculative = new Map<string, number>();
    private failed = new Set<string>();
    private decodeTimer?: ReturnType<typeof setTimeout>;
    private readonly downloads: DownloadQueue;
    private readonly offline: OfflineClient;
    private readonly gesture = () => {
        if (this.started || !this.scene || this.disposed) return;
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
        game.events.once(Phaser.Core.Events.DESTROY, this.destroy, this);
    }

    entering(key: string): void {
        this.currentKey = key;
        this.scene = undefined;
        clearTimeout(this.decodeTimer);
        this.forecast();
    }
    ready(scene: Phaser.Scene): void {
        if (!scene.sys.isActive()) return;
        this.scene = scene;
        this.currentKey = scene.sys.settings.key;
        this.game.canvas.dataset.scene = this.currentKey;
        // Textures used by the entered scene are no longer speculative allocation.
        for (const key of plan.sceneKeys[this.currentKey] ?? []) this.speculative.delete(key);
        this.forecast(); this.scheduleDecode();
    }
    private forecast(): void {
        this.nextScenes = upcomingScenes(this.currentKey, Object.keys(this.game.scene.keys));
        const order = orderedDownloads(this.currentKey, this.nextScenes, plan.scenes, plan.all);
        this.downloads.prioritize(order);
        if (this.started) this.offline.prioritize(order);
    }
    private scheduleDecode(): void {
        clearTimeout(this.decodeTimer);
        if (this.started && !this.disposed && !this.decoding) this.decodeTimer = setTimeout(() => this.decodeOne(), 80);
    }
    private decodeOne(): void {
        const scene = this.scene;
        if (!scene || this.disposed || document.hidden || !scene.sys.isActive() || scene.load.isLoading() || !canPrepareTextures(this.currentKey)) return;
        const catalog = scene.cache.json.get('textures') as TexturesFile | undefined;
        if (!catalog) return;
        const used = [...this.speculative.values()].reduce((sum, bytes) => sum + bytes, 0);
        const key = this.nextScenes.slice(0, 5).flatMap(name => plan.sceneKeys[name] ?? []).find(key => {
            const image = plan.images[key];
            return image && !this.failed.has(key) && !scene.textures.exists(key) && this.downloaded.has(image.url)
                && image.decodedBytes > 0 && used + image.decodedBytes <= SPECULATIVE_TEXTURE_BYTES;
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
        instances.delete(this.game);
    }
}
