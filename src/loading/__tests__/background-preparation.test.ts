import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ notify: undefined as ((url: string) => void) | undefined, starts: 0 }));
vi.mock('virtual:asset-downloads', () => ({ default: {
    images: { menu: { url: '/menu.webp', decodedBytes: 40 }, room: { url: '/room.webp', decodedBytes: 400 },
        motion: { url: '/motion.webp', decodedBytes: 1024 * 1024 } },
    sceneKeys: { MenuScene: ['menu'], TownScene: ['room'], BattleScene: ['motion'] },
    scenes: { MenuScene: ['/menu.webp'], TownScene: ['/room.webp'] }, all: ['/menu.webp', '/room.webp'],
} }));
vi.mock('../DownloadQueue', () => ({ DownloadQueue: class {
    completed = new Set<string>();
    constructor(_fetcher: unknown, notify: (url: string) => void) { state.notify = notify; }
    start() { state.starts++; }
    stop() {}
    prioritize() {}
    wake() {}
} }));
vi.mock('../OfflineClient', () => ({ OfflineClient: class { start() {} prioritize() {} destroy() {} } }));
vi.mock('phaser', () => {
    class ImageFile {
        key: string;
        constructor(_loader: unknown, config: { key: string }) { this.key = config.key; }
        addToCache() {}
    }
    return { default: {
        Core: { Events: { DESTROY: 'destroy' } }, Scenes: { Events: { SHUTDOWN: 'shutdown' } },
        Renderer: { Events: { LOSE_WEBGL: 'losewebgl', RESTORE_WEBGL: 'restorewebgl' } },
        Loader: { Events: { COMPLETE: 'complete' }, FileTypes: { ImageFile, SpriteSheetFile: ImageFile } },
    } };
});
import { assetPreparation } from '../AssetPreparation';

let destroy: () => void;
beforeEach(() => {
    vi.useFakeTimers(); state.starts = 0;
    vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }));
    vi.stubGlobal('window', new EventTarget());
});
afterEach(() => { destroy?.(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function fixture(renderer?: { contextLost: boolean; on: (event: string, callback: () => void) => void; off: () => void }) {
    const events = { once: (_name: string, callback: () => void, context: unknown) => {
        destroy = () => callback.call(context);
    } };
    const loaded = new Set(['menu']);
    let busy = false;
    const load = { isLoading: () => busy, addFile: vi.fn(), start: vi.fn(), once: vi.fn(), off: vi.fn() };
    const keys: Record<string, string[]> = { MenuScene: ['menu'], TownScene: ['room'], BattleScene: ['motion'] };
    const scene = {
        sys: { settings: { key: 'MenuScene' }, isActive: () => true }, events: { once: vi.fn(), off: vi.fn() }, load,
        cache: { json: { get: () => ({ images: { room: 'room.webp' },
            spritesheets: { motion: { path: 'motion.webp', frameWidth: 32, frameHeight: 32 } } }) } },
        sceneAssets: { getSceneTextureKeys: (key: string) => new Set(keys[key]),
            getScenesTextureKeys: (names: string[]) => Object.fromEntries(names.map(name => [name, keys[name] ?? []])) },
        textures: { exists: (key: string) => loaded.has(key) },
    };
    const game = { events, renderer, scene: { keys: { MenuScene: scene, TownScene: {}, BattleScene: {} } },
        textures: { ...scene.textures, getTextureKeys: () => [...loaded] }, canvas: { dataset: {} } };
    assetPreparation(game as any).ready(scene as any);
    return { load, setBusy: (value: boolean) => { busy = value; } };
}

describe('gradual image preparation', () => {
    it('starts in the ready menu before the first gesture', () => {
        fixture(); expect(state.starts).toBe(1);
    });
    it('caches future animation bytes without decoding their sheet in the current town', async () => {
        const { load } = fixture();
        state.notify!('/motion.webp');
        await vi.advanceTimersByTimeAsync(100);
        expect(load.addFile).not.toHaveBeenCalled();
    });
    it('decodes downloaded room art while other files keep finishing', async () => {
        const { load } = fixture();
        state.notify!('/room.webp');
        for (let i = 0; i < 4; i++) {
            await vi.advanceTimersByTimeAsync(20);
            state.notify!(`/other-${i}.webp`);
        }
        expect(load.addFile).toHaveBeenCalledOnce();
        expect(load.addFile.mock.calls[0][0].key).toBe('room');
    });
    it('resumes after an audio/foreground loader finishes without needing another download', async () => {
        const { load, setBusy } = fixture();
        setBusy(true); state.notify!('/room.webp');
        await vi.advanceTimersByTimeAsync(100);
        expect(load.addFile).not.toHaveBeenCalled();
        setBusy(false);
        await vi.advanceTimersByTimeAsync(90);
        expect(load.addFile).toHaveBeenCalledOnce();
    });
    it('waits for WebGL restoration before preparing another image', async () => {
        const listeners = new Map<string, () => void>();
        const renderer = { contextLost: false, on: (event: string, callback: () => void) => { listeners.set(event, callback); }, off: vi.fn() };
        const { load } = fixture(renderer);
        renderer.contextLost = true; listeners.get('losewebgl')!();
        state.notify!('/room.webp');
        await vi.advanceTimersByTimeAsync(100);
        expect(load.addFile).not.toHaveBeenCalled();
        renderer.contextLost = false; listeners.get('restorewebgl')!();
        await vi.advanceTimersByTimeAsync(90);
        expect(load.addFile).toHaveBeenCalledOnce();
    });
});
